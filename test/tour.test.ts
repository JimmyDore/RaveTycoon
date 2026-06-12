import { describe, expect, it } from 'vitest';
import { deserialize, newGame, serialize } from '../src/core/save';

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
