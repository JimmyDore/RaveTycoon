import { getDj, SPOTS } from './data';
import { isEnGardeAVue } from './crew';
import { isSpotAvailable } from './payout';
import { buildRegionRules } from './regions';
import { NIGHT_PHASES, type NightPhaseId } from './phases';
import { mulberry32 } from './rng';
import type { Intensity } from './intensity';
import type { GameState, GenreId, NightState, SpotDef, SpotId } from './types';

/**
 * Les nuits spéciales (story D) : à la prépa, ~1 nuit sur 3 dès rep ≥ 12, une
 * offre acceptable ou refusable, valable cette nuit seulement. Le tirage est
 * seedé par le compteur de nuits : déterministe, stable au re-render.
 */

/** Contraintes résolues d'un contrat (les ids concrets, posées sur la nuit). */
export interface SpecialConstraints {
  /** seul ce genre joue ce soir — verrouille le choix des DJs à la prépa */
  genreImpose?: GenreId;
  /** cran maximal autorisé (teuf privée : 'peak' — jamais RINSE) */
  maxIntensity?: Intensity;
  /** spot imposé — verrouille le choix du spot à la prépa */
  spotImpose?: SpotId;
  /** plafond de foule, fraction de la cap (teuf privée : 0.6) */
  crowdCap?: number;
  /** clause « pas de descente » : le seuil atteint rompt le contrat */
  noDescente?: boolean;
}

export interface SpecialRewards {
  /** cash d'avance, crédité à l'acceptation (résolu au tirage) */
  cashUpfront?: number;
  /** × sur la rep totale de la nuit (anniversaire 2, teuf privée 0) */
  repMult?: number;
  /** haute : attente +0.15 et tolérance −0.05 ; puriste : tolérance −0.08 */
  attenteMode?: 'haute' | 'puriste';
  /** nuit à thème : payoff des drops ×1.4 */
  dropPayoffMult?: number;
  /** nuit à thème : buvette ×1.3 */
  barMult?: number;
}

export interface SpecialNightDef {
  id: string;
  nom: string;
  pitch: string;
  icon: string;
  /** le contrat tire un genre dans le crew présent (teuf privée, nuit à thème) */
  drawsGenre?: boolean;
  /** le contrat tire un spot jouable (teuf privée) */
  drawsSpot?: boolean;
  constraints: Omit<SpecialConstraints, 'genreImpose' | 'spotImpose'>;
  rewards: Omit<SpecialRewards, 'cashUpfront'>;
  weight: (state: GameState) => number;
}

/** Offre persistée sur GameState — les ids tirés sont résolus ici. */
export interface SpecialOfferState {
  id: string;
  /** la nuit (state.nights) pour laquelle l'offre vaut — périmée sinon */
  night: number;
  accepted: boolean;
  declined: boolean;
  genreId?: GenreId;
  spotId?: SpotId;
  /** crédité à l'acceptation ; remboursé à 60 % si le contrat casse */
  cashUpfront?: number;
}

export const SPECIAL_OFFER_P = 0.35;
export const SPECIAL_MIN_REP = 12;
/** rupture de contrat : on rembourse 60 % de l'avance */
export const BREACH_REFUND = 0.6;

/**
 * Cash d'avance de la teuf privée : « ×3 le potentiel du spot », lu à l'échelle
 * de la caution (cap × priceMult) — ×3 de potentialBar imprimerait 30 000 € au
 * hangar et casserait l'économie du chantier 2.
 */
export function teufPriveeCash(spot: SpotDef): number {
  return Math.round(3 * spot.cap * spot.priceMult);
}

export const SPECIAL_NIGHTS: SpecialNightDef[] = [
  {
    id: 'soundclash',
    nom: 'Soundclash',
    icon: '🥊',
    pitch:
      'Un crew rival monte son mur en face. Quatre phases, score de vague contre score de vague — gagnes-en deux et leur headliner changera de camp.',
    constraints: {},
    // victoire ×1.5 résolue au règlement (resolveSoundclash) — rien de statique ici
    rewards: {},
    weight: (state) => (state.rep >= 30 ? 1 : 0),
  },
  {
    id: 'teuf-privee',
    nom: 'Teuf privée',
    icon: '🤫',
    pitch:
      'Un collectif te paie d’avance pour une nuit sur mesure : leur son, pas de vagues, pas de bleus. Contrat rompu = remboursement de 60 %.',
    drawsGenre: true,
    drawsSpot: true,
    constraints: { maxIntensity: 'peak', crowdCap: 0.6, noDescente: true },
    rewards: { repMult: 0 },
    weight: () => 1,
  },
  {
    id: 'anniversaire',
    nom: 'Anniversaire de la scène',
    icon: '🎂',
    pitch:
      'Dix ans de la scène locale : tout le monde regarde. La rep compte double, mais la foule attend fort et pardonne peu.',
    constraints: {},
    rewards: { repMult: 2, attenteMode: 'haute' },
    weight: () => 1,
  },
  {
    id: 'nuit-a-theme',
    nom: 'Nuit à thème',
    icon: '🎵',
    pitch:
      'Une nuit mono-genre pour les puristes : tolérance étroite, mais les drops paient +40 % et la buvette tourne ×1.3.',
    drawsGenre: true,
    constraints: {},
    rewards: { attenteMode: 'puriste', dropPayoffMult: 1.4, barMult: 1.3 },
    weight: () => 1,
  },
];

