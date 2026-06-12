import { describe, expect, it } from 'vitest';
import {
  SPECIAL_MIN_REP,
  SPECIAL_NIGHTS,
  SPECIAL_OFFER_P,
  acceptSpecialOffer,
  declineSpecialOffer,
  drawSpecialOffer,
  ensureSpecialOffer,
  getSpecial,
  resolveSoundclash,
  teufPriveeCash,
} from './specials';
import { recruitableDjs, poolCut } from './crew';
import { getDj, getSpot } from './data';
import { createNight, currentWave, dropMontee, setIntensity, startSet, tickNight } from './night';
import { NIGHT_PHASES } from './phases';
import { applyBust, settleNight } from './payout';
import { newGame } from './save';
import type { SpecialOfferState } from './specials';
import type { GameState } from './types';

function readyState(rep = 50): GameState {
  const state = newGame(42);
  state.rep = rep;
  return state;
}

/** Compte les offres tirées sur une fenêtre de nuits (déterministe par compteur). */
function offersOver(state: GameState, nights: number): number {
  let count = 0;
  for (let n = 0; n < nights; n++) {
    state.nights = n;
    if (drawSpecialOffer(state)) count += 1;
  }
  return count;
}

describe('le pool des nuits spéciales', () => {
  it('contient les 4 offres de lancement', () => {
    expect(SPECIAL_NIGHTS.map((s) => s.id)).toEqual([
      'soundclash',
      'teuf-privee',
      'anniversaire',
      'nuit-a-theme',
    ]);
    expect(() => getSpecial('soundclash')).not.toThrow();
    expect(() => getSpecial('inconnue')).toThrow();
  });

  it('anniversaire et nuit à thème portent les chiffres exacts de la spec', () => {
    const anniv = getSpecial('anniversaire');
    expect(anniv.rewards.repMult).toBe(2);
    expect(anniv.rewards.attenteMode).toBe('haute');
    const theme = getSpecial('nuit-a-theme');
    expect(theme.rewards.attenteMode).toBe('puriste');
    expect(theme.rewards.dropPayoffMult).toBeCloseTo(1.4, 5);
    expect(theme.rewards.barMult).toBeCloseTo(1.3, 5);
    const privee = getSpecial('teuf-privee');
    expect(privee.rewards.repMult).toBe(0);
    expect(privee.constraints.maxIntensity).toBe('peak'); // jamais RINSE
    expect(privee.constraints.crowdCap).toBeCloseTo(0.6, 5);
    expect(privee.constraints.noDescente).toBe(true);
  });
});

describe('le tirage', () => {
  it('rien sous rep 12', () => {
    const state = readyState(SPECIAL_MIN_REP - 1);
    expect(offersOver(state, 60)).toBe(0);
  });

  it('p = 0.35 : sur 200 nuits, le compte est dans la fourchette (déterministe)', () => {
    expect(SPECIAL_OFFER_P).toBeCloseTo(0.35, 5);
    const count = offersOver(readyState(), 200);
    expect(count).toBeGreaterThan(200 * 0.25);
    expect(count).toBeLessThan(200 * 0.45);
  });

  it('est déterministe par compteur de nuits (même état → même offre)', () => {
    const a = readyState();
    const b = readyState();
    a.nights = 7;
    b.nights = 7;
    expect(drawSpecialOffer(a)).toEqual(drawSpecialOffer(b));
  });

  it('fêtes votives : le tirage est ×2 plus fréquent (specialNightWeightMult vivant)', () => {
    const base = offersOver(readyState(), 200);
    const votives = readyState();
    votives.region = { nom: 'La Plaine rouge', traits: ['fetes-votives'] };
    const boosted = offersOver(votives, 200);
    expect(boosted).toBeGreaterThan(base * 1.5);
  });

  it('le soundclash ne sort pas avant rep 30 (un rival ne se déplace pas pour rien)', () => {
    const state = readyState(20);
    for (let n = 0; n < 200; n++) {
      state.nights = n;
      expect(drawSpecialOffer(state)?.id).not.toBe('soundclash');
    }
  });

  it('teuf privée : genre tiré dans le crew, spot tiré dans les spots jouables, cash ×3 cap', () => {
    const state = readyState();
    for (let n = 0; n < 200; n++) {
      state.nights = n;
      const offer = drawSpecialOffer(state);
      if (offer?.id !== 'teuf-privee') continue;
      expect(offer.genreId).toBe(getDj('tonton').genre); // seul genre du crew
      expect(offer.spotId).toBeDefined();
      const spot = getSpot(offer.spotId!);
      expect(state.rep).toBeGreaterThanOrEqual(spot.repReq);
      expect(offer.cashUpfront).toBe(teufPriveeCash(spot));
      expect(offer.cashUpfront).toBe(Math.round(3 * spot.cap * spot.priceMult));
      return;
    }
    throw new Error('aucune teuf privée tirée sur 200 nuits — tirage cassé');
  });
});

