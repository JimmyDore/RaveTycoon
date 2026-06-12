import { describe, expect, it } from 'vitest';
import { applyIdleTime } from './idle';
import { NIGHT_MODIFIERS, rollModifiers } from './modifiers';
import { applyEffects, createNight, startSet, tickNight } from './night';
import { isSpotAvailable, settleNight } from './payout';
import { newGame } from './save';
import type { GameState } from './types';
import {
  REGION_TRAITS,
  type RegionRules,
  applyRegionLegende,
  buildRegionRules,
  defaultRegionRules,
  drawRegions,
  getRegionTrait,
  legendeMultiplier,
  regionTraits,
  toRegionState,
} from './regions';

function traits(...ids: string[]) {
  return ids.map(getRegionTrait);
}

describe('le pool de traits', () => {
  it('contient les 12 traits du design avec leurs difficultés', () => {
    expect(REGION_TRAITS).toHaveLength(12);
    const diff = Object.fromEntries(REGION_TRAITS.map((t) => [t.id, t.difficulty]));
    expect(diff).toEqual({
      'zone-quadrillee': 2,
      'prefet-zele': 1,
      'economie-morose': 1,
      'climat-pourri': 1,
      'terre-de-beton': 2,
      'public-exigeant': 1,
      'zone-blanche': 1,
      'terre-de-dub': 0,
      'fetes-votives': 0,
      'grands-axes': 0,
      'terre-daccueil': -1,
      'region-riche': -1,
    });
  });

  it('chaque trait mute la bonne règle', () => {
    const applied = (id: string): RegionRules => {
      const rules = defaultRegionRules();
      getRegionTrait(id).apply(rules);
      return rules;
    };
    expect(applied('zone-quadrillee').bustThreshold).toBe(0.85);
    expect(applied('prefet-zele').heatMult).toBeCloseTo(1.3, 5);
    expect(applied('prefet-zele').casierGele).toBe(true);
    expect(applied('economie-morose').prixLibreMult).toBeCloseTo(0.75, 5);
    expect(applied('economie-morose').barMult).toBeCloseTo(0.8, 5);
    expect(applied('climat-pourri').negativeModifierWeightMult).toBeCloseTo(2, 5);
    expect(applied('terre-de-beton').bannedSpotIds).toEqual(['champ', 'foret', 'plage']);
    expect(applied('terre-de-beton').repReqOverride.carriere).toBe(0);
    expect(applied('public-exigeant').setQualityMult).toBeCloseTo(0.95, 5);
    expect(applied('zone-blanche').buzzDecayMult).toBeCloseTo(2, 5);
    expect(applied('terre-de-dub').slowGenreArrivalMult).toBeCloseTo(1.3, 5);
    expect(applied('terre-de-dub').fastGenreArrivalMult).toBeCloseTo(0.7, 5);
    expect(applied('fetes-votives').specialNightWeightMult).toBeCloseTo(2, 5);
    expect(applied('fetes-votives').maxEventsBonus).toBe(1);
    expect(applied('fetes-votives').goalRepMult).toBeCloseTo(0.8, 5);
    expect(applied('grands-axes').arrivalMult).toBeCloseTo(1.2, 5);
    expect(applied('grands-axes').churnMult).toBeCloseTo(1.2, 5);
    expect(applied('terre-daccueil').heatMult).toBeCloseTo(0.7, 5);
    expect(applied('region-riche').prixLibreMult).toBeCloseTo(1.25, 5);
  });

  it('les traits composent par produit (Préfet zélé × Terre d’accueil)', () => {
    const rules = buildRegionRules({ nom: 'Test', traits: ['prefet-zele', 'terre-daccueil'] });
    expect(rules.heatMult).toBeCloseTo(1.3 * 0.7, 5);
  });

  it('sans région (tournée 1), les règles sont l’identité', () => {
    expect(buildRegionRules(undefined)).toEqual(defaultRegionRules());
  });
});

