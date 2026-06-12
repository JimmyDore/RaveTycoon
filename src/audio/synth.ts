import type { GenreId } from '../core/types';

/**
 * Pure pattern layer — testable without an AudioContext. Everything is laid
 * out on a 16-steps-per-bar grid over a fixed number of bars, then rendered
 * offline into AudioBuffers by the engine.
 */

export const STEPS_PER_BAR = 16;
export const LOOP_BARS = 2;

export interface Note {
  /** grid position in [0, steps) */
  step: number;
  /** frequency in Hz (percussion ignores this) */
  freq: number;
  /** velocity in [0, 1] */
  vel: number;
  /** gate length in steps */
  len: number;
}

/** How the lead stem is voiced — picked by the engine to give each genre its timbre. */
export type LeadStyle = 'stab' | 'acid303' | 'skank' | 'hoover' | 'arp' | 'psy' | 'ragga';

export interface GenrePatterns {
  bpm: number;
  steps: number;
  loopSeconds: number;
  /** voicing of the lead stem (selects the engine renderer) */
  leadStyle: LeadStyle;
  kick: Note[];
  sub: Note[];
  lead: Note[];
  hats: Note[];
}

export function loopSteps(bars = LOOP_BARS): number {
  return bars * STEPS_PER_BAR;
}

export function loopSeconds(bpm: number, bars = LOOP_BARS): number {
  return (bars * 4 * 60) / bpm;
}

export function stepSeconds(bpm: number): number {
  return 60 / bpm / 4;
}

const A1 = 55;
function note(semitonesFromA1: number): number {
  return A1 * Math.pow(2, semitonesFromA1 / 12);
}

function onSteps(steps: number[], freq: number, vel = 1, len = 1): Note[] {
  return steps.map((step) => ({ step, freq, vel, len }));
}

function fourOnFloor(steps: number): Note[] {
  const out: Note[] = [];
  for (let s = 0; s < steps; s += 4) out.push({ step: s, freq: 50, vel: 1, len: 1 });
  return out;
}

function offbeats(steps: number, freq: number, vel = 0.8): Note[] {
  const out: Note[] = [];
  for (let s = 2; s < steps; s += 4) out.push({ step: s, freq, vel, len: 1 });
  return out;
}

function buildHardtek(): GenrePatterns {
  const bpm = 170;
  const steps = loopSteps();
  // pounding kick, driving offbeat bass, rave stabs
  const sub: Note[] = [];
  const bassline = [0, 0, -5, 0, 0, 0, 3, -5];
  for (let i = 0; i < steps; i += 4) {
    sub.push({ step: i + 2, freq: note(bassline[(i / 4) % bassline.length]), vel: 0.95, len: 2 });
  }
  const lead = [
    ...onSteps([4, 12], note(12), 0.7, 2),
    ...onSteps([20, 26, 28], note(15), 0.75, 2),
  ];
  const hats: Note[] = [];
  for (let s = 2; s < steps; s += 4) hats.push({ step: s, freq: 9000, vel: 0.8, len: 1 });
  for (let s = 0; s < steps; s += 2) hats.push({ step: s, freq: 11000, vel: 0.25, len: 1 });
  return { bpm, steps, loopSeconds: loopSeconds(bpm), leadStyle: 'stab', kick: fourOnFloor(steps), sub, lead, hats };
}

function buildAcid(): GenrePatterns {
  const bpm = 140;
  const steps = loopSteps();
  // rolling 303 line — the lead carries the acid riff
  const riff = [0, 12, 0, 3, 0, 15, 7, 3, 0, 12, 5, 0, 10, 7, 3, -2];
  const lead: Note[] = [];
  for (let s = 0; s < steps; s++) {
    if (s % 2 === 0 || s % 8 === 5) {
      lead.push({ step: s, freq: note(riff[s % riff.length] + 12), vel: s % 4 === 0 ? 1 : 0.65, len: 1 });
    }
  }
  const sub: Note[] = [];
  for (let s = 0; s < steps; s += 8) sub.push({ step: s, freq: note(0), vel: 0.9, len: 6 });
  const hats = offbeats(steps, 10000, 0.7);
  return { bpm, steps, loopSeconds: loopSeconds(bpm), leadStyle: 'acid303', kick: fourOnFloor(steps), sub, lead, hats };
}

