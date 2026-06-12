import { describe, it, expect } from 'vitest';
import {
  recruitableDjs,
  lockedDjs,
  recruitDj,
  applyNightRest,
  REST_RECOVERY,
  fatigueMalus,
  fatigueQualityMult,
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
    expect(lockedDjs(state)).toHaveLength(10); // Volt est gated par le soundclash : invisible sans victoire
    state.rep = 40;
    const available = recruitableDjs(state).map((d) => d.id);
    expect(available).toContain('gamine');
    expect(available).toContain('plume');
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
  it('accumulates from sets, more at PEAK/RINSE, capped at 1 (no hidden debt)', () => {
    const state = newGame();
    const dj = state.crew[0];
    applySetToll(dj, 0, 90); // un set tout en chill/groove
    const afterCalm = dj.fatigue;
    expect(afterCalm).toBeCloseTo(0.18, 5);
    applySetToll(dj, 1, 90); // un set 100 % peak/rinse
    expect(dj.fatigue - afterCalm).toBeCloseTo(0.34, 5);
    for (let i = 0; i < 20; i++) applySetToll(dj, 1, 90);
    expect(dj.fatigue).toBe(1);
  });

  it('rests crew who did not play tonight; players keep their toll; floors at 0', () => {
    const state = newGame();
    state.rep = 8;
    recruitDj(state, 'gamine');
    const [tonton, gamine] = state.crew;
    tonton.fatigue = 0.8; // played a set
    gamine.fatigue = 0.9; // benched
    applyNightRest(state, new Set(['tonton']));
    expect(tonton.fatigue).toBe(0.8);
    expect(gamine.fatigue).toBeCloseTo(0.9 - REST_RECOVERY, 5);
    applyNightRest(state, new Set(['tonton'])); // gamine benched again
    expect(gamine.fatigue).toBe(0);
  });

  it('quality malus scales with fatigue and caps at full exhaustion', () => {
    expect(fatigueMalus(0)).toBe(0);
    expect(fatigueMalus(1)).toBeCloseTo(0.35, 5);
    expect(fatigueMalus(1.5)).toBeCloseTo(0.35, 5);
    expect(fatigueQualityMult({ id: 'x', xp: 0, fatigue: 1, setsPlayed: 0, gifted: false, studioBonus: 0 })).toBeCloseTo(0.65, 5);
  });
});
