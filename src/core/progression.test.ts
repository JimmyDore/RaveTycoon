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
  it('night 1 funds a first purchase', () => {
    const state = newGame(42);
    playNight(state, 1234);
    // at least one tier-1 gear upgrade must be affordable after one night
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
    expect(state.rep).toBeGreaterThanOrEqual(12); // forêt threshold after Task 3.2
  });
});
