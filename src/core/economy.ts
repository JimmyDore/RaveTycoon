import { ownedGear } from './data';
import type { GameState, NightState, SpotDef } from './types';

/** € banked per teufeur per second at the buvette (moved here from night.ts). */
export const BAR_DRIP = 0.05;

export type BarStock = 'leger' | 'normal' | 'large';

/** Fraction of the night's potential bar takings paid up front (on the gross). */
export const BAR_STOCK_COST: Record<BarStock, number> = { leger: 0, normal: 0.15, large: 0.3 };
/** Fraction of the potential bar takings the stock can actually serve. */
export const BAR_STOCK_CAP: Record<BarStock, number> = { leger: 0.5, normal: 0.8, large: 1.1 };

/** €/minute of generator fuel. */
export const ESSENCE_RATE = 2;

/** Full-crowd bar takings if the floor stayed packed all night. */
export function potentialBar(spot: SpotDef, cap: number): number {
  return cap * BAR_DRIP * spot.priceMult * spot.duration;
}

/** Fuel for the night — free on the tier-0 « groupe poussif » (no-softlock). */
export function essenceCost(state: GameState, night: NightState): number {
  if (state.gear.groupe === 0) return 0;
  if (night.t <= 0) return 0;
  // intensité moyenne pondérée temps, accumulée par tickNight (chill 0.25 … rinse 1)
  const avg = night.intensitySum / night.t;
  return Math.round(ESSENCE_RATE * (night.t / 60) * (0.5 + avg));
}

/** Spot deposit: cap × 1 €, tiers ≥ 3 only. Paid from the bank, by choice. */
export function cautionCost(state: GameState, spot: SpotDef): number {
  if (spot.tier < 3) return 0;
  // logistique voie Mobilité : cautions réduites
  const mult = ownedGear(state, 'logistique').effects?.cautionMult ?? 1;
  return Math.round(spot.cap * mult);
}

/** Bar restock fee for the chosen stock level, charged on the gross. */
export function restockCost(spot: SpotDef, cap: number, barStock: BarStock): number {
  return Math.round(BAR_STOCK_COST[barStock] * potentialBar(spot, cap));
}
