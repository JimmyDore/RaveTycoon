import './style.css';
import { AudioEngine } from './audio/engine';
import { recruitDj } from './core/crew';
import { getDj, getSpot } from './core/data';
import { applyIdleTime, rushRepair, startRepair } from './core/idle';
import { createNight, resolveEvent, startSet, tickNight } from './core/night';
import { applyBust, buyGearUpgrade, settleNight } from './core/payout';
import { exportCode, importCode, loadGame, newGame, saveGame } from './core/save';
import type { Brief, GameState, NightResult, NightState } from './core/types';
import { RaverSim } from './render/ravers';
import { SceneRenderer, defaultFloor } from './render/scene';
import { loadSprites, type SpriteBank } from './render/sprites';
import { fetchBoard, submitScore } from './ui/api';
import { shareRecapCard } from './ui/recap-card';
import {
  renderLeaderboard,
  renderNight,
  renderPrepare,
  renderRecap,
  type NightScreen,
  type PrepareSelection,
} from './ui/screens';
import { STR } from './ui/strings';

const app = document.querySelector<HTMLDivElement>('#app')!;
const audio = new AudioEngine();

let state: GameState = loadGame(localStorage) ?? newGame(Date.now());
applyIdleTime(state, Date.now());
saveGame(localStorage, state);

let bank: SpriteBank | null = null;
const bankReady = loadSprites().then((b) => {
  bank = b;
  return b;
});

const selection: PrepareSelection = {
  spot: 'champ',
  genre: 'hardtek',
  present: new Set(state.crew.map((d) => d.id)),
};

// --- the night loop ---------------------------------------------------------

interface ActiveNight {
  night: NightState;
  screen: NightScreen;
  scene: SceneRenderer;
  ravers: RaverSim;
  raf: number;
  simAccumulator: number;
  lastFrame: number;
  endAt: number | null;
  heatWarned: boolean;
}

let active: ActiveNight | null = null;
const SIM_DT = 0.1;

async function startNight(): Promise<void> {
  applyIdleTime(state, Date.now());
  const present = [...selection.present].filter((id) => state.crew.some((d) => d.id === id));
  if (present.length === 0) return;
  const b = await bankReady;
  const night = createNight(state, selection.spot, selection.genre, present, (Date.now() ^ 0x7e7) >>> 0);
  const screen = renderNight(app);
  const scene = new SceneRenderer(screen.canvas, b);
  const ravers = new RaverSim(defaultFloor());
  void audio.start(selection.genre);

  active = {
    night,
    screen,
    scene,
    ravers,
    raf: 0,
    simAccumulator: 0,
    lastFrame: performance.now(),
    endAt: null,
    heatWarned: false,
  };
  screen.showTransition(state, night, onStartSet);
  active.raf = requestAnimationFrame(frame);
}

function onStartSet(djId: string, brief: Brief): void {
  if (!active) return;
  startSet(state, active.night, djId, brief);
  active.screen.toast(`🎧 ${STR.nowPlaying(getDj(djId).nom)}`);
}

/** The set's energy arc — what the audio engine plays. */
function setEnergy(night: NightState): number {
  if (night.phase !== 'playing' && night.phase !== 'event') return 0.25;
  const p = night.setLen > 0 ? Math.min(1, night.setElapsed / night.setLen) : 0;
  const briefMult = night.brief === 'pousser' ? 1.15 : night.brief === 'safe' ? 0.7 : 1;
  return Math.min(1, (0.3 + 0.65 * p) * briefMult);
}

function frame(now: number): void {
  if (!active) return;
  const { night, screen, scene, ravers } = active;
  const dtMs = Math.min(250, now - active.lastFrame);
  active.lastFrame = now;

  if (night.phase === 'playing') {
    active.simAccumulator += dtMs / 1000;
    while (active.simAccumulator >= SIM_DT && night.phase === 'playing') {
      active.simAccumulator -= SIM_DT;
      const events = tickNight(state, night, SIM_DT);
      for (const ev of events) {
        screen.toast(STR.events[ev.type]);
        if (ev.type === 'bust') audio.playSiren();
        if (ev.type === 'set-ended') screen.showTransition(state, night, onStartSet);
      }
      if (!active.heatWarned && night.heat > 0.75) {
        active.heatWarned = true;
        screen.toast(STR.events.heatWarning);
      } else if (night.heat < 0.6) {
        active.heatWarned = false;
      }
      if ((night.phase as string) === 'event' && night.pendingEvent) {
        screen.showEvent(night.pendingEvent, (index) => {
          const option = resolveEvent(state, night, index);
          return option.outcome;
        });
      }
      if ((night.phase as string) === 'ended' && active.endAt === null) {
        active.endAt = now + (night.busted ? 3800 : 4000);
        if (!night.busted) audio.stop();
      }
    }
  } else {
    active.simAccumulator = 0;
  }

  const playing = night.phase === 'playing';
  audio.update({
    energy: setEnergy(night),
    quality: night.setQuality * night.qualityMultRestOfSet,
    pushed: playing && night.brief === 'pousser',
    soundCut: !playing || night.soundCutT > 0,
    crowd: night.cap > 0 ? night.crowd / night.cap : 0,
    murBlown: night.murBlown,
  });

  ravers.update(night.crowd, dtMs / 1000, night.busted);
  if (bank) {
    const dj = night.currentDj ? getDj(night.currentDj) : null;
    scene.render(
      {
        spotId: night.spotId,
        progress: night.t / night.duration,
        gear: state.gear,
        heat: night.heat,
        soundCut: !playing || night.soundCutT > 0,
        beatPhase: audio.beatPhase(),
        vibe: night.vibe,
        busted: night.busted,
        crowd: night.crowd,
        djCharacter: playing || night.phase === 'event' ? dj?.sprite ?? null : null,
      },
      ravers,
      now,
    );
  }
  screen.update(night);

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
  const night = active.night;
  active = null;
  const result = night.busted ? applyBust(state, night) : settleNight(state, night);
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
  if (state.rep < getSpot(selection.spot).repReq) selection.spot = 'champ';
  for (const id of selection.present) {
    if (!state.crew.some((d) => d.id === id)) selection.present.delete(id);
  }
  if (selection.present.size === 0) {
    for (const d of state.crew) selection.present.add(d.id);
  }
  renderPrepare(app, state, selection, Date.now(), {
    onLaunch: () => void startNight(),
    onRecruit: (djId) => {
      if (recruitDj(state, djId)) {
        selection.present.add(djId);
        saveGame(localStorage, state);
        showPrepare();
      }
    },
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
        selection.present.clear();
        for (const d of state.crew) selection.present.add(d.id);
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
        selection.present.clear();
        selection.present.add('tonton');
        selection.spot = 'champ';
        showPrepare();
      }
    },
    onLeaderboard: () => {
      renderLeaderboard(app, fetchBoard, () => showPrepare());
    },
  });
}

// refresh repair countdowns on the prepare screen
setInterval(() => {
  if (!active && app.classList.contains('screen-prepare') && state.repairs.length > 0) {
    applyIdleTime(state, Date.now());
    saveGame(localStorage, state);
    showPrepare();
  }
}, 10_000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    saveGame(localStorage, state);
  }
});

showPrepare();