describe("l'offre persistée", () => {
  it('ensureSpecialOffer fige le tirage pour la nuit courante et re-tire à la suivante', () => {
    const state = readyState();
    state.nights = 3;
    const first = ensureSpecialOffer(state);
    expect(ensureSpecialOffer(state)).toBe(state.specialOffer);
    expect(state.specialOffer).toEqual(first);
    state.nights = 4;
    ensureSpecialOffer(state);
    expect(state.specialOffer?.night ?? 4).toBe(4); // re-tiré (offre ou null)
  });

  it("accepter crédite le cash d'avance, refuser laisse l'offre éteinte", () => {
    const state = readyState();
    state.nights = 3;
    state.specialOffer = {
      id: 'teuf-privee',
      night: 3,
      accepted: false,
      declined: false,
      genreId: 'hardtek',
      spotId: 'champ',
      cashUpfront: 180,
    };
    expect(acceptSpecialOffer(state)).toBe(true);
    expect(state.cash).toBe(180);
    expect(acceptSpecialOffer(state)).toBe(false); // pas deux fois
    const s2 = readyState();
    s2.nights = 3;
    s2.specialOffer = { id: 'anniversaire', night: 3, accepted: false, declined: false };
    expect(declineSpecialOffer(s2)).toBe(true);
    expect(s2.specialOffer?.declined).toBe(true);
    expect(acceptSpecialOffer(s2)).toBe(false); // refusée = morte pour ce soir
  });

  it('une offre périmée (nuit passée) ne s’accepte pas', () => {
    const state = readyState();
    state.nights = 5;
    state.specialOffer = { id: 'anniversaire', night: 3, accepted: false, declined: false };
    expect(acceptSpecialOffer(state)).toBe(false);
  });
});

/** Pose une offre acceptée et lance la nuit dessus. */
function contractNight(offer: Omit<SpecialOfferState, 'night' | 'accepted' | 'declined'>, seed = 7) {
  const state = newGame(42);
  state.rep = 50;
  state.specialOffer = { ...offer, night: state.nights, accepted: true, declined: false };
  const night = createNight(state, offer.spotId ?? 'champ', ['tonton'], seed);
  startSet(state, night, 'tonton');
  return { state, night };
}

