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
    state.gear.mur = 2;
    state.damaged.mur = true;
    expect(repairDurationMs(state, 'mur')).toBe(2 * 30 * 60_000);
    expect(startRepair(state, 'mur', 0)).toBe(true);
    applyIdleTime(state, 59 * 60_000);
    expect(state.damaged.mur).toBe(true);
    applyIdleTime(state, 60 * 60_000);
    expect(state.damaged.mur).toBe(false);
    expect(state.repairs).toHaveLength(0);
  });

  it('rush costs 80 per tier and completes instantly', () => {
    const state = newGame(0);
    state.gear.groupe = 3;
    state.damaged.groupe = true;
    state.cash = 1000;
    expect(rushCost(state, 'groupe')).toBe(240);
    expect(rushRepair(state, 'groupe')).toBe(true);
    expect(state.damaged.groupe).toBe(false);
    expect(state.cash).toBe(760);
  });

  it('refuses a rush the player cannot afford', () => {
    const state = newGame(0);
    state.gear.groupe = 1;
    state.damaged.groupe = true;
    state.cash = 10;
    expect(rushRepair(state, 'groupe')).toBe(false);
    expect(state.damaged.groupe).toBe(true);
  });
});

describe('crew recovery', () => {
  it('does not recover fatigue with real time — rest is per night, not idle', () => {
    const state = newGame(0);
    state.crew[0].fatigue = 1;
    applyIdleTime(state, 1000 * HOUR);
    expect(state.crew[0].fatigue).toBe(1);
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