export function getSpecial(id: string): SpecialNightDef {
  const def = SPECIAL_NIGHTS.find((s) => s.id === id);
  if (!def) throw new Error(`unknown special night: ${id}`);
  return def;
}

/** Genres jouables ce soir : les genres des DJs du crew hors garde à vue. */
function crewGenres(state: GameState): GenreId[] {
  return [
    ...new Set(
      state.crew.filter((d) => !isEnGardeAVue(state, d.id)).map((d) => getDj(d.id).genre),
    ),
  ];
}

/**
 * Tire l'offre du soir. Déterministe : la graine est le compteur de nuits.
 * Le trait régional « fêtes votives » double la probabilité (rewire fait).
 */
export function drawSpecialOffer(state: GameState): SpecialOfferState | null {
  if (state.rep < SPECIAL_MIN_REP) return null;
  const rng = mulberry32((((state.nights + 1) * 2654435761) ^ 0x5bec1a1) >>> 0);
  const p = Math.min(0.9, SPECIAL_OFFER_P * buildRegionRules(state.region).specialNightWeightMult);
  if (rng() >= p) return null;
  const genres = crewGenres(state);
  const spots = SPOTS.filter((s) => s.id !== 'teknival' && isSpotAvailable(state, s.id));
  const pool = SPECIAL_NIGHTS.filter(
    (s) => s.weight(state) > 0 && (!s.drawsGenre || genres.length > 0) && (!s.drawsSpot || spots.length > 0),
  );
  if (pool.length === 0) return null;
  const weights = pool.map((s) => s.weight(state));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  let def = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      def = pool[i];
      break;
    }
  }
  const offer: SpecialOfferState = {
    id: def.id,
    night: state.nights,
    accepted: false,
    declined: false,
  };
  if (def.drawsGenre) offer.genreId = genres[Math.floor(rng() * genres.length)];
  if (def.drawsSpot) {
    const spot = spots[Math.floor(rng() * spots.length)];
    offer.spotId = spot.id;
    offer.cashUpfront = teufPriveeCash(spot);
  }
  return offer;
}

/** L'offre du soir, tirée une seule fois par nuit (stable au re-render). */
export function ensureSpecialOffer(state: GameState): SpecialOfferState | null {
  if (state.specialOffer && state.specialOffer.night === state.nights) return state.specialOffer;
  state.specialOffer = drawSpecialOffer(state);
  return state.specialOffer;
}

/** Accepter : le contrat est signé, le cash d'avance tombe tout de suite. */
export function acceptSpecialOffer(state: GameState): boolean {
  const offer = state.specialOffer;
  if (!offer || offer.night !== state.nights || offer.accepted || offer.declined) return false;
  offer.accepted = true;
  if (offer.cashUpfront) state.cash += offer.cashUpfront;
  return true;
}

export function declineSpecialOffer(state: GameState): boolean {
  const offer = state.specialOffer;
  if (!offer || offer.night !== state.nights || offer.accepted || offer.declined) return false;
  offer.declined = true;
  return true;
}

/** Le contrat actif d'une nuit : la def résolue (ids concrets), plus l'état de rupture. */
export interface ActiveSpecial {
  id: string;
  nom: string;
  icon: string;
  constraints: SpecialConstraints;
  rewards: SpecialRewards;
  /** clause cassée (descente déclenchée sous noDescente) */
  breached: boolean;
  /** soundclash : score du rival par phase (tiré au lancement) */
  rival?: Record<NightPhaseId, number>;
}

/** victoire = battre le rival sur ≥ 2 phases sur 4 */
export const CLASH_PHASES_TO_WIN = 2;
export const CLASH_WIN_REP_MULT = 1.5;
export const CLASH_LOSS_BUZZ_MULT = 0.5;

/**
 * Tire le rival du soir : un score de vague par phase, calibré sur le tier du
 * spot (tier 1 : 0.37–0.57, tier 6 : 0.72–0.92). rng = flux dédié de la nuit.
 */
export function drawRival(spotTier: number, rng: () => number): Record<NightPhaseId, number> {
  const rival = {} as Record<NightPhaseId, number>;
  for (const p of NIGHT_PHASES) {
    rival[p.id] = Math.min(0.95, 0.3 + 0.07 * spotTier + rng() * 0.2);
  }
  return rival;
}

/** Compare le waveScore moyen de chaque phase au rival. Phase non jouée = perdue. */
export function resolveSoundclash(night: NightState): { phasesWon: number; won: boolean } {
  const rival = night.special?.rival;
  if (!rival) return { phasesWon: 0, won: false };
  let phasesWon = 0;
  for (const p of NIGHT_PHASES) {
    const t = night.phaseWaveT[p.id];
    const avg = t > 0 ? night.phaseWaveSum[p.id] / t : 0;
    if (avg > rival[p.id]) phasesWon += 1;
  }
  return { phasesWon, won: phasesWon >= CLASH_PHASES_TO_WIN };
}

/** Construit le contrat de la nuit depuis l'offre acceptée (null sinon). */
export function activeSpecial(state: GameState): ActiveSpecial | null {
  const offer = state.specialOffer;
  if (!offer || !offer.accepted || offer.night !== state.nights) return null;
  const def = getSpecial(offer.id);
  return {
    id: def.id,
    nom: def.nom,
    icon: def.icon,
    constraints: { ...def.constraints, genreImpose: offer.genreId, spotImpose: offer.spotId },
    rewards: { ...def.rewards, cashUpfront: offer.cashUpfront },
    breached: false,
  };
}
