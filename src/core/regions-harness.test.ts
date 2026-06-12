import { describe, expect, it } from 'vitest';
import { createNight, resolveEvent, startSet, tickNight } from './night';
import { isSpotAvailable, settleNight } from './payout';
import { legendeMultiplier, regionTraits } from './regions';
import { newGame } from './save';
import type { Brief, GameState, NightResult, SpotId } from './types';

/** Joue une nuit complète avec tonton, en prenant toujours l'option 0 des events. */
function playNight(state: GameState, spot: SpotId, brief: Brief, seed: number): NightResult {
  const night = createNight(state, spot, ['tonton'], seed);
  for (let guard = 0; guard < 100_000 && night.phase !== 'ended'; guard++) {
    if (night.phase === 'transition') startSet(state, night, 'tonton', brief);
    if (night.phase === 'event') resolveEvent(state, night, 0);
    tickNight(state, night, 0.1);
  }
  expect(night.phase).toBe('ended');
  expect(night.sunrise).toBe(true); // l'archétype joué prudemment ne doit jamais bust
  return settleNight(state, night);
}

describe('harness : une tournée sous régions types', () => {
  it('région dure (Zone quadrillée + Préfet zélé, ⭐ ×1.75) : 4 nuits prudentes au champ', () => {
    const state = newGame(42);
    state.region = { nom: 'La Vallée grise', traits: ['zone-quadrillee', 'prefet-zele'] };
    expect(legendeMultiplier(regionTraits(state.region))).toBeCloseTo(1.75, 5);
    for (let n = 0; n < 4; n++) {
      const before = state.cash;
      playNight(state, 'champ', 'safe', 100 + n);
      expect(state.cash).toBeGreaterThanOrEqual(before); // jouer ne perd jamais d'argent
    }
    expect(state.rep).toBeGreaterThan(0);
  });

  it('région de caractère (Terre de dub + Terre d’accueil, ⭐ ×1.0) : 4 nuits normales', () => {
    const state = newGame(42);
    state.region = { nom: 'La Lande sauvage', traits: ['terre-de-dub', 'terre-daccueil'] };
    expect(legendeMultiplier(regionTraits(state.region))).toBe(1);
    for (let n = 0; n < 4; n++) playNight(state, 'champ', 'normal', 200 + n);
    expect(state.cash).toBeGreaterThan(0);
    expect(state.rep).toBeGreaterThan(0);
  });

  it('Terre de béton + Économie morose : le champ est interdit, la carrière sauve la tournée', () => {
    const state = newGame(42);
    state.region = { nom: 'Le Plateau noir', traits: ['terre-de-beton', 'economie-morose'] };
    expect(isSpotAvailable(state, 'champ')).toBe(false);
    expect(isSpotAvailable(state, 'foret')).toBe(false);
    expect(isSpotAvailable(state, 'carriere')).toBe(true); // no-softlock à rep 0
    for (let n = 0; n < 3; n++) playNight(state, 'carriere', 'safe', 300 + n);
    expect(state.cash).toBeGreaterThan(0);
  });
});
