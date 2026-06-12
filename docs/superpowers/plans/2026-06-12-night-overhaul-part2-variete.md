# Refonte de la boucle de nuit — Partie 2 : nuits spéciales, arcs, recâblage final

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Spec**: `docs/superpowers/specs/2026-06-12-night-loop-overhaul-design.md` — stories **D** (nuits spéciales proposées) et **E** (arcs de conséquences), puis le **recâblage final** qui retire tous les marqueurs `RÉVISION CHANTIER 1` restants du code.

**Précondition dure** : la Partie 1 (`docs/superpowers/plans/2026-06-12-night-overhaul-part1-energie.md`, stories A–C) est **entièrement implémentée**. Ce plan se branche sur son registre de symboles (fin du plan partie 1) : `Intensity`/`INTENSITY_LEVEL` (`src/core/intensity.ts`), `currentWave`/`setIntensity`/`dropMontee` (`night.ts`), `NightPhaseId`/`NIGHT_PHASES`/`getPhase` (`phases.ts`), `RaidState`/`negoChance`/`raidEvacuer` (`raid.ts`), `NightState.waveScore/burnout/attente/nightPhase/raid/evacuated/negoCorruption`, `GameState.gardeAVue/casier/mursTenus`, `isEnGardeAVue` (`crew.ts`), `buzzAfterNight(state, quality, mult)` (`idle.ts`), `RegionRules.descenteThreshold/attenteTolBonus/casierGele`. **Aucun de ces symboles n'est redéfini ici — on les importe.**

## Goal

Donner à la nuit sa **variété extérieure** : à la prépa, ~1 nuit sur 3 (dès rep ≥ 12) une **offre de nuit spéciale** apparaît — soundclash contre un rival simulé (victoire = rep ×1.5 + **Volt** rejoint le pool à −30 % de cut), teuf privée payée d'avance sous contrat, anniversaire de la scène (rep ×2, foule exigeante), nuit à thème mono-genre. Et des **arcs de conséquences** plantés par les choix (négociation de descente → flic corrompu ; prompt « un type filme » → journaliste ; bière au voisin → fermier, qui débloque le **Château squatté**), avec échéances en nuits, événements prioritaires injectés et effets temporaires (`tempEffects`). En fin de plan, **plus un seul** `RÉVISION CHANTIER 1` ne survit dans `src/` : lumières voie A → burnout de foule ralenti, logistique voie A → bonus de négo, logistique voie B → évacuation sans malus de rep, Volt → soundclash, château → arc fermier, légende → arcs terminés, fêtes votives → tirage des nuits spéciales ×2.

## Architecture

Inchangée : logique pure et testée dans `src/core/`, UI fine dans `src/ui/screens.ts` + boucle dans `src/main.ts`, decks data-driven, strings dans `src/ui/strings.ts`. Harnais déterministes (`src/core/progression.test.ts`, `src/core/regions-harness.test.ts`) verts après chaque tâche — ou la tâche dit exactement quel pin bouge et pourquoi (procédure de re-pin de la partie 1 : on lance, on lit la valeur réelle dans le diff vitest, on épingle la valeur **mesurée** avec commentaire).

Nouveaux modules :

- `src/core/specials.ts` — `SpecialNightDef`, le pool des 4 nuits spéciales, le tirage déterministe (`drawSpecialOffer`, graine = compteur de nuits), l'état persisté (`SpecialOfferState`), l'application au contrat de nuit (`ActiveSpecial`), la résolution du soundclash. **Cycle d'import assumé `specials ↔ payout`** (specials appelle `isSpotAvailable` au tirage, payout appelle `resolveSoundclash`/`BREACH_REFUND` au règlement) : comme le cycle `night ↔ raid` de la partie 1, tous les accès croisés sont à l'exécution, jamais à l'init de module — pattern sûr en ESM/vite/vitest.
- `src/core/arcs.ts` — `ArcDef`/`ArcStageDef`, le pool des 3 arcs, `plantArc`/`settleArcs`/`takeDueArc`, les `tempEffects`. Importe `types` seulement (module quasi-feuille) ; `night.ts` et `payout.ts` l'appellent.

Décisions tranchées (mandatées par le prompt, justifiées ici) :

