import { BRANCH_TIER, GEAR, GEAR_CATEGORIES, getDj, getSpot, ownedGear, switchBranchItem } from './data';
import { essenceCost, restockCost } from './economy';
import { applyNightRest, effectiveCut, getCrewMember } from './crew';
import { buzzAfterNight } from './idle';
import { buildRegionRules } from './regions';
import { hasPerk } from './tour';
import type { GameState, GearBranch, GearCategory, GearItem, NightResult, NightState } from './types';

/** Unique DJs who played at least one set tonight. */
function playedDjs(night: NightState): Set<string> {
  return new Set(night.playedSets.map((s) => s.djId));
}

function avgVibe(night: NightState): number {
  return night.vibeSamples > 0 ? night.vibeSum / night.vibeSamples : 0;
}

function carryDamage(state: GameState, night: NightState): void {
  if (night.murBlown) state.damaged.mur = true;
}

/**
 * Une nuit propre passe : la garde à vue décrémente — au settle UNIQUEMENT
 * (spec : « décrémente à chaque settle »). Pas dans applyBust : la nuit du
 * bust aggravé poserait 2 nuits puis en consommerait une immédiatement —
 * le DJ ne raterait qu'une seule nuit au lieu des 2 promises.
 */
function tickGardeAVue(state: GameState): void {
  for (const id of Object.keys(state.gardeAVue)) {
    const left = (state.gardeAVue[id] ?? 0) - 1;
    if (left <= 0) delete state.gardeAVue[id];
    else state.gardeAVue[id] = left;
  }
}

function trackRecords(state: GameState, result: NightResult): void {
  state.bestCrowd = Math.max(state.bestCrowd, result.peakCrowd);
  state.bestPayout = Math.max(state.bestPayout, result.payout);
}

/** Sum of cuts for the unique DJs who played tonight. */
export function cutsTotal(state: GameState, night: NightState): number {
  const played = playedDjs(night);
  let total = 0;
  for (const id of played) total += effectiveCut(getDj(id), getCrewMember(state, id));
  return Math.min(0.6, total);
}

/** Flat rep for holding a free party to sunrise — the legend always grows. */
const SUNRISE_REP = 3;

/** Sunrise reached: bank × prix libre, minus the crew's cuts. */
export function settleNight(state: GameState, night: NightState): NightResult {
  const vibe = avgVibe(night);
  const spot = getSpot(night.spotId);
  const donationMult =
    (1 + 0.8 * vibe + 0.6 * (night.peakCrowd / night.cap)) *
    spot.donationMult *
    night.rules.prixLibreMult;
  const grossRaw = Math.round(night.bank * donationMult);
  // frais de nuit : prélevés sur le brut, jamais sur la banque (no-softlock)
  const essence = Math.min(grossRaw, essenceCost(state, night));
  const restock = Math.min(grossRaw - essence, restockCost(spot, night.cap, night.barStock));
  const gross = grossRaw - essence - restock;
  const cuts = cutsTotal(state, night);
  const payout = Math.round(gross * (1 - cuts));
  const survivedHighHeat = night.peakHeat >= 0.8;
  // le dernier drop de l'aube compte double encore : re-crédité au règlement.
  // L'évacuation propre conserve la caisse, mais la légende en prend un coup (×0.4).
  const evacMult = night.evacuated ? 0.4 : 1;
  const repGained = Math.round(
    (SUNRISE_REP + night.peakCrowd / 10 + (survivedHighHeat ? 15 : 0) + night.repBonus + night.lastAubeDropRep) *
      evacMult,
  );
  // garde-fou : évacuer le Teknival n'est pas le gagner
  const won = night.spotId === 'teknival' && !night.evacuated;

  state.cash += payout + night.cautionPaid; // caution rendue à l'aube
  state.rep += repGained;
  state.nights += 1;
  tickGardeAVue(state);
  if (!night.rules.casierGele) state.casier = Math.max(0, state.casier - 1);
  if (won) {
    state.wonTeknival = true;
    state.tour.teknivalWins += 1;
  }
  carryDamage(state, night);
  applyNightRest(state, playedDjs(night));
  // jouer trop mou réduit le buzz de fin de nuit (spec story A)
  const softFrac = night.t > 0 ? Math.min(1, night.softT / night.t) : 0;
  const quality = Math.min(1, (0.6 * vibe + 0.5 * (night.peakCrowd / night.cap)) * (1 - 0.3 * softFrac));
  buzzAfterNight(state, quality, night.evacuated ? 0.8 : 1);

  const result: NightResult = {
    spotId: night.spotId,
    busted: false,
    won,
    raidOutcome: night.raid?.outcome ?? null,
    evacuated: night.evacuated,
    bank: Math.round(night.bank),
    donationMult,
    gross,
    cutsTotal: cuts,
    payout,
    fine: 0,
    essence,
    restock,
    cautionPaid: night.cautionPaid,
    cautionReturned: night.cautionPaid,
    seized: null,
    repGained,
    peakCrowd: Math.round(night.peakCrowd),
    avgVibe: vibe,
    bestWaveScore: night.bestWaveScore,
    duration: night.t,
    lineup: night.playedSets,
    journal: night.journal,
    goalsMet: night.goalsMet,
    modifiers: night.modifiers,
  };
  trackRecords(state, result);
  return result;
}

