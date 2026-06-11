import { describe, expect, it } from 'vitest';
import type { GenreId } from '../core/types';
import {
  loopSeconds,
  loopSteps,
  patternsFor,
  type GenrePatterns,
  type LeadStyle,
} from './synth';

const ALL_GENRES: GenreId[] = [
  'hardtek',
  'acid',
  'dub',
  'frenchcore',
  'mentale',
  'techno',
  'raggatek',
  'darkpsy',
];

const EXPECTED_BPM: Record<GenreId, number> = {
  hardtek: 170,
  acid: 140,
  dub: 75,
  frenchcore: 200,
  mentale: 180,
  techno: 130,
  raggatek: 175,
  darkpsy: 150,
};

const EXPECTED_LEAD: Record<GenreId, LeadStyle> = {
  hardtek: 'stab',
  acid: 'acid303',
  dub: 'skank',
  frenchcore: 'hoover',
  mentale: 'arp',
  techno: 'stab',
  raggatek: 'ragga',
  darkpsy: 'psy',
};

function signature(p: GenrePatterns): string {
  // a compact, order-independent fingerprint of the four stems
  const stem = (ns: GenrePatterns['kick']) =>
    ns
      .map((n) => `${n.step}:${n.freq.toFixed(2)}:${n.vel}:${n.len}`)
      .sort()
      .join(',');
  return [p.bpm, p.leadStyle, stem(p.kick), stem(p.sub), stem(p.lead), stem(p.hats)].join('|');
}

describe('synth patterns', () => {
  it('exposes a builder for every genre', () => {
    for (const g of ALL_GENRES) {
      expect(() => patternsFor(g)).not.toThrow();
    }
  });

  it('uses the contracted bpm and lead style per genre', () => {
    for (const g of ALL_GENRES) {
      const p = patternsFor(g);
      expect(p.bpm, `bpm for ${g}`).toBe(EXPECTED_BPM[g]);
      expect(p.leadStyle, `leadStyle for ${g}`).toBe(EXPECTED_LEAD[g]);
    }
  });

  it('is deterministic — same genre yields identical patterns', () => {
    for (const g of ALL_GENRES) {
      expect(signature(patternsFor(g))).toBe(signature(patternsFor(g)));
    }
  });

  it('produces a distinct sound per genre', () => {
    const sigs = ALL_GENRES.map((g) => signature(patternsFor(g)));
    expect(new Set(sigs).size).toBe(ALL_GENRES.length);
  });

  it('lays every note on the existing 16-step grid with audible content', () => {
    const steps = loopSteps();
    for (const g of ALL_GENRES) {
      const p = patternsFor(g);
      expect(p.steps).toBe(steps);
      expect(p.loopSeconds).toBeCloseTo(loopSeconds(p.bpm));
      const notes = [...p.kick, ...p.sub, ...p.lead, ...p.hats];
      expect(notes.length, `${g} has notes`).toBeGreaterThan(0);
      for (const n of notes) {
        expect(n.step, `${g} step in range`).toBeGreaterThanOrEqual(0);
        expect(n.step, `${g} step in range`).toBeLessThan(steps);
        expect(Number.isFinite(n.freq) && n.freq > 0, `${g} freq finite`).toBe(true);
      }
      // every genre carries each layer so the mixer has something to fade
      expect(p.kick.length, `${g} kick`).toBeGreaterThan(0);
      expect(p.sub.length, `${g} sub`).toBeGreaterThan(0);
      expect(p.lead.length, `${g} lead`).toBeGreaterThan(0);
      expect(p.hats.length, `${g} hats`).toBeGreaterThan(0);
    }
  });
});