function buildDub(): GenrePatterns {
  const bpm = 75;
  const steps = loopSteps();
  // one drop: kick on beat 3 of each bar, heavy walking sub, skank chords
  const kick = onSteps([8, 24], 50, 1, 1);
  const bassline: Array<[number, number, number]> = [
    [0, 0, 3], [6, 0, 1], [8, -2, 3], [14, -4, 1],
    [16, -5, 3], [22, -5, 1], [24, -7, 4], [30, -2, 1],
  ];
  const sub = bassline.map(([step, semi, len]) => ({ step, freq: note(semi), vel: 0.95, len }));
  const lead = offbeats(steps, note(12), 0.55).map((n) => ({ ...n, len: 1 }));
  const hats = onSteps([4, 12, 20, 28], 8000, 0.4, 1);
  return { bpm, steps, loopSeconds: loopSeconds(bpm), leadStyle: 'skank', kick, sub, lead, hats };
}

function buildFrenchcore(): GenrePatterns {
  const bpm = 200;
  const steps = loopSteps();
  // relentless 4-floor kick + a driving distorted hoover lead. Sub doubles the kick low.
  const sub: Note[] = [];
  for (let s = 0; s < steps; s += 4) sub.push({ step: s, freq: note(-5), vel: 1, len: 3 });
  // hoover riff — long detuned notes climbing then snapping back, very driving
  const hoover = [0, 0, 3, 5, 7, 5, 3, 0];
  const lead: Note[] = [];
  for (let i = 0; i < steps; i += 4) {
    const semi = hoover[(i / 4) % hoover.length];
    lead.push({ step: i, freq: note(semi), vel: i % 8 === 0 ? 1 : 0.8, len: 4 });
  }
  const hats: Note[] = [];
  for (let s = 0; s < steps; s += 2) hats.push({ step: s, freq: 10000, vel: s % 4 === 2 ? 0.85 : 0.3, len: 1 });
  return { bpm, steps, loopSeconds: loopSeconds(bpm), leadStyle: 'hoover', kick: fourOnFloor(steps), sub, lead, hats };
}

function buildMentale(): GenrePatterns {
  const bpm = 180;
  const steps = loopSteps();
  // hardtek kick + a hypnotic melodic arpeggio. Sub holds a long droning root.
  const sub: Note[] = [];
  for (let s = 0; s < steps; s += 8) sub.push({ step: s, freq: note(-12), vel: 0.9, len: 8 });
  // minor arpeggio, 8ths, climbing — the hypnotic signature
  const arp = [0, 7, 12, 15, 12, 7, 10, 7];
  const lead: Note[] = [];
  for (let s = 0; s < steps; s += 2) {
    const semi = arp[(s / 2) % arp.length];
    lead.push({ step: s, freq: note(semi + 12), vel: s % 8 === 0 ? 0.9 : 0.6, len: 2 });
  }
  const hats: Note[] = [];
  for (let s = 2; s < steps; s += 4) hats.push({ step: s, freq: 9500, vel: 0.6, len: 1 });
  for (let s = 1; s < steps; s += 2) hats.push({ step: s, freq: 12000, vel: 0.2, len: 1 });
  return { bpm, steps, loopSeconds: loopSeconds(bpm), leadStyle: 'arp', kick: fourOnFloor(steps), sub, lead, hats };
}

function buildTechno(): GenrePatterns {
  const bpm = 130;
  const steps = loopSteps();
  // clean 4-floor, minimal offbeat stab, tight rolling sub. The discreet banker.
  const sub: Note[] = [];
  for (let s = 0; s < steps; s += 2) sub.push({ step: s, freq: note(-12), vel: s % 4 === 0 ? 0.9 : 0.7, len: 1 });
  // sparse offbeat stab — minimal, just a couple of steps per bar
  const lead = [
    ...onSteps([6, 14], note(7), 0.7, 1),
    ...onSteps([22, 30], note(10), 0.7, 1),
  ];
  // tight closed offbeat hats, very even
  const hats: Note[] = [];
  for (let s = 2; s < steps; s += 4) hats.push({ step: s, freq: 11000, vel: 0.6, len: 1 });
  return { bpm, steps, loopSeconds: loopSeconds(bpm), leadStyle: 'stab', kick: fourOnFloor(steps), sub, lead, hats };
}

