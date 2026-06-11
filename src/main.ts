import './style.css';
import { AudioEngine } from './audio/engine';
import { applyIdleTime, rushRepair, startRepair } from './core/idle';
import { applyBust, buyGearUpgrade, settleNight } from './core/payout';
import { clippingAmount, createRave, tickRave } from './core/rave';
import {
  exportCode,
  importCode,
  loadGame,
  newGame,
  saveGame,
} from './core/save';
import type {
  GameState,
  GenreId,
  NightResult,
  RaveState,
  SpotId,
} from './core/types';
import { getSpot } from './core/data';
import { GROUND_Y, SCENE_H, SCENE_W, SceneRenderer } from './render/scene';
import { RaverSim } from './render/ravers';
import { fetchBoard, submitScore } from './ui/api';
import { shareRecapCard } from './ui/recap-card';
import {
  renderLeaderboard,
  renderPrepare,
  renderRave,
  renderRecap,
  type PrepareSelection,
  type RaveScreen,
} from './ui/screens';
import { STR } from './ui/strings';

const app = document.querySelector<HTMLDivElement>('#app')!;
const audio = new AudioEngine();

let state: GameState = loadGame(localStorage) ?? newGame(Date.now());
applyIdleTime(state, Date.now());
saveGame(localStorage, state);

const selection: PrepareSelection = { spot: 'champ', genre: 'hardtek' };

// --- active rave loop ---------------------------------------------------------

interface ActiveRave {
  rave: RaveState;
  screen: RaveScreen;
  scene: SceneRenderer;
  ravers: RaverSim;
  raf: number;
  simAccumulator: number;
  lastFrame: number;
  endAt: number | null;
  heatWarned: boolean;
}

let active: ActiveRave | null = null;

const SIM_DT = 0.1; // fixed 100ms sim steps

function startNight(spotId: SpotId, genreId: GenreId): void {
  applyIdleTime(state, Date.now());
  const rave = createRave(state, spotId, genreId, (Date.now() ^ 0x5eed) >>> 0);
  const screen = renderRave(app);
  const scene = new SceneRenderer(screen.canvas);
  const ravers = new RaverSim({ x: 40, y: GROUND_Y - 2, w: SCENE_W - 80, h: SCENE_H - GROUND_Y - 24 });
  void audio.start(genreId);
  screen.toast(STR.startHint);

  active = {
    rave,
    screen,
    scene,
    ravers,
    raf: 0,
    simAccumulator: 0,
    lastFrame: performance.now(),
    endAt: null,
    heatWarned: false,
  };
  active.raf = requestAnimationFrame(frame);
}

function frame(now: number): void {
  if (!active) return;
  const { rave, screen, scene, ravers } = active;
  const dtMs = Math.min(250, now - active.lastFrame);
  active.lastFrame = now;
  active.simAccumulator += dtMs / 1000;

  while (active.simAccumulator >= SIM_DT) {
    active.simAccumulator -= SIM_DT;
    if (!rave.ended) {
      const events = tickRave(rave, screen.controls, SIM_DT, state.buzz, state.rep);
      for (const ev of events) {
        screen.toast(STR.events[ev.type]);
        if (ev.type === 'bust') audio.playSiren();
      }
      if (!active.heatWarned && rave.heat > 0.75) {
        active.heatWarned = true;
        screen.toast(STR.events.heatWarning);
      } else if (rave.heat < 0.6) {
        active.heatWarned = false;
      }
      if (rave.ended) {
        // linger a few seconds on the sunrise / the gyrophares before the recap
        active.endAt = now + (rave.busted ? 3500 : 4000);
        if (!rave.busted) audio.stop();
      }
    }
  }

  const clip = rave.ended ? 0 : clippingAmount(rave, screen.controls);
  audio.update({
    volume: rave.ended ? 0 : screen.controls.volume,
    bass: screen.controls.bass,
    clipping: clip,
    brownout: rave.brownoutT > 0,
    crowd: rave.crowd / getSpot(rave.spotId).cap,
    blownAmp: rave.ampBlown,
    blownSub: rave.subBlown,
  });

  ravers.update(rave.crowd, dtMs / 1000, rave.busted);
  scene.render(
    {
      spotId: rave.spotId,
      progress: rave.t / rave.duration,
      gear: state.gear,
      heat: rave.heat,
      brownout: rave.brownoutT > 0,
      beatPhase: audio.beatPhase(),
      vibe: rave.vibe,
      busted: rave.busted,
      crowd: rave.crowd,
    },
    ravers,
    now,
  );
  screen.update(rave, rave.ampHeadroom, rave.subHeadroom);

  if (active.endAt !== null && now >= active.endAt) {
    endNight();
    return;
  }
  active.raf = requestAnimationFrame(frame);
}

function endNight(): void {
  if (!active) return;
  cancelAnimationFrame(active.raf);
  audio.stop();
  const rave = active.rave;
  active = null;
  const result = rave.busted ? applyBust(state, rave) : settleNight(state, rave);
  saveGame(localStorage, state);
  showRecap(result);
}

// --- screens ----------------------------------------------------------------------

function showRecap(result: NightResult): void {
  renderRecap(app, result, state, {
    onContinue: () => showPrepare(),
    onShare: () => void shareRecapCard(result, state.pseudo),
    onSubmitScore: async (pseudo) => {
      state.pseudo = pseudo;
      saveGame(localStorage, state);
      return submitScore(pseudo, result);
    },
  });
}

function showPrepare(): void {
  applyIdleTime(state, Date.now());
  saveGame(localStorage, state);
  if (!isUnlocked(selection.spot)) selection.spot = 'champ';
  renderPrepare(app, state, selection, Date.now(), {
    onLaunch: (spot, genre) => startNight(spot, genre),
    onBuy: (cat) => {
      if (buyGearUpgrade(state, cat)) {
        saveGame(localStorage, state);
        showPrepare();
      }
    },
    onRepairStart: (cat) => {
      if (startRepair(state, cat, Date.now())) {
        saveGame(localStorage, state);
        showPrepare();
      }
    },
    onRepairRush: (cat) => {
      if (rushRepair(state, cat)) {
        saveGame(localStorage, state);
        showPrepare();
      }
    },
    onExport: () => {
      const code = exportCode(state);
      void navigator.clipboard?.writeText(code).then(
        () => alert(`${STR.copied}\n\n${code}`),
        () => prompt(STR.exportSave, code),
      );
    },
    onImport: () => {
      const code = prompt(STR.importPrompt);
      if (!code) return;
      const imported = importCode(code.trim());
      if (imported) {
        state = imported;
        applyIdleTime(state, Date.now());
        saveGame(localStorage, state);
        alert(STR.importOk);
        showPrepare();
      } else {
        alert(STR.importBad);
      }
    },
    onNewGame: () => {
      if (confirm(STR.newGameConfirm)) {
        state = newGame(Date.now());
        saveGame(localStorage, state);
        showPrepare();
      }
    },
    onLeaderboard: () => {
      renderLeaderboard(app, fetchBoard, () => showPrepare());
    },
  });
}

function isUnlocked(spot: SpotId): boolean {
  return state.rep >= getSpot(spot).repReq;
}

// refresh repair countdowns shown on the prepare screen
setInterval(() => {
  if (!active && app.firstElementChild?.classList?.contains('topbar')) {
    // only the prepare screen has the topbar as first child
    if (state.repairs.length > 0) {
      applyIdleTime(state, Date.now());
      saveGame(localStorage, state);
      showPrepare();
    }
  }
}, 10_000);

// autosave when the tab goes to background (phone home button, etc.)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    saveGame(localStorage, state);
  }
});

showPrepare();
