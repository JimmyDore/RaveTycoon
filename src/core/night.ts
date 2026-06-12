import { plantArc, takeDueArc, tempHeatBuildMult, tempStartHeat } from './arcs';
import { applySetToll, effectiveTechnique, fatigueQualityMult, getCrewMember } from './crew';
import { getDj, getGenre, getSpot, ownedGear } from './data';
import { BAR_DRIP, BAR_STOCK_CAP, cautionCost, potentialBar, type BarStock } from './economy';
import { drawEvent } from './events';
import { drawGoal } from './goals';
import { BUZZ_CAP } from './idle';
import { ATTENTE_GENRE, INTENSITY_HEAT, INTENSITY_LEVEL, INTENSITY_POWER, INTENSITY_QUALITY, isHighIntensity, type Intensity } from './intensity';
import { modifierProduct, modifierSum, rollModifiers } from './modifiers';
import { getPhase, phaseAt, phaseAttente } from './phases';
import { drawPrompt } from './prompts';
import { startDescente, tickRaid } from './raid';
import { buildRegionRules } from './regions';
import { mulberry32 } from './rng';
import { activeSpecial, drawRival } from './specials';
import type {
  DjDef,
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
  tribe: 1.15,
  hardcore: 1.35,
  downtempo: 0.7,
  electro: 1.0,
};
/** décroissance /s quand la vibe est trop basse */
const MONTEE_DECAY = 0.03;
/** ×= sur la jauge lors d'une coupure son (drop avorté) */
const MONTEE_BROWNOUT_DRAIN = 0.4;
/** seuil minimal pour pouvoir lâcher */
export const MONTEE_MIN_DROP = 0.1;
/** espacement de base (s) entre deux flash-prompts du dancefloor */
const PROMPT_SPACING = 12;

// --- la vague (story A) ---------------------------------------------------------
export const TOL_BASE = 0.10;
export const TOL_PER_TECH = 0.03;
export const CHARISME_PULL = 0.06;
const BURNOUT_CHARGE: Partial<Record<Intensity, number>> = { peak: 0.02, rinse: 0.04 };
const BURNOUT_DECAY: Partial<Record<Intensity, number>> = { chill: 0.03, groove: 0.01 };
export const BURNOUT_ATTENTE_MALUS = 0.3;
export const BURNOUT_DROP_MALUS = 0.5;
const DROP_BURNOUT_RESET = 0.6;
const WAVE_WINDOW = 20;
/** bonus/malus de cible de vibe quand on est dans/sous la vague */
const WAVE_VIBE_BONUS = 0.08;
const SOFT_VIBE_MALUS = 0.1;

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
  const murItem = ownedGear(state, 'mur');
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
  // sans caution sur un tier ≥ 3 : +0.1 ; le casier chauffe les villes (tier ≥ 4)
  const casierHeat = spot.tier >= 4 ? 0.05 * state.casier : 0;
  const startHeat = clamp(
    (spot.tier >= 3 && cautionPaid === 0 ? 0.1 : 0) + casierHeat + tempStartHeat(state),
    0,
    0.5,
  );
  const rules = buildRegionRules(state.region);
  // modifs du soir (météo/foule) — flux RNG dédié, ne perturbe pas le flux des events
  const modifiers = rollModifiers(spot.tier, seed, rules.negativeModifierWeightMult);
  const eventDelay = modifierSum(modifiers, 'eventDelay');
  // contrat de nuit spéciale (story D) : l'offre acceptée pour CETTE nuit
  const special = activeSpecial(state);
  // soundclash : le rival du soir, tiré d'un flux RNG dédié (déterministe au seed)
  if (special && special.id === 'soundclash') {
    special.rival = drawRival(spot.tier, mulberry32((seed ^ 0x7a11) >>> 0));
  }
  const capped = special?.constraints.crowdCap ? Math.round(cap * special.constraints.crowdCap) : cap;
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
    intensity: 'groove',
    setQuality: 0,
    crowd: 0,
    peakCrowd: 0,
    cap: capped,
    vibe: 0.4,
    vibeSum: 0,
    vibeSamples: 0,
    heat: startHeat,
    peakHeat: startHeat,
    bank: 0,
    barStock,
    barCap: BAR_STOCK_CAP[barStock] * potentialBar(spot, capped),
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
    setPeakRinseT: 0,
    intensitySum: 0,
    nightPhase: 'ouverture',
    lastAubeDropRep: 0,
    attente: 0.35,
    burnout: 0,
    waveScore: 0,
    bestWaveScore: 0,
    softT: 0,
    setWaveSum: 0,
    setWaveSamples: 0,
    phaseWaveSum: { ouverture: 0, rush: 0, creux: 0, aube: 0 },
    phaseWaveT: { ouverture: 0, rush: 0, creux: 0, aube: 0 },
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
    rules,
    busted: false,
    sunrise: false,
    raid: null,
    evacuated: false,
    negoCorruption: false,
    special,
    rng: mulberry32(seed),
    // flux dédié, décalé du seed pour ne pas perturber le flux des events
    goalRng: mulberry32((seed ^ 0x9e3779b9) >>> 0),
  };
}

