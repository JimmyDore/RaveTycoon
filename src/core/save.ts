import type { GameState, GearBranch, GearCategory, TourState } from './types';

export const SAVE_VERSION = 3;
export const STORAGE_KEY = 'rave-tycoon-save';

/** Minimal storage interface so tests can inject a stub. */
export interface KVStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultTour(): TourState {
  return { number: 1, legende: 0, perks: [], veteranIds: [], teknivalWins: 0 };
}

export function newGame(now = 0): GameState {
  return {
    version: SAVE_VERSION,
    cash: 0,
    rep: 0,
    buzz: 0,
    busts: 0,
    nights: 0,
    gear: { platines: 0, mur: 0, groupe: 0, lumieres: 0, logistique: 0 },
    gearBranch: {},
    damaged: {},
    repairs: [],
    // the founding DJ — le pote du camion, là depuis le début
    crew: [{ id: 'tonton', xp: 0, fatigue: 0, setsPlayed: 0, gifted: false, studioBonus: 0 }],
    pseudo: '',
    lastSeen: now,
    bestCrowd: 0,
    bestPayout: 0,
    wonTeknival: false,
    tour: defaultTour(),
  };
}

function isValidState(s: unknown): s is GameState {
  if (typeof s !== 'object' || s === null) return false;
  const o = s as Record<string, unknown>;
  return (
    o.version === SAVE_VERSION &&
    typeof o.cash === 'number' &&
    typeof o.rep === 'number' &&
    typeof o.buzz === 'number' &&
    typeof o.busts === 'number' &&
    typeof o.gear === 'object' &&
    o.gear !== null &&
    typeof (o.gear as Record<string, unknown>).platines === 'number' &&
    typeof (o.gear as Record<string, unknown>).mur === 'number' &&
    typeof o.gearBranch === 'object' &&
    o.gearBranch !== null &&
    Array.isArray(o.crew) &&
    (o.crew as unknown[]).length >= 1 &&
    Array.isArray(o.repairs) &&
    (o.region === undefined ||
      (typeof o.region === 'object' &&
        o.region !== null &&
        typeof (o.region as Record<string, unknown>).nom === 'string' &&
        Array.isArray((o.region as Record<string, unknown>).traits)))
  );
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** v2 → v3 : les branches du matos n'existaient pas — voie A par défaut au tier ≥ 3. */
function migrateV2(o: Record<string, unknown>): void {
  if (o.version !== 2) return;
  o.version = 3;
  // sinks crew v3 : cadeau / studio absents des vieilles sauvegardes
  for (const m of (o.crew as Array<Record<string, unknown>>) ?? []) {
    m.gifted = m.gifted ?? false;
    m.studioBonus = m.studioBonus ?? 0;
  }
  const gear = (o.gear ?? {}) as Record<GearCategory, number>;
  const gearBranch: Partial<Record<GearCategory, GearBranch>> = {};
  for (const cat of Object.keys(gear) as GearCategory[]) {
    if (gear[cat] >= 3) gearBranch[cat] = 'A';
  }
  o.gearBranch = gearBranch;
}

/** Vieille save d'avant la tournée : bloc `tour` absent = tournée 1, 0 ⭐. */
function migrate(state: GameState): GameState {
  if (!state.tour) state.tour = defaultTour();
  return state;
}

/** v1 saves (different game) fall back to a fresh start. */
export function deserialize(json: string): GameState | null {
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') migrateV2(parsed);
    return isValidState(parsed) ? migrate(parsed) : null;
  } catch {
    return null;
  }
}

export function saveGame(storage: KVStorage, state: GameState): void {
  storage.setItem(STORAGE_KEY, serialize(state));
}

export function loadGame(storage: KVStorage): GameState | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return deserialize(raw);
}

// --- export/import codes -----------------------------------------------------

function checksum(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function exportCode(state: GameState): string {
  const json = serialize(state);
  return `${toBase64Url(json)}.${checksum(json).toString(36)}`;
}

export function importCode(code: string): GameState | null {
  const dot = code.lastIndexOf('.');
  if (dot < 0) return null;
  const json = fromBase64Url(code.slice(0, dot).trim());
  if (json === null) return null;
  if (checksum(json).toString(36) !== code.slice(dot + 1).trim()) return null;
  return deserialize(json);
}