1. **`plantsArc` vit sur `EventEffects`, pas sur `EventOption`.** La spec le met sur l'option, mais le journaliste est planté par le **prompt** « un type filme » (`FloorPromptDef.seize` est un `EventEffects`) — porter le champ par `EventEffects` couvre les deux chemins via `applyEffects`, un seul mécanisme. Les options d'events l'utilisent à travers leurs `effects`.
2. **`tempEffects` a deux leviers de heat**, `{ heatBuildMult?, startHeatAdd?, nightsLeft }` : la spec n'en nomme qu'un (`heatBase`) mais ses arcs en exigent deux sémantiques — « heat de base −20 % pendant 5 nuits » (flic, un **multiplicateur de montée**) et « heat de départ +0.1 sur les 3 prochaines nuits » (journaliste, un **flat au lancement**). Un seul champ ne peut pas servir les deux.
3. **Cash d'avance de la teuf privée = `3 × cap × priceMult` du spot imposé** (l'échelle de la caution, ~180 € au champ, ~1 200 € au hangar). « ×3 le potentiel du spot » lu comme le potentiel-jauge : ×3 de `potentialBar` imprimerait 30 000 € au hangar et casserait l'économie du chantier 2.
4. **`noDescente` ne court-circuite pas `startDescente`** : les bleus se moquent du contrat. Atteindre le seuil de descente sous contrat **rompt le contrat** (flag `breached`, remboursement de 60 % au règlement) et la séquence de descente se joue normalement. C'est la lecture littérale de la spec (« pas de descente déclenchée » est une clause, pas une immunité).
5. **Rupture de contrat possible uniquement par la descente** : le genre est verrouillé à la prépa et `setIntensity` refuse les crans au-dessus de `maxIntensity` (RINSE impossible sous contrat) — il ne reste aucun autre chemin de rupture.
6. **Volt garde `repReq: 420` dans `DJS`** (le test `data.test.ts` épingle l'ordre croissant des `repReq`), mais ce seuil devient **mort** : `gated: 'soundclash'` le cache du pool tant que `state.soundclashWon` est faux, et une fois le clash gagné son seuil effectif est **0** (`djRepThreshold`) — il rejoint le crew qui l'a battu, à −30 % de cut (`poolCut`).
7. **La complétion d'arc est explicite** (`EventEffects.arcComplete: arcId`) : refuser le flic au stage 1 clôt l'arc sans le « mener à terme » (pas de ⭐), résoudre le stage final le complète. `state.arcsCompleted` nourrit `computeLegende` **et** le déblocage du château (`SpotDef.requiresArc`).

## Tech Stack

TypeScript strict + Vite, vanilla DOM (zéro framework), vitest. UI **tap-only**. `npm run test && npm run build` vert après **chaque** tâche. Les graines des tirages sont dérivées de compteurs persistés (`state.nights`) ou du seed de nuit — tout est rejouable au test.

---

### Task 1: specials.ts — le pool, le tirage déterministe, l'offre persistée

Le module, les 4 defs avec les chiffres exacts de la spec, le tirage `p = 0.35 × specialNightWeightMult` dès rep ≥ 12, seedé par le compteur de nuits (déterministe, stable au re-render de la prépa), l'état persisté sur `GameState`. Le trait régional **fêtes votives** devient vivant (×2 sur le tirage) — premiers commentaires `RÉVISION CHANTIER 1` retirés (`regions.ts`).

**Files:**
- `src/core/specials.ts` (nouveau)
- `src/core/specials.test.ts` (nouveau)
- `src/core/types.ts`
- `src/core/save.ts`
- `src/core/regions.ts`

**Steps:**

- [ ] Écrire `src/core/specials.test.ts` :

```ts
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
```

- [ ] `npx vitest run src/core/specials.test.ts` — échec attendu : `Cannot find module './specials'`.
- [ ] `src/core/types.ts` — `GameState` gagne (après `mursTenus` posé par la partie 1) :

```ts
  /** offre de nuit spéciale du soir (story D) — re-tirée à chaque nuit (compteur) */
  specialOffer: SpecialOfferState | null;
  /** soundclash gagné au moins une fois — débloque Volt dans le pool */
  soundclashWon: boolean;
```

  avec en tête de fichier `import type { SpecialOfferState } from './specials';` (import type pur : aucun cycle à l'exécution).
- [ ] Créer `src/core/specials.ts` :

```ts
import { getDj, SPOTS } from './data';
import { isEnGardeAVue } from './crew';
import { isSpotAvailable } from './payout';
import { buildRegionRules } from './regions';
import { mulberry32 } from './rng';
import type { Intensity } from './intensity';
import type { GameState, GenreId, SpotDef, SpotId } from './types';

/**
 * Les nuits spéciales (story D) : à la prépa, ~1 nuit sur 3 dès rep ≥ 12, une
 * offre acceptable ou refusable, valable cette nuit seulement. Le tirage est
 * seedé par le compteur de nuits : déterministe, stable au re-render.
 */

/** Contraintes résolues d'un contrat (les ids concrets, posées sur la nuit). */
export interface SpecialConstraints {
  /** seul ce genre joue ce soir — verrouille le choix des DJs à la prépa */
  genreImpose?: GenreId;
  /** cran maximal autorisé (teuf privée : 'peak' — jamais RINSE) */
  maxIntensity?: Intensity;
  /** spot imposé — verrouille le choix du spot à la prépa */
  spotImpose?: SpotId;
  /** plafond de foule, fraction de la cap (teuf privée : 0.6) */
  crowdCap?: number;
  /** clause « pas de descente » : le seuil atteint rompt le contrat */
  noDescente?: boolean;
}

export interface SpecialRewards {
  /** cash d'avance, crédité à l'acceptation (résolu au tirage) */
  cashUpfront?: number;
  /** × sur la rep totale de la nuit (anniversaire 2, teuf privée 0) */
  repMult?: number;
  /** haute : attente +0.15 et tolérance −0.05 ; puriste : tolérance −0.08 */
  attenteMode?: 'haute' | 'puriste';
  /** nuit à thème : payoff des drops ×1.4 */
  dropPayoffMult?: number;
  /** nuit à thème : buvette ×1.3 */
  barMult?: number;
}

export interface SpecialNightDef {
  id: string;
  nom: string;
  pitch: string;
  icon: string;
  /** le contrat tire un genre dans le crew présent (teuf privée, nuit à thème) */
  drawsGenre?: boolean;
  /** le contrat tire un spot jouable (teuf privée) */
  drawsSpot?: boolean;
  constraints: Omit<SpecialConstraints, 'genreImpose' | 'spotImpose'>;
  rewards: Omit<SpecialRewards, 'cashUpfront'>;
  weight: (state: GameState) => number;
}

/** Offre persistée sur GameState — les ids tirés sont résolus ici. */
export interface SpecialOfferState {
  id: string;
  /** la nuit (state.nights) pour laquelle l'offre vaut — périmée sinon */
  night: number;
  accepted: boolean;
  declined: boolean;
  genreId?: GenreId;
  spotId?: SpotId;
  /** crédité à l'acceptation ; remboursé à 60 % si le contrat casse */
  cashUpfront?: number;
}

export const SPECIAL_OFFER_P = 0.35;
export const SPECIAL_MIN_REP = 12;
/** rupture de contrat : on rembourse 60 % de l'avance */
export const BREACH_REFUND = 0.6;

/**
 * Cash d'avance de la teuf privée : « ×3 le potentiel du spot », lu à l'échelle
 * de la caution (cap × priceMult) — ×3 de potentialBar imprimerait 30 000 € au
 * hangar et casserait l'économie du chantier 2.
 */
export function teufPriveeCash(spot: SpotDef): number {
  return Math.round(3 * spot.cap * spot.priceMult);
}

export const SPECIAL_NIGHTS: SpecialNightDef[] = [
  {
    id: 'soundclash',
    nom: 'Soundclash',
    icon: '🥊',
    pitch:
      'Un crew rival monte son mur en face. Quatre phases, score de vague contre score de vague — gagnes-en deux et leur headliner changera de camp.',
    constraints: {},
    // victoire ×1.5 résolue au règlement (resolveSoundclash) — rien de statique ici
    rewards: {},
    weight: (state) => (state.rep >= 30 ? 1 : 0),
  },
  {
    id: 'teuf-privee',
    nom: 'Teuf privée',
    icon: '🤫',
    pitch:
      'Un collectif te paie d’avance pour une nuit sur mesure : leur son, pas de vagues, pas de bleus. Contrat rompu = remboursement de 60 %.',
    drawsGenre: true,
    drawsSpot: true,
    constraints: { maxIntensity: 'peak', crowdCap: 0.6, noDescente: true },
    rewards: { repMult: 0 },
    weight: () => 1,
  },
  {
    id: 'anniversaire',
    nom: 'Anniversaire de la scène',
    icon: '🎂',
    pitch:
      'Dix ans de la scène locale : tout le monde regarde. La rep compte double, mais la foule attend fort et pardonne peu.',
    constraints: {},
    rewards: { repMult: 2, attenteMode: 'haute' },
    weight: () => 1,
  },
  {
    id: 'nuit-a-theme',
    nom: 'Nuit à thème',
    icon: '🎵',
    pitch:
      'Une nuit mono-genre pour les puristes : tolérance étroite, mais les drops paient +40 % et la buvette tourne ×1.3.',
    drawsGenre: true,
    constraints: {},
    rewards: { attenteMode: 'puriste', dropPayoffMult: 1.4, barMult: 1.3 },
    weight: () => 1,
  },
];

export function getSpecial(id: string): SpecialNightDef {
  const def = SPECIAL_NIGHTS.find((s) => s.id === id);
  if (!def) throw new Error(`unknown special night: ${id}`);
  return def;
}

/** Genres jouables ce soir : les genres des DJs du crew hors garde à vue. */
function crewGenres(state: GameState): GenreId[] {
  return [
    ...new Set(
      state.crew.filter((d) => !isEnGardeAVue(state, d.id)).map((d) => getDj(d.id).genre),
    ),
  ];
}

/**
 * Tire l'offre du soir. Déterministe : la graine est le compteur de nuits.
 * Le trait régional « fêtes votives » double la probabilité (rewire fait).
 */
export function drawSpecialOffer(state: GameState): SpecialOfferState | null {
  if (state.rep < SPECIAL_MIN_REP) return null;
  const rng = mulberry32((((state.nights + 1) * 2654435761) ^ 0x5bec1a1) >>> 0);
  const p = Math.min(0.9, SPECIAL_OFFER_P * buildRegionRules(state.region).specialNightWeightMult);
  if (rng() >= p) return null;
  const genres = crewGenres(state);
  const spots = SPOTS.filter((s) => s.id !== 'teknival' && isSpotAvailable(state, s.id));
  const pool = SPECIAL_NIGHTS.filter(
    (s) => s.weight(state) > 0 && (!s.drawsGenre || genres.length > 0) && (!s.drawsSpot || spots.length > 0),
  );
  if (pool.length === 0) return null;
  const weights = pool.map((s) => s.weight(state));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  let def = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      def = pool[i];
      break;
    }
  }
  const offer: SpecialOfferState = {
    id: def.id,
    night: state.nights,
    accepted: false,
    declined: false,
  };
  if (def.drawsGenre) offer.genreId = genres[Math.floor(rng() * genres.length)];
  if (def.drawsSpot) {
    const spot = spots[Math.floor(rng() * spots.length)];
    offer.spotId = spot.id;
    offer.cashUpfront = teufPriveeCash(spot);
  }
  return offer;
}

/** L'offre du soir, tirée une seule fois par nuit (stable au re-render). */
export function ensureSpecialOffer(state: GameState): SpecialOfferState | null {
  if (state.specialOffer && state.specialOffer.night === state.nights) return state.specialOffer;
  state.specialOffer = drawSpecialOffer(state);
  return state.specialOffer;
}

/** Accepter : le contrat est signé, le cash d'avance tombe tout de suite. */
export function acceptSpecialOffer(state: GameState): boolean {
  const offer = state.specialOffer;
  if (!offer || offer.night !== state.nights || offer.accepted || offer.declined) return false;
  offer.accepted = true;
  if (offer.cashUpfront) state.cash += offer.cashUpfront;
  return true;
}

export function declineSpecialOffer(state: GameState): boolean {
  const offer = state.specialOffer;
  if (!offer || offer.night !== state.nights || offer.accepted || offer.declined) return false;
  offer.declined = true;
  return true;
}
```

- [ ] `src/core/save.ts` :
  - `newGame` : ajouter `specialOffer: null, soundclashWon: false,` (à côté de `gardeAVue/casier/mursTenus` posés par la partie 1).
  - `migrate` : ajouter `state.specialOffer ??= null; state.soundclashWon ??= false;`.
- [ ] `src/core/regions.ts` — retirer les deux derniers commentaires `RÉVISION CHANTIER 1` du fichier :
  - `maxEventsBonus` : doc → `/** Events de nuit supplémentaires possibles (maxEvents) — le « il se passe toujours quelque chose » des fêtes votives. */`
  - `specialNightWeightMult` : doc → `/** × sur la probabilité du tirage des nuits spéciales (drawSpecialOffer). */`
  - (les valeurs ne bougent pas : `regions.test.ts` l.63–65 reste vert tel quel)
- [ ] `npx vitest run src/core/specials.test.ts` puis `npm run test && npm run build`. Harnais : **inchangés** — `drawSpecialOffer` n'est appelé que par `ensureSpecialOffer` (chemin UI), jamais par `createNight` ni par les boucles des harnais.
- [ ] Commit :

```
feat(core): les nuits spéciales — pool, tirage déterministe, offre persistée

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

### Task 2: Le contrat dans la nuit — contraintes, récompenses, rupture

L'offre acceptée devient un `ActiveSpecial` attaché à `NightState` au lancement : plafond de foule, cran maximal (`setIntensity` refuse RINSE sous contrat de teuf privée — le hook prévu par le registre de la partie 1), `attenteMode` qui module `currentWave`, payoff de drop et buvette de la nuit à thème, rep ×N au règlement, clause `noDescente` dont la violation rembourse 60 % de l'avance.

**Files:**
- `src/core/types.ts`
- `src/core/night.ts`
- `src/core/payout.ts`
- `src/core/specials.test.ts`

**Steps:**

- [ ] Étendre `src/core/specials.test.ts` :

```ts
import { createNight, currentWave, dropMontee, setIntensity, startSet, tickNight } from './night';
import { applyBust, settleNight } from './payout';
import type { SpecialOfferState } from './specials';

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
```

- [ ] `npx vitest run src/core/specials.test.ts` — échec : `night.special` n'existe pas.
- [ ] `src/core/specials.ts` — le contrat résolu, posé sur la nuit :

```ts
/** Le contrat actif d'une nuit : la def résolue (ids concrets), plus l'état de rupture. */
export interface ActiveSpecial {
  id: string;
  nom: string;
  icon: string;
  constraints: SpecialConstraints;
  rewards: SpecialRewards;
  /** clause cassée (descente déclenchée sous noDescente) */
  breached: boolean;
}

/** Construit le contrat de la nuit depuis l'offre acceptée (null sinon). */
export function activeSpecial(state: GameState): ActiveSpecial | null {
  const offer = state.specialOffer;
  if (!offer || !offer.accepted || offer.night !== state.nights) return null;
  const def = getSpecial(offer.id);
  return {
    id: def.id,
    nom: def.nom,
    icon: def.icon,
    constraints: { ...def.constraints, genreImpose: offer.genreId, spotImpose: offer.spotId },
    rewards: { ...def.rewards, cashUpfront: offer.cashUpfront },
    breached: false,
  };
}
```

- [ ] `src/core/types.ts` :
  - `import type { ActiveSpecial } from './specials';` (étendre l'import type existant).
  - `NightState` gagne `/** contrat de nuit spéciale accepté à la prépa, ou null */ special: ActiveSpecial | null;`
  - `NightResult` gagne `/** id de la nuit spéciale jouée (null sinon) */ specialId: string | null;` et `/** remboursement de rupture de contrat (0 sinon) */ contractRefund: number;`
- [ ] `src/core/night.ts` :
  - `import { activeSpecial } from './specials';` — **attention au cycle** `night → specials → payout → night` ? Non : `payout.ts` n'importe pas `night.ts` (vérifié — il ne lit que `types`). Le seul cycle du repo reste `night ↔ raid` (assumé partie 1).
  - `createNight` : après le calcul de `cap`, le contrat :

```ts
  // contrat de nuit spéciale (story D) : l'offre acceptée pour CETTE nuit
  const special = activeSpecial(state);
  const capped = special?.constraints.crowdCap ? Math.round(cap * special.constraints.crowdCap) : cap;
```

  utiliser `capped` partout où `cap` alimentait l'objet (`cap: capped,` et `barCap: BAR_STOCK_CAP[barStock] * potentialBar(spot, capped),`), et initialiser `special,` dans l'objet retourné.
  - `setIntensity` — le refus contractuel (hook annoncé par le registre partie 1) :

```ts
export function setIntensity(night: NightState, i: Intensity): boolean {
  if (night.phase !== 'playing' || night.intensity === i) return false;
  const maxI = night.special?.constraints.maxIntensity;
  if (maxI && INTENSITY_LEVEL[i] > INTENSITY_LEVEL[maxI]) return false; // contrat : jamais RINSE
  night.intensity = i;
  return true;
}
```

  - `applyEffects`, le bloc `forceIntensity` se clampe au contrat :

```ts
  if (fx.forceIntensity) {
    const maxI = night.special?.constraints.maxIntensity;
    night.intensity =
      maxI && INTENSITY_LEVEL[fx.forceIntensity] > INTENSITY_LEVEL[maxI] ? maxI : fx.forceIntensity;
  }
```

  - `currentWave` — `attenteMode` module la baseline et la tolérance. **Attention à l'ordre de la partie 1** : `attente` y est calculée depuis `baseline` AVANT `tol` — poser `mode` et `baselineEff` juste après la ligne `baseline` (la ligne `attente` lit alors `baselineEff`), et `tolEff` juste après la ligne `tol` :

```ts
  // contrat : « anniversaire » relève l'attente, les puristes pardonnent moins
  const mode = night.special?.rewards.attenteMode;
  const baselineEff = mode === 'haute' ? baseline + 0.15 : baseline;
  // … la ligne attente devient : clamp(baselineEff * ATTENTE_GENRE[night.genreId] − …) …
  const tolEff = Math.max(0.02, tol - (mode === 'haute' ? 0.05 : mode === 'puriste' ? 0.08 : 0));
```

  (toute la suite de la fonction lit `baselineEff`/`tolEff` à la place de `baseline`/`tol` — `gap`, `inWave` et le `tol` retourné compris)
  - `dropMontee` : la ligne du payoff devient `const payoff = (ownedGear(state, 'lumieres').effects?.dropMult ?? 1) * (night.special?.rewards.dropPayoffMult ?? 1);`
  - Buvette : la ligne `drip` gagne `* (night.special?.rewards.barMult ?? 1)`.
  - Bloc descente (posé par la partie 1) — la clause cassée :

```ts
  if (!night.raid && night.heat >= night.rules.descenteThreshold) {
    startDescente(state, night);
    events.push({ type: 'descente' });
    // clause « pas de descente » : les bleus se moquent du contrat, mais le client non
    if (night.special?.constraints.noDescente && !night.special.breached) {
      night.special.breached = true;
      night.journal.push({ t: night.t, titre: 'Le contrat', outcome: 'La descente a tout gâché. Le client veut 60 % de son avance.' });
    }
  }
```

- [ ] `src/core/payout.ts` — récompenses et rupture au règlement :
  - En tête de `settleNight` et `applyBust`, le contrat : `const special = night.special;`
  - `settleNight` : la ligne `repGained` (forme partie 1, avec `evacMult`) gagne le facteur contrat :

```ts
  const specialRepMult = special?.rewards.repMult ?? 1;
  const repGained = Math.round(
    (SUNRISE_REP + night.peakCrowd / 10 + (survivedHighHeat ? 15 : 0) + night.repBonus + night.lastAubeDropRep) *
      evacMult * specialRepMult,
  );
```

  - `applyBust` : `const repGained = Math.round((night.peakCrowd / 20 + night.repBonus) * (special?.rewards.repMult ?? 1));`
  - Le remboursement, dans **les deux** fonctions, juste avant la construction du `NightResult` :

```ts
  // rupture de contrat : 60 % de l'avance repart (jamais en dessous de 0 en caisse)
  const contractRefund = special?.breached ? Math.round((special.rewards.cashUpfront ?? 0) * BREACH_REFUND) : 0;
  if (contractRefund > 0) state.cash = Math.max(0, state.cash - contractRefund);
```

  (import `BREACH_REFUND` depuis `./specials`)
  - Les deux `NightResult` gagnent `specialId: special?.id ?? null,` et `contractRefund,`.
- [ ] `npx vitest run src/core/specials.test.ts` puis `npm run test && npm run build`. Harnais : **inchangés** (`state.specialOffer` reste `null` dans tous les harnais → `night.special` null → tous les facteurs valent 1). Les tests gelés de `test/payout.test.ts` / `test/economy.test.ts` construisent leurs nuits par `createNight` + `Object.assign` : `special` vaut null, pins intacts.
- [ ] Commit :

```
feat(core): le contrat de nuit spéciale — contraintes, récompenses, rupture

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

### Task 3: Le soundclash — rival simulé, victoire phase par phase, le rewire Volt

Le score de vague est accumulé **par phase de nuit** (ouverture/rush/creux/aube), comparé à un rival simulé tiré du tier du spot. Victoire ≥ 2 phases sur 4 : rep ×1.5 + `state.soundclashWon` → **Volt** apparaît dans le pool de recrutement à −30 % de cut (le marqueur `RÉVISION CHANTIER 1` de `data.ts` l.556 tombe). Défaite : buzz ×0.5. Un bust ou une évacuation laisse les phases non jouées au rival.

**Files:**
- `src/core/types.ts`
- `src/core/specials.ts`
- `src/core/night.ts`
- `src/core/payout.ts`
- `src/core/data.ts`
- `src/core/crew.ts`
- `src/core/specials.test.ts`
- `src/ui/screens.ts` (le cut affiché du recrutement passe par `poolCut`)

**Steps:**

- [ ] Étendre `src/core/specials.test.ts` :

```ts
import { recruitableDjs, poolCut } from './crew';
import { NIGHT_PHASES } from './phases';
import { resolveSoundclash } from './specials';

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
```

- [ ] `npx vitest run src/core/specials.test.ts` — échec : `phaseWaveT`/`rival`/`resolveSoundclash` n'existent pas.
- [ ] `src/core/types.ts` :
  - `import type { NightPhaseId } from './phases';` est déjà là (partie 1).
  - `NightState` gagne :

```ts
  /** ∑ waveScore × dt par phase de nuit (soundclash : score comparé au rival) */
  phaseWaveSum: Record<NightPhaseId, number>;
  /** secondes jouées par phase de nuit */
  phaseWaveT: Record<NightPhaseId, number>;
```

  - `NightResult` gagne `/** soundclash : phases gagnées (null hors clash) */ clashPhasesWon: number | null;` et `/** soundclash gagné ce soir */ clashWon: boolean;`
  - `DjDef` gagne `/** déblocage par le gameplay : invisible tant que la condition n'est pas remplie */ gated?: 'soundclash';`
- [ ] `src/core/specials.ts` :
  - `ActiveSpecial` gagne `/** soundclash : score du rival par phase (tiré au lancement) */ rival?: Record<NightPhaseId, number>;` (import `type NightPhaseId, NIGHT_PHASES` depuis `./phases`).
  - La résolution :

```ts
/** victoire = battre le rival sur ≥ 2 phases sur 4 */
export const CLASH_PHASES_TO_WIN = 2;
export const CLASH_WIN_REP_MULT = 1.5;
export const CLASH_LOSS_BUZZ_MULT = 0.5;

/**
 * Tire le rival du soir : un score de vague par phase, calibré sur le tier du
 * spot (tier 1 : 0.37–0.57, tier 6 : 0.72–0.92). rng = flux dédié de la nuit.
 */
export function drawRival(spotTier: number, rng: () => number): Record<NightPhaseId, number> {
  const rival = {} as Record<NightPhaseId, number>;
  for (const p of NIGHT_PHASES) {
    rival[p.id] = Math.min(0.95, 0.3 + 0.07 * spotTier + rng() * 0.2);
  }
  return rival;
}

/** Compare le waveScore moyen de chaque phase au rival. Phase non jouée = perdue. */
export function resolveSoundclash(night: NightState): { phasesWon: number; won: boolean } {
  const rival = night.special?.rival;
  if (!rival) return { phasesWon: 0, won: false };
  let phasesWon = 0;
  for (const p of NIGHT_PHASES) {
    const t = night.phaseWaveT[p.id];
    const avg = t > 0 ? night.phaseWaveSum[p.id] / t : 0;
    if (avg > rival[p.id]) phasesWon += 1;
  }
  return { phasesWon, won: phasesWon >= CLASH_PHASES_TO_WIN };
}
```

  (étendre les imports de types : `import type { GameState, GenreId, NightState, SpotDef, SpotId } from './types';`)
- [ ] `src/core/night.ts` :
  - `createNight` : initialiser les accumulateurs et le rival :

```ts
    phaseWaveSum: { ouverture: 0, rush: 0, creux: 0, aube: 0 },
    phaseWaveT: { ouverture: 0, rush: 0, creux: 0, aube: 0 },
```

  et juste après la construction de `special` :

```ts
  // soundclash : le rival du soir, tiré d'un flux RNG dédié (déterministe au seed)
  if (special && special.id === 'soundclash') {
    special.rival = drawRival(spot.tier, mulberry32((seed ^ 0x7a11) >>> 0));
  }
```

  (imports : `drawRival` depuis `./specials` ; `mulberry32` déjà importé)
  - `tickNight`, juste après la mise à jour de `night.waveScore`/`bestWaveScore` (bloc vague, partie 1) :

```ts
  // score de vague par phase de nuit (soundclash, story D)
  night.phaseWaveSum[night.nightPhase] += night.waveScore * dt;
  night.phaseWaveT[night.nightPhase] += dt;
```

- [ ] `src/core/payout.ts` — la résolution au règlement. Dans `settleNight`, **avant** la ligne `repGained` :

```ts
  // soundclash : la victoire paie ×1.5 (résolu avant repGained)
  const clash = special?.id === 'soundclash' ? resolveSoundclash(night) : null;
  if (clash?.won) state.soundclashWon = true;
```

  et le `×1.5` s'intègre **dans** l'arrondi de `repGained` (la ligne de la task 2 gagne `* (clash?.won ? CLASH_WIN_REP_MULT : 1)`). La défaite, elle, se paie **après** le bouche-à-oreille — `settleNight` appelle `buzzAfterNight(...)` qui AJOUTE du buzz, le malus doit donc avoir le dernier mot sinon le pin du test est faux : juste **après** l'appel `buzzAfterNight(...)`, ajouter

```ts
  // soundclash perdu : la moitié du buzz — APRÈS buzzAfterNight (dernier toucher du buzz)
  if (clash && !clash.won) state.buzz *= CLASH_LOSS_BUZZ_MULT;
``` Dans `applyBust`, **une nuit bustée ne gagne jamais le clash** (même 3 phases dominées — les bleus ont eu le dernier mot) :

```ts
  // soundclash : un bust est toujours une défaite — le rival a tenu, pas toi
  const clash =
    special?.id === 'soundclash'
      ? { phasesWon: resolveSoundclash(night).phasesWon, won: false }
      : null;
  if (clash) state.buzz *= CLASH_LOSS_BUZZ_MULT;
```

  Les deux `NightResult` gagnent `clashPhasesWon: clash?.phasesWon ?? null,` et `clashWon: clash?.won ?? false,`. (imports : `resolveSoundclash, CLASH_WIN_REP_MULT, CLASH_LOSS_BUZZ_MULT` depuis `./specials`)
- [ ] `src/core/data.ts` — **le rewire Volt** : retirer le commentaire `RÉVISION CHANTIER 1` et brancher le vrai déblocage :

```ts
  {
    id: 'volt',
    nom: 'Volt',
    // premier DJ débloqué par le gameplay : gagner le soundclash (story D).
    // repReq garde sa place dans l'ordre d'affichage mais le seuil est mort —
    // une fois battu, Volt rejoint le crew vainqueur direct, à −30 % de cut.
    description: 'Le headliner rival. Electro carrée, ego carré — il ne joue que pour les crews qui l’ont battu.',
    technique: 4,
    charisme: 4,
    genre: 'electro',
    risk: 'normal',
    cut: 0.24,
    repReq: 420,
    sprite: 1,
    gated: 'soundclash',
  },
```

- [ ] `src/core/crew.ts` :
  - `djAvailable` apprend le gate gameplay :

```ts
/** Les Têtes d'affiche n'existent pas sans leur perk ; Volt, pas sans victoire au clash. */
export function djAvailable(state: GameState, def: DjDef): boolean {
  if (def.gated === 'soundclash' && !state.soundclashWon) return false;
  return def.perk === undefined || hasPerk(state, def.perk);
}
```

  - `djRepThreshold` : `if (def.gated === 'soundclash') return 0;` en première ligne (il rejoint le crew qui l'a battu, peu importe la rep).
  - Le cut du pool :

```ts
/** Cut affiché/pris d'un DJ du pool : le headliner battu fait le tarif des vainqueurs (−30 %). */
export function poolCut(def: DjDef): number {
  return def.gated === 'soundclash' ? def.cut * 0.7 : def.cut;
}
```

  et `effectiveCut` part de `poolCut(def)` au lieu de `def.cut` :

```ts
export function effectiveCut(def: DjDef, member: DjState): number {
  const base = poolCut(def);
  return member.gifted ? Math.max(GIFT_CUT_FLOOR, base - GIFT_CUT_REDUCTION) : base;
}
```

- [ ] `src/ui/screens.ts` — la carte de recrutement (`renderPrepare`, boucle `recruitableDjs`) affiche `STR.cut(poolCut(def))` au lieu de `STR.cut(def.cut)` (import `poolCut` depuis `../core/crew`).
- [ ] Vérifier `test/data.test.ts` : l'ordre des `repReq` est inchangé (Volt garde 420) et `dj.cut <= 0.3` tient (0.24 brut). `test/tour.test.ts` (têtes d'affiche) ne mentionne pas Volt — vérifié au grep `grep -rn "volt" test/ src/`.
- [ ] `npm run test && npm run build`. Harnais : `progression.test.ts` (`autoCareer`) recrute via `recruitableDjs` — Volt n'y apparaît plus jamais (gated, jamais de clash dans le harnais) ; il y apparaissait avant à rep 420. **Pin attendu en mouvement** : la borne basse `nights >= 30` du temps-vers-Teknival peut bouger d'une nuit ou deux (un DJ 4/4 de moins dans la rotation tardive ralentit légèrement). Procédure de re-pin : lancer, lire la valeur mesurée, épingler `mesuré − 2` avec commentaire `// mesuré X nuits après le rewire Volt (story D)`. Garder `< 200`.
- [ ] Commit :

```
feat(core): le soundclash — rival par phase, victoire ×1.5, Volt rejoint les vainqueurs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

### Task 4: UI des nuits spéciales — la carte d'offre, les verrous de prépa, le badge HUD

La carte d'offre sur l'écran de prépa (au-dessus du choix de spot) : pitch, contraintes, récompenses, `ACCEPTER / LAISSER`. Acceptée, les contraintes verrouillent la prépa (spot imposé : les autres cartes grisées ; genre imposé : les DJs d'un autre genre non embarquables) et un badge contrat vit dans le HUD de nuit. Le recap raconte le contrat (clash gagné/perdu, zéro rep, remboursement).

**Files:**
- `src/ui/strings.ts`
- `src/ui/screens.ts`
- `src/main.ts`
- `src/style.css`

**Steps:**

- [ ] `src/ui/strings.ts` — le bloc nuits spéciales :

```ts
  // nuits spéciales (story D)
  offerTag: 'CE SOIR — OFFRE SPÉCIALE',
  offerAccept: '✓ ACCEPTER',
  offerDecline: 'LAISSER',
  offerAccepted: (nom: string) => `📜 Contrat signé — ${nom}`,
  offerCashUpfront: (n: number) => `💶 ${n} € d'avance, tout de suite`,
  offerRepMult: (m: number) => (m === 0 ? '🤐 Zéro rep — personne ne saura' : `⭐ Rep ×${m} toute la nuit`),
  offerGenre: (nom: string) => `🎵 Genre imposé : ${nom}`,
  offerSpot: (nom: string) => `📍 Spot imposé : ${nom}`,
  offerMaxIntensity: '🎚 Jamais RINSE — clause du contrat',
  offerCrowdCap: (pct: number) => `👥 Foule plafonnée à ${pct} %`,
  offerNoDescente: '🚨 Une descente = contrat rompu (−60 % de l’avance)',
  offerAttenteHaute: '🌊 Foule exigeante : attente +0.15, tolérance −0.05',
  offerAttentePuriste: '🌊 Des puristes : tolérance −0.08, drops +40 %, bar ×1.3',
  offerClash: '🥊 4 phases contre le rival — gagnes-en 2 et son headliner change de camp',
  genreLockedDj: (nom: string) => `🎵 Contrat : ${nom} seulement`,
  specialBadge: (icon: string, nom: string) => `${icon} ${nom}`,
  recapClashWon: (n: number) => `🥊 SOUNDCLASH GAGNÉ — ${n} phases sur 4. Leur headliner a vu.`,
  recapClashLost: '🥊 Soundclash perdu — le buzz en a pris la moitié.',
  recapContractRefund: (n: number) => `📜 Contrat rompu — ${n} € remboursés`,
  recapZeroRep: '🤐 Teuf privée — zéro rep, comme convenu',
```

- [ ] `src/ui/screens.ts` :
  - `PrepareCallbacks` gagne `onAcceptOffer(): void;` et `onDeclineOffer(): void;`
  - Imports : `import { getSpecial } from '../core/specials';` (`getGenre`/`getSpot` sont déjà importés).
  - Dans `renderPrepare`, juste **après** le bandeau région et **avant** `const main = el('div', 'prepare-grid');`, la carte d'offre :

```ts
  // offre de nuit spéciale du soir (story D) — au-dessus du choix de spot
  const offer = state.specialOffer && state.specialOffer.night === state.nights ? state.specialOffer : null;
  if (offer && !offer.declined) {
    const def = getSpecial(offer.id);
    const card = el('div', `card offer-card${offer.accepted ? ' accepted' : ''}`);
    card.append(el('div', 'offer-tag', offer.accepted ? STR.offerAccepted(def.nom) : STR.offerTag));
    card.append(el('div', 'card-title', `${def.icon} ${def.nom}`));
    card.append(el('div', 'card-desc', def.pitch));
    const terms = el('div', 'offer-terms');
    if (offer.cashUpfront) terms.append(el('div', 'offer-term', STR.offerCashUpfront(offer.cashUpfront)));
    if (def.rewards.repMult !== undefined) terms.append(el('div', 'offer-term', STR.offerRepMult(def.rewards.repMult)));
    if (offer.genreId) terms.append(el('div', 'offer-term', STR.offerGenre(getGenre(offer.genreId).nom)));
    if (offer.spotId) terms.append(el('div', 'offer-term', STR.offerSpot(getSpot(offer.spotId).nom)));
    if (def.constraints.maxIntensity) terms.append(el('div', 'offer-term', STR.offerMaxIntensity));
    if (def.constraints.crowdCap) terms.append(el('div', 'offer-term', STR.offerCrowdCap(Math.round(def.constraints.crowdCap * 100))));
    if (def.constraints.noDescente) terms.append(el('div', 'offer-term', STR.offerNoDescente));
    if (def.rewards.attenteMode === 'haute') terms.append(el('div', 'offer-term', STR.offerAttenteHaute));
    if (def.rewards.attenteMode === 'puriste') terms.append(el('div', 'offer-term', STR.offerAttentePuriste));
    if (def.id === 'soundclash') terms.append(el('div', 'offer-term', STR.offerClash));
    card.append(terms);
    if (!offer.accepted) {
      const row = el('div', 'offer-actions');
      const accept = el('button', 'btn small accent', STR.offerAccept);
      accept.addEventListener('click', () => cb.onAcceptOffer());
      const decline = el('button', 'btn small ghost', STR.offerDecline);
      decline.addEventListener('click', () => cb.onDeclineOffer());
      row.append(accept, decline);
      card.append(row);
    }
    root.append(card);
  }
  const contract = offer?.accepted ? offer : null;
```

  - Verrou de spot (boucle des spots) : la ligne `const unlocked = ...` devient :

```ts
    const imposed = contract?.spotId;
    const unlocked = isSpotAvailable(state, spot.id) && (!imposed || spot.id === imposed);
```

  (quand `imposed` est posé, `main.ts` a déjà forcé `selection.spot` — la carte imposée reste la seule cliquable)
  - Verrou de genre (boucle `for (const member of state.crew)`) : au début de l'itération :

```ts
    const genreLocked = contract?.genreId !== undefined && def.genre !== contract.genreId;
```

  si `genreLocked` : la carte gagne la classe `locked`, n'installe **pas** le listener de sélection, et affiche `info.append(el('div', 'dj-risk', STR.genreLockedDj(getGenre(contract!.genreId!).nom)));` (cohabite avec le verrou garde à vue de la partie 1 — `jailed || genreLocked` court-circuite le listener).
  - `renderNight` — le badge contrat, à côté des badges de modifs (dans le bloc `if (!badgesDone)`) :

```ts
        if (night.special) {
          const badge = el('div', 'night-modifier-badge special-badge');
          badge.textContent = STR.specialBadge(night.special.icon, night.special.nom);
          modifierBadges.append(badge);
        }
```

  - `renderRecap` — après le sous-titre (`recap-sub`), les lignes contrat :

```ts
  if (result.clashPhasesWon !== null) {
    panel.append(el('div', `recap-sub ${result.clashWon ? 'recap-legende' : ''}`,
      result.clashWon ? STR.recapClashWon(result.clashPhasesWon) : STR.recapClashLost));
  }
  if (result.specialId === 'teuf-privee' && !result.busted) panel.append(el('div', 'recap-sub', STR.recapZeroRep));
  if (result.contractRefund > 0) panel.append(el('div', 'recap-sub', STR.recapContractRefund(result.contractRefund)));
```

- [ ] `src/main.ts` :
  - Imports : `acceptSpecialOffer, declineSpecialOffer, ensureSpecialOffer` depuis `./core/specials`, `getGenre` depuis `./core/data`.
  - `showPrepare()` : juste après `applyIdleTime(...)`, tirer l'offre du soir : `ensureSpecialOffer(state); saveGame(localStorage, state);` (avant le rendu — le tirage est déterministe par compteur, un double appel est sans effet).
  - Les callbacks :

```ts
    onAcceptOffer: () => {
      if (!acceptSpecialOffer(state)) return;
      const offer = state.specialOffer!;
      if (offer.spotId) selection.spot = offer.spotId;
      if (offer.genreId) {
        for (const id of [...selection.present]) {
          if (getDj(id).genre !== offer.genreId) selection.present.delete(id);
        }
        for (const d of state.crew) {
          if (getDj(d.id).genre === offer.genreId) selection.present.add(d.id);
        }
      }
      saveGame(localStorage, state);
      showPrepare();
    },
    onDeclineOffer: () => {
      if (declineSpecialOffer(state)) {
        saveGame(localStorage, state);
        showPrepare();
      }
    },
```

  - `startNight()` : le filtre des présents respecte le contrat (après le filtre garde à vue de la partie 1) :

```ts
  const contract = state.specialOffer?.accepted && state.specialOffer.night === state.nights ? state.specialOffer : null;
  const present = [...selection.present].filter(
    (id) =>
      state.crew.some((d) => d.id === id) &&
      !isEnGardeAVue(state, id) &&
      (!contract?.genreId || getDj(id).genre === contract.genreId),
  );
  if (contract?.spotId) selection.spot = contract.spotId;
```

  (le tirage de l'offre garantit qu'au moins un DJ non détenu joue le genre — no-softlock)
- [ ] `src/style.css` :

```css
.offer-card {
  margin: 8px 16px;
  border: 2px solid #d9a13b;
  background: linear-gradient(135deg, rgba(217, 161, 59, 0.12), rgba(20, 16, 8, 0.6));
}
.offer-card.accepted { border-style: dashed; opacity: 0.92; }
.offer-tag { color: #d9a13b; font-size: 11px; font-weight: 800; letter-spacing: 0.12em; margin-bottom: 4px; }
.offer-terms { display: flex; flex-direction: column; gap: 2px; margin: 8px 0; }
.offer-term { font-size: 13px; color: #cbb; }
.offer-actions { display: flex; gap: 8px; }
.special-badge { border-color: #d9a13b; color: #ffd98a; }
```

- [ ] `npm run test && npm run build` — verts (tâche UI, aucun pin ne bouge). Vérification manuelle `npm run dev` : forcer une offre via la console (`state.rep = 50` + relancer la prépa), accepter une teuf privée → spot forcé, DJs hors genre grisés, badge 🤫 en nuit, recap avec zéro rep.
- [ ] Commit :

```
feat(ui): la carte d'offre spéciale — accepter, verrouiller la prépa, badge de contrat

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

### Task 5: arcs.ts — le moteur des arcs, le flic corrompu, la ⭐ des arcs terminés

Le moteur complet (story E) : `plantsArc` sur `EventEffects` (chance, tirée au RNG de nuit), `pendingArcs` qui décompte à chaque règlement, l'event d'échéance injecté **en priorité** sur le tirage aléatoire de la nuit suivante (hors quota `maxEvents`), les `tempEffects` génériques, la complétion explicite. Premier arc : **le flic corrompu**, planté par la négociation réussie de la partie 1 (`night.negoCorruption` — le hook annoncé par son registre). Le rewire `tour.ts` : `computeLegende` compte les arcs terminés (le `RÉVISION CHANTIER 1` l.45 et le commentaire l.87 tombent).

**Files:**
- `src/core/arcs.ts` (nouveau)
- `src/core/arcs.test.ts` (nouveau)
- `src/core/types.ts`
- `src/core/night.ts`
- `src/core/payout.ts`
- `src/core/save.ts`
- `src/core/tour.ts`
- `src/core/idle.ts` (export `BUZZ_CAP` — déjà exporté, vérifier)

**Steps:**

- [ ] Écrire `src/core/arcs.test.ts` :

```ts
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
```

- [ ] `npx vitest run src/core/arcs.test.ts` — échec : `Cannot find module './arcs'`.
- [ ] `src/core/types.ts` :
  - `EventEffects` gagne :

```ts
  /** plante un arc de conséquences (story E) — tiré au RNG de nuit */
  plantsArc?: { arcId: string; stage?: number; chance: number };
  /** marque l'arc comme mené à terme (⭐ légende, déblocages) */
  arcComplete?: string;
  /** multiplie la heat COURANTE (flic : « heat −40 % cette nuit » = ×0.6) */
  heatMultNow?: number;
  /** multiplie le buzz (journaliste : l'article sort, ×1.6) */
  buzzMult?: number;
  /** efface le casier (le forfait du flic) */
  casierClear?: boolean;
  /** effet temporaire générique : heat de base ×, heat de départ +, pendant n nuits */
  tempHeat?: { heatBuildMult?: number; startHeatAdd?: number; nights: number };
```

  - `PendingEvent` devient :

```ts
export interface PendingEvent {
  def: NightEventDef;
  /** event d'échéance d'arc (marqueur « suite » dans l'UI) */
  arc?: { arcId: string; stage: number };
}
```

  - `GameState` gagne :

```ts
  /** arcs de conséquences en cours — l'échéance décompte à chaque règlement */
  pendingArcs: { arcId: string; stage: number; nightsLeft: number; payload?: number }[];
  /** effets temporaires génériques (heat de base ×, heat de départ +), en nuits */
  tempEffects: { heatBuildMult?: number; startHeatAdd?: number; nightsLeft: number }[];
  /** ids des arcs menés à terme (⭐ légende, château squatté) */
  arcsCompleted: string[];
```

- [ ] Créer `src/core/arcs.ts` :

```ts
import type { GameState, NightEventDef, NightState } from './types';

/**
 * Les arcs de conséquences (story E) : plantés par un choix (event, prompt,
 * négociation de descente), ils mûrissent en nuits et reviennent comme event
 * modal PRIORITAIRE (hors quota) à l'échéance. 2–3 temps max par arc.
 */

export interface ArcStageDef {
  /** l'event injecté quand l'échéance arrive */
  event: NightEventDef;
  /** nuits avant l'échéance — [min, max], tirage inclusif */
  delay: [number, number];
}

export interface ArcDef {
  id: string;
  stages: ArcStageDef[];
}

export const ARCS: ArcDef[] = [
  {
    // 🚔 planté par une négociation de descente réussie (negoCorruption, partie 1)
    id: 'flic-corrompu',
    stages: [
      {
        delay: [2, 3],
        event: {
          id: 'flic-stage-0',
          titre: '🚔 Le gradé revient',
          texte:
            'Le gradé de l’autre soir se gare au portail, en civil. « Même arrangement. Tarif doublé — l’inflation, tu comprends. »',
          options: [
            {
              label: 'Payer le double (−300 €)',
              outcome: 'L’enveloppe change de main. Cette nuit, les patrouilles regarderont ailleurs.',
              effects: { cash: -300, heatMultNow: 0.6, plantsArc: { arcId: 'flic-corrompu', stage: 1, chance: 1 } },
            },
            {
              label: 'Refuser tout net',
              outcome: 'Il remonte en voiture sans un mot. Dix minutes plus tard, une patrouille ralentit au croisement.',
              effects: { heat: 0.15 },
            },
          ],
          weight: () => 0, // jamais au tirage aléatoire : injection d'arc uniquement
        },
      },
      {
        delay: [2, 3],
        event: {
          id: 'flic-stage-1',
          titre: '🚔 Le forfait',
          texte:
            'Le gradé propose un « forfait » : 800 € et ton dossier disparaît du commissariat — avec cinq nuits de tranquillité. Ou tu le balances à l’IGPN.',
          options: [
            {
              label: 'Le forfait (−800 €)',
              outcome: 'Le casier s’évapore. Pendant cinq nuits, les bleus chercheront la teuf sur la mauvaise départementale.',
              effects: {
                cash: -800,
                casierClear: true,
                tempHeat: { heatBuildMult: 0.8, nights: 5 },
                arcComplete: 'flic-corrompu',
              },
            },
            {
              label: 'Le dénoncer',
              outcome: 'La scène entière apprend que ton crew ne s’achète pas. Le commissariat, vexé, patrouille plus serré.',
              effects: { rep: 20, tempHeat: { heatBuildMult: 1.1, nights: 5 }, arcComplete: 'flic-corrompu' },
            },
          ],
          weight: () => 0,
        },
      },
    ],
  },
];

export function getArc(id: string): ArcDef {
  const arc = ARCS.find((a) => a.id === id);
  if (!arc) throw new Error(`unknown arc: ${id}`);
  return arc;
}

/**
 * Plante un stage d'arc : échéance tirée dans la fenêtre du stage. Refuse les
 * doublons (arc déjà en cours) et les arcs déjà menés à terme.
 */
export function plantArc(state: GameState, arcId: string, stage: number, rng: () => number): boolean {
  if (state.arcsCompleted.includes(arcId)) return false;
  if (state.pendingArcs.some((a) => a.arcId === arcId)) return false;
  const def = getArc(arcId).stages[stage];
  if (!def) return false;
  const [lo, hi] = def.delay;
  const nightsLeft = lo + Math.floor(rng() * (hi - lo + 1));
  state.pendingArcs.push({ arcId, stage, nightsLeft: Math.min(hi, nightsLeft) });
  return true;
}

/** L'échéance arrivée (nightsLeft ≤ 0), retirée de la file et prête à injecter. */
export function takeDueArc(
  state: GameState,
): { arcId: string; stage: number; event: NightEventDef } | null {
  const idx = state.pendingArcs.findIndex((a) => a.nightsLeft <= 0);
  if (idx < 0) return null;
  const due = state.pendingArcs[idx];
  state.pendingArcs.splice(idx, 1);
  return { arcId: due.arcId, stage: due.stage, event: getArc(due.arcId).stages[due.stage].event };
}

/** Produit des multiplicateurs de heat de base actifs (tickNight). */
export function tempHeatBuildMult(state: GameState): number {
  return state.tempEffects.reduce((acc, e) => acc * (e.heatBuildMult ?? 1), 1);
}

/** Somme des bonus de heat de départ actifs (createNight). */
export function tempStartHeat(state: GameState): number {
  return state.tempEffects.reduce((acc, e) => acc + (e.startHeatAdd ?? 0), 0);
}

/**
 * La nuit se règle : décompte les échéances d'arcs, fait expirer les
 * tempEffects, PUIS plante le flic corrompu si la négo l'a semé (partie 1).
 * L'ordre compte : l'arc semé CE soir garde son échéance pleine — décompter
 * après le plant raboterait son délai d'une nuit (le test du plant frais le pin).
 * Appelé par settleNight ET applyBust (payout.ts).
 */
export function settleArcs(state: GameState, night: NightState): void {
  for (const arc of state.pendingArcs) arc.nightsLeft = Math.max(0, arc.nightsLeft - 1);
  for (const fx of state.tempEffects) fx.nightsLeft -= 1;
  state.tempEffects = state.tempEffects.filter((fx) => fx.nightsLeft > 0);
  if (night.negoCorruption) plantArc(state, 'flic-corrompu', 0, night.rng);
}
```

- [ ] `src/core/night.ts` :
  - Imports : `import { plantArc, takeDueArc, tempHeatBuildMult, tempStartHeat } from './arcs';` et `import { BUZZ_CAP } from './idle';` (`idle.ts` exporte déjà `BUZZ_CAP` ; il n'importe pas `night.ts` — pas de cycle).
  - `createNight` — la heat de départ apprend les tempEffects (la ligne posée par la partie 1, task 8) :

```ts
  const casierHeat = spot.tier >= 4 ? 0.05 * state.casier : 0;
  const startHeat = clamp(
    (spot.tier >= 3 && cautionPaid === 0 ? 0.1 : 0) + casierHeat + tempStartHeat(state),
    0,
    0.5,
  );
```

  - `tickNight` — la grande ligne de heat gagne `* tempHeatBuildMult(state)` (à côté de `branchHeatMult(state)`).
  - `tickNight` — l'injection prioritaire, juste **avant** le bloc `// --- random events` :

```ts
  // --- arcs de conséquences : l'échéance passe AVANT le tirage aléatoire --------
  if (
    !night.pendingEvent &&
    night.setElapsed > 8 &&
    night.setElapsed < night.setLen - 10
  ) {
    const due = takeDueArc(state);
    if (due) {
      night.pendingEvent = { def: due.event, arc: { arcId: due.arcId, stage: due.stage } };
      night.phase = 'event';
      night.floorPrompt = null; // pas de doublon visuel
      return events; // hors quota : eventsFired n'est pas touché
    }
  }
```

  - `applyEffects` — les nouveaux effets, à la fin de la fonction :

```ts
  if (fx.heatMultNow) night.heat = clamp(night.heat * fx.heatMultNow, 0, 0.99);
  if (fx.buzzMult) state.buzz = Math.min(BUZZ_CAP, state.buzz * fx.buzzMult);
  if (fx.casierClear) state.casier = 0;
  if (fx.tempHeat) {
    state.tempEffects.push({
      heatBuildMult: fx.tempHeat.heatBuildMult,
      startHeatAdd: fx.tempHeat.startHeatAdd,
      nightsLeft: fx.tempHeat.nights,
    });
  }
  if (fx.plantsArc && night.rng() < fx.plantsArc.chance) {
    plantArc(state, fx.plantsArc.arcId, fx.plantsArc.stage ?? 0, night.rng);
  }
  if (fx.arcComplete && !state.arcsCompleted.includes(fx.arcComplete)) {
    state.arcsCompleted.push(fx.arcComplete);
  }
```

- [ ] `src/core/payout.ts` : `import { settleArcs } from './arcs';` et appeler `settleArcs(state, night);` dans `settleNight` **et** `applyBust`, juste après `state.nights += 1;` (à côté du `tickGardeAVue(state)` de la partie 1).
- [ ] `src/core/save.ts` : `newGame` gagne `pendingArcs: [], tempEffects: [], arcsCompleted: [],` ; `migrate` gagne `state.pendingArcs ??= []; state.tempEffects ??= []; state.arcsCompleted ??= [];`.
- [ ] `src/core/tour.ts` — le rewire ⭐ :
  - `computeLegende` : `const arcsTermines = state.arcsCompleted.length;` et le docstring perd sa clause `RÉVISION CHANTIER 1` :

```ts
/**
 * legende = floor(rep / 100) + 3 × victoires Teknival cette tournée
 *         + 1 par « mur tenu » (story C) + 1 par arc mené à terme (story E).
 */
```

  - `departOnTour` : le commentaire `RÉVISION CHANTIER 1` (l.87) devient :

```ts
 * Les arcs en cours, les effets temporaires, le casier, la garde à vue et
 * l'offre spéciale ne survivent pas au départ : le `newGame` frais les remet
 * à leurs défauts vides (vérifié par test/tour.test.ts).
```

  et ajouter dans `test/tour.test.ts` (describe du départ en tournée) :

```ts
  it('le départ efface arcs, tempEffects et offre spéciale (le newGame frais)', () => {
    const state = newGame(42);
    state.rep = 100;
    state.pendingArcs = [{ arcId: 'flic-corrompu', stage: 0, nightsLeft: 2 }];
    state.tempEffects = [{ heatBuildMult: 0.8, nightsLeft: 3 }];
    state.arcsCompleted = ['fermier'];
    state.soundclashWon = true;
    const fresh = departOnTour(state);
    expect(fresh.pendingArcs).toEqual([]);
    expect(fresh.tempEffects).toEqual([]);
    expect(fresh.arcsCompleted).toEqual([]); // le fermier d'ici ne connaît pas la région d'à côté
    expect(fresh.specialOffer).toBeNull();
    expect(fresh.soundclashWon).toBe(false); // Volt se regagne — le clash est par tournée
  });
```

- [ ] `npx vitest run src/core/arcs.test.ts test/tour.test.ts` puis `npm run test && npm run build`. Harnais : **inchangés à cette tâche** — aucun event du deck aléatoire ne plante encore d'arc (le flic exige une négo réussie, jamais déclenchée par les politiques prudentes/évacuantes des harnais ; `weight: () => 0` garde les events d'arc hors tirage).
- [ ] Commit :

```
feat(core): les arcs de conséquences — moteur, flic corrompu, ⭐ des arcs finis

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

### Task 6: Journaliste & fermier — les arcs plantés par le jeu, le château débloqué par l'arc

Les deux arcs restants, plantés par du contenu **existant** : le prompt « un type filme » saisi **ou** l'event « La scène regarde » (journaliste — la spec dit « prompt ou event »), et l'option bière de « Un voisin au portail » (fermier). Le final du fermier : **heat −20 % permanente sur Champ paumé et Forêt** et le **Château squatté** exige désormais l'arc fini en plus de ses 350 rép (le `RÉVISION CHANTIER 1` de `data.ts` l.117 tombe). L'UI gagne le marqueur « suite » des events d'arc.

**Files:**
- `src/core/arcs.ts`
- `src/core/arcs.test.ts`
- `src/core/types.ts`
- `src/core/data.ts`
- `src/core/events.ts`
- `src/core/prompts.ts`
- `src/core/night.ts`
- `src/core/payout.ts`
- `src/core/progression.test.ts` (la politique de spots respecte `isSpotAvailable`)
- `src/ui/screens.ts`, `src/ui/strings.ts`

**Steps:**

- [ ] Étendre `src/core/arcs.test.ts` :

```ts
import { FERMIER_HEAT_MULT, FERMIER_SPOTS, arcSpotHeatMult } from './arcs';
import { NIGHT_EVENTS } from './events';
import { FLOOR_PROMPTS } from './prompts';
import { isSpotAvailable } from './payout';
import { seizeFloorPrompt } from './night';

describe('le journaliste', () => {
  it('le prompt « un type filme » saisi plante l’arc (chance 0.4)', () => {
    const filme = FLOOR_PROMPTS.find((p) => p.id === 'filme')!;
    expect(filme.seize.plantsArc).toEqual({ arcId: 'journaliste', chance: 0.4 });
    const { state, night } = playing();
    night.floorPrompt = { def: filme, expiresAt: night.t + 4 };
    night.rng = () => 0.1; // sous la chance
    seizeFloorPrompt(state, night);
    expect(state.pendingArcs).toEqual([{ arcId: 'journaliste', stage: 0, nightsLeft: 2 }]);
  });

  it("l'event « la scène regarde » plante aussi l'arc (spec : prompt OU event)", () => {
    const blog = NIGHT_EVENTS.find((e) => e.id === 'blog-scene')!;
    expect(blog.options[0].effects.plantsArc).toEqual({ arcId: 'journaliste', chance: 0.4 });
  });

  it("l'article sort : buzz ×1.6 et heat de départ +0.1 sur 3 nuits", () => {
    const { state, night } = playing();
    state.buzz = 0.5;
    state.pendingArcs = [{ arcId: 'journaliste', stage: 0, nightsLeft: 0 }];
    night.setElapsed = 9;
    night.nextEventAt = 9999;
    tickNight(state, night, 0.1);
    expect(night.pendingEvent?.def.id).toBe('journaliste-stage-0');
    resolveEvent(state, night, 0); // « Encadrer l'article à la buvette »
    expect(state.buzz).toBeCloseTo(0.8, 5);
    expect(state.tempEffects).toEqual([{ heatBuildMult: undefined, startHeatAdd: 0.1, nightsLeft: 3 }]);
    expect(state.arcsCompleted).toEqual(['journaliste']);
  });
});

describe('le fermier', () => {
  it('la bière au voisin plante l’arc (chance 0.5)', () => {
    const voisin = NIGHT_EVENTS.find((e) => e.id === 'voisin')!;
    expect(voisin.options[0].effects.plantsArc).toEqual({ arcId: 'fermier', chance: 0.5 });
  });

  it('inviter le fermier chaîne le stage 2 ; l’alliance rend champ et forêt −20 % de heat', () => {
    const { state, night } = playing();
    state.pendingArcs = [{ arcId: 'fermier', stage: 0, nightsLeft: 0 }];
    night.setElapsed = 9;
    night.nextEventAt = 9999;
    night.rng = () => 0;
    tickNight(state, night, 0.1);
    expect(night.pendingEvent?.def.id).toBe('fermier-stage-0');
    resolveEvent(state, night, 0); // l'inviter : vibe +0.1 ce soir, stage 2 dans 3 nuits
    expect(state.pendingArcs).toEqual([{ arcId: 'fermier', stage: 1, nightsLeft: 3 }]);
    state.pendingArcs[0].nightsLeft = 0;
    const n2 = createNight(state, 'champ', ['tonton'], 11);
    startSet(state, n2, 'tonton');
    n2.setElapsed = 9;
    n2.nextEventAt = 9999;
    tickNight(state, n2, 0.1);
    resolveEvent(state, n2, 0); // lui faire une place au feu
    expect(state.arcsCompleted).toEqual(['fermier']);
    expect(arcSpotHeatMult(state, 'champ')).toBeCloseTo(FERMIER_HEAT_MULT, 5);
    expect(arcSpotHeatMult(state, 'foret')).toBeCloseTo(FERMIER_HEAT_MULT, 5);
    expect(arcSpotHeatMult(state, 'hangar')).toBe(1);
    expect(FERMIER_SPOTS).toEqual(['champ', 'foret']);
    // et la heat monte bien moins vite au champ
    const allied = createNight(state, 'champ', ['tonton'], 13);
    startSet(state, allied, 'tonton');
    const witnessState = newGame(42);
    const witness = createNight(witnessState, 'champ', ['tonton'], 13);
    startSet(witnessState, witness, 'tonton');
    for (let t = 0; t < 5; t += 0.1) {
      allied.floorPrompt = null;
      witness.floorPrompt = null;
      tickNight(state, allied, 0.1);
      tickNight(witnessState, witness, 0.1);
    }
    expect(allied.heat).toBeLessThan(witness.heat);
  });

  it('le château exige rep 350 ET l’arc fermier (le rewire château)', () => {
    const state = newGame(42);
    state.rep = 400;
    expect(isSpotAvailable(state, 'chateau')).toBe(false); // la rep ne suffit plus
    state.arcsCompleted = ['fermier'];
    expect(isSpotAvailable(state, 'chateau')).toBe(true);
    state.rep = 300;
    expect(isSpotAvailable(state, 'chateau')).toBe(false); // l'arc ne suffit pas non plus
  });
});
```

- [ ] `npx vitest run src/core/arcs.test.ts` — échec : arcs `journaliste`/`fermier` inconnus, `arcSpotHeatMult` inexistant.
- [ ] `src/core/arcs.ts` — les deux arcs dans `ARCS`, et les helpers fermier :

```ts
  {
    // 📰 planté par le prompt « un type filme » saisi (prompts.ts)
    id: 'journaliste',
    stages: [
      {
        delay: [2, 2],
        event: {
          id: 'journaliste-stage-0',
          titre: '📰 L’article est sorti',
          texte:
            'Le type qui filmait écrivait pour un canard régional. « La rave fantôme qui rend la jeunesse au plateau » — trois pages, photos pleine page. La presse attire tout le monde. Y compris les bleus.',
          options: [
            {
              label: 'Encadrer l’article à la buvette',
              outcome: 'Le canard tourne de main en main. Le nom du sound est sur toutes les lèvres — et tous les procès-verbaux.',
              effects: { buzzMult: 1.6, tempHeat: { startHeatAdd: 0.1, nights: 3 }, arcComplete: 'journaliste' },
            },
            {
              label: 'Nier en bloc',
              outcome: '« Jamais entendu parler. » Le buzz monte quand même un peu — un démenti, c’est de la pub.',
              effects: { buzzMult: 1.2, arcComplete: 'journaliste' },
            },
          ],
          weight: () => 0,
        },
      },
    ],
  },
  {
    // 🚜 planté par « Un voisin au portail » résolu à la bière (events.ts)
    id: 'fermier',
    stages: [
      {
        delay: [1, 2],
        event: {
          id: 'fermier-stage-0',
          titre: '🚜 Le fermier repasse',
          texte:
            'Le voisin de l’autre soir revient — sans la robe de chambre, avec un pack de sa propre prune. Il regarde le mur de son comme on regarde une moissonneuse neuve.',
          options: [
            {
              label: 'L’inviter à la régie',
              outcome: 'Il passe la nuit à hocher la tête sur le kick. En partant : « j’ai des champs, moi. Et des copains qui ont des bois. »',
              effects: { vibe: 0.1, plantsArc: { arcId: 'fermier', stage: 1, chance: 1 } },
            },
            {
              label: 'Rester entre nous',
              outcome: 'Il repart avec sa prune. Dommage — il avait l’air d’en connaître, des coins.',
              effects: {},
            },
          ],
          weight: () => 0,
        },
      },
      {
        delay: [3, 3],
        event: {
          id: 'fermier-stage-1',
          titre: '🚜 L’allié',
          texte:
            'Le fermier débarque avec son tracteur, deux bottes de paille et un plan cadastral. « Mes terres, celles du cousin, le bois communal. Et le castel du vieux comte — personne n’y va jamais. »',
          options: [
            {
              label: 'Lui faire une place au feu',
              outcome: 'La famille s’agrandit. Le champ et la forêt sont à vous — et les clés du château squatté aussi.',
              effects: { vibe: 0.08, arcComplete: 'fermier' },
            },
            {
              label: 'Trinquer et noter le plan',
              outcome: 'Le plan cadastral rejoint la boîte à gants. Un allié pareil, ça ne se refuse pas.',
              effects: { arcComplete: 'fermier' },
            },
          ],
          weight: () => 0,
        },
      },
    ],
  },
```

  et après `getArc` :

```ts
/** L'alliance du fermier : heat de base −20 % permanente sur ses terres. */
export const FERMIER_HEAT_MULT = 0.8;
export const FERMIER_SPOTS = ['champ', 'foret'];

export function arcSpotHeatMult(state: GameState, spotId: string): number {
  return state.arcsCompleted.includes('fermier') && FERMIER_SPOTS.includes(spotId)
    ? FERMIER_HEAT_MULT
    : 1;
}
```

- [ ] `src/core/prompts.ts` — le prompt `filme` plante le journaliste :

```ts
    // filmer un champ vide ne vaut rien : poids 0 sous une vraie foule, rep modeste —
    // et le type écrit peut-être pour un canard (arc « journaliste », story E)
    seize: { rep: 2, heat: 0.03, plantsArc: { arcId: 'journaliste', chance: 0.4 } },
```

- [ ] `src/core/events.ts` — l'option bière de `voisin` :

```ts
      {
        label: 'Lui offrir une bière et la visite',
        outcome: 'Deux bières plus tard il hoche la tête sur le kick. On le reverra.',
        effects: { cash: -30, heat: -0.08, plantsArc: { arcId: 'fermier', chance: 0.5 } },
      },
```

  et le journaliste se plante « par le prompt saisi **ou un event** » (spec, story E) : l'option régie de `blog-scene` (le seul event du deck où l'on filme) gagne le même plant :

```ts
      {
        label: 'Lui faire visiter la régie',
        outcome: 'Ses stories tournent déjà. Le nom du sound circule.',
        effects: { rep: 12, heat: 0.05, plantsArc: { arcId: 'journaliste', chance: 0.4 } },
      },
```

- [ ] `src/core/types.ts` — `SpotDef` gagne `/** arc à mener à terme pour débloquer le spot (en plus de repReq) */ requiresArc?: string;`
- [ ] `src/core/data.ts` — le rewire château : retirer le commentaire `RÉVISION CHANTIER 1` (l.117–118) et poser le vrai déblocage :

```ts
  {
    // déblocage : arc « le fermier » mené à terme + rep 350 (story E — rewire fait)
    id: 'chateau',
    nom: 'Château squatté',
    description: 'Un castel oublié, un fermier complice. Prix libre généreux et les bleus loin derrière.',
    cap: 800,
    arrival: 2.4,
    heatBuild: 0.014,
    repReq: 350,
    requiresArc: 'fermier',
    tier: 5,
    duration: 540,
    setCount: 5,
    priceMult: 1,
    powerMult: 1,
    churnMult: 1,
    qualityMult: 1,
    donationMult: 1.3,
  },
```

- [ ] `src/core/payout.ts` — `isSpotAvailable` apprend l'arc :

```ts
export function isSpotAvailable(state: GameState, spotId: NightState['spotId']): boolean {
  const rules = buildRegionRules(state.region);
  if (rules.bannedSpotIds.includes(spotId)) return false;
  const spot = getSpot(spotId);
  if (spot.requiresArc && !state.arcsCompleted.includes(spot.requiresArc)) return false;
  const req = rules.repReqOverride[spotId] ?? spot.repReq;
  return state.rep >= req;
}
```

- [ ] `src/core/night.ts` — la grande ligne de heat de `tickNight` gagne `* arcSpotHeatMult(state, night.spotId)` (import depuis `./arcs`).
- [ ] `src/ui/strings.ts` : `arcSuiteTag: '📖 suite',` et le château verrouillé : `chateauLocked: 'Il faut un ami fermier (et 350 rép)',`.
- [ ] `src/ui/screens.ts` :
  - `showEvent` : si `pending.arc`, un chip avant le titre : `panel.append(el('div', 'arc-suite-tag', STR.arcSuiteTag));` (et `.arc-suite-tag { color: #d9a13b; font-size: 11px; letter-spacing: 0.1em; font-weight: 800; }` dans `style.css`). Les events d'arc résolus passent déjà au journal (via `resolveEvent`) — le recap mentionne donc les arcs avancés sans code de plus, comme la spec le demande.
  - `renderPrepare`, la carte de spot verrouillée : si `!unlocked` et `spot.requiresArc && !state.arcsCompleted.includes(spot.requiresArc)`, le texte devient `🔒 ${STR.chateauLocked}` (à la place du `repNeeded`).
- [ ] `src/core/progression.test.ts` — **la politique de spots du harnais respecte la légalité du jeu** : dans `autoCareer`, le filtre de spot devient :

```ts
      const spot = [...SPOTS]
        .filter((s) => s.id !== 'teknival' && isSpotAvailable(state, s.id))
        .at(-1)!;
```

  (import `isSpotAvailable` depuis `./payout`). Le château sort de la carrière gloutonne (l'arc fermier n'est jamais complété par l'autoplay : le stage 0 du fermier injecté choisit l'option 0 qui chaîne, le stage 1 complète… **si** le voisin-bière sort et que le RNG plante). Deux pins peuvent bouger :
  - le temps-vers-Teknival (le château 350 est remplacé par la friche 365 dans la rotation, et des events d'arc peuvent s'injecter) : re-pin par la procédure — lancer, lire, épingler `mesuré − 2` avec `// mesuré X nuits après requiresArc château + arcs injectés (story E)` ; garder `< 200`.
  - les bornes des 4 premières nuits (`≈ 492 €`, `rep ≥ 16`) : le `voisin` option 0 peut planter le fermier dès la nuit 1 et injecter son stage en nuit 2–3 (vibe +0.1, pas de coût), et `blog-scene` option 0 peut planter le journaliste (au stage : buzz ×1.6 mais heat de départ +0.1 sur 3 nuits) — si une borne casse, re-mesurer et re-pin avec commentaire.
  - `regions-harness.test.ts` : mêmes events possibles, asserts qualitatifs (`cash ≥ before`, `sunrise`) — l'arc fermier ne fait que baisser la heat et monter la vibe, vérifier au run que tout reste vert.
- [ ] `npm run test && npm run build`.
- [ ] Commit :

```
feat(core,ui): journaliste et fermier — les arcs du contenu existant, le château gagné

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

### Task 7: Recâblage du matos — burnout ralenti, négo +, évacuation sans malus

Les trois derniers fallbacks de `data.ts` deviennent de vrais leviers sur les mécaniques du chantier 1 :
- **lumières voie A (Hypnose)** : « burnout de foule ralenti » — le fallback `churnMult` est remplacé par `burnoutMult` sur la **charge de burnout** (story A).
- **logistique voie A (Réseau)** : « descente retardée, négo + » — le compte à rebours profite déjà du `logTier` (partie 1) ; le « négo + » devient `negoBonus` sur `negoChance` (story C).
- **logistique voie B (Mobilité)** : « évacuation sans malus de rep » — `evacRepFree` sur les tiers 4–5 annule le ×0.4 de rep de l'évacuation (le ×0.8 de buzz reste : on parle de toi, mais en bien).

**Files:**
- `src/core/types.ts`
- `src/core/data.ts`
- `src/core/night.ts`
- `src/core/raid.ts`
- `src/core/payout.ts`
- `src/core/raid.test.ts` (créé par la partie 1)
- `src/core/energy.test.ts` (créé par la partie 1)
- `src/core/progression.test.ts` (re-pin éventuel)

**Steps:**

- [ ] Étendre `src/core/energy.test.ts` (describe « la vague ») :

```ts
  it('lumières voie A : le burnout de foule charge moins vite (rewire fait)', () => {
    const plain = playingNight(9);
    setIntensity(plain.night, 'rinse');
    tickFor(plain.state, plain.night, 8);
    const hypnose = playingNight(9);
    hypnose.state.gear.lumieres = 4;
    hypnose.state.gearBranch.lumieres = 'A'; // Spirale de lasers : burnout ×0.7
    setIntensity(hypnose.night, 'rinse');
    tickFor(hypnose.state, hypnose.night, 8);
    expect(hypnose.night.burnout).toBeCloseTo(plain.night.burnout * 0.7, 2);
  });
```

- [ ] Étendre `src/core/raid.test.ts` (describe « négocier » + « évacuer ») :

```ts
  it('logistique voie A : le réseau de la scène améliore la négo (negoBonus)', () => {
    const { state, night } = playing();
    setIntensity(night, 'rinse'); // retire le +0.2 « ≤ GROOVE » pour lire le bonus sous le cap
    state.gear.logistique = 3;
    state.gearBranch.logistique = 'B'; // Mobilité : pas de bonus de négo
    expect(negoChance(state, night)).toBeCloseTo(0.25 + 0.15 * 3, 5); // 0.7
    state.gearBranch.logistique = 'A'; // Réseau de la scène : +0.05
    expect(negoChance(state, night)).toBeCloseTo(0.75, 5);
    state.gear.logistique = 5; // La scène entière : +0.12 (logTier plafonné à 3)
    expect(negoChance(state, night)).toBeCloseTo(0.82, 5);
  });

  it('logistique voie B tier 4+ : l’évacuation ne coûte plus de rep (evacRepFree)', () => {
    function evacRep(withConvoi: boolean): number {
      const state = newGame(42);
      if (withConvoi) {
        state.gear.logistique = 4; // Caravane éclair
        state.gearBranch.logistique = 'B';
      }
      const night = createNight(state, 'champ', ['tonton'], 7);
      startSet(state, night, 'tonton');
      night.heat = 0.86;
      tickNight(state, night, 0.1);
      raidEvacuer(state, night);
      Object.assign(night, { t: 100, bank: 0, peakCrowd: 30, vibeSum: 80, vibeSamples: 100 });
      return settleNight(state, night).repGained;
    }
    // sans le convoi : rep ×0.4 ; avec : plein tarif
    expect(evacRep(true)).toBeGreaterThan(evacRep(false));
    expect(evacRep(false)).toBe(Math.round(evacRep(true) * 0.4));
  });
```

- [ ] `npx vitest run src/core/energy.test.ts src/core/raid.test.ts` — échecs : `burnoutMult`/`negoBonus`/`evacRepFree` inexistants.
- [ ] `src/core/types.ts` — `GearEffects` gagne (et perd ses derniers commentaires de fallback) :

```ts
  /** lumières A — le burnout de foule charge moins vite (rewire chantier 1 fait) */
  burnoutMult?: number;
  /** logistique A — bonus plat sur la proba de négociation de descente */
  negoBonus?: number;
  /** logistique B (tiers 4+) — l'évacuation propre ne coûte plus de rep */
  evacRepFree?: boolean;
```

  Le doc de `churnMult` se resserre : `/** mur A — la foule reste (multiplie le churn) */`.
- [ ] `src/core/data.ts` — les trois blocs, commentaires `RÉVISION CHANTIER 1` retirés :

```ts
    // voie A — Hypnose : vibe +, le burnout de foule charge moins vite (rewire fait)
    { category: 'lumieres', tier: 3, branch: 'A', nom: 'Show hypnose', price: 5500, value: 0.24, seizable: true, effects: { burnoutMult: 0.8 } },
    { category: 'lumieres', tier: 4, branch: 'A', nom: 'Spirale de lasers', price: 4000, value: 0.28, seizable: true, effects: { burnoutMult: 0.7 } },
    { category: 'lumieres', tier: 5, branch: 'A', nom: 'Aurore artificielle', price: 10000, value: 0.32, seizable: true, effects: { burnoutMult: 0.6 } },
```

```ts
    // voie A — Réseau : la chaleur monte moins ET la négo de descente s'arrange (rewire fait)
    { category: 'logistique', tier: 3, branch: 'A', nom: 'Réseau de la scène', price: 6000, value: 0.55, seizable: true, effects: { negoBonus: 0.05 } },
    { category: 'logistique', tier: 4, branch: 'A', nom: 'Toile d’indics', price: 4000, value: 0.48, seizable: true, effects: { negoBonus: 0.08 } },
    { category: 'logistique', tier: 5, branch: 'A', nom: 'La scène entière', price: 10000, value: 0.4, seizable: true, effects: { negoBonus: 0.12 } },
```

```ts
    // voie B — Mobilité : cautions −50 %, et dès le tier 4 l'évacuation sans malus de rep (rewire fait)
    { category: 'logistique', tier: 3, branch: 'B', nom: 'Convoi mobile', price: 6000, value: 0.6, seizable: true, effects: { cautionMult: 0.5 } },
    { category: 'logistique', tier: 4, branch: 'B', nom: 'Caravane éclair', price: 4000, value: 0.55, seizable: true, effects: { cautionMult: 0.5, evacRepFree: true } },
    { category: 'logistique', tier: 5, branch: 'B', nom: 'Flotte insaisissable', price: 10000, value: 0.48, seizable: true, effects: { cautionMult: 0.35, evacRepFree: true } },
```

- [ ] `src/core/night.ts` :
  - La ligne de burnout (bloc vague, partie 1) apprend les lumières :

```ts
  // burnout : charge à PEAK/RINSE (les lumières Hypnose la ralentissent), décharge sinon
  const burnoutCharge = (BURNOUT_CHARGE[night.intensity] ?? 0) * (ownedGear(state, 'lumieres').effects?.burnoutMult ?? 1);
  const burnoutRate = burnoutCharge > 0 ? burnoutCharge : -(BURNOUT_DECAY[night.intensity] ?? 0);
  night.burnout = clamp(night.burnout + burnoutRate * dt, 0, 1);
```

  - `branchChurnMult` ne lit plus que le mur (les lumières A n'ont plus de `churnMult`) :

```ts
/** churnMult de voie (mur Infrabasses) — les lumières Hypnose jouent sur le burnout. */
export function branchChurnMult(state: GameState): number {
  return ownedGear(state, 'mur').effects?.churnMult ?? 1;
}
```

- [ ] `src/core/raid.ts` — `negoChance` :

```ts
export function negoChance(state: GameState, night: NightState): number {
  const dj = night.currentDj ? getDj(night.currentDj) : null;
  let p = 0.25 + 0.15 * logTier(state);
  p += ownedGear(state, 'logistique').effects?.negoBonus ?? 0; // voie Réseau
  if (dj?.risk === 'discret') p += 0.15;
  if (INTENSITY_LEVEL[night.intensity] <= INTENSITY_LEVEL.groove) p += 0.2;
  return Math.min(0.9, p);
}
```

  (import `ownedGear` depuis `./data`)
- [ ] `src/core/payout.ts` — `settleNight`, la ligne `evacMult` (partie 1, task 7) :

```ts
  // l'évacuation coûte ×0.4 de rep — sauf convoi voie Mobilité tier 4+ (rewire fait)
  const evacMult = night.evacuated
    ? ownedGear(state, 'logistique').effects?.evacRepFree
      ? 1
      : 0.4
    : 1;
```

- [ ] Vérifier les lecteurs : `grep -rn "churnMult" src/ test/` — `branchChurnMult` (corrigé), `modifiers.ts`/`regions.ts` (leurs propres champs homonymes, intacts), tests éventuels des lumières voie A dans `test/` (aucun connu — corriger au besoin avec la valeur mesurée).
- [ ] `npm run test && npm run build`. **Pins en mouvement possibles** : `progression.test.ts` (`autoCareer` achète les lumières voie A → la rétention perd le `churnMult` mais l'autoplay suit l'attente sans camper PEAK/RINSE, donc le burnout joue peu) — si la borne temps-vers-Teknival casse, re-pin avec `// mesuré X nuits après le rewire lumières/logistique`. `regions-harness.test.ts` : tier 0 partout, intouché.
- [ ] Commit :

```
feat(core): recâblage matos — burnout hypnose, négo réseau, évacuation mobile

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

### Task 8: Docs & balayage final — le PRD amendé, zéro RÉVISION CHANTIER 1

Le PRD raconte la nuit telle qu'elle est désormais (la partie 1 a réécrit le §4.1 « sets, not faders » ; on y ajoute les nuits spéciales et les arcs, et le journal des décisions), la note « Le PRD sera amendé » de la spec est cochée, et le grep de fin de chantier rend **zéro**.

**Files:**
- `PRD.md`
- `docs/superpowers/specs/2026-06-12-night-loop-overhaul-design.md`

**Steps:**

- [ ] `PRD.md` — §4 (« The active loop — a night ») : après le §4.2 (events), insérer un §4.3 et renuméroter les sous-sections suivantes si besoin (vérifier la numérotation réelle au moment de l'édition — le §4.1 a déjà été réécrit par la partie 1) :

```md
### 4.3 Special nights & consequence arcs

Variety comes from **outside the simulation** (night-loop overhaul, stories D/E):

- **Special night offers** — from rep ≥ 12, ~1 night in 3 the prepare screen shows a
  one-night offer (accept or leave): *soundclash* (beat a simulated rival's wave score
  on 2 of 4 night phases → rep ×1.5 and their headliner **Volt** joins the recruitment
  pool at −30 % cut), *teuf privée* (cash up front = 3× the spot's capacity, crowd
  capped at 60 %, zero rep, contract: imposed genre, never RINSE, no police raid —
  breach refunds 60 %), *anniversaire de la scène* (rep ×2, demanding crowd) and
  *nuit à thème* (single drawn genre, narrow tolerance, drops +40 %, bar ×1.3).
  Accepted constraints lock the prepare screen; a contract badge lives in the night HUD.
- **Consequence arcs** — event/prompt choices can plant a multi-night arc
  (`pendingArcs`, due in 1–3 nights, injected as a priority modal event): the corrupt
  cop (planted by a successful raid negotiation — pay again, then a 800 € « forfait »
  that clears the casier, or denounce him), the journalist (planted by the « un type
  filme » floor prompt — buzz ×1.6 but hotter starts for 3 nights), and the farmer
  (planted by buying the neighbor a beer — ends in a permanent −20 % heat on Champ
  paumé and Forêt **and unlocks the Château squatté**, which requires the finished arc
  on top of its 350 rep). Finished arcs are worth +1 ⭐ Légende each at tour departure.
```

- [ ] `PRD.md` — Appendix « Key decisions log », ajouter à la suite du n° 19 :

```md
| 20 | **Night-loop overhaul (chantier 1)**: the brief is replaced by 4 tappable intensity crans played against a visible crowd attente (tolerance/charisme/burnout/waveScore); nights run a scripted 4-phase arc (rep ×2 at dawn); heat ≥ 0.85 opens a playable descente (evacuate/negotiate/hold the wall) with persistent casier & garde à vue |
| 21 | Variety lives outside the sim: special night offers at prepare (soundclash → Volt, teuf privée, anniversaire, nuit à thème) and consequence arcs planted by choices (corrupt cop, journalist, farmer → château squatté) |
| 22 | Gameplay-gated unlocks are canon: Volt joins only crews that beat him in a soundclash; the château requires the finished farmer arc on top of reputation |
```

- [ ] `docs/superpowers/specs/2026-06-12-night-loop-overhaul-design.md` — la ligne « Le PRD sera amendé (le brief y est décrit §4.1) une fois la Story A shippée. » devient :

```md
Le PRD a été amendé : §4.1 réécrit avec la Story A (partie 1), §4.3 + décisions 20–22
ajoutés avec les Stories D/E (partie 2). ✅
```

- [ ] **Le balayage final du chantier** — chaque commande doit rendre exactement ce qui est annoncé :
  - `grep -rn "RÉVISION CHANTIER 1" src/ server/ tools/` → **zéro résultat** (les seules occurrences restantes du repo vivent dans `docs/`, qui racontent l'histoire — c'est voulu).
  - `grep -rn "pousserPowerFree\|forceBrief\|BRIEF_" src/ test/` → zéro (héritage partie 1, re-vérifié).
  - `npm run test && npm run build` → verts.
- [ ] Commit :

```
docs(prd,spec): nuits spéciales et arcs au PRD — le chantier 1 est soldé

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

## Checklist de fin de chantier (à valider après la dernière tâche)

- [ ] `grep -rn "RÉVISION CHANTIER 1" src/ server/ tools/` retourne **ZÉRO** résultat.
- [ ] `npm run test && npm run build` verts.
- [ ] Harnais déterministes verts : `npx vitest run src/core/progression.test.ts src/core/regions-harness.test.ts` — chaque pin déplacé porte son commentaire `// mesuré …`.
- [ ] Les 4 nuits spéciales sont jouables à la main (`npm run dev`, `rep ≥ 12`) : carte d'offre, verrous de prépa, badge HUD, recap.
- [ ] Le flic corrompu se plante en négociant une descente, le journaliste en saisissant « un type filme », le fermier à la bière du voisin — et le château s'ouvre à l'arc fini + 350 rép.
- [ ] Volt n'apparaît jamais sans victoire au soundclash, et apparaît à −30 % de cut après.
- [ ] La spec porte la coche « Le PRD a été amendé ».
