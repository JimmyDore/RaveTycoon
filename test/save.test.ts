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
  it('grants tier-0 gear, the founding DJ, and zero everything else', () => {
    const state = newGame();
    expect(state.gear).toEqual({ platines: 0, mur: 0, groupe: 0, lumieres: 0, logistique: 0 });
    expect(state.crew.map((d) => d.id)).toEqual(['tonton']);
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
    state.gear.mur = 2;
    state.damaged.mur = true;
    state.repairs.push({ category: 'mur', readyAt: 999 });
    state.crew.push({ id: 'gamine', xp: 500, fatigue: 0.4, setsPlayed: 7, gifted: false, studioBonus: 0 });
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

describe('migration v2 → v3', () => {
  it('charge une vieille sauvegarde : gearBranch ajouté, voie A par défaut au tier 3', () => {
    const v2 = JSON.parse(serialize(newGame())) as Record<string, unknown>;
    v2.version = 2;
    delete v2.gearBranch;
    for (const m of v2.crew as Array<Record<string, unknown>>) {
      delete m.gifted;
      delete m.studioBonus;
    }
    v2.gear = { platines: 3, mur: 1, groupe: 0, lumieres: 0, logistique: 0 };
    const loaded = deserialize(JSON.stringify(v2));
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(3);
    expect(loaded!.gearBranch.platines).toBe('A');
    expect(loaded!.gearBranch.mur).toBeUndefined();
    expect(loaded!.crew[0].gifted).toBe(false);
    expect(loaded!.crew[0].studioBonus).toBe(0);
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

describe('la région voyage dans la sauvegarde', () => {
  it('roundtrip complet avec une région', () => {
    const state = newGame(123);
    state.region = { nom: 'La Vallée grise', traits: ['zone-quadrillee', 'prefet-zele'] };
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it('une save sans région reste valide (tournée 1)', () => {
    const parsed = deserialize(serialize(newGame()));
    expect(parsed).not.toBeNull();
    expect(parsed!.region).toBeUndefined();
  });

  it('rejette une région malformée', () => {
    const state = newGame();
    expect(deserialize(JSON.stringify({ ...state, region: { nom: 42 } }))).toBeNull();
    expect(deserialize(JSON.stringify({ ...state, region: { nom: 'x', traits: 'pas-un-tableau' } }))).toBeNull();
  });
});
