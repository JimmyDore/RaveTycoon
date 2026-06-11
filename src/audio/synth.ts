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

export interface GenrePatterns {
  bpm: number;
  steps: number;
  loopSeconds: number;
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
  return { bpm, steps, loopSeconds: loopSeconds(bpm), kick: fourOnFloor(steps), sub, lead, hats };
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
  return { bpm, steps, loopSeconds: loopSeconds(bpm), kick: fourOnFloor(steps), sub, lead, hats };
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
  return { bpm, steps, loopSeconds: loopSeconds(bpm), kick, sub, lead, hats };
}

const BUILDERS: Record<GenreId, () => GenrePatterns> = {
  hardtek: buildHardtek,
  acid: buildAcid,
  dub: buildDub,
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
