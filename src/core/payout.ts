import { GEAR, GEAR_CATEGORIES, getDj, getSpot } from './data';
import { buzzAfterNight } from './idle';
import type { GameState, GearCategory, NightResult, NightState } from './types';

function avgVibe(night: NightState): number {
  return night.vibeSamples > 0 ? night.vibeSum / night.vibeSamples : 0;
}

function carryDamage(state: GameState, night: NightState): void {
  if (night.murBlown) state.damaged.mur = true;
}

function trackRecords(state: GameState, result: NightResult): void {
  state.bestCrowd = Math.max(state.bestCrowd, result.peakCrowd);
  state.bestPayout = Math.max(state.bestPayout, result.payout);
}

/** Sum of cuts for the unique DJs who played tonight. */
export function cutsTotal(night: NightState): number {
  const played = new Set(night.playedSets.map((s) => s.djId));
  let total = 0;
  for (const id of played) total += getDj(id).cut;
  return Math.min(0.6, total);
}

/** Sunrise reached: bank × prix libre, minus the crew's cuts. */
export function settleNight(state: GameState, night: NightState): NightResult {
  const vibe = avgVibe(night);
  const donationMult = 1 + 0.8 * vibe + 0.6 * (night.peakCrowd / night.cap);
  const gross = Math.round(night.bank * donationMult);
  const cuts = cutsTotal(night);
  const payout = Math.round(gross * (1 - cuts));
  const survivedHighHeat = night.peakHeat >= 0.8;
  const repGained = Math.round(night.peakCrowd / 10 + (survivedHighHeat ? 15 : 0) + night.repBonus);
  const won = night.spotId === 'teknival';

  state.cash += payout;
  state.rep += repGained;
  state.nights += 1;
  if (won) state.wonTeknival = true;
  carryDamage(state, night);
  const quality = Math.min(1, 0.6 * vibe + 0.5 * (night.peakCrowd / night.cap));
  buzzAfterNight(state, quality);

  const result: NightResult = {
    spotId: night.spotId,
    genreId: night.genreId,
    busted: false,
    won,
    bank: Math.round(night.bank),
    donationMult,
    gross,
    cutsTotal: cuts,
    payout,
    fine: 0,
    seized: null,
    repGained,
    peakCrowd: Math.round(night.peakCrowd),
    avgVibe: vibe,
    duration: night.t,
    lineup: night.playedSets,
  };
  trackRecords(state, result);
  return result;
}

/** Most valuable seizable gear owned (never tier 0). */
function bestSeizable(state: GameState): GearCategory | null {
  let best: GearCategory | null = null;
  let bestValue = -1;
  for (const cat of GEAR_CATEGORIES) {
    const item = GEAR[cat][state.gear[cat]];
    if (item.seizable && item.price > bestValue) {
      best = cat;
      bestValue = item.price;
    }
  }
  return best;
}

/**
 * Busted. Escalation with prior offenses: #1 lose half the bank, #2 lose it
 * all plus a fine, #3+ fine plus seizure of the priciest seizable gear.
 * Logistique softens the blow by one step the first time it would seize.
 */
export function applyBust(state: GameState, night: NightState): NightResult {
  const spot = getSpot(night.spotId);
  state.busts += 1;
  const offense = state.busts;

  let gross = 0;
  let fine = 0;
  let seized: GearCategory | null = null;

  if (offense === 1) {
    gross = Math.round(night.bank * 0.5);
  } else if (offense === 2) {
    fine = 200 * spot.tier;
  } else {
    fine = 200 * spot.tier;
    seized = bestSeizable(state);
    if (seized) state.gear[seized] = Math.max(0, state.gear[seized] - 1);
  }

  const cuts = cutsTotal(night);
  const payout = Math.round(gross * (1 - cuts));
  state.cash = Math.max(0, state.cash + payout - fine);
  const repGained = Math.round(night.peakCrowd / 20 + night.repBonus);
  state.rep += repGained;
  state.nights += 1;
  carryDamage(state, night);

  const result: NightResult = {
    spotId: night.spotId,
    genreId: night.genreId,
    busted: true,
    won: false,
    bank: Math.round(night.bank),
    donationMult: 0,
    gross,
    cutsTotal: cuts,
    payout,
    fine,
    seized,
    repGained,
    peakCrowd: Math.round(night.peakCrowd),
    avgVibe: avgVibe(night),
    duration: night.t,
    lineup: night.playedSets,
  };
  trackRecords(state, result);
  return result;
}

export function isSpotUnlocked(state: GameState, spotId: NightState['spotId']): boolean {
  return state.rep >= getSpot(spotId).repReq;
}

export function buyGearUpgrade(state: GameState, cat: GearCategory): boolean {
  const next = GEAR[cat][state.gear[cat] + 1];
  if (!next || state.cash < next.price) return false;
  state.cash -= next.price;
  state.gear[cat] = next.tier;
  return true;
}
