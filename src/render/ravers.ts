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
  /** danse dans le pit, collé au rail de barrières */
  pit: boolean;
  /** les plus chauds : lift animé en continu quand la vibe monte */
  hyper: boolean;
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
  /** nombre de personnages dans le sheet — fixé au boot via setCharCount */
  private charCount = 20;

  constructor(
    private floor: DanceFloor,
    private cap: number = deviceSpriteCap(),
    rng: () => number = Math.random,
  ) {
    this.rng = rng;
  }

  /** Connu dès le boot (bank.meta.characters) : les premiers spawns d'une nuit
   * piochent déjà parmi toutes les teintes du sheet, pas seulement le fallback. */
  setCharCount(n: number): void {
    this.charCount = Math.max(1, n);
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

  private danceSpot(): { x: number; y: number; pit: boolean } {
    const cx = this.floor.x + this.floor.w / 2;
    // une moitié file au pit : bande étroite collée au rail de barrières
    if (this.rng() < 0.5) {
      const r = (this.rng() + this.rng() + this.rng()) / 3;
      return { x: cx + (r - 0.5) * 170, y: this.floor.y + Math.pow(this.rng(), 2) * 22, pit: true };
    }
    // le reste du floor, distribution piquée vers le haut-centre
    const r = (this.rng() + this.rng() + this.rng()) / 3;
    const x = cx + (r - 0.5) * this.floor.w;
    const y = this.floor.y + Math.pow(this.rng(), 1.9) * this.floor.h;
    return { x, y, pit: false };
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
          character: Math.floor(this.rng() * this.charCount),
          phaseOffset: this.rng(),
          // le pit attire les plus chauds : seuil bras-en-l'air plus bas
          hype: to.pit ? 0.25 + this.rng() * 0.3 : 0.35 + this.rng() * 0.5,
          pit: to.pit,
          hyper: this.rng() < 0.3,
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
          r.pit = p.pit;
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
    dropPulse = 0,
  ): void {
    // points de densité au-delà du cap : packés vers la scène, pulsés au beat,
    // teinte froide → chaude avec la vibe
    if (overflowCrowd > 0) {
      const cx = this.floor.x + this.floor.w / 2;
      const kick = beatPhase < 0.18 ? 0.14 : 0;
      const cr = Math.round(150 + vibe * 105);
      const cg = Math.round(125 + vibe * 45);
      const cb = Math.round(235 - vibe * 130);
      ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.4 + kick})`;
      const dots = Math.min(overflowCrowd, 800);
      for (let i = 0; i < dots; i++) {
        const fx = ((i * 73) % 197) / 197;
        const fy = ((i * 151) % 89) / 89;
        const fp = ((i * 37) % 61) / 61;
        // rangées resserrées vers le haut-centre : y quadratique, x qui s'évase
        const y = this.floor.y - 4 + fy * fy * this.floor.h * 0.5;
        const x = cx + (fx - 0.5) * this.floor.w * (0.45 + 0.55 * fy);
        // hop d'1px déphasé par point — la nappe respire sur le beat
        const hop = (beatPhase + fp) % 1 < 0.5 ? 1 : 0;
        ctx.fillRect(Math.round(x), Math.round(y) - hop, 1, 1);
      }
    }

    // tri en place par y (peinture du fond vers l'avant) : la foule est quasi
    // triée d'une frame à l'autre et l'ordre du tableau n'a pas d'autre sémantique
    // — pas de clone, zéro allocation par frame
    this.ravers.sort((a, b) => a.y - b.y);
    const halfW = bank.meta.frameW / 2;
    const fullH = bank.meta.frameH;
    for (const r of this.ravers) {
      const phase = (beatPhase + r.phaseOffset) % 1;
      const x = Math.round(r.x - halfW);
      let y = Math.round(r.y - fullH);
      if (r.state === 'dancing') {
        // beat-synced pixel hop, harder when the vibe is high — figé sur coupure
        const hop = vibe < 0.05 ? 0 : phase < 0.5 ? Math.round(1 + vibe * 1.6) : 0;
        y -= hop;
        // la vague du drop : les bras se lèvent du pit vers le fond sur ~0.8s
        const depth = (r.y - this.floor.y) / this.floor.h;
        const dropLift = dropPulse > 0 && (1 - dropPulse) * 1.4 >= depth;
        if (r.pit && r.hyper && vibe > 0.55) {
          // les plus chauds du pit : lift animé en continu, bras jamais baissés
          const frame = Math.floor(timeMs / 110 + r.phaseOffset * 14) % 14;
          drawRaverFrame(ctx, bank, r.character, 'lift', r.facing, frame, x, y);
        } else if (dropLift || vibe > r.hype) {
          // hands in the air — hold an arms-up frame from the lift animation
          const frame = 8 + (phase < 0.5 ? 1 : 0);
          drawRaverFrame(ctx, bank, r.character, 'lift', r.facing, frame, x, y - (dropLift ? 1 : 0));
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
