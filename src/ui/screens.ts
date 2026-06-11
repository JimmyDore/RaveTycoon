import { DJS, GEAR, GEAR_CATEGORIES, GENRES, SPOTS, getDj, getGenre, getSpot } from '../core/data';
import { djLevel, fatigueMalus, lockedDjs, recruitableDjs } from '../core/crew';
import { rushCost } from '../core/idle';
import { isSpotUnlocked } from '../core/payout';
import { MONTEE_MIN_DROP, computeSetQuality } from '../core/night';
import type { NightModifierDef } from '../core/modifiers';
import type {
  Brief,
  DjDef,
  GameState,
  GearCategory,
  GenreId,
  NightResult,
  NightState,
  PendingEvent,
  SpotId,
} from '../core/types';
import { STR, fmtCash, fmtCountdown, fmtTime } from './strings';
import type { BoardKind, ScoreRow } from './api';

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

export interface PrepareSelection {
  spot: SpotId;
  genre: GenreId;
  present: Set<string>;
}

export interface PrepareCallbacks {
  onLaunch(): void;
  onRecruit(djId: string): void;
  onBuy(cat: GearCategory): void;
  onRepairStart(cat: GearCategory): void;
  onRepairRush(cat: GearCategory): void;
  onExport(): void;
  onImport(): void;
  onNewGame(): void;
  onLeaderboard(): void;
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
  header.append(stats);
  root.append(header);

  if (state.wonTeknival) {
    root.append(el('div', 'won-banner', `🏆 ${STR.wonTitle}`));
  }

  const main = el('div', 'prepare-grid');

  // --- spots & genres column
  const where = el('section', 'panel');
  where.append(el('h2', '', STR.chooseSpot));
  for (const spot of SPOTS) {
    const unlocked = isSpotUnlocked(state, spot.id);
    const card = el('button', `card spot-card${selection.spot === spot.id ? ' selected' : ''}${unlocked ? '' : ' locked'}`);
    card.disabled = !unlocked;
    card.append(el('div', 'card-title', spot.id === 'teknival' ? `🏆 ${spot.nom}` : spot.nom));
    card.append(
      el('div', 'card-meta', `${STR.capacity(spot.cap)} · ${STR.duration(Math.round(spot.duration / 60))} · ${STR.setsCount(spot.setCount)}`),
    );
    card.append(el('div', 'card-desc', unlocked ? spot.description : `🔒 ${STR.repNeeded(spot.repReq)}`));
    if (unlocked) {
      card.addEventListener('click', () => {
        selection.spot = spot.id;
        renderPrepare(root, state, selection, now, cb);
      });
    }
    where.append(card);
  }
  where.append(el('h2', 'mt', STR.chooseGenre));
  for (const genre of GENRES) {
    const card = el('button', `card genre-card${selection.genre === genre.id ? ' selected' : ''}`);
    card.append(el('div', 'card-title', `${genre.nom} · ${genre.bpm} BPM`));
    card.append(el('div', 'card-desc', genre.description));
    card.addEventListener('click', () => {
      selection.genre = genre.id;
      renderPrepare(root, state, selection, now, cb);
    });
    where.append(card);
  }
  main.append(where);

