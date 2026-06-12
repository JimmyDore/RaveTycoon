import { describe, expect, it } from 'vitest';
import { applyEffects, createNight, dropMontee, startSet, tickNight } from './night';
import { settleNight } from './payout';
import { NIGHT_PHASES, getPhase, phaseAt, phaseAttente } from './phases';
import { newGame } from './save';

describe('les phases de nuit', () => {
  it('couvrent [0,1] sans trou ni chevauchement', () => {
    let prev = 0;
    for (const p of NIGHT_PHASES) {
      expect(p.frac[0]).toBeCloseTo(prev, 5);
      prev = p.frac[1];
    }
    expect(prev).toBe(1);
  });

  it('phaseAt retombe sur la bonne fenêtre (mêmes fractions sur tous les spots)', () => {
    expect(phaseAt(0).id).toBe('ouverture');
    expect(phaseAt(0.19).id).toBe('ouverture');
    expect(phaseAt(0.2).id).toBe('rush');
    expect(phaseAt(0.55).id).toBe('creux');
    expect(phaseAt(0.75).id).toBe('aube');
    expect(phaseAt(1).id).toBe('aube'); // borne haute incluse
    expect(phaseAt(1.2).id).toBe('aube'); // clamp
  });

  it("interpole l'attente linéairement dans chaque fenêtre", () => {
    expect(phaseAttente(0)).toBeCloseTo(0.3, 5);
    expect(phaseAttente(0.1)).toBeCloseTo(0.4, 5); // milieu de l'ouverture 0.3→0.5
    expect(phaseAttente(0.375)).toBeCloseTo(0.65, 5); // milieu du rush 0.5→0.8
    expect(phaseAttente(0.65)).toBeCloseTo(0.625, 5); // milieu du creux 0.8→0.45
    expect(phaseAttente(0.875)).toBeCloseTo(0.7, 5); // milieu de l'aube 0.5→0.9
  });

  it("l'aube paie double, le creux churn et chauffe, le rush remplit", () => {
    expect(getPhase('aube').repMult).toBe(2);
    expect(getPhase('rush').repMult).toBe(1);
    expect(getPhase('creux').churnMult).toBe(1.6);
    expect(getPhase('creux').heatMult).toBe(1.3);
    expect(getPhase('rush').arrivalMult).toBe(1.5);
    expect(getPhase('ouverture').barMult).toBe(0.7);
  });
});

describe('les phases dans la nuit', () => {
  function playing(seed = 7) {
    const state = newGame(42);
    const night = createNight(state, 'champ', ['tonton'], seed);
    startSet(state, night, 'tonton');
    return { state, night };
  }

  it('nightPhase est recalculée depuis t/duration et émet phase-change', () => {
    const { state, night } = playing();
    expect(night.nightPhase).toBe('ouverture');
    night.t = night.duration * 0.3;
    const events = tickNight(state, night, 0.1);
    expect(night.nightPhase).toBe('rush');
    expect(events.some((e) => e.type === 'phase-change')).toBe(true);
  });

  it("la baseline d'attente est celle de la phase (le creux redescend)", () => {
    const { state, night } = playing();
    night.t = night.duration * 0.74; // fin du creux : 0.8→0.45
    tickNight(state, night, 0.1);
    expect(night.attente).toBeLessThan(0.55);
    night.t = night.duration * 0.99; // fin d'aube : →0.9
    tickNight(state, night, 0.1);
    expect(night.attente).toBeGreaterThan(0.8);
  });

  it('les multiplicateurs de phase composent : le rush remplit plus vite que l’ouverture', () => {
    const a = playing(9);
    a.night.crowd = 0;
    tickNight(a.state, a.night, 0.1); // ouverture ×0.7
    const b = playing(9);
    b.night.t = b.night.duration * 0.3; // rush ×1.5
    b.night.crowd = 0;
    tickNight(b.state, b.night, 0.1);
    expect(b.night.crowd).toBeGreaterThan(a.night.crowd);
  });

  it("rep ×2 à l'aube : events, objectifs — et le dernier drop double encore", () => {
    const { state, night } = playing();
    night.t = night.duration * 0.8;
    tickNight(state, night, 0.1); // bascule en aube
    applyEffects(state, night, { rep: 10 });
    expect(night.repBonus).toBe(20);
    // un drop à l'aube crédite de la rep, retenue pour le « dernier drop »
    night.montee = 1;
    night.waveScore = 1;
    night.burnout = 0;
    const before = night.repBonus;
    dropMontee(state, night);
    expect(night.repBonus).toBeGreaterThan(before);
    expect(night.lastAubeDropRep).toBeGreaterThan(0);
    // au règlement, le dernier drop de l'aube compte double encore
    night.setElapsed = night.setLen;
    tickNight(state, night, 0.1);
    if (night.phase === 'transition') {
      startSet(state, night, 'tonton');
      night.setElapsed = night.setLen;
      tickNight(state, night, 0.1);
    }
    const repBonusFinal = night.repBonus;
    const result = settleNight(state, night);
    expect(result.repGained).toBeGreaterThanOrEqual(Math.round(repBonusFinal + night.lastAubeDropRep));
  });
});
