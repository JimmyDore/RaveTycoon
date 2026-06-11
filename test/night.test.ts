import { describe, it, expect } from 'vitest';
import { createNight, startSet, tickNight, resolveEvent, computeSetQuality } from '../src/core/night';
import { newGame } from '../src/core/save';
import { recruitDj } from '../src/core/crew';
import { NIGHT_EVENTS } from '../src/core/events';
import type { GameState, NightState, NightTickEvent } from '../src/core/types';

const DT = 0.1;

/** Tick through the night, auto-starting sets and auto-resolving events. */
function autoPlay(
  state: GameState,
  night: NightState,
  opts: { brief?: 'safe' | 'normal' | 'pousser'; dj?: string; eventChoice?: number; maxSeconds?: number } = {},
): NightTickEvent[] {
  const all: NightTickEvent[] = [];
  const max = (opts.maxSeconds ?? night.duration + 60) / DT;
  for (let i = 0; i < max && night.phase !== 'ended'; i++) {
    if (night.phase === 'transition') {
      startSet(state, night, opts.dj ?? night.presentDjs[0], opts.brief ?? 'normal');
    } else if (night.phase === 'event') {
      resolveEvent(state, night, opts.eventChoice ?? 0);
    } else {
      all.push(...tickNight(state, night, DT));
    }
  }
  return all;
}

describe('set structure', () => {
  it('pauses at transitions and plays the planned number of sets to sunrise', () => {
    const state = newGame();
    const night = createNight(state, 'champ', ['tonton'], 1);
    expect(night.phase).toBe('transition');
    expect(night.setCount).toBe(2);
    const events = autoPlay(state, night);
    expect(night.sunrise).toBe(true);
    expect(night.playedSets).toHaveLength(2);
    expect(events.some((e) => e.type === 'sunrise')).toBe(true);
    expect(events.filter((e) => e.type === 'set-ended')).toHaveLength(1);
  });

  it('does not advance the world while a decision is pending', () => {
    const state = newGame();
    const night = createNight(state, 'champ', ['tonton'], 2);
    expect(tickNight(state, night, 1)).toEqual([]);
    expect(night.t).toBe(0);
  });

  it('refuses a DJ who is not present tonight', () => {
    const state = newGame();
    const night = createNight(state, 'champ', ['tonton'], 3);
    expect(() => startSet(state, night, 'fantome', 'normal')).toThrow();
  });
});

describe('le son c’est le DJ', () => {
  it('initialises night.genreId to the first present DJ’s genre', () => {
    const state = newGame();
    // boblepine (dub) en tête de plateau → la phase transition d’avant-set porte son genre
    const night = createNight(state, 'champ', ['boblepine', 'tonton'], 20);
    expect(night.phase).toBe('transition');
    expect(night.genreId).toBe('dub');
  });

  it('rewrites night.genreId to the playing DJ’s genre on each startSet', () => {
    const state = newGame();
    state.rep = 1000;
    recruitDj(state, 'boblepine');
    const night = createNight(state, 'champ', ['tonton', 'boblepine'], 21);
    expect(night.setCount).toBe(2);

    // set 1 : Tonton → hardtek
    startSet(state, night, 'tonton', 'normal');
    expect(night.genreId).toBe('hardtek');

    // tick jusqu’à la transition entre les deux sets
    let setEnded = false;
    for (let i = 0; i < 5000 && !setEnded && night.phase !== 'ended'; i++) {
      if (night.phase === 'event') resolveEvent(state, night, 0);
      else setEnded = tickNight(state, night, DT).some((e) => e.type === 'set-ended');
    }
    expect(setEnded).toBe(true);
    expect(night.phase).toBe('transition');

    // set 2 : Bob Lépine → dub. Deux DJs différents = deux genreId différents.
    startSet(state, night, 'boblepine', 'normal');
    expect(night.genreId).toBe('dub');
  });
});

describe('set quality', () => {
  it('rewards technique and platines tier', () => {
    const state = newGame();
    state.rep = 1000;
    recruitDj(state, 'fantome');
    const night = createNight(state, 'champ', ['tonton', 'fantome'], 4);
    const weak = computeSetQuality(state, night, 'tonton', 'normal');
    const star = computeSetQuality(state, night, 'fantome', 'normal');
    expect(star).toBeGreaterThan(weak * 1.5);

    state.gear.platines = 3;
    expect(computeSetQuality(state, night, 'tonton', 'normal')).toBeGreaterThan(weak);
  });

  it('punishes exhaustion', () => {
    const state = newGame();
    const night = createNight(state, 'champ', ['tonton'], 5);
    const fresh = computeSetQuality(state, night, 'tonton', 'normal');
    state.crew[0].fatigue = 1;
    expect(computeSetQuality(state, night, 'tonton', 'normal')).toBeLessThan(fresh);
  });

  it('grows the crowd more with a better set', () => {
    const good = newGame();
    good.rep = 1000;
    recruitDj(good, 'sirene');
    const nightGood = createNight(good, 'champ', ['sirene'], 6);
    autoPlay(good, nightGood, { dj: 'sirene' });

    const meh = newGame();
    const nightMeh = createNight(meh, 'champ', ['tonton'], 6);
    autoPlay(meh, nightMeh);

    expect(nightGood.peakCrowd).toBeGreaterThan(nightMeh.peakCrowd);
  });
});

