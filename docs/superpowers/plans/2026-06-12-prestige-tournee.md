# Prestige « La Tournée » Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal**: Une méta-boucle de prestige : après une victoire au Teknival, le joueur peut « partir en tournée » — abandonner sa progression contre des ⭐ Légende permanentes, dépensées dans la boutique « L'Héritage » (confort de départ, tier mythique, DJs légendaires), en emmenant le fondateur + un vétéran choisi.

**Architecture**: Un nouveau module pur `src/core/tour.ts` (calcul de ⭐, `departOnTour`, achat de perks, `applyPerks` en un seul point à la création de partie). Les données vivent dans `data.ts` (PERKS, items mythiques, DJs légendaires gated par perk), l'état dans un bloc `GameState.tour` qui survit au reset et migre depuis les vieilles saves. L'UI reste mince : carte départ + modal sur l'écran de prépa, panneau Héritage, le tout dans `screens.ts`/`main.ts`.

**Tech Stack**: TypeScript strict + Vite, vanilla DOM, vitest (`npm run test`), build `npm run build` (= `tsc && vite build`). Pas d'environnement DOM dans vitest : les écrans n'ont aucun test unitaire dans ce repo (zéro test existant sur `screens.ts`) — les tâches UI sont vérifiées par `tsc`/build + smoke manuel.

**Notes transverses**:
- **RÉVISION CHANTIER 1** (night-loop overhaul, PAS implémenté) : les « murs tenus », arcs, garde à vue et soundclash n'existent pas encore. Partout où le spec les référence, ce plan pose un fallback marqué `RÉVISION CHANTIER 1:` pour le recâblage.
- **RÉVISION CHANTIER 2** (plan économie) : ce plan est écrit contre le code actuel du repo (matos tiers 0–3, 8 DJs, Teknival à 500 rep). Si le plan économie est mergé d'abord (tiers 4–5, branches, 12 DJs), les notes `RÉVISION CHANTIER 2:` listent les ajustements (comptes dans `test/data.test.ts`, prix mythiques ≈ 25 000 €, position du tier mythique en bout de voie). Le gate mythique est porté par le flag `mythic: true`, **pas** par un numéro de tier — il survit au rebasage.
- **Harness déterministe** : `src/core/progression.test.ts` joue des nuits au Champ paumé avec un état `newGame` sans perk. Aucune tâche de ce plan ne change l'équilibrage d'une partie fraîche sans perk (mythique inachetable, légendaires cachés, perks vides) → **aucune expectation du harness ne change**. Chaque tâche doit le laisser vert.

---

### Task 1: Le bloc `tour` — types, `newGame`, migration de save

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/save.ts`
- Create: `test/tour.test.ts`

- [ ] Écrire le test qui échoue dans `test/tour.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { deserialize, newGame, serialize } from '../src/core/save';

describe('le bloc tour', () => {
  it('newGame démarre en tournée 1, 0 ⭐, sans perks ni vétérans', () => {
    const state = newGame();
    expect(state.tour).toEqual({ number: 1, legende: 0, perks: [], veteranIds: [], teknivalWins: 0 });
  });

  it('migre une vieille save v2 sans bloc tour : tournée 1, 0 ⭐', () => {
    const legacy = JSON.parse(serialize(newGame())) as Record<string, unknown>;
    delete legacy.tour;
    const loaded = deserialize(JSON.stringify(legacy));
    expect(loaded).not.toBeNull();
    expect(loaded?.tour).toEqual({ number: 1, legende: 0, perks: [], veteranIds: [], teknivalWins: 0 });
  });

  it('roundtrip de save conserve le bloc tour', () => {
    const state = newGame();
    state.tour.number = 3;
    state.tour.legende = 12;
    state.tour.perks = ['camion-amenage'];
    expect(deserialize(serialize(state))?.tour).toEqual(state.tour);
  });
});
```

- [ ] Lancer `npx vitest run test/tour.test.ts` — échec attendu : `state.tour` est `undefined` (« expected undefined to deeply equal { number: 1, … } »).
- [ ] Implémentation minimale. Dans `src/core/types.ts`, ajouter après l'interface `RepairJob` (ligne ~104) :

```ts
/** Méta-progression : la tournée courante et l'Héritage. Survit au départ en tournée. */
export interface TourState {
  /** numéro de la tournée en cours (1 = première partie) */
  number: number;
  /** ⭐ Légende en banque — la monnaie permanente de l'Héritage */
  legende: number;
  /** ids des perks achetés ; un id stackable apparaît plusieurs fois */
  perks: string[];
  /** ids des vétérans emmenés au départ de cette tournée (hors fondateur) */
  veteranIds: string[];
  /** victoires au Teknival sur cette tournée — remis à zéro à chaque départ */
  teknivalWins: number;
}
```

  et dans `GameState`, après `wonTeknival: boolean;` :

```ts
  tour: TourState;
```

- [ ] Dans `src/core/save.ts` : changer l'import de types en `import type { GameState, TourState } from './types';`, ajouter avant `newGame` :

```ts
export function defaultTour(): TourState {
  return { number: 1, legende: 0, perks: [], veteranIds: [], teknivalWins: 0 };
}
```

  dans `newGame`, ajouter au littéral retourné, après `wonTeknival: false,` :

```ts
    tour: defaultTour(),
```

  et remplacer `deserialize` (la version est inchangée, v2 ; le bloc absent est patché) :

```ts
/** Vieille save v2 d'avant la tournée : bloc `tour` absent = tournée 1, 0 ⭐. */
function migrate(state: GameState): GameState {
  if (!state.tour) state.tour = defaultTour();
  return state;
}

/** v1 saves (different game) fall back to a fresh start. */
export function deserialize(json: string): GameState | null {
  try {
    const parsed = JSON.parse(json);
    return isValidState(parsed) ? migrate(parsed) : null;
  } catch {
    return null;
  }
}
```

- [ ] Lancer `npx vitest run test/tour.test.ts` — vert. Puis `npm run test && npm run build` — tout vert (les `toEqual` de `test/save.test.ts` roundtrippent le nouveau bloc sans modification).
- [ ] Commit :

```bash
git add src/core/types.ts src/core/save.ts test/tour.test.ts
git commit -m "feat(core): la tournée a un état — bloc tour et migration de save

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: L'Héritage — catalogue PERKS et achat en ⭐

**Files:**
- Modify: `src/core/data.ts`
- Create: `src/core/tour.ts`
- Test: `test/tour.test.ts`

- [ ] Écrire le test qui échoue — ajouter à `test/tour.test.ts` :

