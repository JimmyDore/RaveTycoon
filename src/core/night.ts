import { applySetToll, effectiveTechnique, fatigueQualityMult, getCrewMember } from './crew';
import { GEAR, getDj, getGenre, getSpot } from './data';
import { BAR_DRIP, BAR_STOCK_CAP, cautionCost, potentialBar, type BarStock } from './economy';
import { drawEvent } from './events';
import { drawGoal } from './goals';
import { modifierProduct, modifierSum, rollModifiers } from './modifiers';
import { drawPrompt } from './prompts';
import { mulberry32 } from './rng';
import type {
  Brief,
  EventContext,
  EventEffects,
  EventOption,
  FloorPromptDef,
  GameState,
  GenreId,
  NightState,
  NightTickEvent,
  SetStats,
  SpotId,
} from './types';

const BROWNOUT_DURATION = 1.5;
const BROWNOUT_COOLDOWN = 6;
/** events per night scale with set count; min spacing in seconds */
const EVENT_MIN_SPACING = 25;
const BRIEF_QUALITY: Record<Brief, number> = { safe: 0.9, normal: 1, pousser: 1.12 };
const BRIEF_HEAT: Record<Brief, number> = { safe: 0.5, normal: 1, pousser: 1.8 };
const BRIEF_POWER: Record<Brief, number> = { safe: 0, normal: 0.08, pousser: 0.22 };
const RISK_HEAT = { discret: 0.8, normal: 1, chaud: 1.35 } as const;
/** overall damping so heat curves match night lengths */
const HEAT_BASE = 0.55;
/** la montée : charge/s à pleine vibe */
const MONTEE_RATE = 0.05;
const MONTEE_GENRE: Record<GenreId, number> = {
  hardtek: 1.1,
  acid: 1.2,
  dub: 0.8,
  frenchcore: 1.3,
  mentale: 1.1,
  techno: 0.9,
  raggatek: 1.15,
  darkpsy: 1.0,
};
/** décroissance /s quand la vibe est trop basse */
const MONTEE_DECAY = 0.03;
/** ×= sur la jauge lors d'une coupure son (drop avorté) */
const MONTEE_BROWNOUT_DRAIN = 0.4;
/** seuil minimal pour pouvoir lâcher */
export const MONTEE_MIN_DROP = 0.1;
/** espacement de base (s) entre deux flash-prompts du dancefloor */
const PROMPT_SPACING = 12;

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export interface NightOptions {
  barStock?: BarStock;
  caution?: boolean;
}

export function createNight(
  state: GameState,
  spotId: SpotId,
  presentDjs: string[],
  seed: number,
  opts: NightOptions = {},
): NightState {
  const spot = getSpot(spotId);
  const murItem = GEAR.mur[state.gear.mur];
  const murMult = murItem.value * (state.damaged.mur ? 0.6 : 1);
  const cap = Math.round(spot.cap * murMult);
  const barStock: BarStock = opts.barStock ?? 'leger';
  // caution : un choix d'ambition payé sur la banque ; sans elle, heat de départ +0.1
  let cautionPaid = 0;
  if (opts.caution && spot.tier >= 3) {
    const cost = cautionCost(state, spot);
    if (state.cash >= cost) {
      state.cash -= cost;
      cautionPaid = cost;
    }
  }
  const startHeat = spot.tier >= 3 && cautionPaid === 0 ? 0.1 : 0;
  // modifs du soir (météo/foule) — flux RNG dédié, ne perturbe pas le flux des events
  const modifiers = rollModifiers(spot.tier, seed);
  const eventDelay = modifierSum(modifiers, 'eventDelay');
  return {
    spotId,
    // genre du set courant — initialisé au genre du 1er DJ (sert la phase transition
    // avant le premier set), réécrit à chaque startSet par le DJ qui joue
    genreId: getDj(presentDjs[0]).genre,
    phase: 'transition',
    presentDjs,
    setIndex: 0,
    setCount: spot.setCount,
    setLen: spot.duration / spot.setCount,
    setElapsed: 0,
    t: 0,
    duration: spot.duration,
    currentDj: null,
    brief: 'normal',
    setQuality: 0,
    crowd: 0,
    peakCrowd: 0,
    cap,
    vibe: 0.4,
    vibeSum: 0,
    vibeSamples: 0,
    heat: startHeat,
    peakHeat: startHeat,
    bank: 0,
    barStock,
    barCap: BAR_STOCK_CAP[barStock] * potentialBar(spot, cap),
    barSales: 0,
    cautionPaid,
    murStress: 0,
    murBlown: false,
    soundCutT: 0,
    brownoutCooldown: 0,
    pendingEvent: null,
    eventsFired: [],
    // brouillard décale le premier event (eventDelay en secondes)
    nextEventAt: 20 + mulberry32(seed)() * 30 + eventDelay,
    qualityMultRestOfSet: 1,
    arrivalCutT: 0,
    repBonus: 0,
    briefLockT: 0,
    montee: 0,
    bestDropThisSet: 0,
    setGoal: null,
    setVibeSum: 0,
    setVibeSamples: 0,
    setBrownouts: 0,
    setCrowdStart: 0,
    goalsMet: [],
    floorPrompt: null,
    nextPromptAt: 12 + mulberry32(seed)() * 6,
    firedPrompts: [],
    playedSets: [],
    journal: [],
    modifiers,
    busted: false,
    sunrise: false,
    rng: mulberry32(seed),
    // flux dédié, décalé du seed pour ne pas perturber le flux des events
    goalRng: mulberry32((seed ^ 0x9e3779b9) >>> 0),
  };
}

