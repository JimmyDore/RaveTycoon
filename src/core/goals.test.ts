import { describe, expect, it } from 'vitest';
import { drawGoal, SET_GOALS } from './goals';
import { createNight, startSet, tickNight } from './night';
import { settleNight } from './payout';
import { newGame } from './save';
import type { EventContext } from './types';

function ctx(): EventContext {
  return {
    heat: 0.2,
    spotTier: 1,
    brief: 'normal',
    djRisk: 'normal',
    crowdRatio: 0.3,
    gear: { platines: 0, mur: 0, groupe: 0, lumieres: 0, logistique: 0 },
  };
}

describe('drawGoal', () => {
  it('tire un objectif du deck', () => {
    const goal = drawGoal(ctx(), () => 0.5);
    expect(goal).not.toBeNull();
    expect(SET_GOALS.some((g) => g.id === goal!.id)).toBe(true);
  });
});

describe('objectifs de set', () => {
  it('un set propre (zéro brownout) crédite la récompense et l’enregistre', () => {
    const state = newGame(42);
    const night = createNight(state, 'champ', ['tonton'], 7);
    startSet(state, night, 'tonton', 'normal');
    // force l'objectif « zéro brownout », trivialement atteint sur un set court
    const propre = SET_GOALS.find((g) => g.id === 'propre')!;
    night.setGoal = propre;
    const repBefore = night.repBonus;
    const bankBefore = night.bank;
    // un set très court sans brownout
    for (let t = 0; t < 5; t += 0.1) tickNight(state, night, 0.1);
    // termine le set manuellement
    night.setElapsed = night.setLen;
    tickNight(state, night, 0.1);
    expect(night.goalsMet).toContain(propre.label);
    const reward = propre.reward;
    expect(night.repBonus).toBe(repBefore + (reward.rep ?? 0));
    expect(night.bank).toBeGreaterThanOrEqual(bankBefore + (reward.cash ?? 0));
  });

  it('le résultat (settleNight) expose goalsMet', () => {
    const state = newGame(42);
    const night = createNight(state, 'champ', ['tonton'], 7);
    startSet(state, night, 'tonton', 'normal');
    const propre = SET_GOALS.find((g) => g.id === 'propre')!;
    night.setGoal = propre;
    night.setBrownouts = 0;
    night.setElapsed = night.setLen;
    tickNight(state, night, 0.1);
    // mène la nuit jusqu'à sa fin pour pouvoir settle
    for (let guard = 0; guard < 100_000 && night.phase !== 'ended'; guard++) {
      if (night.phase === 'transition') startSet(state, night, 'tonton', 'normal');
      tickNight(state, night, 0.1);
    }
    const result = settleNight(state, night);
    expect(Array.isArray(result.goalsMet)).toBe(true);
    expect(result.goalsMet).toContain(propre.label);
  });
});
