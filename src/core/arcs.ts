import type { GameState, NightEventDef, NightState } from './types';

/**
 * Les arcs de conséquences (story E) : plantés par un choix (event, prompt,
 * négociation de descente), ils mûrissent en nuits et reviennent comme event
 * modal PRIORITAIRE (hors quota) à l'échéance. 2–3 temps max par arc.
 */

export interface ArcStageDef {
  /** l'event injecté quand l'échéance arrive */
  event: NightEventDef;
  /** nuits avant l'échéance — [min, max], tirage inclusif */
  delay: [number, number];
}

export interface ArcDef {
  id: string;
  stages: ArcStageDef[];
}

export const ARCS: ArcDef[] = [
  {
    // 🚔 planté par une négociation de descente réussie (negoCorruption, partie 1)
    id: 'flic-corrompu',
    stages: [
      {
        delay: [2, 3],
        event: {
          id: 'flic-stage-0',
          titre: '🚔 Le gradé revient',
          texte:
            'Le gradé de l’autre soir se gare au portail, en civil. « Même arrangement. Tarif doublé — l’inflation, tu comprends. »',
          options: [
            {
              label: 'Payer le double (−300 €)',
              outcome: 'L’enveloppe change de main. Cette nuit, les patrouilles regarderont ailleurs.',
              effects: { cash: -300, heatMultNow: 0.6, plantsArc: { arcId: 'flic-corrompu', stage: 1, chance: 1 } },
            },
            {
              label: 'Refuser tout net',
              outcome: 'Il remonte en voiture sans un mot. Dix minutes plus tard, une patrouille ralentit au croisement.',
              effects: { heat: 0.15 },
            },
          ],
          weight: () => 0, // jamais au tirage aléatoire : injection d'arc uniquement
        },
      },
      {
        delay: [2, 3],
        event: {
          id: 'flic-stage-1',
          titre: '🚔 Le forfait',
          texte:
            'Le gradé propose un « forfait » : 800 € et ton dossier disparaît du commissariat — avec cinq nuits de tranquillité. Ou tu le balances à l’IGPN.',
          options: [
            {
              label: 'Le forfait (−800 €)',
              outcome: 'Le casier s’évapore. Pendant cinq nuits, les bleus chercheront la teuf sur la mauvaise départementale.',
              effects: {
                cash: -800,
                casierClear: true,
                tempHeat: { heatBuildMult: 0.8, nights: 5 },
                arcComplete: 'flic-corrompu',
              },
            },
            {
              label: 'Le dénoncer',
              outcome: 'La scène entière apprend que ton crew ne s’achète pas. Le commissariat, vexé, patrouille plus serré.',
              effects: { rep: 20, tempHeat: { heatBuildMult: 1.1, nights: 5 }, arcComplete: 'flic-corrompu' },
            },
          ],
          weight: () => 0,
        },
      },
    ],
  },
];

export function getArc(id: string): ArcDef {
  const arc = ARCS.find((a) => a.id === id);
  if (!arc) throw new Error(`unknown arc: ${id}`);
  return arc;
}

/**
 * Plante un stage d'arc : échéance tirée dans la fenêtre du stage. Refuse les
 * doublons (arc déjà en cours) et les arcs déjà menés à terme.
 */
export function plantArc(state: GameState, arcId: string, stage: number, rng: () => number): boolean {
  if (state.arcsCompleted.includes(arcId)) return false;
  if (state.pendingArcs.some((a) => a.arcId === arcId)) return false;
  const def = getArc(arcId).stages[stage];
  if (!def) return false;
  const [lo, hi] = def.delay;
  const nightsLeft = lo + Math.floor(rng() * (hi - lo + 1));
  state.pendingArcs.push({ arcId, stage, nightsLeft: Math.min(hi, nightsLeft) });
  return true;
}

/** L'échéance arrivée (nightsLeft ≤ 0), retirée de la file et prête à injecter. */
export function takeDueArc(
  state: GameState,
): { arcId: string; stage: number; event: NightEventDef } | null {
  const idx = state.pendingArcs.findIndex((a) => a.nightsLeft <= 0);
  if (idx < 0) return null;
  const due = state.pendingArcs[idx];
  state.pendingArcs.splice(idx, 1);
  return { arcId: due.arcId, stage: due.stage, event: getArc(due.arcId).stages[due.stage].event };
}

/** Produit des multiplicateurs de heat de base actifs (tickNight). */
export function tempHeatBuildMult(state: GameState): number {
  return state.tempEffects.reduce((acc, e) => acc * (e.heatBuildMult ?? 1), 1);
}

/** Somme des bonus de heat de départ actifs (createNight). */
export function tempStartHeat(state: GameState): number {
  return state.tempEffects.reduce((acc, e) => acc + (e.startHeatAdd ?? 0), 0);
}

/**
 * La nuit se règle : décompte les échéances d'arcs, fait expirer les
 * tempEffects, PUIS plante le flic corrompu si la négo l'a semé (partie 1).
 * L'ordre compte : l'arc semé CE soir garde son échéance pleine — décompter
 * après le plant raboterait son délai d'une nuit (le test du plant frais le pin).
 * Appelé par settleNight ET applyBust (payout.ts).
 */
export function settleArcs(state: GameState, night: NightState): void {
  for (const arc of state.pendingArcs) arc.nightsLeft = Math.max(0, arc.nightsLeft - 1);
  for (const fx of state.tempEffects) fx.nightsLeft -= 1;
  state.tempEffects = state.tempEffects.filter((fx) => fx.nightsLeft > 0);
  if (night.negoCorruption) plantArc(state, 'flic-corrompu', 0, night.rng);
}