/** Charisme effectif : la voie Showmanship des platines profite à tout le crew. */
export function effectiveCharisme(state: GameState, dj: DjDef | null): number {
  const base = dj ? dj.charisme : 2;
  return base + (ownedGear(state, 'platines').effects?.charismeBonus ?? 0);
}

export interface WaveState {
  attente: number;
  tol: number;
  level: number;
  gap: number;
  inWave: boolean;
}

/**
 * L'état de la vague à cet instant : attente (baseline × genre − burnout),
 * tolérance (technique + région), attraction du charisme, écart. Partagé par
 * tickNight et la jauge de vague de l'UI.
 */
export function currentWave(state: GameState, night: NightState): WaveState {
  const dj = night.currentDj ? getDj(night.currentDj) : null;
  const member = night.currentDj ? getCrewMember(state, night.currentDj) : null;
  const tech = dj && member ? effectiveTechnique(dj, member) : 1;
  // baseline d'attente phasée : l'arc de la nuit (ouverture→rush→creux→aube)
  const baseline = phaseAttente(night.duration > 0 ? night.t / night.duration : 0);
  // contrat : « anniversaire » relève l'attente, les puristes pardonnent moins
  const mode = night.special?.rewards.attenteMode;
  const baselineEff = mode === 'haute' ? baseline + 0.15 : baseline;
  const attente = clamp(
    baselineEff * ATTENTE_GENRE[night.genreId] - BURNOUT_ATTENTE_MALUS * night.burnout,
    0,
    1,
  );
  const level = INTENSITY_LEVEL[night.intensity];
  const tol = Math.max(0.02, TOL_BASE + TOL_PER_TECH * tech + night.rules.attenteTolBonus);
  const tolEff = Math.max(0.02, tol - (mode === 'haute' ? 0.05 : mode === 'puriste' ? 0.08 : 0));
  const attenteEff = attente + (level - attente) * Math.min(1, CHARISME_PULL * effectiveCharisme(state, dj));
  const gap = level - attenteEff;
  return { attente, tol: tolEff, level, gap, inWave: Math.abs(gap) <= tolEff };
}

/** Produit des churnMult de voie (mur Infrabasses, lumières Hypnose). */
export function branchChurnMult(state: GameState): number {
  return (
    (ownedGear(state, 'mur').effects?.churnMult ?? 1) *
    (ownedGear(state, 'lumieres').effects?.churnMult ?? 1)
  );
}

/** Produit des heatMult de voie (mur Line array, groupe Silencieux). */
export function branchHeatMult(state: GameState): number {
  return (
    (ownedGear(state, 'mur').effects?.heatMult ?? 1) *
    (ownedGear(state, 'groupe').effects?.heatMult ?? 1)
  );
}

export function computeSetQuality(state: GameState, night: NightState, djId: string): number {
  const def = getDj(djId);
  const member = getCrewMember(state, djId);
  const platines = ownedGear(state, 'platines').value * (state.damaged.platines ? 0.7 : 1);
  const murQuality = ownedGear(state, 'mur').effects?.qualityMult ?? 1;
  const spotQ = getSpot(night.spotId).qualityMult;
  const tech = effectiveTechnique(def, member);
  const base = 0.18 + 0.16 * tech;
  return clamp(
    base * platines * murQuality * spotQ * fatigueQualityMult(member) * night.rules.setQualityMult,
    0.05,
    1.5,
  );
}

