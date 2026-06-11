import { describe, expect, it } from 'vitest';
import { NIGHT_EVENTS } from './events';
import { createNight, resolveEvent, startSet } from './night';
import { settleNight } from './payout';
import { newGame } from './save';

describe('night journal', () => {
  it('records each resolved event and surfaces it in the result', () => {
    const state = newGame(42);
    const night = createNight(state, 'champ', ['tonton'], 7);
    startSet(state, night, 'tonton', 'normal');
    night.pendingEvent = { def: NIGHT_EVENTS[0] };
    night.phase = 'event';
    resolveEvent(state, night, 1);
    expect(night.journal).toHaveLength(1);
    expect(night.journal[0].titre).toBe(NIGHT_EVENTS[0].titre);
    expect(night.journal[0].outcome).toBe(NIGHT_EVENTS[0].options[1].outcome);
    night.phase = 'ended';
    night.sunrise = true;
    const result = settleNight(state, night);
    expect(result.journal).toHaveLength(1);
  });
});
