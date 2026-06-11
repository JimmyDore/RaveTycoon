import { describe, it, expect } from 'vitest';
import {
  applyIdleTime,
  buzzAfterNight,
  startRepair,
  rushRepair,
  repairDurationMs,
  rushCost,
} from '../src/core/idle';
import { newGame } from '../src/core/save';

const HOUR = 3_600_000;

describe('buzz', () => {
  it('halves over 24 hours', () => {
    const state = newGame(0);
    state.buzz = 1.0;
    applyIdleTime(state, 24 * HOUR);
    expect(state.buzz).toBeCloseTo(0.5, 5);
  });

  it('grows after a good night, capped at 1.5', () => {
    const state = newGame(0);
    buzzAfterNight(state, 1);
    expect(state.buzz).toBeCloseTo(0.6, 5);
    for (let i = 0; i < 10; i++) buzzAfterNight(state, 1);
    expect(state.buzz).toBe(1.5);
  });
});

describe('repairs', () => {
  it('takes 30 minutes per tier and completes with idle time', () => {
    const state = newGame(0);
    state.gear.amps = 2;
    state.damaged.amps = true;
    expect(repairDurationMs(state, 'amps')).toBe(2 * 30 * 60_000);
    expect(startRepair(state, 'amps', 0)).toBe(true);
    applyIdleTime(state, 59 * 60_000);
    expect(state.damaged.amps).toBe(true);
    applyIdleTime(state, 60 * 60_000);
    expect(state.damaged.amps).toBe(false);
    expect(state.repairs).toHaveLength(0);
  });

  it('rush costs 80 per tier and completes instantly', () => {
    const state = newGame(0);
    state.gear.subs = 3;
    state.damaged.subs = true;
    state.cash = 1000;
    expect(rushCost(state, 'subs')).toBe(240);
    expect(rushRepair(state, 'subs')).toBe(true);
    expect(state.damaged.subs).toBe(false);
    expect(state.cash).toBe(760);
  });

  it('refuses a rush the player cannot afford', () => {
    const state = newGame(0);
    state.gear.subs = 1;
    state.damaged.subs = true;
    state.cash = 10;
    expect(rushRepair(state, 'subs')).toBe(false);
    expect(state.damaged.subs).toBe(true);
  });
});

describe('no passive income', () => {
  it('idle time never changes cash', () => {
    const state = newGame(0);
    state.cash = 500;
    applyIdleTime(state, 1000 * HOUR);
    expect(state.cash).toBe(500);
  });
});
