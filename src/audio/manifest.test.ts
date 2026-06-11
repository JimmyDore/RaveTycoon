import { describe, expect, it } from 'vitest';
import { loopSecondsFor, parseManifest } from './manifest';

describe('audio manifest', () => {
  it('computes loop length from bars and bpm', () => {
    expect(loopSecondsFor({ bpm: 170, bars: 4, stems: { kick: 'k', sub: 's', lead: 'l', hats: 'h' } }))
      .toBeCloseTo(4 * 4 * (60 / 170));
  });

  it('rejects entries missing stems', () => {
    expect(parseManifest({ hardtek: { bpm: 170, bars: 4, stems: { kick: 'k' } } })).toEqual({});
    const good = { hardtek: { bpm: 170, bars: 4, stems: { kick: 'k', sub: 's', lead: 'l', hats: 'h' } } };
    expect(parseManifest(good)).toEqual(good);
  });
});
