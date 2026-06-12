import { describe, expect, it } from 'vitest';
import {
  BAR_DRIP,
  BAR_STOCK_CAP,
  BAR_STOCK_COST,
  BRIEF_INTENSITY,
  ESSENCE_RATE,
  cautionCost,
  essenceCost,
  potentialBar,
} from '../src/core/economy';
import { BRANCH_TIER, GEAR, GEAR_CATEGORIES, gearItem, getDj, getSpot, nextGearOptions, ownedGear, switchBranchItem } from '../src/core/data';
import {
  branchChurnMult,
  branchHeatMult,
  computeSetQuality,
  createNight,
  createNight as mkNight,
  dropMontee,
  effectiveCharisme,
  startSet,
  startSet as start,
  tickNight,
} from '../src/core/night';
import {
  buyDayOff,
  buyStudioSession,
  effectiveCut,
  effectiveTechnique,
  giftDj,
} from '../src/core/crew';
import { applyBust, buyGearUpgrade, cutsTotal, settleNight, switchGearBranch } from '../src/core/payout';
import { newGame } from '../src/core/save';
import type { GameState, NightState } from '../src/core/types';

/** Same shape as payout.test.ts: a champ night frozen at sunrise. */
function finishedNight(
  state: GameState,
  opts: { barStock?: 'leger' | 'normal' | 'large'; caution?: boolean } = {},
  overrides: Partial<NightState> = {},
): NightState {
  const night = createNight(state, 'champ', ['tonton'], 1, opts);
  Object.assign(night, {
    t: 180,
    phase: 'ended',
    sunrise: true,
    bank: 100,
    peakCrowd: 30,
    vibeSum: 0.8 * 180,
    vibeSamples: 180,
    peakHeat: 0.4,
    playedSets: [
      { djId: 'tonton', brief: 'normal' },
      { djId: 'tonton', brief: 'normal' },
    ],
  });
  return Object.assign(night, overrides);
}

describe('essence du groupe', () => {
  it('coûte 2 €/min pondérés par la consigne — gratuite au groupe poussif', () => {
    const state = newGame();
    const night = finishedNight(state, {}, {
      playedSets: [
        { djId: 'tonton', brief: 'normal' },
        { djId: 'tonton', brief: 'pousser' },
      ],
    });
    expect(essenceCost(state, night)).toBe(0); // groupe tier 0 : no-softlock
    state.gear.groupe = 1;
    // RÉVISION CHANTIER 1 : intensité = consigne (safe .25 / normal .5 / pousser 1)
    // 2 € × 3 min × (0.5 + (0.5 + 1) / 2) = 7.5 → 8
    expect(ESSENCE_RATE).toBe(2);
    expect(BRIEF_INTENSITY).toEqual({ safe: 0.25, normal: 0.5, pousser: 1 });
    expect(essenceCost(state, night)).toBe(8);
  });
});

describe('stock du bar', () => {
  it('expose les fractions coût/plafond du choix de prépa', () => {
    expect(BAR_DRIP).toBe(0.05); // déplacé de night.ts vers economy.ts
    expect(BAR_STOCK_COST).toEqual({ leger: 0, normal: 0.15, large: 0.3 });
    expect(BAR_STOCK_CAP).toEqual({ leger: 0.5, normal: 0.8, large: 1.1 });
  });

  it('plafonne la recette de la buvette au stock embarqué', () => {
    const state = newGame();
    const night = createNight(state, 'champ', ['tonton'], 2, { barStock: 'leger' });
    // potentiel = cap × drip × priceMult × durée = 36 × 0.05 × 1 × 180 = 324
    expect(potentialBar(getSpot('champ'), night.cap)).toBeCloseTo(324, 5);
    expect(night.barCap).toBeCloseTo(162, 5); // léger = 50 %
    startSet(state, night, 'tonton', 'normal');
    night.crowd = night.cap;
    night.barSales = night.barCap; // stock épuisé
    const bank = night.bank;
    tickNight(state, night, 1);
    expect(night.bank).toBe(bank); // plus rien à vendre
  });

  it('par défaut le stock est léger (zéro frais)', () => {
    const state = newGame();
    expect(createNight(state, 'champ', ['tonton'], 3).barStock).toBe('leger');
  });
});

