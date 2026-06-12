import { describe, expect, it } from 'vitest';
import { NIGHT_MODIFIERS, rollModifiers } from './modifiers';
import { createNight, startSet, tickNight } from './night';
import { newGame } from './save';

describe('rollModifiers', () => {
  it('tire les modifs attendues pour une graine connue (déterminisme)', () => {
    const a = rollModifiers(1, 7).map((m) => m.id);
    const b = rollModifiers(1, 7).map((m) => m.id);
    expect(a).toEqual(b); // même graine → même tirage
    expect(a).toEqual(['nuit-claire', 'famille-son']);
  });

  it('tire 1 ou 2 modifs, sans doublon', () => {
    for (let seed = 0; seed < 50; seed++) {
      const ids = rollModifiers(2, seed).map((m) => m.id);
      expect(ids.length).toBeGreaterThanOrEqual(1);
      expect(ids.length).toBeLessThanOrEqual(2);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('au tier 1, ne tire jamais de modif agressive sur la chaleur/le décrochage', () => {
    const aggressive = NIGHT_MODIFIERS.filter((m) => (m.heatMult ?? 1) > 1 || (m.churnMult ?? 1) > 1.3);
    const aggressiveIds = new Set(aggressive.map((m) => m.id));
    for (let seed = 0; seed < 200; seed++) {
      for (const m of rollModifiers(1, seed)) {
        expect(aggressiveIds.has(m.id)).toBe(false);
      }
    }
  });
});

describe('application des modificateurs dans tickNight', () => {
  function playingNight(seed: number) {
    const state = newGame(42);
    const night = createNight(state, 'champ', ['tonton'], seed);
    startSet(state, night, 'tonton');
    return { state, night };
  }

  it('un multiplicateur de chaleur modifie bien la heat sur un tick', () => {
    // graine 1 (tier 1) → nuit-claire seul (pas de heatMult) : baseline sans effet heat
    const base = playingNight(1);
    base.night.heat = 0;
    tickNight(base.state, base.night, 0.1);
    const baseHeat = base.night.heat;

    // on force un modif heatMult > 1 et on compare le même tick
    const mod = playingNight(1);
    mod.night.modifiers = NIGHT_MODIFIERS.filter((m) => m.id === 'touristes');
    mod.night.heat = 0;
    tickNight(mod.state, mod.night, 0.1);

    expect(mod.night.heat).toBeGreaterThan(baseHeat);
  });

  it('un arrivalMult plus haut fait monter la foule plus vite', () => {
    const slow = playingNight(1);
    slow.night.modifiers = NIGHT_MODIFIERS.filter((m) => m.id === 'pluie'); // arrivalMult 0.85
    slow.night.crowd = 0;
    tickNight(slow.state, slow.night, 0.1);

    const fast = playingNight(1);
    fast.night.modifiers = NIGHT_MODIFIERS.filter((m) => m.id === 'nuit-claire'); // arrivalMult 1.2
    fast.night.crowd = 0;
    tickNight(fast.state, fast.night, 0.1);

    expect(fast.night.crowd).toBeGreaterThan(slow.night.crowd);
  });
});
