import type { EventContext, SetGoalDef } from './types';

/**
 * Le deck des objectifs de set. À chaque set on en tire un, évalué à la fin
 * du set : s'il est atteint, on crédite sa récompense (rep et/ou cash). C'est
 * **bonus only** — rater un objectif ne coûte rien, ça donne juste une raison
 * de s'investir sur les 90 secondes.
 *
 * Poids contextuels — un objectif à poids 0 ne peut pas sortir. Tiré avec
 * remise (un même objectif peut revenir d'un set à l'autre).
 */
export const SET_GOALS: SetGoalDef[] = [
  {
    id: 'vibe',
    label: 'Garder la vibe au-dessus de 0,7',
    reward: { rep: 4 },
    met: (s) => s.avgVibe > 0.7,
    weight: () => 1,
  },
  {
    id: 'remplir',
    label: 'Remplir 80 % du champ',
    reward: { rep: 5 },
    // fraction de cap — échelonnée au spot via le poids ci-dessous
    met: (s) => (s.cap > 0 ? s.crowdEnd / s.cap >= 0.8 : false),
    weight: (ctx) => (ctx.crowdRatio > 0.2 ? 1.1 : 0.5),
  },
  {
    id: 'propre',
    label: 'Set propre : zéro coupure',
    reward: { rep: 3, cash: 40 },
    met: (s) => s.brownouts === 0,
    weight: () => 1,
  },
  {
    id: 'gros-drop',
    label: 'Lâcher un gros drop (jauge pleine)',
    reward: { rep: 4 },
    met: (s) => s.bestDrop >= 0.8,
    weight: (ctx) => (ctx.brief === 'pousser' ? 1.3 : 0.8),
  },
  {
    id: 'discret',
    label: 'Tenir la chaleur sous la barre',
    reward: { rep: 5 },
    met: (s) => s.heat < 0.5,
    weight: (ctx) => 0.6 + ctx.heat * 1.5 + ctx.spotTier * 0.2,
  },
];

/**
 * Tire un objectif de set selon le contexte. Même schéma de tirage pondéré que
 * `drawEvent` / `drawPrompt`, mais **avec remise** : on tire dans tout le deck.
 */
export function drawGoal(ctx: EventContext, rng: () => number): SetGoalDef | null {
  const weights = SET_GOALS.map((g) => Math.max(0, g.weight(ctx)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let roll = rng() * total;
  for (let i = 0; i < SET_GOALS.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return SET_GOALS[i];
  }
  return SET_GOALS[SET_GOALS.length - 1];
}