/** Begin the next set. Only valid in the 'transition' phase. */
export function startSet(state: GameState, night: NightState, djId: string): void {
  if (night.phase !== 'transition') throw new Error('not in transition');
  if (!night.presentDjs.includes(djId)) throw new Error(`dj not present: ${djId}`);
  night.currentDj = djId;
  // le son c'est le DJ : le genre du set courant est celui du DJ qui joue
  night.genreId = getDj(djId).genre;
  night.setQuality = computeSetQuality(state, night, djId);
  night.qualityMultRestOfSet = 1;
  night.setElapsed = 0;
  night.setPeakRinseT = 0;
  night.bestDropThisSet = 0;
  // un prompt ne traverse pas une transition de set (sinon il expire au 1er tick
  // du set suivant et applique son lapse hors du contrôle du joueur)
  night.floorPrompt = null;
  night.nextPromptAt = night.t + PROMPT_SPACING + night.rng() * 6;
  // objectif du set + reset des accumulateurs (flux RNG dédié)
  night.setGoal = drawGoal(eventContext(state, night), night.goalRng);
  night.setVibeSum = 0;
  night.setVibeSamples = 0;
  // le burnout et le waveScore, eux, persistent — la foule n'oublie pas entre deux sets
  night.setWaveSum = 0;
  night.setWaveSamples = 0;
  night.setBrownouts = 0;
  night.setCrowdStart = night.crowd;
  night.phase = 'playing';
  night.playedSets.push({ djId });
}

function eventContext(state: GameState, night: NightState): EventContext {
  return {
    heat: night.heat,
    spotTier: getSpot(night.spotId).tier,
    intensity: night.intensity,
    djRisk: night.currentDj ? getDj(night.currentDj).risk : 'normal',
    crowdRatio: night.cap > 0 ? night.crowd / night.cap : 0,
    gear: state.gear,
  };
}

