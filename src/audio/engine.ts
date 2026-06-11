import type { GenreId } from '../core/types';
import {
  clipDrive,
  distortionCurve,
  patternsFor,
  stepSeconds,
  type GenrePatterns,
  type Note,
} from './synth';

export interface EngineParams {
  /** master fader [0,1] */
  volume: number;
  /** bass fader [0,1] */
  bass: number;
  /** clipping amount [0,1] — drives audible distortion */
  clipping: number;
  /** sound currently cut by a generator brownout */
  brownout: boolean;
  /** normalized crowd size [0,1] */
  crowd: number;
  blownAmp: boolean;
  blownSub: boolean;
}

interface StemNodes {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

const STEM_NAMES = ['kick', 'sub', 'lead', 'hats'] as const;
type StemName = (typeof STEM_NAMES)[number];

/**
 * Adaptive stem mixer. The desk genuinely mixes the music: volume = master
 * gain (distorting past headroom), bass = sub stem + lowshelf, power
 * overdraw = brownout dips. All stems are synthesized offline at start —
 * no audio assets.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private shaper: WaveShaperNode | null = null;
  private lowshelf: BiquadFilterNode | null = null;
  private stems = new Map<StemName, StemNodes>();
  private crowdGain: GainNode | null = null;
  private crackleGain: GainNode | null = null;
  private patterns: GenrePatterns | null = null;
  private loopStart = 0;
  private curveLevel = -1;
  private running = false;

  get isRunning(): boolean {
    return this.running;
  }

  /** Build the context lazily — must be called from a user gesture. */
  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  async start(genreId: GenreId): Promise<void> {
    const ctx = this.ensureCtx();
    this.stopStems();
    const patterns = patternsFor(genreId);
    this.patterns = patterns;

    // master chain: stems → lowshelf → waveshaper → master → compressor → out
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp);
    this.shaper = ctx.createWaveShaper();
    this.shaper.curve = distortionCurve(1);
    this.shaper.oversample = '2x';
    this.shaper.connect(this.master);
    this.lowshelf = ctx.createBiquadFilter();
    this.lowshelf.type = 'lowshelf';
    this.lowshelf.frequency.value = 120;
    this.lowshelf.gain.value = 0;
    this.lowshelf.connect(this.shaper);
    this.curveLevel = -1;

    const buffers = await renderStems(patterns, ctx.sampleRate);
    const t0 = ctx.currentTime + 0.05;
    for (const name of STEM_NAMES) {
      const source = ctx.createBufferSource();
      source.buffer = buffers[name];
      source.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = name === 'sub' ? 0 : 0.8;
      source.connect(gain);
      gain.connect(this.lowshelf);
      source.start(t0);
      this.stems.set(name, { source, gain });
    }
    this.loopStart = t0;

    // crowd noise bed, straight to the compressor (not through the desk)
    const crowdSrc = ctx.createBufferSource();
    crowdSrc.buffer = noiseBuffer(ctx, 2);
    crowdSrc.loop = true;
    const crowdFilter = ctx.createBiquadFilter();
    crowdFilter.type = 'bandpass';
    crowdFilter.frequency.value = 900;
    crowdFilter.Q.value = 0.5;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0;
    crowdSrc.connect(crowdFilter);
    crowdFilter.connect(this.crowdGain);
    this.crowdGain.connect(comp);
    crowdSrc.start(t0);

    // blown-speaker crackle bed
    const crackleSrc = ctx.createBufferSource();
    crackleSrc.buffer = crackleBuffer(ctx, 2);
    crackleSrc.loop = true;
    this.crackleGain = ctx.createGain();
    this.crackleGain.gain.value = 0;
    crackleSrc.connect(this.crackleGain);
    this.crackleGain.connect(comp);
    crackleSrc.start(t0);

    this.running = true;
  }

  private stopStems(): void {
    for (const { source } of this.stems.values()) {
      try {
        source.stop();
      } catch {
        // never started
      }
    }
    this.stems.clear();
    this.running = false;
  }

  stop(): void {
    this.stopStems();
    if (this.ctx) void this.ctx.suspend();
  }

  /** Called every frame from the game loop. */
  update(p: EngineParams): void {
    if (!this.ctx || !this.master || !this.lowshelf || !this.shaper || !this.running) return;
    const t = this.ctx.currentTime;
    const ramp = 0.08;

    // perceptual volume curve; brownout cuts the desk entirely
    let target = p.brownout ? 0 : Math.pow(p.volume, 1.4) * 0.9;
    if (p.blownAmp) target *= 0.5;
    this.master.gain.setTargetAtTime(target, t, p.brownout ? 0.02 : ramp);

    const sub = this.stems.get('sub');
    if (sub) {
      let subTarget = p.bass * 1.25;
      if (p.blownSub) subTarget *= 0.25;
      sub.gain.gain.setTargetAtTime(subTarget, t, ramp);
    }
    this.lowshelf.gain.setTargetAtTime(p.bass * 9 - 3, t, ramp);

    // quantize clipping into 8 levels so we don't rebuild the curve each frame
    const level = Math.round(p.clipping * 8);
    if (level !== this.curveLevel) {
      this.curveLevel = level;
      this.shaper.curve = distortionCurve(clipDrive(level / 8));
    }

    if (this.crowdGain) {
      this.crowdGain.gain.setTargetAtTime(Math.min(0.14, p.crowd * 0.14), t, 0.4);
    }
    if (this.crackleGain) {
      const crackle = (p.blownAmp ? 0.05 : 0) + (p.blownSub ? 0.05 : 0);
      this.crackleGain.gain.setTargetAtTime(crackle, t, 0.2);
    }
  }

  /** Beat phase in [0,1) for dance-animation sync. */
  beatPhase(): number {
    if (!this.ctx || !this.patterns || !this.running) return 0;
    const beat = (this.ctx.currentTime - this.loopStart) / (60 / this.patterns.bpm);
    return beat >= 0 ? beat % 1 : 0;
  }

  /** Two-tone police siren, played on a bust. */
  playSiren(duration = 4): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    gain.gain.setTargetAtTime(0.12, t0, 0.1);
    gain.gain.setTargetAtTime(0, t0 + duration - 0.5, 0.3);
    for (let t = 0; t < duration; t += 0.6) {
      osc.frequency.setValueAtTime(660, t0 + t);
      osc.frequency.setValueAtTime(880, t0 + t + 0.3);
    }
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2200;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration);
  }
}

