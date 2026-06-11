import { drawRaverFrame, type Direction, type SpriteBank } from './sprites';

/**
 * Individual raver simulation, drawn with real LimeZu character sprites.
 * Dancing is programmatic: beat-synced hop + arms-up "lift" frames when the
 * vibe runs hot. Ravers walk in, drift between spots, leave when the night
 * sours, and scatter when the cops arrive.
 */

export interface Raver {
  x: number;
  y: number;
  tx: number;
  ty: number;
  character: number;
  /** personal rhythm offset so the crowd isn't a metronome */
  phaseOffset: number;
  /** hands-up enthusiasm threshold, varies per raver */
  hype: number;
  state: 'arriving' | 'dancing' | 'leaving' | 'scattering';
  speed: number;
  facing: Direction;
}

export interface DanceFloor {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function deviceSpriteCap(): number {
  const mobile = typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent);
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4;
  if (mobile || cores <= 4) return 120;
  return 300;
}

export class RaverSim {
  ravers: Raver[] = [];
  private rng: () => number;

  constructor(
    private floor: DanceFloor,
    private cap: number = deviceSpriteCap(),
    rng: () => number = Math.random,
  ) {
    this.rng = rng;
  }

  overflow(crowd: number): number {
    return Math.max(0, Math.round(crowd) - this.cap);
  }

  private spawnPoint(): { x: number; y: number } {
    const side = this.rng();
    if (side < 0.35) return { x: this.floor.x - 12, y: this.floor.y + this.rng() * this.floor.h };
    if (side < 0.7) return { x: this.floor.x + this.floor.w + 12, y: this.floor.y + this.rng() * this.floor.h };
    return { x: this.floor.x + this.rng() * this.floor.w, y: this.floor.y + this.floor.h + 10 };
  }

  private danceSpot(): { x: number; y: number } {
    // cluster toward the stage (top center of the floor)
    const cx = this.floor.x + this.floor.w / 2;
    const r = (this.rng() + this.rng()) / 2;
    const x = cx + (r - 0.5) * this.floor.w;
    const y = this.floor.y + Math.pow(this.rng(), 1.5) * this.floor.h;
    return { x, y };
  }

  update(crowd: number, dt: number, scatter: boolean): void {
    const want = Math.min(Math.round(crowd), this.cap);

    if (scatter) {
      for (const r of this.ravers) {
        if (r.state !== 'scattering') {
          r.state = 'scattering';
          const p = this.spawnPoint();
          r.tx = p.x;
          r.ty = p.y;
          r.speed = 45 + this.rng() * 30;
        }
      }
    } else {
      const active = this.ravers.filter((r) => r.state !== 'leaving' && r.state !== 'scattering').length;
      for (let i = active; i < want; i++) {
        const from = this.spawnPoint();
        const to = this.danceSpot();
        this.ravers.push({
          x: from.x,
          y: from.y,
          tx: to.x,
          ty: to.y,
          character: Math.floor(this.rng() * 20),
          phaseOffset: this.rng(),
          hype: 0.35 + this.rng() * 0.5,
          state: 'arriving',
          speed: 20 + this.rng() * 14,
          facing: 'up',
        });
      }
      let surplus = active - want;
      for (const r of this.ravers) {
        if (surplus <= 0) break;
        if (r.state === 'dancing') {
          r.state = 'leaving';
          const p = this.spawnPoint();
          r.tx = p.x;
          r.ty = p.y;
          surplus--;
        }
      }
    }

    for (const r of this.ravers) {
      if (r.state === 'dancing') {
        if (this.rng() < 0.0015 * dt * 60) {
          const p = this.danceSpot();
          r.tx = p.x;
          r.ty = p.y;
          r.state = 'arriving';
        }
        continue;
      }
      const dx = r.tx - r.x;
      const dy = r.ty - r.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 2) {
        if (r.state === 'arriving') {
          r.state = 'dancing';
          // mostly face the stage, a few face friends
          r.facing = this.rng() < 0.75 ? 'up' : this.rng() < 0.5 ? 'left' : 'right';
        }
      } else {
        r.x += (dx / dist) * r.speed * dt;
        r.y += (dy / dist) * r.speed * dt;
        r.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      }
    }
    this.ravers = this.ravers.filter(
      (r) => !((r.state === 'leaving' || r.state === 'scattering') && Math.hypot(r.tx - r.x, r.ty - r.y) < 3),
    );
  }

  draw(
    ctx: CanvasRenderingContext2D,
    bank: SpriteBank,
    beatPhase: number,
    vibe: number,
    overflowCrowd: number,
    timeMs: number,
  ): void {
    // density dots beyond the sprite cap, packed near the stage
    if (overflowCrowd > 0) {
      ctx.fillStyle = 'rgba(200, 180, 230, 0.45)';
      const dots = Math.min(overflowCrowd, 800);
      for (let i = 0; i < dots; i++) {
        const fx = ((i * 73) % 197) / 197;
        const fy = ((i * 151) % 89) / 89;
        ctx.fillRect(
          Math.round(this.floor.x + fx * this.floor.w),
          Math.round(this.floor.y - 4 + fy * (this.floor.h * 0.35)),
          1,
          1,
        );
      }
    }

    const sorted = [...this.ravers].sort((a, b) => a.y - b.y);
    const halfW = bank.meta.frameW / 2;
    const fullH = bank.meta.frameH;
    for (const r of sorted) {
      const phase = (beatPhase + r.phaseOffset) % 1;
      const x = Math.round(r.x - halfW);
      let y = Math.round(r.y - fullH);
      if (r.state === 'dancing') {
        // beat-synced pixel hop, harder when the vibe is high
        const hop = phase < 0.5 ? Math.round(1 + vibe * 1.6) : 0;
        y -= hop;
        if (vibe > r.hype) {
          // hands in the air — hold an arms-up frame from the lift animation
          const frame = 8 + (phase < 0.5 ? 1 : 0);
          drawRaverFrame(ctx, bank, r.character, 'lift', r.facing, frame, x, y);
        } else {
          const frame = Math.floor(((timeMs / 240) + r.phaseOffset * 6) % 6);
          drawRaverFrame(ctx, bank, r.character, 'idle', r.facing, frame, x, y);
        }
      } else {
        const frame = Math.floor((timeMs / 120 + r.phaseOffset * 6) % 6);
        drawRaverFrame(ctx, bank, r.character, 'walk', r.facing, frame, x, y);
      }
    }
  }
}
