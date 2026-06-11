import { describe, expect, it } from 'vitest';
import { BRIEF_LOCK, HYPE_COOLDOWN, changeBrief, createNight, dropHype, resolveEvent, startSet, tickNight } from './night';
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
  const night = createNight(state, 'champ', 'hardtek', ['tonton'], 7);
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
    const night = createNight(state, 'champ', 'hardtek', ['tonton'], 7);
    expect(changeBrief(state, night, 'pousser')).toBe(false); // transition phase
  });
});

describe('hype drop', () => {
  it('boosts vibe, costs heat, then cools down', () => {
    const { state, night } = playingNight();
    const vibe = night.vibe;
    const heat = night.heat;
    expect(dropHype(night)).toBe(true);
    expect(night.vibe).toBeGreaterThan(vibe);
    expect(night.heat).toBeGreaterThan(heat);
    expect(dropHype(night)).toBe(false); // cooling down
    tickFor(state, night, HYPE_COOLDOWN + 1); // auto-resolves events; 51s stays within the 90s set
    expect(dropHype(night)).toBe(true);
  });
});