describe('le contrat appliqué à la nuit', () => {
  it('la teuf privée plafonne la foule à 60 % et refuse RINSE', () => {
    const { night } = contractNight({ id: 'teuf-privee', genreId: 'hardtek', spotId: 'champ', cashUpfront: 180 });
    expect(night.special?.id).toBe('teuf-privee');
    const witness = createNight(newGame(42), 'champ', ['tonton'], 7);
    expect(night.cap).toBe(Math.round(witness.cap * 0.6));
    expect(setIntensity(night, 'rinse')).toBe(false); // jamais RINSE sous contrat
    expect(setIntensity(night, 'peak')).toBe(true);
  });

  it("une offre refusée ou périmée ne s'applique pas", () => {
    const state = newGame(42);
    state.specialOffer = { id: 'anniversaire', night: 99, accepted: true, declined: false };
    const night = createNight(state, 'champ', ['tonton'], 7);
    expect(night.special).toBeNull();
  });

  it("attenteMode haute : attente +0.15, tolérance −0.05 ; puriste : tolérance −0.08", () => {
    const base = contractNight({ id: 'nuit-a-theme', genreId: 'hardtek' });
    const witnessState = newGame(42);
    const witness = createNight(witnessState, 'champ', ['tonton'], 7);
    startSet(witnessState, witness, 'tonton');
    const w = currentWave(witnessState, witness);
    const puriste = currentWave(base.state, base.night);
    expect(puriste.tol).toBeCloseTo(w.tol - 0.08, 5);
    const haute = contractNight({ id: 'anniversaire' });
    const h = currentWave(haute.state, haute.night);
    expect(h.tol).toBeCloseTo(w.tol - 0.05, 5);
    expect(h.attente).toBeGreaterThan(w.attente); // baseline +0.15 (clampée à 1)
  });

  it('nuit à thème : le drop paie ×1.4, la buvette tourne ×1.3', () => {
    const theme = contractNight({ id: 'nuit-a-theme', genreId: 'hardtek' }, 13);
    const plain = (() => {
      const state = newGame(42);
      state.rep = 50; // même rep que contractNight — l'arrivée dépend de la rep
      const night = createNight(state, 'champ', ['tonton'], 13);
      startSet(state, night, 'tonton');
      return { state, night };
    })();
    for (const { night } of [theme, plain]) {
      Object.assign(night, { montee: 1, burnout: 0, waveScore: 0.5, vibe: 0.3, crowd: 20 });
    }
    dropMontee(theme.state, theme.night);
    dropMontee(plain.state, plain.night);
    expect(theme.night.vibe).toBeGreaterThan(plain.night.vibe);
    // buvette ×1.3 sur un tick identique
    theme.night.bank = 0;
    plain.night.bank = 0;
    theme.night.crowd = 20;
    plain.night.crowd = 20;
    tickNight(theme.state, theme.night, 0.1);
    tickNight(plain.state, plain.night, 0.1);
    expect(theme.night.bank).toBeCloseTo(plain.night.bank * 1.3, 5);
  });

  it('anniversaire : rep ×2 au règlement ; teuf privée : zéro rep', () => {
    const settle = (id: string, genreId?: 'hardtek') => {
      const { state, night } = contractNight({ id, genreId });
      Object.assign(night, { phase: 'ended', sunrise: true, t: 180, bank: 0, peakCrowd: 30, vibeSamples: 1 });
      return { rep: settleNight(state, night).repGained, state };
    };
    const plain = (() => {
      const state = newGame(42);
      const night = createNight(state, 'champ', ['tonton'], 7);
      startSet(state, night, 'tonton');
      Object.assign(night, { phase: 'ended', sunrise: true, t: 180, bank: 0, peakCrowd: 30, vibeSamples: 1 });
      return settleNight(state, night).repGained;
    })();
    expect(settle('anniversaire').rep).toBe(plain * 2);
    expect(settle('teuf-privee', 'hardtek').rep).toBe(0);
  });

  it('le seuil de descente atteint sous noDescente rompt le contrat : remboursement 60 %', () => {
    const { state, night } = contractNight({ id: 'teuf-privee', genreId: 'hardtek', spotId: 'champ', cashUpfront: 180 });
    state.cash = 500;
    night.heat = 0.86;
    const events = tickNight(state, night, 0.1);
    expect(events.some((e) => e.type === 'descente')).toBe(true); // la descente se joue quand même
    expect(night.special?.breached).toBe(true);
    Object.assign(night, { phase: 'ended', sunrise: true, t: 180, bank: 0, vibeSamples: 1 });
    night.raid!.status = 'done';
    night.raid!.outcome = 'nego-ok';
    const result = settleNight(state, night);
    expect(result.contractRefund).toBe(Math.round(180 * 0.6));
    expect(state.cash).toBe(500 - 108);
  });

  it('le bust sous contrat rembourse aussi (la descente a forcément eu lieu)', () => {
    const { state, night } = contractNight({ id: 'teuf-privee', genreId: 'hardtek', spotId: 'champ', cashUpfront: 180 });
    state.cash = 500;
    night.heat = 0.86;
    tickNight(state, night, 0.1);
    Object.assign(night, { phase: 'ended', busted: true, t: 100, bank: 0 });
    const result = applyBust(state, night);
    expect(result.contractRefund).toBe(108);
    expect(result.repGained).toBe(0); // repMult 0 vaut aussi sur le bust
  });
});