export function computeSetQuality(state: GameState, _night: NightState, djId: string, brief: Brief): number {
  const def = getDj(djId);
  const member = getCrewMember(state, djId);
  const platines = GEAR.platines[state.gear.platines].value * (state.damaged.platines ? 0.7 : 1);
  const tech = effectiveTechnique(def, member);
  const base = 0.18 + 0.16 * tech;
  return clamp(
    base * platines * BRIEF_QUALITY[brief] * fatigueQualityMult(member),
    0.05,
    1.5,
  );
}

/** Begin the next set. Only valid in the 'transition' phase. */
export function startSet(state: GameState, night: NightState, djId: string, brief: Brief): void {
  if (night.phase !== 'transition') throw new Error('not in transition');
  if (!night.presentDjs.includes(djId)) throw new Error(`dj not present: ${djId}`);
  night.currentDj = djId;
  night.brief = brief;
  // le son c'est le DJ : le genre du set courant est celui du DJ qui joue
  night.genreId = getDj(djId).genre;
  night.setQuality = computeSetQuality(state, night, djId, brief);
  night.qualityMultRestOfSet = 1;
  night.setElapsed = 0;
  night.briefLockT = 0;
  night.bestDropThisSet = 0;
  // un prompt ne traverse pas une transition de set (sinon il expire au 1er tick
  // du set suivant et applique son lapse hors du contrôle du joueur)
  night.floorPrompt = null;
  night.nextPromptAt = night.t + PROMPT_SPACING + night.rng() * 6;
  // objectif du set + reset des accumulateurs (flux RNG dédié)
  night.setGoal = drawGoal(eventContext(state, night), night.goalRng);
  night.setVibeSum = 0;
  night.setVibeSamples = 0;
  night.setBrownouts = 0;
  night.setCrowdStart = night.crowd;
  night.phase = 'playing';
  night.playedSets.push({ djId, brief });
}

function eventContext(state: GameState, night: NightState): EventContext {
  return {
    heat: night.heat,
    spotTier: getSpot(night.spotId).tier,
    brief: night.brief,
    djRisk: night.currentDj ? getDj(night.currentDj).risk : 'normal',
    crowdRatio: night.cap > 0 ? night.crowd / night.cap : 0,
    gear: state.gear,
  };
}

/** Maximum events for the night, scaling with its length. */
function maxEvents(night: NightState): number {
  return Math.min(4, 1 + Math.floor(night.setCount / 2));
}

/**
 * Advance the night. Only ticks during the 'playing' phase — transitions and
 * events pause the world (the player is deciding).
 */
