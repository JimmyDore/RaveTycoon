import { DJS, GEAR_CATEGORIES, PERKS, SPOTS, getDj, getGenre, getSpot, nextGearOptions, ownedGear, switchBranchItem } from '../core/data';
import { BAR_STOCK_COST, ESSENCE_RATE, cautionCost, potentialBar, type BarStock } from '../core/economy';
import { STUDIO_COST, STUDIO_MAX, dayOffCost, djLevel, djRepThreshold, effectiveCut, fatigueMalus, gardeAVueNights, giftCost, isEnGardeAVue, lockedDjs, poolCut, recruitableDjs } from '../core/crew';
import { rushCost } from '../core/idle';
import { isSpotAvailable } from '../core/payout';
import { buildRegionRules, regionTraits, type RegionChoice } from '../core/regions';
import { getSpecial } from '../core/specials';
import { canBuyPerk, computeLegende, hasPerk, maxVeterans, perkCount } from '../core/tour';
import { MONTEE_MIN_DROP, computeSetQuality, currentWave } from '../core/night';
import { INTENSITIES, type Intensity } from '../core/intensity';
import { SIEGE_MAX_LOW, SIEGE_VIBE_MIN, negoCost } from '../core/raid';
import { NIGHT_PHASES, getPhase } from '../core/phases';
import type { NightModifierDef } from '../core/modifiers';
import type {
  DjDef,
  GameState,
  GearBranch,
  GearCategory,
  NightResult,
  NightState,
  PendingEvent,
  SpotId,
} from '../core/types';
import { STR, fmtCash, fmtCountdown, fmtTime } from './strings';
import type { BoardKind, ScoreRow } from './api';
import { helpButton } from './onboarding';
import { loadOnboarding } from './onboarding-state';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function portrait(djId: string, cls = 'dj-portrait'): HTMLElement {
  const img = el('img', cls) as HTMLImageElement;
  img.src = `/assets/portraits/${djId}.png`;
  img.alt = getDj(djId).nom;
  return img;
}

function statDots(value: number, max = 5): HTMLElement {
  const box = el('span', 'dots');
  for (let i = 0; i < max; i++) {
    box.append(el('span', `dot${i < value ? ' on' : ''}`));
  }
  return box;
}

function fatigueBar(fatigue: number): HTMLElement {
  const bar = el('div', 'fatigue-bar');
  const fill = el('div', 'fatigue-fill');
  const f = Math.min(1, fatigue);
  fill.style.width = `${(f * 100).toFixed(0)}%`;
  fill.classList.toggle('tired', f > 0.6);
  bar.append(fill);
  return bar;
}

/** The current quality penalty, shown next to the bar so the cost is legible. */
function fatigueMalusLabel(fatigue: number): HTMLElement | null {
  const malus = fatigueMalus(fatigue);
  if (malus < 0.03) return null;
  return el('span', `fatigue-malus${fatigue > 0.6 ? ' tired' : ''}`, STR.qualityMalus(Math.round(malus * 100)));
}

// --- prepare screen ----------------------------------------------------------

export type PrepTab = 'spot' | 'crew' | 'matos';

export interface PrepareSelection {
  spot: SpotId;
  present: Set<string>;
  barStock: BarStock;
  caution: boolean;
  /** Active tab on narrow screens (ignored by the desktop 3-column grid). */
  tab: PrepTab;
  /** Keys of expanded "locked content" teasers, e.g. 'spots' / 'crew'. */
  expanded: Set<string>;
}

export interface PrepareCallbacks {
  onLaunch(): void;
  onRecruit(djId: string): void;
  onGift(djId: string): void;
  onDayOff(djId: string): void;
  onStudio(djId: string): void;
  onBuy(cat: GearCategory, branch?: GearBranch): void;
  onSwitchBranch(cat: GearCategory): void;
  onRepairStart(cat: GearCategory): void;
  onRepairRush(cat: GearCategory): void;
  onExport(): void;
  onImport(): void;
  onNewGame(): void;
  onLeaderboard(): void;
  onHelp(): void;
  onHeritage(): void;
  onDepart(veteranIds: string[]): void;
  onAcceptOffer(): void;
  onDeclineOffer(): void;
}

