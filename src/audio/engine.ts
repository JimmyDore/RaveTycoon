import type { GenreId } from '../core/types';
import { parseManifest, STEM_NAMES, type StemManifest, type StemName } from './manifest';
import {
  clipDrive,
  distortionCurve,
  patternsFor,
  stepSeconds,
  type GenrePatterns,
  type Note,
} from './synth';

export interface EngineParams {
  /** set energy arc [0,1] — the simulation is the DJ */
  energy: number;
  /** set quality [0,~1.4] — richer mixes for better DJs */
  quality: number;
  /** cran RINSE — clippe et distord audiblement */
  pushed: boolean;
  /** sound currently cut (brownout / repairs) */
  soundCut: boolean;
  /** normalized crowd size [0,1] */
  crowd: number;
  /** blown speakers crackle */
  murBlown: boolean;
  /** la montée [0,1] — riser : ouvre légèrement le lead à pleine jauge (no-op à 0) */
  montee: number;
}

interface StemNodes {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/**
 * Adaptive stem mixer. The desk genuinely mixes the music: volume = master
 * gain (distorting past headroom), bass = sub stem + lowshelf, power
 * overdraw = brownout dips. Stems are loaded from /audio/ when a manifest
 * is present, otherwise synthesized offline at start — no audio assets
 * required.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private master: GainNode | null = null;
  private shaper: WaveShaperNode | null = null;
  private lowshelf: BiquadFilterNode | null = null;
  private stems = new Map<StemName, StemNodes>();
  private crowdGain: GainNode | null = null;
  private crackleGain: GainNode | null = null;
  /** background source beds — kept so a re-start can stop them instead of leaking */
  private crowdSrc: AudioBufferSourceNode | null = null;
  private crackleSrc: AudioBufferSourceNode | null = null;
  private loopStart = 0;
  private curveLevel = -1;
  private running = false;
  private bpm = 0; // bpm of whatever is currently looping
  private currentGenre: GenreId | null = null;
  private manifest: StemManifest | null | undefined; // undefined = not fetched yet
  /** decoded/rendered stem buffers per genre — never re-fetch/re-render on revisit */
  private bufferCache = new Map<GenreId, { buffers: StemBuffers; bpm: number }>();

  private async fetchManifest(): Promise<StemManifest | null> {
    if (this.manifest !== undefined) return this.manifest;
    try {
      const res = await fetch('/audio/manifest.json');
      this.manifest = res.ok ? parseManifest(await res.json()) : null;
    } catch {
      this.manifest = null;
    }
    return this.manifest;
  }

  /** Real stems from /audio/, or null → caller falls back to synthesis. */
  private async loadRealStems(
    ctx: AudioContext,
    genreId: GenreId,
  ): Promise<{ buffers: StemBuffers; bpm: number } | null> {
    const manifest = await this.fetchManifest();
    const entry = manifest?.[genreId];
    if (!entry) return null;
    try {
      const buffers = {} as StemBuffers;
      await Promise.all(
        STEM_NAMES.map(async (name) => {
          const res = await fetch(`/audio/${entry.stems[name]}`);
          if (!res.ok) throw new Error(`missing stem ${entry.stems[name]}`);
          buffers[name] = await ctx.decodeAudioData(await res.arrayBuffer());
        }),
      );
      return { buffers, bpm: entry.bpm };
    } catch (err) {
      console.warn('[audio] stem load failed, falling back to synth:', err);
      return null;
    }
  }

  /**
   * Stem buffers for a genre, cached by genreId so a revisit (same DJ replaying,
   * or a return to a genre) never re-fetches or re-renders. Real stems from
   * /audio/ when present, synthesised offline otherwise.
   */
  private async resolveStems(
    ctx: AudioContext,
    genreId: GenreId,
  ): Promise<{ buffers: StemBuffers; bpm: number }> {
    const cached = this.bufferCache.get(genreId);
    if (cached) return cached;
    const real = await this.loadRealStems(ctx, genreId);
    const patterns = patternsFor(genreId);
    const resolved = real
      ? real
      : { buffers: await renderStems(patterns, ctx.sampleRate), bpm: patterns.bpm };
    this.bufferCache.set(genreId, resolved);
    return resolved;
  }

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
    // tear down any previous chain in full — a fresh start rebuilds it, so the
    // old master chain and background beds must be stopped/disconnected, never
    // left to resume (and stack) on the next ctx.resume()
    this.teardown();

    // master chain: stems → lowshelf → waveshaper → master → compressor → out
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.comp = comp;
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

    const { buffers, bpm } = await this.resolveStems(ctx, genreId);
    this.bpm = bpm;
    this.currentGenre = genreId;
    const t0 = ctx.currentTime + 0.05;
    this.spawnStems(ctx, buffers, t0);

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
    this.crowdSrc = crowdSrc;

    // blown-speaker crackle bed
    const crackleSrc = ctx.createBufferSource();
    crackleSrc.buffer = crackleBuffer(ctx, 2);
    crackleSrc.loop = true;
    this.crackleGain = ctx.createGain();
    this.crackleGain.gain.value = 0;
    crackleSrc.connect(this.crackleGain);
    this.crackleGain.connect(comp);
    crackleSrc.start(t0);
    this.crackleSrc = crackleSrc;

