import { GEAR_CATEGORIES } from '../core/data';
import type { GearBranch, GearCategory } from '../core/types';
import type { AnimatedName, Direction, PropName } from './sprites';

/**
 * Rig de scène : logique pure « matos (tiers + voies) → placements visuels ».
 * Aucune dépendance canvas — consommé par drawStage, testable à sec.
 * Coordonnées dans le buffer scène (cx = centre, stageBottom = bas du band).
 */

export type RigBranches = Partial<Record<GearCategory, GearBranch>>;

export interface StageRig {
  /** spots animés accrochés au truss (lumières ≥ 1, plus nombreux par tier) */
  spotlights: Array<{ x: number; y: number }>;
  /** machines laser aux extrémités (lumières ≥ 2) — blanches en voie B strobe */
  lasers: Array<{ x: number; y: number; sheet: AnimatedName }>;
  /** machine à fumée au pied de scène (lumières ≥ 2) — dense en voie A hypnose */
  fog: { x: number; y: number; dense: boolean } | null;
  /** groupe électrogène côté scène (groupe ≥ 1) — turbine ×2 en voie B monstre */
  generators: Array<{ x: number; y: number; scale: number }>;
  /** retours de scène de la régie chirurgicale (platines ≥ 3 voie A) */
  monitors: Array<{ x: number; y: number }>;
  /** voie B showmanship : le DJ animé remplace le perso statique */
  animatedDj: boolean;
  /** spots modulaires clignotants flanquant la régie (avec le DJ animé) */
  blinkSpots: Array<{ x: number; y: number; side: 'left' | 'right' }>;
  /** mur de son : stacks au sol ou line array suspendu, enceintes câblées mêlées */
  wall: Array<{ prop: PropName; x: number; y: number; blown: boolean }>;
  /** guetteurs postés en lisière (logistique ≥ 1, +1 par tier) */
  lookouts: Array<{ x: number; y: number; character: number; facing: Direction }>;
  /** rail de barrières du front de scène (logistique ≥ 2) — couche devant la foule */
  barriers: Array<{ prop: PropName; x: number; y: number }>;
  /** voie B mobilité : le camion d'évac garé prêt à partir */
  evacCamper: { x: number; y: number } | null;
}

/** Clé de memoïsation : le rig ne dépend que du matos, des voies, du mur grillé et de la largeur de scène. */
export function rigKey(
  gear: Record<GearCategory, number>,
  branch: RigBranches,
  murBlown: boolean,
  stageHalfW = 96,
): string {
  return GEAR_CATEGORIES.map((c) => `${gear[c]}${branch[c] ?? ''}`).join(',') + (murBlown ? '!' : '') + stageHalfW;
}