export function renderPrepare(
  root: HTMLElement,
  state: GameState,
  selection: PrepareSelection,
  now: number,
  cb: PrepareCallbacks,
): void {
  root.innerHTML = '';
  root.className = 'screen screen-prepare';

  const header = el('header', 'topbar');
  header.append(el('div', 'brand', STR.title));
  const stats = el('div', 'stats');
  stats.append(
    stat('💶', fmtCash(state.cash), STR.cash),
    stat('⭐', String(Math.floor(state.rep)), STR.rep),
    stat('📢', `${Math.round(state.buzz * 100)}%`, STR.buzz),
  );
  if (state.casier > 0) {
    const chip = stat('📁', String(state.casier), 'casier');
    chip.title = STR.casierHint;
    stats.append(chip);
  }
  header.append(stats);
  header.append(helpButton(!loadOnboarding(localStorage).helpSeen, () => cb.onHelp()));

  const scroll = el('div', 'prepare-scroll');
  // header + tabs ride together in a sticky head so the tab switcher stays reachable
  // while a long crew/matos panel scrolls
  const head = el('div', 'prep-head');
  head.append(header);
  scroll.append(head);

  if (state.wonTeknival) {
    scroll.append(el('div', 'won-banner', `🏆 ${STR.wonTitle}`));
    const depart = el('button', 'card depart-card');
    depart.append(el('div', 'card-title', STR.departCard));
    depart.append(el('div', 'card-meta', STR.departPreview(computeLegende(state))));
    depart.append(el('div', 'card-desc', STR.departHint));
    depart.addEventListener('click', () => showDepartModal(root, state, cb));
    scroll.append(depart);
  }

  // bandeau région : la tournée entière se joue sous ces traits (chantier 4)
  if (state.region) {
    const banner = el('div', 'region-banner');
    banner.append(el('span', 'region-banner-nom', `🗺 ${state.region.nom}`));
    for (const t of regionTraits(state.region)) {
      const chip = el('span', 'region-trait-chip', `${t.icon} ${t.nom}`);
      chip.title = t.desc;
      banner.append(chip);
    }
    scroll.append(banner);
  }

  // offre de nuit spéciale du soir (story D) — au-dessus du choix de spot
  const offer = state.specialOffer && state.specialOffer.night === state.nights ? state.specialOffer : null;
  if (offer && !offer.declined) {
    const def = getSpecial(offer.id);
    const card = el('div', `card offer-card${offer.accepted ? ' accepted' : ''}`);
    card.append(el('div', 'offer-tag', offer.accepted ? STR.offerAccepted(def.nom) : STR.offerTag));
    card.append(el('div', 'card-title', `${def.icon} ${def.nom}`));
    card.append(el('div', 'card-desc', def.pitch));
    const terms = el('div', 'offer-terms');
    if (offer.cashUpfront) terms.append(el('div', 'offer-term', STR.offerCashUpfront(offer.cashUpfront)));
    if (def.rewards.repMult !== undefined) terms.append(el('div', 'offer-term', STR.offerRepMult(def.rewards.repMult)));
    if (offer.genreId) terms.append(el('div', 'offer-term', STR.offerGenre(getGenre(offer.genreId).nom)));
    if (offer.spotId) terms.append(el('div', 'offer-term', STR.offerSpot(getSpot(offer.spotId).nom)));
    if (def.constraints.maxIntensity) terms.append(el('div', 'offer-term', STR.offerMaxIntensity));
    if (def.constraints.crowdCap) terms.append(el('div', 'offer-term', STR.offerCrowdCap(Math.round(def.constraints.crowdCap * 100))));
    if (def.constraints.noDescente) terms.append(el('div', 'offer-term', STR.offerNoDescente));
    if (def.rewards.attenteMode === 'haute') terms.append(el('div', 'offer-term', STR.offerAttenteHaute));
    if (def.rewards.attenteMode === 'puriste') terms.append(el('div', 'offer-term', STR.offerAttentePuriste));
    if (def.id === 'soundclash') terms.append(el('div', 'offer-term', STR.offerClash));
    card.append(terms);
    if (!offer.accepted) {
      const row = el('div', 'offer-actions');
      const accept = el('button', 'btn small accent', STR.offerAccept);
      accept.addEventListener('click', () => cb.onAcceptOffer());
      const decline = el('button', 'btn small ghost', STR.offerDecline);
      decline.addEventListener('click', () => cb.onDeclineOffer());
      row.append(accept, decline);
      card.append(row);
    }
    scroll.append(card);
  }
  const contract = offer?.accepted ? offer : null;

  const tabs = el('div', 'prep-tabs');
  const TAB_ORDER: PrepTab[] = ['spot', 'crew', 'matos'];
  for (const t of TAB_ORDER) {
    const b = el('button', `btn tab prep-tab${selection.tab === t ? ' selected' : ''}`, STR.onboarding.tabs[t]);
    b.dataset.tab = t;
    b.addEventListener('click', () => {
      selection.tab = t;
      renderPrepare(root, state, selection, now, cb);
    });
    tabs.append(b);
  }
  head.append(tabs);

  const main = el('div', 'prepare-grid');

  // --- spots column
  const where = el('section', `panel panel-spot${selection.tab === 'spot' ? ' active' : ''}`);
  where.append(el('h2', '', STR.chooseSpot));
  const imposed = contract?.spotId;
  // "à débloquer" counts only progression-locked spots — NOT spots merely excluded by
  // tonight's contract (those are already unlocked, just restricted for this night).
  const lockedSpotCount = SPOTS.filter((spot) => !isSpotAvailable(state, spot.id)).length;
  for (const spot of SPOTS) {
    const available = isSpotAvailable(state, spot.id); // progression: rep / arc / region
    const selectable = available && (!imposed || spot.id === imposed); // pickable tonight
    // hide only progression-locked spots behind the teaser; contract-excluded-but-unlocked
    // spots stay visible (disabled) so the player sees the restriction, not a false lock.
    if (!available && !selection.expanded.has('spots')) continue;
    const card = el('button', `card spot-card${selection.spot === spot.id ? ' selected' : ''}${selectable ? '' : ' locked'}`);
    card.disabled = !selectable;
    card.append(el('div', 'card-title', spot.id === 'teknival' ? `🏆 ${spot.nom}` : spot.nom));
    card.append(
      el('div', 'card-meta', `${STR.capacity(spot.cap)} · ${STR.duration(Math.round(spot.duration / 60))} · ${STR.setsCount(spot.setCount)}`),
    );
    const banned = buildRegionRules(state.region).bannedSpotIds.includes(spot.id);
    card.append(
      el(
        'div',
        'card-desc',
        selectable
          ? spot.description
          : available
            ? STR.onboarding.spotContractLocked
            : banned
              ? `🚧 ${STR.spotBanned}`
              : spot.requiresArc && !state.arcsCompleted.includes(spot.requiresArc)
                ? `🔒 ${STR.chateauLocked}`
                : `🔒 ${STR.repNeeded(spot.repReq)}`,
      ),
    );
    if (selectable) {
      card.addEventListener('click', () => {
        selection.spot = spot.id;
        renderPrepare(root, state, selection, now, cb);
      });
    }
    where.append(card);
  }
  if (lockedSpotCount > 0 && !selection.expanded.has('spots')) {
    const teaser = el('button', 'card locked-teaser', STR.onboarding.lockedSpots(lockedSpotCount));
    teaser.addEventListener('click', () => {
      selection.expanded.add('spots');
      renderPrepare(root, state, selection, now, cb);
    });
    where.append(teaser);
  }

  // --- frais de nuit : stock du bar + caution
  const fees = el('div', 'night-fees');
  fees.append(el('h2', '', STR.nightCosts));
  fees.append(el('div', 'card-meta', STR.barStockLabel));
  const stockRow = el('div', 'stock-row');
  for (const stock of ['leger', 'normal', 'large'] as BarStock[]) {
    const b = el('button', `btn small${selection.barStock === stock ? ' selected' : ''}`, STR.barStock[stock]);
    b.title = STR.barStockHint[stock];
    b.addEventListener('click', () => {
      selection.barStock = stock;
      renderPrepare(root, state, selection, now, cb);
    });
    stockRow.append(b);
  }
  fees.append(stockRow);
  const spotDef = getSpot(selection.spot);
  if (spotDef.tier >= 3) {
    const cost = cautionCost(state, spotDef);
    const cBtn = el('button', `btn small${selection.caution ? ' selected' : ''}`, STR.cautionBtn(cost, selection.caution));
    cBtn.title = STR.cautionHint;
    cBtn.disabled = !selection.caution && state.cash < cost;
    cBtn.addEventListener('click', () => {
      selection.caution = !selection.caution;
      renderPrepare(root, state, selection, now, cb);
    });
    fees.append(cBtn);
  }
  const estCap = Math.round(spotDef.cap * ownedGear(state, 'mur').value);
  const estRestock = Math.round(BAR_STOCK_COST[selection.barStock] * potentialBar(spotDef, estCap));
  const estEssence = state.gear.groupe === 0 ? 0 : Math.round(ESSENCE_RATE * (spotDef.duration / 60) * 1);
  fees.append(el('p', 'hint', STR.feesEstimate(estRestock + estEssence)));
  where.append(fees);
  main.append(where);

  // --- crew column
  const crewSec = el('section', `panel panel-crew${selection.tab === 'crew' ? ' active' : ''}`);
  crewSec.append(el('h2', '', STR.chooseCrew));
  for (const member of state.crew) {
    const jailed = isEnGardeAVue(state, member.id);
    const def = getDj(member.id);
    // contrat à genre imposé : les DJs d'un autre genre ne sont pas embarquables
    const genreLocked = contract?.genreId !== undefined && def.genre !== contract.genreId;
    const aboard = selection.present.has(member.id);
    // nested buttons are invalid DOM — the sink buttons live inside, so the card is a div
    const card = el('div', `card dj-card${aboard ? ' selected' : ''}${jailed || genreLocked ? ' locked' : ''}`);
    const row = el('div', 'dj-row');
    row.append(portrait(member.id));
    const info = el('div', 'dj-info');
    const lvl = djLevel(member);
    info.append(el('div', 'card-title', `${def.nom}${lvl > 0 ? ` · ${STR.level(lvl)}` : ''}`));
    const statsLine = el('div', 'dj-stats');
    statsLine.append(el('span', 'dj-stat-label', STR.technique), statDots(def.technique + Math.floor(lvl * 0.5)));
    statsLine.append(el('span', 'dj-stat-label', STR.charisme), statDots(def.charisme));
    info.append(statsLine);
    const djGenre = getGenre(def.genre);
    info.append(el('div', 'dj-genre-badge', `${djGenre.nom} · ${djGenre.bpm} BPM`));
    const riskLine = el('div', 'dj-risk', `${STR.risk[def.risk]}${STR.riskHint[def.risk] ? ' — ' + STR.riskHint[def.risk] : ''} · ${STR.cut(effectiveCut(def, member))}`);
    info.append(riskLine);
    const fat = el('div', 'dj-fatigue');
    fat.append(el('span', 'dj-stat-label', STR.fatigue), fatigueBar(member.fatigue));
    const malus = fatigueMalusLabel(member.fatigue);
    if (malus) fat.append(malus);
    info.append(fat);
    if (genreLocked) {
      info.append(el('div', 'dj-risk', STR.genreLockedDj(getGenre(contract!.genreId!).nom)));
    }
    if (jailed) {
      // en garde à vue : pas de sinks, pas de sélection — juste le badge
      info.append(el('div', 'dj-risk', STR.gardeAVueBadge(gardeAVueNights(state, member.id))));
    } else {
      const sinks = el('div', 'crew-sinks');
      const sinkBtn = (label: string, hint: string, enabled: boolean, onClick: () => void) => {
        const b = el('button', 'btn small', label);
        b.title = hint;
        b.disabled = !enabled;
        b.addEventListener('click', (e) => {
          e.stopPropagation(); // ne pas (dé)sélectionner le DJ
          onClick();
        });
        sinks.append(b);
      };
      if (!member.gifted) {
        const cost = giftCost(member);
        sinkBtn(STR.giftBtn(cost), STR.giftHint, state.cash >= cost, () => cb.onGift(member.id));
      }
      if (member.fatigue > 0) {
        const cost = dayOffCost(member);
        sinkBtn(STR.dayOffBtn(cost), STR.dayOffHint, state.cash >= cost, () => cb.onDayOff(member.id));
      }
      if (member.studioBonus < STUDIO_MAX) {
        sinkBtn(STR.studioBtn(STUDIO_COST), STR.studioHint, state.cash >= STUDIO_COST, () => cb.onStudio(member.id));
      }
      if (sinks.childElementCount > 0) info.append(sinks);
    }
    row.append(info);
    card.append(row);
    if (!jailed && !genreLocked) {
      card.addEventListener('click', () => {
        if (aboard) selection.present.delete(member.id);
        else selection.present.add(member.id);
        renderPrepare(root, state, selection, now, cb);
      });
    }
    crewSec.append(card);
  }
  for (const def of recruitableDjs(state)) {
    const card = el('div', 'card dj-card recruitable');
    const row = el('div', 'dj-row');
    row.append(portrait(def.id));
    const info = el('div', 'dj-info');
    info.append(el('div', 'card-title', `✨ ${def.nom}`));
    info.append(el('div', 'card-desc', def.description));
    info.append(el('div', 'dj-risk', `${STR.risk[def.risk]} · ${STR.cut(poolCut(def))}`));
    const btn = el('button', 'btn small accent', STR.recruit);
    btn.addEventListener('click', () => cb.onRecruit(def.id));
    info.append(btn);
    row.append(info);
    card.append(row);
    crewSec.append(card);
  }
  const lockedDjList = lockedDjs(state);
  if (lockedDjList.length > 0 && !selection.expanded.has('crew')) {
    const teaser = el('button', 'card locked-teaser', STR.onboarding.lockedDjs(lockedDjList.length));
    teaser.addEventListener('click', () => {
      selection.expanded.add('crew');
      renderPrepare(root, state, selection, now, cb);
    });
    crewSec.append(teaser);
  } else {
    for (const def of lockedDjList) {
      const card = el('div', 'card dj-card locked');
      card.append(el('div', 'card-title', `🔒 ${def.nom}`));
      card.append(el('div', 'card-desc', `${STR.repNeeded(djRepThreshold(state, def))}`));
      crewSec.append(card);
    }
  }
  main.append(crewSec);

  // --- gear column
  const shopSec = el('section', `panel panel-matos${selection.tab === 'matos' ? ' active' : ''}`);
  shopSec.append(el('h2', '', STR.shop));
  for (const cat of GEAR_CATEGORIES) {
    const current = ownedGear(state, cat);
    const row = el('div', 'gear-row');
    const info = el('div', 'gear-info');
    info.append(el('div', 'gear-cat', STR.gearCats[cat]));
    const nameLine = el('div', 'gear-name', current.nom);
    if (current.branch) nameLine.append(el('span', 'gear-branch-tag', ` · ${STR.gearBranchTag(STR.gearBranchNames[cat][current.branch])}`));
    if (state.damaged[cat]) nameLine.append(el('span', 'gear-damaged', ` ${STR.damaged}`));
    info.append(nameLine);
    info.append(el('div', 'gear-effect', STR.gearEffect[cat]));
    row.append(info);

    const actions = el('div', 'gear-actions');
    if (state.damaged[cat]) {
      const job = state.repairs.find((j) => j.category === cat);
      if (job) {
        actions.append(el('div', 'repair-status', `${STR.repairing} ${STR.readyIn(fmtCountdown(job.readyAt - now))}`));
      } else {
        const repairBtn = el('button', 'btn small', STR.repair);
        repairBtn.addEventListener('click', () => cb.onRepairStart(cat));
        actions.append(repairBtn);
      }
      const cost = rushCost(state, cat);
      const rushBtn = el('button', 'btn small accent', STR.rush(cost));
      rushBtn.disabled = state.cash < cost;
      rushBtn.addEventListener('click', () => cb.onRepairRush(cat));
      actions.append(rushBtn);
    } else {
      const options = nextGearOptions(state, cat);
      if (options.length === 0) {
        actions.append(el('div', 'gear-maxed', STR.maxed));
      }
      for (const next of options) {
        if (next.mythic && !hasPerk(state, `mythe-${cat}`)) {
          actions.append(el('div', 'gear-maxed', `🔒 ${STR.mythicLocked}`));
          continue;
        }
        const voie = next.branch ? ` (${STR.gearBranchNames[cat][next.branch]})` : '';
        const buyBtn = el('button', 'btn small', `${STR.buy} ${next.nom}${voie} — ${fmtCash(next.price)}`);
        buyBtn.disabled = state.cash < next.price;
        buyBtn.addEventListener('click', () => cb.onBuy(cat, next.branch));
        actions.append(buyBtn);
      }
      const other = switchBranchItem(state, cat);
      if (other?.branch) {
        const sw = el('button', 'btn small ghost', STR.switchBranch(STR.gearBranchNames[cat][other.branch], other.price));
        sw.disabled = state.cash < other.price;
        sw.addEventListener('click', () => cb.onSwitchBranch(cat));
        actions.append(sw);
      }
    }
    row.append(actions);
    shopSec.append(row);
  }
  const anyAffordable = GEAR_CATEGORIES.some((cat) => {
    if (state.damaged[cat]) return state.cash >= rushCost(state, cat);
    return nextGearOptions(state, cat).some((o) => (!o.mythic || hasPerk(state, `mythe-${cat}`)) && state.cash >= o.price);
  });
  if (!anyAffordable) {
    shopSec.append(el('p', 'hint', STR.onboarding.brokeMatos));
  }
  shopSec.append(el('p', 'hint', STR.buzzHint));
  main.append(shopSec);
  scroll.append(main);

  // --- meta actions stay in the scroll area (secondary)
  const meta = el('div', 'meta-actions');
  const herBtn = el('button', 'btn ghost', `⭐ ${STR.heritage} (${state.tour.legende})`);
  herBtn.addEventListener('click', () => cb.onHeritage());
  const lbBtn = el('button', 'btn ghost', `🏅 ${STR.leaderboard}`);
  lbBtn.addEventListener('click', () => cb.onLeaderboard());
  const expBtn = el('button', 'btn ghost', STR.exportSave);
  expBtn.addEventListener('click', () => cb.onExport());
  const impBtn = el('button', 'btn ghost', STR.importSave);
  impBtn.addEventListener('click', () => cb.onImport());
  const resetBtn = el('button', 'btn ghost danger', STR.newGameBtn);
  resetBtn.addEventListener('click', () => cb.onNewGame());
  meta.append(herBtn, lbBtn, expBtn, impBtn, resetBtn);
  scroll.append(meta);

  root.append(scroll);

  // --- always-visible launch bar (outside the scroll area)
  const launchBar = el('div', 'launch-bar');
  const canLaunch = selection.present.size > 0;
  const launch = el(
    'button',
    'btn launch',
    canLaunch ? `▶ ${STR.launch} — ${getSpot(selection.spot).nom}` : STR.needOneDj,
  );
  launch.disabled = !canLaunch;
  launch.addEventListener('click', () => cb.onLaunch());
  launchBar.append(launch);
  root.append(launchBar);
}

