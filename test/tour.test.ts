import { describe, expect, it } from 'vitest';
import { PERKS } from '../src/core/data';
import { createNight } from '../src/core/night';
import { settleNight } from '../src/core/payout';
import { deserialize, newGame, serialize } from '../src/core/save';
import {
  buyPerk,
  canBuyPerk,
  computeLegende,
  hasPerk,
  maxVeterans,
  perkCount,
} from '../src/core/tour';

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
