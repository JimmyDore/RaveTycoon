import { describe, it, expect } from 'vitest';
import { settleNight, applyBust, isSpotUnlocked, buyGearUpgrade, cutsTotal } from '../src/core/payout';
import { createNight } from '../src/core/night';
import { newGame } from '../src/core/save';
import { recruitDj } from '../src/core/crew';
import { GEAR, getDj } from '../src/core/data';
import type { GameState, NightState } from '../src/core/types';

function finishedNight(state: GameState, overrides: Partial<NightState> = {}): NightState {
  const night = createNight(state, 'champ', ['tonton'], 1);
  Object.assign(night, {
    t: 180,
    phase: 'ended',
    sunrise: true,
    bank: 100,
    peakCrowd: 30,
    vibeSum: 0.8 * 180,
    vibeSamples: 180,
    peakHeat: 0.4,
    playedSets: [
      { djId: 'tonton', brief: 'normal' },
      { djId: 'tonton', brief: 'normal' },
    ],
  });
  return Object.assign(night, overrides);
}

describe('settleNight', () => {
  it('applies prix libre then subtracts each unique DJ cut once', () => {
    const state = newGame();
    const night = finishedNight(state);
    const result = settleNight(state, night);
    // cap = 60 * 0.6 (mur tier 0) = 36 → 1 + 0.8*0.8 + 0.6*(30/36)
    expect(result.donationMult).toBeCloseTo(2.14, 2);
    expect(result.gross).toBe(214);
    expect(result.cutsTotal).toBeCloseTo(getDj('tonton').cut, 5);
    expect(result.payout).toBe(Math.round(214 * 0.95));
    expect(state.cash).toBe(result.payout);
  });

  it('sums cuts across distinct DJs in the lineup', () => {
    const state = newGame();
    state.rep = 100;
    recruitDj(state, 'gamine');
    const night = finishedNight(state, {
      playedSets: [
        { djId: 'tonton', brief: 'normal' },
        { djId: 'gamine', brief: 'pousser' },
      ],
    });
    expect(cutsTotal(state, night)).toBeCloseTo(0.15, 5);
  });

  it('marks the teknival sunrise as the win moment', () => {
    const state = newGame();
    state.rep = 1000;
    const night = createNight(state, 'teknival', ['tonton'], 2);
    Object.assign(night, {
      t: 600,
      phase: 'ended',
      sunrise: true,
      bank: 5000,
      peakCrowd: 900,
      vibeSum: 540,
      vibeSamples: 600,
      playedSets: [{ djId: 'tonton', brief: 'normal' }],
    });
    const result = settleNight(state, night);
    expect(result.won).toBe(true);
    expect(state.wonTeknival).toBe(true);
  });

  it('credits event reputation bonuses', () => {
    const state = newGame();
    const night = finishedNight(state, { repBonus: 12 });
    const result = settleNight(state, night);
    expect(result.repGained).toBeGreaterThanOrEqual(12);
  });

  it('rests crew who sat out the night; players who played keep their toll', () => {
    const state = newGame();
    state.rep = 8;
    recruitDj(state, 'gamine');
    const [tonton, gamine] = state.crew;
    tonton.fatigue = 0.8; // plays in finishedNight default lineup
    gamine.fatigue = 0.9; // benched
    settleNight(state, finishedNight(state));
    expect(tonton.fatigue).toBe(0.8);
    expect(gamine.fatigue).toBeCloseTo(0.4, 5);
  });
});

describe('applyBust escalation', () => {
  it('first bust: half the bank, minus cuts', () => {
    const state = newGame();
    const result = applyBust(state, finishedNight(state, { sunrise: false, busted: true }));
    expect(result.gross).toBe(50);
    expect(result.payout).toBe(Math.round(50 * 0.95));
    expect(result.fine).toBe(0);
    expect(result.seized).toBeNull();
  });

  it('second bust: lose the bank and pay a fine', () => {
    const state = newGame();
    state.busts = 1;
    state.cash = 1000;
    const result = applyBust(state, finishedNight(state, { sunrise: false, busted: true }));
    expect(result.payout).toBe(0);
    expect(result.fine).toBe(200);
    expect(state.cash).toBe(800);
  });

  it('third bust: seizes the priciest seizable gear, never tier 0', () => {
    const state = newGame();
    state.busts = 2;
    state.gear.mur = 2;
    state.gear.platines = 1;
    const result = applyBust(state, finishedNight(state, { sunrise: false, busted: true }));
    expect(result.seized).toBe('mur');
    expect(state.gear.mur).toBe(1);
  });

  it('never seizes when only starter gear is owned (no softlock)', () => {
    const state = newGame();
    state.busts = 5;
    const result = applyBust(state, finishedNight(state, { sunrise: false, busted: true }));
    expect(result.seized).toBeNull();
  });

  it('never lets cash go negative', () => {
    const state = newGame();
    state.busts = 1;
    state.cash = 50;
    applyBust(state, finishedNight(state, { sunrise: false, busted: true, bank: 0 }));
    expect(state.cash).toBe(0);
  });

  it('still rests the benched crew even when the night is busted', () => {
    const state = newGame();
    state.rep = 8;
    recruitDj(state, 'gamine');
    const gamine = state.crew[1];
    gamine.fatigue = 0.9; // benched (default lineup is tonton only)
    applyBust(state, finishedNight(state, { sunrise: false, busted: true }));
    expect(gamine.fatigue).toBeCloseTo(0.4, 5);
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

  it('buys gear upgrades with cash across the five categories', () => {
    const state = newGame();
    expect(buyGearUpgrade(state, 'lumieres')).toBe(false);
    state.cash = GEAR.lumieres[1].price;
    expect(buyGearUpgrade(state, 'lumieres')).toBe(true);
    expect(state.gear.lumieres).toBe(1);
    expect(state.cash).toBe(0);
  });
});
