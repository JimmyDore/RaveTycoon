import { describe, it, expect } from 'vitest';
import {
  recruitableDjs,
  lockedDjs,
  recruitDj,
  recoverFatigue,
  djLevel,
  effectiveTechnique,
  applySetToll,
  XP_PER_LEVEL,
  MAX_LEVEL,
} from '../src/core/crew';
import { getDj } from '../src/core/data';
import { newGame } from '../src/core/save';

describe('recruitment', () => {
  it('starts with only the founding tonton', () => {
    const state = newGame();
    expect(state.crew.map((d) => d.id)).toEqual(['tonton']);
  });

  it('gates recruitment on reputation, not money', () => {
    const state = newGame();
    state.cash = 999999;
    expect(recruitableDjs(state)).toHaveLength(0);
    expect(lockedDjs(state)).toHaveLength(7);
    state.rep = 40;
    const available = recruitableDjs(state).map((d) => d.id);
    expect(available).toContain('gamine');
    expect(available).toContain('boblepine');
    expect(available).not.toContain('fantome');
  });

  it('recruits exactly once', () => {
    const state = newGame();
    state.rep = 20;
    expect(recruitDj(state, 'gamine')).toBe(true);
    expect(recruitDj(state, 'gamine')).toBe(false);
    expect(recruitDj(state, 'fantome')).toBe(false); // rep too low
    expect(state.crew).toHaveLength(2);
  });
});

describe('experience', () => {
  it('levels up with xp, capped, and raises effective technique', () => {
    const state = newGame();
    const dj = state.crew[0];
    expect(djLevel(dj)).toBe(0);
    dj.xp = XP_PER_LEVEL;
    expect(djLevel(dj)).toBe(1);
    expect(effectiveTechnique(getDj('tonton'), dj)).toBeGreaterThan(getDj('tonton').technique);
    dj.xp = XP_PER_LEVEL * 99;
    expect(djLevel(dj)).toBe(MAX_LEVEL);
  });
});

describe('fatigue', () => {
  it('accumulates from sets (more when pushing) and recovers over 12h', () => {
    const state = newGame();
    const dj = state.crew[0];
    applySetToll(dj, 'normal', 90);
    const afterNormal = dj.fatigue;
    applySetToll(dj, 'pousser', 90);
    expect(dj.fatigue - afterNormal).toBeGreaterThan(afterNormal - 0);
    const before = dj.fatigue;
    recoverFatigue(state, 6);
    expect(dj.fatigue).toBeCloseTo(before - 0.5, 5);
    recoverFatigue(state, 100);
    expect(dj.fatigue).toBe(0);
  });
});