  // --- crew column
  const crewSec = el('section', 'panel');
  crewSec.append(el('h2', '', STR.chooseCrew));
  for (const member of state.crew) {
    const def = getDj(member.id);
    const aboard = selection.present.has(member.id);
    const card = el('button', `card dj-card${aboard ? ' selected' : ''}`);
    const row = el('div', 'dj-row');
    row.append(portrait(member.id));
    const info = el('div', 'dj-info');
    const lvl = djLevel(member);
    info.append(el('div', 'card-title', `${def.nom}${lvl > 0 ? ` · ${STR.level(lvl)}` : ''}`));
    const statsLine = el('div', 'dj-stats');
    statsLine.append(el('span', 'dj-stat-label', STR.technique), statDots(def.technique + Math.floor(lvl * 0.5)));
    statsLine.append(el('span', 'dj-stat-label', STR.charisme), statDots(def.charisme));
    info.append(statsLine);
    const aff = GENRES.map((g) => `${g.nom} ${'★'.repeat(Math.round(def.affinities[g.id] * 2.5))}`).join(' · ');
    info.append(el('div', 'card-desc', `${aff}`));
    const riskLine = el('div', 'dj-risk', `${STR.risk[def.risk]}${STR.riskHint[def.risk] ? ' — ' + STR.riskHint[def.risk] : ''} · ${STR.cut(def.cut)}`);
    info.append(riskLine);
    const fat = el('div', 'dj-fatigue');
    fat.append(el('span', 'dj-stat-label', STR.fatigue), fatigueBar(member.fatigue));
    const malus = fatigueMalusLabel(member.fatigue);
    if (malus) fat.append(malus);
    info.append(fat);
    row.append(info);
    card.append(row);
    card.addEventListener('click', () => {
      if (aboard) selection.present.delete(member.id);
      else selection.present.add(member.id);
      renderPrepare(root, state, selection, now, cb);
    });
    crewSec.append(card);
  }
  for (const def of recruitableDjs(state)) {
    const card = el('div', 'card dj-card recruitable');
    const row = el('div', 'dj-row');
    row.append(portrait(def.id));
    const info = el('div', 'dj-info');
    info.append(el('div', 'card-title', `✨ ${def.nom}`));
    info.append(el('div', 'card-desc', def.description));
    info.append(el('div', 'dj-risk', `${STR.risk[def.risk]} · ${STR.cut(def.cut)}`));
    const btn = el('button', 'btn small accent', STR.recruit);
    btn.addEventListener('click', () => cb.onRecruit(def.id));
    info.append(btn);
    row.append(info);
    card.append(row);
    crewSec.append(card);
  }
  for (const def of lockedDjs(state)) {
    const card = el('div', 'card dj-card locked');
    card.append(el('div', 'card-title', `🔒 ${def.nom}`));
    card.append(el('div', 'card-desc', `${STR.repNeeded(def.repReq)}`));
    crewSec.append(card);
  }
  main.append(crewSec);

  // --- gear column
  const shopSec = el('section', 'panel');
  shopSec.append(el('h2', '', STR.shop));
  for (const cat of GEAR_CATEGORIES) {
    const tier = state.gear[cat];
    const current = GEAR[cat][tier];
    const next = GEAR[cat][tier + 1];
    const row = el('div', 'gear-row');
    const info = el('div', 'gear-info');
    info.append(el('div', 'gear-cat', STR.gearCats[cat]));
    const nameLine = el('div', 'gear-name', current.nom);
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
    } else if (next) {
      const buyBtn = el('button', 'btn small', `${STR.buy} ${next.nom} — ${fmtCash(next.price)}`);
      buyBtn.disabled = state.cash < next.price;
      buyBtn.addEventListener('click', () => cb.onBuy(cat));
      actions.append(buyBtn);
    } else {
      actions.append(el('div', 'gear-maxed', STR.maxed));
    }
    row.append(actions);
    shopSec.append(row);
  }
  shopSec.append(el('p', 'hint', STR.buzzHint));
  main.append(shopSec);
  root.append(main);

  // --- footer
  const footer = el('footer', 'prepare-footer');
  const canLaunch = selection.present.size > 0;
  const launch = el(
    'button',
    'btn launch',
    canLaunch
      ? `▶ ${STR.launch} — ${getSpot(selection.spot).nom} / ${getGenre(selection.genre).nom}`
      : STR.needOneDj,
  );
  launch.disabled = !canLaunch;
  launch.addEventListener('click', () => cb.onLaunch());
  footer.append(launch);

  const meta = el('div', 'meta-actions');
  const lbBtn = el('button', 'btn ghost', `🏅 ${STR.leaderboard}`);
  lbBtn.addEventListener('click', () => cb.onLeaderboard());
  const expBtn = el('button', 'btn ghost', STR.exportSave);
  expBtn.addEventListener('click', () => cb.onExport());
  const impBtn = el('button', 'btn ghost', STR.importSave);
  impBtn.addEventListener('click', () => cb.onImport());
  const resetBtn = el('button', 'btn ghost danger', STR.newGameBtn);
  resetBtn.addEventListener('click', () => cb.onNewGame());
  meta.append(lbBtn, expBtn, impBtn, resetBtn);
  footer.append(meta);
  root.append(footer);

  if (state.nights === 0) {
    root.append(el('div', 'first-hint', STR.firstTimeHint));
  }
}

function stat(icon: string, value: string, label: string): HTMLElement {
  const box = el('div', 'stat');
  box.append(el('span', 'stat-icon', icon), el('span', 'stat-value', value), el('span', 'stat-label', label));
  return box;
}

