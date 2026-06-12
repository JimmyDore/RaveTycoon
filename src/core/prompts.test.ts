import { describe, expect, it } from 'vitest';
import { createNight, resolveEvent, seizeFloorPrompt, startSet, tickNight } from './night';
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

function playingNight() {
  const state = newGame(42);
  const night = createNight(state, 'champ', ['tonton'], 7);
  startSet(state, night, 'tonton');
  return { state, night };
}

describe('flash-prompts du dancefloor', () => {
  it('un prompt surgit après l’espacement', () => {
    const { state, night } = playingNight();
    expect(night.floorPrompt).toBeNull();
    tickFor(state, night, night.nextPromptAt + 1);
    expect(night.floorPrompt).not.toBeNull();
  });

  it('expire après sa fenêtre et applique le lapse éventuel', () => {
    const { state, night } = playingNight();
    // force un prompt « désamorçage » avec un lapse de coupure son
    night.nextPromptAt = night.t;
    let guard = 0;
    while (!night.floorPrompt && guard++ < 600) tickFor(state, night, 0.1);
    const prompt = night.floorPrompt!;
    const hadLapse = prompt.def.lapse?.soundCut !== undefined;
    // attendre la fin de la fenêtre + une marge
    tickFor(state, night, prompt.def.window + 1);
    expect(night.floorPrompt).toBeNull();
    if (hadLapse) expect(night.soundCutT).toBeGreaterThan(0);
  });

  it('seizeFloorPrompt applique le seize et nettoie le prompt', () => {
    const { state, night } = playingNight();
    night.nextPromptAt = night.t;
    let guard = 0;
    while (!night.floorPrompt && guard++ < 600) tickFor(state, night, 0.1);
    expect(night.floorPrompt).not.toBeNull();
    const def = seizeFloorPrompt(state, night);
    expect(def).not.toBeNull();
    expect(night.floorPrompt).toBeNull();
    expect(night.nextPromptAt).toBeGreaterThan(night.t);
  });

  it('seize charge la montée quand le prompt l’apporte', () => {
    const { state, night } = playingNight();
    night.floorPrompt = {
      def: {
        id: 'test-rappel',
        icon: '🙌',
        label: 'test',
        window: 4,
        seize: { montee: 0.2 },
        weight: () => 1,
      },
      expiresAt: night.t + 4,
    };
    const before = night.montee;
    seizeFloorPrompt(state, night);
    expect(night.montee).toBeGreaterThan(before);
  });

  it('aucun spawn quand la phase est event', () => {
    const { state, night } = playingNight();
    night.phase = 'event';
    night.nextPromptAt = night.t;
    tickNight(state, night, 0.1); // tick ne fait rien hors playing
    expect(night.floorPrompt).toBeNull();
  });
});
