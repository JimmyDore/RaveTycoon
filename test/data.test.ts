import { describe, it, expect } from 'vitest';
import { SPOTS, GENRES, GEAR, GEAR_CATEGORIES, DJS, getSpot, getGenre, getDj } from '../src/core/data';
import { mulberry32 } from '../src/core/rng';

describe('spots', () => {
  it('has 6 spots sorted by reputation requirement, teknival last', () => {
    expect(SPOTS).toHaveLength(6);
    const reqs = SPOTS.map((s) => s.repReq);
    expect([...reqs].sort((a, b) => a - b)).toEqual(reqs);
    expect(SPOTS[5].id).toBe('teknival');
    expect(SPOTS[0].repReq).toBe(0);
  });

  it('scales nights from 3 minutes / 2 sets to 10 minutes / 6 sets', () => {
    expect(getSpot('champ').duration).toBe(180);
    expect(getSpot('champ').setCount).toBe(2);
    expect(getSpot('teknival').duration).toBe(600);
    expect(getSpot('teknival').setCount).toBe(6);
  });

  it('gives the carriere its poor-power quirk', () => {
    expect(getSpot('carriere').powerMult).toBeLessThan(1);
    expect(getSpot('champ').powerMult).toBe(1);
  });
});

describe('genres', () => {
  it('has 3 genres with distinct bpm', () => {
    expect(GENRES).toHaveLength(3);
    expect(new Set(GENRES.map((g) => g.bpm)).size).toBe(3);
  });

  it('models dub as slow/chill and acid as hot', () => {
    expect(getGenre('dub').heatMult).toBeLessThan(getGenre('hardtek').heatMult);
    expect(getGenre('acid').heatMult).toBeGreaterThan(getGenre('hardtek').heatMult);
    expect(getGenre('dub').churn).toBeLessThan(getGenre('hardtek').churn);
  });
});

describe('gear', () => {
  it('has five categories, each with an unseizable free tier 0', () => {
    expect(GEAR_CATEGORIES).toEqual(['platines', 'mur', 'groupe', 'lumieres', 'logistique']);
    for (const cat of GEAR_CATEGORIES) {
      expect(GEAR[cat]).toHaveLength(4);
      expect(GEAR[cat][0].seizable).toBe(false);
      expect(GEAR[cat][0].price).toBe(0);
      const prices = GEAR[cat].map((g) => g.price);
      expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    }
  });

  it('makes logistique reduce heat with higher tiers', () => {
    const values = GEAR.logistique.map((g) => g.value);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });
});

describe('djs', () => {
  it('has 8 DJs led by the founding tonton, sorted by rep requirement', () => {
    expect(DJS).toHaveLength(8);
    expect(DJS[0].id).toBe('tonton');
    expect(DJS[0].repReq).toBe(0);
    const reqs = DJS.map((d) => d.repReq);
    expect([...reqs].sort((a, b) => a - b)).toEqual(reqs);
  });

  it('gives every DJ stats in range and affinities for all genres', () => {
    for (const dj of DJS) {
      expect(dj.technique).toBeGreaterThanOrEqual(1);
      expect(dj.technique).toBeLessThanOrEqual(5);
      expect(dj.charisme).toBeGreaterThanOrEqual(1);
      expect(dj.charisme).toBeLessThanOrEqual(5);
      expect(dj.cut).toBeGreaterThan(0);
      expect(dj.cut).toBeLessThanOrEqual(0.3);
      for (const g of GENRES) {
        expect(dj.affinities[g.id]).toBeGreaterThan(0);
      }
    }
  });

  it('prices better DJs with bigger cuts', () => {
    expect(getDj('fantome').cut).toBeGreaterThan(getDj('tonton').cut);
  });
});

describe('rng', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
