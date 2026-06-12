import { SPOTS } from '../core/data';
import type { GearBranch, GearCategory, SpotId } from '../core/types';
import type { RaverSim, DanceFloor } from './ravers';
import { buildRig, rigKey, type StageRig } from './rig';
import { drawAnimatedFrame, drawRaverFrame, type PropName, type SpriteBank, type TerrainName } from './sprites';

/** Internal pixel resolution; scaled up with image-rendering: pixelated. */
export const SCENE_W = 480;
export const SCENE_H = 270;
/** Stage band occupies the top of the scene; the floor starts below it. */
export const STAGE_BOTTOM = 84;

export interface SceneParams {
  spotId: SpotId;
  /** night progress 0 → 1 (sunrise) */
  progress: number;
  gear: Record<GearCategory, number>;
  /** voie choisie par catégorie (visuels A/B branche-spécifiques) */
  gearBranch: Partial<Record<GearCategory, GearBranch>>;
  /** jauge de montée [0,1] — 0 hors set (réactivité au drop) */
  montee: number;
  /** mur de son grillé (stack penché, étincelles) */
  murBlown: boolean;
  heat: number;
  /** sound currently cut (brownout / repairs) */
  soundCut: boolean;
  beatPhase: number;
  vibe: number;
  busted: boolean;
  crowd: number;
  /** ravers.png row of the DJ currently playing, or null between sets */
  djCharacter: number | null;
}

export function defaultFloor(): DanceFloor {
  return { x: 24, y: STAGE_BOTTOM + 12, w: SCENE_W - 48, h: SCENE_H - STAGE_BOTTOM - 40 };
}

interface PropPlacement {
  prop: PropName;
  x: number;
  y: number;
  /** 'front' = dessiné après la foule (cadre le bas d'écran), défaut 'back' */
  layer?: 'back' | 'front';
}

interface SpotRecipe {
  terrain: TerrainName[];
  /** props behind/around the floor */
  props: PropPlacement[];
  /** light sources punched through the darkness — cold = halo bleuté (lampadaires) */
  fires: Array<{ x: number; y: number; r: number; cold?: boolean }>;
  /** guirlandes lumineuses tendues entre deux ancres (points canvas, éteintes à l'aube) */
  garlands?: Array<{ x1: number; y1: number; x2: number; y2: number }>;
}

/** Demi-largeur du deck par spot : les grosses jauges (cap ≥ 400) montent la scène modulaire élargie. */
const STAGE_HALF_W: Partial<Record<SpotId, number>> = Object.fromEntries(
  SPOTS.map((s) => [s.id, s.cap >= 400 ? 160 : 96]),
);

/** Teintes des ampoules de guirlande, alternées le long du fil. */
const GARLAND_HUES = ['#ffd87a', '#ff9d6b', '#9be8ff', '#ffb3e6'] as const;

