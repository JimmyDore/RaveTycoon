import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import type { AnimatedMeta } from './sprites';

// le manifest est produit par `npm run assets` (sources non redistribuables,
// gitignored) — le test saute si les assets ne sont pas buildés
const DIR = 'public/assets/animated';
const MANIFEST = `${DIR}/manifest.json`;

/** Lit largeur/hauteur dans l'en-tête IHDR d'un PNG (sans DOM). */
function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe.skipIf(!existsSync(MANIFEST))('animated manifest', () => {
  it('chaque entrée a une géométrie valide, cohérente avec son image', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Record<string, AnimatedMeta>;
    expect(Object.keys(manifest).length).toBeGreaterThan(0);
    for (const [name, m] of Object.entries(manifest)) {
      expect(m.frameW, `${name}.frameW`).toBeGreaterThan(0);
      expect(m.frameH, `${name}.frameH`).toBeGreaterThan(0);
      expect(m.frames, `${name}.frames`).toBeGreaterThan(0);
      expect(m.fps, `${name}.fps`).toBeGreaterThan(0);
      const img = `${DIR}/${name}.png`;
      if (existsSync(img)) {
        const { width, height } = pngSize(img);
        expect(width, `${name}: largeur = frames × frameW`).toBe(m.frames * m.frameW);
        expect(height, `${name}: hauteur = frameH`).toBe(m.frameH);
      }
    }
  });
});
