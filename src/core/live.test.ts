import { describe, expect, it } from 'vitest';
import { BRIEF_LOCK, MONTEE_MIN_DROP, changeBrief, createNight, dropMontee, resolveEvent, startSet, tickNight } from './night';
import { newGame } from './save';

/** Tick the sim n seconds, auto-resolving any random event so the clock keeps moving. */
function tickFor(state: ReturnType<typeof newGame>, night: ReturnType<typeof createNight>, seconds: number) {
  for (let t = 0; t < seconds; t += 0.1) {
    if (night.phase === 'event') resolveEvent(state, night, 0);
    tickNight(state, night, 0.1);
  }
}

function playingNight() {
  const state = newGame(42);
  const night = createNight(state, 'champ', ['tonton'], 7);
  startSet(state, night, 'tonton', 'normal');
  return { state, night };
}

describe('live brief changes', () => {
  it('changes the brief and recomputes quality, then locks', () => {
    const { state, night } = playingNight();
    const q0 = night.setQuality;
    expect(changeBrief(state, night, 'pousser')).toBe(true);
    expect(night.brief).toBe('pousser');
    expect(night.setQuality).toBeGreaterThan(q0);
    expect(changeBrief(state, night, 'safe')).toBe(false); // locked
  });

  it('unlocks after BRIEF_LOCK seconds of play', () => {
    const { state, night } = playingNight();
    changeBrief(state, night, 'pousser');
    tickFor(state, night, BRIEF_LOCK + 1);
    expect(changeBrief(state, night, 'safe')).toBe(true);
  });

  it('refuses outside the playing phase', () => {
    const state = newGame(42);
    const night = createNight(state, 'champ', ['tonton'], 7);
    expect(changeBrief(state, night, 'pousser')).toBe(false); // transition phase
  });
});

describe('la montée', () => {
  it('se charge dans le temps en jouant', () => {
    const { state, night } = playingNight();
    expect(night.montee).toBe(0);
    tickFor(state, night, 20); // auto-resolves events; reste dans le set de 90s
    expect(night.montee).toBeGreaterThan(0);
  });

  it('dropMontee boost la vibe et la foule, augmente la heat, et remet montee à 0', () => {
    const { state, night } = playingNight();
    tickFor(state, night, 20); // charge la jauge
    night.crowd = night.cap * 0.5; // de la marge pour booster la foule
    const vibe = night.vibe;
    const heat = night.heat;
    const crowd = night.crowd;
    expect(dropMontee(night)).toBe(true);
    expect(night.vibe).toBeGreaterThan(vibe);
    expect(night.crowd).toBeGreaterThan(crowd);
    expect(night.heat).toBeGreaterThan(heat);
    expect(night.montee).toBe(0);
  });

  it('refuse sous MONTEE_MIN_DROP', () => {
    const { night } = playingNight();
    night.montee = MONTEE_MIN_DROP - 0.01;
    expect(dropMontee(night)).toBe(false);
  });

  it('un brownout draine la jauge', () => {
    const { state, night } = playingNight();
    night.montee = 1;
    night.crowd = night.cap; // surcharge la demande pour forcer le brownout
    night.brief = 'pousser';
    const before = night.montee;
    tickFor(state, night, 1);
    expect(night.montee).toBeLessThan(before);
  });
});
