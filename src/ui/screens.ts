import { GEAR, GEAR_CATEGORIES, GENRES, SPOTS, getGenre, getSpot } from '../core/data';
import { rushCost } from '../core/idle';
import { isSpotUnlocked } from '../core/payout';
import type {
  Controls,
  GameState,
  GearCategory,
  GenreId,
  NightResult,
  RaveState,
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

// --- touch fader -----------------------------------------------------------------

/** Big vertical fader, pointer-driven — no hover, no keyboard required. */
class Fader {
  readonly root: HTMLElement;
  private track: HTMLElement;
  private fill: HTMLElement;
  private thumb: HTMLElement;
  private dangerZone: HTMLElement;
  value: number;

  constructor(
    label: string,
    initial: number,
    private onInput: (v: number) => void,
    accent: string,
  ) {
    this.value = initial;
    this.root = el('div', 'fader');
    this.root.style.setProperty('--accent', accent);
    this.track = el('div', 'fader-track');
    this.dangerZone = el('div', 'fader-danger');
    this.fill = el('div', 'fader-fill');
    this.thumb = el('div', 'fader-thumb');
    this.track.append(this.dangerZone, this.fill, this.thumb);
    const labelEl = el('div', 'fader-label', label);
    this.root.append(this.track, labelEl);

    const move = (clientY: number) => {
      const rect = this.track.getBoundingClientRect();
      const v = 1 - (clientY - rect.top) / rect.height;
      this.set(Math.min(1, Math.max(0, v)));
      this.onInput(this.value);
    };
    this.track.addEventListener('pointerdown', (e) => {
      this.track.setPointerCapture(e.pointerId);
      move(e.clientY);
    });
    this.track.addEventListener('pointermove', (e) => {
      if (this.track.hasPointerCapture(e.pointerId)) move(e.clientY);
    });
    this.set(initial);
  }

  set(v: number): void {
    this.value = v;
    const pct = `${(v * 100).toFixed(1)}%`;
    this.fill.style.height = pct;
    this.thumb.style.bottom = pct;
  }

  /** Mark the zone above `threshold` as dangerous (clipping / overdraw). */
  setDanger(threshold: number): void {
    const t = Math.min(1, Math.max(0, threshold));
    this.dangerZone.style.height = `${((1 - t) * 100).toFixed(1)}%`;
    this.root.classList.toggle('in-danger', this.value > t);
  }
}

// --- prepare screen ----------------------------------------------------------------

export interface PrepareCallbacks {
  onLaunch(spot: SpotId, genre: GenreId): void;
  onBuy(cat: GearCategory): void;
  onRepairStart(cat: GearCategory): void;
  onRepairRush(cat: GearCategory): void;
  onExport(): void;
  onImport(): void;
  onNewGame(): void;
  onLeaderboard(): void;
}

export interface PrepareSelection {
  spot: SpotId;
  genre: GenreId;
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
  const brand = el('div', 'brand', STR.title);
  const stats = el('div', 'stats');
  stats.append(
    stat('💶', fmtCash(state.cash), STR.cash),
    stat('⭐', String(Math.floor(state.rep)), STR.rep),
    stat('📢', `${Math.round(state.buzz * 100)}%`, STR.buzz),
  );
  header.append(brand, stats);
  root.append(header);

  if (state.wonTeknival) {
    const won = el('div', 'won-banner', `🏆 ${STR.wonTitle}`);
    root.append(won);
  }

  const main = el('div', 'prepare-grid');

  // spots
  const spotsSec = el('section', 'panel');
  spotsSec.append(el('h2', '', STR.chooseSpot));
  for (const spot of SPOTS) {
    const unlocked = isSpotUnlocked(state, spot.id);
    const card = el('button', `card spot-card${selection.spot === spot.id ? ' selected' : ''}${unlocked ? '' : ' locked'}`);
    card.disabled = !unlocked;
    const title = el('div', 'card-title', spot.nom);
    if (spot.id === 'teknival') title.textContent = `🏆 ${spot.nom}`;
    card.append(title);
    card.append(
      el('div', 'card-meta', `${STR.capacity(spot.cap)} · ${STR.duration(Math.round(spot.duration / 60))}`),
    );
    card.append(el('div', 'card-desc', unlocked ? spot.description : `🔒 ${STR.repNeeded(spot.repReq)}`));
    if (unlocked) {
      card.addEventListener('click', () => {
        selection.spot = spot.id;
        renderPrepare(root, state, selection, now, cb);
      });
    }
    spotsSec.append(card);
  }
  main.append(spotsSec);

  // genres
  const genresSec = el('section', 'panel');
  genresSec.append(el('h2', '', STR.chooseGenre));
  for (const genre of GENRES) {
    const card = el('button', `card genre-card${selection.genre === genre.id ? ' selected' : ''}`);
    card.append(el('div', 'card-title', `${genre.nom} · ${genre.bpm} BPM`));
    card.append(el('div', 'card-desc', genre.description));
    card.addEventListener('click', () => {
      selection.genre = genre.id;
      renderPrepare(root, state, selection, now, cb);
    });
    genresSec.append(card);
  }
  main.append(genresSec);

  // gear shop + repairs
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
    if (state.damaged[cat]) {
      const dmg = el('span', 'gear-damaged', ` ${STR.damaged}`);
      nameLine.append(dmg);
    }
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
  const buzzHint = el('p', 'hint', STR.buzzHint);
  shopSec.append(buzzHint);
  main.append(shopSec);
  root.append(main);

  // footer: launch + meta actions
  const footer = el('footer', 'prepare-footer');
  const damagedAny = GEAR_CATEGORIES.some((c) => state.damaged[c]);
  const launch = el('button', 'btn launch', `▶ ${STR.launch} — ${getSpot(selection.spot).nom} / ${getGenre(selection.genre).nom}`);
  if (damagedAny) launch.append(el('span', 'launch-warning', ' (matos HS : son dégradé)'));
  launch.addEventListener('click', () => cb.onLaunch(selection.spot, selection.genre));
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

// --- rave screen -------------------------------------------------------------------

export interface RaveScreen {
  canvas: HTMLCanvasElement;
  controls: Controls;
  update(rave: RaveState, ampHeadroom: number, subHeadroom: number): void;
  toast(msg: string): void;
}

export function renderRave(root: HTMLElement): RaveScreen {
  root.innerHTML = '';
  root.className = 'screen screen-rave';

  const sceneWrap = el('div', 'scene-wrap');
  const canvas = el('canvas', 'scene-canvas');
  sceneWrap.append(canvas);

  // HUD overlays
  const hudTop = el('div', 'hud-top');
  const clock = el('div', 'hud-clock');
  const clockValue = el('div', 'hud-clock-value', '0:00');
  clock.append(clockValue, el('div', 'hud-clock-label', STR.sunriseIn));
  const crowdBox = el('div', 'hud-stat');
  const crowdValue = el('div', 'hud-stat-value', '0');
  crowdBox.append(crowdValue, el('div', 'hud-stat-label', STR.crowdLabel));
  const bankBox = el('div', 'hud-stat');
  const bankValue = el('div', 'hud-stat-value', '0 €');
  bankBox.append(bankValue, el('div', 'hud-stat-label', STR.bankLabel));
  hudTop.append(crowdBox, clock, bankBox);
  sceneWrap.append(hudTop);

  // heat meter
  const heatWrap = el('div', 'heat-wrap');
  const heatBar = el('div', 'heat-bar');
  const heatFill = el('div', 'heat-fill');
  heatBar.append(heatFill);
  heatWrap.append(el('div', 'heat-label', `👮 ${STR.heat}`), heatBar);
  sceneWrap.append(heatWrap);

  const toasts = el('div', 'toasts');
  sceneWrap.append(toasts);
  root.append(sceneWrap);

  // the desk
  const controls: Controls = { volume: 0.4, bass: 0.35, power: 0.6 };
  const desk = el('div', 'desk');
  const volFader = new Fader(STR.volume, controls.volume, (v) => (controls.volume = v), '#ff5d8f');
  const bassFader = new Fader(STR.bass, controls.bass, (v) => (controls.bass = v), '#7b5dff');
  const powerFader = new Fader(STR.power, controls.power, (v) => (controls.power = v), '#3ddc97');
  desk.append(volFader.root, bassFader.root, powerFader.root);
  root.append(desk);

  let lastToast = '';
  let lastToastAt = 0;

  return {
    canvas,
    controls,
    update(rave, ampHeadroom, subHeadroom) {
      clockValue.textContent = fmtTime(rave.duration - rave.t);
      crowdValue.textContent = String(Math.round(rave.crowd));
      bankValue.textContent = fmtCash(rave.bank);
      heatFill.style.width = `${(rave.heat * 100).toFixed(1)}%`;
      heatFill.classList.toggle('hot', rave.heat > 0.7);
      volFader.setDanger(ampHeadroom);
      bassFader.setDanger(subHeadroom);
      // generator danger: where current demand would outrun supply
      const demand = 0.6 * controls.volume + 0.8 * controls.bass;
      const needed = rave.genCapacity > 0 ? demand / rave.genCapacity : 1;
      powerFader.setDanger(1.01); // power itself is never "too high"
      powerFader.root.classList.toggle('in-danger', powerFader.value < Math.min(needed, 1));
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
  };
}

// --- recap screen -------------------------------------------------------------------

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
  panel.append(
    el('div', 'recap-sub', `${getSpot(result.spotId).nom} · ${getGenre(result.genreId).nom}`),
  );

  const lines = el('div', 'recap-lines');
  lines.append(recapLine(STR.peakCrowd, `${result.peakCrowd} ${STR.crowdLabel}`));
  lines.append(recapLine(STR.barTotal, fmtCash(result.bank)));
  if (!result.busted) {
    lines.append(recapLine(STR.donations, STR.donationsMult(result.donationMult.toFixed(2))));
  } else {
    if (result.bank > result.payout) lines.append(recapLine(STR.bustCut, `−${fmtCash(result.bank - result.payout)}`));
    if (result.fine > 0) lines.append(recapLine(STR.fine, `−${fmtCash(result.fine)}`));
    if (result.seized) {
      lines.append(recapLine('👮', STR.seized(STR.gearCats[result.seized])));
    }
  }
  lines.append(recapLine(STR.rep, STR.repGained(result.repGained)));
  const totalLine = recapLine(STR.total, fmtCash(result.payout));
  totalLine.classList.add('recap-total');
  lines.append(totalLine);
  panel.append(lines);

  // score submission
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

// --- leaderboard screen ---------------------------------------------------------------

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
      const value =
        kind === 'payout' ? fmtCash(row.payout) : `${row.crowd} ${STR.crowdLabel}`;
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