describe('frais prélevés sur le brut, jamais sur la banque', () => {
  it('détaille essence + restock au payout', () => {
    const state = newGame();
    state.gear.groupe = 1;
    const night = finishedNight(state, { barStock: 'normal' });
    const result = settleNight(state, night);
    // brut = round(100 × 2.14) = 214 ; essence = 2×3×1 = 6 ; restock = round(0.15×324) = 49
    expect(result.essence).toBe(6);
    expect(result.restock).toBe(49);
    expect(result.gross).toBe(214 - 55);
    expect(result.payout).toBe(Math.round(159 * 0.95)); // 151
    expect(state.cash).toBe(151);
  });

  it('ne fait jamais passer la caisse en négatif (banque vide → frais nuls)', () => {
    const state = newGame();
    state.gear.groupe = 3;
    const night = finishedNight(state, { barStock: 'large' }, { bank: 0, peakCrowd: 0, vibeSum: 0 });
    settleNight(state, night);
    expect(state.cash).toBe(0);
  });

  it('prélève aussi sur le demi-brut d’un premier bust', () => {
    const state = newGame();
    state.gear.groupe = 1;
    const night = finishedNight(state, { barStock: 'normal' }, { sunrise: false, busted: true });
    const result = applyBust(state, night);
    // demi-banque = 50, puis essence 6 + restock 44 (restock plafonné à ce qui reste)
    expect(result.essence).toBe(6);
    expect(result.restock).toBe(44);
    expect(result.gross).toBe(0);
    expect(state.cash).toBe(0); // jamais négatif
  });
});

describe('caution du spot (tiers ≥ 3)', () => {
  it('se paie sur la banque et revient à l’aube', () => {
    const state = newGame();
    state.rep = 1000;
    state.cash = 1000;
    expect(cautionCost(state, getSpot('carriere'))).toBe(220); // cap × 1 €
    expect(cautionCost(state, getSpot('champ'))).toBe(0); // tier < 3
    const night = createNight(state, 'carriere', ['tonton'], 4, { caution: true });
    expect(state.cash).toBe(780);
    expect(night.cautionPaid).toBe(220);
    expect(night.heat).toBe(0);
    Object.assign(night, {
      t: 300, phase: 'ended', sunrise: true, bank: 50, peakCrowd: 10,
      vibeSum: 30, vibeSamples: 300,
      playedSets: [{ djId: 'tonton', brief: 'normal' }],
    });
    const result = settleNight(state, night);
    expect(result.cautionReturned).toBe(220);
    expect(state.cash).toBe(780 + result.payout + 220);
  });

  it('est perdue sur bust', () => {
    const state = newGame();
    state.rep = 1000;
    state.cash = 500;
    const night = createNight(state, 'carriere', ['tonton'], 5, { caution: true });
    Object.assign(night, {
      t: 300, phase: 'ended', busted: true, bank: 0, peakCrowd: 0,
      playedSets: [{ djId: 'tonton', brief: 'normal' }],
    });
    const result = applyBust(state, night);
    expect(result.cautionReturned).toBe(0);
    expect(result.cautionPaid).toBe(220);
    expect(state.cash).toBe(280); // la caution ne revient pas
  });

  it('sans caution sur un tier ≥ 3, la heat démarre à +0.1 — jouable quand même', () => {
    const state = newGame();
    state.rep = 1000;
    expect(createNight(state, 'carriere', ['tonton'], 6).heat).toBeCloseTo(0.1, 5);
    expect(createNight(state, 'champ', ['tonton'], 6).heat).toBe(0);
  });

  it('refuse la caution si la banque ne suit pas (et joue sans)', () => {
    const state = newGame();
    state.rep = 1000;
    state.cash = 100;
    const night = createNight(state, 'carriere', ['tonton'], 7, { caution: true });
    expect(night.cautionPaid).toBe(0);
    expect(state.cash).toBe(100);
    expect(night.heat).toBeCloseTo(0.1, 5);
  });
});

