import { describe, expect, it } from 'vitest';
// NB : tsconfig a noUnusedLocals — n'importer ici que ce que ce fichier utilise
import { INTENSITY_HEAT } from './intensity';
import {
  MONTEE_MIN_DROP,
  createNight,
  dropMontee,
  resolveEvent,
  setIntensity,
  startSet,
  tickNight,
} from './night';
import { newGame } from './save';

/** Tick la sim n secondes, en résolvant tout event modal pour que l'horloge avance. */
function tickFor(
  state: ReturnType<typeof newGame>,
  night: ReturnType<typeof createNight>,
  seconds: number,
) {
  for (let t = 0; t < seconds; t += 0.1) {
    if (night.phase === 'event') resolveEvent(state, night, 0);
    tickNight(state, night, 0.1);
  }
}

function playingNight(seed = 7) {
  const state = newGame(42);
  const night = createNight(state, 'champ', ['tonton'], seed);
  startSet(state, night, 'tonton');
  return { state, night };
}

describe("l'énergie du set : les 4 crans", () => {
  it('démarre à groove et change à tout moment, sans cooldown', () => {
    const { night } = playingNight();
    expect(night.intensity).toBe('groove');
    expect(setIntensity(night, 'rinse')).toBe(true);
    expect(setIntensity(night, 'chill')).toBe(true); // pas de verrou de 18 s
    expect(setIntensity(night, 'chill')).toBe(false); // même cran = refus
  });

  it('refuse hors phase playing', () => {
    const state = newGame(42);
    const night = createNight(state, 'champ', ['tonton'], 7);
    expect(night.phase).toBe('transition');
    expect(setIntensity(night, 'peak')).toBe(false);
  });

  it("persiste d'un set à l'autre — la transition ne choisit que le DJ", () => {
    const { state, night } = playingNight();
    setIntensity(night, 'rinse');
    night.setElapsed = night.setLen; // force la fin du set
    tickNight(state, night, 0.1);
    expect(night.phase).toBe('transition');
    startSet(state, night, 'tonton');
    expect(night.intensity).toBe('rinse');
  });

  it('RINSE chauffe ~4.8× plus vite que CHILL (INTENSITY_HEAT)', () => {
    expect(INTENSITY_HEAT.rinse / INTENSITY_HEAT.chill).toBeCloseTo(4.8, 5);
    const a = playingNight(9);
    setIntensity(a.night, 'chill');
    tickFor(a.state, a.night, 8); // < 1er event (≥ 20 s) et < 1er prompt (≥ 12 s)
    const b = playingNight(9);
    setIntensity(b.night, 'rinse');
    tickFor(b.state, b.night, 8);
    expect(b.night.heat).toBeGreaterThan(a.night.heat);
  });

  it('la fatigue suit fracPeakRinse : 0.18 plancher à chill, 0.34 à plein rinse', () => {
    const a = playingNight(11);
    setIntensity(a.night, 'chill');
    a.night.setElapsed = a.night.setLen - 0.05;
    tickNight(a.state, a.night, 0.1); // clôt le set → applySetToll
    expect(a.state.crew[0].fatigue).toBeCloseTo(0.18, 2);
    const b = playingNight(11);
    setIntensity(b.night, 'rinse');
    // 100 % du temps de set à rinse — on re-tape le cran à CHAQUE itération :
    // un event résolu (patrouille option 0…) peut forcer l'intensité (forceIntensity)
    for (let t = 0; t < b.night.setLen - 0.2; t += 0.1) {
      if (b.night.phase === 'event') resolveEvent(b.state, b.night, 0);
      setIntensity(b.night, 'rinse');
      b.night.floorPrompt = null;
      tickNight(b.state, b.night, 0.1);
    }
    b.night.setElapsed = b.night.setLen;
    tickNight(b.state, b.night, 0.1);
    expect(b.state.crew[0].fatigue).toBeCloseTo(0.18 + 0.16, 1);
  });
});

describe('la montée (migrée du brief)', () => {
  it('se charge dans le temps en jouant', () => {
    const { state, night } = playingNight();
    expect(night.montee).toBe(0);
    tickFor(state, night, 20);
    expect(night.montee).toBeGreaterThan(0);
  });

  it('dropMontee boost la vibe et la foule, augmente la heat, remet montee à 0', () => {
    const { state, night } = playingNight();
    tickFor(state, night, 20);
    night.crowd = night.cap * 0.5;
    const vibe = night.vibe;
    const heat = night.heat;
    const crowd = night.crowd;
    expect(dropMontee(state, night)).toBe(true);
    expect(night.vibe).toBeGreaterThan(vibe);
    expect(night.crowd).toBeGreaterThan(crowd);
    expect(night.heat).toBeGreaterThan(heat);
    expect(night.montee).toBe(0);
  });

  it('refuse sous MONTEE_MIN_DROP', () => {
    const { state, night } = playingNight();
    night.montee = MONTEE_MIN_DROP - 0.01;
    expect(dropMontee(state, night)).toBe(false);
  });

  it('un brownout draine la jauge', () => {
    const { state, night } = playingNight();
    night.montee = 1;
    night.crowd = night.cap; // surcharge la demande
    setIntensity(night, 'rinse');
    const before = night.montee;
    tickFor(state, night, 1);
    expect(night.montee).toBeLessThan(before);
  });
});
