import { describe, expect, it } from 'vitest';
import { createNight, setIntensity, startSet, tickNight } from './night';
import { descenteCountdown, negoChance, negoCost, raidEvacuer, raidNegocier } from './raid';
import { applyBust, settleNight } from './payout';
import { gardeAVueNights, isEnGardeAVue } from './crew';
import { newGame } from './save';

function playing(seed = 7, spot: Parameters<typeof createNight>[1] = 'champ') {
  const state = newGame(42);
  const night = createNight(state, spot, ['tonton'], seed);
  startSet(state, night, 'tonton');
  return { state, night };
}

describe('la descente : déclenchement', () => {
  it('se déclenche à heat ≥ 0.85 (défaut), une seule fois par nuit', () => {
    const { state, night } = playing();
    night.heat = 0.86;
    const events = tickNight(state, night, 0.1);
    expect(events.some((e) => e.type === 'descente')).toBe(true);
    expect(night.raid?.status).toBe('countdown');
    expect(night.busted).toBe(false); // la teuf continue (non bloquant)
    // pas de second déclenchement
    night.raid!.status = 'done';
    night.raid!.outcome = 'nego-ok';
    night.heat = 0.9;
    expect(tickNight(state, night, 0.1).some((e) => e.type === 'descente')).toBe(false);
  });

  it('le compte à rebours vaut 15 + 5×logTier (plafonné à 3) : 15–30 s', () => {
    const state = newGame(42);
    expect(descenteCountdown(state)).toBe(15);
    state.gear.logistique = 2;
    expect(descenteCountdown(state)).toBe(25);
    state.gear.logistique = 6;
    expect(descenteCountdown(state)).toBe(30);
  });

  it("timer expiré = bust standard — l'indécision coûte", () => {
    const { state, night } = playing();
    night.heat = 0.86;
    tickNight(state, night, 0.1);
    night.t = night.raid!.deadline + 0.1;
    const events = tickNight(state, night, 0.1);
    expect(events.some((e) => e.type === 'bust')).toBe(true);
    expect(night.busted).toBe(true);
    expect(night.raid?.outcome).toBe('bust-timer');
  });
});

describe('évacuer', () => {
  it('termine la nuit proprement : caisse conservée, rep ×0.4, buzz réduit, pas de bust', () => {
    const { state, night } = playing();
    night.heat = 0.86;
    tickNight(state, night, 0.1); // déclenche la descente
    expect(raidEvacuer(state, night)).toBe(true);
    expect(night.phase).toBe('ended');
    expect(night.busted).toBe(false);
    expect(night.evacuated).toBe(true);
    // on fige les stats APRÈS coup pour comparer à l'identique avec un témoin
    Object.assign(night, { t: 100, bank: 200, peakCrowd: 30, vibeSum: 80, vibeSamples: 100 });
    const witness = newGame(42);
    const witnessNight = createNight(witness, 'champ', ['tonton'], 7);
    startSet(witness, witnessNight, 'tonton');
    Object.assign(witnessNight, {
      phase: 'ended', sunrise: true, t: 100, bank: 200, peakCrowd: 30,
      vibeSum: 80, vibeSamples: 100, peakHeat: night.peakHeat,
    });
    const evac = settleNight(state, night);
    const full = settleNight(witness, witnessNight);
    expect(evac.payout).toBe(full.payout); // la caisse de la nuit est conservée
    expect(evac.repGained).toBeLessThan(full.repGained); // rep ×0.4
    expect(state.busts).toBe(0);
  });
});