describe('branches du matos', () => {
  it('refuse le tier 3 sans choix de voie, puis verrouille la voie choisie', () => {
    const state = newGame();
    state.cash = 100000;
    expect(buyGearUpgrade(state, 'platines')).toBe(true); // t1 — 500 €
    expect(buyGearUpgrade(state, 'platines')).toBe(true); // t2 — 2 500 €
    expect(buyGearUpgrade(state, 'platines')).toBe(false); // t3 exige une voie
    expect(buyGearUpgrade(state, 'platines', 'A')).toBe(true); // t3A — 7 000 €
    expect(state.gearBranch.platines).toBe('A');
    expect(state.cash).toBe(100000 - 500 - 2500 - 7000);
    // les tiers 4–5 prolongent la voie sans re-choisir
    expect(buyGearUpgrade(state, 'platines')).toBe(true); // t4A — 4 000 €
    expect(ownedGear(state, 'platines').branch).toBe('A');
    expect(ownedGear(state, 'platines').tier).toBe(4);
  });

  it('changer de voie = racheter le tier courant au prix plein', () => {
    const state = newGame();
    state.cash = 100000;
    state.gear.platines = 4;
    state.gearBranch.platines = 'A';
    const other = switchBranchItem(state, 'platines')!;
    expect(other.branch).toBe('B');
    expect(other.price).toBe(4000);
    expect(switchGearBranch(state, 'platines')).toBe(true);
    expect(state.cash).toBe(100000 - 4000);
    expect(state.gearBranch.platines).toBe('B');
    expect(ownedGear(state, 'platines').nom).toBe(gearItem('platines', 4, 'B').nom);
  });

  it('propose deux options au tier 3, une seule ensuite', () => {
    const state = newGame();
    state.gear.mur = 2;
    expect(nextGearOptions(state, 'mur').map((g) => g.branch)).toEqual(['A', 'B']);
    state.gear.mur = 3;
    state.gearBranch.mur = 'B';
    expect(nextGearOptions(state, 'mur').map((g) => `${g.tier}${g.branch}`)).toEqual(['4B']);
    state.gear.mur = 5;
    expect(nextGearOptions(state, 'mur')).toEqual([]);
  });

  it('chaque catégorie a 9 items : t0–t2 sans voie, t3–t5 en double', () => {
    for (const cat of GEAR_CATEGORIES) {
      expect(GEAR[cat]).toHaveLength(9);
      expect(GEAR[cat].filter((g) => g.branch === undefined).map((g) => g.tier)).toEqual([0, 1, 2]);
      for (const tier of [3, 4, 5]) {
        expect(GEAR[cat].filter((g) => g.tier === tier).map((g) => g.branch).sort()).toEqual(['A', 'B']);
      }
      expect(GEAR[cat][0].price).toBe(0);
      expect(GEAR[cat][0].seizable).toBe(false);
    }
    expect(BRANCH_TIER).toBe(3);
  });
});

