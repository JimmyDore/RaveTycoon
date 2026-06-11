import type { GenreId } from '../core/types';

export const STEM_NAMES = ['kick', 'sub', 'lead', 'hats'] as const;
export type StemName = (typeof STEM_NAMES)[number];

export interface StemManifestEntry {
  bpm: number;
  /** loop length in 4/4 bars */
  bars: number;
  /** file names relative to /audio/ */
  stems: Record<StemName, string>;
}

export type StemManifest = Partial<Record<GenreId, StemManifestEntry>>;

export function loopSecondsFor(entry: StemManifestEntry): number {
  return entry.bars * 4 * (60 / entry.bpm);
}

/** Keep only well-formed entries; tolerate junk so a bad manifest can't break the game. */
export function parseManifest(raw: unknown): StemManifest {
  const out: StemManifest = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [genre, entry] of Object.entries(raw as Record<string, unknown>)) {
    const e = entry as StemManifestEntry;
    if (
      e && typeof e.bpm === 'number' && e.bpm > 0 &&
      typeof e.bars === 'number' && e.bars > 0 &&
      e.stems && STEM_NAMES.every((s) => typeof e.stems[s] === 'string')
    ) {
      out[genre as GenreId] = e;
    }
  }
  return out;
}
