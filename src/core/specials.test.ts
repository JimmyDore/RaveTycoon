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
  teufPriveeCash,
} from './specials';
import { getDj, getSpot } from './data';
import { newGame } from './save';
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