// --- night screen ------------------------------------------------------------

export interface NightScreen {
  canvas: HTMLCanvasElement;
  update(night: NightState): void;
  toast(msg: string): void;
  /** bannière one-shot des modifs du soir, au lancement de la nuit */
  showModifiers(modifiers: NightModifierDef[]): void;
  showTransition(state: GameState, night: NightState, onStart: (djId: string, brief: Brief) => void): void;
  showEvent(night: NightState, pending: PendingEvent, onChoose: (index: number) => string): void;
}

export interface NightLiveCallbacks {
  onBrief(brief: Brief): void;
  onDrop(): void;
  onPrompt(): void;
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
  const briefBtns = new Map<Brief, HTMLButtonElement>();
  for (const brief of ['safe', 'normal', 'pousser'] as Brief[]) {
    const b = el('button', 'live-brief', STR.briefShort[brief]) as HTMLButtonElement;
    b.addEventListener('click', () => live.onBrief(brief));
    briefBtns.set(brief, b);
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

  const modal = el('div', 'night-modal hidden');
  sceneWrap.append(modal);
  root.append(sceneWrap);

  let lastToast = '';
  let lastToastAt = 0;

  return {
    canvas,
    update(night) {
      // badges des modifs : peuplés une seule fois (night.modifiers est fixé au lancement)
      if (!badgesDone) {
        badgesDone = true;
        for (const m of night.modifiers) {
          const badge = el('div', 'night-modifier-badge');
          badge.title = m.desc;
          badge.append(el('span', 'night-modifier-icon', m.icon), el('span', 'night-modifier-nom', m.nom));
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
        nowPlaying.textContent = `🎧 ${STR.nowPlaying(getDj(night.currentDj).nom)} · ${STR.briefs[night.brief]}`;
      } else {
        nowPlaying.textContent = '';
      }
      const playing = night.phase === 'playing';
      for (const [brief, btn] of briefBtns) {
        btn.classList.toggle('selected', night.brief === brief);
        btn.disabled = !playing || night.briefLockT > 0 || night.brief === brief;
      }
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
      let chosenBrief: Brief = 'normal';
      const djList = el('div', 'pick-dj-list');
      const briefRow = el('div', 'brief-row');
      const go = el('button', 'btn launch', STR.startSet);

      const refresh = () => {
        for (const child of Array.from(djList.children) as HTMLElement[]) {
          child.classList.toggle('selected', child.dataset.dj === chosenDj);
        }
        for (const child of Array.from(briefRow.children) as HTMLElement[]) {
          child.classList.toggle('selected', child.dataset.brief === chosenBrief);
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
        const q = computeSetQuality(state, night, djId, 'normal');
        const stars = '♪'.repeat(Math.max(1, Math.round(q * 5)));
        info.append(el('div', 'card-desc', `${stars} · ${STR.risk[def.risk]} · ${STR.cut(def.cut)}`));
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

      panel.append(el('h3', '', STR.briefLabel));
      for (const brief of ['safe', 'normal', 'pousser'] as Brief[]) {
        const b = el('button', 'card brief-pick');
        b.dataset.brief = brief;
        b.append(el('div', 'card-title', STR.briefs[brief]));
        b.append(el('div', 'card-desc', STR.briefHints[brief]));
        b.addEventListener('click', () => {
          chosenBrief = brief;
          refresh();
        });
        briefRow.append(b);
      }
      panel.append(briefRow);

      go.addEventListener('click', () => {
        modal.className = 'night-modal hidden';
        onStart(chosenDj, chosenBrief);
      });
      panel.append(go);
      modal.append(panel);
      refresh();
    },
    showEvent(night, pending, onChoose) {
      modal.innerHTML = '';
      modal.className = 'night-modal';
      const panel = el('div', 'modal-panel event-panel');
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
  panel.append(el('div', 'recap-sub', `${getSpot(result.spotId).nom} · ${getGenre(result.genreId).nom}`));

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
  lines.append(recapLine(STR.barTotal, fmtCash(result.bank)));
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

/** Used by main.ts to celebrate fresh recruits on the prepare screen. */
export function newlyRecruitable(state: GameState, prevRep: number): DjDef[] {
  return DJS.filter((d) => d.repReq > prevRep && d.repReq <= state.rep);
}