export function tickNight(state: GameState, night: NightState, dt: number): NightTickEvent[] {
  if (night.phase !== 'playing') return [];
  const events: NightTickEvent[] = [];
  const spot = getSpot(night.spotId);
  const genre = getGenre(night.genreId);
  const dj = night.currentDj ? getDj(night.currentDj) : null;

  // --- modificateurs du soir : produits/sommes des leviers passifs --------------
  const arrivalMod = modifierProduct(night.modifiers, 'arrivalMult');
  const churnMod = modifierProduct(night.modifiers, 'churnMult');
  const heatMod = modifierProduct(night.modifiers, 'heatMult');
  const priceMod = modifierProduct(night.modifiers, 'priceMult');
  const retentionMod = modifierSum(night.modifiers, 'retentionBonus');

  const soundOn = night.soundCutT <= 0;
  if (!soundOn) night.soundCutT -= dt;
  night.brownoutCooldown = Math.max(0, night.brownoutCooldown - dt);
  night.briefLockT = Math.max(0, night.briefLockT - dt);
  if (night.arrivalCutT > 0) night.arrivalCutT -= dt;

  const quality = night.setQuality * night.qualityMultRestOfSet * (night.murBlown ? 0.6 : 1);

  // --- power: demand grows with the crowd, supply is the generator ------------
  const groupeItem = GEAR.groupe[state.gear.groupe];
  const supply = groupeItem.value * (state.damaged.groupe ? 0.6 : 1) * spot.powerMult + 0.15;
  const demand = 0.35 + 0.5 * (night.cap > 0 ? night.crowd / night.cap : 0) + BRIEF_POWER[night.brief];
  if (demand > supply && soundOn && night.brownoutCooldown <= 0) {
    const prevMontee = night.montee;
    night.soundCutT = BROWNOUT_DURATION;
    night.brownoutCooldown = BROWNOUT_DURATION + BROWNOUT_COOLDOWN;
    night.vibe = Math.max(0, night.vibe - 0.12);
    // drop avorté : la jauge se vide et la foule décroche ∝ tension perdue
    night.montee *= MONTEE_BROWNOUT_DRAIN;
    night.crowd *= 1 - 0.08 * prevMontee;
    night.setBrownouts += 1;
    events.push({ type: 'brownout' });
  }

  // --- mur de son stress when pushing ------------------------------------------
  if (night.brief === 'pousser' && !night.murBlown) {
    const resilience = 1 + state.gear.mur * 0.5;
    night.murStress += (dt / 60) * (0.5 / resilience) * (state.damaged.mur ? 2 : 1);
    if (night.murStress >= 1 || (night.murStress > 0.6 && night.rng() < 0.01 * dt)) {
      const prevMontee = night.montee;
      night.murBlown = true;
      // le mur explose : la tension retombe à zéro et la foule décroche
      night.montee = 0;
      night.crowd *= 1 - 0.08 * prevMontee;
      events.push({ type: 'mur-blown' });
    }
  }

  // --- crowd ---------------------------------------------------------------------
  const charisme = dj ? dj.charisme : 2;
  const lumieres = GEAR.lumieres[state.gear.lumieres].value;
  const pull = soundOn ? 0.25 + 0.85 * quality + 0.06 * charisme : 0;
  const arrivalCut = night.arrivalCutT > 0 ? 0.5 : 1;
  const arrival =
    spot.arrival * genre.arrival * (1 + state.buzz) * (1 + state.rep * 0.002) * pull * arrivalCut * arrivalMod;
  let leaveMult = 1;
  if (!soundOn) leaveMult += 3;
  if (night.murBlown) leaveMult += 0.8;
  if (quality < 0.3) leaveMult += 1;
  // retention plus basse = on garde mieux le public ; le bonus du soir la réduit
  const retention = Math.max(0, 1 - 0.04 * charisme - retentionMod);
  const leaving = night.crowd * genre.churn * churnMod * retention * leaveMult;
  night.crowd = clamp(night.crowd + (arrival - leaving) * dt, 0, night.cap);
  night.peakCrowd = Math.max(night.peakCrowd, night.crowd);

  // --- vibe ------------------------------------------------------------------------
  let vibeTarget = soundOn ? clamp(0.15 + 0.62 * quality + lumieres, 0, 1) : 0;
  if (night.murBlown) vibeTarget = Math.max(0, vibeTarget - 0.12);
  const rate = vibeTarget > night.vibe ? 0.25 : 0.6;
  night.vibe = clamp(night.vibe + (vibeTarget - night.vibe) * rate * dt, 0, 1);
  night.vibeSum += night.vibe * dt;
  night.vibeSamples += dt;
  // accumulateurs du set (pour l'objectif évalué en fin de set)
  night.setVibeSum += night.vibe * dt;
  night.setVibeSamples += dt;

  // --- la montée : se charge en faisant vibrer le floor ----------------------------
  const monteeGain =
    dt * MONTEE_RATE * night.vibe * (night.brief === 'pousser' ? 1.4 : 1) * MONTEE_GENRE[night.genreId];
  night.montee = clamp(night.montee + monteeGain, 0, 1);
  if (night.vibe < 0.3) night.montee = Math.max(0, night.montee - dt * MONTEE_DECAY);

  // --- heat -----------------------------------------------------------------------
  const logistique = GEAR.logistique[state.gear.logistique].value;
  const riskMult = dj ? RISK_HEAT[dj.risk] : 1;
  night.heat += spot.heatBuild * genre.heatMult * BRIEF_HEAT[night.brief] * riskMult * logistique * heatMod * HEAT_BASE * dt;
  if (night.brief === 'safe') night.heat -= 0.01 * dt;
  night.heat = clamp(night.heat, 0, 1);
  night.peakHeat = Math.max(night.peakHeat, night.heat);
  if (night.heat >= 1) {
    endCurrentSet(state, night);
    night.phase = 'ended';
    night.busted = true;
    events.push({ type: 'bust' });
    return events;
  }

  // --- bar drip — plafonné par le stock embarqué -------------------------------------
  const drip = night.crowd * BAR_DRIP * spot.priceMult * priceMod * dt;
  const sold = Math.min(drip, Math.max(0, night.barCap - night.barSales));
  night.barSales += sold;
  night.bank += sold;

  // --- flash-prompts du dancefloor (non bloquants) ----------------------------------------
  if (night.floorPrompt && night.t > night.floorPrompt.expiresAt) {
    // ignoré : la bannière expire et applique son lapse éventuel
    if (night.floorPrompt.def.lapse) {
      applyEffects(state, night, night.floorPrompt.def.lapse);
      events.push({ type: 'prompt-missed' });
    }
    night.floorPrompt = null;
    night.nextPromptAt = night.t + PROMPT_SPACING + night.rng() * 6;
  }
  if (!night.floorPrompt && !night.pendingEvent && night.t >= night.nextPromptAt) {
    const promptDef = drawPrompt(eventContext(state, night), night.firedPrompts, night.rng);
    if (promptDef) {
      night.firedPrompts.push(promptDef.id);
      night.floorPrompt = { def: promptDef, expiresAt: night.t + promptDef.window };
    }
    night.nextPromptAt = night.t + PROMPT_SPACING + night.rng() * 6;
  }

  // --- random events --------------------------------------------------------------------
  if (
    night.t >= night.nextEventAt &&
    night.eventsFired.length < maxEvents(night) &&
    night.setElapsed > 8 &&
    night.setElapsed < night.setLen - 10
  ) {
    const def = drawEvent(eventContext(state, night), night.eventsFired, night.rng);
    if (def) {
      night.eventsFired.push(def.id);
      night.pendingEvent = { def };
      night.phase = 'event';
      // un event modal s'ouvre : on vide le prompt pour éviter le doublon visuel
      night.floorPrompt = null;
      night.nextEventAt = night.t + EVENT_MIN_SPACING + night.rng() * 40;
      return events;
    }
    night.nextEventAt = night.t + 20;
  }

  // --- clocks ------------------------------------------------------------------------------
  night.t += dt;
  night.setElapsed += dt;
  if (night.setElapsed >= night.setLen) {
    endCurrentSet(state, night);
    night.setIndex += 1;
    if (night.setIndex >= night.setCount) {
      night.phase = 'ended';
      night.sunrise = true;
      events.push({ type: 'sunrise' });
    } else {
      night.phase = 'transition';
      events.push({ type: 'set-ended' });
    }
  }
  return events;
}

