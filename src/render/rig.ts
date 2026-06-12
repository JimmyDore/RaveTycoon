import { GEAR_CATEGORIES } from '../core/data';
import type { GearBranch, GearCategory } from '../core/types';
import type { AnimatedName } from './sprites';

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
}

/** Clé de memoïsation : le rig ne dépend que du matos, des voies et du mur grillé. */
export function rigKey(
  gear: Record<GearCategory, number>,
  branch: RigBranches,
  murBlown: boolean,
): string {
  return GEAR_CATEGORIES.map((c) => `${gear[c]}${branch[c] ?? ''}`).join(',') + (murBlown ? '!' : '');
}

export function buildRig(
  gear: Record<GearCategory, number>,
  branch: RigBranches,
  murBlown: boolean,
  cx: number,
  stageBottom: number,
): StageRig {
  void murBlown;
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

  return { spotlights, lasers, fog };
}