/** Confirmation du départ : la liste exacte du perdu/gardé, le choix des vétérans. */
function showDepartModal(root: HTMLElement, state: GameState, cb: PrepareCallbacks): void {
  const overlay = el('div', 'night-modal');
  const panel = el('div', 'modal-panel depart-panel');
  panel.append(el('h2', '', STR.departTitle));
  panel.append(el('div', 'depart-preview', STR.departPreview(computeLegende(state))));

  const cols = el('div', 'depart-cols');
  const lost = el('div', 'depart-col');
  lost.append(el('h3', '', STR.departLostTitle));
  for (const line of STR.departLost) lost.append(el('div', 'depart-line', `✗ ${line}`));
  const kept = el('div', 'depart-col');
  kept.append(el('h3', '', STR.departKeptTitle));
  for (const line of STR.departKept) kept.append(el('div', 'depart-line', `✓ ${line}`));
  cols.append(lost, kept);
  panel.append(cols);

  const slots = maxVeterans(state);
  const candidates = state.crew.filter((d) => d.id !== 'tonton');
  const chosen = new Set<string>();
  if (candidates.length > 0) {
    panel.append(el('h3', '', STR.departVeteranTitle(slots)));
    const list = el('div', 'pick-dj-list');
    for (const member of candidates) {
      const def = getDj(member.id);
      const lvl = djLevel(member);
      const card = el('button', 'card dj-pick');
      card.dataset.dj = member.id;
      const row = el('div', 'dj-row');
      row.append(portrait(member.id, 'dj-portrait small'));
      const info = el('div', 'dj-info');
      info.append(el('div', 'card-title', `${def.nom}${lvl > 0 ? ` · ${STR.level(lvl)}` : ''}`));
      row.append(info);
      card.append(row);
      card.addEventListener('click', () => {
        if (chosen.has(member.id)) chosen.delete(member.id);
        else if (chosen.size < slots) chosen.add(member.id);
        for (const c of Array.from(list.children) as HTMLElement[]) {
          c.classList.toggle('selected', chosen.has(c.dataset.dj ?? ''));
        }
      });
      list.append(card);
    }
    panel.append(list);
  }

  const actions = el('div', 'recap-actions');
  const cancel = el('button', 'btn ghost', STR.departCancel);
  cancel.addEventListener('click', () => overlay.remove());
  const go = el('button', 'btn launch', STR.departConfirm);
  go.addEventListener('click', () => cb.onDepart([...chosen]));
  actions.append(cancel, go);
  panel.append(actions);

  overlay.append(panel);
  root.append(overlay);
}