```ts
import { PERKS } from '../src/core/data';
import { buyPerk, canBuyPerk, hasPerk, maxVeterans, perkCount } from '../src/core/tour';

describe('l’Héritage : le catalogue', () => {
  it('expose les 8 familles de perks du spec', () => {
    const ids = PERKS.map((p) => p.id);
    expect(ids).toContain('camion-amenage');
    expect(ids).toContain('carnet-adresses');
    expect(ids).toContain('reputation-precede');
    expect(ids).toContain('matos-planque');
    expect(ids).toContain('famille');
    expect(ids).toContain('tournee-infernale');
    expect(PERKS.filter((p) => p.id.startsWith('mythe-'))).toHaveLength(5);
    expect(PERKS.filter((p) => p.id.startsWith('tete-'))).toHaveLength(2);
  });

  it('coûte le tarif du spec', () => {
    const cost = Object.fromEntries(PERKS.map((p) => [p.id, p.cost]));
    expect(cost['camion-amenage']).toBe(2);
    expect(cost['carnet-adresses']).toBe(3);
    expect(cost['reputation-precede']).toBe(3);
    expect(cost['matos-planque']).toBe(4);
    expect(cost['famille']).toBe(5);
    expect(cost['mythe-mur']).toBe(6);
    expect(cost['tete-sansnom']).toBe(8);
    expect(cost['tournee-infernale']).toBe(5);
  });
});

describe('l’Héritage : achat', () => {
  it('dépense la ⭐ Légende et enregistre le perk', () => {
    const state = newGame();
    state.tour.legende = 5;
    expect(buyPerk(state, 'camion-amenage')).toBe(true);
    expect(state.tour.legende).toBe(3);
    expect(hasPerk(state, 'camion-amenage')).toBe(true);
  });

  it('refuse sans solde, refuse au-delà du stack max', () => {
    const state = newGame();
    state.tour.legende = 1;
    expect(canBuyPerk(state, 'camion-amenage')).toBe(false);
    expect(buyPerk(state, 'camion-amenage')).toBe(false);
    state.tour.legende = 20;
    expect(buyPerk(state, 'camion-amenage')).toBe(true);
    expect(buyPerk(state, 'camion-amenage')).toBe(false); // unique
    expect(buyPerk(state, 'famille')).toBe(true);
    expect(buyPerk(state, 'famille')).toBe(true); // stack ×2
    expect(buyPerk(state, 'famille')).toBe(false);
    expect(perkCount(state, 'famille')).toBe(2);
  });

  it('maxVeterans : 1 de base, +1 par stack de « famille »', () => {
    const state = newGame();
    expect(maxVeterans(state)).toBe(1);
    state.tour.perks = ['famille', 'famille'];
    expect(maxVeterans(state)).toBe(3);
  });
});
```

- [ ] Lancer `npx vitest run test/tour.test.ts` — échec attendu : `Cannot find module '../src/core/tour'` (et `PERKS` non exporté par data.ts).
- [ ] Implémentation. Dans `src/core/data.ts`, ajouter en fin de fichier (après `getDj`) :

```ts
// --- l'Héritage : les perks permanents, achetés en ⭐ Légende -------------------
// Note : total achetable = 73 ⭐ (le spec annonce 68 en comptant « famille » une
// seule fois ; le stack ×2 ajoute 5 ⭐). 5–6 tournées pour tout voir, inchangé.

export interface PerkDef {
  id: string;
  nom: string;
  description: string;
  /** coût en ⭐ Légende */
  cost: number;
  /** nombre d'achats possibles (1 = unique, 2 = stackable ×2) */
  max: number;
}

export const PERKS: PerkDef[] = [
  {
    id: 'camion-amenage',
    nom: 'Le camion aménagé',
    description: 'Départ en tournée avec 1 500 € planqués dans la boîte à gants.',
    cost: 2,
    max: 1,
  },
  {
    id: 'carnet-adresses',
    nom: 'Carnet d’adresses',
    description: 'La scène te connaît : les DJs rejoignent le crew à 70 % de leur seuil de rép.',
    cost: 3,
    max: 1,
  },
  {
    id: 'reputation-precede',
    nom: 'La réputation qui précède',
    description: 'Départ avec 30 rép — la Forêt est ouverte direct.',
    cost: 3,
    max: 1,
  },
  {
    id: 'matos-planque',
    nom: 'Matos planqué',
    description: 'Une cache dans chaque région : départ avec le tier 1 partout.',
    cost: 4,
    max: 1,
  },
  {
    id: 'famille',
    nom: 'La famille s’agrandit',
    description: '+1 vétéran emmené à chaque départ en tournée (cumulable ×2).',
    cost: 5,
    max: 2,
  },
  {
    id: 'mythe-platines',
    nom: 'Mythes du son : les platines',
    description: 'Débloque la cabine mythique — achetable en € en partie, qualité au-delà de tout.',
    cost: 6,
    max: 1,
  },
  {
    id: 'mythe-mur',
    nom: 'Mythes du son : le mur',
    description: 'Débloque le mur mythique — la foule en sur-cap de 10 % au-dessus du tier max.',
    cost: 6,
    max: 1,
  },
  {
    id: 'mythe-groupe',
    nom: 'Mythes du son : le groupe',
    description: 'Débloque la centrale mythique — jamais de coupure, même à la carrière.',
    cost: 6,
    max: 1,
  },
  {
    id: 'mythe-lumieres',
    nom: 'Mythes du son : les lumières',
    description: 'Débloque l’aurore artificielle — l’ambiance ne retombe plus.',
    cost: 6,
    max: 1,
  },
  {
    id: 'mythe-logistique',
    nom: 'Mythes du son : la logistique',
    description: 'Débloque la toile invisible — les bleus cherchent encore l’entrée.',
    cost: 6,
    max: 1,
  },
  {
    id: 'tete-sansnom',
    nom: 'Tête d’affiche : DJ Sans Nom',
    description: 'Un DJ légendaire (5/5, 35 % de cut) rejoint le pool. Insaisissable — les bleus ne le voient pas.',
    cost: 8,
    max: 1,
  },
  {
    id: 'tete-comete',
    nom: 'Tête d’affiche : La Comète',
    description: 'Une DJ légendaire (5/5, 35 % de cut) rejoint le pool. Increvable — la fatigue glisse sur elle.',
    cost: 8,
    max: 1,
  },
  {
    id: 'tournee-infernale',
    nom: 'Tournée infernale',
    description: 'Les régions difficiles donnent +50 % de ⭐ Légende au départ.',
    cost: 5,
    max: 1,
  },
];

export function getPerk(id: string): PerkDef {
  const perk = PERKS.find((p) => p.id === id);
  if (!perk) throw new Error(`unknown perk: ${id}`);
  return perk;
}
```

  > RÉVISION CHANTIER 4 : `tournee-infernale` est **stocké et achetable** ici, mais son effet (+50 % sur les régions difficiles) se branche dans le multiplicateur de région du chantier 4 — aucun câblage dans ce plan.

- [ ] Créer `src/core/tour.ts` :

```ts
import { getPerk } from './data';
import type { GameState } from './types';

// --- l'Héritage : perks permanents ---------------------------------------------

export function hasPerk(state: GameState, perkId: string): boolean {
  return state.tour.perks.includes(perkId);
}

/** Nombre de stacks possédés (un perk unique vaut 0 ou 1). */
export function perkCount(state: GameState, perkId: string): number {
  return state.tour.perks.filter((p) => p === perkId).length;
}

export function canBuyPerk(state: GameState, perkId: string): boolean {
  const def = getPerk(perkId);
  return perkCount(state, perkId) < def.max && state.tour.legende >= def.cost;
}

/** Achat définitif : la ⭐ part, le perk reste pour toutes les tournées. */
export function buyPerk(state: GameState, perkId: string): boolean {
  if (!canBuyPerk(state, perkId)) return false;
  state.tour.legende -= getPerk(perkId).cost;
  state.tour.perks.push(perkId);
  return true;
}

/** Vétérans emmenables au départ : 1 de base, +1 par stack de « famille ». */
export function maxVeterans(state: GameState): number {
  return 1 + perkCount(state, 'famille');
}
```

- [ ] Lancer `npx vitest run test/tour.test.ts` — vert. Puis `npm run test && npm run build` — vert.
- [ ] Commit :

```bash
git add src/core/data.ts src/core/tour.ts test/tour.test.ts
git commit -m "feat(core): l'Héritage ouvre boutique — 13 perks permanents en ⭐ Légende

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `computeLegende` + compteur de victoires Teknival

**Files:**
- Modify: `src/core/tour.ts`
- Modify: `src/core/payout.ts`
- Test: `test/tour.test.ts`

- [ ] Écrire le test qui échoue — ajouter à `test/tour.test.ts` (compléter les imports existants : `computeLegende` depuis `../src/core/tour`, `createNight` depuis `../src/core/night`, `settleNight` depuis `../src/core/payout`) :

```ts
import { computeLegende } from '../src/core/tour';
import { createNight } from '../src/core/night';
import { settleNight } from '../src/core/payout';

