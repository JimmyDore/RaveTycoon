import type { GenreId } from './types';

/**
 * Les 4 crans d'intensité — remplacent le brief (spec story A, verrouillé).
 * Tappables à tout moment pendant la phase `playing`, aucun cooldown : le coût
 * est DANS la sim (burnout, heat, fatigue).
 */
export type Intensity = 'chill' | 'groove' | 'peak' | 'rinse';

export const INTENSITIES: Intensity[] = ['chill', 'groove', 'peak', 'rinse'];

/** Niveau joué [0,1] — comparé à l'attente de la foule. */
export const INTENSITY_LEVEL: Record<Intensity, number> = { chill: 0.25, groove: 0.5, peak: 0.75, rinse: 1.0 };
/** Facteur de qualité LIVE — la qualité de set n'est plus figée au départ. */
export const INTENSITY_QUALITY: Record<Intensity, number> = { chill: 0.92, groove: 1.0, peak: 1.08, rinse: 1.15 };
/** Facteur de montée de chaleur. */
export const INTENSITY_HEAT: Record<Intensity, number> = { chill: 0.5, groove: 1.0, peak: 1.6, rinse: 2.4 };
/** Demande électrique additionnelle (remplace l'ancienne table du brief). */
export const INTENSITY_POWER: Record<Intensity, number> = { chill: 0, groove: 0.06, peak: 0.16, rinse: 0.3 };

export function isHighIntensity(i: Intensity): boolean {
  return i === 'peak' || i === 'rinse';
}

/** Le cran dont le niveau colle le mieux à une attente — politique d'autoplay des harnais. */
export function nearestIntensity(attente: number): Intensity {
  return INTENSITIES.reduce((a, b) =>
    Math.abs(INTENSITY_LEVEL[b] - attente) < Math.abs(INTENSITY_LEVEL[a] - attente) ? b : a,
  );
}

/**
 * Profil d'attente par genre : un public de dub n'attend pas le même niveau
 * qu'un public de hardcore. Multiplie la baseline (provisoire story A, phasée
 * story B). Lu par tickNight dès la task 2.
 */
export const ATTENTE_GENRE: Record<GenreId, number> = {
  hardtek: 1.0,
  acid: 1.0,
  dub: 0.8,
  frenchcore: 1.1,
  mentale: 1.0,
  techno: 0.95,
  raggatek: 1.0,
  darkpsy: 0.95,
  tribe: 1.0,
  hardcore: 1.15,
  downtempo: 0.75,
  electro: 0.95,
};