const RECIPES: Record<SpotId, SpotRecipe> = {
  champ: {
    terrain: ['grass_1', 'grass_2'],
    props: [
      { prop: 'camper_right', x: 8, y: 180 },
      { prop: 'tree_med_1', x: 430, y: 90 },
      { prop: 'tree_med_2', x: 4, y: 96 },
      { prop: 'tent_1', x: 410, y: 200 },
      { prop: 'tent_4', x: 444, y: 150 },
      { prop: 'campfire_1', x: 396, y: 224 },
      { prop: 'bush_1', x: 60, y: 240 },
      { prop: 'lantern_1', x: 392, y: 198 },
      { prop: 'lantern_2', x: 58, y: 222 },
      { prop: 'bush_2', x: 210, y: 250, layer: 'front' },
      { prop: 'bush_1', x: 330, y: 254, layer: 'front' },
    ],
    fires: [
      { x: 404, y: 232, r: 30 },
      { x: 400, y: 206, r: 15 },
      { x: 66, y: 230, r: 15 },
    ],
    garlands: [{ x1: 20, y1: 106, x2: 438, y2: 98 }],
  },
  foret: {
    terrain: ['grass_2', 'grass_1'],
    props: [
      { prop: 'tree_big', x: 0, y: 86 },
      { prop: 'tree_med_1', x: 52, y: 100 },
      { prop: 'tree_med_2', x: 416, y: 88 },
      { prop: 'tree_med_3', x: 372, y: 104 },
      { prop: 'tree_big', x: 430, y: 180 },
      { prop: 'tree_med_3', x: 8, y: 190 },
      { prop: 'tree_med_1', x: 446, y: 120 },
      { prop: 'camper_right', x: 16, y: 222 },
      { prop: 'tent_2', x: 430, y: 214 },
      { prop: 'bush_1', x: 100, y: 244 },
      { prop: 'bush_2', x: 360, y: 250 },
      { prop: 'campfire_1', x: 70, y: 230 },
      { prop: 'lantern_1', x: 130, y: 238 },
      { prop: 'lantern_2', x: 350, y: 244 },
      { prop: 'tree_med_3', x: 210, y: 238, layer: 'front' },
    ],
    fires: [
      { x: 78, y: 238, r: 28 },
      { x: 138, y: 246, r: 14 },
      { x: 358, y: 252, r: 14 },
    ],
    garlands: [{ x1: 66, y1: 112, x2: 430, y2: 100 }],
  },
  carriere: {
    terrain: ['asphalt_1', 'asphalt_2', 'asphalt_3'],
    props: [
      { prop: 'container_1', x: 6, y: 96 },
      { prop: 'barrel_1', x: 70, y: 104 },
      { prop: 'container_2', x: 410, y: 92 },
      { prop: 'scrap_pile', x: 444, y: 150 },
      { prop: 'barrel_2', x: 20, y: 200 },
      { prop: 'camper_left', x: 380, y: 218 },
      { prop: 'street_lamp_2', x: 4, y: 118 },
      { prop: 'street_lamp_2', x: 460, y: 188 },
      { prop: 'barrel_1', x: 444, y: 220 },
      { prop: 'barrel_2', x: 180, y: 252, layer: 'front' },
    ],
    fires: [
      { x: 40, y: 214, r: 26 },
      { x: 12, y: 128, r: 18, cold: true },
      { x: 468, y: 198, r: 18, cold: true },
    ],
  },
  plage: {
    terrain: ['grass_3', 'grass_1'],
    props: [
      { prop: 'camper_right', x: 10, y: 190 },
      { prop: 'bush_2', x: 60, y: 96 },
      { prop: 'bush_1', x: 420, y: 100 },
      { prop: 'tent_2', x: 430, y: 190 },
      { prop: 'tent_4', x: 2, y: 150 },
      { prop: 'campfire_1', x: 400, y: 220 },
      { prop: 'flag_red', x: 442, y: 130 },
      { prop: 'lantern_1', x: 434, y: 172 },
      { prop: 'lantern_2', x: 56, y: 234 },
      { prop: 'bush_1', x: 300, y: 252, layer: 'front' },
    ],
    fires: [
      { x: 408, y: 228, r: 32 },
      { x: 442, y: 180, r: 14 },
      { x: 64, y: 242, r: 14 },
    ],
    garlands: [{ x1: 70, y1: 104, x2: 430, y2: 108 }],
  },
  hangar: {
    terrain: ['asphalt_2', 'asphalt_1', 'asphalt_3'],
    props: [
      { prop: 'fence_work_1', x: 0, y: 92 },
      { prop: 'fence_work_2', x: 448, y: 92 },
      { prop: 'container_1', x: 420, y: 200 },
      { prop: 'barrel_1', x: 8, y: 160 },
      { prop: 'barrel_2', x: 26, y: 168 },
      { prop: 'barrier', x: 8, y: 236 },
      { prop: 'barrier', x: 440, y: 236 },
      { prop: 'street_lamp_1', x: 0, y: 108 },
      { prop: 'street_lamp_1', x: 448, y: 108 },
      { prop: 'portaloo_1', x: 446, y: 160 },
      { prop: 'barrier', x: 196, y: 252, layer: 'front' },
      { prop: 'barrier', x: 256, y: 252, layer: 'front' },
    ],
    fires: [
      { x: 16, y: 118, r: 20, cold: true },
      { x: 464, y: 118, r: 20, cold: true },
    ],
  },
  tunnel: {
    terrain: ['asphalt_1', 'asphalt_3'],
    props: [
      { prop: 'container_1', x: 4, y: 92 },
      { prop: 'container_2', x: 430, y: 92 },
      { prop: 'barrel_1', x: 70, y: 108 },
      { prop: 'scrap_pile', x: 16, y: 200 },
      { prop: 'barrel_2', x: 420, y: 160 },
      { prop: 'barrier', x: 8, y: 236 },
      { prop: 'barrier', x: 440, y: 236 },
      { prop: 'street_lamp_2', x: 4, y: 148 },
      { prop: 'street_lamp_2', x: 460, y: 148 },
      { prop: 'scrap_pile', x: 432, y: 232 },
      { prop: 'barrel_1', x: 170, y: 252, layer: 'front' },
      { prop: 'scrap_pile', x: 280, y: 248, layer: 'front' },
    ],
    fires: [
      { x: 90, y: 116, r: 22 },
      { x: 12, y: 158, r: 18, cold: true },
      { x: 468, y: 158, r: 18, cold: true },
    ],
  },
  chateau: {
    terrain: ['grass_2', 'grass_3'],
    props: [
      { prop: 'bunker', x: 8, y: 86 },
      { prop: 'tree_big', x: 430, y: 88 },
      { prop: 'tree_med_2', x: 380, y: 102 },
      { prop: 'tent_1', x: 10, y: 200 },
      { prop: 'tent_3', x: 430, y: 196 },
      { prop: 'campfire_1', x: 60, y: 226 },
      { prop: 'camper_left', x: 380, y: 230 },
      { prop: 'stand_1', x: 104, y: 234 },
      { prop: 'food_cart', x: 188, y: 232 },
      { prop: 'lantern_1', x: 6, y: 152 },
      { prop: 'lantern_2', x: 456, y: 168 },
      { prop: 'flag_blue', x: 444, y: 128 },
      { prop: 'flag_blue', x: 262, y: 250, layer: 'front' },
    ],
    fires: [
      { x: 68, y: 234, r: 28 },
      // le bunker éclairé de l'intérieur — le squat vit
      { x: 40, y: 118, r: 26 },
      { x: 14, y: 160, r: 14 },
      { x: 464, y: 176, r: 14 },
    ],
  },
  friche: {
    terrain: ['asphalt_3', 'asphalt_1', 'asphalt_2'],
    props: [
      { prop: 'bunker', x: 6, y: 88 },
      { prop: 'scrap_pile', x: 440, y: 96 },
      { prop: 'container_2', x: 404, y: 130 },
      { prop: 'barrel_1', x: 60, y: 110 },
      { prop: 'scrap_pile', x: 10, y: 226 },
      { prop: 'fence_work_2', x: 444, y: 210 },
      { prop: 'camper_left', x: 360, y: 236 },
      { prop: 'street_lamp_1', x: 0, y: 138 },
      { prop: 'street_lamp_2', x: 460, y: 100 },
      { prop: 'portaloo_2', x: 446, y: 154 },
      { prop: 'barrel_2', x: 96, y: 244 },
      { prop: 'scrap_pile', x: 220, y: 250, layer: 'front' },
      { prop: 'barrel_1', x: 320, y: 254, layer: 'front' },
    ],
    fires: [
      { x: 80, y: 120, r: 24 },
      { x: 16, y: 148, r: 20, cold: true },
      { x: 468, y: 110, r: 18, cold: true },
    ],
  },
  teknival: {
    terrain: ['grass_1', 'grass_2'],
    props: [
      // murs de son à perte de vue : colonnes d'enceintes sur les deux bords
      { prop: 'speaker_medium', x: 6, y: 92 },
      { prop: 'speaker_medium', x: -8, y: 124 },
      { prop: 'speaker_medium', x: -8, y: 158 },
      { prop: 'speaker_medium', x: -8, y: 192 },
      { prop: 'speaker_medium', x: 446, y: 92 },
      { prop: 'speaker_medium', x: 456, y: 124 },
      { prop: 'speaker_medium', x: 456, y: 158 },
      { prop: 'speaker_medium', x: 456, y: 192 },
      { prop: 'tent_1', x: 6, y: 196 },
      { prop: 'tent_2', x: 44, y: 216 },
      { prop: 'tent_3', x: 420, y: 192 },
      { prop: 'tent_4', x: 442, y: 222 },
      { prop: 'campfire_1', x: 36, y: 248 },
      { prop: 'campfire_1', x: 430, y: 250 },
      { prop: 'camper_right', x: 90, y: 238 },
      { prop: 'camper_left', x: 330, y: 240 },
      // le campement dense du milieu : tentes, bouffe, feu central, sanitaires
      { prop: 'tent_2', x: 148, y: 236 },
      { prop: 'food_cart', x: 196, y: 230 },
      { prop: 'campfire_1', x: 240, y: 246 },
      { prop: 'tent_3', x: 262, y: 238 },
      { prop: 'portaloo_1', x: 458, y: 226 },
      { prop: 'portaloo_2', x: 0, y: 222 },
      { prop: 'flag_red', x: 120, y: 248, layer: 'front' },
      { prop: 'flag_blue', x: 340, y: 250, layer: 'front' },
    ],
    fires: [
      { x: 44, y: 254, r: 28 },
      { x: 438, y: 256, r: 28 },
      { x: 248, y: 254, r: 26 },
    ],
    garlands: [
      { x1: 10, y1: 104, x2: 470, y2: 104 },
      { x1: 112, y1: 232, x2: 352, y2: 236 },
    ],
  },
};

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hex(c: string): Rgb {
  return { r: parseInt(c.slice(1, 3), 16), g: parseInt(c.slice(3, 5), 16), b: parseInt(c.slice(5, 7), 16) };
}

