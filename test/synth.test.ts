import { describe, it, expect } from 'vitest';
import {
  patternsFor,
  loopSteps,
  loopSeconds,
  stepSeconds,
  clipDrive,
  distortionCurve,
  STEPS_PER_BAR,
  LOOP_BARS,
} from '../src/audio/synth';
import { GENRES } from '../src/core/data';

describe('pattern grid', () => {
  it('lays out 16 steps per bar over 2 bars', () => {
    expect(loopSteps()).toBe(STEPS_PER_BAR * LOOP_BARS);
  });

  it('computes loop duration from bpm', () => {
    expect(loopSeconds(120)).toBeCloseTo(4, 5);
    expect(stepSeconds(120)).toBeCloseTo(0.125, 5);
  });

  it('builds a full stem set for every genre, at the genre bpm', () => {
    for (const genre of GENRES) {
      const p = patternsFor(genre.id);
      expect(p.bpm).toBe(genre.bpm);
      expect(p.kick.length).toBeGreaterThan(0);
      expect(p.sub.length).toBeGreaterThan(0);
      expect(p.lead.length).toBeGreaterThan(0);
      expect(p.hats.length).toBeGreaterThan(0);
      for (const stem of [p.kick, p.sub, p.lead, p.hats]) {
        for (const n of stem) {
          expect(n.step).toBeGreaterThanOrEqual(0);
          expect(n.step).toBeLessThan(p.steps);
          expect(n.vel).toBeGreaterThan(0);
          expect(n.vel).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('keeps genre identities distinct (dub one-drop vs four-on-floor)', () => {
    expect(patternsFor('hardtek').kick.length).toBeGreaterThan(patternsFor('dub').kick.length);
  });
});

describe('distortion', () => {
  it('drive grows monotonically with clipping amount', () => {
    let prev = -Infinity;
    for (let a = 0; a <= 1.001; a += 0.1) {
      const d = clipDrive(a);
      expect(d).toBeGreaterThan(prev);
      prev = d;
    }
    expect(clipDrive(0)).toBe(1);
  });

  it('produces a bounded, odd-symmetric transfer curve', () => {
    const curve = distortionCurve(10, 257);
    expect(curve[0]).toBeCloseTo(-1, 3);
    expect(curve[curve.length - 1]).toBeCloseTo(1, 3);
    expect(curve[128]).toBeCloseTo(0, 3);
  });
});
