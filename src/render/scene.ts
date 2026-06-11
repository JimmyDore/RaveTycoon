import type { GearCategory, SpotId } from '../core/types';
import type { RaverSim } from './ravers';

/** Internal pixel resolution; scaled up with image-rendering: pixelated. */
export const SCENE_W = 320;
export const SCENE_H = 180;
export const GROUND_Y = 108;

export interface SceneParams {
  spotId: SpotId;
  /** night progress 0 → 1 (sunrise) */
  progress: number;
  gear: Record<GearCategory, number>;
  heat: number;
  brownout: boolean;
  beatPhase: number;
  vibe: number;
  busted: boolean;
  crowd: number;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hex(c: string): Rgb {
  return {
    r: parseInt(c.slice(1, 3), 16),
    g: parseInt(c.slice(3, 5), 16),
    b: parseInt(c.slice(5, 7), 16),
  };
}

function lerpColor(a: Rgb, b: Rgb, t: number): string {
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${m(a.r, b.r)}, ${m(a.g, b.g)}, ${m(a.b, b.b)})`;
}

const NIGHT_TOP = hex('#070512');
const NIGHT_BOT = hex('#1b1038');
const DAWN_TOP = hex('#3a4a8c');
const DAWN_BOT = hex('#f08a4b');
const SUNRISE_TOP = hex('#7c9fd4');
const SUNRISE_BOT = hex('#ffd166');

export class SceneRenderer {
  private buffer: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private ctx: CanvasRenderingContext2D;
  private stars: Array<{ x: number; y: number; tw: number }> = [];

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.buffer = document.createElement('canvas');
    this.buffer.width = SCENE_W;
    this.buffer.height = SCENE_H;
    this.bctx = this.buffer.getContext('2d')!;
    for (let i = 0; i < 60; i++) {
      this.stars.push({
        x: Math.floor(Math.random() * SCENE_W),
        y: Math.floor(Math.random() * (GROUND_Y - 40)),
        tw: Math.random(),
      });
    }
  }

  render(p: SceneParams, ravers: RaverSim, timeMs: number): void {
    const c = this.bctx;
    this.drawSky(c, p, timeMs);
    this.drawBackdrop(c, p);
    this.drawGround(c, p);
    this.drawStacks(c, p);
    ravers.draw(c, p.beatPhase, p.brownout ? 0 : p.vibe, ravers.overflow(p.crowd));
    this.drawBooth(c, p);
    this.drawLights(c, p, timeMs);
    if (p.busted || p.heat > 0.85) this.drawGyro(c, p, timeMs);
    this.blit();
  }

  private blit(): void {
    const { canvas, ctx } = this;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth * dpr;
    const h = canvas.clientHeight * dpr;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    // cover-fit while preserving the pixel aspect
    const scale = Math.max(w / SCENE_W, h / SCENE_H);
    const dw = SCENE_W * scale;
    const dh = SCENE_H * scale;
    ctx.drawImage(this.buffer, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  private skyPhase(progress: number): number {
    // hold deep night for most of the run, dawn ramps in over the last third
    return Math.pow(Math.max(0, (progress - 0.55) / 0.45), 1.6);
  }

  private drawSky(c: CanvasRenderingContext2D, p: SceneParams, timeMs: number): void {
    const t = this.skyPhase(p.progress);
    const top = t < 0.6 ? lerpColor(NIGHT_TOP, DAWN_TOP, t / 0.6) : lerpColor(DAWN_TOP, SUNRISE_TOP, (t - 0.6) / 0.4);
    const bot = t < 0.6 ? lerpColor(NIGHT_BOT, DAWN_BOT, t / 0.6) : lerpColor(DAWN_BOT, SUNRISE_BOT, (t - 0.6) / 0.4);
    const grad = c.createLinearGradient(0, 0, 0, GROUND_Y);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bot);
    c.fillStyle = grad;
    c.fillRect(0, 0, SCENE_W, GROUND_Y);

    // stars fade out at dawn
    if (t < 0.7) {
      for (const s of this.stars) {
        const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(timeMs / 900 + s.tw * 7));
        c.fillStyle = `rgba(255,255,230,${(0.7 - t) * twinkle})`;
        c.fillRect(s.x, s.y, 1, 1);
      }
    }
    // moon, then the sun climbs
    if (t < 0.5) {
      c.fillStyle = `rgba(230,230,255,${0.9 - t})`;
      c.fillRect(264, 22, 6, 6);
      c.fillRect(263, 23, 8, 4);
    }
    if (t > 0.25) {
      const sunY = GROUND_Y + 8 - (t - 0.25) * 75;
      const glow = c.createRadialGradient(160, sunY, 2, 160, sunY, 40);
      glow.addColorStop(0, `rgba(255,230,150,${0.9 * t})`);
      glow.addColorStop(1, 'rgba(255,200,100,0)');
      c.fillStyle = glow;
      c.fillRect(110, sunY - 45, 100, 90);
      c.fillStyle = `rgba(255,238,170,${Math.min(1, t * 1.4)})`;
      c.fillRect(155, Math.round(sunY) - 5, 10, 10);
      c.fillRect(153, Math.round(sunY) - 3, 14, 6);
    }
  }

  private silhouette(p: SceneParams): string {
    const t = this.skyPhase(p.progress);
    return lerpColor(hex('#0d0a1a'), hex('#3d2c52'), t);
  }

  private drawBackdrop(c: CanvasRenderingContext2D, p: SceneParams): void {
    const col = this.silhouette(p);
    c.fillStyle = col;
    switch (p.spotId) {
      case 'champ': {
        // rolling hills + the crew's van
        c.beginPath();
        c.moveTo(0, GROUND_Y);
        for (let x = 0; x <= SCENE_W; x += 8) {
          c.lineTo(x, GROUND_Y - 10 - 8 * Math.sin(x / 50) - 4 * Math.sin(x / 23));
        }
        c.lineTo(SCENE_W, GROUND_Y);
        c.fill();
        this.drawVan(c, 18, GROUND_Y - 2);
        break;
      }
      case 'foret': {
        for (let i = 0; i < 26; i++) {
          const x = (i * 137) % SCENE_W;
          const h = 34 + ((i * 53) % 30);
          c.fillRect(x, GROUND_Y - h, 3, h);
          for (let l = 0; l < 4; l++) {
            const ly = GROUND_Y - h + l * 7;
            const lw = 11 - l * 2;
            c.fillRect(x - lw / 2 + 1, ly, lw, 3);
          }
        }
        this.drawVan(c, 270, GROUND_Y - 2);
        break;
      }
      case 'carriere': {
        // sheer rock walls boxing the floor in
        c.beginPath();
        c.moveTo(0, GROUND_Y);
        c.lineTo(0, 18);
        c.lineTo(36, 30);
        c.lineTo(58, 64);
        c.lineTo(78, GROUND_Y);
        c.fill();
        c.beginPath();
        c.moveTo(SCENE_W, GROUND_Y);
        c.lineTo(SCENE_W, 12);
        c.lineTo(SCENE_W - 42, 26);
        c.lineTo(SCENE_W - 62, 58);
        c.lineTo(SCENE_W - 80, GROUND_Y);
        c.fill();
        break;
      }
      case 'hangar': {
        // city skyline behind a big shed skeleton
        for (let i = 0; i < 14; i++) {
          const x = i * 24;
          const h = 26 + ((i * 31) % 38);
          c.fillRect(x, GROUND_Y - h, 18, h);
          c.fillStyle = 'rgba(255, 220, 120, 0.25)';
          for (let wy = GROUND_Y - h + 4; wy < GROUND_Y - 6; wy += 7) {
            if ((wy + i) % 3 === 0) c.fillRect(x + 4, wy, 2, 3);
            if ((wy + i) % 4 === 0) c.fillRect(x + 11, wy, 2, 3);
          }
          c.fillStyle = this.silhouette(p);
        }
        c.fillRect(0, 8, SCENE_W, 6);
        for (let x = 8; x < SCENE_W; x += 40) c.fillRect(x, 8, 5, GROUND_Y - 8);
        break;
      }
      case 'friche': {
        // chimneys, gantries, dead factory
        c.fillRect(20, 26, 12, GROUND_Y - 26);
        c.fillRect(44, 44, 9, GROUND_Y - 44);
        c.fillRect(250, 20, 14, GROUND_Y - 20);
        c.fillRect(284, 50, 10, GROUND_Y - 50);
        c.fillRect(60, 70, 130, 6);
        c.fillRect(120, 70, 6, GROUND_Y - 70);
        c.fillRect(96, 52, 60, 4);
        break;
      }
      case 'teknival': {
        // endless plain with distant sound walls and tents
        for (let i = 0; i < 9; i++) {
          const x = 10 + i * 36;
          c.fillRect(x, GROUND_Y - 14, 10, 14);
          c.fillRect(x + 2, GROUND_Y - 18, 6, 4);
        }
        for (let i = 0; i < 12; i++) {
          const x = (i * 29 + 7) % SCENE_W;
          c.beginPath();
          c.moveTo(x, GROUND_Y - 1);
          c.lineTo(x + 5, GROUND_Y - 7);
          c.lineTo(x + 10, GROUND_Y - 1);
          c.fill();
        }
        break;
      }
    }
  }

  private drawVan(c: CanvasRenderingContext2D, x: number, y: number): void {
    c.fillStyle = '#4a4458';
    c.fillRect(x, y - 14, 30, 12);
    c.fillRect(x + 24, y - 18, 6, 4);
    c.fillStyle = '#2a2433';
    c.fillRect(x + 4, y - 11, 7, 5);
    c.fillStyle = '#15121c';
    c.fillRect(x + 4, y - 3, 5, 4);
    c.fillRect(x + 21, y - 3, 5, 4);
  }

  private drawGround(c: CanvasRenderingContext2D, p: SceneParams): void {
    const t = this.skyPhase(p.progress);
    const groundCols: Record<SpotId, [string, string]> = {
      champ: ['#1d2415', '#3a4423'],
      foret: ['#161e12', '#2c3a1e'],
      carriere: ['#221f24', '#3e3a40'],
      hangar: ['#1d1b20', '#34313a'],
      friche: ['#211d1b', '#3b342e'],
      teknival: ['#1c2113', '#384022'],
    };
    const [nightG, dawnG] = groundCols[p.spotId];
    c.fillStyle = lerpColor(hex(nightG), hex(dawnG), t);
    c.fillRect(0, GROUND_Y, SCENE_W, SCENE_H - GROUND_Y);
    // mud/texture specks
    c.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 90; i++) {
      const x = (i * 67) % SCENE_W;
      const y = GROUND_Y + ((i * 41) % (SCENE_H - GROUND_Y));
      c.fillRect(x, y, 2, 1);
    }
  }

  /** The hero asset: speaker stacks scale visibly with owned gear. */
  private drawStacks(c: CanvasRenderingContext2D, p: SceneParams): void {
    const kick = p.brownout ? 0 : p.beatPhase < 0.15 ? 1 : 0;
    const subTier = p.gear.subs;
    const ampTier = p.gear.amps;
    const rows = 2 + subTier;       // sub cabinets per stack
    const tops = 1 + ampTier;       // mid/top cabinets
    for (const side of [-1, 1]) {
      const cx = 160 + side * (52 + subTier * 6);
      const w = 16 + subTier * 3;
      let y = GROUND_Y + 14;
      // subs (big cabinets with a cone)
      for (let i = 0; i < rows; i++) {
        y -= 11;
        const x = Math.round(cx - w / 2);
        c.fillStyle = '#181420';
        c.fillRect(x, y, w, 10);
        c.fillStyle = '#0c0a12';
        c.fillRect(x + 2, y + 2, w - 4, 6);
        // cone pulses on the kick
        c.fillStyle = kick ? '#5a5470' : '#2e2a3c';
        const cone = Math.round(w / 2) - 3 + kick;
        c.fillRect(Math.round(cx - cone / 2), y + 5 - Math.round(cone / 2) + 2, cone, cone);
      }
      // tops
      for (let i = 0; i < tops; i++) {
        y -= 7;
        const tw = w - 6;
        const x = Math.round(cx - tw / 2);
        c.fillStyle = '#1c1826';
        c.fillRect(x, y, tw, 6);
        c.fillStyle = kick ? '#6c6488' : '#363046';
        c.fillRect(x + 2, y + 2, 2, 2);
        c.fillRect(x + tw - 4, y + 2, 2, 2);
      }
    }
    // generator at the side, sputtering during brownouts
    const gx = 290;
    c.fillStyle = '#23202c';
    c.fillRect(gx, GROUND_Y + 6, 16, 9);
    c.fillStyle = p.brownout ? '#ff5544' : '#44ff88';
    c.fillRect(gx + 13, GROUND_Y + 8, 2, 2);
    if (!p.brownout && p.gear.gen >= 0) {
      c.fillStyle = 'rgba(180,180,180,0.25)';
      c.fillRect(gx + 2, GROUND_Y + 2 - (Date.now() / 300 % 3 | 0), 2, 2);
    }
  }

  private drawBooth(c: CanvasRenderingContext2D, p: SceneParams): void {
    // DJ table front-center-bottom
    const x = 138;
    const y = SCENE_H - 26;
    c.fillStyle = '#241f30';
    c.fillRect(x, y, 44, 14);
    c.fillStyle = '#161220';
    c.fillRect(x + 2, y + 2, 40, 4);
    // desk LEDs follow the beat
    const on = p.beatPhase < 0.2 && !p.brownout;
    c.fillStyle = on ? '#39ff88' : '#1d4733';
    c.fillRect(x + 5, y + 8, 3, 2);
    c.fillStyle = on ? '#ffcc33' : '#4d4220';
    c.fillRect(x + 11, y + 8, 3, 2);
    c.fillStyle = p.heat > 0.6 ? '#ff3344' : '#4d1d22';
    c.fillRect(x + 17, y + 8, 3, 2);
    // the tonton derrière les platines
    c.fillStyle = '#e8b88a';
    c.fillRect(x + 28, y - 6, 3, 3);
    c.fillStyle = '#30284a';
    c.fillRect(x + 27, y - 3, 5, 4);
  }

  private drawLights(c: CanvasRenderingContext2D, p: SceneParams, timeMs: number): void {
    if (p.brownout || p.vibe < 0.3) return;
    const beams = 2 + Math.floor(p.vibe * 3);
    for (let i = 0; i < beams; i++) {
      const sweep = Math.sin(timeMs / (700 + i * 130) + i * 2.1);
      const hue = (timeMs / 30 + i * 60) % 360;
      c.strokeStyle = `hsla(${hue}, 90%, 60%, ${0.10 + p.vibe * 0.12})`;
      c.lineWidth = 3;
      c.beginPath();
      const ox = 160 + (i - beams / 2) * 30;
      c.moveTo(ox, GROUND_Y - 4);
      c.lineTo(ox + sweep * 90, 0);
      c.stroke();
    }
  }

  private drawGyro(c: CanvasRenderingContext2D, p: SceneParams, timeMs: number): void {
    // les gyrophares — blue strobes sweeping in from the edges
    const flash = Math.sin(timeMs / 110) > 0;
    const intensity = p.busted ? 0.4 : (p.heat - 0.85) * 2;
    c.fillStyle = flash
      ? `rgba(40, 90, 255, ${0.25 * intensity + 0.1})`
      : `rgba(255, 40, 60, ${0.18 * intensity + 0.06})`;
    c.fillRect(0, 0, 46, SCENE_H);
    c.fillRect(SCENE_W - 46, 0, 46, SCENE_H);
  }
}
