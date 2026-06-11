import type { GameState } from './types';

export const SAVE_VERSION = 1;
export const STORAGE_KEY = 'rave-tycoon-save';

/** Minimal storage interface so tests can inject a stub. */
export interface KVStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function newGame(now = 0): GameState {
  return {
    version: SAVE_VERSION,
    cash: 0,
    rep: 0,
    buzz: 0,
    busts: 0,
    nights: 0,
    gear: { amps: 0, subs: 0, gen: 0 },
    damaged: { amps: false, subs: false, gen: false },
    repairs: [],
    pseudo: '',
    lastSeen: now,
    bestCrowd: 0,
    bestPayout: 0,
    wonTeknival: false,
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
    typeof (o.gear as Record<string, unknown>).amps === 'number' &&
    typeof o.damaged === 'object' &&
    Array.isArray(o.repairs)
  );
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState | null {
  try {
    const parsed = JSON.parse(json);
    return isValidState(parsed) ? parsed : null;
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

// --- export/import codes (cross-device portability) -------------------------

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