export function buildRig(
  gear: Record<GearCategory, number>,
  branch: RigBranches,
  murBlown: boolean,
  cx: number,
  stageBottom: number,
  /** demi-largeur du deck (96 = stage_deck seul, 160 = scène modulaire élargie) */
  stageHalfW = 96,
): StageRig {
  const lum = gear.lumieres;

  // spots sous la barre haute du truss, du centre vers les bords par tier
  const spotOffsets = lum >= 5 ? [-84, -28, 28, 84] : lum >= 3 ? [-56, 0, 56] : lum >= 1 ? [-56, 56] : [];
  const spotlights = spotOffsets.map((dx) => ({ x: cx + dx - 16, y: 6 }));

  // lasers posés au sol aux coins de scène, faisceaux montant sur le band
  const lasers: StageRig['lasers'] = [];
  if (lum >= 2) {
    const white = branch.lumieres === 'B';
    lasers.push(
      { x: cx - 218, y: stageBottom - 128, sheet: white ? 'laser_white' : 'laser_machine' },
      { x: cx + 90, y: stageBottom - 128, sheet: white ? 'laser_white_2' : 'laser_machine_2' },
    );
  }

  const fog =
    lum >= 2
      ? { x: cx - 140, y: stageBottom - 86, dense: branch.lumieres === 'A' && lum >= 3 }
      : null;

  // groupe électrogène en lisière gauche de scène — la voie B sort la turbine
  const grp = gear.groupe;
  const generators: StageRig['generators'] = [];
  if (grp >= 1) {
    if (branch.groupe === 'B' && grp >= 3) {
      generators.push({ x: 10, y: stageBottom - 64, scale: 2 });
    } else {
      generators.push({ x: 26, y: stageBottom - 32, scale: 1 });
      if (grp >= 3) generators.push({ x: 28, y: stageBottom - 64, scale: 1 });
    }
  }

  // platines : retours de scène en voie A, DJ animé + spots clignotants en voie B
  const plat = gear.platines;
  const monitors: StageRig['monitors'] = [];
  if (branch.platines === 'A' && plat >= 3) {
    monitors.push({ x: cx - 60, y: stageBottom - 38 }, { x: cx + 28, y: stageBottom - 38 });
    if (plat >= 5) monitors.push({ x: cx - 92, y: stageBottom - 38 }, { x: cx + 60, y: stageBottom - 38 });
  }
  const animatedDj = branch.platines === 'B' && plat >= 3;
  const blinkSpots: StageRig['blinkSpots'] = animatedDj
    ? [
        { x: cx - 52, y: stageBottom - 60, side: 'left' },
        { x: cx + 36, y: stageBottom - 60, side: 'right' },
      ]
    : [];

  const wall = buildWall(gear.mur, branch.mur, murBlown, cx, stageBottom, stageHalfW);

  // guetteurs : postes fixes occupés un à un quand la logistique monte
  const lt = gear.logistique;
  const posts: StageRig['lookouts'] = [
    { x: 14, y: 128, character: 5, facing: 'down' },
    { x: cx * 2 - 30, y: 128, character: 9, facing: 'down' },
    { x: 8, y: 226, character: 13, facing: 'right' },
    { x: cx * 2 - 24, y: 226, character: 17, facing: 'left' },
    { x: cx - 8, y: 256, character: 3, facing: 'up' },
  ];
  const lookouts = lt >= 1 ? posts.slice(0, Math.min(1 + lt, posts.length)) : [];

  // rail de barrières sous le deck (le pit pousse contre), latérales au tier 4
  const barriers: StageRig['barriers'] = [];
  if (lt >= 2) {
    for (let i = 0; i < 5; i++) {
      barriers.push({ prop: 'stage_barrier_2', x: cx - 80 + i * 32, y: stageBottom - 6 });
    }
    if (lt >= 4) {
      barriers.push(
        { prop: 'stage_barrier_lat_1', x: cx - 96, y: stageBottom - 26 },
        { prop: 'stage_barrier_lat_2', x: cx + 80, y: stageBottom - 26 },
      );
    }
  }

  const evacCamper = branch.logistique === 'B' && lt >= 3 ? { x: cx - 120, y: 202 } : null;

  return { spotlights, lasers, fog, generators, monitors, animatedDj, blinkSpots, wall, lookouts, barriers, evacCamper };
}

/** Le mur de son : stacks au sol (géométrie historique), ou line array suspendu en voie B. */
function buildWall(
  tier: number,
  branch: GearBranch | undefined,
  murBlown: boolean,
  cx: number,
  stageBottom: number,
  stageHalfW: number,
): StageRig['wall'] {
  const wall: StageRig['wall'] = [];
  if (branch === 'B' && tier >= 3) {
    // line array : colonnes de têtes suspendues sous le truss, élargies par tier
    const cols = Math.min(tier - 2, 2);
    for (const side of [-1, 1] as const) {
      for (let ci = 0; ci < cols; ci++) {
        const x = cx + side * (34 + ci * 30) - 16;
        for (let ri = 0; ri < 3; ri++) {
          wall.push({
            prop: 'speaker_medium',
            x,
            y: 8 + ri * 24,
            // mur grillé : la tête haute de la première colonne gauche penche et crame
            blown: murBlown && side === -1 && ci === 0 && ri === 0,
          });
        }
      }
    }
    return wall;
  }
  for (const side of [-1, 1] as const) {
    // les stacks suivent le bord du deck : scène large → mur poussé vers l'extérieur
    const baseX = cx + side * (stageHalfW + tier * 6) - 24;
    const columns = tier >= 2 ? 2 : 1;
    const rows = 1 + Math.ceil(tier / 2);
    for (let col = 0; col < columns; col++) {
      for (let row = 0; row < rows; row++) {
        // enceintes câblées mêlées aux grosses dès le tier 1
        const mix = tier >= 1 ? (col + row + (side > 0 ? 1 : 0)) % 3 : 0;
        const prop: PropName = mix === 1 ? 'speaker_cable_1' : mix === 2 ? 'speaker_cable_2' : 'speaker_big';
        wall.push({
          prop,
          x: baseX + side * -1 * col * 30,
          y: stageBottom - 60 - row * 44,
          blown: murBlown && side === -1 && col === 0 && row === 0,
        });
      }
    }
    // petites têtes au sommet du stack
    if (tier >= 1) wall.push({ prop: 'speaker_medium', x: baseX + 8, y: stageBottom - 60 - rows * 44 + 18, blown: false });
    // voie A infrabasses : rangée de caissons au sol qui élargit la base
    if (branch === 'A' && tier >= 3) {
      for (let i = 0; i < tier - 2; i++) {
        wall.push({
          prop: 'speaker_medium',
          x: baseX + (side < 0 ? -(34 + i * 30) : 50 + i * 30),
          y: stageBottom - 30,
          blown: false,
        });
      }
    }
  }
  return wall;
}