function stat(icon: string, value: string, label: string): HTMLElement {
  const box = el('div', 'stat');
  box.append(el('span', 'stat-icon', icon), el('span', 'stat-value', value), el('span', 'stat-label', label));
  return box;
}

// --- night screen ------------------------------------------------------------

export interface NightScreen {
  canvas: HTMLCanvasElement;
  update(state: GameState, night: NightState): void;
  toast(msg: string): void;
  /** bannière one-shot des modifs du soir, au lancement de la nuit */
  showModifiers(modifiers: NightModifierDef[]): void;
  showTransition(state: GameState, night: NightState, onStart: (djId: string) => void): void;
  showEvent(night: NightState, pending: PendingEvent, onChoose: (index: number) => string): void;
}

export interface NightLiveCallbacks {
  onIntensity(i: Intensity): void;
  onDrop(): void;
  onPrompt(): void;
  onRaid(choice: 'evacuer' | 'negocier' | 'tenir'): void;
  onHelp(): void;
}

export function renderNight(root: HTMLElement, live: NightLiveCallbacks): NightScreen {
  root.innerHTML = '';
  root.className = 'screen screen-night';

  const sceneWrap = el('div', 'scene-wrap');
  const canvas = el('canvas', 'scene-canvas');
  sceneWrap.append(canvas);

  const hudTop = el('div', 'hud-top');
  const setBox = el('div', 'hud-stat');
  const setValue = el('div', 'hud-stat-value', '');
  setBox.append(setValue, el('div', 'hud-stat-label', '🎚'));
  const clock = el('div', 'hud-clock');
  const clockValue = el('div', 'hud-clock-value', '0:00');
  clock.append(clockValue, el('div', 'hud-clock-label', STR.sunriseIn));
  const crowdBox = el('div', 'hud-stat');
  const crowdValue = el('div', 'hud-stat-value', '0');
  crowdBox.append(crowdValue, el('div', 'hud-stat-label', STR.crowdLabel));
  const bankBox = el('div', 'hud-stat');
  const bankValue = el('div', 'hud-stat-value', '0 €');
  bankBox.append(bankValue, el('div', 'hud-stat-label', STR.bankLabel));
  hudTop.append(setBox, crowdBox, clock, bankBox);
  sceneWrap.append(hudTop);

  const nightHelp = helpButton(false, () => live.onHelp());
  nightHelp.classList.add('hud-help');
  sceneWrap.append(nightHelp);

  // timeline de l'arc de nuit : 4 segments, curseur de progression, icône de phase
  const timeline = el('div', 'night-timeline');
  const timelineSegs = new Map<string, HTMLElement>();
  for (const p of NIGHT_PHASES) {
    const seg = el('div', `timeline-seg seg-${p.id}`);
    seg.style.width = `${((p.frac[1] - p.frac[0]) * 100).toFixed(1)}%`;
    timelineSegs.set(p.id, seg);
    timeline.append(seg);
  }
  const timelineCursor = el('div', 'timeline-cursor');
  const timelineIcon = el('div', 'timeline-icon', NIGHT_PHASES[0].icon);
  timeline.append(timelineCursor, timelineIcon);
  sceneWrap.append(timeline);

  // badges discrets des modifs du soir (icône + nom), peuplés au premier update
  const modifierBadges = el('div', 'night-modifiers');
  sceneWrap.append(modifierBadges);
  let badgesDone = false;

  // bannière one-shot des modifs, révélée au lancement de la nuit
  const modifierBanner = el('div', 'night-modifiers-banner hidden');
  sceneWrap.append(modifierBanner);

  const bottomBar = el('div', 'night-bottom');
  const nowCol = el('div', 'now-col');
  const nowPlaying = el('div', 'now-playing');
  // chip d'objectif de set : libellé + ✓ une fois atteint
  const goalChip = el('div', 'set-goal-chip hidden');
  const goalChipTag = el('span', 'set-goal-chip-tag', STR.setGoalLabel);
  const goalChipLabel = el('span', 'set-goal-chip-label', '');
  goalChip.append(goalChipTag, goalChipLabel);
  nowCol.append(goalChip, nowPlaying);
  const heatWrap = el('div', 'heat-wrap');
  const heatBar = el('div', 'heat-bar');
  const heatFill = el('div', 'heat-fill');
  heatBar.append(heatFill);
  heatWrap.append(el('div', 'heat-label', `👮 ${STR.heat}`), heatBar);
  const vibeWrap = el('div', 'vibe-wrap');
  const vibeBar = el('div', 'vibe-bar');
  const vibeFill = el('div', 'vibe-fill');
  vibeBar.append(vibeFill);
  vibeWrap.append(el('div', 'heat-label', `🔥 ${STR.vibeLabel}`), vibeBar);
  bottomBar.append(nowCol, heatWrap, vibeWrap);

  const liveWrap = el('div', 'live-controls');
  // jauge de vague : bande de tolérance (position = attente) + curseur (= cran joué)
  const waveBar = el('div', 'wave-bar');
  const waveBurnout = el('div', 'wave-burnout');
  const waveBand = el('div', 'wave-band');
  const waveCursor = el('div', 'wave-cursor');
  waveBar.append(waveBurnout, waveBand, waveCursor);
  const waveWrap = el('div', 'wave-wrap');
  waveWrap.append(el('div', 'heat-label', `🌊 ${STR.waveLabel}`), waveBar);
  liveWrap.append(waveWrap);
  const cranHint = el('div', 'cran-hint', '');
  liveWrap.append(cranHint);
  const cranBtns = new Map<Intensity, HTMLButtonElement>();
  for (const cran of INTENSITIES) {
    const b = el('button', 'live-cran', STR.intensites[cran]) as HTMLButtonElement;
    b.title = STR.intensiteHints[cran];
    b.addEventListener('click', () => live.onIntensity(cran));
    cranBtns.set(cran, b);
    liveWrap.append(b);
  }
  const monteeBar = el('div', 'montee-bar');
  const monteeFill = el('div', 'montee-fill');
  monteeBar.append(monteeFill);
  liveWrap.append(monteeBar);
  const dropBtn = el('button', 'live-drop', STR.dropAction) as HTMLButtonElement;
  dropBtn.addEventListener('click', () => live.onDrop());
  liveWrap.append(dropBtn);
  bottomBar.append(liveWrap);
  sceneWrap.append(bottomBar);

  const toasts = el('div', 'toasts');
  sceneWrap.append(toasts);

  // flash-prompt non bloquant : bannière tappable, sans assombrir l'écran
  const prompt = el('button', 'floor-prompt hidden') as HTMLButtonElement;
  const promptIcon = el('span', 'floor-prompt-icon', '');
  const promptLabel = el('span', 'floor-prompt-label', '');
  const promptTimer = el('div', 'floor-prompt-timer');
  const promptTimerFill = el('div', 'floor-prompt-timer-fill');
  promptTimer.append(promptTimerFill);
  prompt.append(promptIcon, promptLabel, promptTimer);
  prompt.addEventListener('click', () => live.onPrompt());
  sceneWrap.append(prompt);
  let promptId = '';

  // bandeau descente : non bloquant — la teuf continue derrière
  const raidBanner = el('div', 'raid-banner hidden');
  const raidTitle = el('div', 'raid-title', '');
  const raidBtns = el('div', 'raid-btns');
  const mkRaidBtn = (label: string, hint: string, choice: 'evacuer' | 'negocier' | 'tenir') => {
    const b = el('button', 'btn raid-btn', label) as HTMLButtonElement;
    b.title = hint;
    b.addEventListener('click', () => live.onRaid(choice));
    raidBtns.append(b);
    return b;
  };
  const evacBtn = mkRaidBtn(STR.raidEvacuer, STR.raidEvacuerHint, 'evacuer');
  const negoBtn = mkRaidBtn(STR.raidNegocier(0), STR.raidNegocierHint, 'negocier');
  const tenirBtn = mkRaidBtn(STR.raidTenir, STR.raidTenirHint, 'tenir');
  raidBanner.append(raidTitle, raidBtns);
  sceneWrap.append(raidBanner);

  // vignette de siège : la vibe contre le seuil
  const siegeBox = el('div', 'siege-box hidden');
  const siegeTitle = el('div', 'siege-title', '');
  const siegeBar = el('div', 'siege-bar');
  const siegeFill = el('div', 'siege-fill');
  const siegeThreshold = el('div', 'siege-threshold');
  siegeThreshold.style.left = `${SIEGE_VIBE_MIN * 100}%`;
  siegeBar.append(siegeFill, siegeThreshold);
  const siegeMarge = el('div', 'siege-marge', '');
  siegeBox.append(siegeTitle, siegeBar, siegeMarge);
  sceneWrap.append(siegeBox);

  const modal = el('div', 'night-modal hidden');
  sceneWrap.append(modal);
  root.append(sceneWrap);

  let lastToast = '';
  let lastToastAt = 0;

  return {
    canvas,
    update(state, night) {
      // badges des modifs : peuplés une seule fois (night.modifiers est fixé au lancement)
      if (!badgesDone) {
        badgesDone = true;
        for (const m of night.modifiers) {
          const badge = el('div', 'night-modifier-badge');
          badge.title = m.desc;
          badge.append(el('span', 'night-modifier-icon', m.icon), el('span', 'night-modifier-nom', m.nom));
          modifierBadges.append(badge);
        }
        // badge du contrat de nuit spéciale (story D)
        if (night.special) {
          const badge = el('div', 'night-modifier-badge special-badge');
          badge.textContent = STR.specialBadge(night.special.icon, night.special.nom);
          modifierBadges.append(badge);
        }
      }
      setValue.textContent = `${Math.min(night.setIndex + 1, night.setCount)}/${night.setCount}`;
      clockValue.textContent = fmtTime(night.duration - night.t);
      crowdValue.textContent = String(Math.round(night.crowd));
      bankValue.textContent = fmtCash(night.bank);
      heatFill.style.width = `${(night.heat * 100).toFixed(1)}%`;
      heatFill.classList.toggle('hot', night.heat > 0.7);
      vibeFill.style.width = `${(night.vibe * 100).toFixed(1)}%`;
      if (night.currentDj && night.phase === 'playing') {
        nowPlaying.textContent = `🎧 ${STR.nowPlaying(getDj(night.currentDj).nom)} · ${STR.intensites[night.intensity]}`;
      } else {
        nowPlaying.textContent = '';
      }
      const playing = night.phase === 'playing';
      const nightFrac = night.duration > 0 ? Math.min(1, night.t / night.duration) : 0;
      timelineCursor.style.left = `${(nightFrac * 100).toFixed(1)}%`;
      timelineIcon.style.left = `${(nightFrac * 100).toFixed(1)}%`;
      timelineIcon.textContent = getPhase(night.nightPhase).icon;
      for (const [id, seg] of timelineSegs) seg.classList.toggle('current', id === night.nightPhase);
      const wave = currentWave(state, night);
      waveBand.style.left = `${Math.max(0, (wave.attente - wave.tol) * 100).toFixed(1)}%`;
      waveBand.style.width = `${(wave.tol * 2 * 100).toFixed(1)}%`;
      waveCursor.style.left = `${(wave.level * 100).toFixed(1)}%`;
      waveBar.classList.toggle('in-wave', playing && wave.inWave);
      // le burnout envahit la jauge par la droite (liseré rouge)
      waveBurnout.style.width = `${(night.burnout * 100).toFixed(1)}%`;
      for (const [cran, btn] of cranBtns) {
        btn.classList.toggle('selected', night.intensity === cran);
        btn.disabled = !playing || night.intensity === cran;
      }
      cranHint.textContent = playing ? STR.intensiteHints[night.intensity] : '';
      monteeFill.style.width = `${(night.montee * 100).toFixed(1)}%`;
      monteeFill.classList.toggle('full', night.montee >= 0.85);
      dropBtn.disabled = !playing || night.montee < MONTEE_MIN_DROP;

      // chip d'objectif : libellé + état (en cours / atteint)
      const goal = playing ? night.setGoal : null;
      if (goal) {
        goalChipLabel.textContent = goal.label;
        // progression live : on évalue la condition sur l'état courant du set
        const onTrack = goal.met({
          avgVibe: night.setVibeSamples > 0 ? night.setVibeSum / night.setVibeSamples : 0,
          crowdGained: night.crowd - night.setCrowdStart,
          crowdEnd: night.crowd,
          cap: night.cap,
          brownouts: night.setBrownouts,
          bestDrop: night.bestDropThisSet,
          heat: night.heat,
          avgWave: night.setWaveSamples > 0 ? night.setWaveSum / night.setWaveSamples : 0,
        });
        // ✓ « verrouillé » seulement passé la moitié du set — sinon un objectif
        // trivialement vrai à t=0 (zéro coupure, heat basse) afficherait un faux ✓
        const locked = onTrack && night.setElapsed > night.setLen * 0.5;
        goalChipTag.textContent = locked ? '✓' : STR.setGoalLabel;
        goalChip.classList.toggle('met', locked);
        goalChip.classList.toggle('on-track', onTrack && !locked);
        goalChip.classList.remove('hidden');
      } else {
        goalChip.classList.add('hidden');
      }

      // flash-prompt : on lit night.floorPrompt, aucune pause de la sim
      const fp = playing ? night.floorPrompt : null;
      if (fp) {
        const def = fp.def;
        if (def.id !== promptId) {
          promptId = def.id;
          promptIcon.textContent = def.icon;
          promptLabel.textContent = def.label;
        }
        const remain = Math.min(1, Math.max(0, (fp.expiresAt - night.t) / def.window));
        promptTimerFill.style.width = `${(remain * 100).toFixed(1)}%`;
        prompt.classList.remove('hidden');
      } else if (promptId) {
        promptId = '';
        prompt.classList.add('hidden');
      }

      const raid = night.raid;
      if (raid?.status === 'countdown' && playing) {
        raidTitle.textContent = STR.raidBanner(Math.max(0, Math.ceil(raid.deadline - night.t)));
        const cost = negoCost(night);
        negoBtn.textContent = STR.raidNegocier(cost);
        negoBtn.disabled = night.bank < cost;
        evacBtn.disabled = false;
        tenirBtn.disabled = false;
        raidBanner.classList.remove('hidden');
      } else {
        raidBanner.classList.add('hidden');
      }
      if (raid?.status === 'siege' && playing) {
        siegeTitle.textContent = STR.siegeVignette(Math.max(0, Math.ceil(raid.siegeEndAt - night.t)));
        siegeFill.style.width = `${(night.vibe * 100).toFixed(1)}%`;
        siegeFill.classList.toggle('low', night.vibe < SIEGE_VIBE_MIN);
        siegeMarge.textContent = STR.siegeMarge(Math.max(0, SIEGE_MAX_LOW - raid.siegeLowT));
        siegeBox.classList.remove('hidden');
      } else {
        siegeBox.classList.add('hidden');
      }
      // gyrophares sur les bords pendant toute la séquence
      root.classList.toggle('raid-active', (raid?.status === 'countdown' || raid?.status === 'siege') && playing);
    },
    toast(msg) {
      const now = performance.now();
      if (msg === lastToast && now - lastToastAt < 4000) return;
      lastToast = msg;
      lastToastAt = now;
      const t = el('div', 'toast', msg);
      toasts.append(t);
      setTimeout(() => t.classList.add('show'), 10);
      setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 400);
      }, 3500);
    },
    showModifiers(modifiers) {
      if (modifiers.length === 0) return;
      modifierBanner.innerHTML = '';
      modifierBanner.append(el('div', 'night-modifiers-banner-tag', STR.modifiersBanner));
      for (const m of modifiers) {
        const row = el('div', 'night-modifiers-banner-row');
        row.append(el('span', 'night-modifiers-banner-icon', m.icon));
        const txt = el('div', 'night-modifiers-banner-txt');
        txt.append(el('div', 'night-modifiers-banner-nom', m.nom), el('div', 'night-modifiers-banner-desc', m.desc));
        row.append(txt);
        modifierBanner.append(row);
      }
      modifierBanner.classList.remove('hidden');
      setTimeout(() => modifierBanner.classList.add('show'), 10);
      setTimeout(() => {
        modifierBanner.classList.remove('show');
        setTimeout(() => modifierBanner.classList.add('hidden'), 500);
      }, 4200);
    },
    showTransition(state, night, onStart) {
      modal.innerHTML = '';
      modal.className = 'night-modal';
      const panel = el('div', 'modal-panel');
      panel.append(el('h2', '', `${STR.setLabel(night.setIndex + 1, night.setCount)} — ${STR.whoPlays}`));

      let chosenDj = night.presentDjs[0];
      const djList = el('div', 'pick-dj-list');
      const go = el('button', 'btn launch', STR.startSet);

      const refresh = () => {
        for (const child of Array.from(djList.children) as HTMLElement[]) {
          child.classList.toggle('selected', child.dataset.dj === chosenDj);
        }
      };

      for (const djId of night.presentDjs) {
        const def = getDj(djId);
        const member = state.crew.find((d) => d.id === djId)!;
        const card = el('button', 'card dj-pick');
        card.dataset.dj = djId;
        const row = el('div', 'dj-row');
        row.append(portrait(djId, 'dj-portrait small'));
        const info = el('div', 'dj-info');
        info.append(el('div', 'card-title', def.nom));
        const djGenre = getGenre(def.genre);
        info.append(el('div', 'dj-genre-badge pick', `🎵 ${djGenre.nom} · ${djGenre.bpm} BPM`));
        const q = computeSetQuality(state, night, djId);
        const stars = '♪'.repeat(Math.max(1, Math.round(q * 5)));
        info.append(el('div', 'card-desc', `${stars} · ${STR.risk[def.risk]} · ${STR.cut(effectiveCut(def, member))}`));
        const fat = el('div', 'dj-fatigue');
        fat.append(fatigueBar(member.fatigue));
        const malus = fatigueMalusLabel(member.fatigue);
        if (malus) fat.append(malus);
        info.append(fat);
        row.append(info);
        card.append(row);
        card.addEventListener('click', () => {
          chosenDj = djId;
          refresh();
        });
        djList.append(card);
      }
      panel.append(djList);

      go.addEventListener('click', () => {
        modal.className = 'night-modal hidden';
        onStart(chosenDj);
      });
      panel.append(go);
      modal.append(panel);
      refresh();
    },
    showEvent(night, pending, onChoose) {
      modal.innerHTML = '';
      modal.className = 'night-modal';
      const panel = el('div', 'modal-panel event-panel');
      if (pending.arc) panel.append(el('div', 'arc-suite-tag', STR.arcSuiteTag));
      panel.append(el('h2', '', `⚠️ ${pending.def.titre}`));
      panel.append(el('p', 'event-text', pending.def.texte));
      pending.def.options.forEach((option, i) => {
        const btn = el('button', 'card event-option') as HTMLButtonElement;
        btn.append(el('div', 'card-title', option.label));
        const cost = option.effects.cash && option.effects.cash < 0 ? -option.effects.cash : 0;
        if (cost > night.bank) {
          btn.disabled = true;
          btn.append(el('div', 'card-desc', STR.cantAfford));
        }
        btn.addEventListener('click', () => {
          const outcome = onChoose(i);
          panel.innerHTML = '';
          panel.append(el('p', 'event-outcome', outcome));
          setTimeout(() => {
            modal.className = 'night-modal hidden';
          }, 1800);
        });
        panel.append(btn);
      });
      modal.append(panel);
    },
  };
}