// --- offline stem rendering ---------------------------------------------------

interface StemBuffers {
  kick: AudioBuffer;
  sub: AudioBuffer;
  lead: AudioBuffer;
  hats: AudioBuffer;
}

async function renderStems(p: GenrePatterns, sampleRate: number): Promise<StemBuffers> {
  const [kick, sub, lead, hats] = await Promise.all([
    renderStem(p, 'kick', sampleRate),
    renderStem(p, 'sub', sampleRate),
    renderStem(p, 'lead', sampleRate),
    renderStem(p, 'hats', sampleRate),
  ]);
  return { kick, sub, lead, hats };
}

function renderStem(
  p: GenrePatterns,
  stem: StemName,
  sampleRate: number,
): Promise<AudioBuffer> {
  const length = Math.ceil(p.loopSeconds * sampleRate);
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  const step = stepSeconds(p.bpm);
  const notes = p[stem];
  switch (stem) {
    case 'kick':
      for (const n of notes) scheduleKick(ctx, n.step * step, n.vel);
      break;
    case 'sub':
      for (const n of notes) scheduleSub(ctx, n.step * step, n.freq, n.vel, n.len * step);
      break;
    case 'lead':
      scheduleLeads(ctx, p, notes, step);
      break;
    case 'hats':
      for (const n of notes) scheduleHat(ctx, n.step * step, n.freq, n.vel);
      break;
  }
  return ctx.startRendering();
}

function scheduleKick(ctx: OfflineAudioContext, t: number, vel: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vel, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.3);
  // transient click
  const click = ctx.createOscillator();
  click.type = 'triangle';
  click.frequency.setValueAtTime(1200, t);
  click.frequency.exponentialRampToValueAtTime(200, t + 0.02);
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(vel * 0.4, t);
  cg.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  click.connect(cg);
  cg.connect(ctx.destination);
  click.start(t);
  click.stop(t + 0.04);
}

function scheduleSub(
  ctx: OfflineAudioContext,
  t: number,
  freq: number,
  vel: number,
  dur: number,
): void {
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 220;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vel * 0.9, t + 0.015);
  gain.gain.setValueAtTime(vel * 0.9, t + dur * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function scheduleLeads(
  ctx: OfflineAudioContext,
  p: GenrePatterns,
  notes: Note[],
  step: number,
): void {
  if (p.bpm === 140) {
    // acid — resonant 303 squelch
    for (const n of notes) schedule303(ctx, n.step * step, n.freq, n.vel, n.len * step);
  } else if (p.bpm === 75) {
    // dub — chord skank through a feedback delay
    const delay = ctx.createDelay(1);
    delay.delayTime.value = step * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.45;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(ctx.destination);
    for (const n of notes) scheduleSkank(ctx, delay, n.step * step, n.freq, n.vel);
  } else {
    // hardtek — detuned rave stabs
    for (const n of notes) scheduleStab(ctx, n.step * step, n.freq, n.vel, n.len * step);
  }
}

function schedule303(
  ctx: OfflineAudioContext,
  t: number,
  freq: number,
  vel: number,
  dur: number,
): void {
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = freq;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 14;
  filter.frequency.setValueAtTime(300 + vel * 2200, t);
  filter.frequency.exponentialRampToValueAtTime(220, t + dur * 0.95);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vel * 0.32, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function scheduleStab(
  ctx: OfflineAudioContext,
  t: number,
  freq: number,
  vel: number,
  dur: number,
): void {
  for (const detune of [-8, 0, 8]) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq * 2;
    osc.detune.value = detune;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3500, t);
    filter.frequency.exponentialRampToValueAtTime(600, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vel * 0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
}

function scheduleSkank(
  ctx: OfflineAudioContext,
  delaySend: DelayNode,
  t: number,
  rootFreq: number,
  vel: number,
): void {
  // minor triad, short and damped
  for (const ratio of [1, 1.189, 1.498]) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = rootFreq * 2 * ratio;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vel * 0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.connect(delaySend);
    osc.start(t);
    osc.stop(t + 0.2);
  }
}

function scheduleHat(ctx: OfflineAudioContext, t: number, freq: number, vel: number): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 0.1);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = freq * 0.7;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vel * 0.25, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start(t);
  src.stop(t + 0.08);
}

// --- shared noise utilities -----------------------------------------------------

function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function crackleBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() < 0.002 ? (Math.random() * 2 - 1) * 0.9 : (Math.random() * 2 - 1) * 0.04;
  }
  return buffer;
}
