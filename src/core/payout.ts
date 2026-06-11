import { GEAR, GEAR_CATEGORIES, getSpot } from './data';
import type { GameState, GearCategory, NightResult, RaveState } from './types';
import { buzzAfterNight } from './idle';

function avgVibe(rave: RaveState): number {
  return rave.vibeSamples > 0 ? rave.vibeSum / rave.vibeSamples : 0;
}

function carryDamage(state: GameState, rave: RaveState): void {
  if (rave.ampBlown) state.damaged.amps = true;
  if (rave.subBlown) state.damaged.subs = true;
  if (rave.genStress >= 1) state.damaged.gen = true;
}

function trackRecords(state: GameState, result: NightResult): void {
  state.bestCrowd = Math.max(state.bestCrowd, Math.round(result.peakCrowd));
  state.bestPayout = Math.max(state.bestPayout, result.payout);
}

/** Sunrise reached: bank × donation multiplier, reputation, buzz. */
export function settleNight(state: GameState, rave: RaveState): NightResult {
  const spot = getSpot(rave.spotId);
  const vibe = avgVibe(rave);
  const donationMult = 1 + 0.8 * vibe + 0.6 * (rave.peakCrowd / spot.cap);
  const payout = Math.round(rave.bank * donationMult);
  const survivedHighHeat = rave.peakHeat >= 0.8;
  const repGained = Math.round(rave.peakCrowd / 10 + (survivedHighHeat ? 15 : 0));
  const won = rave.spotId === 'teknival';

  state.cash += payout;
  state.rep += repGained;
  state.nights += 1;
  if (won) state.wonTeknival = true;
  carryDamage(state, rave);
  const quality = Math.min(1, 0.6 * vibe + 0.5 * (rave.peakCrowd / spot.cap));
  buzzAfterNight(state, quality);

  const result: NightResult = {
    spotId: rave.spotId,
    genreId: rave.genreId,
    busted: false,
    won,
    bank: Math.round(rave.bank),
    donationMult,
    payout,
    fine: 0,
    seized: null,
    repGained,
    peakCrowd: Math.round(rave.peakCrowd),
    avgVibe: vibe,
    duration: rave.t,
  };
  trackRecords(state, result);
  return result;
}

/** Pick the most valuable seizable gear the player owns (never tier 0). */
function bestSeizable(state: GameState): GearCategory | null {
  let best: GearCategory | null = null;
  let bestValue = -1;
  for (const cat of GEAR_CATEGORIES) {
    const tier = state.gear[cat];
    const item = GEAR[cat][tier];
    if (item.seizable && item.price > bestValue) {
      best = cat;
      bestValue = item.price;
    }
  }
  return best;
}

/**
 * Cops shut it down. Consequences escalate with the number of prior busts:
 * #1 lose half the bank, #2 lose the bank plus a fine, #3+ fine plus gear
 * seizure. Tier-0 starter gear can never be seized — no softlock.
 */
export function applyBust(state: GameState, rave: RaveState): NightResult {
  const spot = getSpot(rave.spotId);
  state.busts += 1;
  const offense = state.busts;

  let payout = 0;
  let fine = 0;
  let seized: GearCategory | null = null;

  if (offense === 1) {
    payout = Math.round(rave.bank * 0.5);
  } else if (offense === 2) {
    payout = 0;
    fine = 200 * spot.tier;
  } else {
    payout = 0;
    fine = 200 * spot.tier;
    seized = bestSeizable(state);
    if (seized) state.gear[seized] = Math.max(0, state.gear[seized] - 1);
  }

  state.cash = Math.max(0, state.cash + payout - fine);
  // a legendary bust still makes the rounds in the scene
  const repGained = Math.round(rave.peakCrowd / 20);
  state.rep += repGained;
  state.nights += 1;
  carryDamage(state, rave);

  const result: NightResult = {
    spotId: rave.spotId,
    genreId: rave.genreId,
    busted: true,
    won: false,
    bank: Math.round(rave.bank),
    donationMult: 0,
    payout,
    fine,
    seized,
    repGained,
    peakCrowd: Math.round(rave.peakCrowd),
    avgVibe: avgVibe(rave),
    duration: rave.t,
  };
  trackRecords(state, result);
  return result;
}

export function isSpotUnlocked(state: GameState, spotId: RaveState['spotId']): boolean {
  return state.rep >= getSpot(spotId).repReq;
}

/** Buy the next tier in a category. Returns false when maxed or unaffordable. */
export function buyGearUpgrade(state: GameState, cat: GearCategory): boolean {
  const next = GEAR[cat][state.gear[cat] + 1];
  if (!next || state.cash < next.price) return false;
  state.cash -= next.price;
  state.gear[cat] = next.tier;
  return true;
}
