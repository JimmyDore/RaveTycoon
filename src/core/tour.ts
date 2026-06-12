import { getPerk } from './data';
import { applyRegionLegende } from './regions';
import type { RegionState } from './regions';
import { newGame } from './save';
import type { DjState, GameState } from './types';

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
 *         + 1 par « mur tenu » (story C) + 1 par arc mené à terme (story E).
 */
export function computeLegende(state: GameState): number {
  const mursTenus = state.mursTenus;
  const arcsTermines = state.arcsCompleted.length;
  const base =
    Math.floor(state.rep / 100) +
    state.tour.teknivalWins * LEGENDE_PER_TEKNIVAL +
    mursTenus +
    arcsTermines;
  // le multiplicateur de la région de la tournée écoulée — ×1 en tournée 1
  return applyRegionLegende(base, state.region, state.tour.perks);
}

// --- le départ en tournée ---------------------------------------------------------

const FOUNDER_ID = 'tonton';

/**
 * Applique les perks « état initial » sur une partie fraîche. LE point unique :
 * aucun `if perk` ailleurs dans la sim — les perks modifient l'état de départ
 * ou des lookups de données (crew.ts, payout.ts), jamais le tick.
 */
export function applyPerks(state: GameState): void {
  if (hasPerk(state, 'camion-amenage')) state.cash = 1500;
  if (hasPerk(state, 'reputation-precede')) state.rep = 30;
  if (hasPerk(state, 'matos-planque')) {
    state.gear = { platines: 1, mur: 1, groupe: 1, lumieres: 1, logistique: 1 };
  }
}

/**
 * Partir en tournée : retourne l'état de la tournée suivante.
 *
 * Reset : caisse, matos (→ starter, sauf perk — voies de gear comprises), rep,
 * buzz, casier (busts), dégâts, réparations, roster (sauf fondateur + vétérans),
 * wonTeknival.
 * Conservé : ⭐ Légende (cumulée avec le gain du départ), perks, n° de
 * tournée, pseudo, nights et records all-time (le leaderboard track des maxima).
 *
 * La garde à vue, le casier et les murs tenus ne survivent pas au départ : le
 * newGame frais les remet à zéro (« Le casier — les bleus t'oublient »).
 * Les arcs en cours, les effets temporaires, le casier, la garde à vue et
 * l'offre spéciale ne survivent pas au départ : le `newGame` frais les remet
 * à leurs défauts vides (vérifié par test/tour.test.ts).
 */
export function departOnTour(
  state: GameState,
  veteranIds: string[] = [],
  region: RegionState | null = null,
): GameState {
  const kept = [...new Set(veteranIds)]
    .filter((id) => id !== FOUNDER_ID && state.crew.some((d) => d.id === id))
    .slice(0, maxVeterans(state));

  const fresh = newGame(state.lastSeen);
  fresh.tour = {
    number: state.tour.number + 1,
    legende: state.tour.legende + computeLegende(state),
    perks: [...state.tour.perks],
    veteranIds: kept,
    teknivalWins: 0,
  };

  // le fondateur vient toujours — et garde son niveau ; les vétérans aussi,
  // fatigue rincée (la route repose tout le monde)
  const founder = state.crew.find((d) => d.id === FOUNDER_ID);
  const veterans: DjState[] = [];
  for (const id of kept) {
    const member = state.crew.find((d) => d.id === id);
    if (member) veterans.push({ ...member, fatigue: 0 });
  }
  fresh.crew = founder ? [{ ...founder, fatigue: 0 }] : fresh.crew;
  fresh.crew.push(...veterans);

  // stats all-time conservées — le leaderboard est inchangé
  fresh.pseudo = state.pseudo;
  fresh.nights = state.nights;
  fresh.bestCrowd = state.bestCrowd;
  fresh.bestPayout = state.bestPayout;

  // la région choisie part sur la nouvelle tournée — le gain de ⭐ a déjà été
  // calculé ci-dessus (computeLegende) sur la région de la tournée écoulée
  fresh.region = region ?? undefined;

  applyPerks(fresh);
  return fresh;
}
