/**
 * Les 4 phases scriptées de la nuit (story B) : mêmes fractions sur tous les
 * spots — un petit spot = arc compressé (champ 3 min : ouverture de 36 s),
 * le Teknival = arc complet de 10 min. Aucun cas particulier.
 */

export type NightPhaseId = 'ouverture' | 'rush' | 'creux' | 'aube';

export interface NightPhaseDef {
  id: NightPhaseId;
  nom: string;
  icon: string;
  /** fenêtre en fraction de la nuit [début, fin) — la dernière inclut 1 */
  frac: [number, number];
  /** baseline d'attente, interpolée linéairement sur la fenêtre */
  attente: [number, number];
  arrivalMult: number;
  churnMult: number;
  heatMult: number;
  barMult: number;
  /** × sur les gains de rep (events, objectifs, drops) pendant la phase */
  repMult: number;
  /** surpondération d'events par tag — réservé aux stories D/E (partie 2) */
  eventBias?: Record<string, number>;
}

export const NIGHT_PHASES: NightPhaseDef[] = [
  {
    id: 'ouverture',
    nom: 'Ouverture',
    icon: '🌒',
    frac: [0, 0.2],
    attente: [0.3, 0.5],
    arrivalMult: 0.7,
    churnMult: 0.6,
    heatMult: 0.7,
    barMult: 0.7,
    repMult: 1,
  },
  {
    id: 'rush',
    nom: 'Le rush',
    icon: '🔥',
    frac: [0.2, 0.55],
    attente: [0.5, 0.8],
    arrivalMult: 1.5,
    churnMult: 1.0,
    heatMult: 1.0,
    barMult: 1.3,
    repMult: 1,
  },
  {
    id: 'creux',
    nom: 'Le creux',
    icon: '🌫',
    frac: [0.55, 0.75],
    attente: [0.8, 0.45],
    arrivalMult: 0.4,
    churnMult: 1.6,
    heatMult: 1.3,
    barMult: 0.8,
    repMult: 1,
  },
  {
    id: 'aube',
    nom: "L'aube",
    icon: '🌅',
    frac: [0.75, 1],
    attente: [0.5, 0.9],
    arrivalMult: 0.6,
    churnMult: 0.7,
    heatMult: 1.0,
    barMult: 1.1,
    repMult: 2,
  },
];

function clampFrac(frac: number): number {
  return Math.min(0.9999, Math.max(0, frac));
}

export function phaseAt(frac: number): NightPhaseDef {
  const f = clampFrac(frac);
  return (
    NIGHT_PHASES.find((p) => f >= p.frac[0] && f < p.frac[1]) ?? NIGHT_PHASES[NIGHT_PHASES.length - 1]
  );
}

export function getPhase(id: NightPhaseId): NightPhaseDef {
  const phase = NIGHT_PHASES.find((p) => p.id === id);
  if (!phase) throw new Error(`unknown night phase: ${id}`);
  return phase;
}

/** Baseline d'attente de la nuit à cette fraction (interpolation linéaire). */
export function phaseAttente(frac: number): number {
  const p = phaseAt(frac);
  const t = (clampFrac(frac) - p.frac[0]) / (p.frac[1] - p.frac[0]);
  return p.attente[0] + (p.attente[1] - p.attente[0]) * t;
}
