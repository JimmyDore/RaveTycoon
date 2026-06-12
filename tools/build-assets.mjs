/**
 * Asset pipeline: reads the LimeZu packs from assets-src/ (not redistributable,
 * gitignored) and produces the minimal processed sheets the game ships, in
 * public/assets/ (also gitignored — rebuild with `npm run assets`).
 */
import sharp from 'sharp';
import { mkdir, copyFile, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const MI = 'assets-src/moderninteriors';
const ME16 = 'assets-src/modernexteriors/Modern_Exteriors_16x16';
const THEMES = `${ME16}/ME_Theme_Sorter_16x16`;
const OUT = 'public/assets';

const PREMADE_16 = `${MI}/2_Characters/Character_Generator/0_Premade_Characters/16x16`;
const PREMADE_48 = `${MI}/2_Characters/Character_Generator/0_Premade_Characters/48x48`;

// 16x16 premade sheet geometry (verified by pixel probe 2026-06-11:
// sheet 896x656, frame rows on a fixed 32px grid from y=0 for ALL sheets —
// feet always sit on the row's bottom gridline; only hair/hat height varies
// per character, so no per-sheet offset must ever be applied.
// Row 0 holds 4 static frames, the 24-frame idle/walk animations are rows 1-2)
const FRAME_W = 16;
const FRAME_H = 32;
const ROW_IDLE = 32;
const ROW_WALK = 64;
const ROW_LIFT = 352;
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

async function buildRavers() {
  const cols = IDLE_FRAMES + WALK_FRAMES + LIFT_FRAMES;
  const composites = [];
  for (let i = 0; i < CHAR_COUNT; i++) {
    const file = `${PREMADE_16}/Premade_Character_${String(i + 1).padStart(2, '0')}.png`;
    const idle = await sharp(file).extract({ left: 0, top: ROW_IDLE, width: IDLE_FRAMES * FRAME_W, height: FRAME_H }).png().toBuffer();
    const walk = await sharp(file).extract({ left: 0, top: ROW_WALK, width: WALK_FRAMES * FRAME_W, height: FRAME_H }).png().toBuffer();
    const lift = await sharp(file).extract({ left: 0, top: ROW_LIFT, width: LIFT_FRAMES * FRAME_W, height: FRAME_H }).png().toBuffer();
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
  plume: 10,
  doyenne: 14,
  morse: 6,
  volt: 2,
  sansnom: 11,
  comete: 15,
};

async function buildPortraits() {
  await mkdir(`${OUT}/portraits`, { recursive: true });
  // front-facing idle frame from the verified 16x16 sheet, upscaled ×9
  for (const [id, idx] of Object.entries(DJ_SPRITES)) {
    const file = `${PREMADE_16}/Premade_Character_${String(idx).padStart(2, '0')}.png`;
    const x = 18 * FRAME_W; // first front-facing idle frame
    const frame = await sharp(file).extract({ left: x, top: ROW_IDLE, width: FRAME_W, height: FRAME_H }).png().toBuffer();
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
  stage_deck: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Example_Big_Stage_1.png`,
  dj_set: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_DJ_Set.png`,
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
  // scène modulaire (assemblable selon la taille du spot)
  stage_left: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Stage_Structure_Left.png`,
  stage_mid_1: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Stage_Structure_Middle_Modular_1.png`,
  stage_mid_2: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Stage_Structure_Middle_Modular_2.png`,
  stage_right: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Stage_Structure_Right.png`,
  side_stage_left: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Left_Side_Stage_1.png`,
  side_stage_right: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Right_Side_Stage_1.png`,
  stage_stairs: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Stage_Stairs_Down.png`,
  spot_mod_left_1: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Stage_Structure_Spotlight_Modular_Left_1.png`,
  spot_mod_left_2: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Stage_Structure_Spotlight_Modular_Left_2.png`,
  spot_mod_right_1: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Stage_Structure_Spotlight_Modular_Right_1.png`,
  spot_mod_right_2: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Stage_Structure_Spotlight_Modular_Right_2.png`,
  // barrièrage de front de scène (le pit pousse contre)
  stage_barrier_1: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Stage_Barrier_1.png`,
  stage_barrier_2: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Stage_Barrier_2.png`,
  stage_barrier_3: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Stage_Barrier_3.png`,
  stage_barrier_lat_1: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Stage_Lateral_Barrier_1.png`,
  stage_barrier_lat_2: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Stage_Lateral_Barrier_2.png`,
  // enceintes câblées (mur « vrai rig »)
  speaker_cable_1: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Big_Loudspeaker_1_Cable_Sand.png`,
  speaker_cable_2: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Big_Loudspeaker_2_Cable_Sand.png`,
  // décor festival
  generator: `${THEMES}/24_Additional_Houses_Singles_16x16/24_Additional_Houses_Post_Apocalyptic_House_Generator_1_16x16.png`,
  street_lamp_1: `${THEMES}/3_City_Props_Singles_16x16/ME_Singles_City_Props_16x16_Street_Lamp_4.png`,
  street_lamp_2: `${THEMES}/3_City_Props_Singles_16x16/ME_Singles_City_Props_16x16_Street_Lamp_5.png`,
  lantern_1: `${THEMES}/11_Camping_Singles_16x16/ME_Singles_Camping_16x16_Lantern_1.png`,
  lantern_2: `${THEMES}/11_Camping_Singles_16x16/ME_Singles_Camping_16x16_Lantern_3.png`,
  food_cart: `${THEMES}/10_Vehicles_Singles_16x16/ME_Singles_Vehicles_16x16_Street_Food_Cart_1.png`,
  portaloo_1: `${THEMES}/8_Worksite_Singles_16x16/ME_Singles_Worksite_16x16_Portable_Toilet_1.png`,
  portaloo_2: `${THEMES}/8_Worksite_Singles_16x16/ME_Singles_Worksite_16x16_Portable_Toilet_3.png`,
  stand_1: `${THEMES}/13_School_Singles_16x16/ME_Singles_School_16x16_Stands_1.png`,
  stand_2: `${THEMES}/13_School_Singles_16x16/ME_Singles_School_16x16_Stands_2.png`,
  flag_red: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Sand_Castle_Red_Flag_Vers_1.png`,
  flag_blue: `${THEMES}/21_Beach_Singles_16x16/21_Beach_16x16_Sand_Castle_Blue_Flag_Vers_1.png`,
};

const ANIMATED = {
  laser_machine: `${ME16}/Animated_16x16/Animated_sheets_16x16/Beach_Stage_Laser_Machine_16x16.png`,
  laser_machine_2: `${ME16}/Animated_16x16/Animated_sheets_16x16/Beach_Stage_Laser_Machine_2_16x16.png`,
  laser_white: `${ME16}/Animated_16x16/Animated_sheets_16x16/Beach_Concert_Laser_Machine_White_Light_16x16.png`,
  laser_white_2: `${ME16}/Animated_16x16/Animated_sheets_16x16/Beach_Concert_Laser_Machine_White_Light_2_16x16.png`,
  fog_loop: `${ME16}/Animated_16x16/Animated_sheets_16x16/Beach_Stage_Fog_Machine_Loop_16x16.png`,
  fog_on: `${ME16}/Animated_16x16/Animated_sheets_16x16/Beach_Stage_Fog_Machine_Turn_On_16x16.png`,
  fog_off: `${ME16}/Animated_16x16/Animated_sheets_16x16/Beach_Stage_Fog_Machine_Turn_Off_16x16.png`,
  fog_only_loop: `${ME16}/Animated_16x16/Animated_sheets_16x16/Beach_Stage_Fog_Machine_Fog_Only_Loop_16x16.png`,
  fog_only_on: `${ME16}/Animated_16x16/Animated_sheets_16x16/Beach_Stage_Fog_Machine_Fog_Only_Turn_On_16x16.png`,
  fog_only_off: `${ME16}/Animated_16x16/Animated_sheets_16x16/Beach_Stage_Fog_Machine_Fog_Only_Turn_Off_16x16.png`,
  spotlight: `${ME16}/Animated_16x16/Animated_sheets_16x16/Spotlight_1_16x16.png`,
  spotlight_light_only: `${ME16}/Animated_16x16/Animated_sheets_16x16/Spotlight_1_Light_Only_16x16.png`,
  concert_dj: `${ME16}/Animated_16x16/Animated_sheets_16x16/Beach_Concert_DJ_16x16.png`,
  singer_1: `${ME16}/Animated_16x16/Animated_sheets_16x16/Beach_Concert_Singer_16x16.png`,
  singer_2: `${ME16}/Animated_16x16/Animated_sheets_16x16/Beach_Concert_Singer_2_16x16.png`,
  singer_3: `${ME16}/Animated_16x16/Animated_sheets_16x16/Beach_Concert_Singer_3_16x16.png`,
  flame_3: `${ME16}/Animated_16x16/Animated_sheets_16x16/Flame_3_16x16.png`,
};

// Géométrie des sheets animés (sondée par projection alpha 2026-06-12 — la
// taille du fichier seule ne donne pas le découpage). frames côte à côte sur
// une seule rangée; fps choisi par famille (fumée 8, lasers 10, chant 6…).
const ANIMATED_META = {
  fog_loop: { frameW: 96, frameH: 96, frames: 6, fps: 8 },
  fog_on: { frameW: 96, frameH: 96, frames: 4, fps: 8 },
  fog_off: { frameW: 96, frameH: 96, frames: 6, fps: 8 },
  fog_only_loop: { frameW: 96, frameH: 80, frames: 6, fps: 8 },
  fog_only_on: { frameW: 96, frameH: 80, frames: 4, fps: 8 },
  fog_only_off: { frameW: 96, frameH: 80, frames: 6, fps: 8 },
  laser_machine: { frameW: 128, frameH: 144, frames: 20, fps: 10 },
  laser_machine_2: { frameW: 128, frameH: 144, frames: 20, fps: 10 },
  laser_white: { frameW: 128, frameH: 144, frames: 20, fps: 10 },
  laser_white_2: { frameW: 128, frameH: 144, frames: 20, fps: 10 },
  spotlight: { frameW: 32, frameH: 48, frames: 12, fps: 8 },
  spotlight_light_only: { frameW: 96, frameH: 144, frames: 12, fps: 8 },
  concert_dj: { frameW: 48, frameH: 48, frames: 12, fps: 8 },
  singer_1: { frameW: 16, frameH: 32, frames: 6, fps: 6 },
  singer_2: { frameW: 16, frameH: 32, frames: 6, fps: 6 },
  singer_3: { frameW: 16, frameH: 32, frames: 6, fps: 6 },
  flame_3: { frameW: 32, frameH: 16, frames: 5, fps: 10 },
};

async function buildAnimatedMeta() {
  await mkdir(`${OUT}/animated`, { recursive: true });
  await writeFile(`${OUT}/animated/manifest.json`, JSON.stringify(ANIMATED_META, null, 2));
  console.log(`animated/manifest.json: ${Object.keys(ANIMATED_META).length} sheets`);
}

// Rotations de teinte modestes — gardent les peaux plausibles à 16px
const TINT_HUES = [40, -40];

/** Variantes de teinte de la foule : ravers.png passe de 20 à 60 rangées.
 * Les rangées 0-19 restent les originales (DJ_SPRITES et portraits y pointent). */
async function buildTintedCharacters() {
  const base = await sharp(`${OUT}/ravers.png`).png().toBuffer();
  const { width, height } = await sharp(base).metadata();
  const composites = [{ input: base, left: 0, top: 0 }];
  for (let i = 0; i < TINT_HUES.length; i++) {
    const tinted = await sharp(base).modulate({ hue: TINT_HUES[i] }).png().toBuffer();
    composites.push({ input: tinted, left: 0, top: (i + 1) * height });
  }
  await sharp({
    create: { width, height: height * (1 + TINT_HUES.length), channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composites)
    .png()
    .toFile(`${OUT}/ravers.png`);
  const meta = JSON.parse(await readFile(`${OUT}/ravers.json`, 'utf8'));
  meta.characters = CHAR_COUNT * (1 + TINT_HUES.length);
  await writeFile(`${OUT}/ravers.json`, JSON.stringify(meta, null, 2));
  console.log(`ravers.png: +${TINT_HUES.length * CHAR_COUNT} variantes teintées (hue ${TINT_HUES.join('/')})`);
}

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
await buildTintedCharacters();
await buildPortraits();
await copyNamed(PROPS, 'props');
await copyNamed(ANIMATED, 'animated');
await buildAnimatedMeta();
await buildTerrain();
console.log('assets built →', path.resolve(OUT));
