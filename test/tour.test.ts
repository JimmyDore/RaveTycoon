import { describe, expect, it } from 'vitest';
import { applySetToll, lockedDjs, recruitDj, recruitableDjs } from '../src/core/crew';
import { GEAR, GEAR_CATEGORIES, PERKS, getDj } from '../src/core/data';
import { createNight, startSet, tickNight } from '../src/core/night';
import { settleNight } from '../src/core/payout';
import { deserialize, newGame, serialize } from '../src/core/save';
import {
  applyPerks,
  buyPerk,
  canBuyPerk,
  computeLegende,
  departOnTour,
  hasPerk,
  maxVeterans,
  perkCount,
} from '../src/core/tour';
import type { GameState } from '../src/core/types';

describe('le bloc tour', () => {
  it('newGame démarre en tournée 1, 0 ⭐, sans perks ni vétérans', () => {
    const state = newGame();
    expect(state.tour).toEqual({ number: 1, legende: 0, perks: [], veteranIds: [], teknivalWins: 0 });
  });

  it('migre une vieille save v3 sans bloc tour : tournée 1, 0 ⭐', () => {
    const legacy = JSON.parse(serialize(newGame())) as Record<string, unknown>;
    delete legacy.tour;
    const loaded = deserialize(JSON.stringify(legacy));
    expect(loaded).not.toBeNull();
    expect(loaded?.tour).toEqual({ number: 1, legende: 0, perks: [], veteranIds: [], teknivalWins: 0 });
  });

  it('roundtrip de save conserve le bloc tour', () => {
    const state = newGame();
    state.tour.number = 3;
    state.tour.legende = 12;
    state.tour.perks = ['camion-amenage'];
    expect(deserialize(serialize(state))?.tour).toEqual(state.tour);
  });
});

describe('l’Héritage : le catalogue', () => {
  it('expose les 8 familles de perks du spec', () => {
    const ids = PERKS.map((p) => p.id);
    expect(ids).toContain('camion-amenage');
    expect(ids).toContain('carnet-adresses');
    expect(ids).toContain('reputation-precede');
    expect(ids).toContain('matos-planque');
    expect(ids).toContain('famille');
    expect(ids).toContain('tournee-infernale');
    expect(PERKS.filter((p) => p.id.startsWith('mythe-'))).toHaveLength(5);
    expect(PERKS.filter((p) => p.id.startsWith('tete-'))).toHaveLength(2);
  });

  it('coûte le tarif du spec', () => {
    const cost = Object.fromEntries(PERKS.map((p) => [p.id, p.cost]));
    expect(cost['camion-amenage']).toBe(2);
    expect(cost['carnet-adresses']).toBe(3);
    expect(cost['reputation-precede']).toBe(3);
    expect(cost['matos-planque']).toBe(4);
    expect(cost['famille']).toBe(5);
    expect(cost['mythe-mur']).toBe(6);
    expect(cost['tete-sansnom']).toBe(8);
    expect(cost['tournee-infernale']).toBe(5);
  });
});

describe('l’Héritage : achat', () => {
  it('dépense la ⭐ Légende et enregistre le perk', () => {
    const state = newGame();
    state.tour.legende = 5;
    expect(buyPerk(state, 'camion-amenage')).toBe(true);
    expect(state.tour.legende).toBe(3);
    expect(hasPerk(state, 'camion-amenage')).toBe(true);
  });

  it('refuse sans solde, refuse au-delà du stack max', () => {
    const state = newGame();
    state.tour.legende = 1;
    expect(canBuyPerk(state, 'camion-amenage')).toBe(false);
    expect(buyPerk(state, 'camion-amenage')).toBe(false);
    state.tour.legende = 20;
    expect(buyPerk(state, 'camion-amenage')).toBe(true);
    expect(buyPerk(state, 'camion-amenage')).toBe(false); // unique
    expect(buyPerk(state, 'famille')).toBe(true);
    expect(buyPerk(state, 'famille')).toBe(true); // stack ×2
    expect(buyPerk(state, 'famille')).toBe(false);
    expect(perkCount(state, 'famille')).toBe(2);
  });

  it('maxVeterans : 1 de base, +1 par stack de « famille »', () => {
    const state = newGame();
    expect(maxVeterans(state)).toBe(1);
    state.tour.perks = ['famille', 'famille'];
    expect(maxVeterans(state)).toBe(3);
  });
});