describe('heat & busts', () => {
  it('busts a pushed night in the hangar with a hot DJ', () => {
    const state = newGame();
    state.rep = 1000;
    recruitDj(state, 'kilowatt');
    const night = createNight(state, 'hangar', ['kilowatt'], 7);
    const events = autoPlay(state, night, { dj: 'kilowatt', brief: 'pousser', eventChoice: 1 });
    expect(night.busted).toBe(true);
    expect(events.some((e) => e.type === 'bust')).toBe(true);
  });

  it('survives the same spot when playing it safe with a discreet DJ', () => {
    const state = newGame();
    state.rep = 1000;
    recruitDj(state, 'notaire');
    state.gear.logistique = 2;
    const night = createNight(state, 'hangar', ['notaire'], 8);
    autoPlay(state, night, { dj: 'notaire', brief: 'safe', eventChoice: 0 });
    expect(night.busted).toBe(false);
    expect(night.sunrise).toBe(true);
  });
});

describe('gear in the sim', () => {
  it('mur de son tier raises the crowd cap', () => {
    const small = newGame();
    const big = newGame();
    big.gear.mur = 3;
    expect(createNight(big, 'champ', ['tonton'], 9).cap).toBeGreaterThan(
      createNight(small, 'champ', ['tonton'], 9).cap,
    );
  });

  it('weak generator brownouts when the crowd grows (carriere quirk worsens it)', () => {
    const state = newGame();
    state.rep = 1000;
    state.buzz = 1.5;
    recruitDj(state, 'sirene');
    const night = createNight(state, 'carriere', ['sirene'], 10);
    const events = autoPlay(state, night, { dj: 'sirene', brief: 'pousser', maxSeconds: 400 });
    expect(events.some((e) => e.type === 'brownout')).toBe(true);
  });

  it('pushing the sound can blow the mur de son', () => {
    const state = newGame();
    state.damaged.mur = true; // fragile speakers blow faster
    const night = createNight(state, 'foret', ['tonton'], 11);
    const events = autoPlay(state, night, { brief: 'pousser', maxSeconds: 300 });
    expect(events.some((e) => e.type === 'mur-blown') || night.murBlown).toBe(true);
  });
});

describe('events', () => {
  it('fires at least one decision popup on a full night and pauses for it', () => {
    const state = newGame();
    const night = createNight(state, 'foret', ['tonton'], 12);
    let sawEvent = false;
    for (let i = 0; i < 5000 && night.phase !== 'ended'; i++) {
      if (night.phase === 'transition') startSet(state, night, 'tonton', 'normal');
      else if (night.phase === 'event') {
        sawEvent = true;
        expect(night.pendingEvent).not.toBeNull();
        const before = night.t;
        tickNight(state, night, 1);
        expect(night.t).toBe(before); // world paused
        resolveEvent(state, night, 0);
      } else tickNight(state, night, DT);
    }
    expect(sawEvent).toBe(true);
  });

  it('applies option effects', () => {
    const state = newGame();
    const night = createNight(state, 'champ', ['tonton'], 13);
    startSet(state, night, 'tonton', 'normal');
    night.heat = 0.5;
    night.pendingEvent = { def: NIGHT_EVENTS.find((e) => e.id === 'patrouille')! };
    night.phase = 'event';
    const option = resolveEvent(state, night, 0);
    expect(option.effects.heat).toBeLessThan(0);
    expect(night.heat).toBeCloseTo(0.38, 5);
    expect(night.brief).toBe('safe');
    expect(night.phase).toBe('playing');
  });

  it('never fires the same event twice in a night', () => {
    const state = newGame();
    const night = createNight(state, 'teknival', ['tonton'], 14);
    state.rep = 1000;
    const fired: string[] = [];
    for (let i = 0; i < 8000 && night.phase !== 'ended'; i++) {
      if (night.phase === 'transition') startSet(state, night, 'tonton', 'normal');
      else if (night.phase === 'event') {
        fired.push(night.pendingEvent!.def.id);
        resolveEvent(state, night, 0);
      } else tickNight(state, night, DT);
    }
    expect(new Set(fired).size).toBe(fired.length);
  });
});

describe('crew toll', () => {
  it('fatigues the DJ and grants xp after each set', () => {
    const state = newGame();
    const night = createNight(state, 'champ', ['tonton'], 15);
    autoPlay(state, night);
    expect(state.crew[0].fatigue).toBeGreaterThan(0.3); // played both sets
    expect(state.crew[0].xp).toBeGreaterThan(0);
    expect(state.crew[0].setsPlayed).toBe(2);
  });
});

describe('economy during the night', () => {
  it('banks bar drip proportional to the crowd', () => {
    const state = newGame();
    const night = createNight(state, 'champ', ['tonton'], 16);
    autoPlay(state, night);
    expect(night.bank).toBeGreaterThan(0);
  });
});
