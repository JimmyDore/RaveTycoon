import { describe, it, expect } from 'vitest';
import { SPOTS, GENRES, GEAR, GEAR_CATEGORIES, DJS, getSpot, getGenre, getDj } from '../src/core/data';
import { mulberry32 } from '../src/core/rng';

describe('spots', () => {
  it('has 9 spots sorted by reputation requirement, teknival last at 650', () => {
    expect(SPOTS).toHaveLength(9);
    const reqs = SPOTS.map((s) => s.repReq);
    expect([...reqs].sort((a, b) => a - b)).toEqual(reqs);
    expect(SPOTS[8].id).toBe('teknival');
    expect(getSpot('teknival').repReq).toBe(650);
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
  it('has 12 genres with unique ids', () => {
    expect(GENRES).toHaveLength(12);
    expect(new Set(GENRES.map((g) => g.id)).size).toBe(12);
  });

  it('models dub as slow/chill and acid as hot', () => {
    expect(getGenre('dub').heatMult).toBeLessThan(getGenre('hardtek').heatMult);
    expect(getGenre('acid').heatMult).toBeGreaterThan(getGenre('hardtek').heatMult);
    expect(getGenre('dub').churn).toBeLessThan(getGenre('hardtek').churn);
  });

  it('models hardcore as the hottest and downtempo as the chillest', () => {
    expect(getGenre('hardcore').heatMult).toBeGreaterThan(getGenre('frenchcore').heatMult);
    expect(getGenre('downtempo').heatMult).toBeLessThan(getGenre('dub').heatMult);
  });
});

describe('gear', () => {
  it('has five categories, each with an unseizable free tier 0', () => {
    expect(GEAR_CATEGORIES).toEqual(['platines', 'mur', 'groupe', 'lumieres', 'logistique']);
    for (const cat of GEAR_CATEGORIES) {
      expect(GEAR[cat]).toHaveLength(9); // t0–t2 + t3/t4/t5 × deux voies
      expect(GEAR[cat][0].seizable).toBe(false);
      expect(GEAR[cat][0].price).toBe(0);
      // les tiers 1–3 grimpent ; le t4 (4 000 €) redescend sous le t3 par design (spec §2)
      const baseline = GEAR[cat].filter((g) => g.branch === undefined).map((g) => g.price);
      expect([...baseline].sort((a, b) => a - b)).toEqual(baseline);
    }
  });

  it('makes logistique reduce heat with higher tiers along each voie', () => {
    for (const branch of ['A', 'B'] as const) {
      const path = GEAR.logistique
        .filter((g) => g.branch === undefined || g.branch === branch)
        .map((g) => g.value);
      expect([...path].sort((a, b) => b - a)).toEqual(path);
    }
  });
});

describe('djs', () => {
  it('has 12 DJs led by the founding tonton, sorted by rep requirement', () => {
    expect(DJS).toHaveLength(12);
    expect(DJS[0].id).toBe('tonton');
    expect(DJS[0].repReq).toBe(0);
    const reqs = DJS.map((d) => d.repReq);
    expect([...reqs].sort((a, b) => a - b)).toEqual(reqs);
  });

  it('gives every DJ stats in range and a signature genre', () => {
    const genreIds = new Set(GENRES.map((g) => g.id));
    for (const dj of DJS) {
      expect(dj.technique).toBeGreaterThanOrEqual(1);
      expect(dj.technique).toBeLessThanOrEqual(5);
      expect(dj.charisme).toBeGreaterThanOrEqual(1);
      expect(dj.charisme).toBeLessThanOrEqual(5);
      expect(dj.cut).toBeGreaterThan(0);
      expect(dj.cut).toBeLessThanOrEqual(0.3);
      expect(genreIds.has(dj.genre)).toBe(true);
    }
  });

  it('maps each genre to exactly one DJ', () => {
    expect(new Set(DJS.map((d) => d.genre)).size).toBe(DJS.length);
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