function endCurrentSet(state: GameState, night: NightState): void {
  if (!night.currentDj) return;
  const member = getCrewMember(state, night.currentDj);
  applySetToll(member, night.brief, night.setElapsed);
  // évalue l'objectif du set — bonus only, aucune punition si raté
  if (night.setGoal) {
    const stats: SetStats = {
      avgVibe: night.setVibeSamples > 0 ? night.setVibeSum / night.setVibeSamples : 0,
      crowdGained: night.crowd - night.setCrowdStart,
      crowdEnd: night.crowd,
      cap: night.cap,
      brownouts: night.setBrownouts,
      bestDrop: night.bestDropThisSet,
      heat: night.heat,
    };
    if (night.setGoal.met(stats)) {
      night.repBonus += night.setGoal.reward.rep ?? 0;
      night.bank += night.setGoal.reward.cash ?? 0;
      night.goalsMet.push(night.setGoal.label);
    }
  }
}

/**
 * Applique un paquet d'effets aux jauges de la nuit. Partagé par les events
 * modaux, les flash-prompts et la montée.
 */
export function applyEffects(state: GameState, night: NightState, fx: EventEffects): void {
  if (fx.heat) night.heat = clamp(night.heat + fx.heat, 0, 0.99);
  if (fx.vibe) night.vibe = clamp(night.vibe + fx.vibe, 0, 1);
  if (fx.crowdFrac) night.crowd = clamp(night.crowd * (1 + fx.crowdFrac), 0, night.cap);
  if (fx.cash) night.bank = Math.max(0, night.bank + fx.cash);
  if (fx.forceBrief) {
    night.brief = fx.forceBrief;
    if (night.currentDj) {
      night.setQuality = computeSetQuality(state, night, night.currentDj, night.brief);
    }
  }
  if (fx.qualityMult) night.qualityMultRestOfSet *= fx.qualityMult;
  if (fx.soundCut) night.soundCutT = Math.max(night.soundCutT, fx.soundCut);
  if (fx.rep) night.repBonus += fx.rep;
  if (fx.arrivalCutT) night.arrivalCutT = fx.arrivalCutT;
  if (fx.montee) night.montee = clamp(night.montee + fx.montee, 0, 1);
  if (fx.damageRisk && night.rng() < fx.damageRisk.chance) {
    if (fx.damageRisk.category === 'mur') night.murBlown = true;
    state.damaged[fx.damageRisk.category] = true;
  }
}

