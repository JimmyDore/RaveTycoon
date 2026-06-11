import { GEAR, getGenre, getSpot } from './data';
import { mulberry32 } from './rng';
import type {
  Controls,
  GameState,
  GenreId,
  RaveEvent,
  RaveState,
  SpotId,
} from './types';

const BROWNOUT_DURATION = 1.5;
const BROWNOUT_COOLDOWN = 4;
/** heat decays when the volume sits under this threshold */
const HEAT_EASE_THRESHOLD = 0.35;
const HEAT_DECAY = 0.012;
/** € per raver per second before the spot price multiplier */
const BAR_DRIP = 0.05;
/** seconds of full-tilt overdrive needed to blow a channel */
const STRESS_RATE = 1 / 12;
/** degraded output multiplier once a channel is blown */
const BLOWN_OUTPUT = 0.5;
/** output multiplier when starting the night on damaged, unrepaired gear */
const DAMAGED_HEADROOM = 0.6;

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function createRave(
  state: GameState,
  spotId: SpotId,
  genreId: GenreId,
  seed: number,
): RaveState {
  const spot = getSpot(spotId);
  const amp = GEAR.amps[state.gear.amps];
  const sub = GEAR.subs[state.gear.subs];
  const gen = GEAR.gen[state.gear.gen];
  return {
    spotId,
    genreId,
    t: 0,
    duration: spot.duration,
    crowd: 0,
    peakCrowd: 0,
    vibe: 0.4,
    vibeSum: 0,
    vibeSamples: 0,
    heat: 0,
    peakHeat: 0,
    bank: 0,
    ampStress: 0,
    subStress: 0,
    genStress: 0,
    ampBlown: false,
    subBlown: false,
    brownoutT: 0,
    brownoutCooldown: 0,
    ended: false,
    busted: false,
    sunrise: false,
    ampHeadroom: amp.value * (state.damaged.amps ? DAMAGED_HEADROOM : 1),
    subHeadroom: sub.value * (state.damaged.subs ? DAMAGED_HEADROOM : 1),
    genCapacity: gen.value * spot.genCapacityMult * (state.damaged.gen ? DAMAGED_HEADROOM : 1),
    rng: mulberry32(seed),
  };
}

/** How much the current volume exceeds amp headroom, in [0, 1]. Drives audible distortion. */
export function clippingAmount(rave: RaveState, controls: Controls): number {
  return clamp((controls.volume - rave.ampHeadroom) / 0.45, 0, 1);
}

/**
 * Advance the night by dt seconds. Mutates `rave`, returns the events that
 * fired during this tick. `buzz` and `rep` shape the crowd arrival rate.
 */