// --- recap screen -------------------------------------------------------------

export interface RecapCallbacks {
  onContinue(): void;
  onShare(): void;
  onSubmitScore(pseudo: string): Promise<boolean>;
}

export function renderRecap(
  root: HTMLElement,
  result: NightResult,
  state: GameState,
  cb: RecapCallbacks,
): void {
  root.innerHTML = '';
  root.className = `screen screen-recap${result.busted ? ' busted' : ''}${result.won ? ' won' : ''}`;

  const panel = el('div', 'recap-panel');
  if (result.won) {
    panel.append(el('h1', 'recap-title won-title', `🏆 ${STR.wonTitle}`));
    panel.append(el('p', 'won-text', STR.wonText));
  } else {
    panel.append(el('h1', 'recap-title', result.busted ? `🚨 ${STR.busted}` : `🌅 ${STR.sunrise}`));
  }
  if (result.raidOutcome === 'mur-tenu') panel.append(el('div', 'recap-sub recap-legende', STR.recapMurTenu));
  if (result.evacuated) panel.append(el('div', 'recap-sub', STR.recapEvacue));
  const genresPlayed = [...new Set(result.lineup.map((s) => getDj(s.djId).genre))]
    .map((g) => getGenre(g).nom)
    .join(' · ');
  const recapSub = genresPlayed
    ? `${getSpot(result.spotId).nom} · ${genresPlayed}`
    : getSpot(result.spotId).nom;
  panel.append(el('div', 'recap-sub', recapSub));

  // le contrat de la nuit raconté (story D) : clash, teuf privée, rupture
  if (result.clashPhasesWon !== null) {
    panel.append(el('div', `recap-sub ${result.clashWon ? 'recap-legende' : ''}`,
      result.clashWon ? STR.recapClashWon(result.clashPhasesWon) : STR.recapClashLost));
  }
  if (result.specialId === 'teuf-privee' && !result.busted) panel.append(el('div', 'recap-sub', STR.recapZeroRep));
  if (result.contractRefund > 0) panel.append(el('div', 'recap-sub', STR.recapContractRefund(result.contractRefund)));

  // the night's lineup
  const lineup = el('div', 'recap-lineup');
  const seen = new Set<string>();
  for (const set of result.lineup) {
    if (seen.has(set.djId)) continue;
    seen.add(set.djId);
    lineup.append(portrait(set.djId, 'dj-portrait small'));
  }
  if (seen.size > 0) {
    panel.append(el('div', 'recap-label', STR.lineupLabel));
    panel.append(lineup);
  }

  const lines = el('div', 'recap-lines');
  lines.append(recapLine(STR.peakCrowd, `${result.peakCrowd} ${STR.crowdLabel}`));
  if (result.bestWaveScore > 0) {
    lines.append(recapLine(`🌊 ${STR.waveBest}`, `${Math.round(result.bestWaveScore * 100)} %`));
  }
  lines.append(recapLine(STR.barTotal, fmtCash(result.bank)));
  if (result.essence > 0) lines.append(recapLine(`⛽ ${STR.essenceLine}`, `−${fmtCash(result.essence)}`));
  if (result.restock > 0) lines.append(recapLine(`🍺 ${STR.restockLine}`, `−${fmtCash(result.restock)}`));
  if (result.cautionReturned > 0) {
    lines.append(recapLine(`🤝 ${STR.cautionReturnedLine}`, `+${fmtCash(result.cautionReturned)}`));
  } else if (result.busted && result.cautionPaid > 0) {
    lines.append(recapLine(`🤝 ${STR.cautionLostLine}`, `−${fmtCash(result.cautionPaid)}`));
  }
  if (!result.busted) {
    lines.append(recapLine(STR.donations, STR.donationsMult(result.donationMult.toFixed(2))));
  } else {
    if (result.bank > result.gross) lines.append(recapLine(STR.bustCut, `−${fmtCash(result.bank - result.gross)}`));
    if (result.fine > 0) lines.append(recapLine(STR.fine, `−${fmtCash(result.fine)}`));
    if (result.seized) lines.append(recapLine('👮', STR.seized(STR.gearCats[result.seized])));
  }
  if (result.cutsTotal > 0 && result.gross > 0) {
    lines.append(recapLine(STR.djCuts(result.cutsTotal), `−${fmtCash(result.gross - result.payout)}`));
  }
  lines.append(recapLine(STR.rep, STR.repGained(result.repGained)));
  const totalLine = recapLine(STR.total, fmtCash(result.payout));
  totalLine.classList.add('recap-total');
  lines.append(totalLine);
  panel.append(lines);

  if (result.journal.length > 0) {
    panel.append(el('h3', 'recap-sub', STR.nightJournal));
    const list = el('div', 'journal-list');
    for (const entry of result.journal) {
      const row = el('div', 'journal-row');
      row.append(el('span', 'journal-title', entry.titre));
      row.append(el('span', 'journal-outcome', entry.outcome));
      list.append(row);
    }
    panel.append(list);
  }

  if (result.goalsMet.length > 0) {
    panel.append(el('h3', 'recap-sub', STR.goalsRecapTitle));
    const goals = el('div', 'recap-goals');
    for (const label of result.goalsMet) {
      goals.append(el('div', 'recap-goal', `✓ ${label}`));
    }
    panel.append(goals);
  }

  // rappel des modifs du soir (météo/foule)
  if (result.modifiers.length > 0) {
    panel.append(el('h3', 'recap-sub', STR.modifiersRecapTitle));
    const mods = el('div', 'recap-modifiers');
    for (const m of result.modifiers) {
      const badge = el('div', 'night-modifier-badge');
      badge.title = m.desc;
      badge.append(el('span', 'night-modifier-icon', m.icon), el('span', 'night-modifier-nom', m.nom));
      mods.append(badge);
    }
    panel.append(mods);
  }

  const scoreRow = el('div', 'score-row');
  const pseudoInput = el('input', 'pseudo-input') as HTMLInputElement;
  pseudoInput.placeholder = STR.pseudoPlaceholder;
  pseudoInput.maxLength = 24;
  pseudoInput.value = state.pseudo;
  const submitBtn = el('button', 'btn', STR.submitScore);
  submitBtn.addEventListener('click', async () => {
    const pseudo = pseudoInput.value.trim();
    if (!pseudo) {
      pseudoInput.focus();
      return;
    }
    submitBtn.disabled = true;
    const ok = await cb.onSubmitScore(pseudo);
    submitBtn.textContent = ok ? `✓ ${STR.scoreSent}` : STR.offline;
  });
  scoreRow.append(pseudoInput, submitBtn);
  panel.append(scoreRow);

  const actions = el('div', 'recap-actions');
  const shareBtn = el('button', 'btn ghost', `📸 ${STR.share}`);
  shareBtn.addEventListener('click', () => cb.onShare());
  const contBtn = el('button', 'btn launch', STR.continue);
  contBtn.addEventListener('click', () => cb.onContinue());
  actions.append(shareBtn, contBtn);
  panel.append(actions);

  root.append(panel);
}

