import type { EventContext, FloorPromptDef } from './types';

/**
 * Le deck de flash-prompts du dancefloor. Bannières non bloquantes (la sim
 * continue) tirées entre les events modaux. Tap = saisir l'effet `seize` ;
 * ignorer = la bannière expire et applique `lapse` éventuel.
 *
 * Poids contextuels — un prompt à poids 0 ne peut pas surgir. Tiré sans
 * remise sur la nuit, même schéma que `drawEvent`.
 */
export const FLOOR_PROMPTS: FloorPromptDef[] = [
  {
    id: 'rappel',
    icon: '🙌',
    label: 'Le floor scande « encore ! »',
    window: 4,
    seize: { montee: 0.15 },
    weight: (ctx) => 1 + ctx.crowdRatio * 0.6,
  },
  {
    id: 'fumee',
    icon: '🚬',
    label: 'Fumée trop près du groupe',
    window: 5,
    seize: { vibe: 0.03 },
    lapse: { soundCut: 1.2, vibe: -0.04 },
    weight: (ctx) => (ctx.gear.groupe <= 1 ? 1.4 : 0.6),
  },
  {
    id: 'pit-enlise',
    icon: '💧',
    label: 'Le pit s’enlise dans la boue',
    window: 5,
    seize: { crowdFrac: 0.04, vibe: 0.04 },
    lapse: { crowdFrac: -0.04 },
    weight: (ctx) => (ctx.spotTier <= 2 && ctx.crowdRatio > 0.3 ? 1.2 : 0.4),
  },
  {
    id: 'filme',
    icon: '📸',
    label: 'Un type filme le mur de son',
    window: 4,
    seize: { rep: 5, heat: 0.03 },
    weight: (ctx) => (ctx.crowdRatio > 0.4 ? 1 : 0.4),
  },
  {
    id: 'bouteille',
    icon: '🍾',
    label: 'Une bouteille traîne dans le pit',
    window: 5,
    seize: { vibe: 0.03 },
    lapse: { crowdFrac: -0.03 },
    weight: () => 0.7,
  },
  {
    id: 'projecteur',
    icon: '🔦',
    label: 'Un projecteur clignote',
    window: 4,
    seize: { vibe: 0.05 },
    weight: (ctx) => (ctx.gear.lumieres >= 1 ? 1 : 0.5),
  },
  {
    id: 'tournee',
    icon: '🍻',
    label: 'Tournée générale à la buvette',
    window: 4,
    seize: { vibe: 0.04, montee: 0.06 },
    weight: (ctx) => (ctx.crowdRatio > 0.5 ? 1.1 : 0.5),
  },
  {
    id: 'guetteur',
    icon: '🛰',
    label: 'Le guetteur fait signe — RAS',
    window: 4,
    seize: { heat: -0.05 },
    weight: (ctx) => (ctx.heat > 0.4 ? 1.3 : 0.4),
  },
];

export function drawPrompt(
  ctx: EventContext,
  fired: string[],
  rng: () => number,
): FloorPromptDef | null {
  const pool = FLOOR_PROMPTS.filter((p) => !fired.includes(p.id));
  const weights = pool.map((p) => Math.max(0, p.weight(ctx)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let roll = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}
