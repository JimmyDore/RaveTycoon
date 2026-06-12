# Run Modifiers — Les Régions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chaque tournée (chantier 3) se joue dans une **région** tirée parmi 3 cartes : 2 traits qui changent les règles + 1 multiplicateur de ⭐ (×1.0 à ×2.0 = `1 + 0.25 × max(0, somme des difficultés)`). La tournée 1 n'a pas de région. 12 traits data-driven mutent un objet `RegionRules` centralisé, lu par la sim aux points déjà paramétrables.

**Architecture:** Nouveau `src/core/regions.ts` (pool de traits avec `apply(rules)`, `RegionRules` + `buildRegionRules`, tirage `drawRegions(seed)` déterministe via `mulberry32`, générateur de noms français). `GameState.region?: RegionState` persisté (ids de traits seulement, comme le pattern `NightModifierDef` que `types.ts` importe déjà depuis `modifiers.ts`). La sim lit les règles : `night.ts` (heat, bust, arrivées, churn, buvette, qualité, objectifs, events), `payout.ts` (prix libre, disponibilité des spots), `idle.ts` (décroissance du buzz), `modifiers.ts` (poids des météos négatives). UI : 3 cartes au départ en tournée (écran du chantier 3), bandeau région à la prépa.

**Tech Stack:** TypeScript + Vite + vitest (`npm run test` = `vitest run`, `npm run build` = `tsc && vite build`). Pas de framework UI : DOM vanilla via le helper `el()` de `src/ui/screens.ts`. RNG déterministe : `mulberry32` (`src/core/rng.ts`).

**Préconditions :** les plans chantier 2 (économie) et chantier 3 (prestige/tournée : `src/core/tour.ts`, bloc `GameState.tour`, écran de départ) sont mergés avant exécution. Le chantier 1 (descente, nuits spéciales, casier, attente, soundclash) n'existe PAS — chaque dépendance a un fallback marqué **RÉVISION CHANTIER 1**.

**Garde-fou harness :** les défauts de `RegionRules` sont l'identité (×1, seuil 1.0, aucun spot banni). Sans région (tournée 1), la sim est bit-à-bit identique à aujourd'hui : `src/core/progression.test.ts` et les expectations chiffrées de `test/payout.test.ts` (donationMult 2.14, etc.) restent vraies sans modification. Aucune expectation existante du harness ne change dans ce plan.

---

## Cartographie traits → points de lecture (référence)