function recapLine(label: string, value: string): HTMLElement {
  const line = el('div', 'recap-line');
  line.append(el('span', 'recap-label', label), el('span', 'recap-value', value));
  return line;
}

// --- leaderboard ----------------------------------------------------------------

export function renderLeaderboard(
  root: HTMLElement,
  fetchBoard: (board: BoardKind) => Promise<ScoreRow[] | null>,
  onBack: () => void,
): void {
  root.innerHTML = '';
  root.className = 'screen screen-leaderboard';
  const panel = el('div', 'lb-panel');
  panel.append(el('h1', '', `🏅 ${STR.leaderboard}`));

  const tabs = el('div', 'lb-tabs');
  const list = el('div', 'lb-list');
  const kinds: BoardKind[] = ['crowd', 'payout', 'bust'];
  let active: BoardKind = 'crowd';

  async function show(kind: BoardKind): Promise<void> {
    active = kind;
    for (const btn of Array.from(tabs.children) as HTMLElement[]) {
      btn.classList.toggle('selected', btn.dataset.kind === kind);
    }
    list.innerHTML = '';
    list.append(el('div', 'lb-loading', '…'));
    const rows = await fetchBoard(kind);
    if (active !== kind) return;
    list.innerHTML = '';
    if (rows === null) {
      list.append(el('div', 'lb-empty', STR.offline));
      return;
    }
    if (rows.length === 0) {
      list.append(el('div', 'lb-empty', STR.emptyBoard));
      return;
    }
    rows.forEach((row, i) => {
      const line = el('div', 'lb-row');
      const value = kind === 'payout' ? fmtCash(row.payout) : `${row.crowd} ${STR.crowdLabel}`;
      line.append(
        el('span', 'lb-rank', `${i + 1}.`),
        el('span', 'lb-pseudo', row.pseudo + (row.busted ? ' 🚨' : '')),
        el('span', 'lb-detail', `${getSpot(row.spot as SpotId)?.nom ?? row.spot}`),
        el('span', 'lb-value', value),
      );
      list.append(line);
    });
  }

  for (const kind of kinds) {
    const btn = el('button', 'btn tab', STR.boards[kind]);
    btn.dataset.kind = kind;
    btn.addEventListener('click', () => void show(kind));
    tabs.append(btn);
  }
  panel.append(tabs, list);

  const back = el('button', 'btn launch', STR.back);
  back.addEventListener('click', onBack);
  panel.append(back);
  root.append(panel);
  void show('crowd');
}