describe('computeLegende', () => {
  it('compte floor(rep/100) + 3 par victoire Teknival de la tournée', () => {
    const state = newGame();
    state.rep = 530;
    state.tour.teknivalWins = 2;
    expect(computeLegende(state)).toBe(5 + 6);
  });

  it('une première tournée type vaut 10–14 ⭐', () => {
    const state = newGame();
    state.rep = 800; // rep plausible après une victoire au Teknival
    state.tour.teknivalWins = 1;
    const legende = computeLegende(state);
    expect(legende).toBeGreaterThanOrEqual(10);
    expect(legende).toBeLessThanOrEqual(14);
  });
});

describe('le compteur de victoires Teknival', () => {
  it('settleNight au teknival incrémente teknivalWins de la tournée', () => {
    const state = newGame();
    state.rep = 1000;
    const night = createNight(state, 'teknival', ['tonton'], 2);
    Object.assign(night, {
      t: 600,
      phase: 'ended',
      sunrise: true,
      bank: 5000,
      peakCrowd: 900,
      vibeSum: 540,
      vibeSamples: 600,
      playedSets: [{ djId: 'tonton', brief: 'normal' }],
    });
    settleNight(state, night);
    expect(state.tour.teknivalWins).toBe(1);
    expect(state.wonTeknival).toBe(true);
  });
});
```

- [ ] Lancer `npx vitest run test/tour.test.ts` — échec attendu : `computeLegende` n'est pas exporté, et `teknivalWins` reste à 0 après `settleNight`.
- [ ] Implémentation. Dans `src/core/tour.ts`, ajouter en fin de fichier :

```ts
// --- le gain de ⭐ Légende, calculé au moment du départ ---------------------------

/** ⭐ par victoire au Teknival sur la tournée. */
export const LEGENDE_PER_TEKNIVAL = 3;

/**
 * legende = floor(rep / 100) + 3 × victoires Teknival cette tournée
 *         + 1 par « mur tenu » + 1 par arc mené à terme.
 *
 * RÉVISION CHANTIER 1: les « murs tenus » (tag légende, Story C) et les arcs
 * n'existent pas encore — leurs hooks restent à 0 ici. Quand le chantier 1
 * pose ses compteurs sur GameState, les brancher dans ces deux constantes.
 */
export function computeLegende(state: GameState): number {
  const mursTenus = 0;
  const arcsTermines = 0;
  return (
    Math.floor(state.rep / 100) +
    state.tour.teknivalWins * LEGENDE_PER_TEKNIVAL +
    mursTenus +
    arcsTermines
  );
}
```

- [ ] Dans `src/core/payout.ts`, fonction `settleNight` (ligne ~51), remplacer :

```ts
  if (won) state.wonTeknival = true;
```

  par :

```ts
  if (won) {
    state.wonTeknival = true;
    state.tour.teknivalWins += 1;
  }
```

- [ ] Lancer `npx vitest run test/tour.test.ts` — vert. Puis `npm run test && npm run build` — vert (le harness `src/core/progression.test.ts` joue au champ, jamais au teknival : inchangé).
- [ ] Commit :

```bash
git add src/core/tour.ts src/core/payout.ts test/tour.test.ts
git commit -m "feat(core): la ⭐ Légende se calcule — rep et victoires Teknival de la tournée

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `departOnTour` — le reset gourmand, les vétérans, `applyPerks` en un seul point

**Files:**
- Modify: `src/core/tour.ts`
- Test: `test/tour.test.ts`

- [ ] Écrire le test qui échoue — ajouter à `test/tour.test.ts` (compléter les imports : `applyPerks`, `departOnTour` depuis `../src/core/tour`, `GEAR`, `GEAR_CATEGORIES` depuis `../src/core/data`, `type GameState` depuis `../src/core/types`) :

```ts
import { applyPerks, departOnTour } from '../src/core/tour';
import { GEAR, GEAR_CATEGORIES } from '../src/core/data';
import type { GameState } from '../src/core/types';

function richState(): GameState {
  const state = newGame(1000);
  state.cash = 40000;
  state.rep = 800;
  state.buzz = 1.2;
  state.busts = 2;
  state.nights = 30;
  state.gear = { platines: 3, mur: 3, groupe: 2, lumieres: 2, logistique: 3 };
  state.damaged.mur = true;
  state.repairs.push({ category: 'mur', readyAt: 99999 });
  state.pseudo = 'DJ Bagarre';
  state.bestCrowd = 1500;
  state.bestPayout = 9000;
  state.wonTeknival = true;
  state.tour.legende = 4;
  state.tour.teknivalWins = 1;
  state.crew[0].xp = 600; // tonton a grandi
  state.crew.push({ id: 'gamine', xp: 750, fatigue: 0.7, setsPlayed: 12 });
  state.crew.push({ id: 'kilowatt', xp: 100, fatigue: 0.2, setsPlayed: 3 });
  return state;
}

describe('departOnTour : le reset', () => {
  it('réinitialise exactement caisse, matos, rep, buzz, casier, dégâts, réparations, victoire', () => {
    const next = departOnTour(richState(), ['gamine']);
    expect(next.cash).toBe(0);
    expect(next.rep).toBe(0);
    expect(next.buzz).toBe(0);
    expect(next.busts).toBe(0);
    expect(next.gear).toEqual({ platines: 0, mur: 0, groupe: 0, lumieres: 0, logistique: 0 });
    expect(next.damaged).toEqual({});
    expect(next.repairs).toEqual([]);
    expect(next.wonTeknival).toBe(false);
    expect(next.tour.teknivalWins).toBe(0);
  });

  it('conserve la ⭐ cumulée, les perks, le n° de tournée, le pseudo et les records all-time', () => {
    const state = richState();
    state.tour.perks = ['tournee-infernale'];
    const next = departOnTour(state, []);
    expect(next.tour.number).toBe(2);
    expect(next.tour.legende).toBe(4 + 11); // 4 en banque + floor(800/100) + 3×1
    expect(next.tour.perks).toEqual(['tournee-infernale']);
    expect(next.pseudo).toBe('DJ Bagarre');
    expect(next.nights).toBe(30);
    expect(next.bestCrowd).toBe(1500);
    expect(next.bestPayout).toBe(9000);
  });
});

describe('departOnTour : le crew', () => {
  it('le fondateur vient toujours avec son niveau ; le vétéran garde le sien, fatigue rincée', () => {
    const next = departOnTour(richState(), ['gamine']);
    expect(next.crew.map((d) => d.id)).toEqual(['tonton', 'gamine']);
    expect(next.crew[0].xp).toBe(600);
    expect(next.crew[0].fatigue).toBe(0);
    expect(next.crew[1].xp).toBe(750);
    expect(next.crew[1].fatigue).toBe(0);
    expect(next.tour.veteranIds).toEqual(['gamine']);
  });

  it('plafonne les vétérans à maxVeterans et ignore le fondateur en doublon', () => {
    const next = departOnTour(richState(), ['tonton', 'gamine', 'kilowatt']);
    expect(next.crew.map((d) => d.id)).toEqual(['tonton', 'gamine']); // 1 seul slot sans « famille »
    const state2 = richState();
    state2.tour.perks = ['famille'];
    const next2 = departOnTour(state2, ['gamine', 'kilowatt']);
    expect(next2.crew.map((d) => d.id)).toEqual(['tonton', 'gamine', 'kilowatt']);
  });
});

describe('departOnTour : les perks de départ (applyPerks, le point unique)', () => {
  it('camion 1 500 €, réputation 30, matos tier 1 partout', () => {
    const state = richState();
    state.tour.perks = ['camion-amenage', 'reputation-precede', 'matos-planque'];
    const next = departOnTour(state, []);
    expect(next.cash).toBe(1500);
    expect(next.rep).toBe(30);
    expect(next.gear).toEqual({ platines: 1, mur: 1, groupe: 1, lumieres: 1, logistique: 1 });
  });

  it('applyPerks est inoffensif sans perk', () => {
    const state = newGame();
    applyPerks(state);
    expect(state.cash).toBe(0);
    expect(state.rep).toBe(0);
    expect(state.gear.platines).toBe(0);
  });

  it('no-softlock : sans perk matos, le starter de la tournée N reste insaisissable', () => {
    const next = departOnTour(richState(), []);
    for (const cat of GEAR_CATEGORIES) {
      expect(GEAR[cat][next.gear[cat]].seizable).toBe(false);
      expect(GEAR[cat][next.gear[cat]].price).toBe(0);
    }
  });
});
```

