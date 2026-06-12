import './style.css';
import { AudioEngine } from './audio/engine';
import { buyDayOff, buyStudioSession, giftDj, isEnGardeAVue, recruitDj } from './core/crew';
import { SPOTS, getDj, getSpot } from './core/data';
import { cautionCost } from './core/economy';
import { applyIdleTime, rushRepair, startRepair } from './core/idle';
import { createNight, dropMontee, resolveEvent, seizeFloorPrompt, setIntensity, startSet, tickNight } from './core/night';
import type { Intensity } from './core/intensity';
import { applyBust, buyGearUpgrade, isSpotAvailable, settleNight, switchGearBranch } from './core/payout';
import { DESCENTE_WARNING, raidEvacuer, raidNegocier, raidTenir } from './core/raid';
import { drawRegions, toRegionState } from './core/regions';
import { acceptSpecialOffer, declineSpecialOffer, ensureSpecialOffer } from './core/specials';
import { exportCode, importCode, loadGame, newGame, saveGame } from './core/save';
import { buyPerk, departOnTour } from './core/tour';
import type { GameState, NightResult, NightState } from './core/types';
import { RaverSim } from './render/ravers';
import { SceneRenderer, defaultFloor } from './render/scene';
import { loadSprites, type SpriteBank } from './render/sprites';
import { fetchBoard, submitScore } from './ui/api';
import { shareRecapCard } from './ui/recap-card';
import {
  renderHeritage,
  renderLeaderboard,
  renderNight,
  renderPrepare,
  renderRecap,
  renderRegionDraw,
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
  present: new Set(state.crew.map((d) => d.id)),
  barStock: 'normal',
  caution: false,
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
  // contrat de nuit spéciale : le genre imposé filtre les présents, le spot est forcé
  const contract = state.specialOffer?.accepted && state.specialOffer.night === state.nights ? state.specialOffer : null;
  const present = [...selection.present].filter(
    (id) =>
      state.crew.some((d) => d.id === id) &&
      !isEnGardeAVue(state, id) &&
      (!contract?.genreId || getDj(id).genre === contract.genreId),
  );
  if (contract?.spotId) selection.spot = contract.spotId;
  if (present.length === 0) return;
  const b = await bankReady;
  const night = createNight(state, selection.spot, present, (Date.now() ^ 0x7e7) >>> 0, {
    barStock: selection.barStock,
    caution: selection.caution,
  });
  const screen = renderNight(app, {
    onIntensity: (i) => {
      if (active && setIntensity(active.night, i)) {
        active.screen.toast(STR.intensiteToast(i));
      }
    },
    onDrop: () => {
      if (active && dropMontee(state, active.night)) {
        active.screen.toast(STR.dropToast);
      }
    },
    onPrompt: () => {
      if (!active) return;
      const def = seizeFloorPrompt(state, active.night);
      if (def) active.screen.toast(STR.promptToast(def.icon, def.label));
    },
    onRaid: (choice) => {
      if (!active) return;
      const night = active.night;
      if (choice === 'evacuer' && raidEvacuer(state, night)) active.screen.toast(STR.raidEvacueToast);
      if (choice === 'negocier' && raidNegocier(state, night)) {
        active.screen.toast(night.raid?.outcome === 'nego-ok' ? STR.raidNegoOkToast : STR.events.bust);
        if (night.raid?.outcome === 'nego-rate') audio.playSiren();
      }
      if (choice === 'tenir' && raidTenir(state, night)) active.screen.toast(STR.raidTenir);
    },
  });
  const scene = new SceneRenderer(screen.canvas, b);
  const ravers = new RaverSim(defaultFloor());

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

function onStartSet(djId: string): void {
  if (!active) return;
  // révélation des modifs du soir au 1er set, une fois le modal de transition fermé
  const firstSet = active.night.setIndex === 0 && active.night.playedSets.length === 0;
  startSet(state, active.night, djId);
  // le son c'est le DJ : on bascule le moteur sur le genre du DJ qui prend le set
  void audio.switchTo(getDj(djId).genre);
  if (firstSet) active.screen.showModifiers(active.night.modifiers);
  active.screen.toast(`🎧 ${STR.nowPlaying(getDj(djId).nom)}`);
}

const INTENSITY_ENERGY: Record<Intensity, number> = { chill: 0.35, groove: 0.6, peak: 0.85, rinse: 1 };

/** Ce que joue le moteur audio : le cran EST l'énergie. */
function setEnergy(night: NightState): number {
  if (night.phase !== 'playing' && night.phase !== 'event') return 0.25;
  return INTENSITY_ENERGY[night.intensity];
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
        if (ev.type === 'phase-change') screen.toast(STR.phaseToast[night.nightPhase]);
        else screen.toast(STR.events[ev.type]);
        if (ev.type === 'bust') audio.playSiren();
        if (ev.type === 'descente') audio.playSiren();
        if (ev.type === 'set-ended') screen.showTransition(state, night, onStartSet);
      }
      if (!active.heatWarned && night.heat > DESCENTE_WARNING) {
        active.heatWarned = true;
        screen.toast(STR.events.heatWarning);
        audio.playSiren(1.5); // sirène lointaine — courte et discrète
      } else if (night.heat < DESCENTE_WARNING - 0.1) {
        active.heatWarned = false;
      }
      if ((night.phase as string) === 'event' && night.pendingEvent) {
        screen.showEvent(night, night.pendingEvent, (index) => {
          const option = resolveEvent(state, night, index);
          return option.outcome;
        });
      }
    }
  } else {
    active.simAccumulator = 0;
  }

  // la descente peut terminer la nuit depuis un bouton (évacuer / négo ratée),
  // hors du tick — l'armement de fin s'évalue à chaque frame
  if (night.phase === 'ended' && active.endAt === null) {
    active.endAt = now + (night.busted ? 3800 : 4000);
    if (!night.busted) audio.stop();
  }

  const playing = night.phase === 'playing';
  audio.update({
    energy: setEnergy(night),
    quality: night.setQuality * night.qualityMultRestOfSet,
    pushed: playing && night.intensity === 'rinse',
    soundCut: !playing || night.soundCutT > 0,
    crowd: night.cap > 0 ? night.crowd / night.cap : 0,
    murBlown: night.murBlown,
    montee: playing ? night.montee : 0,
  });

  ravers.update(night.crowd, dtMs / 1000, night.busted);
  if (bank) {
    const dj = night.currentDj ? getDj(night.currentDj) : null;
    scene.render(
      {
        spotId: night.spotId,
        progress: night.t / night.duration,
        gear: state.gear,
        gearBranch: state.gearBranch,
        montee: playing ? night.montee : 0,
        murBlown: night.murBlown,
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
  screen.update(state, night);

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

function showHeritage(): void {
  renderHeritage(app, state, {
    onBuyPerk: (perkId) => {
      if (buyPerk(state, perkId)) {
        saveGame(localStorage, state);
        showHeritage();
      }
    },
    onBack: () => showPrepare(),
  });
}

function showPrepare(): void {
  applyIdleTime(state, Date.now());
  // l'offre du soir (story D) : tirage déterministe par compteur, un double appel est sans effet
  ensureSpecialOffer(state);
  saveGame(localStorage, state);
  if (!isSpotAvailable(state, selection.spot)) {
    selection.spot = SPOTS.find((s) => isSpotAvailable(state, s.id))?.id ?? 'champ';
  }
  if (selection.caution && state.cash < cautionCost(state, getSpot(selection.spot))) selection.caution = false;
  for (const id of selection.present) {
    if (!state.crew.some((d) => d.id === id)) selection.present.delete(id);
  }
  for (const id of selection.present) {
    if (isEnGardeAVue(state, id)) selection.present.delete(id);
  }
  if (selection.present.size === 0) {
    // le fondateur n'allant jamais en garde à vue, il reste toujours au moins
    // un DJ libre — no-softlock
    for (const d of state.crew) if (!isEnGardeAVue(state, d.id)) selection.present.add(d.id);
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
    onGift: (djId) => {
      if (giftDj(state, djId)) {
        saveGame(localStorage, state);
        showPrepare();
      }
    },
    onDayOff: (djId) => {
      if (buyDayOff(state, djId)) {
        saveGame(localStorage, state);
        showPrepare();
      }
    },
    onStudio: (djId) => {
      if (buyStudioSession(state, djId)) {
        saveGame(localStorage, state);
        showPrepare();
      }
    },
    onBuy: (cat, branch) => {
      if (buyGearUpgrade(state, cat, branch)) {
        saveGame(localStorage, state);
        showPrepare();
      }
    },
    onSwitchBranch: (cat) => {
      if (switchGearBranch(state, cat)) {
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
    onAcceptOffer: () => {
      if (!acceptSpecialOffer(state)) return;
      const offer = state.specialOffer!;
      if (offer.spotId) selection.spot = offer.spotId;
      if (offer.genreId) {
        for (const id of [...selection.present]) {
          if (getDj(id).genre !== offer.genreId) selection.present.delete(id);
        }
        for (const d of state.crew) {
          if (getDj(d.id).genre === offer.genreId) selection.present.add(d.id);
        }
      }
      saveGame(localStorage, state);
      showPrepare();
    },
    onDeclineOffer: () => {
      if (declineSpecialOffer(state)) {
        saveGame(localStorage, state);
        showPrepare();
      }
    },
    onHeritage: () => showHeritage(),
    onDepart: (veteranIds) => {
      // chantier 4 : 3 cartes-régions, on en choisit une pour toute la tournée
      const choices = drawRegions((Date.now() ^ 0x4e9) >>> 0);
      renderRegionDraw(app, choices, (choice) => {
        state = departOnTour(state, veteranIds, toRegionState(choice));
        saveGame(localStorage, state);
        selection.present.clear();
        for (const d of state.crew) selection.present.add(d.id);
        selection.spot = 'champ'; // showPrepare retombe sur un spot jouable si banni
        showPrepare();
      });
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