/** Maximum events for the night, scaling with its length. */
function maxEvents(night: NightState): number {
  return Math.min(4, 1 + Math.floor(night.setCount / 2)) + night.rules.maxEventsBonus;
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

  // --- l'arc de la nuit : la phase est une pure fonction de t/duration ----------
  const frac = night.duration > 0 ? night.t / night.duration : 0;
  const phase = phaseAt(frac);
  if (phase.id !== night.nightPhase) {
    night.nightPhase = phase.id;
    events.push({ type: 'phase-change' });
  }

  // --- modificateurs du soir : produits/sommes des leviers passifs --------------
  const arrivalMod = modifierProduct(night.modifiers, 'arrivalMult');
  const churnMod = modifierProduct(night.modifiers, 'churnMult');
  const heatMod = modifierProduct(night.modifiers, 'heatMult');
  const priceMod = modifierProduct(night.modifiers, 'priceMult');
  const retentionMod = modifierSum(night.modifiers, 'retentionBonus');

  const soundOn = night.soundCutT <= 0;
  if (!soundOn) night.soundCutT -= dt;
  night.brownoutCooldown = Math.max(0, night.brownoutCooldown - dt);
  if (night.arrivalCutT > 0) night.arrivalCutT -= dt;

  const quality =
    night.setQuality * INTENSITY_QUALITY[night.intensity] * night.qualityMultRestOfSet *
    (night.murBlown ? 0.6 : 1);
  const charisme = effectiveCharisme(state, dj);

  // --- la vague : l'écart entre ce qu'on joue et ce que la foule attend ----------
  const wave = currentWave(state, night);
  night.attente = wave.attente;
  const { tol, gap, inWave } = wave;
  const tooSoft = gap < -tol;
  const tooHard = gap > tol;
  // burnout : charge à PEAK/RINSE, décharge à CHILL/GROOVE
  const burnoutRate = BURNOUT_CHARGE[night.intensity] ?? -(BURNOUT_DECAY[night.intensity] ?? 0);
  night.burnout = clamp(night.burnout + burnoutRate * dt, 0, 1);
  // waveScore : moyenne glissante ~WAVE_WINDOW s de « dans la vague »
  night.waveScore += ((inWave ? 1 : 0) - night.waveScore) * Math.min(1, dt / WAVE_WINDOW);
  night.bestWaveScore = Math.max(night.bestWaveScore, night.waveScore);
  // score de vague par phase de nuit (soundclash, story D)
  night.phaseWaveSum[night.nightPhase] += night.waveScore * dt;
  night.phaseWaveT[night.nightPhase] += dt;
  night.setWaveSum += night.waveScore * dt;
  night.setWaveSamples += dt;
  if (tooSoft) night.softT += dt;
  // trop fort : le DJ s'épuise ×1.5 sur ces secondes (compte dans fracPeakRinse)
  if (tooHard) night.setPeakRinseT += 0.5 * dt;

  // --- power: demand grows with the crowd, supply is the generator ------------
  const groupeItem = ownedGear(state, 'groupe');
  const supply = groupeItem.value * (state.damaged.groupe ? 0.6 : 1) * spot.powerMult + 0.15;
  // groupe voie Monstre : RINSE ne surcharge plus le groupe (révision chantier 1 faite)
  const intensityPower =
    night.intensity === 'rinse' && groupeItem.effects?.rinsePowerFree ? 0 : INTENSITY_POWER[night.intensity];
  const demand = 0.35 + 0.5 * (night.cap > 0 ? night.crowd / night.cap : 0) + intensityPower;
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
  if ((night.intensity === 'rinse' || (night.intensity === 'peak' && tooHard)) && !night.murBlown) {
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
  const lumieres = ownedGear(state, 'lumieres').value;
  const pull = soundOn ? 0.25 + 0.85 * quality + 0.06 * charisme : 0;
  const arrivalCut = night.arrivalCutT > 0 ? 0.5 : 1;
  // terre de dub & co : la région booste/freine certaines familles de BPM
  const genreRegionMult =
    genre.bpm <= 140
      ? night.rules.slowGenreArrivalMult
      : genre.bpm > 170
        ? night.rules.fastGenreArrivalMult
        : 1;
  const arrival =
    spot.arrival * genre.arrival * (1 + state.buzz) * (1 + state.rep * 0.002) * pull * arrivalCut *
    arrivalMod * phase.arrivalMult * night.rules.arrivalMult * genreRegionMult;
  let leaveMult = 1;
  if (!soundOn) leaveMult += 3;
  if (night.murBlown) leaveMult += 0.8;
  if (quality < 0.3) leaveMult += 1;
  // retention plus basse = on garde mieux le public ; le bonus du soir la réduit
  const retention = Math.max(0, 1 - 0.04 * charisme - retentionMod);
  const leaving =
    night.crowd * genre.churn * spot.churnMult * churnMod * phase.churnMult * branchChurnMult(state) *
    night.rules.churnMult * retention * leaveMult * (tooSoft ? 1 + 2 * (-gap - tol) : 1);
  night.crowd = clamp(night.crowd + (arrival - leaving) * dt, 0, night.cap);
  night.peakCrowd = Math.max(night.peakCrowd, night.crowd);

  // --- vibe ------------------------------------------------------------------------
  let vibeTarget = soundOn ? clamp(0.15 + 0.62 * quality + lumieres + (inWave ? WAVE_VIBE_BONUS : 0) - (tooSoft ? SOFT_VIBE_MALUS : 0), 0, 1) : 0;
  if (night.murBlown) vibeTarget = Math.max(0, vibeTarget - 0.12);
  const rate = vibeTarget > night.vibe ? 0.25 : 0.6;
  night.vibe = clamp(night.vibe + (vibeTarget - night.vibe) * rate * dt, 0, 1);
  night.vibeSum += night.vibe * dt;
  night.vibeSamples += dt;
  // accumulateurs du set (pour l'objectif évalué en fin de set)
  night.setVibeSum += night.vibe * dt;
  night.setVibeSamples += dt;
  // accumulateurs d'intensité : fatigue (set) et essence (nuit)
  if (isHighIntensity(night.intensity)) night.setPeakRinseT += dt;
  night.intensitySum += INTENSITY_LEVEL[night.intensity] * dt;

  // --- la montée : se charge en faisant vibrer le floor ----------------------------
  const monteeGain = dt * MONTEE_RATE * night.vibe * (inWave ? 1.5 : 1) * MONTEE_GENRE[night.genreId];
  night.montee = clamp(night.montee + monteeGain, 0, 1);
  if (night.vibe < 0.3) night.montee = Math.max(0, night.montee - dt * MONTEE_DECAY);

  // --- heat -----------------------------------------------------------------------
  const logistique = ownedGear(state, 'logistique').value;
  const riskMult = dj ? RISK_HEAT[dj.risk] : 1;
  night.heat += spot.heatBuild * genre.heatMult * INTENSITY_HEAT[night.intensity] * riskMult * logistique * heatMod * phase.heatMult * branchHeatMult(state) * tempHeatBuildMult(state) * night.rules.heatMult * HEAT_BASE * (tooHard ? 1 + 2 * (gap - tol) : 1) * dt;
  if (night.intensity === 'chill') night.heat -= 0.01 * dt;
  night.heat = clamp(night.heat, 0, 1);
  night.peakHeat = Math.max(night.peakHeat, night.heat);
  // --- la descente (story C) : le seuil ouvre une séquence jouable, pas un bust --
  if (!night.raid && night.heat >= night.rules.descenteThreshold) {
    startDescente(state, night);
    events.push({ type: 'descente' });
    // clause « pas de descente » : les bleus se moquent du contrat, mais le client non
    if (night.special?.constraints.noDescente && !night.special.breached) {
      night.special.breached = true;
      night.journal.push({ t: night.t, titre: 'Le contrat', outcome: 'La descente a tout gâché. Le client veut 60 % de son avance.' });
    }
  }
  tickRaid(state, night, dt, events);
  if (night.phase !== 'playing') return events; // bust par timer (ou siège, task 9)

  // --- arcs de conséquences : l'échéance passe AVANT le tirage aléatoire --------
  // (et avant le bar drip : l'event d'arc fige la banque au tick où il s'ouvre)
  if (
    !night.pendingEvent &&
    night.setElapsed > 8 &&
    night.setElapsed < night.setLen - 10
  ) {
    const due = takeDueArc(state);
    if (due) {
      night.pendingEvent = { def: due.event, arc: { arcId: due.arcId, stage: due.stage } };
      night.phase = 'event';
      night.floorPrompt = null; // pas de doublon visuel
      return events; // hors quota : eventsFired n'est pas touché
    }
  }

  // --- bar drip — plafonné par le stock embarqué -------------------------------------
  const drip = night.crowd * BAR_DRIP * spot.priceMult * priceMod * phase.barMult * night.rules.barMult * (night.special?.rewards.barMult ?? 1) * dt;
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
    closeCurrentSet(state, night);
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

export function closeCurrentSet(state: GameState, night: NightState): void {
  if (!night.currentDj) return;
  const member = getCrewMember(state, night.currentDj);
  const fracPeakRinse = night.setElapsed > 0 ? Math.min(1, night.setPeakRinseT / night.setElapsed) : 0;
  applySetToll(member, fracPeakRinse, night.setElapsed);
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
      avgWave: night.setWaveSamples > 0 ? night.setWaveSum / night.setWaveSamples : 0,
    };
    if (night.setGoal.met(stats)) {
      night.repBonus += (night.setGoal.reward.rep ?? 0) * night.rules.goalRepMult * getPhase(night.nightPhase).repMult;
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
  // les events peuvent déclencher la descente (elle se joue) — seul 1.0 est interdit
  if (fx.heat) night.heat = clamp(night.heat + fx.heat, 0, 0.99);
  if (fx.vibe) night.vibe = clamp(night.vibe + fx.vibe, 0, 1);
  if (fx.crowdFrac) night.crowd = clamp(night.crowd * (1 + fx.crowdFrac), 0, night.cap);
  if (fx.cash) night.bank = Math.max(0, night.bank + fx.cash);
  if (fx.forceIntensity) {
    const maxI = night.special?.constraints.maxIntensity;
    night.intensity =
      maxI && INTENSITY_LEVEL[fx.forceIntensity] > INTENSITY_LEVEL[maxI] ? maxI : fx.forceIntensity;
  }
  if (fx.qualityMult) night.qualityMultRestOfSet *= fx.qualityMult;
  if (fx.soundCut) night.soundCutT = Math.max(night.soundCutT, fx.soundCut);
  if (fx.rep) night.repBonus += fx.rep * getPhase(night.nightPhase).repMult;
  if (fx.arrivalCutT) night.arrivalCutT = fx.arrivalCutT;
  if (fx.montee) night.montee = clamp(night.montee + fx.montee, 0, 1);
  if (fx.damageRisk && night.rng() < fx.damageRisk.chance) {
    if (fx.damageRisk.category === 'mur') night.murBlown = true;
    state.damaged[fx.damageRisk.category] = true;
  }
  if (fx.heatMultNow) night.heat = clamp(night.heat * fx.heatMultNow, 0, 0.99);
  if (fx.buzzMult) state.buzz = Math.min(BUZZ_CAP, state.buzz * fx.buzzMult);
  if (fx.casierClear) state.casier = 0;
  if (fx.tempHeat) {
    state.tempEffects.push({
      heatBuildMult: fx.tempHeat.heatBuildMult,
      startHeatAdd: fx.tempHeat.startHeatAdd,
      nightsLeft: fx.tempHeat.nights,
    });
  }
  if (fx.plantsArc && night.rng() < fx.plantsArc.chance) {
    plantArc(state, fx.plantsArc.arcId, fx.plantsArc.stage ?? 0, night.rng);
  }
  if (fx.arcComplete && !state.arcsCompleted.includes(fx.arcComplete)) {
    state.arcsCompleted.push(fx.arcComplete);
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

/**
 * Change le cran d'intensité. Tappable à tout moment en phase `playing`,
 * AUCUN cooldown : le coût est dans la sim (burnout, heat, fatigue).
 */
export function setIntensity(night: NightState, i: Intensity): boolean {
  if (night.phase !== 'playing' || night.intensity === i) return false;
  const maxI = night.special?.constraints.maxIntensity;
  if (maxI && INTENSITY_LEVEL[i] > INTENSITY_LEVEL[maxI]) return false; // contrat : jamais RINSE
  night.intensity = i;
  return true;
}

/**
 * Encaisse la montée : drop. Pleine jauge = climax énorme mais exposé,
 * drop tôt = petit gain safe. Pas de cooldown — la recharge EST la barrière.
 */
export function dropMontee(state: GameState, night: NightState): boolean {
  if (night.phase !== 'playing' || night.montee < MONTEE_MIN_DROP) return false;
  const m = night.montee;
  // lumières voie Stroboscopique : le payoff du drop est multiplié ; la nuit à
  // thème (contrat) paie ses drops ×1.4 en plus
  const payoff =
    (ownedGear(state, 'lumieres').effects?.dropMult ?? 1) * (night.special?.rewards.dropPayoffMult ?? 1);
  // la vague paie, la foule cramée plafonne : ~1.5× au sommet, ~0.4× spammé
  const waveMult = (0.5 + night.waveScore) * (1 - BURNOUT_DROP_MALUS * night.burnout);
  // l'aube paie : le drop crédite de la rep (×2 d'aube intégré au barème de 6),
  // et le dernier drop de l'aube comptera double encore au règlement
  if (night.nightPhase === 'aube') {
    const dropRep = Math.round(6 * m * waveMult);
    night.repBonus += dropRep;
    night.lastAubeDropRep = dropRep;
  }
  night.vibe = clamp(night.vibe + (0.1 + 0.25 * m) * payoff * waveMult, 0, 1);
  night.crowd = clamp(night.crowd + night.cap * 0.05 * m * payoff * waveMult, 0, night.cap);
  night.heat = clamp(night.heat + 0.02 + 0.06 * m, 0, 0.99);
  night.burnout *= DROP_BURNOUT_RESET;
  // l'objectif « gros drop » lit le payoff post-multiplicateurs (spec story A)
  night.bestDropThisSet = Math.max(night.bestDropThisSet, m * waveMult);
  night.montee = 0;
  return true;
}
