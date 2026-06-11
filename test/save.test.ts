import { describe, it, expect } from 'vitest';
import {
  newGame,
  serialize,
  deserialize,
  saveGame,
  loadGame,
  exportCode,
  importCode,
  STORAGE_KEY,
  type KVStorage,
} from '../src/core/save';

function memStorage(): KVStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

describe('newGame', () => {
  it('grants tier-0 gear in every category and zero everything else', () => {
    const state = newGame();
    expect(state.gear).toEqual({ amps: 0, subs: 0, gen: 0 });
    expect(state.cash).toBe(0);
    expect(state.rep).toBe(0);
    expect(state.wonTeknival).toBe(false);
  });
});

describe('serialize / load', () => {
  it('roundtrips full state', () => {
    const state = newGame(123);
    state.cash = 1234;
    state.rep = 88;
    state.gear.subs = 2;
    state.damaged.amps = true;
    state.repairs.push({ category: 'amps', readyAt: 999 });
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it('persists via storage', () => {
    const storage = memStorage();
    const state = newGame();
    state.cash = 42;
    saveGame(storage, state);
    expect(storage.data.has(STORAGE_KEY)).toBe(true);
    expect(loadGame(storage)).toEqual(state);
  });

  it('rejects garbage and unknown versions', () => {
    expect(deserialize('not json')).toBeNull();
    expect(deserialize('{"hello": 1}')).toBeNull();
    const state = newGame();
    const json = serialize({ ...state, version: 999 });
    expect(deserialize(json)).toBeNull();
  });
});

describe('export / import codes', () => {
  it('roundtrips through a URL-safe code', () => {
    const state = newGame();
    state.cash = 777;
    state.pseudo = 'DJ Bagarre';
    const code = exportCode(state);
    expect(code).toMatch(/^[A-Za-z0-9_.-]+$/);
    expect(importCode(code)).toEqual(state);
  });

  it('rejects tampered codes', () => {
    const code = exportCode(newGame());
    const tampered = (code[0] === 'A' ? 'B' : 'A') + code.slice(1);
    expect(importCode(tampered)).toBeNull();
    expect(importCode('complètement-pété')).toBeNull();
  });
});
