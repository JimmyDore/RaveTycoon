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

// --- le gain de ⭐ Légende, calculé au moment du départ ---------------------------

/** ⭐ par victoire au Teknival sur la tournée. */
export const LEGENDE_PER_TEKNIVAL = 3;

/**
 * legende = floor(rep / 100) + 3 × victoires Teknival cette tournée
 *         + 1 par « mur tenu » + 1 par arc mené à terme.
 *
 * RÉVISION CHANTIER 1: les « murs tenus » (tag légende, Story C) et les arcs
 * n'existent pas encore — leurs hooks restent à 0 ici. Quand le chantier 1
 * pose ses compteurs sur GameState, les brancher dans ces deux constantes.
 */
export function computeLegende(state: GameState): number {
  const mursTenus = 0;
  const arcsTermines = 0;
  return (
    Math.floor(state.rep / 100) +
    state.tour.teknivalWins * LEGENDE_PER_TEKNIVAL +
    mursTenus +
    arcsTermines
  );
}
