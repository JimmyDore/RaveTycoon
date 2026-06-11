/**
 * Asset pipeline: reads the LimeZu packs from assets-src/ (not redistributable,
 * gitignored) and produces the minimal processed sheets the game ships, in
 * public/assets/ (also gitignored — rebuild with `npm run assets`).
 */
import sharp from 'sharp';
import { mkdir, copyFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const MI = 'assets-src/moderninteriors';
const ME16 = 'assets-src/modernexteriors/Modern_Exteriors_16x16';
const THEMES = `${ME16}/ME_Theme_Sorter_16x16`;
const OUT = 'public/assets';

const PREMADE_16 = `${MI}/2_Characters/Character_Generator/0_Premade_Characters/16x16`;
const PREMADE_48 = `${MI}/2_Characters/Character_Generator/0_Premade_Characters/48x48`;

// 16x16 premade sheet geometry (verified by pixel probe)
const FRAME_W = 16;
const FRAME_H = 32;
const ROW_IDLE = 16;
const ROW_WALK = 48;
const ROW_LIFT = 368;
const IDLE_FRAMES = 24; // 6 per direction: right, up, left, down
const WALK_FRAMES = 24;
const LIFT_FRAMES = 56; // 14 per direction
const CHAR_COUNT = 20;

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Premade sheets share one layout but differ in top padding. Anchor on the
 * first opaque pixel row: Premade_01 (the reference for the row constants)
 * has its first ink at y=2.
 */
const REF_FIRST_INK = 2;
async function sheetOffset(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 0) return y - REF_FIRST_INK;
    }
  }
  return 0;
}

