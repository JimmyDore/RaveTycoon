import { describe, expect, it } from 'vitest';
import { drawAnimatedFrame, type SpriteBank } from './sprites';

/** Banque minimale : un sheet animé factice, pas de DOM requis. */
function fakeBank(): SpriteBank {
  return {
    ravers: {} as HTMLImageElement,
    meta: {
      frameW: 16,
      frameH: 32,
      characters: 20,
      idle: { start: 0, perDir: 6 },
      walk: { start: 24, perDir: 6 },
      lift: { start: 48, perDir: 14 },
    },
    props: {},
    terrain: {},
    animated: {
      fog_loop: { img: {} as HTMLImageElement, meta: { frameW: 96, frameH: 96, frames: 6, fps: 8 } },
    },
    ready: true,
  };
}

describe('drawAnimatedFrame', () => {
  it('clampe un timeMs négatif sur la frame 0 (jamais de sx négatif)', () => {
    const calls: number[][] = [];
    const ctx = { drawImage: (...args: unknown[]) => calls.push(args.slice(1) as number[]) };
    drawAnimatedFrame(ctx as unknown as CanvasRenderingContext2D, fakeBank(), 'fog_loop', 10, 20, -5000);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(0); // sx = frame 0
  });

  it('indexe la frame sur le temps et boucle au-delà du sheet', () => {
    const calls: number[][] = [];
    const ctx = { drawImage: (...args: unknown[]) => calls.push(args.slice(1) as number[]) };
    // 1s à 8 fps sur 6 frames → frame 8 % 6 = 2 → sx = 2 × 96
    drawAnimatedFrame(ctx as unknown as CanvasRenderingContext2D, fakeBank(), 'fog_loop', 0, 0, 1000);
    expect(calls[0][0]).toBe(2 * 96);
  });
});