describe('legendeMultiplier', () => {
  it('vaut 1 + 0.25 × max(0, somme des difficultés), borné ×1.0 à ×2.0', () => {
    expect(legendeMultiplier([])).toBe(1);
    expect(legendeMultiplier(traits('terre-daccueil', 'region-riche'))).toBe(1); // somme −2 → max(0,·)
    expect(legendeMultiplier(traits('prefet-zele', 'terre-daccueil'))).toBe(1); // somme 0
    expect(legendeMultiplier(traits('zone-quadrillee', 'prefet-zele'))).toBeCloseTo(1.75, 5);
    expect(legendeMultiplier(traits('zone-quadrillee', 'terre-de-beton'))).toBe(2); // somme 4 → ×2.0
  });

  it('Tournée infernale : +50 % seulement si la somme ≥ 2', () => {
    expect(legendeMultiplier(traits('zone-quadrillee'), true)).toBeCloseTo(1.5 * 1.5, 5);
    expect(legendeMultiplier(traits('prefet-zele'), true)).toBeCloseTo(1.25, 5); // somme 1 : pas d'ampli
  });
});

describe('applyRegionLegende', () => {
  it('multiplie le gain de ⭐ et arrondit au floor ; tournée 1 = ×1', () => {
    expect(applyRegionLegende(10, undefined, [])).toBe(10);
    const region = { nom: 'La Vallée grise', traits: ['zone-quadrillee', 'prefet-zele'] };
    expect(applyRegionLegende(10, region, [])).toBe(17); // 10 × 1.75 = 17.5 → 17
    expect(applyRegionLegende(10, region, ['tournee-infernale'])).toBe(26); // 10 × 2.625 → 26
  });
});

describe('regionTraits', () => {
  it('résout les ids et rend [] sans région', () => {
    expect(regionTraits(undefined)).toEqual([]);
    expect(regionTraits({ nom: 'x', traits: ['terre-de-dub'] })[0].nom).toBe('Terre de dub');
  });

  it('ignore un id de trait inconnu (vieille save, trait renommé)', () => {
    const traits = regionTraits({ nom: 'x', traits: ['nimporte-quoi', 'terre-de-dub'] });
    expect(traits).toHaveLength(1);
    expect(traits[0].id).toBe('terre-de-dub');
  });
});

describe('drawRegions', () => {
  it('est déterministe : même graine → mêmes 3 régions', () => {
    const a = drawRegions(7);
    const b = drawRegions(7);
    expect(a.map((c) => c.nom)).toEqual(b.map((c) => c.nom));
    expect(a.map((c) => c.traits.map((t) => t.id))).toEqual(b.map((c) => c.traits.map((t) => t.id)));
  });

  it('deux graines différentes donnent des tirages différents quelque part', () => {
    const all = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      all.add(drawRegions(seed).map((c) => c.traits.map((t) => t.id).join(',')).join('|'));
    }
    expect(all.size).toBeGreaterThan(1);
  });

  it('3 cartes distinctes, 2 traits distincts chacune, jamais deux conforts, mult conforme', () => {
    for (let seed = 0; seed < 300; seed++) {
      const choices = drawRegions(seed);
      expect(choices).toHaveLength(3);
      for (const c of choices) {
        expect(c.traits).toHaveLength(2);
        expect(c.traits[0].id).not.toBe(c.traits[1].id);
        const conforts = c.traits.filter((t) => t.difficulty === -1).length;
        expect(conforts).toBeLessThanOrEqual(1);
        expect(c.mult).toBeCloseTo(legendeMultiplier(c.traits), 5);
        expect(c.mult).toBeGreaterThanOrEqual(1);
        expect(c.mult).toBeLessThanOrEqual(2);
        expect(c.nom.length).toBeGreaterThan(3);
      }
      const pairs = choices.map((c) => c.traits.map((t) => t.id).sort().join('+'));
      expect(new Set(pairs).size).toBe(3);
      expect(new Set(choices.map((c) => c.nom)).size).toBe(3);
    }
  });
});

describe('toRegionState', () => {
  it('ne persiste que le nom et les ids de traits', () => {
    const choice = drawRegions(7)[0];
    expect(toRegionState(choice)).toEqual({
      nom: choice.nom,
      traits: choice.traits.map((t) => t.id),
    });
  });
});