// --- héritage (boutique permanente) -------------------------------------------

export interface HeritageCallbacks {
  onBuyPerk(perkId: string): void;
  onBack(): void;
}

export function renderHeritage(root: HTMLElement, state: GameState, cb: HeritageCallbacks): void {
  root.innerHTML = '';
  root.className = 'screen screen-heritage';
  const panel = el('div', 'lb-panel heritage-panel');
  panel.append(el('h1', '', STR.heritageTitle));
  panel.append(
    el('div', 'heritage-balance', `${STR.heritageBalance(state.tour.legende)} · ${STR.tourLabel(state.tour.number)}`),
  );

  const list = el('div', 'heritage-list');
  for (const perk of PERKS) {
    const owned = perkCount(state, perk.id);
    const maxed = owned >= perk.max;
    const row = el('div', `card perk-card${maxed ? ' owned' : ''}`);
    const title = perk.max > 1 ? `${perk.nom} · ${STR.perkStack(owned, perk.max)}` : perk.nom;
    row.append(el('div', 'card-title', owned > 0 ? `✓ ${title}` : title));
    row.append(el('div', 'card-desc', perk.description));
    if (maxed) {
      row.append(el('div', 'perk-owned', STR.perkOwned));
    } else {
      const btn = el('button', 'btn small accent', STR.perkBuy(perk.cost));
      btn.disabled = !canBuyPerk(state, perk.id);
      btn.addEventListener('click', () => cb.onBuyPerk(perk.id));
      row.append(btn);
    }
    list.append(row);
  }
  panel.append(list);

  const back = el('button', 'btn launch', STR.back);
  back.addEventListener('click', () => cb.onBack());
  panel.append(back);
  root.append(panel);
}