describe('computeLegende', () => {
  it('compte floor(rep/100) + 3 par victoire Teknival de la tournée', () => {
    const state = newGame();
    state.rep = 530;
    state.tour.teknivalWins = 2;
    expect(computeLegende(state)).toBe(5 + 6);
  });

  it('une première tournée type vaut 10–14 ⭐', () => {
    const state = newGame();
    state.rep = 800; // rep plausible après une victoire au Teknival
    state.tour.teknivalWins = 1;
    const legende = computeLegende(state);
    expect(legende).toBeGreaterThanOrEqual(10);
    expect(legende).toBeLessThanOrEqual(14);
  });
});

describe('le compteur de victoires Teknival', () => {
  it('settleNight au teknival incrémente teknivalWins de la tournée', () => {
    const state = newGame();
    state.rep = 1000;
    const night = createNight(state, 'teknival', ['tonton'], 2);
    Object.assign(night, {
      t: 600,
      phase: 'ended',
      sunrise: true,
      bank: 5000,
      peakCrowd: 900,
      vibeSum: 540,
      vibeSamples: 600,
      playedSets: [{ djId: 'tonton', brief: 'normal' }],
    });
    settleNight(state, night);
    expect(state.tour.teknivalWins).toBe(1);
    expect(state.wonTeknival).toBe(true);
  });
});

function richState(): GameState {
  const state = newGame(1000);
  state.cash = 40000;
  state.rep = 800;
  state.buzz = 1.2;
  state.busts = 2;
  state.nights = 30;
  state.gear = { platines: 3, mur: 3, groupe: 2, lumieres: 2, logistique: 3 };
  state.gearBranch = { platines: 'A', mur: 'B', logistique: 'A' };
  state.damaged.mur = true;
  state.repairs.push({ category: 'mur', readyAt: 99999 });
  state.pseudo = 'DJ Bagarre';
  state.bestCrowd = 1500;
  state.bestPayout = 9000;
  state.wonTeknival = true;
  state.tour.legende = 4;
  state.tour.teknivalWins = 1;
  state.crew[0].xp = 600; // tonton a grandi
  state.crew.push({ id: 'gamine', xp: 750, fatigue: 0.7, setsPlayed: 12, gifted: true, studioBonus: 0.5 });
  state.crew.push({ id: 'kilowatt', xp: 100, fatigue: 0.2, setsPlayed: 3, gifted: false, studioBonus: 0 });
  return state;
}

describe('departOnTour : le reset', () => {
  it('réinitialise exactement caisse, matos, rep, buzz, casier, dégâts, réparations, victoire', () => {
    const next = departOnTour(richState(), ['gamine']);
    expect(next.cash).toBe(0);
    expect(next.rep).toBe(0);
    expect(next.buzz).toBe(0);
    expect(next.busts).toBe(0);
    expect(next.gear).toEqual({ platines: 0, mur: 0, groupe: 0, lumieres: 0, logistique: 0 });
    expect(next.gearBranch).toEqual({});
    expect(next.damaged).toEqual({});
    expect(next.repairs).toEqual([]);
    expect(next.wonTeknival).toBe(false);
    expect(next.tour.teknivalWins).toBe(0);
  });

  it('conserve la ⭐ cumulée, les perks, le n° de tournée, le pseudo et les records all-time', () => {
    const state = richState();
    state.tour.perks = ['tournee-infernale'];
    const next = departOnTour(state, []);
    expect(next.tour.number).toBe(2);
    expect(next.tour.legende).toBe(4 + 11); // 4 en banque + floor(800/100) + 3×1
    expect(next.tour.perks).toEqual(['tournee-infernale']);
    expect(next.pseudo).toBe('DJ Bagarre');
    expect(next.nights).toBe(30);
    expect(next.bestCrowd).toBe(1500);
    expect(next.bestPayout).toBe(9000);
  });
});

describe('departOnTour : le crew', () => {
  it('le fondateur vient toujours avec son niveau ; le vétéran garde le sien, fatigue rincée', () => {
    const next = departOnTour(richState(), ['gamine']);
    expect(next.crew.map((d) => d.id)).toEqual(['tonton', 'gamine']);
    expect(next.crew[0].xp).toBe(600);
    expect(next.crew[0].fatigue).toBe(0);
    expect(next.crew[1].xp).toBe(750);
    expect(next.crew[1].fatigue).toBe(0);
    expect(next.tour.veteranIds).toEqual(['gamine']);
  });

  it('plafonne les vétérans à maxVeterans et ignore le fondateur en doublon', () => {
    const next = departOnTour(richState(), ['tonton', 'gamine', 'kilowatt']);
    expect(next.crew.map((d) => d.id)).toEqual(['tonton', 'gamine']); // 1 seul slot sans « famille »
    const state2 = richState();
    state2.tour.perks = ['famille'];
    const next2 = departOnTour(state2, ['gamine', 'kilowatt']);
    expect(next2.crew.map((d) => d.id)).toEqual(['tonton', 'gamine', 'kilowatt']);
  });
});