describe('les règles de région dans la nuit', () => {
  function playingNight(traits: string[], seed = 1) {
    const state = newGame(42);
    if (traits.length > 0) state.region = { nom: 'Région test', traits };
    const night = createNight(state, 'champ', ['tonton'], seed);
    startSet(state, night, 'tonton');
    return { state, night };
  }

  it('Terre d’accueil : la chaleur monte moins vite sur un tick', () => {
    const base = playingNight([]);
    base.night.heat = 0;
    tickNight(base.state, base.night, 0.1);
    const accueil = playingNight(['terre-daccueil']);
    accueil.night.heat = 0;
    tickNight(accueil.state, accueil.night, 0.1);
    expect(accueil.night.heat).toBeLessThan(base.night.heat);
    expect(accueil.night.heat).toBeGreaterThan(0);
  });

  it('Zone quadrillée : le bust tombe dès 85 % de chaleur', () => {
    const base = playingNight([]);
    base.night.heat = 0.86;
    expect(tickNight(base.state, base.night, 0.1).some((e) => e.type === 'bust')).toBe(false);
    const quad = playingNight(['zone-quadrillee']);
    quad.night.heat = 0.86;
    const events = tickNight(quad.state, quad.night, 0.1);
    expect(events.some((e) => e.type === 'bust')).toBe(true);
    expect(quad.night.busted).toBe(true);
  });

  it('les events ne franchissent jamais le seuil de descente (clamp sous le seuil)', () => {
    const quad = playingNight(['zone-quadrillee']);
    applyEffects(quad.state, quad.night, { heat: 1 });
    expect(quad.night.heat).toBeCloseTo(0.84, 5);
    const base = playingNight([]);
    applyEffects(base.state, base.night, { heat: 1 });
    expect(base.night.heat).toBeCloseTo(0.99, 5); // comportement actuel conservé
  });

  it('Public exigeant : la qualité de set prend −5 %', () => {
    const base = playingNight([]);
    const exigeant = playingNight(['public-exigeant']);
    expect(exigeant.night.setQuality).toBeCloseTo(base.night.setQuality * 0.95, 5);
  });

  it('Grands axes : la foule afflue plus vite', () => {
    const base = playingNight([]);
    base.night.crowd = 0;
    tickNight(base.state, base.night, 0.1);
    const axes = playingNight(['grands-axes']);
    axes.night.crowd = 0;
    tickNight(axes.state, axes.night, 0.1);
    expect(axes.night.crowd).toBeGreaterThan(base.night.crowd);
  });

  it('Terre de dub : le dub (75 BPM) attire plus, la frenchcore (200 BPM) moins', () => {
    function arrivalOneTick(traits: string[], djId: string): number {
      const state: GameState = newGame(42);
      if (traits.length > 0) state.region = { nom: 'Région test', traits };
      state.crew.push({ id: djId, xp: 0, fatigue: 0, setsPlayed: 0, gifted: false, studioBonus: 0 });
      const night = createNight(state, 'champ', [djId], 1);
      startSet(state, night, djId);
      night.crowd = 0;
      tickNight(state, night, 0.1);
      return night.crowd;
    }
    expect(arrivalOneTick(['terre-de-dub'], 'boblepine')).toBeGreaterThan(
      arrivalOneTick([], 'boblepine'),
    );
    expect(arrivalOneTick(['terre-de-dub'], 'kilowatt')).toBeLessThan(
      arrivalOneTick([], 'kilowatt'),
    );
  });

  it('Économie morose : la buvette rapporte ×0.8 sur un tick', () => {
    const base = playingNight([]);
    base.night.crowd = 20;
    base.night.bank = 0;
    tickNight(base.state, base.night, 0.1);
    const morose = playingNight(['economie-morose']);
    morose.night.crowd = 20;
    morose.night.bank = 0;
    tickNight(morose.state, morose.night, 0.1);
    expect(morose.night.bank).toBeCloseTo(base.night.bank * 0.8, 5);
  });

  it('Pays des fêtes votives : la rep des objectifs ×0.8', () => {
    function repAfterForcedGoal(traits: string[]): number {
      const state = newGame(42);
      if (traits.length > 0) state.region = { nom: 'Région test', traits };
      const night = createNight(state, 'champ', ['tonton'], 1);
      startSet(state, night, 'tonton');
      night.setGoal = { id: 'test', label: 'test', reward: { rep: 10 }, met: () => true, weight: () => 1 };
      night.setElapsed = night.setLen - 0.05; // le tick suivant clôt le set
      tickNight(state, night, 0.1);
      return night.repBonus;
    }
    expect(repAfterForcedGoal([])).toBe(10);
    expect(repAfterForcedGoal(['fetes-votives'])).toBe(8);
  });
});