// --- region draw (départ en tournée, chantier 4) -------------------------------

export function renderRegionDraw(
  root: HTMLElement,
  choices: RegionChoice[],
  onPick: (choice: RegionChoice) => void,
): void {
  root.innerHTML = '';
  root.className = 'screen screen-region-draw';
  const panel = el('div', 'region-draw-panel');
  panel.append(el('h1', '', `🗺 ${STR.regionDrawTitle}`));
  panel.append(el('p', 'hint', STR.regionDrawHint));
  const cards = el('div', 'region-cards');
  for (const choice of choices) {
    const card = el('button', 'card region-card');
    card.append(el('div', 'card-title', choice.nom));
    for (const t of choice.traits) {
      const row = el('div', 'region-trait-row');
      row.append(el('span', 'region-trait-icon', t.icon));
      const txt = el('div', 'region-trait-txt');
      txt.append(el('div', 'region-trait-nom', t.nom), el('div', 'card-desc', t.desc));
      row.append(txt);
      card.append(row);
    }
    card.append(el('div', 'region-mult', STR.regionMult(choice.mult.toFixed(2))));
    card.append(el('div', 'btn small accent region-go', STR.regionPick));
    card.addEventListener('click', () => onPick(choice));
    cards.append(card);
  }
  panel.append(cards);
  root.append(panel);
}

/** Used by main.ts to celebrate fresh recruits on the prepare screen. */
export function newlyRecruitable(state: GameState, prevRep: number): DjDef[] {
  return DJS.filter((d) => {
    if (d.perk !== undefined && !state.tour.perks.includes(d.perk)) return false;
    const req = djRepThreshold(state, d);
    return req > prevRep && req <= state.rep;
  });
}