describe('négocier', () => {
  it('coûte 50 + 2×crowd, pris sur la banque ; refuse si la banque ne suit pas', () => {
    const { state, night } = playing();
    night.heat = 0.86;
    night.crowd = 25;
    tickNight(state, night, 0.1);
    expect(negoCost(night)).toBe(50 + 2 * 25);
    night.bank = 10;
    expect(raidNegocier(state, night)).toBe(false);
    night.bank = 200;
    night.rng = () => 0; // succès forcé
    expect(raidNegocier(state, night)).toBe(true);
    expect(night.bank).toBe(100);
  });

  it('proba : 0.25 + 0.15×logTier + 0.15 discret + 0.20 si ≤ GROOVE, cap 0.9', () => {
    const { state, night } = playing();
    expect(negoChance(state, night)).toBeCloseTo(0.25 + 0.2, 5); // tonton normal, groove
    setIntensity(night, 'rinse');
    expect(negoChance(state, night)).toBeCloseTo(0.25, 5);
    state.gear.logistique = 6; // plafonné à 3 → +0.45
    expect(negoChance(state, night)).toBeCloseTo(0.7, 5);
  });

  it('succès : heat → 0.45, la nuit continue ; échec : bust immédiat', () => {
    const ok = playing(9);
    ok.night.heat = 0.86;
    ok.night.bank = 500;
    tickNight(ok.state, ok.night, 0.1);
    ok.night.rng = () => 0;
    raidNegocier(ok.state, ok.night);
    expect(ok.night.heat).toBeCloseTo(0.45, 5);
    expect(ok.night.phase).toBe('playing');
    expect(ok.night.raid?.outcome).toBe('nego-ok');

    const ko = playing(9);
    ko.night.heat = 0.86;
    ko.night.bank = 500;
    tickNight(ko.state, ko.night, 0.1);
    ko.night.rng = () => 0.99;
    raidNegocier(ko.state, ko.night);
    expect(ko.night.busted).toBe(true);
    expect(ko.night.raid?.outcome).toBe('nego-rate');
  });
});

describe('conséquences persistantes : casier & garde à vue', () => {
  it('le casier monte à chaque bust, redescend par nuit propre (min 0)', () => {
    const { state, night } = playing();
    Object.assign(night, { phase: 'ended', busted: true, t: 180, bank: 0 });
    applyBust(state, night);
    expect(state.casier).toBe(1);
    const { state: s2 } = playing();
    s2.casier = 2;
    const clean = createNight(s2, 'champ', ['tonton'], 8);
    startSet(s2, clean, 'tonton');
    Object.assign(clean, { phase: 'ended', sunrise: true, t: 180, bank: 0, vibeSamples: 1 });
    settleNight(s2, clean);
    expect(s2.casier).toBe(1);
  });

  it('Préfet zélé : le casier ne décroît pas (casierGele)', () => {
    const state = newGame(42);
    state.region = { nom: 'Test', traits: ['prefet-zele'] };
    state.casier = 2;
    const night = createNight(state, 'champ', ['tonton'], 8);
    startSet(state, night, 'tonton');
    Object.assign(night, { phase: 'ended', sunrise: true, t: 180, bank: 0, vibeSamples: 1 });
    settleNight(state, night);
    expect(state.casier).toBe(2);
  });

  it('le casier chauffe les spots tier ≥ 4 : +0.05 × casier au départ', () => {
    const state = newGame(42);
    state.rep = 1000;
    state.casier = 3;
    expect(createNight(state, 'hangar', ['tonton'], 8).heat).toBeCloseTo(0.1 + 0.15, 5);
    expect(createNight(state, 'champ', ['tonton'], 8).heat).toBe(0); // tier 1 : épargné
  });

  it('la garde à vue décrémente à chaque règlement et bloque la sélection', () => {
    const state = newGame(42);
    state.gardeAVue = { gamine: 2 };
    expect(isEnGardeAVue(state, 'gamine')).toBe(true);
    expect(gardeAVueNights(state, 'gamine')).toBe(2);
    const night = createNight(state, 'champ', ['tonton'], 8);
    startSet(state, night, 'tonton');
    Object.assign(night, { phase: 'ended', sunrise: true, t: 180, bank: 0, vibeSamples: 1 });
    settleNight(state, night);
    expect(gardeAVueNights(state, 'gamine')).toBe(1);
    settleNight(state, Object.assign(createNight(state, 'champ', ['tonton'], 9), {
      phase: 'ended', sunrise: true, t: 180, bank: 0, vibeSamples: 1,
      playedSets: [{ djId: 'tonton' }],
    }));
    expect(isEnGardeAVue(state, 'gamine')).toBe(false);
  });
});