describe('les Têtes d’affiche', () => {
  it('reste invisibles et irrecrutables sans le perk, même à rep max', () => {
    const state = newGame();
    state.rep = 9999;
    const visible = [...recruitableDjs(state), ...lockedDjs(state)].map((d) => d.id);
    expect(visible).not.toContain('sansnom');
    expect(visible).not.toContain('comete');
    expect(recruitDj(state, 'sansnom')).toBe(false);
  });

  it('rejoint le pool avec son perk, gated par la rep comme les autres', () => {
    const state = newGame();
    state.tour.perks = ['tete-sansnom'];
    state.rep = getDj('sansnom').repReq;
    expect(recruitableDjs(state).map((d) => d.id)).toContain('sansnom');
    expect(recruitDj(state, 'sansnom')).toBe(true);
    expect(getDj('sansnom').technique).toBe(5);
    expect(getDj('sansnom').charisme).toBe(5);
    expect(getDj('sansnom').cut).toBe(0.35);
  });

  it('increvable : La Comète ne prend pas de fatigue, mais gagne l’XP', () => {
    const dj = { id: 'comete', xp: 0, fatigue: 0, setsPlayed: 0, gifted: false, studioBonus: 0 };
    applySetToll(dj, 'pousser', 90);
    expect(dj.fatigue).toBe(0);
    expect(dj.xp).toBeGreaterThan(0);
    expect(dj.setsPlayed).toBe(1);
  });

  it('insaisissable : DJ Sans Nom chauffe à 40 % d’un risque normal du même genre', () => {
    const heatAfter = (djId: string): number => {
      const state = newGame();
      state.crew.push({ id: djId, xp: 0, fatigue: 0, setsPlayed: 0, gifted: false, studioBonus: 0 });
      const night = createNight(state, 'champ', [djId], 7);
      startSet(state, night, djId, 'normal');
      for (let i = 0; i < 80; i++) tickNight(state, night, 0.1); // 8 s — avant tout event/prompt
      return night.heat;
    };
    // memeacide joue aussi mentale, risk normal (×1.0) ; sansnom : discret ×0.8 × gimmick ×0.5
    expect(heatAfter('sansnom')).toBeCloseTo(heatAfter('memeacide') * 0.4, 5);
  });
});

describe('carnet d’adresses', () => {
  it('débloque les DJs à 70 % de leur seuil de rep', () => {
    const state = newGame();
    state.tour.perks = ['carnet-adresses'];
    state.rep = Math.ceil(getDj('fantome').repReq * 0.7); // 455 au lieu de 650
    expect(recruitableDjs(state).map((d) => d.id)).toContain('fantome');
    expect(recruitDj(state, 'fantome')).toBe(true);
    const state2 = newGame();
    state2.rep = 455; // sans le perk, fantome reste verrouillé
    expect(recruitDj(state2, 'fantome')).toBe(false);
  });
});

describe('departOnTour : les perks de départ (applyPerks, le point unique)', () => {
  it('camion 1 500 €, réputation 30, matos tier 1 partout', () => {
    const state = richState();
    state.tour.perks = ['camion-amenage', 'reputation-precede', 'matos-planque'];
    const next = departOnTour(state, []);
    expect(next.cash).toBe(1500);
    expect(next.rep).toBe(30);
    expect(next.gear).toEqual({ platines: 1, mur: 1, groupe: 1, lumieres: 1, logistique: 1 });
  });

  it('applyPerks est inoffensif sans perk', () => {
    const state = newGame();
    applyPerks(state);
    expect(state.cash).toBe(0);
    expect(state.rep).toBe(0);
    expect(state.gear.platines).toBe(0);
  });

  it('no-softlock : sans perk matos, le starter de la tournée N reste insaisissable', () => {
    const next = departOnTour(richState(), []);
    for (const cat of GEAR_CATEGORIES) {
      expect(GEAR[cat][next.gear[cat]].seizable).toBe(false);
      expect(GEAR[cat][next.gear[cat]].price).toBe(0);
    }
  });
});