async function buildRavers() {
  const cols = IDLE_FRAMES + WALK_FRAMES + LIFT_FRAMES;
  const composites = [];
  for (let i = 0; i < CHAR_COUNT; i++) {
    const file = `${PREMADE_16}/Premade_Character_${String(i + 1).padStart(2, '0')}.png`;
    const dy = await sheetOffset(file);
    const idle = await sharp(file).extract({ left: 0, top: ROW_IDLE + dy, width: IDLE_FRAMES * FRAME_W, height: FRAME_H }).png().toBuffer();
    const walk = await sharp(file).extract({ left: 0, top: ROW_WALK + dy, width: WALK_FRAMES * FRAME_W, height: FRAME_H }).png().toBuffer();
    const lift = await sharp(file).extract({ left: 0, top: ROW_LIFT + dy, width: LIFT_FRAMES * FRAME_W, height: FRAME_H }).png().toBuffer();
    composites.push({ input: idle, left: 0, top: i * FRAME_H });
    composites.push({ input: walk, left: IDLE_FRAMES * FRAME_W, top: i * FRAME_H });
    composites.push({ input: lift, left: (IDLE_FRAMES + WALK_FRAMES) * FRAME_W, top: i * FRAME_H });
  }
  await sharp({
    create: { width: cols * FRAME_W, height: CHAR_COUNT * FRAME_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composites)
    .png()
    .toFile(`${OUT}/ravers.png`);

  const meta = {
    frameW: FRAME_W,
    frameH: FRAME_H,
    characters: CHAR_COUNT,
    // frame index ranges within a character row; directions: 0=right 1=up(back) 2=left 3=down(front)
    idle: { start: 0, perDir: 6 },
    walk: { start: IDLE_FRAMES, perDir: 6 },
    lift: { start: IDLE_FRAMES + WALK_FRAMES, perDir: 14 },
  };
  await writeFile(`${OUT}/ravers.json`, JSON.stringify(meta, null, 2));
  console.log(`ravers.png: ${CHAR_COUNT} chars × ${cols} frames`);
}

// DJ id → premade character index (1-based), hand-picked for variety
const DJ_SPRITES = {
  tonton: 4,
  gamine: 8,
  boblepine: 12,
  kilowatt: 3,
  memeacide: 16,
  notaire: 7,
  sirene: 18,
  fantome: 20,
};

async function buildPortraits() {
  await mkdir(`${OUT}/portraits`, { recursive: true });
  // front-facing idle frame from the verified 16x16 sheet, upscaled ×9
  for (const [id, idx] of Object.entries(DJ_SPRITES)) {
    const file = `${PREMADE_16}/Premade_Character_${String(idx).padStart(2, '0')}.png`;
    const dy = await sheetOffset(file);
    const x = 18 * FRAME_W; // first front-facing idle frame
    const frame = await sharp(file).extract({ left: x, top: ROW_IDLE + dy, width: FRAME_W, height: FRAME_H }).png().toBuffer();
    // trim the transparent margins so the face fills the portrait
    const trimmed = await sharp(frame).trim().png().toBuffer();
    const m = await sharp(trimmed).metadata();
    const scale = Math.max(1, Math.floor(144 / Math.max(m.width ?? 16, m.height ?? 32)));
    await sharp(trimmed)
      .resize((m.width ?? 16) * scale, (m.height ?? 32) * scale, { kernel: 'nearest' })
      .png()
      .toFile(`${OUT}/portraits/${id}.png`);
  }
  console.log(`portraits: ${Object.keys(DJ_SPRITES).length} DJs`);
}

/** Props copied verbatim under friendly names. Missing sources are reported, not fatal. */
const PROPS = {
  // the stage kit (Beach theme — modular stage, loudspeakers, spotlights)
  speaker_big: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Big_Loudspeaker_Sand.png`,
  speaker_medium: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Medium_Loudspeaker.png`,
  speaker_small: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Small_Loudspeaker.png`,
  stage_big: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Example_Big_Stage_Structure.png`,
  stage_small: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Example_Small_Stage_Structure.png`,
  stage_spot_left: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Stage_Spotlight_Left.png`,
  stage_spot_right: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Stage_Spotlight_Right.png`,
  // camp / nature
  tent_1: `${THEMES}/11_Camping_Singles_16x16/ME_Singles_Camping_16x16_Tent_1.png`,
  tent_2: `${THEMES}/11_Camping_Singles_16x16/ME_Singles_Camping_16x16_Tent_2.png`,
  tent_3: `${THEMES}/11_Camping_Singles_16x16/ME_Singles_Camping_16x16_Tent_3.png`,
  tent_4: `${THEMES}/11_Camping_Singles_16x16/ME_Singles_Camping_16x16_Tent_4.png`,
  campfire_1: `${THEMES}/11_Camping_Singles_16x16/ME_Singles_Camping_16x16_Campfire_1.png`,
  tree_big: `${THEMES}/19_Graveyard_Singles_16x16/ME_Singles_Graveyard_16x16_Big_Tree_.png`,
  tree_med_1: `${THEMES}/19_Graveyard_Singles_16x16/ME_Singles_Graveyard_16x16_Medium_Tree_1.png`,
  tree_med_2: `${THEMES}/19_Graveyard_Singles_16x16/ME_Singles_Graveyard_16x16_Medium_Tree_2.png`,
  tree_med_3: `${THEMES}/19_Graveyard_Singles_16x16/ME_Singles_Graveyard_16x16_Medium_Tree_3.png`,
  bush_1: `${THEMES}/17_Garden_Singles_16x16/ME_Singles_Garden_16x16_Bush_1.png`,
  bush_2: `${THEMES}/17_Garden_Singles_16x16/ME_Singles_Garden_16x16_Bush_2.png`,
  // the camion
  camper_left: `${THEMES}/10_Vehicles_Singles_16x16/ME_Singles_Vehicles_16x16_Camper_Left_1.png`,
  camper_right: `${THEMES}/10_Vehicles_Singles_16x16/ME_Singles_Vehicles_16x16_Camper_Right_2.png`,
  // industrial
  container_1: `${THEMES}/3_City_Props_Singles_16x16/ME_Singles_City_Props_16x16_Container_1.png`,
  container_2: `${THEMES}/3_City_Props_Singles_16x16/ME_Singles_City_Props_16x16_Container_2.png`,
  barrel_1: `${THEMES}/3_City_Props_Singles_16x16/ME_Singles_City_Props_16x16_Barrel_2.png`,
  barrel_2: `${THEMES}/3_City_Props_Singles_16x16/ME_Singles_City_Props_16x16_Barrel_3.png`,
  scrap_pile: `${THEMES}/3_City_Props_Singles_16x16/ME_Singles_City_Props_16x16_Scrap_Metal_Pile_1.png`,
  fence_work_1: `${THEMES}/8_Worksite_Singles_16x16/ME_Singles_Worksite_16x16_Fence_1_1.png`,
  fence_work_2: `${THEMES}/8_Worksite_Singles_16x16/ME_Singles_Worksite_16x16_Fence_2_1.png`,
  bunker: `${THEMES}/23_MIlitary_Base_Singles_16x16/23_MIlitary_Base_16x16_Bunker.png`,
  police_spot: `${THEMES}/15_Police_Station_Singles_16x16/ME_Singles_Police_Station_16x16_Spotlight_1.png`,
  barrier: `${THEMES}/15_Police_Station_Singles_16x16/ME_Singles_Police_Station_16x16_Barrier_1.png`,
};

const ANIMATED = {
  laser_machine: `${ME16}/Animated_16x16/Animated_sheets_16x16/Beach_Stage_Laser_Machine_16x16.png`,
  laser_machine_2: `${ME16}/Animated_16x16/Animated_sheets_16x16/Beach_Stage_Laser_Machine_2_16x16.png`,
  fog_loop: `${ME16}/Animated_16x16/Animated_sheets_16x16/Beach_Stage_Fog_Machine_Loop_16x16.png`,
  spotlight: `${ME16}/Animated_16x16/Animated_sheets_16x16/Spotlight_1_16x16.png`,
};

async function copyNamed(map, dir) {
  await mkdir(`${OUT}/${dir}`, { recursive: true });
  let ok = 0;
  for (const [name, src] of Object.entries(map)) {
    if (await exists(src)) {
      await copyFile(src, `${OUT}/${dir}/${name}.png`);
      ok++;
    } else {
      console.warn(`  MISSING: ${name} ← ${src}`);
    }
  }
  console.log(`${dir}: ${ok}/${Object.keys(map).length} copied`);
}

async function buildTerrain() {
  await mkdir(`${OUT}/terrain`, { recursive: true });
  const candidates = {
    // plain center tiles (the low-numbered ones are autotile edges)
    grass_1: `${THEMES}/1_Terrains_and_Fences_Singles_16x16/ME_Singles_Terrains_and_Fences_16x16_Grass_2_10.png`,
    grass_2: `${THEMES}/1_Terrains_and_Fences_Singles_16x16/ME_Singles_Terrains_and_Fences_16x16_Grass_2_9.png`,
    grass_3: `${THEMES}/1_Terrains_and_Fences_Singles_16x16/ME_Singles_Terrains_and_Fences_16x16_Grass_1_21.png`,
    asphalt_1: `${THEMES}/2_City_Terrains_Singles_16x16/ME_Singles_City_Terrains_16x16_Asphalt_1_Variation_1.png`,
    asphalt_2: `${THEMES}/2_City_Terrains_Singles_16x16/ME_Singles_City_Terrains_16x16_Asphalt_1_Variation_2.png`,
    asphalt_3: `${THEMES}/2_City_Terrains_Singles_16x16/ME_Singles_City_Terrains_16x16_Asphalt_1_Variation_5.png`,
  };
  let ok = 0;
  for (const [name, src] of Object.entries(candidates)) {
    if (await exists(src)) {
      await copyFile(src, `${OUT}/terrain/${name}.png`);
      ok++;
    } else {
      console.warn(`  MISSING terrain: ${name} ← ${src}`);
    }
  }
  console.log(`terrain: ${ok}/${Object.keys(candidates).length} copied`);
}

await mkdir(OUT, { recursive: true });
await buildRavers();
await buildPortraits();
await copyNamed(PROPS, 'props');
await copyNamed(ANIMATED, 'animated');
await buildTerrain();
console.log('assets built →', path.resolve(OUT));