| Trait (difficulty) | Règle | Point de lecture réel |
|---|---|---|
| 🚔 Zone quadrillée (2) | `bustThreshold = 0.85` | `night.ts` `if (night.heat >= 1)` (tickNight) — **RÉVISION CHANTIER 1** : la descente du chantier 1 aura un seuil de base 0.85, ce trait posera alors 0.70. Aujourd'hui le bust est à heat 1.0 ; l'équivalent le plus proche est 0.85. Les clamps `0.99` de `applyEffects`/`dropMontee` deviennent `bustThreshold − 0.01` pour préserver l'invariant « un event ne bust jamais directement ». |
| 👮 Préfet zélé (1) | `heatMult ×1.3`, `casierGele = true` | heat : ligne `night.heat += spot.heatBuild * …` ; casier : **dormant** (aucune décroissance de casier n'existe — **RÉVISION CHANTIER 1**) |
| 💸 Économie morose (1) | `prixLibreMult ×0.75`, `barMult ×0.8` | `payout.ts` `donationMult` (settleNight) ; `night.ts` ligne `night.bank += night.crowd * BAR_DRIP * …` |
| 🌧 Climat pourri (1) | `negativeModifierWeightMult ×2` | `modifiers.ts` `rollModifiers` (nouveau flag `negatif` sur pluie/brouillard/touristes) |
| 🧱 Terre de béton (2) | `bannedSpotIds = ['champ','foret','plage']`, `repReqOverride.carriere = 0` | nouveau `isSpotAvailable` dans `payout.ts`, lu par `screens.ts`/`main.ts` |
| 😤 Public exigeant (1) | `setQualityMult ×0.95` | `night.ts` `computeSetQuality` — **RÉVISION CHANTIER 1** : fallback de « tolérance d'attente −0.05 » (l'attente n'existe pas) |
| 📵 Zone blanche (1) | `buzzDecayMult ×2` | `idle.ts` `applyIdleTime`, ligne `state.buzz *= Math.pow(0.5, hours / BUZZ_HALF_LIFE_HOURS)` |
| 🎶 Terre de dub (0) | `slowGenreArrivalMult ×1.3` (BPM ≤ 140), `fastGenreArrivalMult ×0.7` (BPM > 170) | `night.ts` calcul `arrival` (les BPM viennent de `GENRES` dans `data.ts`) |
| 🎪 Fêtes votives (0) | `specialNightWeightMult ×2` (dormant), `maxEventsBonus +1`, `goalRepMult ×0.8` | nuits spéciales : **RÉVISION CHANTIER 1** (fallback vivant = +1 event de nuit via `maxEvents`) ; rep d'objectif : `endCurrentSet` |
| 🛣 Grands axes (0) | `arrivalMult ×1.2`, `churnMult ×1.2` | `night.ts` calcul `arrival` / `leaving` |
| 🤝 Terre d'accueil (−1) | `heatMult ×0.7` | comme Préfet zélé (composition par produit) |
| 🍾 Région riche (−1) | `prixLibreMult ×1.25` | comme Économie morose |

**Décision (Terre de béton / no-softlock) :** champ (tier 1) et forêt (tier 2) sont les seuls spots tier 1–2 du jeu — les bannir supprime par définition tous les spots « tier 1–2 ». La garantie du spec (« au moins un spot tier 1–2 reste jouable ») est tenue dans l'esprit : le trait lui-même ouvre la carrière (`repReqOverride.carriere = 0`), donc un spot de départ reste toujours jouable à rep 0. `'plage'` (spot du chantier 2) figure dans la liste bannie sous forme de string : inoffensif si le spot n'existe pas encore dans `SPOTS`.

---

### Task 1: Le pool des 12 traits et les règles centralisées (`src/core/regions.ts`)

**Files:**
- Create: `src/core/regions.ts`
- Create: `src/core/regions.test.ts`
- Modify: `src/core/types.ts` (champ `GameState.region`)

- [ ] **Step 1 : écrire le test qui échoue**

Créer `src/core/regions.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import {
  REGION_TRAITS,
  type RegionRules,
  applyRegionLegende,
  buildRegionRules,
  defaultRegionRules,
  getRegionTrait,
  legendeMultiplier,
  regionTraits,
} from './regions';

function traits(...ids: string[]) {
  return ids.map(getRegionTrait);
}

describe('le pool de traits', () => {
  it('contient les 12 traits du design avec leurs difficultés', () => {
    expect(REGION_TRAITS).toHaveLength(12);
    const diff = Object.fromEntries(REGION_TRAITS.map((t) => [t.id, t.difficulty]));
    expect(diff).toEqual({
      'zone-quadrillee': 2,
      'prefet-zele': 1,
      'economie-morose': 1,
      'climat-pourri': 1,
      'terre-de-beton': 2,
      'public-exigeant': 1,
      'zone-blanche': 1,
      'terre-de-dub': 0,
      'fetes-votives': 0,
      'grands-axes': 0,
      'terre-daccueil': -1,
      'region-riche': -1,
    });
  });

  it('chaque trait mute la bonne règle', () => {
    const applied = (id: string): RegionRules => {
      const rules = defaultRegionRules();
      getRegionTrait(id).apply(rules);
      return rules;
    };
    expect(applied('zone-quadrillee').bustThreshold).toBe(0.85);
    expect(applied('prefet-zele').heatMult).toBeCloseTo(1.3, 5);
    expect(applied('prefet-zele').casierGele).toBe(true);
    expect(applied('economie-morose').prixLibreMult).toBeCloseTo(0.75, 5);
    expect(applied('economie-morose').barMult).toBeCloseTo(0.8, 5);
    expect(applied('climat-pourri').negativeModifierWeightMult).toBeCloseTo(2, 5);
    expect(applied('terre-de-beton').bannedSpotIds).toEqual(['champ', 'foret', 'plage']);
    expect(applied('terre-de-beton').repReqOverride.carriere).toBe(0);
    expect(applied('public-exigeant').setQualityMult).toBeCloseTo(0.95, 5);
    expect(applied('zone-blanche').buzzDecayMult).toBeCloseTo(2, 5);
    expect(applied('terre-de-dub').slowGenreArrivalMult).toBeCloseTo(1.3, 5);
    expect(applied('terre-de-dub').fastGenreArrivalMult).toBeCloseTo(0.7, 5);
    expect(applied('fetes-votives').specialNightWeightMult).toBeCloseTo(2, 5);
    expect(applied('fetes-votives').maxEventsBonus).toBe(1);
    expect(applied('fetes-votives').goalRepMult).toBeCloseTo(0.8, 5);
    expect(applied('grands-axes').arrivalMult).toBeCloseTo(1.2, 5);
    expect(applied('grands-axes').churnMult).toBeCloseTo(1.2, 5);
    expect(applied('terre-daccueil').heatMult).toBeCloseTo(0.7, 5);
    expect(applied('region-riche').prixLibreMult).toBeCloseTo(1.25, 5);
  });

  it('les traits composent par produit (Préfet zélé × Terre d’accueil)', () => {
    const rules = buildRegionRules({ nom: 'Test', traits: ['prefet-zele', 'terre-daccueil'] });
    expect(rules.heatMult).toBeCloseTo(1.3 * 0.7, 5);
  });

  it('sans région (tournée 1), les règles sont l’identité', () => {
    expect(buildRegionRules(undefined)).toEqual(defaultRegionRules());
  });
});

describe('legendeMultiplier', () => {
  it('vaut 1 + 0.25 × max(0, somme des difficultés), borné ×1.0 à ×2.0', () => {
    expect(legendeMultiplier([])).toBe(1);
    expect(legendeMultiplier(traits('terre-daccueil', 'region-riche'))).toBe(1); // somme −2 → max(0,·)
    expect(legendeMultiplier(traits('prefet-zele', 'terre-daccueil'))).toBe(1); // somme 0
    expect(legendeMultiplier(traits('zone-quadrillee', 'prefet-zele'))).toBeCloseTo(1.75, 5);
    expect(legendeMultiplier(traits('zone-quadrillee', 'terre-de-beton'))).toBe(2); // somme 4 → ×2.0
  });

  it('Tournée infernale : +50 % seulement si la somme ≥ 2', () => {
    expect(legendeMultiplier(traits('zone-quadrillee'), true)).toBeCloseTo(1.5 * 1.5, 5);
    expect(legendeMultiplier(traits('prefet-zele'), true)).toBeCloseTo(1.25, 5); // somme 1 : pas d'ampli
  });
});

describe('applyRegionLegende', () => {
  it('multiplie le gain de ⭐ et arrondit au floor ; tournée 1 = ×1', () => {
    expect(applyRegionLegende(10, undefined, [])).toBe(10);
    const region = { nom: 'La Vallée grise', traits: ['zone-quadrillee', 'prefet-zele'] };
    expect(applyRegionLegende(10, region, [])).toBe(17); // 10 × 1.75 = 17.5 → 17
    expect(applyRegionLegende(10, region, ['tournee-infernale'])).toBe(26); // 10 × 2.625 → 26
  });
});

describe('regionTraits', () => {
  it('résout les ids et rend [] sans région', () => {
    expect(regionTraits(undefined)).toEqual([]);
    expect(regionTraits({ nom: 'x', traits: ['terre-de-dub'] })[0].nom).toBe('Terre de dub');
    expect(() => regionTraits({ nom: 'x', traits: ['nimporte-quoi'] })).toThrow();
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run src/core/regions.test.ts`
Expected: FAIL — `Cannot find module './regions'`.

- [ ] **Step 3 : implémenter `src/core/regions.ts`**

```ts
/**
 * Les régions (chantier 4) : chaque tournée se joue sous 2 traits qui changent
 * les règles, plus un multiplicateur de ⭐. `RegionRules` est l'objet centralisé
 * de surcharges lu par la sim — pas de `if trait` éparpillés (même philosophie
 * que les modificateurs de nuit).
 */

/** État persisté d'une région (`GameState.region`) — absente en tournée 1. */
export interface RegionState {
  nom: string;
  /** ids dans REGION_TRAITS */
  traits: string[];
}

export interface RegionRules {
  /** × sur la montée de chaleur (tickNight) */
  heatMult: number;
  /**
   * Seuil de heat qui termine la nuit en bust (tickNight) — 1 de base.
   * RÉVISION CHANTIER 1 : remplacera le seuil de descente (0.85 de base, 0.70
   * pour Zone quadrillée).
   */
  bustThreshold: number;
  /**
   * Le casier ne décroît pas. Dormant : aucune décroissance de casier n'existe.
   * RÉVISION CHANTIER 1 : brancher sur la décroissance du casier.
   */
  casierGele: boolean;
  /** × sur le prix libre (settleNight) */
  prixLibreMult: number;
  /** × sur la buvette (tickNight) */
  barMult: number;
  /** × sur la vitesse de décroissance du buzz (applyIdleTime) */
  buzzDecayMult: number;
  /** × sur le poids des modificateurs de nuit négatifs (rollModifiers) */
  negativeModifierWeightMult: number;
  /** spots indisponibles dans la région (isSpotAvailable) */
  bannedSpotIds: string[];
  /** surcharge du seuil de rep d'un spot, par id (isSpotAvailable) */
  repReqOverride: Record<string, number>;
  /**
   * × sur la qualité de set (computeSetQuality).
   * RÉVISION CHANTIER 1 : fallback de « tolérance d'attente −0.05 ».
   */
  setQualityMult: number;
  /** × sur la rep des objectifs de set (endCurrentSet) */
  goalRepMult: number;
  /**
   * Events de nuit supplémentaires possibles (maxEvents).
   * RÉVISION CHANTIER 1 : fallback vivant des « nuits spéciales 2× plus fréquentes ».
   */
  maxEventsBonus: number;
  /** Dormant. RÉVISION CHANTIER 1 : poids du tirage des nuits spéciales. */
  specialNightWeightMult: number;
  /** × sur les arrivées (tickNight) */
  arrivalMult: number;
  /** × sur le churn (tickNight) */
  churnMult: number;
  /** × arrivées des genres ≤ 140 BPM (tickNight) */
  slowGenreArrivalMult: number;
  /** × arrivées des genres > 170 BPM (tickNight) */
  fastGenreArrivalMult: number;
}

/** Les défauts sont l'identité : sans région, la sim est inchangée. */
export function defaultRegionRules(): RegionRules {
  return {
    heatMult: 1,
    bustThreshold: 1,
    casierGele: false,
    prixLibreMult: 1,
    barMult: 1,
    buzzDecayMult: 1,
    negativeModifierWeightMult: 1,
    bannedSpotIds: [],
    repReqOverride: {},
    setQualityMult: 1,
    goalRepMult: 1,
    maxEventsBonus: 0,
    specialNightWeightMult: 1,
    arrivalMult: 1,
    churnMult: 1,
    slowGenreArrivalMult: 1,
    fastGenreArrivalMult: 1,
  };
}

export interface RegionTraitDef {
  id: string;
  nom: string;
  desc: string;
  icon: string;
  /** négatif = confort, positif = contrainte */
  difficulty: -1 | 0 | 1 | 2;
  /** mutation de l'objet de règles centralisé */
  apply: (rules: RegionRules) => void;
  /** poids du tirage (tuning futur) */
  weight: number;
}

export const REGION_TRAITS: RegionTraitDef[] = [
  // --- contraintes (difficulty 1–2) -------------------------------------------
  {
    id: 'zone-quadrillee',
    nom: 'Zone quadrillée',
    desc: 'Les bleus patrouillent serré : la teuf tombe dès 85 % de chaleur.',
    icon: '🚔',
    difficulty: 2,
    apply: (r) => {
      r.bustThreshold = 0.85;
    },
    weight: 1,
  },
  {
    id: 'prefet-zele',
    nom: 'Préfet zélé',
    desc: 'Un préfet à médailles : la chaleur monte 30 % plus vite et le casier ne s’efface pas.',
    icon: '👮',
    difficulty: 1,
    apply: (r) => {
      r.heatMult *= 1.3;
      r.casierGele = true;
    },
    weight: 1,
  },
  {
    id: 'economie-morose',
    nom: 'Économie morose',
    desc: 'Les poches sont vides : prix libre ×0.75, buvette ×0.8.',
    icon: '💸',
    difficulty: 1,
    apply: (r) => {
      r.prixLibreMult *= 0.75;
      r.barMult *= 0.8;
    },
    weight: 1,
  },
  {
    id: 'climat-pourri',
    nom: 'Climat pourri',
    desc: 'Ici il pleut même en août : la météo qui fâche tombe deux fois plus souvent.',
    icon: '🌧',
    difficulty: 1,
    apply: (r) => {
      r.negativeModifierWeightMult *= 2;
    },
    weight: 1,
  },
  {
    id: 'terre-de-beton',
    nom: 'Terre de béton',
    desc: 'Que du bitume : champ, forêt et plage introuvables — mais la carrière est ouverte à tous.',
    icon: '🧱',
    difficulty: 2,
    apply: (r) => {
      r.bannedSpotIds.push('champ', 'foret', 'plage');
      // garde-fou no-softlock : un spot de départ reste jouable à rep 0
      r.repReqOverride.carriere = 0;
    },
    weight: 1,
  },
  {
    id: 'public-exigeant',
    nom: 'Public exigeant',
    desc: 'Des oreilles difficiles : les sets paraissent toujours un peu moins bons.',
    icon: '😤',
    difficulty: 1,
    apply: (r) => {
      r.setQualityMult *= 0.95;
    },
    weight: 1,
  },
  {
    id: 'zone-blanche',
    nom: 'Zone blanche',
    desc: 'Pas de réseau : le buzz retombe deux fois plus vite entre les teufs.',
    icon: '📵',
    difficulty: 1,
    apply: (r) => {
      r.buzzDecayMult *= 2;
    },
    weight: 1,
  },
  // --- caractère (difficulty 0) ------------------------------------------------
  {
    id: 'terre-de-dub',
    nom: 'Terre de dub',
    desc: 'Pays de basses lourdes : les sons ≤ 140 BPM attirent ×1.3, au-delà de 170 BPM ×0.7.',
    icon: '🎶',
    difficulty: 0,
    apply: (r) => {
      r.slowGenreArrivalMult *= 1.3;
      r.fastGenreArrivalMult *= 0.7;
    },
    weight: 1,
  },
  {
    id: 'fetes-votives',
    nom: 'Pays des fêtes votives',
    desc: 'Il se passe toujours quelque chose : plus d’histoires la nuit, mais la rep des objectifs ×0.8.',
    icon: '🎪',
    difficulty: 0,
    apply: (r) => {
      r.specialNightWeightMult *= 2;
      r.maxEventsBonus += 1;
      r.goalRepMult *= 0.8;
    },
    weight: 1,
  },
  {
    id: 'grands-axes',
    nom: 'Grands axes',
    desc: 'L’autoroute passe à côté : le monde afflue ×1.2 et repart ×1.2.',
    icon: '🛣',
    difficulty: 0,
    apply: (r) => {
      r.arrivalMult *= 1.2;
      r.churnMult *= 1.2;
    },
    weight: 1,
  },
  // --- confort (difficulty −1, max 1 par région) --------------------------------
  {
    id: 'terre-daccueil',
    nom: 'Terre d’accueil',
    desc: 'Les gendarmes d’ici ont d’autres chats à fouetter : chaleur ×0.7.',
    icon: '🤝',
    difficulty: -1,
    apply: (r) => {
      r.heatMult *= 0.7;
    },
    weight: 1,
  },
  {
    id: 'region-riche',
    nom: 'Région riche',
    desc: 'Le prix libre coule : dons ×1.25.',
    icon: '🍾',
    difficulty: -1,
    apply: (r) => {
      r.prixLibreMult *= 1.25;
    },
    weight: 1,
  },
];

export function getRegionTrait(id: string): RegionTraitDef {
  const trait = REGION_TRAITS.find((t) => t.id === id);
  if (!trait) throw new Error(`unknown region trait: ${id}`);
  return trait;
}

/** Les defs des traits d'une région (ou [] sans région — tournée 1). */
export function regionTraits(region: RegionState | undefined): RegionTraitDef[] {
  return region ? region.traits.map(getRegionTrait) : [];
}

/** Multiplicateur ⭐ = 1 + 0.25 × max(0, somme des difficulty) → ×1.0 à ×2.0. */
export function legendeMultiplier(traits: RegionTraitDef[], infernale = false): number {
  const sum = traits.reduce((acc, t) => acc + t.difficulty, 0);
  let mult = 1 + 0.25 * Math.max(0, sum);
  // le perk Héritage « Tournée infernale » amplifie les régions à somme ≥ 2
  if (infernale && sum >= 2) mult *= 1.5;
  return mult;
}

/** id du perk Héritage « Tournée infernale » (chantier 3). */
export const PERK_TOURNEE_INFERNALE = 'tournee-infernale';

/** Applique le multiplicateur de région au gain de ⭐ calculé par tour.ts. */
export function applyRegionLegende(
  base: number,
  region: RegionState | undefined,
  perks: string[],
): number {
  return Math.floor(
    base * legendeMultiplier(regionTraits(region), perks.includes(PERK_TOURNEE_INFERNALE)),
  );
}

/** Construit l'objet de règles depuis la région courante (identité sans région). */
export function buildRegionRules(region: RegionState | undefined): RegionRules {
  const rules = defaultRegionRules();
  for (const trait of regionTraits(region)) trait.apply(rules);
  return rules;
}
```

- [ ] **Step 4 : ajouter `GameState.region` dans `src/core/types.ts`**

Sous la ligne existante `import type { NightModifierDef } from './modifiers';` ajouter :

```ts
import type { RegionState } from './regions';
```

Dans `interface GameState`, après `wonTeknival: boolean;` ajouter :

```ts
  /** région de la tournée courante (chantier 4) — absente en tournée 1 */
  region?: RegionState;
```

(Si le merge du chantier 3 a ajouté un bloc `tour` à `GameState`, le champ `region` s'ajoute à côté, sans conflit.)

- [ ] **Step 5 : vérifier le vert complet**

Run: `npm run test && npm run build`
Expected: PASS — `regions.test.ts` vert, aucune régression (les défauts sont l'identité, rien d'autre ne lit encore les règles).

- [ ] **Step 6 : commit**

```bash
git add src/core/regions.ts src/core/regions.test.ts src/core/types.ts
git commit -m "feat(core): les régions — 12 traits et l'objet de règles centralisé

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Le tirage — 3 cartes-régions à graine, noms français

**Files:**
- Modify: `src/core/regions.ts`
- Modify: `src/core/regions.test.ts`

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter à `src/core/regions.test.ts` (compléter la ligne d'import existante avec `drawRegions, toRegionState`) :

```ts
import { drawRegions, toRegionState } from './regions';

describe('drawRegions', () => {
  it('est déterministe : même graine → mêmes 3 régions', () => {
    const a = drawRegions(7);
    const b = drawRegions(7);
    expect(a.map((c) => c.nom)).toEqual(b.map((c) => c.nom));
    expect(a.map((c) => c.traits.map((t) => t.id))).toEqual(b.map((c) => c.traits.map((t) => t.id)));
  });

  it('deux graines différentes donnent des tirages différents quelque part', () => {
    const all = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      all.add(drawRegions(seed).map((c) => c.traits.map((t) => t.id).join(',')).join('|'));
    }
    expect(all.size).toBeGreaterThan(1);
  });

  it('3 cartes distinctes, 2 traits distincts chacune, jamais deux conforts, mult conforme', () => {
    for (let seed = 0; seed < 300; seed++) {
      const choices = drawRegions(seed);
      expect(choices).toHaveLength(3);
      for (const c of choices) {
        expect(c.traits).toHaveLength(2);
        expect(c.traits[0].id).not.toBe(c.traits[1].id);
        const conforts = c.traits.filter((t) => t.difficulty === -1).length;
        expect(conforts).toBeLessThanOrEqual(1);
        expect(c.mult).toBeCloseTo(legendeMultiplier(c.traits), 5);
        expect(c.mult).toBeGreaterThanOrEqual(1);
        expect(c.mult).toBeLessThanOrEqual(2);
        expect(c.nom.length).toBeGreaterThan(3);
      }
      const pairs = choices.map((c) => c.traits.map((t) => t.id).sort().join('+'));
      expect(new Set(pairs).size).toBe(3);
      expect(new Set(choices.map((c) => c.nom)).size).toBe(3);
    }
  });
});

describe('toRegionState', () => {
  it('ne persiste que le nom et les ids de traits', () => {
    const choice = drawRegions(7)[0];
    expect(toRegionState(choice)).toEqual({
      nom: choice.nom,
      traits: choice.traits.map((t) => t.id),
    });
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run src/core/regions.test.ts`
Expected: FAIL — `drawRegions` n'est pas exporté.

- [ ] **Step 3 : implémenter le tirage dans `src/core/regions.ts`**

En tête de fichier ajouter l'import :

```ts
import { mulberry32 } from './rng';
```

En fin de fichier ajouter :

```ts
// --- le tirage ----------------------------------------------------------------

/** Une carte-région présentée au départ en tournée. */
export interface RegionChoice {
  nom: string;
  traits: [RegionTraitDef, RegionTraitDef];
  /** multiplicateur de ⭐, pré-calculé pour l'affichage */
  mult: number;
}

const REGION_LIEUX = [
  { nom: 'La Creuse', f: true },
  { nom: 'Le Triangle', f: false },
  { nom: 'La Vallée', f: true },
  { nom: 'Le Plateau', f: false },
  { nom: 'La Plaine', f: true },
  { nom: 'Le Causse', f: false },
  { nom: 'La Lande', f: true },
  { nom: 'Le Marais', f: false },
  { nom: 'La Combe', f: true },
  { nom: 'Le Bocage', f: false },
] as const;

const REGION_EPITHETES = [
  { f: 'profonde', m: 'profond' },
  { f: 'grise', m: 'gris' },
  { f: 'sauvage', m: 'sauvage' },
  { f: 'perdue', m: 'perdu' },
  { f: 'rouge', m: 'rouge' },
  { f: 'noire', m: 'noir' },
  { f: 'oubliée', m: 'oublié' },
  { f: 'électrique', m: 'électrique' },
  { f: 'brûlée', m: 'brûlé' },
  { f: 'des Landes', m: 'des Landes' },
] as const;

function weightedPick(pool: RegionTraitDef[], rng: () => number): RegionTraitDef {
  const total = pool.reduce((acc, t) => acc + t.weight, 0);
  let roll = rng() * total;
  for (const trait of pool) {
    roll -= trait.weight;
    if (roll <= 0) return trait;
  }
  return pool[pool.length - 1];
}

/** 2 traits distincts — jamais deux traits de confort ensemble. */
function drawTraitPair(rng: () => number): [RegionTraitDef, RegionTraitDef] {
  const first = weightedPick(REGION_TRAITS, rng);
  const pool = REGION_TRAITS.filter(
    (t) => t.id !== first.id && !(first.difficulty === -1 && t.difficulty === -1),
  );
  return [first, weightedPick(pool, rng)];
}

function drawName(rng: () => number, used: Set<string>): string {
  for (let guard = 0; guard < 100; guard++) {
    const lieu = REGION_LIEUX[Math.floor(rng() * REGION_LIEUX.length)];
    const ep = REGION_EPITHETES[Math.floor(rng() * REGION_EPITHETES.length)];
    const nom = `${lieu.nom} ${lieu.f ? ep.f : ep.m}`;
    if (!used.has(nom)) return nom;
  }
  return `${REGION_LIEUX[0].nom} ${REGION_EPITHETES[0].f}`;
}

/**
 * Tire 3 cartes-régions distinctes (paires de traits et noms uniques) via un
 * flux RNG dédié — déterministe pour une graine donnée.
 */
export function drawRegions(seed: number): RegionChoice[] {
  const rng = mulberry32((seed ^ 0x51ed270b) >>> 0);
  const choices: RegionChoice[] = [];
  const usedPairs = new Set<string>();
  const usedNames = new Set<string>();
  for (let guard = 0; guard < 1000 && choices.length < 3; guard++) {
    const traits = drawTraitPair(rng);
    const key = traits
      .map((t) => t.id)
      .sort()
      .join('+');
    if (usedPairs.has(key)) continue;
    const nom = drawName(rng, usedNames);
    usedPairs.add(key);
    usedNames.add(nom);
    choices.push({ nom, traits, mult: legendeMultiplier(traits) });
  }
  return choices;
}

/** Réduit une carte choisie à l'état persistable (`GameState.region`). */
export function toRegionState(choice: RegionChoice): RegionState {
  return { nom: choice.nom, traits: choice.traits.map((t) => t.id) };
}
```

- [ ] **Step 4 : vérifier le vert complet**

Run: `npm run test && npm run build`
Expected: PASS.

- [ ] **Step 5 : commit**

```bash
git add src/core/regions.ts src/core/regions.test.ts
git commit -m "feat(core): tirage de 3 régions à graine — paires gardées, noms composés

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: La nuit lit les règles (`night.ts`)

**Files:**
- Modify: `src/core/types.ts` (champ `NightState.rules`)
- Modify: `src/core/night.ts`
- Modify: `src/core/regions.test.ts`

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter à `src/core/regions.test.ts` :

```ts
import { newGame } from './save';
import { applyEffects, createNight, startSet, tickNight } from './night';
import type { GameState } from './types';

describe('les règles de région dans la nuit', () => {
  function playingNight(traits: string[], seed = 1) {
    const state = newGame(42);
    if (traits.length > 0) state.region = { nom: 'Région test', traits };
    const night = createNight(state, 'champ', ['tonton'], seed);
    startSet(state, night, 'tonton', 'normal');
    return { state, night };
  }

  it('Terre d’accueil : la chaleur monte moins vite sur un tick', () => {
    const base = playingNight([]);
    base.night.heat = 0;
    tickNight(base.state, base.night, 0.1);
    const accueil = playingNight(['terre-daccueil']);
    accueil.night.heat = 0;
    tickNight(accueil.state, accueil.night, 0.1);
    expect(accueil.night.heat).toBeLessThan(base.night.heat);
    expect(accueil.night.heat).toBeGreaterThan(0);
  });

  it('Zone quadrillée : le bust tombe dès 85 % de chaleur', () => {
    const base = playingNight([]);
    base.night.heat = 0.86;
    expect(tickNight(base.state, base.night, 0.1).some((e) => e.type === 'bust')).toBe(false);
    const quad = playingNight(['zone-quadrillee']);
    quad.night.heat = 0.86;
    const events = tickNight(quad.state, quad.night, 0.1);
    expect(events.some((e) => e.type === 'bust')).toBe(true);
    expect(quad.night.busted).toBe(true);
  });

  it('les events ne franchissent jamais le seuil de descente (clamp sous le seuil)', () => {
    const quad = playingNight(['zone-quadrillee']);
    applyEffects(quad.state, quad.night, { heat: 1 });
    expect(quad.night.heat).toBeCloseTo(0.84, 5);
    const base = playingNight([]);
    applyEffects(base.state, base.night, { heat: 1 });
    expect(base.night.heat).toBeCloseTo(0.99, 5); // comportement actuel conservé
  });

  it('Public exigeant : la qualité de set prend −5 %', () => {
    const base = playingNight([]);
    const exigeant = playingNight(['public-exigeant']);
    expect(exigeant.night.setQuality).toBeCloseTo(base.night.setQuality * 0.95, 5);
  });

  it('Grands axes : la foule afflue plus vite', () => {
    const base = playingNight([]);
    base.night.crowd = 0;
    tickNight(base.state, base.night, 0.1);
    const axes = playingNight(['grands-axes']);
    axes.night.crowd = 0;
    tickNight(axes.state, axes.night, 0.1);
    expect(axes.night.crowd).toBeGreaterThan(base.night.crowd);
  });

  it('Terre de dub : le dub (75 BPM) attire plus, la frenchcore (200 BPM) moins', () => {
    function arrivalOneTick(traits: string[], djId: string): number {
      const state: GameState = newGame(42);
      if (traits.length > 0) state.region = { nom: 'Région test', traits };
      state.crew.push({ id: djId, xp: 0, fatigue: 0, setsPlayed: 0 });
      const night = createNight(state, 'champ', [djId], 1);
      startSet(state, night, djId, 'normal');
      night.crowd = 0;
      tickNight(state, night, 0.1);
      return night.crowd;
    }
    expect(arrivalOneTick(['terre-de-dub'], 'boblepine')).toBeGreaterThan(
      arrivalOneTick([], 'boblepine'),
    );
    expect(arrivalOneTick(['terre-de-dub'], 'kilowatt')).toBeLessThan(
      arrivalOneTick([], 'kilowatt'),
    );
  });

  it('Économie morose : la buvette rapporte ×0.8 sur un tick', () => {
    const base = playingNight([]);
    base.night.crowd = 20;
    base.night.bank = 0;
    tickNight(base.state, base.night, 0.1);
    const morose = playingNight(['economie-morose']);
    morose.night.crowd = 20;
    morose.night.bank = 0;
    tickNight(morose.state, morose.night, 0.1);
    expect(morose.night.bank).toBeCloseTo(base.night.bank * 0.8, 5);
  });

  it('Pays des fêtes votives : la rep des objectifs ×0.8', () => {
    function repAfterForcedGoal(traits: string[]): number {
      const state = newGame(42);
      if (traits.length > 0) state.region = { nom: 'Région test', traits };
      const night = createNight(state, 'champ', ['tonton'], 1);
      startSet(state, night, 'tonton', 'normal');
      night.setGoal = { id: 'test', label: 'test', reward: { rep: 10 }, met: () => true, weight: () => 1 };
      night.setElapsed = night.setLen - 0.05; // le tick suivant clôt le set
      tickNight(state, night, 0.1);
      return night.repBonus;
    }
    expect(repAfterForcedGoal([])).toBe(10);
    expect(repAfterForcedGoal(['fetes-votives'])).toBe(8);
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run src/core/regions.test.ts`
Expected: FAIL — les comparaisons base/région sont égales (les règles ne sont pas lues), et le clamp `0.84` échoue (clamp actuel à 0.99).

- [ ] **Step 3 : `NightState.rules` dans `src/core/types.ts`**

Étendre l'import du Task 1 :

```ts
import type { RegionRules, RegionState } from './regions';
```

Dans `interface NightState`, après le champ `modifiers: NightModifierDef[];` ajouter :

```ts
  /** règles de la région de tournée (identité en tournée 1), figées au lancement */
  rules: RegionRules;
```

- [ ] **Step 4 : implémenter dans `src/core/night.ts`**

1. Ajouter l'import en tête (après `import { mulberry32 } from './rng';`) :

```ts
import { buildRegionRules } from './regions';
```

2. Dans `createNight`, juste AVANT la ligne `const modifiers = rollModifiers(spot.tier, seed);` :

```ts
  const rules = buildRegionRules(state.region);
```

et dans l'objet retourné, après `modifiers,` :

```ts
    rules,
```

3. `computeSetQuality` : renommer le paramètre `_night` en `night` et appliquer le multiplicateur. La fonction devient :

```ts
export function computeSetQuality(state: GameState, night: NightState, djId: string, brief: Brief): number {
  const def = getDj(djId);
  const member = getCrewMember(state, djId);
  const platines = GEAR.platines[state.gear.platines].value * (state.damaged.platines ? 0.7 : 1);
  const tech = effectiveTechnique(def, member);
  const base = 0.18 + 0.16 * tech;
  return clamp(
    base * platines * BRIEF_QUALITY[brief] * fatigueQualityMult(member) * night.rules.setQualityMult,
    0.05,
    1.5,
  );
}
```

4. `maxEvents` :

```ts
function maxEvents(night: NightState): number {
  return Math.min(4, 1 + Math.floor(night.setCount / 2)) + night.rules.maxEventsBonus;
}
```

5. Dans `tickNight`, le calcul d'arrivées (bloc `--- crowd ---`) devient :

```ts
  // terre de dub & co : la région booste/freine certaines familles de BPM
  const genreRegionMult =
    genre.bpm <= 140
      ? night.rules.slowGenreArrivalMult
      : genre.bpm > 170
        ? night.rules.fastGenreArrivalMult
        : 1;
  const arrival =
    spot.arrival * genre.arrival * (1 + state.buzz) * (1 + state.rep * 0.002) * pull * arrivalCut *
    arrivalMod * night.rules.arrivalMult * genreRegionMult;
```

et la ligne `leaving` :

```ts
  const leaving = night.crowd * genre.churn * churnMod * night.rules.churnMult * retention * leaveMult;
```

6. La ligne de heat (bloc `--- heat ---`) devient :

```ts
  night.heat += spot.heatBuild * genre.heatMult * BRIEF_HEAT[night.brief] * riskMult * logistique * heatMod * night.rules.heatMult * HEAT_BASE * dt;
```

et le déclencheur de bust :

```ts
  if (night.heat >= night.rules.bustThreshold) {
```

7. La ligne de buvette (bloc `--- bar drip ---`) :

```ts
  night.bank += night.crowd * BAR_DRIP * spot.priceMult * priceMod * night.rules.barMult * dt;
```

8. Dans `endCurrentSet`, la récompense d'objectif :

```ts
    if (night.setGoal.met(stats)) {
      night.repBonus += (night.setGoal.reward.rep ?? 0) * night.rules.goalRepMult;
      night.bank += night.setGoal.reward.cash ?? 0;
      night.goalsMet.push(night.setGoal.label);
    }
```

9. Dans `applyEffects`, la ligne heat devient (les events restent incapables de franchir le seuil — l'invariant actuel « clamp à 0.99 » devient « clamp à seuil − 0.01 », identique quand le seuil vaut 1) :

```ts
  if (fx.heat) night.heat = clamp(night.heat + fx.heat, 0, night.rules.bustThreshold - 0.01);
```

10. Dans `dropMontee`, la ligne heat devient :

```ts
  night.heat = clamp(night.heat + 0.02 + 0.06 * m, 0, night.rules.bustThreshold - 0.01);
```

- [ ] **Step 5 : vérifier le vert complet**

Run: `npm run test && npm run build`
Expected: PASS — y compris `src/core/progression.test.ts` (tournée 1 sans région : règles identité, sim inchangée) et `test/night.test.ts` (aucune expectation chiffrée ne dépend des multiplicateurs ×1).

- [ ] **Step 6 : commit**

```bash
git add src/core/types.ts src/core/night.ts src/core/regions.test.ts
git commit -m "feat(core): la nuit sous les règles de région — chaleur, seuil, foule, buvette

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Règlement, spots et buzz sous les règles (`payout.ts`, `idle.ts`)

**Files:**
- Modify: `src/core/payout.ts`
- Modify: `src/core/idle.ts`
- Modify: `src/core/regions.test.ts`

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter à `src/core/regions.test.ts` :

```ts
import { applyIdleTime } from './idle';
import { isSpotAvailable, settleNight } from './payout';

describe('les règles de région au règlement et entre les teufs', () => {
  function finishedNight(state: GameState) {
    const night = createNight(state, 'champ', ['tonton'], 1);
    Object.assign(night, {
      t: 180,
      phase: 'ended',
      sunrise: true,
      bank: 100,
      peakCrowd: 30,
      vibeSum: 0.8 * 180,
      vibeSamples: 180,
      playedSets: [{ djId: 'tonton', brief: 'normal' }],
    });
    return night;
  }

  it('Région riche : prix libre ×1.25 au règlement', () => {
    const base = newGame();
    const baseResult = settleNight(base, finishedNight(base));
    const riche = newGame();
    riche.region = { nom: 'La Combe rouge', traits: ['region-riche'] };
    const richeResult = settleNight(riche, finishedNight(riche));
    expect(richeResult.donationMult).toBeCloseTo(baseResult.donationMult * 1.25, 5);
    expect(richeResult.gross).toBeGreaterThan(baseResult.gross);
  });

  it('Économie morose : prix libre ×0.75 au règlement', () => {
    const base = newGame();
    const baseResult = settleNight(base, finishedNight(base));
    const morose = newGame();
    morose.region = { nom: 'Le Causse gris', traits: ['economie-morose'] };
    const moroseResult = settleNight(morose, finishedNight(morose));
    expect(moroseResult.donationMult).toBeCloseTo(baseResult.donationMult * 0.75, 5);
  });

  it('Terre de béton : champ/forêt bannis, la carrière ouverte à rep 0', () => {
    const state = newGame();
    expect(isSpotAvailable(state, 'champ')).toBe(true);
    expect(isSpotAvailable(state, 'carriere')).toBe(false); // rep 0 < 45
    state.region = { nom: 'Le Plateau noir', traits: ['terre-de-beton'] };
    expect(isSpotAvailable(state, 'champ')).toBe(false);
    expect(isSpotAvailable(state, 'foret')).toBe(false);
    expect(isSpotAvailable(state, 'carriere')).toBe(true); // garde-fou no-softlock
    expect(isSpotAvailable(state, 'hangar')).toBe(false); // la rep gate les autres normalement
  });

  it('Zone blanche : le buzz décroît deux fois plus vite', () => {
    const base = newGame(0);
    base.buzz = 1;
    applyIdleTime(base, 24 * 3_600_000); // une demi-vie
    const blanche = newGame(0);
    blanche.buzz = 1;
    blanche.region = { nom: 'Le Marais perdu', traits: ['zone-blanche'] };
    applyIdleTime(blanche, 24 * 3_600_000);
    expect(base.buzz).toBeCloseTo(0.5, 5);
    expect(blanche.buzz).toBeCloseTo(0.25, 5);
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run src/core/regions.test.ts`
Expected: FAIL — `isSpotAvailable` n'existe pas ; donationMult et buzz identiques avec ou sans région.

- [ ] **Step 3 : implémenter dans `src/core/payout.ts`**

1. Ajouter l'import :

```ts
import { buildRegionRules } from './regions';
```

2. Dans `settleNight`, la ligne `donationMult` devient (les règles voyagent déjà sur la nuit via `night.rules`, figées au lancement) :

```ts
  const donationMult = (1 + 0.8 * vibe + 0.6 * (night.peakCrowd / night.cap)) * night.rules.prixLibreMult;
```

3. Après `isSpotUnlocked` (conservé tel quel — `test/payout.test.ts` l'utilise), ajouter :

```ts
/**
 * Un spot est jouable si la rep suffit ET si la région ne l'interdit pas.
 * Une région peut aussi surcharger le seuil de rep (Terre de béton ouvre la
 * carrière à rep 0 — garde-fou no-softlock).
 */
export function isSpotAvailable(state: GameState, spotId: NightState['spotId']): boolean {
  const rules = buildRegionRules(state.region);
  if (rules.bannedSpotIds.includes(spotId)) return false;
  const req = rules.repReqOverride[spotId] ?? getSpot(spotId).repReq;
  return state.rep >= req;
}
```

- [ ] **Step 4 : implémenter dans `src/core/idle.ts`**

Ajouter l'import :

```ts
import { buildRegionRules } from './regions';
```

Dans `applyIdleTime`, la ligne de décroissance devient :

```ts
  const rules = buildRegionRules(state.region);
  state.buzz *= Math.pow(0.5, (hours * rules.buzzDecayMult) / BUZZ_HALF_LIFE_HOURS);
```

- [ ] **Step 5 : vérifier le vert complet**

Run: `npm run test && npm run build`
Expected: PASS — `test/payout.test.ts` (donationMult 2.14 inchangé : `prixLibreMult` vaut 1 sans région) et `test/idle.test.ts` (demi-vie inchangée sans région) restent verts.

- [ ] **Step 6 : commit**

```bash
git add src/core/payout.ts src/core/idle.ts src/core/regions.test.ts
git commit -m "feat(core): prix libre, spots et buzz sous les règles de région

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Climat pourri — la météo négative pèse double (`modifiers.ts`)

**Files:**
- Modify: `src/core/modifiers.ts`
- Modify: `src/core/night.ts` (passe le multiplicateur au tirage)
- Modify: `src/core/regions.test.ts`

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter à `src/core/regions.test.ts` :

```ts
import { NIGHT_MODIFIERS, rollModifiers } from './modifiers';

describe('Climat pourri : la météo négative pèse double', () => {
  it('le multiplicateur à 1 ne change rien au tirage (déterminisme conservé)', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(rollModifiers(2, seed, 1).map((m) => m.id)).toEqual(
        rollModifiers(2, seed).map((m) => m.id),
      );
    }
  });

  it('×2 augmente la fréquence des modificateurs négatifs', () => {
    const negIds = new Set(NIGHT_MODIFIERS.filter((m) => m.negatif).map((m) => m.id));
    expect(negIds.size).toBeGreaterThanOrEqual(3); // pluie, brouillard, touristes
    const countNeg = (mult: number) => {
      let n = 0;
      for (let seed = 0; seed < 400; seed++) {
        for (const m of rollModifiers(3, seed, mult)) if (negIds.has(m.id)) n++;
      }
      return n;
    };
    expect(countNeg(2)).toBeGreaterThan(countNeg(1));
  });

  it('createNight branche le multiplicateur de la région', () => {
    const countNegNights = (traits: string[]) => {
      let n = 0;
      for (let seed = 0; seed < 200; seed++) {
        const state = newGame(42);
        if (traits.length > 0) state.region = { nom: 'Région test', traits };
        const night = createNight(state, 'foret', ['tonton'], seed);
        if (night.modifiers.some((m) => m.negatif)) n++;
      }
      return n;
    };
    expect(countNegNights(['climat-pourri'])).toBeGreaterThan(countNegNights([]));
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run src/core/regions.test.ts`
Expected: FAIL — `negatif` n'existe pas sur `NightModifierDef`, `rollModifiers` n'accepte pas de 3e argument.

- [ ] **Step 3 : implémenter dans `src/core/modifiers.ts`**

1. Dans `interface NightModifierDef`, après `eventDelay?: number;` ajouter :

```ts
  /** météo/foule qui fâche — pèse plus lourd sous « Climat pourri » (régions) */
  negatif?: boolean;
```

2. Marquer les trois defs hostiles : ajouter `negatif: true,` juste au-dessus de la ligne `weight:` dans les entrées `pluie`, `brouillard` et `touristes` du deck `NIGHT_MODIFIERS`.

3. `rollModifiers` gagne un paramètre (même consommation de RNG : le multiplicateur ne touche que les poids, le flux reste déterministe et les tirages existants à `negWeightMult = 1` sont bit-à-bit identiques) :

```ts
export function rollModifiers(spotTier: number, seed: number, negWeightMult = 1): NightModifierDef[] {
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  // 1 ou 2 modifs ce soir (≈ moitié-moitié)
  const count = rng() < 0.5 ? 1 : 2;
  const picked: NightModifierDef[] = [];
  for (let n = 0; n < count; n++) {
    const pool = NIGHT_MODIFIERS.filter((m) => !picked.includes(m));
    const weights = pool.map((m) => Math.max(0, m.weight(spotTier) * (m.negatif ? negWeightMult : 1)));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) break;
    let roll = rng() * total;
    let chosen = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        chosen = pool[i];
        break;
      }
    }
    picked.push(chosen);
  }
  return picked;
}
```

4. Dans `src/core/night.ts` (`createNight`), la ligne de tirage devient (la ligne `const rules = …` du Task 3 est juste au-dessus) :

```ts
  const modifiers = rollModifiers(spot.tier, seed, rules.negativeModifierWeightMult);
```

- [ ] **Step 4 : vérifier le vert complet**

Run: `npm run test && npm run build`
Expected: PASS — `src/core/modifiers.test.ts` reste vert (le tirage pinné `['nuit-claire', 'famille-son']` à graine 7 est inchangé : multiplicateur par défaut 1, aucune consommation de RNG ajoutée).

- [ ] **Step 5 : commit**

```bash
git add src/core/modifiers.ts src/core/night.ts src/core/regions.test.ts
git commit -m "feat(core): climat pourri — la météo qui fâche pèse double au tirage

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: La région voyage dans la sauvegarde (`save.ts`)

**Files:**
- Modify: `src/core/save.ts`
- Modify: `test/save.test.ts`

`region` est un champ **optionnel** : pas de bump de version (une save sans région = tournée 1, exactement la sémantique voulue — même pattern que la migration « bloc `tour` absent » du chantier 3). On valide seulement la forme quand le champ est présent.

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter à `test/save.test.ts` :

```ts
describe('la région voyage dans la sauvegarde', () => {
  it('roundtrip complet avec une région', () => {
    const state = newGame(123);
    state.region = { nom: 'La Vallée grise', traits: ['zone-quadrillee', 'prefet-zele'] };
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it('une save sans région reste valide (tournée 1)', () => {
    const parsed = deserialize(serialize(newGame()));
    expect(parsed).not.toBeNull();
    expect(parsed!.region).toBeUndefined();
  });

  it('rejette une région malformée', () => {
    const state = newGame();
    expect(deserialize(JSON.stringify({ ...state, region: { nom: 42 } }))).toBeNull();
    expect(deserialize(JSON.stringify({ ...state, region: { nom: 'x', traits: 'pas-un-tableau' } }))).toBeNull();
  });
});
```

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run test/save.test.ts`
Expected: FAIL — le test « rejette une région malformée » échoue (`deserialize` accepte tout objet `region` aujourd'hui). Le roundtrip passe déjà (JSON transporte le champ) : c'est attendu, seule la validation manque.

- [ ] **Step 3 : implémenter dans `src/core/save.ts`**

Dans `isValidState`, étendre la conjonction finale (après `Array.isArray(o.repairs)` — si le merge du chantier 3 a ajouté d'autres clauses, ajouter celle-ci à la suite) :

```ts
    Array.isArray(o.repairs) &&
    (o.region === undefined ||
      (typeof o.region === 'object' &&
        o.region !== null &&
        typeof (o.region as Record<string, unknown>).nom === 'string' &&
        Array.isArray((o.region as Record<string, unknown>).traits)))
```

`newGame` ne change pas : la tournée 1 n'a pas de région (champ absent).

- [ ] **Step 4 : vérifier le vert complet**

Run: `npm run test && npm run build`
Expected: PASS.

- [ ] **Step 5 : commit**

```bash
git add src/core/save.ts test/save.test.ts
git commit -m "feat(core): la région voyage dans la sauvegarde — optionnelle, validée

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Le multiplicateur de ⭐ et le choix de région au départ (`tour.ts`)

**Files:**
- Modify: `src/core/tour.ts` (créé par le plan chantier 3, mergé avant exécution)
- Modify: `test/tour.test.ts` (idem)

> **NOTE INTÉGRATION CHANTIER 3 :** ce task se branche sur deux points précis du plan prestige (`docs/superpowers/plans/2026-06-12-prestige-tournee.md`) : (a) `computeLegende(state)`, la fonction exportée de `src/core/tour.ts` qui calcule le gain de ⭐ au départ (`legende = floor(rep/100) + 3 × victoires Teknival cette tournée`), (b) `departOnTour(state, veteranIds: string[] = [])`, le reset du départ en tournée — il construit un nouvel état `fresh` (via `newGame`) et le retourne. Si les exports effectivement mergés portent d'autres noms, substituer les noms réels — le corps des changements et les assertions restent identiques. L'id de perk `'tournee-infernale'` correspond à l'entrée « Tournée infernale » du tableau PERKS du plan chantier 3 (l'aligner si besoin, dans `PERK_TOURNEE_INFERNALE` de `regions.ts`).

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter à `test/tour.test.ts` (réutiliser la fixture d'état des tests de gain existants du chantier 3 ; le test calcule la base via la fonction elle-même, donc il est robuste à la formule exacte) :

```ts
import { computeLegende, departOnTour } from '../src/core/tour';

describe('le multiplicateur de région sur le gain de ⭐', () => {
  it('multiplie le gain de la tournée écoulée et arrondit au floor', () => {
    const state = newGame();
    state.rep = 400;
    state.wonTeknival = true;
    const base = computeLegende(state); // sans région (tournée 1) : multiplicateur ×1
    state.region = { nom: 'La Vallée grise', traits: ['zone-quadrillee', 'prefet-zele'] }; // somme 3 → ×1.75
    expect(computeLegende(state)).toBe(Math.floor(base * 1.75));
  });

  it('le perk Tournée infernale amplifie les régions à somme ≥ 2', () => {
    const state = newGame();
    state.rep = 400;
    state.wonTeknival = true;
    state.region = { nom: 'La Vallée grise', traits: ['zone-quadrillee', 'prefet-zele'] };
    const sansPerk = computeLegende(state);
    state.tour.perks.push('tournee-infernale');
    const basePure = Math.round(sansPerk / 1.75); // base entière avant multiplicateur
    expect(computeLegende(state)).toBe(Math.floor(basePure * 1.75 * 1.5));
  });

  it('le départ enregistre la région choisie pour la nouvelle tournée', () => {
    const state = newGame();
    state.wonTeknival = true;
    const region = { nom: 'Le Plateau noir', traits: ['terre-de-beton', 'economie-morose'] };
    const next = departOnTour(state, [], region);
    expect(next.region).toEqual(region);
    const sansRegion = departOnTour(state, []);
    expect(sansRegion.region).toBeUndefined();
  });
});
```

(Adapter les deux imports et la construction de `state.tour` à la forme mergée du chantier 3 — par exemple si `departOnTour` mute l'état au lieu de retourner un nouvel état, asserter sur `state.region` après l'appel.)

- [ ] **Step 2 : vérifier l'échec**

Run: `npx vitest run test/tour.test.ts`
Expected: FAIL — le gain ne bouge pas quand `state.region` est posé, et `departOnTour` n'accepte pas de paramètre région.

- [ ] **Step 3 : implémenter dans `src/core/tour.ts`**

1. Ajouter l'import :

```ts
import { applyRegionLegende } from './regions';
import type { RegionState } from './regions';
```

2. Dans la fonction de calcul du gain (`computeLegende`), envelopper le résultat : isoler le calcul actuel dans une constante `base` (un entier — la formule du chantier 3) et retourner :

```ts
  return applyRegionLegende(base, state.region, state.tour.perks);
```

Le multiplicateur s'applique à la région de la tournée **écoulée** (`state.region` au moment du départ), avant le reset. En tournée 1 (`region` absent), `applyRegionLegende` vaut `Math.floor(base × 1)` = `base`.

3. La fonction de reset (`departOnTour`) gagne un paramètre final **avec défaut** `region: RegionState | null = null` (le défaut est obligatoire : les appels à deux arguments des tests du chantier 3 doivent continuer de compiler tels quels). Dans le corps, juste avant le `return` du nouvel état (`fresh` dans le plan chantier 3 — l'état construit via `newGame` et retourné), poser :

```ts
  fresh.region = region ?? undefined;
```

(Si le reset mergé mute `state` en place au lieu de retourner un nouvel état, écrire `state.region = region ?? undefined;` après le nettoyage des champs.) Le gain de ⭐ étant calculé par `computeLegende(state)` AVANT ce remplacement (sur l'état de la tournée écoulée), le multiplicateur de la région sortante s'applique bien au gain, puis la région choisie part sur la nouvelle tournée : `createNight`, `settleNight`, `applyIdleTime` et `isSpotAvailable` la lisent à chaque nuit via `state.region`.

- [ ] **Step 4 : vérifier le vert complet**

Run: `npm run test && npm run build`
Expected: PASS — y compris les tests de `tour.test.ts` du chantier 3 (sans région, `applyRegionLegende` est un floor neutre sur un entier).

- [ ] **Step 5 : commit**

```bash
git add src/core/tour.ts test/tour.test.ts
git commit -m "feat(core): les régions dures paient plus de ⭐ — multiplicateur au départ

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: UI — cartes de région au départ, bandeau à la prépa, spots bannis

**Files:**
- Modify: `src/ui/strings.ts`
- Modify: `src/ui/screens.ts`
- Modify: `src/main.ts`
- Modify: `src/style.css`

Pas de test unitaire DOM (aucun n'existe dans le repo — l'UI est validée par `tsc` via `npm run build` et un passage manuel `npm run dev`).

- [ ] **Step 1 : les chaînes (`src/ui/strings.ts`)**

Dans l'objet `STR`, après la ligne `modifiersRecapTitle: 'La couleur du soir',` ajouter :

```ts
  // régions (la tournée, chantier 4)
  regionDrawTitle: 'Choisis ta région',
  regionDrawHint:
    'Toute la tournée se jouera sous ces règles. Les régions dures paient plus de ⭐.',
  regionMult: (m: string) => `⭐ ×${m}`,
  regionPick: 'Partir ici',
  spotBanned: 'Introuvable dans cette région',
```

- [ ] **Step 2 : `src/ui/screens.ts` — imports, bandeau, spots, écran de tirage**

1. Remplacer l'import `import { isSpotUnlocked } from '../core/payout';` par :

```ts
import { isSpotAvailable } from '../core/payout';
```

et ajouter :

```ts
import { buildRegionRules, regionTraits, type RegionChoice } from '../core/regions';
```

2. Dans `renderPrepare`, juste après le bloc `if (state.wonTeknival) { … }`, ajouter le bandeau permanent de région :

```ts
  // bandeau région : la tournée entière se joue sous ces traits (chantier 4)
  if (state.region) {
    const banner = el('div', 'region-banner');
    banner.append(el('span', 'region-banner-nom', `🗺 ${state.region.nom}`));
    for (const t of regionTraits(state.region)) {
      const chip = el('span', 'region-trait-chip', `${t.icon} ${t.nom}`);
      chip.title = t.desc;
      banner.append(chip);
    }
    root.append(banner);
  }
```

3. Toujours dans `renderPrepare`, colonne des spots : remplacer

```ts
    const unlocked = isSpotUnlocked(state, spot.id);
```

par

```ts
    const unlocked = isSpotAvailable(state, spot.id);
```

et remplacer la ligne `card.append(el('div', 'card-desc', unlocked ? spot.description : `🔒 ${STR.repNeeded(spot.repReq)}`));` par :

```ts
    const banned = buildRegionRules(state.region).bannedSpotIds.includes(spot.id);
    card.append(
      el(
        'div',
        'card-desc',
        unlocked ? spot.description : banned ? `🚧 ${STR.spotBanned}` : `🔒 ${STR.repNeeded(spot.repReq)}`,
      ),
    );
```

4. En fin de fichier (avant `newlyRecruitable`), ajouter l'écran de tirage :

```ts
// --- region draw (départ en tournée, chantier 4) -------------------------------

export function renderRegionDraw(
  root: HTMLElement,
  choices: RegionChoice[],
  onPick: (choice: RegionChoice) => void,
): void {
  root.innerHTML = '';
  root.className = 'screen screen-region-draw';
  const panel = el('div', 'region-draw-panel');
  panel.append(el('h1', '', `🗺 ${STR.regionDrawTitle}`));
  panel.append(el('p', 'hint', STR.regionDrawHint));
  const cards = el('div', 'region-cards');
  for (const choice of choices) {
    const card = el('button', 'card region-card');
    card.append(el('div', 'card-title', choice.nom));
    for (const t of choice.traits) {
      const row = el('div', 'region-trait-row');
      row.append(el('span', 'region-trait-icon', t.icon));
      const txt = el('div', 'region-trait-txt');
      txt.append(el('div', 'region-trait-nom', t.nom), el('div', 'card-desc', t.desc));
      row.append(txt);
      card.append(row);
    }
    card.append(el('div', 'region-mult', STR.regionMult(choice.mult.toFixed(2))));
    card.append(el('div', 'btn small accent region-go', STR.regionPick));
    card.addEventListener('click', () => onPick(choice));
    cards.append(card);
  }
  panel.append(cards);
  root.append(panel);
}
```

- [ ] **Step 3 : `src/main.ts` — fallback de spot et tirage au départ**

1. Ajouter les imports :

```ts
import { SPOTS } from './core/data'; // étendre la ligne d'import data existante
import { isSpotAvailable } from './core/payout'; // étendre la ligne d'import payout existante
import { drawRegions, toRegionState } from './core/regions';
import { renderRegionDraw } from './ui/screens'; // étendre l'import screens existant
```

2. Dans `showPrepare`, remplacer la ligne :

```ts
  if (state.rep < getSpot(selection.spot).repReq) selection.spot = 'champ';
```

par (Terre de béton peut bannir le champ — on retombe sur le premier spot jouable, la carrière grâce à son override de rep) :

```ts
  if (!isSpotAvailable(state, selection.spot)) {
    selection.spot = SPOTS.find((s) => isSpotAvailable(state, s.id))?.id ?? 'champ';
  }
```

3. **NOTE INTÉGRATION CHANTIER 3 :** le plan prestige ajoute dans `showPrepare` (`main.ts`) un callback `onDepart: (veteranIds) => { state = departOnTour(state, veteranIds); … }`. Remplacer son corps pour insérer le tirage AVANT le reset — le gain de ⭐ est calculé sur la tournée écoulée, la région choisie part sur la nouvelle :

```ts
    onDepart: (veteranIds) => {
      // chantier 4 : 3 cartes-régions, on en choisit une pour toute la tournée
      const choices = drawRegions((Date.now() ^ 0x4e9) >>> 0);
      renderRegionDraw(app, choices, (choice) => {
        state = departOnTour(state, veteranIds, toRegionState(choice));
        saveGame(localStorage, state);
        selection.present.clear();
        for (const d of state.crew) selection.present.add(d.id);
        selection.spot = 'champ'; // showPrepare retombe sur un spot jouable si banni
        showPrepare();
      });
    },
```

(Si le handler mergé porte d'autres noms, substituer les noms réels ; le bloc remplace l'appel direct `state = departOnTour(state, veteranIds)` + retour prépa qui existait dans ce callback.)

- [ ] **Step 4 : `src/style.css` — styles**

Ajouter en fin de fichier :

```css
/* ---------- v4: régions ---------- */
.region-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin: 0.5rem auto 0;
  padding: 0.35rem 0.9rem;
  border: 1px solid var(--accent-3);
  border-radius: 8px;
  width: fit-content;
  font-size: 0.85rem;
}
.region-banner-nom {
  font-weight: 700;
}
.region-trait-chip {
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  white-space: nowrap;
}
.screen-region-draw {
  display: grid;
  place-items: center;
  min-height: 100vh;
}
.region-draw-panel {
  max-width: 900px;
  padding: 1rem;
  text-align: center;
}
.region-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: center;
  margin-top: 1rem;
}
.region-card {
  flex: 1 1 240px;
  max-width: 300px;
  text-align: left;
}
.region-trait-row {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  margin-top: 0.6rem;
}
.region-trait-icon {
  font-size: 1.2rem;
}
.region-trait-nom {
  font-weight: 600;
}
.region-mult {
  margin-top: 0.7rem;
  font-weight: 700;
  color: var(--accent-3);
}
.region-go {
  margin-top: 0.6rem;
}
```

- [ ] **Step 5 : vérifier le vert complet et l'écran**

Run: `npm run test && npm run build`
Expected: PASS (tsc valide les nouveaux usages).
Puis vérification manuelle rapide : `npm run dev`, gagner l'accès au départ (ou poser `state.region` via une save importée) — le bandeau s'affiche à la prépa, les cartes au départ, le champ grisé « 🚧 Introuvable dans cette région » sous Terre de béton.

- [ ] **Step 6 : commit**

```bash
git add src/ui/strings.ts src/ui/screens.ts src/main.ts src/style.css
git commit -m "feat(ui): cartes de région au départ en tournée et bandeau à la prépa

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Harness — une tournée complète sous 2–3 régions types

**Files:**
- Create: `src/core/regions-harness.test.ts`

Le harness vérifie les invariants qualitatifs (jamais de bust, caisse qui monte, no-softlock sous Terre de béton) sur des nuits complètes simulées — même pattern que `src/core/progression.test.ts`, qui lui ne bouge pas (tournée 1 sans région = sim identique).

- [ ] **Step 1 : écrire le harness (échoue tant que les Tasks 3–4 ne sont pas en place ; s'il est exécuté en dernier, il documente et verrouille le comportement)**

Créer `src/core/regions-harness.test.ts` :

```ts
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
```

Notes balance (pourquoi ces briefs) : sous Zone quadrillée + Préfet zélé, la consigne `safe` rend la dérive de chaleur négative au champ (`0.004 × 0.5 × 1.3 × 0.55 < 0.01/s de décrue`) et les events sont clampés à `0.84`. Le seul chemin structurel vers la chaleur est l'event « Le public en redemande » (option 0 = `forceBrief: 'pousser'`, jouée par le harness) : au champ, même un pousser forcé sur tout un set plafonne à `≈ 81 s × 0.004 × 1.8 × 1.3 × 0.55 ≈ 0.42` — toujours sous 0.85. À la carrière (seuil 1.0 — Terre de béton ne touche pas `bustThreshold`), `safe` donne `0.011 × 0.5 × 0.55 ≈ 0.003/s` contre `0.01/s` de décrue, mais un pousser forcé couvrant presque tout un set (~90 s × 0.011 × 1.8 × 0.55, ×1.15 si « Des touristes » est tiré) peut frôler 1.0 : si une graine pinnée bust par ce chemin précis, décaler la graine (`310 + n`, etc.) — l'invariant verrouillé est « une région se joue prudemment sans bust », pas « toute graine passe ». C'est aussi la leçon de gameplay voulue : une région à flics se joue discret.

- [ ] **Step 2 : vérifier le vert complet**

Run: `npm run test && npm run build`
Expected: PASS — les 3 archétypes bouclent, `src/core/progression.test.ts` et tout le reste inchangés.

- [ ] **Step 3 : commit**

```bash
git add src/core/regions-harness.test.ts
git commit -m "test(core): harness de tournée sous trois régions types

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Couverture du spec (auto-revue)

- **§1 Le tirage** : Task 2 (3 cartes, 2 traits, mult, déterminisme, noms), Task 8 (UI cartes), Task 7 (s'applique à toute la tournée via `state.region`).
- **§2 Pool de 12 traits** : Task 1 (defs + difficultés), Tasks 3–5 (chaque effet branché sur son point de lecture réel — voir tableau de cartographie).
- **§3 Interactions** : multiplicateur sur le gain chantier 3 + perk Tournée infernale (Tasks 1, 7) ; composition par produit (Task 1) ; garantie Terre de béton (Tasks 1, 4, 9) ; bandeau prépa (Task 8).
- **Décision 4 (tournée 1 sans région)** : `newGame` intact, `region` optionnel, défauts identité (Tasks 1, 6) ; le tirage n'apparaît qu'au départ (Tasks 7, 8).
- **Architecture** : `regions.ts` (Tasks 1–2), `types.ts` (Tasks 1, 3), lecture dans `night.ts`/`payout.ts`/`idle.ts` (Tasks 3–4), UI départ + bandeau (Task 8).
- **Tests du spec** : tirage déterministe ✓ (Task 2), jamais deux conforts ✓ (Task 2), multiplicateur conforme ✓ (Tasks 1–2), chaque trait mute la bonne règle + preuve par tick/settle ✓ (Tasks 1, 3, 4, 5), Terre de béton laisse un spot jouable ✓ (Tasks 4, 9), harness tournée complète sous 2–3 régions types ✓ (Task 9).
- **Hors-scope respecté** : pas de carte du monde, pas de traits saisonniers, pas de défis hebdomadaires.

**Fallbacks chantier 1 (à recâbler quand le chantier 1 atterrit)** : seuil de descente (`bustThreshold` 0.85 → 0.70 sur une base 0.85), casier (`casierGele` dormant), tolérance d'attente (`setQualityMult` 0.95), nuits spéciales (`specialNightWeightMult` dormant, fallback `maxEventsBonus`). Tous marqués `RÉVISION CHANTIER 1` dans le code et dans ce plan.