function lerpColor(a: Rgb, b: Rgb, t: number): string {
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${m(a.r, b.r)}, ${m(a.g, b.g)}, ${m(a.b, b.b)})`;
}

export class SceneRenderer {
  private buffer: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private dark: HTMLCanvasElement;
  private dctx: CanvasRenderingContext2D;
  private terrainCache: HTMLCanvasElement | null = null;
  private terrainSpot: SpotId | null = null;
  private ctx: CanvasRenderingContext2D;
  /** rig de scène memoïsé (recalculé seulement quand le matos change) */
  private rig: StageRig | null = null;
  private rigId = '';
  /** demi-largeur du deck courant (96 = simple, 160 = scène modulaire élargie) */
  private halfW = 96;
  /** FSM machine à fumée : allumage → boucle → extinction */
  private fogPhase: 'off' | 'on' | 'loop' | 'stopping' = 'off';
  private fogSince = 0;
  /** détection du drop : chute brutale de la montée d'une frame à l'autre */
  private prevMontee = 0;
  private dropUntil = 0;

  constructor(private canvas: HTMLCanvasElement, private bank: SpriteBank) {
    this.ctx = canvas.getContext('2d')!;
    this.buffer = document.createElement('canvas');
    this.buffer.width = SCENE_W;
    this.buffer.height = SCENE_H;
    this.bctx = this.buffer.getContext('2d')!;
    this.dark = document.createElement('canvas');
    this.dark.width = SCENE_W;
    this.dark.height = SCENE_H;
    this.dctx = this.dark.getContext('2d')!;
  }

  render(p: SceneParams, ravers: RaverSim, timeMs: number): void {
    const c = this.bctx;
    c.imageSmoothingEnabled = false;
    const halfW = STAGE_HALF_W[p.spotId] ?? 96;
    const key = rigKey(p.gear, p.gearBranch, p.murBlown, halfW);
    if (key !== this.rigId || !this.rig) {
      this.rig = buildRig(p.gear, p.gearBranch, p.murBlown, SCENE_W / 2, STAGE_BOTTOM, halfW);
      this.rigId = key;
      this.halfW = halfW;
    }
    // le drop : la montée s'encaisse → ~0.8s de flash laser + bouffée de fumée
    if (this.prevMontee - p.montee > 0.2 && this.prevMontee > 0.35) this.dropUntil = timeMs + 800;
    this.prevMontee = p.montee;
    this.drawTerrain(c, p);
    this.drawProps(c, p);
    this.drawStage(c, p, timeMs);
    // dropPulse 1→0 sur la fenêtre du drop : la foule lève les bras en vague
    const dropPulse = p.soundCut ? 0 : Math.max(0, Math.min(1, (this.dropUntil - timeMs) / 800));
    ravers.draw(c, this.bank, p.beatPhase, p.soundCut ? 0 : p.vibe, ravers.overflow(p.crowd), timeMs, dropPulse);
    this.drawPropsFront(c, p);
    this.drawRigFront(c);
    this.drawDarkness(c, p, timeMs);
    if (!p.soundCut) this.drawGarlands(c, p, timeMs);
    if (!p.soundCut) this.drawLights(c, p, timeMs);
    if (p.busted || p.heat > 0.85) this.drawGyro(c, p, timeMs);
    this.blit();
  }

  private drawTerrain(c: CanvasRenderingContext2D, p: SceneParams): void {
    if (this.terrainSpot !== p.spotId || !this.terrainCache) {
      const cache = document.createElement('canvas');
      cache.width = SCENE_W;
      cache.height = SCENE_H;
      const tc = cache.getContext('2d')!;
      tc.imageSmoothingEnabled = false;
      const recipe = RECIPES[p.spotId];
      const tiles = recipe.terrain
        .map((t) => this.bank.terrain[t])
        .filter((t): t is HTMLImageElement => !!t);
      if (tiles.length === 0) {
        tc.fillStyle = '#243018';
        tc.fillRect(0, 0, SCENE_W, SCENE_H);
      } else {
        for (let ty = 0; ty < SCENE_H; ty += 16) {
          for (let tx = 0; tx < SCENE_W; tx += 16) {
            // deterministic variation, heavily biased to the first tile
            const h = (tx * 31 + ty * 17) % 13;
            const tile = tiles[h < 11 ? 0 : 1 % tiles.length];
            tc.drawImage(tile, 0, 0, 16, 16, tx, ty, 16, 16);
          }
        }
      }
      this.terrainCache = cache;
      this.terrainSpot = p.spotId;
    }
    c.drawImage(this.terrainCache, 0, 0);
  }

  private prop(c: CanvasRenderingContext2D, name: PropName, x: number, y: number): void {
    const img = this.bank.props[name];
    if (img) c.drawImage(img, x, y);
  }

  private drawProps(c: CanvasRenderingContext2D, p: SceneParams): void {
    for (const { prop, x, y, layer } of RECIPES[p.spotId].props) {
      if (layer !== 'front') this.prop(c, prop, x, y);
    }
  }

  /** Couche premier plan : props dessinés après la foule, cadrent le bas d'écran. */
  private drawPropsFront(c: CanvasRenderingContext2D, p: SceneParams): void {
    for (const { prop, x, y, layer } of RECIPES[p.spotId].props) {
      if (layer === 'front') this.prop(c, prop, x, y);
    }
  }

  /** Stage band: platform, the mur de son scaling with gear, booth and DJ. */
  private drawStage(c: CanvasRenderingContext2D, p: SceneParams, timeMs: number): void {
    const kick = !p.soundCut && p.beatPhase < 0.18;
    const cx = SCENE_W / 2;

    // wooden stage deck (fallback: the old flat platform)
    const deck = this.bank.props.stage_deck;
    const wide = this.halfW > 96;
    if (deck) {
      c.drawImage(deck, cx - 96, STAGE_BOTTOM - 90);
      if (wide) this.drawWideStage(c, cx);
    } else {
      c.fillStyle = '#171221';
      c.fillRect(cx - 120, 14, 240, STAGE_BOTTOM - 26);
      c.fillStyle = '#211a30';
      c.fillRect(cx - 120, STAGE_BOTTOM - 16, 240, 6);
      c.fillStyle = '#0e0a16';
      c.fillRect(cx - 124, 10, 248, 6);
    }

    // truss rig over the deck: top bar + hanging spotlights, legs spliced
    // from the tall source sprite so the whole thing fits the stage band
    const truss = this.bank.props.stage_big;
    if (truss) {
      c.drawImage(truss, 0, 8, 176, 64, cx - 88, -2, 176, 64);
      c.drawImage(truss, 0, 120, 176, 22, cx - 88, 62, 176, 22);
    }

    // spotlight masts
    this.prop(c, 'stage_spot_left', cx - 150, 8);
    this.prop(c, 'stage_spot_right', cx + 118, 8);

    // spots animés pendus au truss — voie B strobe les fait battre plus vite
    if (!p.soundCut && this.rig) {
      const fpsScale = p.gearBranch.lumieres === 'B' ? 1.5 : 1;
      for (const s of this.rig.spotlights) {
        drawAnimatedFrame(c, this.bank, 'spotlight', s.x, s.y, timeMs, { fpsScale });
      }
    }

    // groupe électrogène — vacille d'1px et crache une flamme sur coupure
    for (const g of this.rig?.generators ?? []) {
      const img = this.bank.props.generator;
      if (!img) break;
      const jx = p.soundCut && Math.floor(timeMs / 90) % 2 === 0 ? 1 : 0;
      c.drawImage(img, g.x + jx, g.y, img.width * g.scale, img.height * g.scale);
      if (p.soundCut) drawAnimatedFrame(c, this.bank, 'flame_3', g.x + 8 * g.scale, g.y - 10, timeMs);
    }

    // le mur de son — placements du rig (stacks câblés ou line array suspendu)
    for (const w of this.rig?.wall ?? []) {
      const img = this.bank.props[w.prop] ?? this.bank.props.speaker_big;
      if (!img) continue;
      if (w.blown) {
        // stack grillé : penché, une flammèche au sommet
        c.save();
        c.translate(w.x + 24, w.y + 48);
        c.rotate(-0.09);
        c.drawImage(img, -24, -48);
        c.restore();
        drawAnimatedFrame(c, this.bank, 'flame_3', w.x + 6, w.y - 8, timeMs);
      } else {
        c.drawImage(img, Math.round(w.x), Math.round(w.y - (kick ? 1 : 0)));
      }
    }

    // guetteurs logistique postés en lisière, l'œil sur les accès
    for (const lk of this.rig?.lookouts ?? []) {
      drawRaverFrame(c, this.bank, lk.character, 'idle', lk.facing, Math.floor(timeMs / 240) % 6, lk.x, lk.y);
    }
    // voie B mobilité : le camion d'évac garé moteur tourné vers la sortie
    if (this.rig?.evacCamper) this.prop(c, 'camper_left', this.rig.evacCamper.x, this.rig.evacCamper.y);

    // régie chirurgicale voie A : retours de scène posés autour de la cabine
    for (const m of this.rig?.monitors ?? []) this.prop(c, 'speaker_small', m.x, m.y);
    // voie B showmanship : spots modulaires qui clignotent de part et d'autre
    for (const s of this.rig?.blinkSpots ?? []) {
      const on = Math.floor(timeMs / 250) % 2 === 0;
      this.prop(c, `spot_mod_${s.side}_${on ? 2 : 1}` as PropName, s.x, s.y);
    }

    // voie B showmanship : DJ animé du pack concert (cabine comprise)
    const animDj = !!this.rig?.animatedDj && p.djCharacter !== null && !!this.bank.animated.concert_dj;
    if (animDj) {
      drawAnimatedFrame(c, this.bank, 'concert_dj', cx - 24, STAGE_BOTTOM - 54, timeMs);
    } else if (p.djCharacter !== null) {
      // the DJ, facing the crowd, behind the decks
      const bob = kick ? -1 : 0;
      drawRaverFrame(
        c,
        this.bank,
        p.djCharacter,
        'idle',
        'down',
        Math.floor(timeMs / 200) % 6,
        Math.round(cx - 8),
        STAGE_BOTTOM - 64 + bob,
      );
    }

    // booth: real turntable rig (fallback: the old black table) — le DJ animé embarque la sienne
    const djSet = this.bank.props.dj_set;
    if (!animDj) {
      if (djSet) {
        c.drawImage(djSet, cx - 24, STAGE_BOTTOM - 38);
      } else {
        c.fillStyle = '#0c0914';
        c.fillRect(cx - 30, STAGE_BOTTOM - 42, 60, 22);
      }
    }
    // status LEDs on the mixer: two blink with the kick, red tracks heat
    c.fillStyle = kick ? '#3affa0' : '#1c5e42';
    c.fillRect(cx - 3, STAGE_BOTTOM - 31, 2, 2);
    c.fillStyle = kick ? '#ffd166' : '#6e5a26';
    c.fillRect(cx + 1, STAGE_BOTTOM - 31, 2, 2);
    c.fillStyle = p.heat > 0.6 ? '#ff3b4e' : '#5e1c24';
    c.fillRect(cx - 1, STAGE_BOTTOM - 27, 2, 2);

    this.drawFog(c, p, timeMs);
    this.drawLasers(c, p, timeMs);
  }

  /** Scène modulaire élargie (cap ≥ 400) : ailes de deck, tours de structure,
   * travées de truss prolongées et escalier d'accès — 320px au lieu de 192. */
  private drawWideStage(c: CanvasRenderingContext2D, cx: number): void {
    const top = STAGE_BOTTOM - 90;
    // ailes de scène (64×96, même hauteur que le deck central)
    this.prop(c, 'side_stage_left', cx - 160, top);
    this.prop(c, 'side_stage_right', cx + 96, top);
    // tours de structure aux extrémités — sources 144px de haut, on ne garde
    // que le pied (96px) calé sur le bas du deck pour tenir dans le band
    const towerL = this.bank.props.stage_left;
    const towerR = this.bank.props.stage_right;
    if (towerL) c.drawImage(towerL, 0, 48, 32, 96, cx - 176, top, 32, 96);
    if (towerR) c.drawImage(towerR, 0, 48, 16, 96, cx + 158, top, 16, 96);
    // travées modulaires alignées sur la barre haute du truss (cx±88) jusqu'aux tours
    for (let i = 0; i < 4; i++) {
      this.prop(c, i % 2 === 0 ? 'stage_mid_1' : 'stage_mid_2', cx - 152 + i * 16, 10);
      this.prop(c, i % 2 === 0 ? 'stage_mid_2' : 'stage_mid_1', cx + 88 + i * 16, 10);
    }
    // escalier d'accès au bord avant de l'aile droite
    this.prop(c, 'stage_stairs', cx + 124, STAGE_BOTTOM);
  }

  /** Machine à fumée au pied de scène — FSM on/loop/off pilotée par vibe et drop. */
  private drawFog(c: CanvasRenderingContext2D, p: SceneParams, timeMs: number): void {
    const fog = this.rig?.fog;
    if (!fog) return;
    const want = !p.soundCut && (p.vibe > 0.45 || this.dropUntil > timeMs);
    if (want && this.fogPhase === 'off') {
      this.fogPhase = 'on';
      this.fogSince = timeMs;
    } else if (!want && (this.fogPhase === 'on' || this.fogPhase === 'loop')) {
      this.fogPhase = 'stopping';
      this.fogSince = timeMs;
    }
    if (this.fogPhase === 'on' && timeMs - this.fogSince >= 500) this.fogPhase = 'loop';
    if (this.fogPhase === 'stopping' && timeMs - this.fogSince >= 750) this.fogPhase = 'off';
    if (this.fogPhase === 'off') return;
    if (this.fogPhase === 'loop') {
      drawAnimatedFrame(c, this.bank, 'fog_loop', fog.x, fog.y, timeMs);
      // voie A hypnose : nappe dense — une seconde couche de fumée détourée
      if (fog.dense || this.dropUntil > timeMs) {
        c.save();
        c.globalAlpha = 0.7;
        drawAnimatedFrame(c, this.bank, 'fog_only_loop', fog.x + 34, fog.y + 4, timeMs + 400);
        c.restore();
      }
    } else {
      // allumage/extinction : frame indexée sur l'âge de la transition
      const sheet = this.fogPhase === 'on' ? 'fog_on' : 'fog_off';
      const last = this.fogPhase === 'on' ? 3 : 5;
      const frame = Math.min(last, Math.floor((timeMs - this.fogSince) / 125));
      drawAnimatedFrame(c, this.bank, sheet, fog.x, fog.y, timeMs, { frame });
    }
  }

  /** Machines laser aux coins de scène — nerveuses en voie B, déchaînées au drop. */
  private drawLasers(c: CanvasRenderingContext2D, p: SceneParams, timeMs: number): void {
    if (!this.rig || p.soundCut || p.vibe < 0.15) return;
    const drop = this.dropUntil > timeMs;
    const fpsScale = drop ? 2 : p.gearBranch.lumieres === 'B' ? 1.4 : 0.6;
    for (const l of this.rig.lasers) {
      drawAnimatedFrame(c, this.bank, l.sheet, l.x, l.y, timeMs, { fpsScale });
    }
  }

  /** Éléments du rig devant la foule : le rail de barrières contre lequel le pit pousse. */
  private drawRigFront(c: CanvasRenderingContext2D): void {
    for (const b of this.rig?.barriers ?? []) this.prop(c, b.prop, b.x, b.y);
  }

  /** Night darkness with warm light pools; fades out as sunrise approaches. */
  private drawDarkness(c: CanvasRenderingContext2D, p: SceneParams, timeMs: number): void {
    const dawn = Math.pow(Math.max(0, (p.progress - 0.55) / 0.45), 1.5);
    const alpha = 0.62 * (1 - dawn);
    if (alpha <= 0.02) {
      this.drawDawnTint(c, dawn);
      return;
    }
    const d = this.dctx;
    d.clearRect(0, 0, SCENE_W, SCENE_H);
    d.globalCompositeOperation = 'source-over';
    d.fillStyle = `rgba(7, 5, 22, ${alpha})`;
    d.fillRect(0, 0, SCENE_W, SCENE_H);

    // punch light pools out of the darkness
    d.globalCompositeOperation = 'destination-out';
    const stage = d.createRadialGradient(SCENE_W / 2, STAGE_BOTTOM - 20, 10, SCENE_W / 2, STAGE_BOTTOM - 20, 130);
    const flicker = p.soundCut ? 0.15 : 0.75 + 0.25 * Math.sin(timeMs / 90);
    stage.addColorStop(0, `rgba(0,0,0,${0.95 * flicker})`);
    stage.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = stage;
    d.fillRect(0, 0, SCENE_W, SCENE_H);
    for (const f of RECIPES[p.spotId].fires) {
      const fire = d.createRadialGradient(f.x, f.y, 2, f.x, f.y, f.r + Math.sin(timeMs / 150) * 3);
      fire.addColorStop(0, 'rgba(0,0,0,0.85)');
      fire.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = fire;
      d.fillRect(f.x - f.r - 6, f.y - f.r - 6, (f.r + 6) * 2, (f.r + 6) * 2);
    }
    d.globalCompositeOperation = 'source-over';
    c.drawImage(this.dark, 0, 0);

    // warm tint over the fire pools — froid bleuté pour les lampadaires industriels
    c.save();
    c.globalCompositeOperation = 'overlay';
    for (const f of RECIPES[p.spotId].fires) {
      const tint = c.createRadialGradient(f.x, f.y, 2, f.x, f.y, f.r);
      const rgb = f.cold ? '110, 160, 255' : '255, 150, 60';
      tint.addColorStop(0, `rgba(${rgb}, ${f.cold ? 0.45 : 0.5})`);
      tint.addColorStop(1, `rgba(${rgb}, 0)`);
      c.fillStyle = tint;
      c.fillRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
    }
    c.restore();
    this.drawDawnTint(c, dawn);
  }

  /** Guirlandes : ampoules scintillantes le long d'une caténaire entre deux ancres.
   * Alpha ∝ obscurité — elles s'éteignent quand l'aube se lève. */
  private drawGarlands(c: CanvasRenderingContext2D, p: SceneParams, timeMs: number): void {
    const garlands = RECIPES[p.spotId].garlands;
    if (!garlands) return;
    const dark = 1 - Math.pow(Math.max(0, (p.progress - 0.55) / 0.45), 1.5);
    if (dark <= 0.05) return;
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const g of garlands) {
      const dx = g.x2 - g.x1;
      const dy = g.y2 - g.y1;
      const sag = Math.hypot(dx, dy) / 10;
      const n = Math.max(6, Math.floor(Math.abs(dx) / 14));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        // caténaire approchée par une parabole, scintillement déphasé par ampoule
        const x = Math.round(g.x1 + dx * t);
        const y = Math.round(g.y1 + dy * t + sag * 4 * t * (1 - t));
        const twinkle = 0.55 + 0.45 * Math.sin(timeMs / 320 + i * 1.9);
        c.globalAlpha = dark * twinkle * 0.9;
        c.fillStyle = GARLAND_HUES[i % GARLAND_HUES.length];
        c.fillRect(x, y, 2, 2);
      }
    }
    c.restore();
  }

  private drawDawnTint(c: CanvasRenderingContext2D, dawn: number): void {
    if (dawn <= 0.05) return;
    const grad = c.createLinearGradient(0, 0, 0, SCENE_H);
    grad.addColorStop(0, `rgba(255, 170, 80, ${0.28 * dawn})`);
    grad.addColorStop(0.5, `rgba(255, 120, 90, ${0.12 * dawn})`);
    grad.addColorStop(1, 'rgba(255, 120, 90, 0)');
    c.fillStyle = grad;
    c.fillRect(0, 0, SCENE_W, SCENE_H);
  }

  /** Light show scales with the lumières tier. */
  private drawLights(c: CanvasRenderingContext2D, p: SceneParams, timeMs: number): void {
    const tier = p.gear.lumieres;
    if (tier <= 0 || p.vibe < 0.15) return;
    const cx = SCENE_W / 2;
    const beams = tier * 2;
    // voie A hypnose : balayages presque deux fois plus lents
    const slow = p.gearBranch.lumieres === 'A' ? 1.9 : 1;
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < beams; i++) {
      const sweep = Math.sin(timeMs / ((650 + i * 110) * slow) + i * 1.7);
      const hue = (timeMs / 25 + i * 55) % 360;
      c.strokeStyle = `hsla(${hue}, 95%, 60%, ${0.08 + p.vibe * 0.1})`;
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(cx + (i - beams / 2) * 16, STAGE_BOTTOM - 30);
      c.lineTo(cx + sweep * 220, SCENE_H);
      c.stroke();
    }
    // strobe on the beat at tier 2+
    if (tier >= 2 && p.vibe > 0.5 && p.beatPhase < 0.06) {
      c.fillStyle = 'rgba(255, 255, 255, 0.16)';
      c.fillRect(0, 0, SCENE_W, SCENE_H);
    }
    // voie B strobe : bursts blancs calés sur le beat
    if (p.gearBranch.lumieres === 'B' && tier >= 3 && p.vibe > 0.4 && p.beatPhase < 0.05) {
      c.fillStyle = 'rgba(255, 255, 255, 0.2)';
      c.fillRect(0, 0, SCENE_W, SCENE_H);
    }
    // le drop : white-out qui s'éteint sur ~0.8s
    if (this.dropUntil > timeMs) {
      const t = (this.dropUntil - timeMs) / 800;
      c.fillStyle = `rgba(255, 255, 255, ${0.3 * t})`;
      c.fillRect(0, 0, SCENE_W, SCENE_H);
    }
    c.restore();
  }

  private drawGyro(c: CanvasRenderingContext2D, p: SceneParams, timeMs: number): void {
    const flash = Math.sin(timeMs / 110) > 0;
    const intensity = p.busted ? 0.5 : (p.heat - 0.85) * 3;
    c.fillStyle = flash
      ? `rgba(40, 90, 255, ${0.22 * intensity + 0.08})`
      : `rgba(255, 40, 60, ${0.16 * intensity + 0.05})`;
    c.fillRect(0, 0, 60, SCENE_H);
    c.fillRect(SCENE_W - 60, 0, 60, SCENE_H);
  }

  private blit(): void {
    const { canvas, ctx } = this;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth * dpr;
    const h = canvas.clientHeight * dpr;
    if (w === 0 || h === 0) return;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b0813';
    ctx.fillRect(0, 0, w, h);
    // cover-fit, but never crop away more than ~28% of the scene width
    // (portrait phones must keep the speaker stacks in frame)
    const cover = Math.max(w / SCENE_W, h / SCENE_H);
    const maxCropScale = w / (SCENE_W * 0.72);
    const scale = Math.min(cover, Math.max(maxCropScale, w / SCENE_W));
    const dw = SCENE_W * scale;
    const dh = SCENE_H * scale;
    ctx.drawImage(this.buffer, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
}

const NIGHT_TOP = hex('#070512');
const DAWN_TOP = hex('#f08a4b');
export function skyAccent(progress: number): string {
  return lerpColor(NIGHT_TOP, DAWN_TOP, Math.pow(Math.max(0, (progress - 0.55) / 0.45), 1.5));
}