- [ ] Lancer `npx vitest run test/tour.test.ts` — échec attendu : `applyPerks` / `departOnTour` ne sont pas exportés.
- [ ] Implémentation — ajouter en fin de `src/core/tour.ts` (et compléter l'import en tête : `import { getPerk } from './data';` devient inchangé, ajouter `import { newGame } from './save';` et `import type { DjState, GameState } from './types';` remplace l'import type existant) :

```ts
// --- le départ en tournée ---------------------------------------------------------

const FOUNDER_ID = 'tonton';

/**
 * Applique les perks « état initial » sur une partie fraîche. LE point unique :
 * aucun `if perk` ailleurs dans la sim — les perks modifient l'état de départ
 * ou des lookups de données (crew.ts, payout.ts), jamais le tick.
 */
export function applyPerks(state: GameState): void {
  if (hasPerk(state, 'camion-amenage')) state.cash = 1500;
  if (hasPerk(state, 'reputation-precede')) state.rep = 30;
  if (hasPerk(state, 'matos-planque')) {
    state.gear = { platines: 1, mur: 1, groupe: 1, lumieres: 1, logistique: 1 };
  }
}

/**
 * Partir en tournée : retourne l'état de la tournée suivante.
 *
 * Reset : caisse, matos (→ starter, sauf perk), rep, buzz, casier (busts),
 * dégâts, réparations, roster (sauf fondateur + vétérans), wonTeknival.
 * Conservé : ⭐ Légende (cumulée avec le gain du départ), perks, n° de
 * tournée, pseudo, nights et records all-time (le leaderboard track des maxima).
 *
 * RÉVISION CHANTIER 1: quand le chantier 1 ajoutera arcs en cours / garde à
 * vue sur GameState, ils sont remis à zéro ici (ils ne survivent pas — le
 * newGame frais s'en charge tant qu'ils ont des valeurs par défaut vides).
 */
export function departOnTour(state: GameState, veteranIds: string[] = []): GameState {
  const kept = [...new Set(veteranIds)]
    .filter((id) => id !== FOUNDER_ID && state.crew.some((d) => d.id === id))
    .slice(0, maxVeterans(state));

  const fresh = newGame(state.lastSeen);
  fresh.tour = {
    number: state.tour.number + 1,
    legende: state.tour.legende + computeLegende(state),
    perks: [...state.tour.perks],
    veteranIds: kept,
    teknivalWins: 0,
  };

  // le fondateur vient toujours — et garde son niveau ; les vétérans aussi,
  // fatigue rincée (la route repose tout le monde)
  const founder = state.crew.find((d) => d.id === FOUNDER_ID);
  const veterans: DjState[] = [];
  for (const id of kept) {
    const member = state.crew.find((d) => d.id === id);
    if (member) veterans.push({ ...member, fatigue: 0 });
  }
  fresh.crew = founder ? [{ ...founder, fatigue: 0 }] : fresh.crew;
  fresh.crew.push(...veterans);

  // stats all-time conservées — le leaderboard est inchangé
  fresh.pseudo = state.pseudo;
  fresh.nights = state.nights;
  fresh.bestCrowd = state.bestCrowd;
  fresh.bestPayout = state.bestPayout;

  applyPerks(fresh);
  return fresh;
}
```

  > Cycle d'imports vérifié : `tour.ts → save.ts → types.ts` et `tour.ts → data.ts → types.ts`. `save.ts` n'importe pas `tour.ts`. Pas de cycle.

- [ ] Lancer `npx vitest run test/tour.test.ts` — vert. Puis `npm run test && npm run build` — vert.
- [ ] Commit :

```bash
git add src/core/tour.ts test/tour.test.ts
git commit -m "feat(core): partir en tournée — tout laisser derrière soi, sauf la famille

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Têtes d'affiche (DJs légendaires) + carnet d'adresses

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/data.ts`
- Modify: `src/core/crew.ts`
- Modify: `src/core/night.ts`
- Modify: `src/ui/screens.ts`
- Modify: `tools/build-assets.mjs`
- Modify: `test/data.test.ts`
- Test: `test/tour.test.ts`

- [ ] Écrire le test qui échoue — ajouter à `test/tour.test.ts` (compléter les imports : `lockedDjs`, `recruitableDjs`, `recruitDj`, `applySetToll` depuis `../src/core/crew`, `getDj` depuis `../src/core/data`, `startSet`, `tickNight` depuis `../src/core/night`) :

```ts
import { applySetToll, lockedDjs, recruitDj, recruitableDjs } from '../src/core/crew';
import { getDj } from '../src/core/data';
import { startSet, tickNight } from '../src/core/night';

describe('les Têtes d’affiche', () => {
  it('reste invisibles et irrecrutables sans le perk, même à rep max', () => {
    const state = newGame();
    state.rep = 9999;
    const visible = [...recruitableDjs(state), ...lockedDjs(state)].map((d) => d.id);
    expect(visible).not.toContain('sansnom');
    expect(visible).not.toContain('comete');
    expect(recruitDj(state, 'sansnom')).toBe(false);
  });

  it('rejoint le pool avec son perk, gated par la rep comme les autres', () => {
    const state = newGame();
    state.tour.perks = ['tete-sansnom'];
    state.rep = getDj('sansnom').repReq;
    expect(recruitableDjs(state).map((d) => d.id)).toContain('sansnom');
    expect(recruitDj(state, 'sansnom')).toBe(true);
    expect(getDj('sansnom').technique).toBe(5);
    expect(getDj('sansnom').charisme).toBe(5);
    expect(getDj('sansnom').cut).toBe(0.35);
  });

  it('increvable : La Comète ne prend pas de fatigue, mais gagne l’XP', () => {
    const dj = { id: 'comete', xp: 0, fatigue: 0, setsPlayed: 0 };
    applySetToll(dj, 'pousser', 90);
    expect(dj.fatigue).toBe(0);
    expect(dj.xp).toBeGreaterThan(0);
    expect(dj.setsPlayed).toBe(1);
  });

  it('insaisissable : DJ Sans Nom chauffe à 40 % d’un risque normal du même genre', () => {
    const heatAfter = (djId: string): number => {
      const state = newGame();
      state.crew.push({ id: djId, xp: 0, fatigue: 0, setsPlayed: 0 });
      const night = createNight(state, 'champ', [djId], 7);
      startSet(state, night, djId, 'normal');
      for (let i = 0; i < 80; i++) tickNight(state, night, 0.1); // 8 s — avant tout event/prompt
      return night.heat;
    };
    // memeacide joue aussi mentale, risk normal (×1.0) ; sansnom : discret ×0.8 × gimmick ×0.5
    expect(heatAfter('sansnom')).toBeCloseTo(heatAfter('memeacide') * 0.4, 5);
  });
});

describe('carnet d’adresses', () => {
  it('débloque les DJs à 70 % de leur seuil de rep', () => {
    const state = newGame();
    state.tour.perks = ['carnet-adresses'];
    state.rep = Math.ceil(getDj('fantome').repReq * 0.7); // 350 au lieu de 500
    expect(recruitableDjs(state).map((d) => d.id)).toContain('fantome');
    expect(recruitDj(state, 'fantome')).toBe(true);
    const state2 = newGame();
    state2.rep = 350; // sans le perk, fantome reste verrouillé
    expect(recruitDj(state2, 'fantome')).toBe(false);
  });
});
```