describe('le soundclash', () => {
  function clashNight(seed = 7) {
    return contractNight({ id: 'soundclash' }, seed);
  }

  it('tire un rival déterministe par phase, calibré sur le tier du spot', () => {
    const a = clashNight(9);
    const b = clashNight(9);
    expect(a.night.special?.rival).toBeDefined();
    expect(a.night.special?.rival).toEqual(b.night.special?.rival);
    for (const p of NIGHT_PHASES) {
      const r = a.night.special!.rival![p.id];
      expect(r).toBeGreaterThan(0.3); // champ tier 1 : 0.37–0.57
      expect(r).toBeLessThan(0.6);
    }
  });

  it('accumule le score de vague par phase pendant le tick', () => {
    const { state, night } = clashNight();
    night.waveScore = 0.8;
    tickNight(state, night, 0.1);
    expect(night.phaseWaveT.ouverture).toBeCloseTo(0.1, 5);
    expect(night.phaseWaveSum.ouverture).toBeGreaterThan(0);
  });

  it('victoire ≥ 2 phases : rep ×1.5, soundclashWon, Volt rejoint le pool à −30 % de cut', () => {
    const { state, night } = clashNight();
    // 3 phases dominées, 1 perdue — le rival du champ plafonne sous 0.6
    for (const p of NIGHT_PHASES) {
      night.phaseWaveT[p.id] = 10;
      night.phaseWaveSum[p.id] = p.id === 'creux' ? 0 : 9; // moyenne 0.9
    }
    const clash = resolveSoundclash(night);
    expect(clash).toEqual({ phasesWon: 3, won: true });
    Object.assign(night, { phase: 'ended', sunrise: true, t: 180, bank: 0, peakCrowd: 30, vibeSamples: 1 });
    const result = settleNight(state, night);
    expect(result.clashWon).toBe(true);
    expect(result.clashPhasesWon).toBe(3);
    expect(state.soundclashWon).toBe(true);
    // le témoin sans clash gagne 1/1.5 de la rep
    const witnessState = newGame(42);
    const witness = createNight(witnessState, 'champ', ['tonton'], 7);
    startSet(witnessState, witness, 'tonton');
    Object.assign(witness, { phase: 'ended', sunrise: true, t: 180, bank: 0, peakCrowd: 30, vibeSamples: 1 });
    expect(result.repGained).toBe(Math.round(settleNight(witnessState, witness).repGained * 1.5));
    // LE rewire Volt : gated par le clash, seuil mort, cut −30 %
    const volt = recruitableDjs(state).find((d) => d.id === 'volt');
    expect(volt).toBeDefined();
    expect(poolCut(volt!)).toBeCloseTo(0.24 * 0.7, 5);
  });

  it('défaite : buzz ×0.5 après le bouche-à-oreille de la nuit, Volt reste invisible', () => {
    const { state, night } = clashNight();
    state.buzz = 0.8;
    state.rep = 1000; // même à rep max, Volt ne sort pas sans victoire
    // aucune phase jouée : tout au rival
    Object.assign(night, { phase: 'ended', sunrise: true, t: 180, bank: 0, peakCrowd: 30, vibeSamples: 1 });
    const result = settleNight(state, night);
    // témoin sans clash : settleNight AJOUTE du buzz (buzzAfterNight) — la défaite
    // divise le buzz FINAL par 2, pas le buzz de départ
    const witnessState = newGame(42);
    witnessState.buzz = 0.8;
    const witness = createNight(witnessState, 'champ', ['tonton'], 7);
    startSet(witnessState, witness, 'tonton');
    Object.assign(witness, { phase: 'ended', sunrise: true, t: 180, bank: 0, peakCrowd: 30, vibeSamples: 1 });
    settleNight(witnessState, witness);
    expect(result.clashWon).toBe(false);
    expect(state.buzz).toBeCloseTo(witnessState.buzz * 0.5, 5);
    expect(state.soundclashWon).toBe(false);
    expect(recruitableDjs(state).some((d) => d.id === 'volt')).toBe(false);
  });

  it('un bust pendant le clash est une défaite (phases non jouées perdues)', () => {
    const { state, night } = clashNight();
    state.buzz = 0.8;
    Object.assign(night, { phase: 'ended', busted: true, t: 60, bank: 0 });
    const result = applyBust(state, night);
    expect(result.clashWon).toBe(false);
    expect(state.buzz).toBeCloseTo(0.4, 5);
  });
});