/** Resolve a pending event with the chosen option. Returns the option for UI display. */
export function resolveEvent(state: GameState, night: NightState, optionIndex: number): EventOption {
  if (night.phase !== 'event' || !night.pendingEvent) throw new Error('no pending event');
  const option = night.pendingEvent.def.options[optionIndex];
  if (!option) throw new Error(`bad option: ${optionIndex}`);
  applyEffects(state, night, option.effects);
  night.journal.push({ t: night.t, titre: night.pendingEvent.def.titre, outcome: option.outcome });
  night.pendingEvent = null;
  night.phase = 'playing';
  return option;
}

/**
 * Saisit le flash-prompt courant : applique son effet `seize`, le nettoie et
 * reprogramme le prochain. Retourne le def saisi (ou null si aucun prompt).
 */
export function seizeFloorPrompt(state: GameState, night: NightState): FloorPromptDef | null {
  if (night.phase !== 'playing' || !night.floorPrompt) return null;
  const def = night.floorPrompt.def;
  applyEffects(state, night, def.seize);
  night.floorPrompt = null;
  night.nextPromptAt = night.t + PROMPT_SPACING + night.rng() * 6;
  return def;
}

export const BRIEF_LOCK = 18;

/** Change the consigne mid-set. The desk locks for BRIEF_LOCK seconds after. */
export function changeBrief(state: GameState, night: NightState, brief: Brief): boolean {
  if (night.phase !== 'playing' || night.briefLockT > 0 || night.brief === brief) return false;
  night.brief = brief;
  if (night.currentDj) {
    night.setQuality = computeSetQuality(state, night, night.currentDj, brief);
  }
  night.briefLockT = BRIEF_LOCK;
  return true;
}

/**
 * Encaisse la montée : drop. Pleine jauge = climax énorme mais exposé,
 * drop tôt = petit gain safe. Pas de cooldown — la recharge EST la barrière.
 */
export function dropMontee(night: NightState): boolean {
  if (night.phase !== 'playing' || night.montee < MONTEE_MIN_DROP) return false;
  const m = night.montee;
  night.vibe = clamp(night.vibe + 0.1 + 0.25 * m, 0, 1);
  night.crowd = clamp(night.crowd + night.cap * 0.05 * m, 0, night.cap);
  night.heat = clamp(night.heat + 0.02 + 0.06 * m, 0, 0.99);
  night.bestDropThisSet = Math.max(night.bestDropThisSet, m);
  night.montee = 0;
  return true;
}
