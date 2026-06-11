import { describe, it, expect } from 'vitest';
import { createRave, tickRave, clippingAmount } from '../src/core/rave';
import { newGame } from '../src/core/save';
import { getSpot } from '../src/core/data';
import type { Controls, GameState, RaveEvent, RaveState } from '../src/core/types';

const DT = 0.1;

function run(
  rave: RaveState,
  controls: Controls,
  seconds: number,
  buzz = 0,
  rep = 0,
): RaveEvent[] {
  const events: RaveEvent[] = [];
  for (let t = 0; t < seconds && !rave.ended; t += DT) {
    events.push(...tickRave(rave, controls, DT, buzz, rep));
  }
  return events;
}

function freshState(): GameState {
  return newGame();
}

describe('crowd', () => {
  it('grows with strong sound and stays near zero with faders down', () => {
    const loud = createRave(freshState(), 'champ', 'hardtek', 1);
    run(loud, { volume: 0.5, bass: 0.45, power: 0.8 }, 60);
    expect(loud.crowd).toBeGreaterThan(10);

    const silent = createRave(freshState(), 'champ', 'hardtek', 1);
    run(silent, { volume: 0, bass: 0, power: 0.5 }, 60);
    expect(silent.crowd).toBeLessThan(1);
  });

  it('never exceeds the spot cap', () => {
    const rave = createRave(freshState(), 'champ', 'hardtek', 2);
    run(rave, { volume: 0.55, bass: 0.5, power: 1 }, 180, 1.5, 500);
    expect(rave.crowd).toBeLessThanOrEqual(getSpot('champ').cap);
  });
});

describe('heat', () => {
  it('busts the night when riding max volume in the hangar', () => {
    const state = freshState();
    state.gear = { amps: 3, subs: 3, gen: 3 };
    const rave = createRave(state, 'hangar', 'hardtek', 3);
    const events = run(rave, { volume: 1, bass: 0.8, power: 1 }, 420);
    expect(events.some((e) => e.type === 'bust')).toBe(true);
    expect(rave.busted).toBe(true);
    expect(rave.ended).toBe(true);
  });

  it('decays when easing off below the threshold', () => {
    const rave = createRave(freshState(), 'champ', 'hardtek', 4);
    rave.heat = 0.5;
    run(rave, { volume: 0.2, bass: 0.1, power: 0.5 }, 30);
    expect(rave.heat).toBeLessThan(0.5);
  });
});

describe('power budget', () => {
  it('emits a brownout when demand exceeds supply and crowd drops faster', () => {
    const rave = createRave(freshState(), 'champ', 'hardtek', 5);
    run(rave, { volume: 0.5, bass: 0.4, power: 0.9 }, 60);
    const crowdBefore = rave.crowd;
    // slam everything with the generator idling: demand 1.4 >> supply ~0.08
    const events = run(rave, { volume: 1, bass: 1, power: 0.1 }, 3);
    expect(events.some((e) => e.type === 'brownout')).toBe(true);
    expect(rave.crowd).toBeLessThan(crowdBefore);
  });

  it('applies the carriere poor-power quirk to generator capacity', () => {
    const state = freshState();
    state.rep = 100;
    const carriere = createRave(state, 'carriere', 'hardtek', 6);
    const champ = createRave(state, 'champ', 'hardtek', 6);
    expect(carriere.genCapacity).toBeCloseTo(champ.genCapacity * 0.6, 5);
  });
});

describe('gear damage', () => {
  it('blows the amp when pushed past headroom and degrades output after', () => {
    const rave = createRave(freshState(), 'champ', 'hardtek', 7);
    // build a crowd within headroom first
    run(rave, { volume: 0.5, bass: 0.4, power: 0.9 }, 60);
    // then redline the volume way past tier-0 headroom (0.55)
    const events = run(rave, { volume: 1, bass: 0.3, power: 1 }, 60);
    expect(events.some((e) => e.type === 'blown-amp')).toBe(true);
    expect(rave.ampBlown).toBe(true);
  });

  it('reports clipping past amp headroom', () => {
    const rave = createRave(freshState(), 'champ', 'hardtek', 8);
    expect(clippingAmount(rave, { volume: 0.5, bass: 0, power: 1 })).toBe(0);
    expect(clippingAmount(rave, { volume: 1, bass: 0, power: 1 })).toBeGreaterThan(0.5);
  });
});

describe('economy & clock', () => {
  it('banks bar drip proportional to the crowd', () => {
    const rave = createRave(freshState(), 'champ', 'hardtek', 9);
    run(rave, { volume: 0.5, bass: 0.45, power: 0.9 }, 120);
    expect(rave.bank).toBeGreaterThan(0);
    const bankBefore = rave.bank;
    const crowd = rave.crowd;
    run(rave, { volume: 0.5, bass: 0.45, power: 0.9 }, 10);
    // ~crowd * 0.05 €/s over 10s, allow slack for crowd drift
    expect(rave.bank - bankBefore).toBeGreaterThan(crowd * 0.05 * 10 * 0.5);
  });

  it('reaches sunrise at the spot duration', () => {
    const rave = createRave(freshState(), 'champ', 'dub', 10);
    const events = run(rave, { volume: 0.4, bass: 0.4, power: 0.8 }, 200);
    expect(events.some((e) => e.type === 'sunrise')).toBe(true);
    expect(rave.sunrise).toBe(true);
    expect(rave.busted).toBe(false);
    expect(rave.t).toBeGreaterThanOrEqual(getSpot('champ').duration - DT);
  });
});