describe('les voies dans la sim', () => {
  it('platines B : charisme effectif +1 pour tous les DJs', () => {
    const state = newGame();
    expect(effectiveCharisme(state, getDj('tonton'))).toBe(2);
    state.gear.platines = 3;
    state.gearBranch.platines = 'B';
    expect(effectiveCharisme(state, getDj('tonton'))).toBe(3);
    state.gearBranch.platines = 'A';
    expect(effectiveCharisme(state, getDj('tonton'))).toBe(2);
  });

  it('mur A + lumières A : le churn se multiplie', () => {
    const state = newGame();
    expect(branchChurnMult(state)).toBe(1);
    state.gear.mur = 3;
    state.gearBranch.mur = 'A';
    state.gear.lumieres = 3;
    state.gearBranch.lumieres = 'A';
    expect(branchChurnMult(state)).toBeCloseTo(0.88 * 0.9, 5);
  });

  it('mur B + groupe A : la heat se multiplie', () => {
    const state = newGame();
    expect(branchHeatMult(state)).toBe(1);
    state.gear.mur = 3;
    state.gearBranch.mur = 'B';
    state.gear.groupe = 3;
    state.gearBranch.groupe = 'A';
    expect(branchHeatMult(state)).toBeCloseTo(0.92 * 0.9, 5);
  });

  it('mur B : le line array bonifie la qualité de set', () => {
    const a = newGame();
    a.gear.mur = 3;
    a.gearBranch.mur = 'A';
    const b = newGame();
    b.gear.mur = 3;
    b.gearBranch.mur = 'B';
    const na = mkNight(a, 'champ', ['tonton'], 8);
    const nb = mkNight(b, 'champ', ['tonton'], 8);
    expect(computeSetQuality(b, nb, 'tonton', 'normal')).toBeCloseTo(
      computeSetQuality(a, na, 'tonton', 'normal') * 1.06,
      5,
    );
  });

  it('lumières B : le drop paie plus', () => {
    const mk = (branch: 'A' | 'B') => {
      const state = newGame();
      state.gear.lumieres = 3;
      state.gearBranch.lumieres = branch;
      const night = mkNight(state, 'champ', ['tonton'], 9);
      start(state, night, 'tonton', 'normal');
      night.montee = 1;
      night.vibe = 0.3;
      night.crowd = night.cap * 0.3;
      dropMontee(state, night);
      return night;
    };
    expect(mk('B').vibe).toBeGreaterThan(mk('A').vibe);
    expect(mk('B').crowd).toBeGreaterThan(mk('A').crowd);
  });

  it('logistique B : cautions −50 %', () => {
    const state = newGame();
    state.gear.logistique = 3;
    state.gearBranch.logistique = 'B';
    expect(cautionCost(state, getSpot('carriere'))).toBe(110);
  });
});

describe('sinks crew', () => {
  it('cadeau : 500 € × niveau, cut −2 pts plancher 3 %, une seule fois par DJ', () => {
    const state = newGame();
    state.cash = 10000;
    const tonton = state.crew[0];
    expect(giftDj(state, 'tonton')).toBe(true);
    expect(state.cash).toBe(9500); // niveau 0 compte comme 1
    expect(effectiveCut(getDj('tonton'), tonton)).toBeCloseTo(0.03, 5); // 0.05 − 0.02 ≥ plancher
    expect(giftDj(state, 'tonton')).toBe(false); // une fois par DJ
  });

  it('le cadeau passe dans cutsTotal au payout', () => {
    const state = newGame();
    state.cash = 10000;
    giftDj(state, 'tonton');
    const night = finishedNight(state);
    expect(cutsTotal(state, night)).toBeCloseTo(0.03, 5);
  });

  it('jour off payé : 100 € × niveau, toute la fatigue récupérée', () => {
    const state = newGame();
    state.cash = 1000;
    state.crew[0].fatigue = 0.8;
    expect(buyDayOff(state, 'tonton')).toBe(true);
    expect(state.cash).toBe(900);
    expect(state.crew[0].fatigue).toBe(0);
    expect(buyDayOff(state, 'tonton')).toBe(false); // déjà frais
  });

  it('session studio : 1 200 €, +0.5 technique permanent, plafonné à +1', () => {
    const state = newGame();
    state.cash = 10000;
    const base = effectiveTechnique(getDj('tonton'), state.crew[0]);
    expect(buyStudioSession(state, 'tonton')).toBe(true);
    expect(effectiveTechnique(getDj('tonton'), state.crew[0])).toBeCloseTo(base + 0.5, 5);
    expect(buyStudioSession(state, 'tonton')).toBe(true);
    expect(buyStudioSession(state, 'tonton')).toBe(false); // max +1
    expect(state.cash).toBe(10000 - 2400);
    expect(effectiveTechnique(getDj('tonton'), state.crew[0])).toBeCloseTo(base + 1, 5);
  });

  it('refuse quand la caisse ne suit pas', () => {
    const state = newGame();
    state.cash = 100;
    state.crew[0].fatigue = 0.5;
    expect(giftDj(state, 'tonton')).toBe(false);
    expect(buyStudioSession(state, 'tonton')).toBe(false);
    expect(state.cash).toBe(100);
  });
});