/** Most valuable seizable gear owned (never tier 0). */
function bestSeizable(state: GameState): GearCategory | null {
  let best: GearCategory | null = null;
  let bestValue = -1;
  for (const cat of GEAR_CATEGORIES) {
    const item = ownedGear(state, cat);
    if (item.seizable && item.price > bestValue) {
      best = cat;
      bestValue = item.price;
    }
  }
  return best;
}

/**
 * Busted. Escalation with prior offenses: #1 lose half the bank, #2 lose it
 * all plus a fine, #3+ fine plus seizure of the priciest seizable gear.
 * Logistique softens the blow by one step the first time it would seize.
 */
export function applyBust(state: GameState, night: NightState): NightResult {
  const spot = getSpot(night.spotId);
  state.busts += 1;
  const offense = state.busts;

  let gross = 0;
  let fine = 0;
  let seized: GearCategory | null = null;

  if (offense === 1) {
    gross = Math.round(night.bank * 0.5);
  } else if (offense === 2) {
    fine = 200 * spot.tier;
  } else {
    fine = 200 * spot.tier;
    seized = bestSeizable(state);
    if (seized) state.gear[seized] = Math.max(0, state.gear[seized] - 1);
  }

  // les frais ne touchent jamais la banque : plafonnés à ce que la nuit a rapporté
  const essence = Math.min(gross, essenceCost(state, night));
  const restock = Math.min(gross - essence, restockCost(spot, night.cap, night.barStock));
  gross -= essence + restock;

  const cuts = cutsTotal(state, night);
  const payout = Math.round(gross * (1 - cuts));
  state.cash = Math.max(0, state.cash + payout - fine);
  const repGained = Math.round(night.peakCrowd / 20 + night.repBonus);
  state.rep += repGained;
  state.nights += 1;
  // PAS de tickGardeAVue ici (voir son doc-comment) : une garde à vue
  // antérieure ne décompte pas non plus sur une nuit bustée, assumé
  state.casier += 1;
  carryDamage(state, night);
  applyNightRest(state, playedDjs(night));

  const result: NightResult = {
    spotId: night.spotId,
    busted: true,
    won: false,
    raidOutcome: night.raid?.outcome ?? null,
    evacuated: night.evacuated,
    bank: Math.round(night.bank),
    donationMult: 0,
    gross,
    cutsTotal: cuts,
    payout,
    fine,
    essence,
    restock,
    cautionPaid: night.cautionPaid,
    cautionReturned: 0,
    seized,
    repGained,
    peakCrowd: Math.round(night.peakCrowd),
    avgVibe: avgVibe(night),
    bestWaveScore: night.bestWaveScore,
    duration: night.t,
    lineup: night.playedSets,
    journal: night.journal,
    goalsMet: night.goalsMet,
    modifiers: night.modifiers,
  };
  trackRecords(state, result);
  return result;
}

export function isSpotUnlocked(state: GameState, spotId: NightState['spotId']): boolean {
  return state.rep >= getSpot(spotId).repReq;
}

/**
 * Un spot est jouable si la rep suffit ET si la région ne l'interdit pas.
 * Une région peut aussi surcharger le seuil de rep (Terre de béton ouvre la
 * carrière à rep 0 — garde-fou no-softlock).
 */
export function isSpotAvailable(state: GameState, spotId: NightState['spotId']): boolean {
  const rules = buildRegionRules(state.region);
  if (rules.bannedSpotIds.includes(spotId)) return false;
  const req = rules.repReqOverride[spotId] ?? getSpot(spotId).repReq;
  return state.rep >= req;
}

export function buyGearUpgrade(state: GameState, cat: GearCategory, branch?: GearBranch): boolean {
  const nextTier = state.gear[cat] + 1;
  let next: GearItem | undefined;
  if (nextTier < BRANCH_TIER) {
    next = GEAR[cat].find((g) => g.tier === nextTier);
  } else if (nextTier === BRANCH_TIER) {
    if (!branch) return false; // le tier 3 exige un choix de voie
    next = GEAR[cat].find((g) => g.tier === nextTier && g.branch === branch);
  } else {
    const chosen = state.gearBranch[cat];
    // le tier mythique couronne les deux voies — il n'a pas de branche
    next = GEAR[cat].find((g) => g.tier === nextTier && (g.mythic || g.branch === chosen));
  }
  if (!next || state.cash < next.price) return false;
  // le tier mythique se paie en € mais s'ouvre à l'Héritage
  if (next.mythic && !hasPerk(state, `mythe-${cat}`)) return false;
  state.cash -= next.price;
  state.gear[cat] = nextTier;
  if (nextTier === BRANCH_TIER) state.gearBranch[cat] = branch;
  return true;
}

/** Changer de voie : racheter l'item miroir du tier courant au prix plein. */
export function switchGearBranch(state: GameState, cat: GearCategory): boolean {
  const target = switchBranchItem(state, cat);
  if (!target || state.cash < target.price) return false;
  state.cash -= target.price;
  state.gearBranch[cat] = target.branch;
  return true;
}
