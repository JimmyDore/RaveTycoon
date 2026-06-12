/** Loads the processed LimeZu sheets produced by `npm run assets`. */

export interface RaverSheetMeta {
  frameW: number;
  frameH: number;
  characters: number;
  idle: { start: number; perDir: number };
  walk: { start: number; perDir: number };
  lift: { start: number; perDir: number };
}

/** Direction row order in the LimeZu sheets. */
export const DIR = { right: 0, up: 1, left: 2, down: 3 } as const;
export type Direction = keyof typeof DIR;

const PROP_NAMES = [
  'speaker_big', 'speaker_medium', 'speaker_small',
  'stage_big', 'stage_small', 'stage_deck', 'dj_set', 'stage_spot_left', 'stage_spot_right',
  'tent_1', 'tent_2', 'tent_3', 'tent_4', 'campfire_1',
  'tree_big', 'tree_med_1', 'tree_med_2', 'tree_med_3', 'bush_1', 'bush_2',
  'camper_left', 'camper_right',
  'container_1', 'container_2', 'barrel_1', 'barrel_2', 'scrap_pile',
  'fence_work_1', 'fence_work_2', 'bunker', 'police_spot', 'barrier',
  'speaker_cable_1', 'speaker_cable_2', 'generator',
  'stage_barrier_1', 'stage_barrier_2', 'stage_barrier_3', 'stage_barrier_lat_1', 'stage_barrier_lat_2',
  'spot_mod_left_1', 'spot_mod_left_2', 'spot_mod_right_1', 'spot_mod_right_2',
  'street_lamp_1', 'street_lamp_2', 'lantern_1', 'lantern_2',
  'food_cart', 'portaloo_1', 'portaloo_2', 'stand_1', 'stand_2', 'flag_red', 'flag_blue',
  'stage_left', 'stage_mid_1', 'stage_mid_2', 'stage_right',
  'side_stage_left', 'side_stage_right', 'stage_stairs',
] as const;
export type PropName = (typeof PROP_NAMES)[number];

const TERRAIN_NAMES = ['grass_1', 'grass_2', 'grass_3', 'asphalt_1', 'asphalt_2', 'asphalt_3'] as const;
export type TerrainName = (typeof TERRAIN_NAMES)[number];

/** Sheets animés (frames côte à côte) — clés du manifest produit par `npm run assets`. */
const ANIMATED_NAMES = [
  'fog_loop', 'fog_on', 'fog_off', 'fog_only_loop', 'fog_only_on', 'fog_only_off',
  'laser_machine', 'laser_machine_2', 'laser_white', 'laser_white_2',
  'spotlight', 'spotlight_light_only',
  'concert_dj', 'singer_1', 'singer_2', 'singer_3', 'flame_3',
] as const;
export type AnimatedName = (typeof ANIMATED_NAMES)[number];

export interface AnimatedMeta {
  frameW: number;
  frameH: number;
  frames: number;
  fps: number;
}

export interface SpriteBank {
  ravers: HTMLImageElement;
  meta: RaverSheetMeta;
  props: Partial<Record<PropName, HTMLImageElement>>;
  terrain: Partial<Record<TerrainName, HTMLImageElement>>;
  animated: Partial<Record<AnimatedName, { img: HTMLImageElement; meta: AnimatedMeta }>>;
  ready: boolean;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function loadSprites(): Promise<SpriteBank> {
  const [ravers, metaRes, animManifest] = await Promise.all([
    loadImage('/assets/ravers.png'),
    fetch('/assets/ravers.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch('/assets/animated/manifest.json')
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, AnimatedMeta>>) : null))
      .catch(() => null),
  ]);
  const props: SpriteBank['props'] = {};
  const terrain: SpriteBank['terrain'] = {};
  const animated: SpriteBank['animated'] = {};
  await Promise.all([
    ...PROP_NAMES.map(async (name) => {
      const img = await loadImage(`/assets/props/${name}.png`);
      if (img) props[name] = img;
    }),
    ...TERRAIN_NAMES.map(async (name) => {
      const img = await loadImage(`/assets/terrain/${name}.png`);
      if (img) terrain[name] = img;
    }),
    ...ANIMATED_NAMES.map(async (name) => {
      const meta = animManifest?.[name];
      if (!meta) return;
      const img = await loadImage(`/assets/animated/${name}.png`);
      if (img) animated[name] = { img, meta };
    }),
  ]);
  const fallbackMeta: RaverSheetMeta = {
    frameW: 16,
    frameH: 32,
    characters: 20,
    idle: { start: 0, perDir: 6 },
    walk: { start: 24, perDir: 6 },
    lift: { start: 48, perDir: 14 },
  };
  return {
    ravers: ravers ?? new Image(),
    meta: (metaRes as RaverSheetMeta) ?? fallbackMeta,
    props,
    terrain,
    animated,
    ready: ravers !== null,
  };
}

/** Dessine une frame d'un sheet animé, indexée sur le temps de jeu.
 * opts.frame court-circuite l'horloge (FSM on/loop/off pilotés par l'appelant). */
export function drawAnimatedFrame(
  ctx: CanvasRenderingContext2D,
  bank: SpriteBank,
  name: AnimatedName,
  x: number,
  y: number,
  timeMs: number,
  opts?: { fpsScale?: number; frame?: number },
): void {
  const sheet = bank.animated[name];
  if (!sheet) return;
  const m = sheet.meta;
  // clamp : un timeMs négatif produirait un index (et un sx) négatif
  const t = Math.max(0, timeMs);
  const idx = Math.max(0, opts?.frame ?? Math.floor((t / 1000) * m.fps * (opts?.fpsScale ?? 1)));
  ctx.drawImage(
    sheet.img,
    (idx % m.frames) * m.frameW,
    0,
    m.frameW,
    m.frameH,
    x,
    y,
    m.frameW,
    m.frameH,
  );
}

/** Draw one raver frame. anim: which range; dir: facing; frame: index within direction. */
export function drawRaverFrame(
  ctx: CanvasRenderingContext2D,
  bank: SpriteBank,
  character: number,
  anim: 'idle' | 'walk' | 'lift',
  dir: Direction,
  frame: number,
  x: number,
  y: number,
): void {
  const m = bank.meta;
  const range = m[anim];
  const col = range.start + DIR[dir] * range.perDir + (frame % range.perDir);
  ctx.drawImage(
    bank.ravers,
    col * m.frameW,
    (character % m.characters) * m.frameH,
    m.frameW,
    m.frameH,
    x,
    y,
    m.frameW,
    m.frameH,
  );
}
