import { describe, expect, it } from 'vitest';
// NB : tsconfig a noUnusedLocals — n'importer ici que ce que ce fichier utilise
import { ATTENTE_GENRE, INTENSITY_HEAT, nearestIntensity } from './intensity';
import {
  MONTEE_MIN_DROP,
  TOL_BASE,
  TOL_PER_TECH,
  createNight,
  currentWave,
  dropMontee,
  resolveEvent,
  setIntensity,
  startSet,
  tickNight,
} from './night';
import { settleNight } from './payout';
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

describe('la vague : attente, tolérance, burnout', () => {
  it("l'attente démarre bas et monte sur la nuit (baseline provisoire 0.35→0.8)", () => {
    // bornes lâches exprès : la task 5 remplace la baseline par celle des phases
    // (0.3 à l'ouverture, 0.9 en fin d'aube) sans casser ce test
    const { state, night } = playingNight();
    tickNight(state, night, 0.1);
    expect(night.attente).toBeLessThan(0.45 * ATTENTE_GENRE.hardtek);
    night.t = night.duration * 0.99;
    tickNight(state, night, 0.1);
    expect(night.attente).toBeGreaterThan(0.7);
  });

  it('la tolérance suit la technique du DJ', () => {
    const { state, night } = playingNight();
    // tonton : technique 1 → tol = 0.10 + 0.03 × 1
    expect(currentWave(state, night).tol).toBeCloseTo(TOL_BASE + TOL_PER_TECH * 1, 5);
  });

  it("le charisme plie l'attente vers le cran joué (gap réduit, même DJ même genre)", () => {
    // platines voie B = charisme effectif +1 pour tout le crew : on isole le levier
    const a = playingNight(9); // tonton, charisme 2
    setIntensity(a.night, 'rinse');
    const b = playingNight(9);
    b.state.gear.platines = 3;
    b.state.gearBranch.platines = 'B'; // charisme effectif 3
    setIntensity(b.night, 'rinse');
    expect(Math.abs(currentWave(b.state, b.night).gap)).toBeLessThan(
      Math.abs(currentWave(a.state, a.night).gap),
    );
  });

  it('trop fort : la heat prend un surcoût proportionnel au-delà de la tolérance', () => {
    // même cran, même heat de départ : seul l'écart à l'attente diffère
    const early = playingNight(9);
    setIntensity(early.night, 'rinse'); // ouverture : attente ~0.35, gap énorme
    early.night.heat = 0.2;
    tickNight(early.state, early.night, 0.1);
    const late = playingNight(9);
    setIntensity(late.night, 'rinse');
    late.night.t = late.night.duration * 0.99; // l'attente (~0.8) a presque rejoint le cran
    late.night.heat = 0.2;
    tickNight(late.state, late.night, 0.1);
    expect(early.night.heat - 0.2).toBeGreaterThan(late.night.heat - 0.2);
  });

  it('trop mou : le churn grimpe', () => {
    const mk = (i: Parameters<typeof setIntensity>[1]) => {
      const { state, night } = playingNight(9);
      night.t = night.duration * 0.9; // attente haute (~0.75)
      night.crowd = 30;
      setIntensity(night, i);
      tickNight(state, night, 1);
      return night.crowd;
    };
    expect(mk('chill')).toBeLessThan(mk('peak')); // chill = trop mou → plus de départs
  });

  it('le burnout charge à PEAK/RINSE, décharge à CHILL, et plafonne le payoff du drop', () => {
    const { state, night } = playingNight();
    setIntensity(night, 'rinse');
    tickFor(state, night, 10);
    expect(night.burnout).toBeGreaterThan(0.2); // ~0.04/s
    const charged = night.burnout;
    setIntensity(night, 'chill');
    tickFor(state, night, 5);
    expect(night.burnout).toBeLessThan(charged);
    // le drop sur foule cramée vaut moins
    const a = playingNight(13);
    a.night.montee = 1; a.night.burnout = 0; a.night.waveScore = 0; a.night.vibe = 0.3;
    dropMontee(a.state, a.night);
    const b = playingNight(13);
    b.night.montee = 1; b.night.burnout = 1; b.night.waveScore = 0; b.night.vibe = 0.3;
    dropMontee(b.state, b.night);
    expect(b.night.vibe).toBeLessThan(a.night.vibe);
    expect(b.night.burnout).toBeCloseTo(0.6, 5); // ×= DROP_BURNOUT_RESET
  });

  it('lumières voie A : le burnout de foule charge moins vite (rewire fait)', () => {
    const plain = playingNight(9);
    setIntensity(plain.night, 'rinse');
    tickFor(plain.state, plain.night, 8);
    const hypnose = playingNight(9);
    hypnose.state.gear.lumieres = 4;
    hypnose.state.gearBranch.lumieres = 'A'; // Spirale de lasers : burnout ×0.7
    setIntensity(hypnose.night, 'rinse');
    tickFor(hypnose.state, hypnose.night, 8);
    expect(hypnose.night.burnout).toBeCloseTo(plain.night.burnout * 0.7, 2);
  });

  it('waveScore lisse « dans la vague » et bestWaveScore remonte au résultat', () => {
    const { state, night } = playingNight();
    // politique « suivre l'attente » : toujours dans la vague → l'EMA monte
    for (let t = 0; t < 40; t += 0.1) {
      if (night.phase === 'event') resolveEvent(state, night, 0);
      setIntensity(night, nearestIntensity(night.attente));
      tickNight(state, night, 0.1);
    }
    expect(night.waveScore).toBeGreaterThan(0.6);
    night.setElapsed = night.setLen;
    tickNight(state, night, 0.1);
    startSet(state, night, 'tonton');
    night.setElapsed = night.setLen;
    tickNight(state, night, 0.1); // sunrise
    const result = settleNight(state, night);
    expect(result.bestWaveScore).toBeGreaterThan(0.6);
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
