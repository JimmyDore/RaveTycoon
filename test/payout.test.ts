import { describe, it, expect } from 'vitest';
import { settleNight, applyBust, isSpotUnlocked, buyGearUpgrade } from '../src/core/payout';
import { createRave } from '../src/core/rave';
import { newGame } from '../src/core/save';
import type { RaveState } from '../src/core/types';

function finishedRave(overrides: Partial<RaveState> = {}): RaveState {
  const rave = createRave(newGame(), 'champ', 'hardtek', 1);
  Object.assign(rave, {
    t: 180,
    ended: true,
    sunrise: true,
    bank: 100,
    peakCrowd: 30,
    vibeSum: 0.8 * 180,
    vibeSamples: 180,
    peakHeat: 0.4,
  });
  return Object.assign(rave, overrides);
}

describe('settleNight', () => {
  it('applies the donation multiplier from vibe and peak crowd', () => {
    const state = newGame();
    const rave = finishedRave();
    const result = settleNight(state, rave);
    // 1 + 0.8*0.8 + 0.6*(30/60) = 1.94
    expect(result.donationMult).toBeCloseTo(1.94, 2);
    expect(result.payout).toBe(194);
    expect(state.cash).toBe(194);
  });

  it('grants reputation and a high-heat survival bonus', () => {
    const calm = newGame();
    settleNight(calm, finishedRave());
    const risky = newGame();
    settleNight(risky, finishedRave({ peakHeat: 0.9 }));
    expect(calm.rep).toBeGreaterThan(0);
    expect(risky.rep).toBe(calm.rep + 15);
  });

  it('marks the teknival sunrise as the win moment', () => {
    const state = newGame();
    state.rep = 1000;
    const rave = createRave(state, 'teknival', 'hardtek', 1);
    Object.assign(rave, { t: 600, ended: true, sunrise: true, bank: 5000, peakCrowd: 1500, vibeSum: 540, vibeSamples: 600 });
    const result = settleNight(state, rave);
    expect(result.won).toBe(true);
    expect(state.wonTeknival).toBe(true);
  });
});

describe('applyBust escalation', () => {
  it('first bust: lose half the bank', () => {
    const state = newGame();
    const result = applyBust(state, finishedRave({ sunrise: false, busted: true }));
    expect(result.payout).toBe(50);
    expect(result.fine).toBe(0);
    expect(result.seized).toBeNull();
    expect(state.cash).toBe(50);
  });

  it('second bust: lose the bank and pay a fine', () => {
    const state = newGame();
    state.busts = 1;
    state.cash = 1000;
    const result = applyBust(state, finishedRave({ sunrise: false, busted: true }));
    expect(result.payout).toBe(0);
    expect(result.fine).toBe(200); // tier 1 spot
    expect(state.cash).toBe(800);
  });

  it('third bust: seizes the priciest seizable gear, never tier 0', () => {
    const state = newGame();
    state.busts = 2;
    state.gear = { amps: 2, subs: 1, gen: 0 };
    const result = applyBust(state, finishedRave({ sunrise: false, busted: true }));
    expect(result.seized).toBe('amps');
    expect(state.gear.amps).toBe(1);
  });

  it('never seizes when only tier-0 starter gear is owned (no softlock)', () => {
    const state = newGame();
    state.busts = 5;
    const result = applyBust(state, finishedRave({ sunrise: false, busted: true }));
    expect(result.seized).toBeNull();
    expect(state.gear).toEqual({ amps: 0, subs: 0, gen: 0 });
  });

  it('never lets cash go negative', () => {
    const state = newGame();
    state.busts = 1;
    state.cash = 50;
    applyBust(state, finishedRave({ sunrise: false, busted: true, bank: 0 }));
    expect(state.cash).toBe(0);
  });
});

describe('progression', () => {
  it('unlocks spots with reputation, not money', () => {
    const state = newGame();
    state.cash = 999999;
    expect(isSpotUnlocked(state, 'champ')).toBe(true);
    expect(isSpotUnlocked(state, 'hangar')).toBe(false);
    state.rep = 150;
    expect(isSpotUnlocked(state, 'hangar')).toBe(true);
  });

  it('buys gear upgrades with cash', () => {
    const state = newGame();
    expect(buyGearUpgrade(state, 'amps')).toBe(false); // broke
    state.cash = 300;
    expect(buyGearUpgrade(state, 'amps')).toBe(true);
    expect(state.gear.amps).toBe(1);
    expect(state.cash).toBe(0);
  });
});
