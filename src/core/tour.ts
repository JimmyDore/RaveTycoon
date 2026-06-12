import { getPerk } from './data';
import type { GameState } from './types';

// --- l'Héritage : perks permanents ---------------------------------------------

export function hasPerk(state: GameState, perkId: string): boolean {
  return state.tour.perks.includes(perkId);
}

/** Nombre de stacks possédés (un perk unique vaut 0 ou 1). */
export function perkCount(state: GameState, perkId: string): number {
  return state.tour.perks.filter((p) => p === perkId).length;
}

export function canBuyPerk(state: GameState, perkId: string): boolean {
  const def = getPerk(perkId);
  return perkCount(state, perkId) < def.max && state.tour.legende >= def.cost;
}

/** Achat définitif : la ⭐ part, le perk reste pour toutes les tournées. */
export function buyPerk(state: GameState, perkId: string): boolean {
  if (!canBuyPerk(state, perkId)) return false;
  state.tour.legende -= getPerk(perkId).cost;
  state.tour.perks.push(perkId);
  return true;
}

/** Vétérans emmenables au départ : 1 de base, +1 par stack de « famille ». */
export function maxVeterans(state: GameState): number {
  return 1 + perkCount(state, 'famille');
}
