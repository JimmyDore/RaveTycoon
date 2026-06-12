import { getDj, ownedGear } from './data';
import { INTENSITY_LEVEL } from './intensity';
import { closeCurrentSet } from './night';
import type { GameState, NightState, NightTickEvent } from './types';

/**
 * La descente jouable (story C). Cycle d'import night ↔ raid assumé : tous les
 * appels croisés sont à l'exécution (tickNight → tickRaid, raid → closeCurrentSet),
 * jamais à l'init de module.
 */

/** Heat des signes avant-coureurs (sirène lointaine, toast — UI). */
export const DESCENTE_WARNING = 0.6;
export const SIEGE_DURATION = 45;
export const SIEGE_VIBE_MIN = 0.65;
/** > 8 s cumulées sous le seuil pendant le siège = mur cassé. */
export const SIEGE_MAX_LOW = 8;
export const NEGO_COST_BASE = 50;
export const NEGO_COST_PER_CROWD = 2;
export const MUR_TENU_REP = 25;
export const GARDE_A_VUE_NIGHTS = 2;

/** logTier efficace, plafonné à 3 (les tiers 4+ gardent leur value de heat). */
function logTier(state: GameState): number {
  return Math.min(3, state.gear.logistique);
}

/** 15–30 s pour se décider — la logistique paie. */
export function descenteCountdown(state: GameState): number {
  return 15 + 5 * logTier(state);
}

/** Déclenche la descente (1 fois max par nuit). Appelé par tickNight au seuil. */
export function startDescente(state: GameState, night: NightState): void {
  if (night.raid) return;
  night.raid = {
    status: 'countdown',
    deadline: night.t + descenteCountdown(state),
    outcome: null,
    siegeEndAt: 0,
    siegeLowT: 0,
  };
}

function bust(state: GameState, night: NightState, events: NightTickEvent[] | null): void {
  closeCurrentSet(state, night);
  night.phase = 'ended';
  night.busted = true;
  if (events) events.push({ type: 'bust' });
}

/** Fait vivre la descente pendant le tick (la teuf continue : non bloquant). */
export function tickRaid(
  state: GameState,
  night: NightState,
  dt: number,
  events: NightTickEvent[],
): void {
  const raid = night.raid;
  if (!raid) return;
  if (raid.status === 'countdown' && night.t >= raid.deadline) {
    // l'indécision coûte : bust standard
    raid.status = 'done';
    raid.outcome = 'bust-timer';
    bust(state, night, events);
  }
  if (raid.status === 'siege') {
    if (night.vibe < SIEGE_VIBE_MIN) raid.siegeLowT += dt;
    if (raid.siegeLowT > SIEGE_MAX_LOW) {
      // mur cassé : bust aggravé (saisie + garde à vue + −50 % caisse, voir payout)
      raid.status = 'done';
      raid.outcome = 'mur-casse';
      jailCurrentDj(state, night);
      night.journal.push({ t: night.t, titre: 'Le siège', outcome: 'Le mur a cassé. Les bleus sont entrés dans le son.' });
      bust(state, night, events);
    } else if (night.t >= raid.siegeEndAt) {
      // mur tenu : les bleus se retirent devant la marée humaine
      raid.status = 'done';
      raid.outcome = 'mur-tenu';
      night.heat = 0.3;
      night.montee = 1; // Montée pleine offerte
      night.repBonus += MUR_TENU_REP * (night.nightPhase === 'aube' ? 2 : 1);
      state.mursTenus += 1;
      night.journal.push({ t: night.t, titre: 'Le siège', outcome: 'Le mur a tenu. Les bleus ont reculé devant la foule. Légende.' });
      events.push({ type: 'mur-tenu' });
    }
  }
}

/** TENIR LE MUR : 45 s de siège, la vibe contre le seuil. */
export function raidTenir(state: GameState, night: NightState): boolean {
  if (night.raid?.status !== 'countdown') return false;
  night.raid.status = 'siege';
  night.raid.siegeEndAt = night.t + SIEGE_DURATION;
  night.raid.siegeLowT = 0;
  void state;
  return true;
}

/** Le DJ aux platines part en garde à vue — fondateur et insaisissable immunisés. */
function jailCurrentDj(state: GameState, night: NightState): void {
  const id = night.currentDj;
  if (!id || id === 'tonton') return; // no-softlock : le fondateur reste libre
  if (getDj(id).gimmick === 'insaisissable') return;
  state.gardeAVue[id] = GARDE_A_VUE_NIGHTS;
}

/** ÉVACUER : nuit terminée immédiatement, caisse conservée, pas de bust. */
export function raidEvacuer(state: GameState, night: NightState): boolean {
  if (night.raid?.status !== 'countdown') return false;
  night.raid.status = 'done';
  night.raid.outcome = 'evacue';
  night.evacuated = true;
  closeCurrentSet(state, night);
  night.phase = 'ended';
  night.journal.push({ t: night.t, titre: 'La descente', outcome: 'Évacuation propre — le camion était parti avant les bleus.' });
  return true;
}

export function negoCost(night: NightState): number {
  return NEGO_COST_BASE + NEGO_COST_PER_CROWD * Math.round(night.crowd);
}

export function negoChance(state: GameState, night: NightState): number {
  const dj = night.currentDj ? getDj(night.currentDj) : null;
  let p = 0.25 + 0.15 * logTier(state);
  p += ownedGear(state, 'logistique').effects?.negoBonus ?? 0; // voie Réseau
  if (dj?.risk === 'discret') p += 0.15;
  if (INTENSITY_LEVEL[night.intensity] <= INTENSITY_LEVEL.groove) p += 0.2;
  return Math.min(0.9, p);
}

/** NÉGOCIER : coût sur la banque, succès = heat 0.45, échec = bust immédiat. */
export function raidNegocier(state: GameState, night: NightState): boolean {
  if (night.raid?.status !== 'countdown') return false;
  const cost = negoCost(night);
  if (night.bank < cost) return false;
  night.bank -= cost;
  night.raid.status = 'done';
  if (night.rng() < negoChance(state, night)) {
    night.raid.outcome = 'nego-ok';
    night.heat = 0.45;
    // 50 % de chance de planter l'arc « flic corrompu » — hook lu par la partie 2
    night.negoCorruption = night.rng() < 0.5;
    night.journal.push({ t: night.t, titre: 'La descente', outcome: 'Négociée. Le gradé est reparti avec une enveloppe et un sourire.' });
  } else {
    night.raid.outcome = 'nego-rate';
    night.journal.push({ t: night.t, titre: 'La descente', outcome: 'La négociation a tourné court. Tout le monde dehors.' });
    bust(state, night, null);
  }
  return true;
}