function buildRaggatek(): GenrePatterns {
  const bpm = 175;
  const steps = loopSteps();
  // tek kick + walking sub + a vocal toasting stab on the offbeats.
  const sub: Note[] = [];
  const bassline = [0, 0, -2, -5, 0, 3, -5, -2];
  for (let i = 0; i < steps; i += 4) {
    sub.push({ step: i + 2, freq: note(bassline[(i / 4) % bassline.length] - 12), vel: 0.9, len: 2 });
  }
  // toasting phrase — a short sung contour on the offbeats (its own 'ragga' voicing)
  const phrase = [12, 12, 15, 12, 17, 15, 12, 10];
  const lead: Note[] = [];
  let pi = 0;
  for (let s = 2; s < steps; s += 4) {
    lead.push({ step: s, freq: note(phrase[pi % phrase.length]), vel: pi % 2 === 0 ? 0.75 : 0.6, len: 1 });
    pi++;
  }
  // syncopated tek hats
  const hats: Note[] = [];
  for (let s = 2; s < steps; s += 4) hats.push({ step: s, freq: 9000, vel: 0.75, len: 1 });
  for (let s = 3; s < steps; s += 4) hats.push({ step: s, freq: 12000, vel: 0.3, len: 1 });
  return { bpm, steps, loopSeconds: loopSeconds(bpm), leadStyle: 'ragga', kick: fourOnFloor(steps), sub, lead, hats };
}

function buildDarkpsy(): GenrePatterns {
  const bpm = 150;
  const steps = loopSteps();
  // rolling 16th bassline between the kicks + a resonant psy lead. Hypnotic forest transe.
  // classic psy: kick on the beat, rolling sub on the three off-16ths after it
  const sub: Note[] = [];
  for (let s = 0; s < steps; s++) {
    if (s % 4 !== 0) sub.push({ step: s, freq: note(-17), vel: 0.85, len: 1 });
  }
  // squelchy resonant psy lead — a winding minor line in 16ths
  const psyRiff = [0, 0, 5, 0, 3, 0, 7, 3, 0, 0, 10, 7, 5, 3, 0, -2];
  const lead: Note[] = [];
  for (let s = 0; s < steps; s++) {
    if (s % 2 === 0 || s % 4 === 3) {
      lead.push({ step: s, freq: note(psyRiff[s % psyRiff.length] + 12), vel: s % 4 === 0 ? 0.9 : 0.55, len: 1 });
    }
  }
  const hats: Note[] = [];
  for (let s = 2; s < steps; s += 4) hats.push({ step: s, freq: 9000, vel: 0.55, len: 1 });
  for (let s = 0; s < steps; s += 2) hats.push({ step: s, freq: 13000, vel: 0.18, len: 1 });
  return { bpm, steps, loopSeconds: loopSeconds(bpm), leadStyle: 'psy', kick: fourOnFloor(steps), sub, lead, hats };
}

function buildTribe(): GenrePatterns {
  const bpm = 165;
  const steps = loopSteps();
  // tribe : kick roulé (doubles en fin de bar), sub tribal, stab hypnotique
  const kick = fourOnFloor(steps);
  kick.push({ step: 14, freq: 50, vel: 0.7, len: 1 }, { step: 30, freq: 50, vel: 0.7, len: 1 });
  const sub: Note[] = [];
  const bassline = [0, -5, -2, 0, -7, -5, 0, -2];
  for (let i = 0; i < steps; i += 4) {
    sub.push({ step: i + 2, freq: note(bassline[(i / 4) % bassline.length] - 5), vel: 0.9, len: 2 });
  }
  const lead = [
    ...onSteps([0, 6, 16, 22], note(10), 0.7, 2),
    ...onSteps([10, 26], note(5), 0.6, 1),
  ];
  const hats: Note[] = [];
  for (let s = 2; s < steps; s += 4) hats.push({ step: s, freq: 9500, vel: 0.7, len: 1 });
  for (let s = 1; s < steps; s += 4) hats.push({ step: s, freq: 12000, vel: 0.25, len: 1 });
  return { bpm, steps, loopSeconds: loopSeconds(bpm), leadStyle: 'stab', kick, sub, lead, hats };
}

