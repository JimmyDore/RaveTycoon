import { GEAR_CATEGORIES, ownedGear } from './data';
import type { GameState, GearCategory } from './types';

export const BUZZ_HALF_LIFE_HOURS = 24;
export const BUZZ_CAP = 1.5;
export const REPAIR_MINUTES_PER_TIER = 30;
export const RUSH_COST_PER_TIER = 80;

/**
 * Apply real-world elapsed time: buzz decays and repairs finish. No passive
 * income, ever. Crew fatigue recovers per rested night, not in real time.
 */
export function applyIdleTime(state: GameState, nowMs: number): void {
  const hours = Math.max(0, nowMs - state.lastSeen) / 3_600_000;
  state.buzz *= Math.pow(0.5, hours / BUZZ_HALF_LIFE_HOURS);
  if (state.buzz < 0.001) state.buzz = 0;
  state.repairs = state.repairs.filter((job) => {
    if (nowMs >= job.readyAt) {
      state.damaged[job.category] = false;
      return false;
    }
    return true;
  });
  state.lastSeen = nowMs;
}

/** Word of mouth after a night; quality in [0, 1]. */
export function buzzAfterNight(state: GameState, quality: number): void {
  state.buzz = Math.min(BUZZ_CAP, state.buzz + 0.1 + 0.5 * Math.max(0, quality));
}

export function repairDurationMs(state: GameState, cat: GearCategory): number {
  const tier = Math.max(1, state.gear[cat]);
  return tier * REPAIR_MINUTES_PER_TIER * 60_000;
}

export function rushCost(state: GameState, cat: GearCategory): number {
  return Math.max(1, state.gear[cat]) * RUSH_COST_PER_TIER;
}

export function startRepair(state: GameState, cat: GearCategory, nowMs: number): boolean {
  if (!state.damaged[cat]) return false;
  if (state.repairs.some((j) => j.category === cat)) return false;
  state.repairs.push({ category: cat, readyAt: nowMs + repairDurationMs(state, cat) });
  return true;
}

export function rushRepair(state: GameState, cat: GearCategory): boolean {
  if (!state.damaged[cat]) return false;
  const cost = rushCost(state, cat);
  if (state.cash < cost) return false;
  state.cash -= cost;
  state.damaged[cat] = false;
  state.repairs = state.repairs.filter((j) => j.category !== cat);
  return true;
}

export function damagedCategories(state: GameState): GearCategory[] {
  return GEAR_CATEGORIES.filter((c) => state.damaged[c]);
}

export function gearName(state: GameState, cat: GearCategory): string {
  return ownedGear(state, cat).nom;
}
