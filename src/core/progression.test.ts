import { describe, expect, it } from 'vitest';
import { DJS, GEAR } from './data';
import { createNight, resolveEvent, startSet, tickNight } from './night';
import { settleNight } from './payout';
import { newGame } from './save';
import type { GameState, NightResult } from './types';

/** Play one full night at the current selection, always picking event option 0. */
function playNight(state: GameState, seed: number): NightResult {
  const night = createNight(state, 'champ', ['tonton'], seed);
  // guard against balance changes hanging the loop
  for (let guard = 0; guard < 100_000 && night.phase !== 'ended'; guard++) {
    if (night.phase === 'transition') startSet(state, night, 'tonton', 'normal');
    if (night.phase === 'event') resolveEvent(state, night, 0);
    tickNight(state, night, 0.1);
  }
  expect(night.phase).toBe('ended');
  expect(night.sunrise).toBe(true); // a normal-brief champ night must never bust
  return settleNight(state, night);
}

describe('early-game progression curve', () => {
  it('two nights fund a first purchase (prix ×2.5 — la première heure ralentit)', () => {
    const state = newGame(42);
    playNight(state, 1);
    playNight(state, 2);
    // cheapest tier-1 = Barre de LEDs 300 € ; mesuré ≈ 492 € après 2 nuits
    const cheapest = Math.min(
      ...Object.values(GEAR).map((items) => items[1].price),
    );
    expect(state.cash).toBeGreaterThanOrEqual(cheapest);
  });

  it('first DJ unlocks within 2 nights, first venue within 4', () => {
    const state = newGame(42);
    playNight(state, 1);
    playNight(state, 2);
    const gamine = DJS.find((d) => d.id === 'gamine')!;
    expect(state.rep).toBeGreaterThanOrEqual(gamine.repReq);
    playNight(state, 3);
    playNight(state, 4);
    expect(state.rep).toBeGreaterThanOrEqual(16); // forêt threshold after restretch ×1.3
  });
});
