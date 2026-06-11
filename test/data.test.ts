import { describe, it, expect } from 'vitest';
import { SPOTS, GENRES, GEAR, getSpot, getGenre } from '../src/core/data';
import { mulberry32 } from '../src/core/rng';

describe('spots', () => {
  it('has 6 spots sorted by reputation requirement, teknival last', () => {
    expect(SPOTS).toHaveLength(6);
    const reqs = SPOTS.map((s) => s.repReq);
    expect([...reqs].sort((a, b) => a - b)).toEqual(reqs);
    expect(SPOTS[5].id).toBe('teknival');
    expect(SPOTS[0].repReq).toBe(0);
  });

  it('scales rave duration from 3 minutes to 10 minutes', () => {
    expect(getSpot('champ').duration).toBe(180);
    expect(getSpot('teknival').duration).toBe(600);
  });

  it('gives the carriere its poor-power quirk', () => {
    expect(getSpot('carriere').genCapacityMult).toBeLessThan(1);
    expect(getSpot('champ').genCapacityMult).toBe(1);
  });
});

describe('genres', () => {
  it('has 3 genres with distinct bpm', () => {
    expect(GENRES).toHaveLength(3);
    const bpms = new Set(GENRES.map((g) => g.bpm));
    expect(bpms.size).toBe(3);
  });

  it('models dub as slow/chill and acid as hot', () => {
    expect(getGenre('dub').heatMult).toBeLessThan(getGenre('hardtek').heatMult);
    expect(getGenre('acid').heatMult).toBeGreaterThan(getGenre('hardtek').heatMult);
    expect(getGenre('dub').churn).toBeLessThan(getGenre('hardtek').churn);
  });
});

describe('gear', () => {
  it('has an unseizable free tier-0 item in every category', () => {
    for (const cat of ['amps', 'subs', 'gen'] as const) {
      expect(GEAR[cat]).toHaveLength(4);
      expect(GEAR[cat][0].seizable).toBe(false);
      expect(GEAR[cat][0].price).toBe(0);
      const values = GEAR[cat].map((g) => g.value);
      expect([...values].sort((a, b) => a - b)).toEqual(values);
    }
  });
});

describe('rng', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
    seqA.forEach((x) => {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    });
  });
});