export function tickRave(
  rave: RaveState,
  controls: Controls,
  dt: number,
  buzz = 0,
  rep = 0,
): RaveEvent[] {
  if (rave.ended) return [];
  const events: RaveEvent[] = [];
  const spot = getSpot(rave.spotId);
  const genre = getGenre(rave.genreId);

  const v = clamp(controls.volume, 0, 1);
  const b = clamp(controls.bass, 0, 1);
  const p = clamp(controls.power, 0, 1);

  // --- power budget -------------------------------------------------------
  const supply = rave.genCapacity * p;
  const demand = 0.6 * v + 0.8 * b;
  rave.brownoutCooldown = Math.max(0, rave.brownoutCooldown - dt);
  if (demand > supply && rave.brownoutT <= 0 && rave.brownoutCooldown <= 0) {
    rave.brownoutT = BROWNOUT_DURATION;
    rave.brownoutCooldown = BROWNOUT_DURATION + BROWNOUT_COOLDOWN;
    events.push({ type: 'brownout' });
  }
  // running the generator close to its actual load limit wears it out → sputter
  const utilization = supply > 0 ? demand / supply : 2;
  if (utilization > 0.9) {
    rave.genStress = clamp(rave.genStress + Math.min(utilization - 0.9, 0.5) * dt * 0.35, 0, 1);
    if (rave.genStress >= 1 && rave.brownoutT <= 0 && rave.brownoutCooldown <= 0 && rave.rng() < 0.04 * dt * 10) {
      rave.brownoutT = BROWNOUT_DURATION;
      rave.brownoutCooldown = BROWNOUT_DURATION + BROWNOUT_COOLDOWN;
      events.push({ type: 'brownout' });
    }
  } else {
    rave.genStress = Math.max(0, rave.genStress - dt * 0.02);
  }
  const browned = rave.brownoutT > 0;
  if (browned) rave.brownoutT -= dt;

  // --- gear stress & blowing ----------------------------------------------
  const overVol = Math.max(0, v - rave.ampHeadroom);
  if (overVol > 0 && !rave.ampBlown) {
    rave.ampStress += overVol * STRESS_RATE * dt * (1 / 0.45) * 4;
    if (rave.ampStress >= 1) {
      rave.ampBlown = true;
      events.push({ type: 'blown-amp' });
    }
  } else if (!rave.ampBlown) {
    rave.ampStress = Math.max(0, rave.ampStress - dt * 0.01);
  }
  const overBass = Math.max(0, b - rave.subHeadroom);
  if (overBass > 0 && !rave.subBlown) {
    rave.subStress += overBass * STRESS_RATE * dt * (1 / 0.45) * 4;
    if (rave.subStress >= 1) {
      rave.subBlown = true;
      events.push({ type: 'blown-sub' });
    }
  } else if (!rave.subBlown) {
    rave.subStress = Math.max(0, rave.subStress - dt * 0.01);
  }

  // effective sound output after damage and dropouts
  const effV = browned ? 0 : v * (rave.ampBlown ? BLOWN_OUTPUT : 1);
  const effB = browned ? 0 : b * (rave.subBlown ? BLOWN_OUTPUT : 1);

  // --- crowd ----------------------------------------------------------------
  const appeal = browned ? 0 : clamp(0.2 + 0.9 * effV + 0.7 * effB, 0, 1.6);
  // dead silence attracts nobody
  const arrivalGate = effV > 0.05 ? 1 : 0;
  const arrival =
    spot.arrival * genre.arrival * (1 + buzz) * (1 + rep * 0.002) * appeal * arrivalGate;
  let leaveMult = 1;
  if (browned) leaveMult += 3;
  if (rave.ampBlown) leaveMult += 1;
  if (rave.subBlown) leaveMult += 1;
  if (effV < 0.15) leaveMult += 2;
  const leaving = rave.crowd * genre.churn * (1 - 0.5 * effB) * leaveMult;
  rave.crowd = clamp(rave.crowd + (arrival - leaving) * dt, 0, spot.cap);
  rave.peakCrowd = Math.max(rave.peakCrowd, rave.crowd);

  // --- vibe -----------------------------------------------------------------
  const clip = clippingAmount(rave, controls);
  let vibeTarget = clamp(0.25 + 0.55 * effV + 0.45 * effB, 0, 1);
  if (browned) vibeTarget = 0;
  vibeTarget -= 0.3 * clip;
  if (rave.ampBlown || rave.subBlown) vibeTarget -= 0.15;
  vibeTarget = clamp(vibeTarget, 0, 1);
  const vibeRate = vibeTarget > rave.vibe ? 0.08 : 0.25;
  rave.vibe = clamp(rave.vibe + (vibeTarget - rave.vibe) * vibeRate * dt * 3, 0, 1);
  rave.vibeSum += rave.vibe * dt;
  rave.vibeSamples += dt;

  // --- heat -----------------------------------------------------------------
  const heatRate = spot.heatBuild * genre.heatMult * (0.7 * v * v + 0.3 * b);
  rave.heat += heatRate * dt;
  if (v < HEAT_EASE_THRESHOLD) rave.heat -= HEAT_DECAY * dt;
  rave.heat = clamp(rave.heat, 0, 1);
  rave.peakHeat = Math.max(rave.peakHeat, rave.heat);
  if (rave.heat >= 1) {
    rave.ended = true;
    rave.busted = true;
    events.push({ type: 'bust' });
    return events;
  }

  // --- bar drip ---------------------------------------------------------------
  rave.bank += rave.crowd * BAR_DRIP * spot.priceMult * dt;

  // --- clock ------------------------------------------------------------------
  rave.t += dt;
  if (rave.t >= rave.duration) {
    rave.ended = true;
    rave.sunrise = true;
    events.push({ type: 'sunrise' });
  }
  return events;
}