describe('les règles de région au règlement et entre les teufs', () => {
  function finishedNight(state: GameState) {
    const night = createNight(state, 'champ', ['tonton'], 1);
    Object.assign(night, {
      t: 180,
      phase: 'ended',
      sunrise: true,
      bank: 100,
      peakCrowd: 30,
      vibeSum: 0.8 * 180,
      vibeSamples: 180,
      playedSets: [{ djId: 'tonton' }],
    });
    return night;
  }

  it('Région riche : prix libre ×1.25 au règlement', () => {
    const base = newGame();
    const baseResult = settleNight(base, finishedNight(base));
    const riche = newGame();
    riche.region = { nom: 'La Combe rouge', traits: ['region-riche'] };
    const richeResult = settleNight(riche, finishedNight(riche));
    expect(richeResult.donationMult).toBeCloseTo(baseResult.donationMult * 1.25, 5);
    expect(richeResult.gross).toBeGreaterThan(baseResult.gross);
  });

  it('Économie morose : prix libre ×0.75 au règlement', () => {
    const base = newGame();
    const baseResult = settleNight(base, finishedNight(base));
    const morose = newGame();
    morose.region = { nom: 'Le Causse gris', traits: ['economie-morose'] };
    const moroseResult = settleNight(morose, finishedNight(morose));
    expect(moroseResult.donationMult).toBeCloseTo(baseResult.donationMult * 0.75, 5);
  });

  it('Terre de béton : champ/forêt bannis, la carrière ouverte à rep 0', () => {
    const state = newGame();
    expect(isSpotAvailable(state, 'champ')).toBe(true);
    expect(isSpotAvailable(state, 'carriere')).toBe(false); // rep 0 < 60
    state.region = { nom: 'Le Plateau noir', traits: ['terre-de-beton'] };
    expect(isSpotAvailable(state, 'champ')).toBe(false);
    expect(isSpotAvailable(state, 'foret')).toBe(false);
    expect(isSpotAvailable(state, 'carriere')).toBe(true); // garde-fou no-softlock
    expect(isSpotAvailable(state, 'hangar')).toBe(false); // la rep gate les autres normalement
  });

  it('Zone blanche : le buzz décroît deux fois plus vite', () => {
    const base = newGame(0);
    base.buzz = 1;
    applyIdleTime(base, 24 * 3_600_000); // une demi-vie
    const blanche = newGame(0);
    blanche.buzz = 1;
    blanche.region = { nom: 'Le Marais perdu', traits: ['zone-blanche'] };
    applyIdleTime(blanche, 24 * 3_600_000);
    expect(base.buzz).toBeCloseTo(0.5, 5);
    expect(blanche.buzz).toBeCloseTo(0.25, 5);
  });
});

describe('Climat pourri : la météo négative pèse double', () => {
  it('le multiplicateur à 1 ne change rien au tirage (déterminisme conservé)', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(rollModifiers(2, seed, 1).map((m) => m.id)).toEqual(
        rollModifiers(2, seed).map((m) => m.id),
      );
    }
  });

  it('×2 augmente la fréquence des modificateurs négatifs', () => {
    const negIds = new Set(NIGHT_MODIFIERS.filter((m) => m.negatif).map((m) => m.id));
    expect(negIds.size).toBeGreaterThanOrEqual(3); // pluie, brouillard, touristes
    const countNeg = (mult: number) => {
      let n = 0;
      for (let seed = 0; seed < 400; seed++) {
        for (const m of rollModifiers(3, seed, mult)) if (negIds.has(m.id)) n++;
      }
      return n;
    };
    expect(countNeg(2)).toBeGreaterThan(countNeg(1));
  });

  it('createNight branche le multiplicateur de la région', () => {
    const countNegNights = (traits: string[]) => {
      let n = 0;
      for (let seed = 0; seed < 200; seed++) {
        const state = newGame(42);
        if (traits.length > 0) state.region = { nom: 'Région test', traits };
        const night = createNight(state, 'foret', ['tonton'], seed);
        if (night.modifiers.some((m) => m.negatif)) n++;
      }
      return n;
    };
    expect(countNegNights(['climat-pourri'])).toBeGreaterThan(countNegNights([]));
  });
});
