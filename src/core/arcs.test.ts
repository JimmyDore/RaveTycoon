import { describe, expect, it } from 'vitest';
import { getArc, plantArc, settleArcs, tempHeatBuildMult, tempStartHeat } from './arcs';
import { applyEffects, createNight, resolveEvent, startSet, tickNight } from './night';
import { settleNight } from './payout';
import { newGame } from './save';
import { computeLegende } from './tour';
import type { GameState, NightState } from './types';

function playing(seed = 7): { state: GameState; night: NightState } {
  const state = newGame(42);
  const night = createNight(state, 'champ', ['tonton'], seed);
  startSet(state, night, 'tonton');
  return { state, night };
}

function settled(state: GameState, seed = 8): void {
  const night = createNight(state, 'champ', ['tonton'], seed);
  startSet(state, night, 'tonton');
  Object.assign(night, { phase: 'ended', sunrise: true, t: 180, bank: 0, vibeSamples: 1 });
  settleNight(state, night);
}

describe('le moteur des arcs', () => {
  it('le pool contient le flic corrompu, 2 stages, délais 2–3 nuits', () => {
    const flic = getArc('flic-corrompu');
    expect(flic.stages).toHaveLength(2);
    expect(flic.stages[0].delay).toEqual([2, 3]);
    expect(flic.stages[1].delay).toEqual([2, 3]);
    expect(() => getArc('inconnu')).toThrow();
  });

  it('plantArc tire le délai dans la fenêtre du stage et refuse les doublons', () => {
    const state = newGame(42);
    expect(plantArc(state, 'flic-corrompu', 0, () => 0)).toBe(true);
    expect(state.pendingArcs).toEqual([{ arcId: 'flic-corrompu', stage: 0, nightsLeft: 2 }]);
    expect(plantArc(state, 'flic-corrompu', 0, () => 0)).toBe(false); // déjà en cours
    const late = newGame(42);
    plantArc(late, 'flic-corrompu', 0, () => 0.99);
    expect(late.pendingArcs[0].nightsLeft).toBe(3);
    const done = newGame(42);
    done.arcsCompleted = ['flic-corrompu'];
    expect(plantArc(done, 'flic-corrompu', 0, () => 0)).toBe(false); // un arc fini ne revient pas
  });

  it('plantsArc sur EventEffects passe par applyEffects, à la chance du RNG de nuit', () => {
    const { state, night } = playing();
    night.rng = () => 0.9;
    applyEffects(state, night, { plantsArc: { arcId: 'flic-corrompu', chance: 0.5 } });
    expect(state.pendingArcs).toHaveLength(0); // 0.9 ≥ 0.5 : raté
    night.rng = () => 0.1;
    applyEffects(state, night, { plantsArc: { arcId: 'flic-corrompu', chance: 0.5 } });
    expect(state.pendingArcs).toHaveLength(1);
  });

  it('settleArcs décompte les échéances et plante le flic depuis la négo réussie', () => {
    const { state, night } = playing();
    state.pendingArcs = [{ arcId: 'flic-corrompu', stage: 1, nightsLeft: 2 }];
    night.negoCorruption = true; // posé par raidNegocier (partie 1)
    night.rng = () => 0; // délai minimal pour le plant
    settleArcs(state, night);
    expect(state.pendingArcs.find((a) => a.stage === 1)?.nightsLeft).toBe(1);
    // negoCorruption ne replante pas : stage 1 déjà en cours pour cet arc
    expect(state.pendingArcs).toHaveLength(1);
    const fresh = playing(9);
    fresh.night.negoCorruption = true;
    fresh.night.rng = () => 0;
    settleArcs(fresh.state, fresh.night);
    expect(fresh.state.pendingArcs).toEqual([{ arcId: 'flic-corrompu', stage: 0, nightsLeft: 2 }]);
  });

  it("l'échéance à 0 est injectée en priorité comme premier event modal", () => {
    const { state, night } = playing();
    state.pendingArcs = [{ arcId: 'flic-corrompu', stage: 0, nightsLeft: 0 }];
    night.setElapsed = 9; // dans la fenêtre d'event (> 8 s)
    night.nextEventAt = 9999; // le tirage aléatoire ne doit PAS passer devant
    tickNight(state, night, 0.1);
    expect(night.phase).toBe('event');
    expect(night.pendingEvent?.def.id).toBe('flic-stage-0');
    expect(night.pendingEvent?.arc).toEqual({ arcId: 'flic-corrompu', stage: 0 });
    expect(state.pendingArcs).toHaveLength(0); // consommé
    expect(night.eventsFired).toHaveLength(0); // hors quota maxEvents
  });

  it('payer le flic chaîne le stage 2 ; le forfait efface le casier et complète l’arc', () => {
    const { state, night } = playing();
    state.casier = 3;
    state.pendingArcs = [{ arcId: 'flic-corrompu', stage: 0, nightsLeft: 0 }];
    night.setElapsed = 9;
    night.nextEventAt = 9999;
    night.bank = 1000;
    night.heat = 0.5;
    night.rng = () => 0;
    tickNight(state, night, 0.1);
    resolveEvent(state, night, 0); // « Payer le double » : heat ×0.6, plante le stage 2
    expect(night.heat).toBeCloseTo(0.3, 2); // précision 2 : le tick a ajouté ~2e-5 de heatBuild
    expect(night.bank).toBe(700);
    expect(state.pendingArcs).toEqual([{ arcId: 'flic-corrompu', stage: 1, nightsLeft: 2 }]);
    // l'échéance du stage 2 arrive : le forfait
    state.pendingArcs[0].nightsLeft = 0;
    const n2 = createNight(state, 'champ', ['tonton'], 11);
    startSet(state, n2, 'tonton');
    n2.setElapsed = 9;
    n2.nextEventAt = 9999;
    n2.bank = 1000;
    tickNight(state, n2, 0.1);
    expect(n2.pendingEvent?.def.id).toBe('flic-stage-1');
    resolveEvent(state, n2, 0); // « Le forfait » : −800 €, casier effacé, heat −20 % ×5 nuits
    expect(n2.bank).toBe(200);
    expect(state.casier).toBe(0);
    expect(state.tempEffects).toEqual([{ heatBuildMult: 0.8, nightsLeft: 5 }]);
    expect(state.arcsCompleted).toEqual(['flic-corrompu']);
  });

  it('refuser au stage 1 clôt sans compléter : heat +0.15, pas de ⭐', () => {
    const { state, night } = playing();
    state.pendingArcs = [{ arcId: 'flic-corrompu', stage: 0, nightsLeft: 0 }];
    night.setElapsed = 9;
    night.nextEventAt = 9999;
    night.heat = 0.2;
    tickNight(state, night, 0.1);
    resolveEvent(state, night, 1); // « Refuser tout net »
    expect(night.heat).toBeCloseTo(0.35, 2); // précision 2 : le tick a ajouté ~2e-5 de heatBuild
    expect(state.pendingArcs).toHaveLength(0);
    expect(state.arcsCompleted).toHaveLength(0);
  });

  it('tempEffects module la montée de heat et expire au fil des règlements', () => {
    const state = newGame(42);
    state.tempEffects = [{ heatBuildMult: 0.8, nightsLeft: 2 }, { startHeatAdd: 0.1, nightsLeft: 1 }];
    expect(tempHeatBuildMult(state)).toBeCloseTo(0.8, 5);
    expect(tempStartHeat(state)).toBeCloseTo(0.1, 5);
    // la montée de heat est bien ×0.8 sur un tick
    const slow = createNight(state, 'champ', ['tonton'], 7);
    startSet(state, slow, 'tonton');
    expect(slow.heat).toBeCloseTo(0.1, 5); // startHeatAdd au lancement (champ : 0 sinon)
    settled(state);
    expect(state.tempEffects).toEqual([{ heatBuildMult: 0.8, nightsLeft: 1 }]); // l'autre a expiré
    settled(state, 9);
    expect(state.tempEffects).toEqual([]);
  });

  it('computeLegende : +1 par arc mené à terme (rewire fait)', () => {
    const state = newGame(42);
    state.rep = 100; // floor(100/100) = 1
    expect(computeLegende(state)).toBe(1);
    state.arcsCompleted = ['flic-corrompu', 'fermier'];
    expect(computeLegende(state)).toBe(3);
  });
});
