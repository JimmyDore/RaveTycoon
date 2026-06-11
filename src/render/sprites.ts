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
] as const;
export type PropName = (typeof PROP_NAMES)[number];

const TERRAIN_NAMES = ['grass_1', 'grass_2', 'grass_3', 'asphalt_1', 'asphalt_2', 'asphalt_3'] as const;
export type TerrainName = (typeof TERRAIN_NAMES)[number];

export interface SpriteBank {
  ravers: HTMLImageElement;
  meta: RaverSheetMeta;
  props: Partial<Record<PropName, HTMLImageElement>>;
  terrain: Partial<Record<TerrainName, HTMLImageElement>>;
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
  const [ravers, metaRes] = await Promise.all([
    loadImage('/assets/ravers.png'),
    fetch('/assets/ravers.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const props: SpriteBank['props'] = {};
  const terrain: SpriteBank['terrain'] = {};
  await Promise.all([
    ...PROP_NAMES.map(async (name) => {
      const img = await loadImage(`/assets/props/${name}.png`);
      if (img) props[name] = img;
    }),
    ...TERRAIN_NAMES.map(async (name) => {
      const img = await loadImage(`/assets/terrain/${name}.png`);
      if (img) terrain[name] = img;
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
    ready: ravers !== null,
  };
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