- [ ] Lancer `npx vitest run test/tour.test.ts` — échec attendu : `unknown dj: sansnom`.
- [ ] Implémentation types. Dans `src/core/types.ts`, ajouter au-dessus de `DjDef` :

```ts
/**
 * Gimmick unique des DJs légendaires — branché sur des leviers existants :
 * - insaisissable : moitié moins de heat (RÉVISION CHANTIER 1: deviendra
 *   l'immunité à la garde à vue quand elle existera)
 * - increvable : ne prend jamais de fatigue
 */
export type DjGimmick = 'insaisissable' | 'increvable';
```

  et dans l'interface `DjDef`, après `sprite: number;` :

```ts
  /** perk de l'Héritage requis pour apparaître dans le pool (Têtes d'affiche) */
  perk?: string;
  /** gimmick unique des DJs légendaires */
  gimmick?: DjGimmick;
```

- [ ] Implémentation data. Dans `src/core/data.ts`, dans `DJS`, insérer **avant** `notaire` (le tableau reste trié par `repReq` croissant : 250 < 260) :

```ts
  {
    id: 'sansnom',
    nom: 'DJ Sans Nom',
    description:
      'Personne n’a vu son visage, personne n’a son numéro. Les bleus cherchent encore qui convoquer.',
    technique: 5,
    charisme: 5,
    genre: 'mentale',
    risk: 'discret',
    cut: 0.35,
    repReq: 250,
    sprite: 9,
    perk: 'tete-sansnom',
    gimmick: 'insaisissable',
  },
```

  et insérer **entre** `sirene` (380) et `fantome` (500) :

```ts
  {
    id: 'comete',
    nom: 'La Comète',
    description:
      'Trois teknivals d’affilée sans baisser le bras. On dit qu’elle dort en mixant.',
    technique: 5,
    charisme: 5,
    genre: 'frenchcore',
    risk: 'chaud',
    cut: 0.35,
    repReq: 400,
    sprite: 13,
    perk: 'tete-comete',
    gimmick: 'increvable',
  },
```

- [ ] Implémentation crew. Dans `src/core/crew.ts` : ajouter `import { hasPerk } from './tour';` en tête, puis remplacer `recruitableDjs`, `lockedDjs` et le début de `recruitDj` par :

```ts
/** Seuil de rep effectif : le carnet d'adresses ouvre la porte à 70 %. */
export const CARNET_THRESHOLD = 0.7;

export function djRepThreshold(state: GameState, def: DjDef): number {
  return hasPerk(state, 'carnet-adresses') ? Math.ceil(def.repReq * CARNET_THRESHOLD) : def.repReq;
}

/** Les Têtes d'affiche n'existent pas tant que leur perk n'est pas acheté. */
export function djAvailable(state: GameState, def: DjDef): boolean {
  return def.perk === undefined || hasPerk(state, def.perk);
}

/** DJs who would join the crew now (rep reached, not already in). */
export function recruitableDjs(state: GameState): DjDef[] {
  return DJS.filter(
    (d) => !isInCrew(state, d.id) && djAvailable(state, d) && state.rep >= djRepThreshold(state, d),
  );
}

/** DJs visible on the recruitment screen but still out of reach. */
export function lockedDjs(state: GameState): DjDef[] {
  return DJS.filter(
    (d) => !isInCrew(state, d.id) && djAvailable(state, d) && state.rep < djRepThreshold(state, d),
  );
}

export function recruitDj(state: GameState, djId: string): boolean {
  const def = getDj(djId);
  if (isInCrew(state, djId) || !djAvailable(state, def) || state.rep < djRepThreshold(state, def)) {
    return false;
  }
  state.crew.push({ id: djId, xp: 0, fatigue: 0, setsPlayed: 0 });
  return true;
}
```

  et remplacer `applySetToll` (le gimmick `increvable`, lu sur le def comme `risk` — pas un if de perk) :

```ts
/** Apply the toll of a played set. L'increvable ne prend jamais de fatigue. */
export function applySetToll(dj: DjState, brief: string, setSeconds: number): void {
  if (getDj(dj.id).gimmick !== 'increvable') {
    dj.fatigue = Math.min(1, dj.fatigue + FATIGUE_PER_SET + (brief === 'pousser' ? FATIGUE_PUSH_BONUS : 0));
  }
  dj.xp += setSeconds * XP_RATE * (brief === 'pousser' ? 1.3 : 1);
  dj.setsPlayed += 1;
}
```

  > Cycle vérifié : `crew.ts → tour.ts → save.ts/data.ts → types.ts`. `tour.ts` n'importe pas `crew.ts`. Pas de cycle.

- [ ] Implémentation night. Dans `src/core/night.ts` (ligne ~277), remplacer :

```ts
  const riskMult = dj ? RISK_HEAT[dj.risk] : 1;
```

  par :

```ts
  // RÉVISION CHANTIER 1: l'insaisissable deviendra immunisé à la garde à vue ;
  // en attendant, son gimmick = moitié moins de heat (levier existant)
  const riskMult = dj ? RISK_HEAT[dj.risk] * (dj.gimmick === 'insaisissable' ? 0.5 : 1) : 1;
```

- [ ] Implémentation UI minimale (seuil affiché). Dans `src/ui/screens.ts` : ajouter `djRepThreshold` à l'import de `../core/crew` (ligne 2), remplacer dans la boucle `lockedDjs` (ligne ~183) :

```ts
    card.append(el('div', 'card-desc', `${STR.repNeeded(def.repReq)}`));
```

  par :

```ts
    card.append(el('div', 'card-desc', `${STR.repNeeded(djRepThreshold(state, def))}`));
```

  et remplacer `newlyRecruitable` (fin de fichier) par :

```ts
/** Used by main.ts to celebrate fresh recruits on the prepare screen. */
export function newlyRecruitable(state: GameState, prevRep: number): DjDef[] {
  return DJS.filter((d) => {
    if (d.perk !== undefined && !state.tour.perks.includes(d.perk)) return false;
    const req = djRepThreshold(state, d);
    return req > prevRep && req <= state.rep;
  });
}
```

- [ ] Mettre à jour `test/data.test.ts` — remplacer le `describe('djs', …)` entier par (les invariants jouent sur le pool de base, les légendaires ont leur propre bloc) :

```ts
describe('djs', () => {
  const base = DJS.filter((d) => !d.perk);

  it('has 8 base DJs led by the founding tonton, all sorted by rep requirement', () => {
    expect(base).toHaveLength(8);
    expect(DJS[0].id).toBe('tonton');
    expect(DJS[0].repReq).toBe(0);
    const reqs = DJS.map((d) => d.repReq);
    expect([...reqs].sort((a, b) => a - b)).toEqual(reqs);
  });

  it('gives every DJ stats in range and a signature genre', () => {
    const genreIds = new Set(GENRES.map((g) => g.id));
    for (const dj of DJS) {
      expect(dj.technique).toBeGreaterThanOrEqual(1);
      expect(dj.technique).toBeLessThanOrEqual(5);
      expect(dj.charisme).toBeGreaterThanOrEqual(1);
      expect(dj.charisme).toBeLessThanOrEqual(5);
      expect(dj.cut).toBeGreaterThan(0);
      expect(dj.cut).toBeLessThanOrEqual(dj.perk ? 0.35 : 0.3);
      expect(genreIds.has(dj.genre)).toBe(true);
    }
  });

  it('maps each genre to exactly one base DJ', () => {
    expect(new Set(base.map((d) => d.genre)).size).toBe(base.length);
  });

  it('prices better DJs with bigger cuts', () => {
    expect(getDj('fantome').cut).toBeGreaterThan(getDj('tonton').cut);
  });

  it('les têtes d’affiche : 5/5, cut 35 %, gated par perk, un gimmick chacune', () => {
    const legends = DJS.filter((d) => d.perk);
    expect(legends.map((d) => d.id).sort()).toEqual(['comete', 'sansnom']);
    for (const dj of legends) {
      expect(dj.technique).toBe(5);
      expect(dj.charisme).toBe(5);
      expect(dj.cut).toBe(0.35);
      expect(dj.gimmick).toBeDefined();
    }
  });
});
```

  > `test/crew.test.ts` reste vert sans modification : les légendaires sont **cachés** (ni recrutables ni verrouillés) sans perk, donc `lockedDjs(state)` compte toujours 7.
  > RÉVISION CHANTIER 2: si le plan économie est mergé d'abord, le pool de base passe à 12 — remplacer `toHaveLength(8)` par `toHaveLength(12)` (le filtre `!d.perk` isole déjà les légendaires).

