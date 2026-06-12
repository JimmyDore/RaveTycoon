import { DJS, getDj } from './data';
import { hasPerk } from './tour';
import type { DjDef, DjState, GameState } from './types';

/** Fatigue a rested DJ (one who played no set) recovers each night. */
export const REST_RECOVERY = 0.5;
/** Fatigue de base par set joué + bonus ∝ fraction du set passée à PEAK/RINSE. */
export const FATIGUE_BASE_PER_SET = 0.18;
export const FATIGUE_PEAKRINSE_BONUS = 0.16;
/** XP per second of set played. */
export const XP_RATE = 1;
export const XP_PER_LEVEL = 250;
export const MAX_LEVEL = 3;
/** Effective technique bonus per level. */
export const TECH_PER_LEVEL = 0.5;
/** Quality malus at full exhaustion. */
export const FATIGUE_QUALITY_MALUS = 0.35;

export function djLevel(dj: DjState): number {
  return Math.min(MAX_LEVEL, Math.floor(dj.xp / XP_PER_LEVEL));
}

/** Effective technique including experience gained with the crew. */
export function effectiveTechnique(def: DjDef, state: DjState): number {
  return def.technique + djLevel(state) * TECH_PER_LEVEL + (state.studioBonus ?? 0);
}

/** Quality penalty fraction (0…FATIGUE_QUALITY_MALUS) for a given fatigue. */
export function fatigueMalus(fatigue: number): number {
  return FATIGUE_QUALITY_MALUS * Math.min(1, fatigue);
}

export function fatigueQualityMult(state: DjState): number {
  return 1 - fatigueMalus(state.fatigue);
}

export function getCrewMember(state: GameState, djId: string): DjState {
  const member = state.crew.find((d) => d.id === djId);
  if (!member) throw new Error(`not in crew: ${djId}`);
  return member;
}

export function isInCrew(state: GameState, djId: string): boolean {
  return state.crew.some((d) => d.id === djId);
}

/** Nuits de garde à vue restantes pour ce DJ (0 = libre). */
export function gardeAVueNights(state: GameState, djId: string): number {
  return state.gardeAVue[djId] ?? 0;
}

export function isEnGardeAVue(state: GameState, djId: string): boolean {
  return gardeAVueNights(state, djId) > 0;
}

/** Seuil de rep effectif : le carnet d'adresses ouvre la porte à 70 %. */
export const CARNET_THRESHOLD = 0.7;

export function djRepThreshold(state: GameState, def: DjDef): number {
  return hasPerk(state, 'carnet-adresses') ? Math.ceil(def.repReq * CARNET_THRESHOLD) : def.repReq;
}

/** Les Têtes d'affiche n'existent pas tant que leur perk n'est pas acheté. */
export function djAvailable(state: GameState, def: DjDef): boolean {
  return def.perk === undefined || hasPerk(state, def.perk);
}

/** DJs who would join the crew now (rep reached, not already in). */
export function recruitableDjs(state: GameState): DjDef[] {
  return DJS.filter(
    (d) => !isInCrew(state, d.id) && djAvailable(state, d) && state.rep >= djRepThreshold(state, d),
  );
}

/** DJs visible on the recruitment screen but still out of reach. */
export function lockedDjs(state: GameState): DjDef[] {
  return DJS.filter(
    (d) => !isInCrew(state, d.id) && djAvailable(state, d) && state.rep < djRepThreshold(state, d),
  );
}

export function recruitDj(state: GameState, djId: string): boolean {
  const def = getDj(djId);
  if (isInCrew(state, djId) || !djAvailable(state, def) || state.rep < djRepThreshold(state, def)) {
    return false;
  }
  state.crew.push({ id: djId, xp: 0, fatigue: 0, setsPlayed: 0, gifted: false, studioBonus: 0 });
  return true;
}

/**
 * Per-night rest: every crew member who played no set tonight recovers. The
 * roster is the lever — bench the cooked DJs so they can come back fresh.
 */
export function applyNightRest(state: GameState, playedDjIds: Set<string>): void {
  for (const dj of state.crew) {
    if (!playedDjIds.has(dj.id)) {
      dj.fatigue = Math.max(0, dj.fatigue - REST_RECOVERY);
    }
  }
}

// --- sinks crew : cadeau, jour off payé, session studio -----------------------

export const GIFT_BASE = 500;
export const GIFT_CUT_REDUCTION = 0.02;
export const GIFT_CUT_FLOOR = 0.03;
export const DAYOFF_BASE = 100;
export const STUDIO_COST = 1200;
export const STUDIO_STEP = 0.5;
export const STUDIO_MAX = 1;

export function giftCost(member: DjState): number {
  return GIFT_BASE * Math.max(1, djLevel(member));
}

export function dayOffCost(member: DjState): number {
  return DAYOFF_BASE * Math.max(1, djLevel(member));
}

/** Cut réel d'un DJ du crew : le cadeau le fait baisser de 2 points (plancher 3 %). */
export function effectiveCut(def: DjDef, member: DjState): number {
  return member.gifted ? Math.max(GIFT_CUT_FLOOR, def.cut - GIFT_CUT_REDUCTION) : def.cut;
}

/** 🎁 Cadeau : rend les gros cuts négociables — une fois par DJ. */
export function giftDj(state: GameState, djId: string): boolean {
  const member = getCrewMember(state, djId);
  const cost = giftCost(member);
  if (member.gifted || state.cash < cost) return false;
  state.cash -= cost;
  member.gifted = true;
  return true;
}

/** 🛋 Jour off payé : toute la fatigue récupérée, même s'il joue la prochaine nuit. */
export function buyDayOff(state: GameState, djId: string): boolean {
  const member = getCrewMember(state, djId);
  const cost = dayOffCost(member);
  if (member.fatigue <= 0 || state.cash < cost) return false;
  state.cash -= cost;
  member.fatigue = 0;
  return true;
}

/** 🎚 Session studio : +0.5 de technique permanent, max +1 par DJ. */
export function buyStudioSession(state: GameState, djId: string): boolean {
  const member = getCrewMember(state, djId);
  if (member.studioBonus >= STUDIO_MAX || state.cash < STUDIO_COST) return false;
  state.cash -= STUDIO_COST;
  member.studioBonus += STUDIO_STEP;
  return true;
}

/** Apply the toll of a played set. L'increvable ne prend jamais de fatigue. */
export function applySetToll(dj: DjState, fracPeakRinse: number, setSeconds: number): void {
  if (getDj(dj.id).gimmick !== 'increvable') {
    dj.fatigue = Math.min(1, dj.fatigue + FATIGUE_BASE_PER_SET + FATIGUE_PEAKRINSE_BONUS * fracPeakRinse);
  }
  dj.xp += setSeconds * XP_RATE * (1 + 0.3 * fracPeakRinse);
  dj.setsPlayed += 1;
}