function buildHardcore(): GenrePatterns {
  const bpm = 220;
  const steps = loopSteps();
  // 220 BPM : kick massif doublé au sub, hoover en rafales
  const sub: Note[] = [];
  for (let s = 0; s < steps; s += 4) sub.push({ step: s, freq: note(-7), vel: 1, len: 3 });
  const riff = [0, 0, 5, 3, 0, 7, 5, 3];
  const lead: Note[] = [];
  for (let i = 0; i < steps; i += 2) {
    if (i % 8 !== 6) {
      lead.push({ step: i, freq: note(riff[(i / 2) % riff.length]), vel: i % 8 === 0 ? 1 : 0.75, len: 2 });
    }
  }
  const hats: Note[] = [];
  for (let s = 0; s < steps; s += 2) hats.push({ step: s, freq: 11000, vel: s % 4 === 2 ? 0.9 : 0.4, len: 1 });
  return { bpm, steps, loopSeconds: loopSeconds(bpm), leadStyle: 'hoover', kick: fourOnFloor(steps), sub, lead, hats };
}

function buildDowntempo(): GenrePatterns {
  const bpm = 95;
  const steps = loopSteps();
  // mi-temps planant : kick clairsemé, long sub, arpège doux
  const kick = onSteps([0, 10, 16, 26], 50, 0.9, 1);
  const sub: Note[] = [];
  for (let s = 0; s < steps; s += 8) sub.push({ step: s, freq: note(-12), vel: 0.85, len: 7 });
  const arp = [0, 7, 12, 10];
  const lead: Note[] = [];
  for (let s = 0; s < steps; s += 4) {
    lead.push({ step: s + 2, freq: note(arp[(s / 4) % arp.length] + 12), vel: 0.5, len: 3 });
  }
  const hats = onSteps([4, 12, 20, 28], 8500, 0.35, 1);
  return { bpm, steps, loopSeconds: loopSeconds(bpm), leadStyle: 'arp', kick, sub, lead, hats };
}

function buildElectro(): GenrePatterns {
  const bpm = 128;
  const steps = loopSteps();
  // electro carré : 4-floor propre, basse syncopée, stab brillant sur l'offbeat
  const sub: Note[] = [];
  const bassline = [0, 0, 3, 0, -2, 0, 5, 3];
  for (let i = 0; i < steps; i += 4) {
    sub.push({ step: i + 2, freq: note(bassline[(i / 4) % bassline.length] - 12), vel: 0.85, len: 2 });
  }
  const lead = [
    ...onSteps([2, 10, 18, 26], note(12), 0.75, 1),
    ...onSteps([6, 22], note(15), 0.6, 1),
  ];
  const hats: Note[] = [];
  for (let s = 2; s < steps; s += 4) hats.push({ step: s, freq: 10500, vel: 0.65, len: 1 });
  return { bpm, steps, loopSeconds: loopSeconds(bpm), leadStyle: 'stab', kick: fourOnFloor(steps), sub, lead, hats };
}

const BUILDERS: Record<GenreId, () => GenrePatterns> = {
  hardtek: buildHardtek,
  acid: buildAcid,
  dub: buildDub,
  frenchcore: buildFrenchcore,
  mentale: buildMentale,
  techno: buildTechno,
  raggatek: buildRaggatek,
  darkpsy: buildDarkpsy,
  tribe: buildTribe,
  hardcore: buildHardcore,
  downtempo: buildDowntempo,
  electro: buildElectro,
};

export function patternsFor(genre: GenreId): GenrePatterns {
  return BUILDERS[genre]();
}

// --- distortion ---------------------------------------------------------------

/** Monotonic mapping from clipping amount [0,1] to waveshaper drive. */
export function clipDrive(amount: number): number {
  const a = Math.min(1, Math.max(0, amount));
  return 1 + a * 40;
}

/** tanh soft-clip transfer curve for a WaveShaperNode. */
export function distortionCurve(drive: number, samples = 1024): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    curve[i] = Math.tanh(drive * x) / Math.tanh(drive);
  }
  return curve;
}
