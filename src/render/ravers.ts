/**
 * Individual raver sprite simulation. Each raver is a tiny pixel humanoid
 * that walks in, dances on the beat (harder when the vibe is high), drifts
 * away when the sound dips, and scatters when the cops arrive.
 */

export interface Raver {
  x: number;
  y: number;
  tx: number;
  ty: number;
  /** personal rhythm offset so the crowd isn't a metronome */
  phaseOffset: number;
  palette: number;
  state: 'arriving' | 'dancing' | 'leaving' | 'scattering';
  speed: number;
  /** how hard this raver dances, [0.5, 1.5] */
  energy: number;
}

export interface DanceFloor {
  x: number;
  y: number;
  w: number;
  h: number;
}

const JACKETS = ['#e84a5f', '#9b5de5', '#00bbf9', '#fee440', '#00f5d4', '#f15bb5', '#c0c0c0', '#7cb518'];
const PANTS = ['#1a1423', '#2d2a32', '#3a3042'];
const SKIN = ['#e8b88a', '#c68863', '#8d5b3f', '#f0c9a0'];

/** Sprite cap by device capability — beyond it we render cheap density dots. */
export function deviceSpriteCap(): number {
  const mobile = typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent);
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4;
  if (mobile || cores <= 4) return 150;
  return 400;
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

  /** Crowd count beyond the sprite cap, rendered as background density dots. */
  overflow(crowd: number): number {
    return Math.max(0, Math.round(crowd) - this.cap);
  }

  private spawnPoint(): { x: number; y: number } {
    // walk in from the edges of the floor
    const side = this.rng();
    if (side < 0.4) return { x: this.floor.x - 8, y: this.floor.y + this.rng() * this.floor.h };
    if (side < 0.8) return { x: this.floor.x + this.floor.w + 8, y: this.floor.y + this.rng() * this.floor.h };
    return { x: this.floor.x + this.rng() * this.floor.w, y: this.floor.y + this.floor.h + 6 };
  }

  private danceSpot(): { x: number; y: number } {
    // gaussian-ish cluster toward the middle front (near the stacks)
    const cx = this.floor.x + this.floor.w / 2;
    const r = (this.rng() + this.rng()) / 2; // triangular
    const x = cx + (r - 0.5) * this.floor.w;
    const y = this.floor.y + Math.pow(this.rng(), 1.4) * this.floor.h;
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
          r.speed = 30 + this.rng() * 25;
        }
      }
    } else {
      const active = this.ravers.filter((r) => r.state !== 'leaving' && r.state !== 'scattering').length;
      // spawn newcomers
      for (let i = active; i < want; i++) {
        const from = this.spawnPoint();
        const to = this.danceSpot();
        this.ravers.push({
          x: from.x,
          y: from.y,
          tx: to.x,
          ty: to.y,
          phaseOffset: this.rng(),
          palette: Math.floor(this.rng() * JACKETS.length * PANTS.length * SKIN.length),
          state: 'arriving',
          speed: 14 + this.rng() * 10,
          energy: 0.5 + this.rng(),
        });
      }
      // send the surplus home
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

    // move everyone
    for (const r of this.ravers) {
      if (r.state === 'dancing') {
        // occasional reposition keeps the floor alive
        if (this.rng() < 0.002 * dt * 60) {
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
      if (dist < 1.5) {
        if (r.state === 'arriving') r.state = 'dancing';
      } else {
        r.x += (dx / dist) * r.speed * dt;
        r.y += (dy / dist) * r.speed * dt;
      }
    }
    // cull those who reached the exit
    this.ravers = this.ravers.filter(
      (r) => !((r.state === 'leaving' || r.state === 'scattering') && Math.hypot(r.tx - r.x, r.ty - r.y) < 2),
    );
  }

  /**
   * Draw all ravers, depth-sorted. Dance bounce is a hard 2-frame pixel hop
   * synced to the audio beat phase; intensity scales with vibe.
   */
  draw(ctx: CanvasRenderingContext2D, beatPhase: number, vibe: number, overflowCrowd: number): void {
    // density dots for the crowd beyond the sprite cap
    if (overflowCrowd > 0) {
      ctx.fillStyle = 'rgba(190, 170, 220, 0.5)';
      const dots = Math.min(overflowCrowd, 600);
      for (let i = 0; i < dots; i++) {
        // deterministic-ish scatter from index so dots don't shimmer
        const fx = ((i * 73) % 97) / 97;
        const fy = ((i * 151) % 89) / 89;
        ctx.fillRect(
          Math.round(this.floor.x + fx * this.floor.w),
          Math.round(this.floor.y - 3 + fy * (this.floor.h * 0.4)),
          1,
          1,
        );
      }
    }

    const sorted = [...this.ravers].sort((a, b) => a.y - b.y);
    for (const r of sorted) {
      const phase = (beatPhase + r.phaseOffset) % 1;
      const dancing = r.state === 'dancing';
      const hopHeight = dancing ? Math.round((phase < 0.5 ? 1 : 0) * (1 + vibe * r.energy)) : 0;
      const x = Math.round(r.x);
      const y = Math.round(r.y) - hopHeight;
      const jacket = JACKETS[r.palette % JACKETS.length];
      const pants = PANTS[(r.palette / JACKETS.length | 0) % PANTS.length];
      const skin = SKIN[(r.palette / (JACKETS.length * PANTS.length) | 0) % SKIN.length];

      // 3px-wide, ~6px-tall humanoid
      ctx.fillStyle = skin;
      ctx.fillRect(x, y - 6, 2, 2); // head
      ctx.fillStyle = jacket;
      ctx.fillRect(x - 1, y - 4, 4, 2); // torso + arms
      // arms up on the beat when the vibe is hot
      if (dancing && vibe > 0.55 && phase < 0.5) {
        ctx.fillRect(x - 1, y - 6, 1, 2);
        ctx.fillRect(x + 2, y - 6, 1, 2);
      }
      ctx.fillStyle = pants;
      ctx.fillRect(x, y - 2, 2, 2); // legs
    }
  }
}