    this.running = true;
  }

  /** Wire one looping buffer source per stem into the desk, starting at t0. */
  private spawnStems(ctx: AudioContext, buffers: StemBuffers, t0: number): void {
    if (!this.lowshelf) return;
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

  /**
   * Stop and disconnect the whole graph: stems, background beds, and the master
   * chain. Called before a fresh start() so nothing from the previous night is
   * left suspended (it would resume and stack on the next ctx.resume()).
   */
  private teardown(): void {
    this.stopStems();
    for (const src of [this.crowdSrc, this.crackleSrc]) {
      if (!src) continue;
      try {
        src.stop();
      } catch {
        // never started
      }
      src.disconnect();
    }
    this.crowdSrc = null;
    this.crackleSrc = null;
    for (const node of [this.comp, this.master, this.shaper, this.lowshelf, this.crowdGain, this.crackleGain]) {
      node?.disconnect();
    }
    this.comp = null;
    this.master = null;
    this.shaper = null;
    this.lowshelf = null;
    this.crowdGain = null;
    this.crackleGain = null;
  }

  /** Stop a captured set of stem nodes at time t (used by the crossfade tail). */
  private stopStemNodes(nodes: StemNodes[], t: number): void {
    for (const { source } of nodes) {
      try {
        source.stop(t);
      } catch {
        // never started
      }
    }
  }

  stop(): void {
    this.teardown();
    if (this.ctx) void this.ctx.suspend();
  }

  /**
   * Crossfade to another genre's stems without a hard stop/reload (~0.35s).
   * Decoded/rendered buffers are cached per genreId, so returning to a genre
   * never re-fetches or re-renders. If nothing is running yet, falls back to
   * a plain start.
   */
  async switchTo(genreId: GenreId): Promise<void> {
    if (!this.running || !this.master || !this.lowshelf) {
      await this.start(genreId);
      return;
    }
    if (genreId === this.currentGenre) return;
    const ctx = this.ensureCtx();
    const fade = 0.35;

    // resolve (possibly async) before touching the graph so the swap is tight
    const { buffers, bpm } = await this.resolveStems(ctx, genreId);
    if (!this.running || !this.master || !this.lowshelf) return; // stopped while awaiting

    const t = ctx.currentTime;
    const masterTarget = this.master.gain.value;

    // fade the master down, swap stems at the trough, fade back up
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0.0001, t + fade / 2);
    this.master.gain.linearRampToValueAtTime(masterTarget, t + fade);

    // retire the outgoing stems after the fade tail
    const outgoing = [...this.stems.values()];
    this.stems.clear();
    this.stopStemNodes(outgoing, t + fade + 0.05);

    this.bpm = bpm;
    this.currentGenre = genreId;
    this.spawnStems(ctx, buffers, t + fade / 2);
  }

  /**
   * Called every frame from the game loop. The simulation drives the desk:
   * stems layer in as the set's energy climbs, pushing audibly clips.
   */
  update(p: EngineParams): void {
    if (!this.ctx || !this.master || !this.lowshelf || !this.shaper || !this.running) return;
    const t = this.ctx.currentTime;
    const ramp = 0.12;
    const e = Math.min(1, Math.max(0, p.energy));

    let target = p.soundCut ? 0 : (0.3 + 0.55 * e) * (p.pushed ? 1.1 : 1) * 0.85;
    if (p.murBlown) target *= 0.55;
    this.master.gain.setTargetAtTime(target, t, p.soundCut ? 0.02 : ramp);

    // stem layering: kick always; sub from low energy; hats then lead join later.
    // better DJs (quality) bring the upper layers in earlier and louder.
    const q = Math.min(1.2, Math.max(0.3, p.quality));
    const layer = (threshold: number, width: number) =>
      Math.min(1, Math.max(0, (e * q - threshold) / width));
    // la montée ouvre légèrement le lead — borné, no-op exact à montee=0
    const riser = 1 + 0.2 * Math.min(1, Math.max(0, p.montee));
    const gains: Record<string, number> = {
      kick: 0.85,
      sub: (0.5 + 0.8 * layer(0.1, 0.25)) * (p.murBlown ? 0.3 : 1),
      hats: 0.7 * layer(0.3, 0.25),
      lead: 0.85 * layer(0.45, 0.3) * riser,
    };
    for (const [name, gain] of Object.entries(gains)) {
      const stem = this.stems.get(name as 'kick' | 'sub' | 'lead' | 'hats');
      if (stem) stem.gain.gain.setTargetAtTime(gain, t, ramp);
    }
    this.lowshelf.gain.setTargetAtTime((0.4 + 0.6 * e) * 8 - 3, t, ramp);

    // pushing the rig past what it likes = audible distortion
    const clipping = p.pushed ? 0.35 + 0.5 * e : 0;
    const level = Math.round(clipping * 8);
    if (level !== this.curveLevel) {
      this.curveLevel = level;
      this.shaper.curve = distortionCurve(clipDrive(level / 8));
    }

    if (this.crowdGain) {
      this.crowdGain.gain.setTargetAtTime(Math.min(0.14, p.crowd * 0.14), t, 0.4);
    }
    if (this.crackleGain) {
      this.crackleGain.gain.setTargetAtTime(p.murBlown ? 0.08 : 0, t, 0.2);
    }
  }

  /** Beat phase in [0,1) for dance-animation sync. */
  beatPhase(): number {
    if (!this.ctx || !this.bpm || !this.running) return 0;
    const beat = (this.ctx.currentTime - this.loopStart) / (60 / this.bpm);
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
  switch (p.leadStyle) {
    case 'acid303':
      // resonant 303 squelch
      for (const n of notes) schedule303(ctx, n.step * step, n.freq, n.vel, n.len * step);
      break;
    case 'skank': {
      // chord skank through a feedback delay (dub & raggatek)
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
      break;
    }
    case 'hoover':
      // frenchcore — saturated detuned hoover, very driving
      for (const n of notes) scheduleHoover(ctx, n.step * step, n.freq, n.vel, n.len * step);
      break;
    case 'arp':
      // mentale — clean hypnotic arpeggio voice
      for (const n of notes) scheduleArp(ctx, n.step * step, n.freq, n.vel, n.len * step);
      break;
    case 'psy':
      // darkpsy — resonant winding psy line
      for (const n of notes) schedulePsy(ctx, n.step * step, n.freq, n.vel, n.len * step);
      break;
    case 'ragga': {
      // raggatek — vocal-ish toasting stab through a sound-system echo
      const delay = ctx.createDelay(1);
      delay.delayTime.value = step * 2;
      const fb = ctx.createGain();
      fb.gain.value = 0.35;
      const wet = ctx.createGain();
      wet.gain.value = 0.4;
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(wet);
      wet.connect(ctx.destination);
      for (const n of notes) scheduleRagga(ctx, delay, n.step * step, n.freq, n.vel);
      break;
    }
    case 'stab':
    default:
      // hardtek / techno — detuned rave stabs
      for (const n of notes) scheduleStab(ctx, n.step * step, n.freq, n.vel, n.len * step);
      break;
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

function scheduleRagga(
  ctx: OfflineAudioContext,
  delaySend: DelayNode,
  t: number,
  freq: number,
  vel: number,
): void {
  // a single vocal-like stab: bandpassed saw with a quick upward scoop + echo send
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq * 1.45, t);
  osc.frequency.exponentialRampToValueAtTime(freq * 2, t + 0.05);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq * 4;
  bp.Q.value = 4.5;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vel * 0.2, t + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  osc.connect(bp);
  bp.connect(gain);
  gain.connect(ctx.destination);
  gain.connect(delaySend);
  osc.start(t);
  osc.stop(t + 0.22);
}

function scheduleHoover(
  ctx: OfflineAudioContext,
  t: number,
  freq: number,
  vel: number,
  dur: number,
): void {
  // stacked detuned saws through a resonant sweep + soft clip = the frenchcore hoover
  const shaper = ctx.createWaveShaper();
  shaper.curve = distortionCurve(12);
  shaper.oversample = '2x';
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 6;
  filter.frequency.setValueAtTime(700, t);
  filter.frequency.exponentialRampToValueAtTime(2800, t + dur * 0.5);
  filter.frequency.exponentialRampToValueAtTime(800, t + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vel * 0.22, t + 0.01);
  gain.gain.setValueAtTime(vel * 0.22, t + dur * 0.85);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  filter.connect(shaper);
  shaper.connect(gain);
  gain.connect(ctx.destination);
  for (const detune of [-12, -5, 0, 7, 12]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value = detune;
    osc.connect(filter);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
}

function scheduleArp(
  ctx: OfflineAudioContext,
  t: number,
  freq: number,
  vel: number,
  dur: number,
): void {
  // bright plucky triangle+saw blend with a quick decay — mentale hypnotic arp
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 4;
  filter.frequency.setValueAtTime(4200, t);
  filter.frequency.exponentialRampToValueAtTime(900, t + dur * 0.9);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vel * 0.2, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.95);
  filter.connect(gain);
  gain.connect(ctx.destination);
  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.value = freq;
  saw.connect(filter);
  saw.start(t);
  saw.stop(t + dur + 0.02);
  const tri = ctx.createOscillator();
  tri.type = 'triangle';
  tri.frequency.value = freq * 2;
  tri.detune.value = 4;
  tri.connect(filter);
  tri.start(t);
  tri.stop(t + dur + 0.02);
}

function schedulePsy(
  ctx: OfflineAudioContext,
  t: number,
  freq: number,
  vel: number,
  dur: number,
): void {
  // high-resonance winding square — squelchy, twisting psy lead
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = freq;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 18;
  filter.frequency.setValueAtTime(400 + vel * 1800, t);
  filter.frequency.exponentialRampToValueAtTime(380, t + dur * 0.9);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vel * 0.18, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
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