- [ ] Portraits. Dans `tools/build-assets.mjs`, ajouter à `DJ_SPRITES` (ligne ~75, index premade 1-based = sprite + 1) :

```js
  sansnom: 10,
  comete: 14,
```

  Puis lancer `npm run assets`. Si les planches sources (`Premade_Character_*.png`) ne sont pas présentes localement, poser des placeholders pour ne pas casser l'UI :

```bash
cp public/assets/portraits/fantome.png public/assets/portraits/sansnom.png
cp public/assets/portraits/sirene.png public/assets/portraits/comete.png
```

  > `public/assets/` est **gitignoré** (packs LimeZu non redistribuables — voir `.gitignore` et l'entête de `tools/build-assets.mjs`) : les portraits restent locaux, on ne les commit jamais. Ils se régénèrent par `npm run assets`.

- [ ] Lancer `npx vitest run test/tour.test.ts test/data.test.ts test/crew.test.ts` — vert. Puis `npm run test && npm run build` — vert (harness inchangé : partie fraîche = pas de perk, pool identique).
- [ ] Commit :

```bash
git add src/core/types.ts src/core/data.ts src/core/crew.ts src/core/night.ts src/ui/screens.ts tools/build-assets.mjs test/data.test.ts test/tour.test.ts
git commit -m "feat(core,ui): les Têtes d'affiche débarquent — DJs légendaires et carnet d'adresses

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Mythes du son — le tier mythique, gated par perk, payé en €

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/data.ts`
- Modify: `src/core/payout.ts`
- Modify: `src/ui/screens.ts`
- Modify: `src/ui/strings.ts`
- Modify: `test/data.test.ts`
- Test: `test/tour.test.ts`

- [ ] Écrire le test qui échoue — ajouter à `test/tour.test.ts` (compléter les imports : `buyGearUpgrade` depuis `../src/core/payout`, `getSpot` depuis `../src/core/data`) :

```ts
import { buyGearUpgrade } from '../src/core/payout';
import { getSpot } from '../src/core/data';

describe('mythes du son : le tier mythique', () => {
  it('chaque catégorie a un item mythique au sommet, le plus cher, achetable en €', () => {
    for (const cat of GEAR_CATEGORIES) {
      const top = GEAR[cat][GEAR[cat].length - 1];
      expect(top.mythic).toBe(true);
      expect(top.price).toBeGreaterThan(GEAR[cat][GEAR[cat].length - 2].price);
      expect(top.seizable).toBe(true);
    }
  });

  it('refuse l’achat mythique sans le perk de la catégorie, l’accorde avec', () => {
    const state = newGame();
    state.cash = 999999;
    state.gear.mur = GEAR.mur.length - 2; // au max non mythique
    expect(buyGearUpgrade(state, 'mur')).toBe(false);
    state.tour.perks = ['mythe-mur'];
    expect(buyGearUpgrade(state, 'mur')).toBe(true);
    expect(state.gear.mur).toBe(GEAR.mur.length - 1);
  });

  it('signature du mur mythique : la foule en sur-cap de 10 % au-dessus du tier max', () => {
    const mythic = GEAR.mur[GEAR.mur.length - 1];
    const top = GEAR.mur[GEAR.mur.length - 2];
    expect(mythic.value).toBeCloseTo(top.value * 1.1, 5);
  });

  it('signature de la centrale mythique : tient la demande max même à la carrière', () => {
    const mythic = GEAR.groupe[GEAR.groupe.length - 1];
    const supply = mythic.value * getSpot('carriere').powerMult + 0.15;
    expect(supply).toBeGreaterThan(0.35 + 0.5 + 0.22); // demande max (foule pleine + pousser)
  });
});
```

- [ ] Lancer `npx vitest run test/tour.test.ts` — échec attendu : `top.mythic` est `undefined`.
- [ ] Implémentation types. Dans `src/core/types.ts`, interface `GearItem`, après `seizable: boolean;` :

```ts
  /** tier mythique : achat en € gated par le perk `mythe-<categorie>` de l'Héritage */
  mythic?: boolean;
```

- [ ] Implémentation data. Dans `src/core/data.ts`, ajouter en **dernière position** de chaque tableau de `GEAR` (le `tier` est l'index du tableau — voir note) :

```ts
    // platines :
    { category: 'platines', tier: 4, nom: 'La Cabine du Mythe', price: 8000, value: 1.45, seizable: true, mythic: true },
    // mur — signature : sur-cap de 10 % au-dessus du tier max (2.0 × 1.1) :
    { category: 'mur', tier: 4, nom: 'Le Mur des Légendes', price: 9000, value: 2.2, seizable: true, mythic: true },
    // groupe — signature : jamais de coupure, même à la carrière (1.6 × 0.6 + 0.15 > 1.07) :
    { category: 'groupe', tier: 4, nom: 'La Centrale fantôme', price: 8500, value: 1.6, seizable: true, mythic: true },
    // lumières — signature : l'ambiance ne retombe plus (+0.3 de vibe flat) :
    { category: 'lumieres', tier: 4, nom: 'L’Aurore artificielle', price: 8000, value: 0.3, seizable: true, mythic: true },
    // logistique — signature : les bleus cherchent encore l'entrée (heat ×0.35) :
    { category: 'logistique', tier: 4, nom: 'La Toile invisible', price: 8500, value: 0.35, seizable: true, mythic: true },
```

  > RÉVISION CHANTIER 2: une fois les tiers 4–5 du plan économie mergés, ces items deviennent le **tier 6** (l'item reste en bout de la voie choisie), les prix montent à ≈ 25 000 € et les `value` se recalent juste au-dessus du tier 5 de chaque voie. Le gate reste `mythic: true` — aucun code ne dépend du numéro de tier.

- [ ] Implémentation payout. Dans `src/core/payout.ts` : ajouter `import { hasPerk } from './tour';` en tête, et remplacer `buyGearUpgrade` :

```ts
export function buyGearUpgrade(state: GameState, cat: GearCategory): boolean {
  const next = GEAR[cat][state.gear[cat] + 1];
  if (!next || state.cash < next.price) return false;
  // le tier mythique se paie en € mais s'ouvre à l'Héritage
  if (next.mythic && !hasPerk(state, `mythe-${cat}`)) return false;
  state.cash -= next.price;
  state.gear[cat] = next.tier;
  return true;
}
```

- [ ] Implémentation UI (boutique). Dans `src/ui/strings.ts`, ajouter après `maxed: 'Au max',` :

```ts
  mythicLocked: 'Mythe du son à débloquer dans l’Héritage',
```

  Dans `src/ui/screens.ts` : ajouter `import { hasPerk } from '../core/tour';` et, dans la colonne matos de `renderPrepare` (ligne ~219), remplacer :

```ts
    } else if (next) {
```

  par :

```ts
    } else if (next?.mythic && !hasPerk(state, `mythe-${cat}`)) {
      actions.append(el('div', 'gear-maxed', `🔒 ${STR.mythicLocked}`));
    } else if (next) {
```

- [ ] Mettre à jour `test/data.test.ts` — remplacer le premier `it` du `describe('gear', …)` :

```ts
  it('has five categories: free unseizable tier 0, mythic top tier, ascending prices', () => {
    expect(GEAR_CATEGORIES).toEqual(['platines', 'mur', 'groupe', 'lumieres', 'logistique']);
    for (const cat of GEAR_CATEGORIES) {
      expect(GEAR[cat]).toHaveLength(5);
      expect(GEAR[cat][0].seizable).toBe(false);
      expect(GEAR[cat][0].price).toBe(0);
      expect(GEAR[cat][GEAR[cat].length - 1].mythic).toBe(true);
      expect(GEAR[cat].filter((g) => g.mythic)).toHaveLength(1);
      const prices = GEAR[cat].map((g) => g.price);
      expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    }
  });
```

  > Le test `logistique reduce heat` reste vert : 0.35 (mythique) < 0.55 (tier 3), valeurs toujours décroissantes.
  > RÉVISION CHANTIER 2: avec les tiers 4–5 mergés, `toHaveLength(5)` devient la longueur de la voie (tiers 0–5 + mythique).

- [ ] Lancer `npx vitest run test/tour.test.ts test/data.test.ts test/payout.test.ts` — vert (les tests payout existants achètent `lumieres` tier 1, non mythique : inchangés). Puis `npm run test && npm run build` — vert (harness : le mythique est inachetable sans perk, équilibrage d'une partie fraîche inchangé).
- [ ] Commit :

```bash
git add src/core/types.ts src/core/data.ts src/core/payout.ts src/ui/screens.ts src/ui/strings.ts test/data.test.ts test/tour.test.ts
git commit -m "feat(core,ui): mythes du son — le tier mythique se mérite à l'Héritage

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: UI — l'onglet « ⭐ Héritage »

**Files:**
- Modify: `src/ui/strings.ts`
- Modify: `src/ui/screens.ts`
- Modify: `src/main.ts`
- Modify: `src/style.css`

> Pas de test unitaire DOM : vitest tourne en environnement node dans ce repo et `screens.ts` n'a aucun test existant. Toute la logique (canBuyPerk, buyPerk, perkCount) est déjà couverte par `test/tour.test.ts` (Task 2). Vérification : `tsc` via `npm run build` + smoke manuel.

- [ ] Dans `src/ui/strings.ts`, ajouter après le bloc `// save` :

```ts
  // héritage (la boutique permanente)
  heritage: 'Héritage',
  heritageTitle: '⭐ L’Héritage',
  heritageBalance: (n: number) => `${n} ⭐ Légende en banque`,
  tourLabel: (n: number) => `Tournée ${n}`,
  perkOwned: 'Acquis — pour toujours',
  perkBuy: (cost: number) => `Débloquer — ${cost} ⭐`,
  perkStack: (owned: number, max: number) => `${owned}/${max}`,
```

- [ ] Dans `src/ui/screens.ts` :
  - compléter l'import de data (ligne 1) : `import { DJS, GEAR, GEAR_CATEGORIES, PERKS, SPOTS, getDj, getGenre, getSpot } from '../core/data';`
  - compléter l'import de tour (posé en Task 6) : `import { canBuyPerk, hasPerk, perkCount } from '../core/tour';`
  - ajouter à l'interface `PrepareCallbacks` :

```ts
  onHeritage(): void;
```

  - dans le footer de `renderPrepare` (ligne ~249, juste avant `lbBtn`), ajouter :

```ts
  const herBtn = el('button', 'btn ghost', `⭐ ${STR.heritage} (${state.tour.legende})`);
  herBtn.addEventListener('click', () => cb.onHeritage());
```

  et inclure `herBtn` en premier dans `meta.append(...)` : `meta.append(herBtn, lbBtn, expBtn, impBtn, resetBtn);`
  - ajouter en fin de fichier (avant `newlyRecruitable`) :

```ts
// --- héritage (boutique permanente) -------------------------------------------

export interface HeritageCallbacks {
  onBuyPerk(perkId: string): void;
  onBack(): void;
}

export function renderHeritage(root: HTMLElement, state: GameState, cb: HeritageCallbacks): void {
  root.innerHTML = '';
  root.className = 'screen screen-heritage';
  const panel = el('div', 'lb-panel heritage-panel');
  panel.append(el('h1', '', STR.heritageTitle));
  panel.append(
    el('div', 'heritage-balance', `${STR.heritageBalance(state.tour.legende)} · ${STR.tourLabel(state.tour.number)}`),
  );

  const list = el('div', 'heritage-list');
  for (const perk of PERKS) {
    const owned = perkCount(state, perk.id);
    const maxed = owned >= perk.max;
    const row = el('div', `card perk-card${maxed ? ' owned' : ''}`);
    const title = perk.max > 1 ? `${perk.nom} · ${STR.perkStack(owned, perk.max)}` : perk.nom;
    row.append(el('div', 'card-title', owned > 0 ? `✓ ${title}` : title));
    row.append(el('div', 'card-desc', perk.description));
    if (maxed) {
      row.append(el('div', 'perk-owned', STR.perkOwned));
    } else {
      const btn = el('button', 'btn small accent', STR.perkBuy(perk.cost));
      btn.disabled = !canBuyPerk(state, perk.id);
      btn.addEventListener('click', () => cb.onBuyPerk(perk.id));
      row.append(btn);
    }
    list.append(row);
  }
  panel.append(list);

  const back = el('button', 'btn launch', STR.back);
  back.addEventListener('click', () => cb.onBack());
  panel.append(back);
  root.append(panel);
}
```

- [ ] Dans `src/main.ts` :
  - compléter l'import de tour (créer la ligne) : `import { buyPerk } from './core/tour';`
  - compléter l'import de screens : ajouter `renderHeritage` à la liste ;
  - ajouter la fonction écran après `showRecap` :

```ts
function showHeritage(): void {
  renderHeritage(app, state, {
    onBuyPerk: (perkId) => {
      if (buyPerk(state, perkId)) {
        saveGame(localStorage, state);
        showHeritage();
      }
    },
    onBack: () => showPrepare(),
  });
}
```

  - dans `showPrepare`, ajouter le callback aux `PrepareCallbacks` (après `onLeaderboard`) :

```ts
    onHeritage: () => showHeritage(),
```

- [ ] Dans `src/style.css`, ajouter en fin de fichier :

```css
/* --- héritage (boutique permanente) ---------------------------------------- */
.heritage-panel { max-width: 720px; }
.heritage-balance { font-size: 1.1rem; margin-bottom: 12px; opacity: 0.9; }
.heritage-list { display: grid; gap: 10px; margin-bottom: 16px; text-align: left; }
.perk-card { display: flex; flex-direction: column; gap: 6px; }
.perk-card.owned { opacity: 0.65; }
.perk-owned { font-size: 0.85rem; opacity: 0.8; }
```

- [ ] Lancer `npm run test && npm run build` — vert. Smoke manuel : `npm run dev`, ouvrir l'écran de prépa → bouton « ⭐ Héritage (0) » → le panneau liste 13 perks, tous désactivés à 0 ⭐, retour OK.
- [ ] Commit :

```bash
git add src/ui/strings.ts src/ui/screens.ts src/main.ts src/style.css
git commit -m "feat(ui): l'onglet Héritage — la boutique permanente en ⭐ Légende

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: UI — la carte « 🚐 Partir en tournée » et son modal de confirmation

**Files:**
- Modify: `src/ui/strings.ts`
- Modify: `src/ui/screens.ts`
- Modify: `src/main.ts`
- Modify: `src/style.css`

> Même règle : pas de test DOM dans ce repo ; `computeLegende`, `maxVeterans` et `departOnTour` sont couverts par `test/tour.test.ts` (Tasks 3–4). Vérification : build + smoke.

- [ ] Dans `src/ui/strings.ts`, ajouter après le bloc héritage (Task 7) :

```ts
  // départ en tournée
  departCard: '🚐 Partir en tournée',
  departHint: 'Tout laisser derrière soi, sauf la légende. Le camion repart vers une autre région.',
  departPreview: (n: number) => `+${n} ⭐ Légende au départ`,
  departTitle: 'Partir en tournée ?',
  departLostTitle: 'Tu laisses derrière toi',
  departLost: [
    'La caisse',
    'Le matos (retour au starter, sauf perks)',
    'La réputation et le buzz',
    'Les spots débloqués',
    'Le crew et ses niveaux (sauf fondateur + vétérans)',
    'Le casier — les bleus t’oublient',
  ],
  departKeptTitle: 'Tu emportes',
  departKept: [
    'La ⭐ Légende cumulée',
    'Les perks de l’Héritage',
    'Le compteur de tournées',
    'Tes records all-time (classement intact)',
    'Tonton Madère — il était là avant tout le monde',
    'Le·s vétéran·s choisi·s, niveau compris',
  ],
  departVeteranTitle: (n: number) => `Choisis jusqu’à ${n} vétéran·s — le fondateur vient toujours`,
  departConfirm: '🚐 En route',
  departCancel: 'Rester encore une nuit',
```

- [ ] Dans `src/ui/screens.ts` :
  - compléter l'import de tour : `import { canBuyPerk, computeLegende, hasPerk, maxVeterans, perkCount } from '../core/tour';`
  - ajouter à `PrepareCallbacks` :

```ts
  onDepart(veteranIds: string[]): void;
```

  - dans `renderPrepare`, remplacer le bloc `if (state.wonTeknival) { … }` (ligne ~103) par :

```ts
  if (state.wonTeknival) {
    root.append(el('div', 'won-banner', `🏆 ${STR.wonTitle}`));
    const depart = el('button', 'card depart-card');
    depart.append(el('div', 'card-title', STR.departCard));
    depart.append(el('div', 'card-meta', STR.departPreview(computeLegende(state))));
    depart.append(el('div', 'card-desc', STR.departHint));
    depart.addEventListener('click', () => showDepartModal(root, state, cb));
    root.append(depart);
  }
```

  - ajouter la fonction du modal après `renderPrepare` (avant `function stat`) :

```ts
/** Confirmation du départ : la liste exacte du perdu/gardé, le choix des vétérans. */
function showDepartModal(root: HTMLElement, state: GameState, cb: PrepareCallbacks): void {
  const overlay = el('div', 'night-modal');
  const panel = el('div', 'modal-panel depart-panel');
  panel.append(el('h2', '', STR.departTitle));
  panel.append(el('div', 'depart-preview', STR.departPreview(computeLegende(state))));

  const cols = el('div', 'depart-cols');
  const lost = el('div', 'depart-col');
  lost.append(el('h3', '', STR.departLostTitle));
  for (const line of STR.departLost) lost.append(el('div', 'depart-line', `✗ ${line}`));
  const kept = el('div', 'depart-col');
  kept.append(el('h3', '', STR.departKeptTitle));
  for (const line of STR.departKept) kept.append(el('div', 'depart-line', `✓ ${line}`));
  cols.append(lost, kept);
  panel.append(cols);

  const slots = maxVeterans(state);
  const candidates = state.crew.filter((d) => d.id !== 'tonton');
  const chosen = new Set<string>();
  if (candidates.length > 0) {
    panel.append(el('h3', '', STR.departVeteranTitle(slots)));
    const list = el('div', 'pick-dj-list');
    for (const member of candidates) {
      const def = getDj(member.id);
      const lvl = djLevel(member);
      const card = el('button', 'card dj-pick');
      card.dataset.dj = member.id;
      const row = el('div', 'dj-row');
      row.append(portrait(member.id, 'dj-portrait small'));
      const info = el('div', 'dj-info');
      info.append(el('div', 'card-title', `${def.nom}${lvl > 0 ? ` · ${STR.level(lvl)}` : ''}`));
      row.append(info);
      card.append(row);
      card.addEventListener('click', () => {
        if (chosen.has(member.id)) chosen.delete(member.id);
        else if (chosen.size < slots) chosen.add(member.id);
        for (const c of Array.from(list.children) as HTMLElement[]) {
          c.classList.toggle('selected', chosen.has(c.dataset.dj ?? ''));
        }
      });
      list.append(card);
    }
    panel.append(list);
  }

  const actions = el('div', 'recap-actions');
  const cancel = el('button', 'btn ghost', STR.departCancel);
  cancel.addEventListener('click', () => overlay.remove());
  const go = el('button', 'btn launch', STR.departConfirm);
  go.addEventListener('click', () => cb.onDepart([...chosen]));
  actions.append(cancel, go);
  panel.append(actions);

  overlay.append(panel);
  root.append(overlay);
}
```

- [ ] Dans `src/main.ts` :
  - compléter l'import de tour : `import { buyPerk, departOnTour } from './core/tour';`
  - dans `showPrepare`, ajouter le callback (après `onHeritage`) :

```ts
    onDepart: (veteranIds) => {
      state = departOnTour(state, veteranIds);
      saveGame(localStorage, state);
      selection.present.clear();
      for (const d of state.crew) selection.present.add(d.id);
      selection.spot = 'champ';
      showPrepare();
    },
```

- [ ] Dans `src/style.css`, ajouter en fin de fichier :

```css
/* --- départ en tournée ------------------------------------------------------ */
.depart-card { display: block; margin: 8px auto 0; max-width: 560px; text-align: left; }
.depart-panel { max-width: 640px; }
.depart-preview { font-size: 1.15rem; margin: 6px 0 2px; }
.depart-cols { display: flex; gap: 18px; margin: 12px 0; text-align: left; }
.depart-col { flex: 1; }
.depart-line { font-size: 0.9rem; margin: 3px 0; opacity: 0.9; }
```

- [ ] Lancer `npm run test && npm run build` — vert. Smoke manuel : `npm run dev` ; forcer `wonTeknival` en console (`JSON.parse(localStorage['rave-tycoon-save'])` → set `wonTeknival: true` → reload) ; la carte 🚐 apparaît avec la preview de ⭐ ; le modal liste le perdu/gardé, le picker plafonne à 1 vétéran ; confirmer → retour prépa en tournée 2, caisse 0, crew = tonton + vétéran, solde ⭐ crédité dans l'onglet Héritage.
- [ ] Commit :

```bash
git add src/ui/strings.ts src/ui/screens.ts src/main.ts src/style.css
git commit -m "feat(ui): la carte départ en tournée — confirmation, vétérans, grand saut

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Couverture du spec (auto-revue)

| Section du spec | Tâche(s) |
|---|---|
| §1 départ volontaire dès `wonTeknival`, carte + confirmation détaillée | 8 |
| §1 reset/conservé exacts, bloc `tour`, migration de save | 1, 4 |
| §2 formule de ⭐ + preview sur la carte | 3 (fallback chantier 1), 8 |
| §3 camion / carnet / réputation / matos / famille | 2 (data+achat), 4 (application), 5 (carnet) |
| §3 mythes du son ×5 (tier mythique en €, effets signature sur leviers existants) | 6 |
| §3 têtes d'affiche ×2 (5/5, 35 %, gimmicks sur leviers existants) | 5 |
| §3 tournée infernale (stocké, effet chantier 4) | 2 |
| Onglet Héritage | 7 |
| Tests du spec (`tour.test.ts`) : formule, reset, vétéran, perks, migration, fondateur, no-softlock | 1–6 |
| Hors-scope (régions, achievements, prestige forcé) | aucun — respecté |
