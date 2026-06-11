import { DJS, getDj } from './data';
import type { DjDef, DjState, GameState } from './types';

/** Hours of real time for a DJ to go from exhausted to fresh. */
export const FATIGUE_RECOVERY_HOURS = 12;
/** Fatigue gained per set played (more when pushing). */
export const FATIGUE_PER_SET = 0.22;
export const FATIGUE_PUSH_BONUS = 0.08;
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
  return def.technique + djLevel(state) * TECH_PER_LEVEL;
}

export function fatigueQualityMult(state: DjState): number {
  return 1 - FATIGUE_QUALITY_MALUS * Math.min(1, state.fatigue);
}

export function getCrewMember(state: GameState, djId: string): DjState {
  const member = state.crew.find((d) => d.id === djId);
  if (!member) throw new Error(`not in crew: ${djId}`);
  return member;
}

export function isInCrew(state: GameState, djId: string): boolean {
  return state.crew.some((d) => d.id === djId);
}

/** DJs who would join the crew now (rep reached, not already in). */
export function recruitableDjs(state: GameState): DjDef[] {
  return DJS.filter((d) => !isInCrew(state, d.id) && state.rep >= d.repReq);
}

/** DJs visible on the recruitment screen but still out of reach. */
export function lockedDjs(state: GameState): DjDef[] {
  return DJS.filter((d) => !isInCrew(state, d.id) && state.rep < d.repReq);
}

export function recruitDj(state: GameState, djId: string): boolean {
  const def = getDj(djId);
  if (isInCrew(state, djId) || state.rep < def.repReq) return false;
  state.crew.push({ id: djId, xp: 0, fatigue: 0, setsPlayed: 0 });
  return true;
}

/** Real-time fatigue recovery, called from applyIdleTime. */
export function recoverFatigue(state: GameState, hours: number): void {
  for (const dj of state.crew) {
    dj.fatigue = Math.max(0, dj.fatigue - hours / FATIGUE_RECOVERY_HOURS);
  }
}

/** Apply the toll of a played set. */
export function applySetToll(dj: DjState, brief: string, setSeconds: number): void {
  dj.fatigue = Math.min(1.5, dj.fatigue + FATIGUE_PER_SET + (brief === 'pousser' ? FATIGUE_PUSH_BONUS : 0));
  dj.xp += setSeconds * XP_RATE * (brief === 'pousser' ? 1.3 : 1);
  dj.setsPlayed += 1;
}
