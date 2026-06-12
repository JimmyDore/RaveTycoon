# Refonte de la boucle de nuit — Partie 1 : énergie, phases, descente

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Spec**: `docs/superpowers/specs/2026-06-12-night-loop-overhaul-design.md` — stories **A** (énergie du set), **B** (phases de nuit), **C** (descente jouable), dans cet ordre. Les stories D et E sont la Partie 2 ; le **registre de symboles** en fin de plan liste tout ce que la Partie 2 viendra brancher.

## Goal

Remplacer le brief (`safe/normal/pousser`, figé par set) par **4 crans d'intensité tappables à tout moment** (`chill/groove/peak/rinse`) joués contre une **attente de foule** visible (tolérance pilotée par la technique, attraction par le charisme, burnout qui interdit le spam, waveScore qui paie les drops sculptés) ; donner à chaque nuit un **arc dramatique en 4 phases** scriptées (ouverture/rush/creux/aube, rep ×2 à l'aube) ; et rendre la **descente jouable** (compte à rebours à heat 0.85, évacuer/négocier/tenir le mur) avec des **conséquences persistantes** (garde à vue, casier, murs tenus).

## Architecture

Inchangée dans l'esprit du repo : logique pure et testée dans `src/core/` (harnais déterministes `progression.test.ts` et `regions-harness.test.ts` — ils restent verts, ou la tâche dit exactement quels chiffres bougent et pourquoi), UI fine dans `src/ui/screens.ts` + boucle dans `src/main.ts`, decks data-driven (`events.ts`, `prompts.ts`, `goals.ts`), strings dans `src/ui/strings.ts`, audio param-driven (`src/audio/engine.ts` ne lit que `EngineParams`).

Nouveaux modules :

- `src/core/intensity.ts` — le type `Intensity` + les constantes normatives de la spec + helpers (`nearestIntensity`, `isHighIntensity`, `ATTENTE_GENRE`). Module feuille (n'importe que des types) : importable par `events.ts`/`goals.ts`/`economy.ts`/`night.ts`/UI **sans cycle**.
- `src/core/phases.ts` — les 4 `NightPhaseDef` + interpolation. Module feuille.
- `src/core/raid.ts` — la descente (déclenchement, compte à rebours, 3 issues, siège). **Cycle d'import assumé** `night.ts ↔ raid.ts` (night appelle `startDescente`/`tickRaid` dans `tickNight`, raid appelle `closeCurrentSet` de night) : tous les appels croisés sont à l'exécution, jamais à l'init de module — pattern sûr en ESM/vite/vitest.

Décisions tranchées (mandatées par le prompt, justifiées ici) :

1. **`RegionRules.bustThreshold` devient `descenteThreshold`** (défaut **0.85**, Zone quadrillée **0.70**). La heat ≥ seuil ne bust plus : elle déclenche la **descente** (une fois par nuit). Le clamp historique des events (« jamais franchir le seuil ») redevient un simple **clamp à 0.99** : la descente est jouable, pas une mort instantanée — un event ou un drop qui pousse la heat au seuil ouvre une séquence à 3 choix, ce qui est exactement la tension voulue. Seuls les chemins de bust restent : timer expiré, négo ratée, mur cassé.
2. **L'intensité persiste entre les sets** ; le modal de transition ne choisit plus que le DJ. Le genre de nuit vient du DJ courant (mécanique « le son c'est le DJ » inchangée).
3. **`logTier` plafonné à 3** dans les formules de descente (`15 + 5×logTier` → 15–30 s comme la spec ; la proba de négo garde son cap à 0.9). Les tiers 4–6 de logistique gardent leur `value` (heat plus basse).
4. **Drops et rep** : les drops ne donnent de la rep que pendant **l'aube** (barème `round(6 × m × waveMult)`, le ×2 d'aube intégré), et le **dernier drop de l'aube compte double encore** (re-crédité au règlement). Hors aube un drop ne donne pas de rep — choix assumé pour ne pas gonfler l'économie de rep de toute la nuit, fidèle à « le final est le moment le plus précieux ».

## Tech Stack

TypeScript strict + Vite, vanilla DOM (zéro framework), vitest. UI **tap-only** (PRD : pas de hover requis, pas de clavier requis — les boutons sont l'input primaire). `npm run test && npm run build` vert après **chaque** tâche.

**Procédure de re-pin des harnais (sanctionnée)** : quand une tâche fait bouger un nombre épinglé (`donationMult`, `gross`, bornes de nuits, etc.), on ne devine jamais la nouvelle valeur : on lance le test, on lit la valeur **réelle** dans le diff d'échec de vitest, et on épingle cette valeur mesurée avec un commentaire `// mesuré après <tâche>`. Les bornes de design (`>= 30` nuits vers le Teknival) s'ajustent à la valeur mesurée − marge, avec commentaire.

---

### Task 1: L'intensité remplace le brief — la migration totale

Le brief disparaît **entièrement** : type `Brief`, `NightState.brief`, `briefLockT`, `BRIEF_QUALITY/HEAT/POWER` (night.ts), `BRIEF_INTENSITY` (economy.ts), `EventEffects.forceBrief`, `EventContext.brief`, `SetRecord.brief`, `changeBrief`/`BRIEF_LOCK`, le picker du modal de transition, les poids de decks qui lisent le brief, la fatigue forfaitaire `pousser`. Tout est remplacé par les 4 crans. Le cran par défaut `groove` est calibré ≈ l'ancien `normal` (qualité 1.0, heat 1.0) : les harnais bougent peu sur cette tâche.

**Files:**
- `src/core/intensity.ts` (nouveau)
- `src/core/types.ts`
- `src/core/night.ts`
- `src/core/crew.ts`
- `src/core/economy.ts`
- `src/core/events.ts`
- `src/core/goals.ts`
- `src/core/energy.test.ts` (nouveau, remplace `src/core/live.test.ts`)
- `src/core/live.test.ts` (supprimé)
- `src/core/goals.test.ts`, `src/core/progression.test.ts`, `src/core/regions-harness.test.ts`, `src/core/regions.test.ts`, `src/core/journal.test.ts`
- `test/night.test.ts`, `test/economy.test.ts`, `test/payout.test.ts`, `test/tour.test.ts`, `test/crew.test.ts`
- `src/ui/screens.ts`, `src/ui/strings.ts`, `src/main.ts`
- `src/audio/engine.ts` (commentaire de param)

**Steps:**

- [ ] Écrire le test qui pilote l'API, `src/core/energy.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
// NB : tsconfig a noUnusedLocals — n'importer ici que ce que ce fichier utilise
import { INTENSITY_HEAT } from './intensity';
import {
  MONTEE_MIN_DROP,
  createNight,
  dropMontee,
  resolveEvent,
  setIntensity,
  startSet,
  tickNight,
} from './night';
import { newGame } from './save';

/** Tick la sim n secondes, en résolvant tout event modal pour que l'horloge avance. */
function tickFor(
  state: ReturnType<typeof newGame>,
  night: ReturnType<typeof createNight>,
  seconds: number,
) {
  for (let t = 0; t < seconds; t += 0.1) {
    if (night.phase === 'event') resolveEvent(state, night, 0);
    tickNight(state, night, 0.1);
  }
}

function playingNight(seed = 7) {
  const state = newGame(42);
  const night = createNight(state, 'champ', ['tonton'], seed);
  startSet(state, night, 'tonton');
  return { state, night };
}

describe("l'énergie du set : les 4 crans", () => {
  it('démarre à groove et change à tout moment, sans cooldown', () => {
    const { night } = playingNight();
    expect(night.intensity).toBe('groove');
    expect(setIntensity(night, 'rinse')).toBe(true);
    expect(setIntensity(night, 'chill')).toBe(true); // pas de verrou de 18 s
    expect(setIntensity(night, 'chill')).toBe(false); // même cran = refus
  });

  it('refuse hors phase playing', () => {
    const state = newGame(42);
    const night = createNight(state, 'champ', ['tonton'], 7);
    expect(night.phase).toBe('transition');
    expect(setIntensity(night, 'peak')).toBe(false);
  });

  it("persiste d'un set à l'autre — la transition ne choisit que le DJ", () => {
    const { state, night } = playingNight();
    setIntensity(night, 'rinse');
    night.setElapsed = night.setLen; // force la fin du set
    tickNight(state, night, 0.1);
    expect(night.phase).toBe('transition');
    startSet(state, night, 'tonton');
    expect(night.intensity).toBe('rinse');
  });

  it('RINSE chauffe ~4.8× plus vite que CHILL (INTENSITY_HEAT)', () => {
    expect(INTENSITY_HEAT.rinse / INTENSITY_HEAT.chill).toBeCloseTo(4.8, 5);
    const a = playingNight(9);
    setIntensity(a.night, 'chill');
    tickFor(a.state, a.night, 8); // < 1er event (≥ 20 s) et < 1er prompt (≥ 12 s)
    const b = playingNight(9);
    setIntensity(b.night, 'rinse');
    tickFor(b.state, b.night, 8);
    expect(b.night.heat).toBeGreaterThan(a.night.heat);
  });

  it('la fatigue suit fracPeakRinse : 0.18 plancher à chill, 0.34 à plein rinse', () => {
    const a = playingNight(11);
    setIntensity(a.night, 'chill');
    a.night.setElapsed = a.night.setLen - 0.05;
    tickNight(a.state, a.night, 0.1); // clôt le set → applySetToll
    expect(a.state.crew[0].fatigue).toBeCloseTo(0.18, 2);
    const b = playingNight(11);
    setIntensity(b.night, 'rinse');
    // 100 % du temps de set à rinse — on re-tape le cran à CHAQUE itération :
    // un event résolu (patrouille option 0…) peut forcer l'intensité (forceIntensity)
    for (let t = 0; t < b.night.setLen - 0.2; t += 0.1) {
      if (b.night.phase === 'event') resolveEvent(b.state, b.night, 0);
      setIntensity(b.night, 'rinse');
      b.night.floorPrompt = null;
      tickNight(b.state, b.night, 0.1);
    }
    b.night.setElapsed = b.night.setLen;
    tickNight(b.state, b.night, 0.1);
    expect(b.state.crew[0].fatigue).toBeCloseTo(0.18 + 0.16, 1);
  });
});

describe('la montée (migrée du brief)', () => {
  it('se charge dans le temps en jouant', () => {
    const { state, night } = playingNight();
    expect(night.montee).toBe(0);
    tickFor(state, night, 20);
    expect(night.montee).toBeGreaterThan(0);
  });

  it('dropMontee boost la vibe et la foule, augmente la heat, remet montee à 0', () => {
    const { state, night } = playingNight();
    tickFor(state, night, 20);
    night.crowd = night.cap * 0.5;
    const vibe = night.vibe;
    const heat = night.heat;
    const crowd = night.crowd;
    expect(dropMontee(state, night)).toBe(true);
    expect(night.vibe).toBeGreaterThan(vibe);
    expect(night.crowd).toBeGreaterThan(crowd);
    expect(night.heat).toBeGreaterThan(heat);
    expect(night.montee).toBe(0);
  });

  it('refuse sous MONTEE_MIN_DROP', () => {
    const { state, night } = playingNight();
    night.montee = MONTEE_MIN_DROP - 0.01;
    expect(dropMontee(state, night)).toBe(false);
  });

  it('un brownout draine la jauge', () => {
    const { state, night } = playingNight();
    night.montee = 1;
    night.crowd = night.cap; // surcharge la demande
    setIntensity(night, 'rinse');
    const before = night.montee;
    tickFor(state, night, 1);
    expect(night.montee).toBeLessThan(before);
  });
});
```

- [ ] Lancer `npx vitest run src/core/energy.test.ts` — échec attendu : `Cannot find module './intensity'` / `setIntensity` n'existe pas.

- [ ] Créer `src/core/intensity.ts` (module feuille, **les constantes de la spec sont normatives**) :

```ts
import type { GenreId } from './types';

/**
 * Les 4 crans d'intensité — remplacent le brief (spec story A, verrouillé).
 * Tappables à tout moment pendant la phase `playing`, aucun cooldown : le coût
 * est DANS la sim (burnout, heat, fatigue).
 */
export type Intensity = 'chill' | 'groove' | 'peak' | 'rinse';

export const INTENSITIES: Intensity[] = ['chill', 'groove', 'peak', 'rinse'];

/** Niveau joué [0,1] — comparé à l'attente de la foule. */
export const INTENSITY_LEVEL: Record<Intensity, number> = { chill: 0.25, groove: 0.5, peak: 0.75, rinse: 1.0 };
/** Facteur de qualité LIVE — la qualité de set n'est plus figée au départ. */
export const INTENSITY_QUALITY: Record<Intensity, number> = { chill: 0.92, groove: 1.0, peak: 1.08, rinse: 1.15 };
/** Facteur de montée de chaleur. */
export const INTENSITY_HEAT: Record<Intensity, number> = { chill: 0.5, groove: 1.0, peak: 1.6, rinse: 2.4 };
/** Demande électrique additionnelle (remplace BRIEF_POWER). */
export const INTENSITY_POWER: Record<Intensity, number> = { chill: 0, groove: 0.06, peak: 0.16, rinse: 0.3 };

export function isHighIntensity(i: Intensity): boolean {
  return i === 'peak' || i === 'rinse';
}

/** Le cran dont le niveau colle le mieux à une attente — politique d'autoplay des harnais. */
export function nearestIntensity(attente: number): Intensity {
  return INTENSITIES.reduce((a, b) =>
    Math.abs(INTENSITY_LEVEL[b] - attente) < Math.abs(INTENSITY_LEVEL[a] - attente) ? b : a,
  );
}

/**
 * Profil d'attente par genre : un public de dub n'attend pas le même niveau
 * qu'un public de hardcore. Multiplie la baseline (provisoire story A, phasée
 * story B). Lu par tickNight dès la task 2.
 */
export const ATTENTE_GENRE: Record<GenreId, number> = {
  hardtek: 1.0,
  acid: 1.0,
  dub: 0.8,
  frenchcore: 1.1,
  mentale: 1.0,
  techno: 0.95,
  raggatek: 1.0,
  darkpsy: 0.95,
  tribe: 1.0,
  hardcore: 1.15,
  downtempo: 0.75,
  electro: 0.95,
};
```

- [ ] `src/core/types.ts` — la purge du brief :
  - Supprimer `export type Brief = 'safe' | 'normal' | 'pousser';`
  - Ajouter en tête : `import type { Intensity } from './intensity';`
  - `GearEffects.pousserPowerFree` → renommer **`rinsePowerFree`**, doc : `/** groupe B — RINSE ne surcharge plus le groupe (révision chantier 1 faite). */`
  - `EventEffects` : remplacer `forceBrief?: Brief;` par `/** force le cran d'intensité courant */ forceIntensity?: Intensity;`
  - `EventContext` : remplacer `brief: Brief;` par `intensity: Intensity;`
  - `SetRecord` : devient `export interface SetRecord { djId: string; }` (le recap/leaderboard n'affiche que le DJ et son genre — vérifié dans `renderRecap`).
  - `NightState` : supprimer `brief: Brief;` et `briefLockT: number;` ; ajouter :

```ts
  /** cran d'intensité courant — persiste d'un set à l'autre */
  intensity: Intensity;
  /** secondes du set courant passées à PEAK/RINSE (fatigue ∝ fracPeakRinse) */
  setPeakRinseT: number;
  /** ∑ INTENSITY_LEVEL × dt sur la nuit — essence pondérée temps (economy.ts) */
  intensitySum: number;
```

- [ ] `src/core/night.ts` — le cœur :
  - Imports : retirer `Brief` ; ajouter `import { INTENSITY_HEAT, INTENSITY_LEVEL, INTENSITY_POWER, INTENSITY_QUALITY, isHighIntensity, type Intensity } from './intensity';`
  - Supprimer `BRIEF_QUALITY`, `BRIEF_HEAT`, `BRIEF_POWER`, `BRIEF_LOCK`, `changeBrief`.
  - `createNight` : remplacer `brief: 'normal',` par `intensity: 'groove',` ; remplacer `briefLockT: 0,` par `setPeakRinseT: 0,` et `intensitySum: 0,`.
  - `computeSetQuality(state, night, djId)` — plus de paramètre `brief`, plus de facteur `BRIEF_QUALITY` (le facteur d'intensité devient live dans le tick) :

```ts
export function computeSetQuality(state: GameState, night: NightState, djId: string): number {
  const def = getDj(djId);
  const member = getCrewMember(state, djId);
  const platines = ownedGear(state, 'platines').value * (state.damaged.platines ? 0.7 : 1);
  const murQuality = ownedGear(state, 'mur').effects?.qualityMult ?? 1;
  const spotQ = getSpot(night.spotId).qualityMult;
  const tech = effectiveTechnique(def, member);
  const base = 0.18 + 0.16 * tech;
  return clamp(
    base * platines * murQuality * spotQ * fatigueQualityMult(member) * night.rules.setQualityMult,
    0.05,
    1.5,
  );
}
```

  - `startSet(state, night, djId)` — plus de `brief` : retirer `night.brief = brief;` et `night.briefLockT = 0;`, ajouter `night.setPeakRinseT = 0;`, appel `computeSetQuality(state, night, djId)`, et `night.playedSets.push({ djId });`. **Ne pas toucher `night.intensity`** (persistance).
  - `eventContext` : `brief: night.brief` → `intensity: night.intensity`.
  - Dans `tickNight` :
    - retirer `night.briefLockT = Math.max(0, night.briefLockT - dt);`
    - qualité live : `const quality = night.setQuality * INTENSITY_QUALITY[night.intensity] * night.qualityMultRestOfSet * (night.murBlown ? 0.6 : 1);`
    - power : 

```ts
  // groupe voie Monstre : RINSE ne surcharge plus le groupe (révision chantier 1 faite)
  const intensityPower =
    night.intensity === 'rinse' && groupeItem.effects?.rinsePowerFree ? 0 : INTENSITY_POWER[night.intensity];
  const demand = 0.35 + 0.5 * (night.cap > 0 ? night.crowd / night.cap : 0) + intensityPower;
```

    - mur : `if (night.intensity === 'rinse' && !night.murBlown) {` (la task 2 ajoutera « PEAK si gap > tol »)
    - montée : `const monteeGain = dt * MONTEE_RATE * night.vibe * MONTEE_GENRE[night.genreId];` (le ×1.4 « pousser » disparaît — la task 2 le remplace par le ×1.5 « dans la vague »)
    - heat : `night.heat += spot.heatBuild * genre.heatMult * INTENSITY_HEAT[night.intensity] * riskMult * logistique * heatMod * branchHeatMult(state) * night.rules.heatMult * HEAT_BASE * dt;` puis `if (night.intensity === 'chill') night.heat -= 0.01 * dt;`
    - accumulateurs, juste après les accumulateurs de vibe :

```ts
  // accumulateurs d'intensité : fatigue (set) et essence (nuit)
  if (isHighIntensity(night.intensity)) night.setPeakRinseT += dt;
  night.intensitySum += INTENSITY_LEVEL[night.intensity] * dt;
```

  - `endCurrentSet` : 

```ts
  const fracPeakRinse = night.setElapsed > 0 ? Math.min(1, night.setPeakRinseT / night.setElapsed) : 0;
  applySetToll(member, fracPeakRinse, night.setElapsed);
```

  - `applyEffects` : remplacer le bloc `forceBrief` par :

```ts
  if (fx.forceIntensity) night.intensity = fx.forceIntensity;
```

  (plus de recalcul de `setQuality` — le facteur d'intensité est live)
  - Nouvelle API, à la place de `changeBrief` :

```ts
/**
 * Change le cran d'intensité. Tappable à tout moment en phase `playing`,
 * AUCUN cooldown : le coût est dans la sim (burnout, heat, fatigue).
 */
export function setIntensity(night: NightState, i: Intensity): boolean {
  if (night.phase !== 'playing' || night.intensity === i) return false;
  night.intensity = i;
  return true;
}
```

- [ ] `src/core/crew.ts` — la fatigue suit `fracPeakRinse` :

```ts
/** Fatigue de base par set joué + bonus ∝ fraction du set passée à PEAK/RINSE. */
export const FATIGUE_BASE_PER_SET = 0.18;
export const FATIGUE_PEAKRINSE_BONUS = 0.16;
```

  (supprimer `FATIGUE_PER_SET` et `FATIGUE_PUSH_BONUS`)

```ts
/** Apply the toll of a played set. L'increvable ne prend jamais de fatigue. */
export function applySetToll(dj: DjState, fracPeakRinse: number, setSeconds: number): void {
  if (getDj(dj.id).gimmick !== 'increvable') {
    dj.fatigue = Math.min(1, dj.fatigue + FATIGUE_BASE_PER_SET + FATIGUE_PEAKRINSE_BONUS * fracPeakRinse);
  }
  dj.xp += setSeconds * XP_RATE * (1 + 0.3 * fracPeakRinse);
  dj.setsPlayed += 1;
}
```

- [ ] `src/core/economy.ts` — l'essence pondérée par l'intensité **moyenne pondérée temps** (révision chantier 1 faite) : supprimer `BRIEF_INTENSITY` et l'import `Brief`, et :

```ts
/** Fuel for the night — free on the tier-0 « groupe poussif » (no-softlock). */
export function essenceCost(state: GameState, night: NightState): number {
  if (state.gear.groupe === 0) return 0;
  if (night.t <= 0) return 0;
  // intensité moyenne pondérée temps, accumulée par tickNight (chill 0.25 … rinse 1)
  const avg = night.intensitySum / night.t;
  return Math.round(ESSENCE_RATE * (night.t / 60) * (0.5 + avg));
}
```

- [ ] `src/core/events.ts` — migration du deck (chaque référence au brief, une par une) :
  - import : `import { isHighIntensity } from './intensity';`
  - `patrouille`, option « Baisser le son un moment » : `effects: { heat: -0.12, vibe: -0.08, forceIntensity: 'chill' },`
  - `enceinte-chauffe`, weight : `(ctx) => (isHighIntensity(ctx.intensity) ? 1.5 : 0.5) + (ctx.gear.mur === 0 ? 0.5 : 0),`
  - `public-en-redemande` — **la spec le dit** : « le public en redemande » donne de la montée au lieu d'un pousser gratuit :

```ts
      {
        label: 'Lâcher les watts',
        outcome: 'Le DJ charge la tension. Le champ entier retient son souffle.',
        effects: { montee: 0.3, vibe: 0.08 },
      },
```

  et weight : `(ctx) => (!isHighIntensity(ctx.intensity) && ctx.crowdRatio > 0.3 ? 1.4 : 0),`
  - `dj-en-vrille`, option « Un mot à l'oreille » : `effects: { vibe: -0.04, forceIntensity: 'groove' },` et weight : `(ctx) => (ctx.djRisk === 'chaud' && isHighIntensity(ctx.intensity) ? 1.6 : 0),`
- [ ] `src/core/goals.ts` — `gros-drop` weight : `(ctx) => (isHighIntensity(ctx.intensity) ? 1.3 : 0.8),` (import `isHighIntensity` depuis `./intensity`). Le « tenir la heat sous la barre » est inchangé (spec).
- [ ] Supprimer `src/core/live.test.ts` (remplacé par `energy.test.ts` — les tests de montée y sont migrés ci-dessus).
- [ ] `src/ui/strings.ts` — remplacer le bloc brief :
  - `import type { Intensity } from '../core/intensity';` (remplace l'import `Brief`)
  - Supprimer `briefLabel`, `briefs`, `briefHints`, `briefShort`, `briefToast`.
  - Ajouter :

```ts
  intensites: { chill: 'Chill', groove: 'Groove', peak: 'Peak', rinse: 'Rinse' } as Record<Intensity, string>,
  intensiteHints: {
    chill: 'On souffle — la chaleur retombe, la foule se repose',
    groove: 'Le groove qui tient le floor',
    peak: 'Ça tape — la vibe monte, les bleus écoutent',
    rinse: 'Tout dans le rouge — burnout et chaleur garantis',
  } as Record<Intensity, string>,
  intensiteToast: (i: Intensity) => `🎚 ${STR.intensites[i]}`,
```

- [ ] `src/ui/screens.ts` — migration mécanique (la jauge de vague arrive en task 3) :
  - Imports : remplacer `Brief` par `type Intensity` + `INTENSITIES` depuis `../core/intensity`.
  - `NightLiveCallbacks` : `onBrief(brief: Brief): void;` → `onIntensity(i: Intensity): void;`
  - `NightScreen.showTransition` : `onStart: (djId: string, brief: Brief) => void` → `onStart: (djId: string) => void`.
  - Boutons live (remplace la boucle `briefBtns`) :

```ts
  const cranBtns = new Map<Intensity, HTMLButtonElement>();
  for (const cran of INTENSITIES) {
    const b = el('button', 'live-cran', STR.intensites[cran]) as HTMLButtonElement;
    b.title = STR.intensiteHints[cran];
    b.addEventListener('click', () => live.onIntensity(cran));
    cranBtns.set(cran, b);
    liveWrap.append(b);
  }
```

  - `update()` : remplacer la boucle `briefBtns` par :

```ts
      for (const [cran, btn] of cranBtns) {
        btn.classList.toggle('selected', night.intensity === cran);
        btn.disabled = !playing || night.intensity === cran;
      }
```

  et `nowPlaying.textContent = `🎧 ${STR.nowPlaying(getDj(night.currentDj).nom)} · ${STR.intensites[night.intensity]}`;`
  - `showTransition` : supprimer `chosenBrief`, `briefRow`, le `<h3>` « La consigne », la boucle des `brief-pick` et leur refresh ; `computeSetQuality(state, night, djId)` ; `go` appelle `onStart(chosenDj)`.
- [ ] `src/main.ts` :
  - Imports : `setIntensity` (remplace `changeBrief`), `type Intensity` depuis `./core/intensity` (retirer `Brief`).
  - Callback : 

```ts
    onIntensity: (i) => {
      if (active && setIntensity(active.night, i)) {
        active.screen.toast(STR.intensiteToast(i));
      }
    },
```

  - `onStartSet(djId: string)` (plus de brief dans la signature ni dans `startSet`).
  - L'arc d'énergie audio devient le cran (le « on entend ses décisions » — task 3 affine) :

```ts
const INTENSITY_ENERGY: Record<Intensity, number> = { chill: 0.35, groove: 0.6, peak: 0.85, rinse: 1 };

/** Ce que joue le moteur audio : le cran EST l'énergie. */
function setEnergy(night: NightState): number {
  if (night.phase !== 'playing' && night.phase !== 'event') return 0.25;
  return INTENSITY_ENERGY[night.intensity];
}
```

  - `audio.update({ ... pushed: playing && night.intensity === 'rinse', ... })`.
- [ ] `src/audio/engine.ts` — commentaire de `EngineParams.pushed` : `/** cran RINSE — clippe et distord audiblement */`. Aucun changement de code (param-driven, vérifié).
- [ ] `src/style.css` — renommer les sélecteurs `.live-brief` en `.live-cran` (3 occurrences : la règle partagée avec `.live-drop`, `.selected`, `:disabled`) et supprimer les blocs `.brief-row` / `.brief-pick` (les boutons du modal n'existent plus).
- [ ] `src/core/data.ts` — mettre à jour les deux commentaires résolus : ligne « voie B — Monstre » → `// voie B — Monstre : power ++, RINSE sans surcharge (révision chantier 1 faite)` et le champ `pousserPowerFree: true` → `rinsePowerFree: true` (2 items groupe). Le commentaire de `GEAR` (« demand from crowd+brief ») → « crowd+intensité ».
- [ ] Balayer **tous** les sites d'appel restants (la vérité est dans le grep, pas dans cette liste) : `grep -rn "brief\|Brief\|changeBrief\|pousser" src/ test/ server/ tools/` doit ne plus retourner que des occurrences légitimes (textes d'ambiance « pousser le son » dans les descriptions/strings sont OK s'ils ne réfèrent plus à une mécanique). ⚠ Ce grep ne voit PAS les appels à 4 arguments du genre `startSet(state, night, 'tonton', 'normal')` ou `computeSetQuality(state, night, djId, 'normal')` (nombreux dans `test/night.test.ts` hors `autoPlay`) : c'est `npm run build` (tsc, « Expected 3 arguments, but got 4 ») qui les attrape — vitest seul ne typecheck pas et resterait faussement vert. Sites connus à migrer :
  - `src/core/progression.test.ts` : `startSet(state, night, 'tonton')` (2 sites) et `startSet(state, night, freshest)` ; le commentaire `// a normal-brief champ night must never bust` → `// une nuit groove au champ ne doit jamais bust`.
  - `src/core/regions-harness.test.ts` : la signature de `playNight` prend une `Intensity` à la place du `Brief` ; après chaque `startSet(state, night, 'tonton')`, appeler `setIntensity(night, intensity)` ; les appels passent `'chill'` (ex-`safe`) et `'groove'` (ex-`normal`).
  - `src/core/regions.test.ts` : tous les `startSet(..., 'normal')` perdent leur dernier argument ; `playedSets: [{ djId: 'tonton', brief: 'normal' }]` → `[{ djId: 'tonton' }]`.
  - `src/core/goals.test.ts` : `ctx()` → `intensity: 'groove',` à la place de `brief: 'normal',` ; `startSet` sans brief.
  - `src/core/journal.test.ts` et `src/core/prompts.test.ts` : `startSet` sans brief si présent.
  - `test/night.test.ts` : `autoPlay` prend `opts.intensity?: Intensity` ; après `startSet(state, night, opts.dj ?? night.presentDjs[0])`, faire `if (opts.intensity) setIntensity(night, opts.intensity);` à chaque itération en phase playing. Les nuits poussées (`hangar` bust, brownout carrière, mur-blown forêt) passent `intensity: 'rinse'` ; la nuit prudente notaire passe `intensity: 'chill'` ; le test « applies option effects » attend `expect(night.intensity).toBe('chill');` (patrouille option 0).
  - `test/payout.test.ts` & `test/economy.test.ts` & `test/tour.test.ts` (~l.130) : `playedSets: [{ djId: 'tonton' }]` etc. Dans `test/economy.test.ts`, le helper `finishedNight` ajoute `intensitySum: 90,` dans le `Object.assign` (groove toute la nuit : 0.5 × 180 s) — l'essence reste à 6 € et **les pins 214/159/151 ne bougent pas** (nuits gelées, `donationMult` inchangé). Le test « coûte 2 €/min pondérés » se réécrit :

```ts
  it("coûte 2 €/min pondérés par l'intensité moyenne (temps) — gratuite au groupe poussif", () => {
    const state = newGame();
    const night = finishedNight(state, {}, { intensitySum: 0.75 * 180 });
    state.gear.groupe = 0;
    expect(essenceCost(state, night)).toBe(0); // no-softlock
    state.gear.groupe = 1;
    // 2 € × 3 min × (0.5 + 0.75) = 7.5 → 8
    expect(ESSENCE_RATE).toBe(2);
    expect(essenceCost(state, night)).toBe(8);
  });
```

  (retirer l'import et l'assert `BRIEF_INTENSITY`)
  - `test/crew.test.ts` : 

```ts
    applySetToll(dj, 0, 90); // un set tout en chill/groove
    const afterCalm = dj.fatigue;
    expect(afterCalm).toBeCloseTo(0.18, 5);
    applySetToll(dj, 1, 90); // un set 100 % peak/rinse
    expect(dj.fatigue - afterCalm).toBeCloseTo(0.34, 5);
    for (let i = 0; i < 20; i++) applySetToll(dj, 1, 90);
    expect(dj.fatigue).toBe(1);
```

  - `test/tour.test.ts` : `applySetToll(dj, 'pousser', 90)` → `applySetToll(dj, 1, 90)` ; le test insaisissable garde son pin ×0.4 (le gimmick heat ×0.5 ne bouge qu'en task 8) mais `startSet` perd son brief.
  - `test/tour.test.ts` l.324 (centrale mythique) : `0.35 + 0.5 + 0.22` → `0.35 + 0.5 + 0.3` avec commentaire `// demande max (foule pleine + RINSE)` — INTENSITY_POWER.rinse = 0.3 > BRIEF_POWER.pousser 0.22, vérifier que l'assert tient (2.0 × 0.6 + 0.15 = 1.35 > 1.15 ✓).
- [ ] `npm run test` — corriger jusqu'au vert. **Harnais** : `progression.test.ts` et `regions-harness.test.ts` doivent passer tels quels (groove ≈ ancien normal ; seule la demande électrique passe de 0.08 à 0.06 au cran par défaut). Si une borne casse, appliquer la procédure de re-pin (lire la valeur réelle dans le diff, épingler, commenter `// mesuré après task 1 (crans d'intensité)`).
- [ ] `npm run build` — vert (tsc attrape tout site oublié).
- [ ] Commit :

```
feat(core,ui): l'intensité remplace le brief — 4 crans chill/groove/peak/rinse

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

### Task 2: La vague — attente, tolérance, charisme, burnout, waveScore

Le jeu se joue maintenant dans l'écart entre ce qu'on joue et ce que la foule attend. Baseline provisoire 0.35→0.8 (story B la remplacera). Rewire du trait régional « Public exigeant » sur la tolérance (révision chantier 1). Les harnais gagnent la **politique d'intensité** (suivre l'attente) — des pins bougent, on les mesure.

**Files:**
- `src/core/intensity.ts` (déjà prêt : `ATTENTE_GENRE`, `nearestIntensity`)
- `src/core/types.ts`
- `src/core/night.ts`
- `src/core/goals.ts`
- `src/core/regions.ts`
- `src/core/payout.ts`
- `src/ui/screens.ts` (le chip d'objectif évalue les nouveaux SetStats)
- `src/core/energy.test.ts`
- `src/core/regions.test.ts`
- `src/core/progression.test.ts`, `src/core/regions-harness.test.ts`

**Steps:**

- [ ] Étendre `src/core/energy.test.ts` :

```ts
import { ATTENTE_GENRE, nearestIntensity } from './intensity';
import { currentWave, TOL_BASE, TOL_PER_TECH /* + imports existants */ } from './night';
import { settleNight } from './payout';

describe('la vague : attente, tolérance, burnout', () => {
  it("l'attente démarre bas et monte sur la nuit (baseline provisoire 0.35→0.8)", () => {
    // bornes lâches exprès : la task 5 remplace la baseline par celle des phases
    // (0.3 à l'ouverture, 0.9 en fin d'aube) sans casser ce test
    const { state, night } = playingNight();
    tickNight(state, night, 0.1);
    expect(night.attente).toBeLessThan(0.45 * ATTENTE_GENRE.hardtek);
    night.t = night.duration * 0.99;
    tickNight(state, night, 0.1);
    expect(night.attente).toBeGreaterThan(0.7);
  });

  it('la tolérance suit la technique du DJ', () => {
    const { state, night } = playingNight();
    // tonton : technique 1 → tol = 0.10 + 0.03 × 1
    expect(currentWave(state, night).tol).toBeCloseTo(TOL_BASE + TOL_PER_TECH * 1, 5);
  });

  it("le charisme plie l'attente vers le cran joué (gap réduit, même DJ même genre)", () => {
    // platines voie B = charisme effectif +1 pour tout le crew : on isole le levier
    const a = playingNight(9); // tonton, charisme 2
    setIntensity(a.night, 'rinse');
    const b = playingNight(9);
    b.state.gear.platines = 3;
    b.state.gearBranch.platines = 'B'; // charisme effectif 3
    setIntensity(b.night, 'rinse');
    expect(Math.abs(currentWave(b.state, b.night).gap)).toBeLessThan(
      Math.abs(currentWave(a.state, a.night).gap),
    );
  });

  it('trop fort : la heat prend un surcoût proportionnel au-delà de la tolérance', () => {
    // même cran, même heat de départ : seul l'écart à l'attente diffère
    const early = playingNight(9);
    setIntensity(early.night, 'rinse'); // ouverture : attente ~0.35, gap énorme
    early.night.heat = 0.2;
    tickNight(early.state, early.night, 0.1);
    const late = playingNight(9);
    setIntensity(late.night, 'rinse');
    late.night.t = late.night.duration * 0.99; // l'attente (~0.8) a presque rejoint le cran
    late.night.heat = 0.2;
    tickNight(late.state, late.night, 0.1);
    expect(early.night.heat - 0.2).toBeGreaterThan(late.night.heat - 0.2);
  });

  it('trop mou : le churn grimpe', () => {
    const mk = (i: Parameters<typeof setIntensity>[1]) => {
      const { state, night } = playingNight(9);
      night.t = night.duration * 0.9; // attente haute (~0.75)
      night.crowd = 30;
      setIntensity(night, i);
      tickNight(state, night, 1);
      return night.crowd;
    };
    expect(mk('chill')).toBeLessThan(mk('peak')); // chill = trop mou → plus de départs
  });

  it('le burnout charge à PEAK/RINSE, décharge à CHILL, et plafonne le payoff du drop', () => {
    const { state, night } = playingNight();
    setIntensity(night, 'rinse');
    tickFor(state, night, 10);
    expect(night.burnout).toBeGreaterThan(0.2); // ~0.04/s
    const charged = night.burnout;
    setIntensity(night, 'chill');
    tickFor(state, night, 5);
    expect(night.burnout).toBeLessThan(charged);
    // le drop sur foule cramée vaut moins
    const a = playingNight(13);
    a.night.montee = 1; a.night.burnout = 0; a.night.waveScore = 0; a.night.vibe = 0.3;
    dropMontee(a.state, a.night);
    const b = playingNight(13);
    b.night.montee = 1; b.night.burnout = 1; b.night.waveScore = 0; b.night.vibe = 0.3;
    dropMontee(b.state, b.night);
    expect(b.night.vibe).toBeLessThan(a.night.vibe);
    expect(b.night.burnout).toBeCloseTo(0.6, 5); // ×= DROP_BURNOUT_RESET
  });

  it('waveScore lisse « dans la vague » et bestWaveScore remonte au résultat', () => {
    const { state, night } = playingNight();
    // politique « suivre l'attente » : toujours dans la vague → l'EMA monte
    for (let t = 0; t < 40; t += 0.1) {
      if (night.phase === 'event') resolveEvent(state, night, 0);
      setIntensity(night, nearestIntensity(night.attente));
      tickNight(state, night, 0.1);
    }
    expect(night.waveScore).toBeGreaterThan(0.6);
    night.setElapsed = night.setLen;
    tickNight(state, night, 0.1);
    startSet(state, night, 'tonton');
    night.setElapsed = night.setLen;
    tickNight(state, night, 0.1); // sunrise
    const result = settleNight(state, night);
    expect(result.bestWaveScore).toBeGreaterThan(0.6);
  });
});
```

- [ ] `npx vitest run src/core/energy.test.ts` — échec attendu : `currentWave`/`TOL_BASE` n'existent pas, `night.attente` undefined.
- [ ] `src/core/types.ts` — `NightState` gagne :

```ts
  /** attente de la foule [0,1], recalculée chaque tick (baseline × genre − burnout) */
  attente: number;
  /** burnout de foule [0,1] — charge à PEAK/RINSE, décharge à CHILL/GROOVE */
  burnout: number;
  /** moyenne glissante ~20 s de « dans la vague » [0,1] */
  waveScore: number;
  /** meilleur waveScore de la nuit (recap) */
  bestWaveScore: number;
  /** secondes cumulées « trop mou » — réduit le buzz de fin de nuit */
  softT: number;
  /** accumulateurs waveScore du set courant (objectif « surfer la vague ») */
  setWaveSum: number;
  setWaveSamples: number;
```

  `SetStats` gagne `/** waveScore moyen sur le set */ avgWave: number;`. `NightResult` gagne `/** meilleur waveScore de la nuit */ bestWaveScore: number;`.
- [ ] `src/core/regions.ts` — rewire « Public exigeant » (révision chantier 1 faite) :
  - `RegionRules` gagne `/** bonus (négatif = plus étroite) sur la tolérance d'attente (tickNight) */ attenteTolBonus: number;` (défaut `0` dans `defaultRegionRules`).
  - Le commentaire de `setQualityMult` devient `/** × sur la qualité de set (computeSetQuality). Dormant depuis le rewire tolérance. */`
  - Trait `public-exigeant` : `desc: 'Des oreilles difficiles : la tolérance de la foule est plus étroite.'` et `apply: (r) => { r.attenteTolBonus -= 0.05; },`
- [ ] `src/core/night.ts` — les constantes (normatives, spec) et le cœur de la vague :

```ts
// --- la vague (story A) ---------------------------------------------------------
export const TOL_BASE = 0.10;
export const TOL_PER_TECH = 0.03;
export const CHARISME_PULL = 0.06;
const BURNOUT_CHARGE: Partial<Record<Intensity, number>> = { peak: 0.02, rinse: 0.04 };
const BURNOUT_DECAY: Partial<Record<Intensity, number>> = { chill: 0.03, groove: 0.01 };
export const BURNOUT_ATTENTE_MALUS = 0.3;
export const BURNOUT_DROP_MALUS = 0.5;
const DROP_BURNOUT_RESET = 0.6;
const WAVE_WINDOW = 20;
/** bonus/malus de cible de vibe quand on est dans/sous la vague */
const WAVE_VIBE_BONUS = 0.08;
const SOFT_VIBE_MALUS = 0.1;

export interface WaveState {
  attente: number;
  tol: number;
  level: number;
  gap: number;
  inWave: boolean;
}

/**
 * L'état de la vague à cet instant : attente (baseline × genre − burnout),
 * tolérance (technique + région), attraction du charisme, écart. Partagé par
 * tickNight et la jauge de vague de l'UI.
 */
export function currentWave(state: GameState, night: NightState): WaveState {
  const dj = night.currentDj ? getDj(night.currentDj) : null;
  const member = night.currentDj ? getCrewMember(state, night.currentDj) : null;
  const tech = dj && member ? effectiveTechnique(dj, member) : 1;
  // baseline provisoire story A : montée linéaire 0.35 → 0.8 sur la nuit
  const baseline = 0.35 + 0.45 * Math.min(1, night.duration > 0 ? night.t / night.duration : 0);
  const attente = clamp(
    baseline * ATTENTE_GENRE[night.genreId] - BURNOUT_ATTENTE_MALUS * night.burnout,
    0,
    1,
  );
  const level = INTENSITY_LEVEL[night.intensity];
  const tol = Math.max(0.02, TOL_BASE + TOL_PER_TECH * tech + night.rules.attenteTolBonus);
  const attenteEff = attente + (level - attente) * Math.min(1, CHARISME_PULL * effectiveCharisme(state, dj));
  const gap = level - attenteEff;
  return { attente, tol, level, gap, inWave: Math.abs(gap) <= tol };
}
```

  (imports : `ATTENTE_GENRE` depuis `./intensity`, `effectiveTechnique` est déjà importé de `./crew`)
  - `createNight` : initialiser `attente: 0.35, burnout: 0, waveScore: 0, bestWaveScore: 0, softT: 0, setWaveSum: 0, setWaveSamples: 0,`.
  - `startSet` : reset `night.setWaveSum = 0; night.setWaveSamples = 0;` (le burnout et le waveScore, eux, persistent — la foule n'oublie pas entre deux sets).
  - Dans `tickNight`, juste après le calcul de `quality` (et **avant** le bloc power, car le mur en a besoin) :

```ts
  // --- la vague : l'écart entre ce qu'on joue et ce que la foule attend ----------
  const wave = currentWave(state, night);
  night.attente = wave.attente;
  const { tol, gap, inWave } = wave;
  const tooSoft = gap < -tol;
  const tooHard = gap > tol;
  // burnout : charge à PEAK/RINSE, décharge à CHILL/GROOVE
  const burnoutRate = BURNOUT_CHARGE[night.intensity] ?? -(BURNOUT_DECAY[night.intensity] ?? 0);
  night.burnout = clamp(night.burnout + burnoutRate * dt, 0, 1);
  // waveScore : moyenne glissante ~WAVE_WINDOW s de « dans la vague »
  night.waveScore += ((inWave ? 1 : 0) - night.waveScore) * Math.min(1, dt / WAVE_WINDOW);
  night.bestWaveScore = Math.max(night.bestWaveScore, night.waveScore);
  night.setWaveSum += night.waveScore * dt;
  night.setWaveSamples += dt;
  if (tooSoft) night.softT += dt;
  // trop fort : le DJ s'épuise ×1.5 sur ces secondes (compte dans fracPeakRinse)
  if (tooHard) night.setPeakRinseT += 0.5 * dt;
```

  - Mur : `if ((night.intensity === 'rinse' || (night.intensity === 'peak' && tooHard)) && !night.murBlown) {`
  - Crowd, la ligne `leaving` : multiplier par `(tooSoft ? 1 + 2 * (-gap - tol) : 1)`.
  - Vibe : `let vibeTarget = soundOn ? clamp(0.15 + 0.62 * quality + lumieres + (inWave ? WAVE_VIBE_BONUS : 0) - (tooSoft ? SOFT_VIBE_MALUS : 0), 0, 1) : 0;`
  - Montée : `const monteeGain = dt * MONTEE_RATE * night.vibe * (inWave ? 1.5 : 1) * MONTEE_GENRE[night.genreId];`
  - Heat : multiplier la ligne par `(tooHard ? 1 + 2 * (gap - tol) : 1)`.
  - Note d'ordre : le bloc vague utilise `quality` (non) et `effectiveCharisme` — déplacer la ligne `const charisme = effectiveCharisme(state, dj);` AVANT le bloc vague et la réutiliser dans le bloc crowd (une seule déclaration).
  - `endCurrentSet`, les stats : ajouter `avgWave: night.setWaveSamples > 0 ? night.setWaveSum / night.setWaveSamples : 0,`.
  - `dropMontee` — le payoff dépend de la vague construite (spec) :

```ts
export function dropMontee(state: GameState, night: NightState): boolean {
  if (night.phase !== 'playing' || night.montee < MONTEE_MIN_DROP) return false;
  const m = night.montee;
  // lumières voie Stroboscopique : le payoff du drop est multiplié
  const payoff = ownedGear(state, 'lumieres').effects?.dropMult ?? 1;
  // la vague paie, la foule cramée plafonne : ~1.5× au sommet, ~0.4× spammé
  const waveMult = (0.5 + night.waveScore) * (1 - BURNOUT_DROP_MALUS * night.burnout);
  night.vibe = clamp(night.vibe + (0.1 + 0.25 * m) * payoff * waveMult, 0, 1);
  night.crowd = clamp(night.crowd + night.cap * 0.05 * m * payoff * waveMult, 0, night.cap);
  night.heat = clamp(night.heat + 0.02 + 0.06 * m, 0, night.rules.bustThreshold - 0.01);
  night.burnout *= DROP_BURNOUT_RESET;
  // l'objectif « gros drop » lit le payoff post-multiplicateurs (spec story A)
  night.bestDropThisSet = Math.max(night.bestDropThisSet, m * waveMult);
  night.montee = 0;
  return true;
}
```

- [ ] `src/core/goals.ts` — nouvel objectif (les « nouveaux objectifs story B/C » de la spec — celui-ci lit la vague ; le tag « légende » du mur tenu couvre le volet C) :

```ts
  {
    id: 'vague',
    label: 'Surfer la vague (score moyen ≥ 0,5)',
    reward: { rep: 4 },
    met: (s) => s.avgWave >= 0.5,
    weight: () => 1,
  },
```

- [ ] `src/ui/screens.ts` — le chip d'objectif live évalue les `SetStats` : ajouter `avgWave: night.setWaveSamples > 0 ? night.setWaveSum / night.setWaveSamples : 0,` dans l'objet passé à `goal.met({...})` dans `update()`.
- [ ] `src/core/payout.ts` :
  - `settleNight` et `applyBust` : `bestWaveScore: night.bestWaveScore,` dans les deux `NightResult`.
  - Le buzz de fin de nuit est réduit si on a joué trop mou (spec : « gain de buzz de fin de nuit réduit ») — dans `settleNight` :

```ts
  const softFrac = night.t > 0 ? Math.min(1, night.softT / night.t) : 0;
  const quality = Math.min(1, (0.6 * vibe + 0.5 * (night.peakCrowd / night.cap)) * (1 - 0.3 * softFrac));
```

- [ ] `src/core/regions.test.ts` — le rewire « Public exigeant » :
  - l.51 zone : inchangé pour l'instant (task 7) ; l.59 : `expect(applied('public-exigeant').attenteTolBonus).toBeCloseTo(-0.05, 5);` (et `setQualityMult` reste à 1 : `expect(applied('public-exigeant').setQualityMult).toBe(1);`)
  - Le test comportemental « la qualité de set prend −5 % » devient :

```ts
  it('Public exigeant : la tolérance de la foule est plus étroite (−0.05)', () => {
    const base = playingNight([]);
    const exigeant = playingNight(['public-exigeant']);
    expect(currentWave(exigeant.state, exigeant.night).tol).toBeCloseTo(
      currentWave(base.state, base.night).tol - 0.05,
      5,
    );
  });
```

  (importer `currentWave` depuis `./night`)
- [ ] **Harnais — la politique d'intensité « suivre l'attente »** :
  - `src/core/progression.test.ts` : importer `nearestIntensity` de `./intensity` et `setIntensity` de `./night` ; dans les deux boucles de jeu (`playNight` et `autoCareer`), juste avant `tickNight(...)` :

```ts
      if (night.phase === 'playing') setIntensity(night, nearestIntensity(night.attente));
```

  - `src/core/regions-harness.test.ts` : la politique prudente plafonne à groove **et redescend à chill dès que ça chauffe** — c'est ce que fait un vrai joueur prudent. Indispensable : la carrière monte à ~0.006 heat/s à groove (0.011 × HEAT_BASE 0.55) — camper groove 300 s finirait en bust ; seul chill (build ×0.5 − 0.01/s de décrue) fait redescendre :

```ts
    if (night.phase === 'playing') {
      let target = nearestIntensity(night.attente);
      if (prudent) {
        if (INTENSITY_LEVEL[target] > INTENSITY_LEVEL.groove) target = 'groove';
        if (night.heat > 0.5) target = 'chill'; // on calme le jeu avant les sirènes
      }
      setIntensity(night, target);
    }
```

  (la signature de `playNight` remplace l'intensité fixe de la task 1 par un booléen `prudent` ; les nuits ex-`safe` passent `prudent = true` ; importer `INTENSITY_LEVEL` et `nearestIntensity` depuis `./intensity`)
- [ ] `npm run test`. **Pins attendus en mouvement** (procédure de re-pin, valeurs mesurées uniquement) :
  - `progression.test.ts` : le commentaire « mesuré ≈ 492 € après 2 nuits » (re-mesurer, mettre à jour le commentaire) ; la borne `expect(state.rep).toBeGreaterThanOrEqual(16)` après 4 nuits (la vague booste les nuits bien jouées — si ça casse, lire l'actuel et re-pin) ; la borne `nights >= 30` du temps-vers-Teknival : lancer, lire la valeur réelle, ajuster la borne à `mesuré − 2` avec commentaire `// mesuré X nuits après la vague (story A) — la borne ≥ 3× baseline reste tenue` (et garder `< 200`).
  - `regions-harness.test.ts` : les asserts `cash ≥ before` / `sunrise === true` doivent tenir avec la politique heat-aware ci-dessus (la heat oscille autour de 0.5, loin du bust). Si une graine bust quand même, c'est le seuil de la politique du harnais qu'on resserre (0.5 → 0.45), pas la sim ni un pin.
  - `test/payout.test.ts` / `test/economy.test.ts` : nuits gelées, `donationMult 2.14` et `gross 214` ne bougent **pas** (vérifié : la formule du prix libre est intacte) — confirmer en lançant la suite.
- [ ] `npm run build`.
- [ ] Commit :

```
feat(core): la foule a une attente — vague, tolérance, burnout, waveScore

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

### Task 3: UI & audio de la vague — on voit et on entend son cran

La jauge de vague (bande de tolérance + curseur + liseré de burnout), les 4 boutons-crans stylés, l'audio par cran. Tout est tap, zéro hover (les `title` sont du bonus desktop, jamais porteurs d'info exclusive). Amendement du PRD §4.1 (le brief y est décrit — la spec demande l'amendement une fois la story A shippée).

**Files:**
- `src/ui/screens.ts`
- `src/main.ts`
- `src/style.css`
- `src/ui/strings.ts`
- `PRD.md`

**Steps:**

- [ ] `src/ui/screens.ts` — la jauge de vague. `NightScreen.update` a besoin de l'état (technique/charisme pour la tolérance) : changer la signature en `update(state: GameState, night: NightState): void` (un seul appelant : `main.ts`). Dans `renderNight`, au-dessus des boutons-crans (dans `liveWrap`, avant la boucle des boutons) :

```ts
  // jauge de vague : bande de tolérance (position = attente) + curseur (= cran joué)
  const waveBar = el('div', 'wave-bar');
  const waveBurnout = el('div', 'wave-burnout');
  const waveBand = el('div', 'wave-band');
  const waveCursor = el('div', 'wave-cursor');
  waveBar.append(waveBurnout, waveBand, waveCursor);
  const waveWrap = el('div', 'wave-wrap');
  waveWrap.append(el('div', 'heat-label', `🌊 ${STR.waveLabel}`), waveBar);
  liveWrap.append(waveWrap);
```

  et dans `update(state, night)` :

```ts
      const wave = currentWave(state, night);
      waveBand.style.left = `${Math.max(0, (wave.attente - wave.tol) * 100).toFixed(1)}%`;
      waveBand.style.width = `${(wave.tol * 2 * 100).toFixed(1)}%`;
      waveCursor.style.left = `${(wave.level * 100).toFixed(1)}%`;
      waveBar.classList.toggle('in-wave', playing && wave.inWave);
      // le burnout envahit la jauge par la droite (liseré rouge)
      waveBurnout.style.width = `${(night.burnout * 100).toFixed(1)}%`;
```

  (importer `currentWave` depuis `../core/night` et `GameState` est déjà importé)
- [ ] `src/main.ts` : `screen.update(state, night);` (l'appel dans `frame`).
- [ ] `src/ui/strings.ts` : ajouter `waveLabel: 'la vague',` et `waveBest: 'Meilleure vague',`.
- [ ] `src/ui/screens.ts` — `renderRecap`, le recap gagne `bestWaveScore` (spec story A « Recap/leaderboard : ajout ») : après la ligne `peakCrowd` dans `lines`, ajouter

```ts
  if (result.bestWaveScore > 0) {
    lines.append(recapLine(`🌊 ${STR.waveBest}`, `${Math.round(result.bestWaveScore * 100)} %`));
  }
```
- [ ] `src/style.css` — la jauge et les crans (remplacer le bloc `.live-cran` minimal de la task 1) :

```css
.live-cran {
  flex: 1;
  min-height: 44px;
  border: 1px solid #444;
  border-radius: 8px;
  background: #1c1c24;
  color: #aaa;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
}
.live-cran.selected {
  border-color: #ff4f9a;
  color: #fff;
  box-shadow: 0 0 12px rgba(255, 79, 154, 0.55); /* le cran actif glow */
}
.live-cran:disabled { opacity: 0.45; cursor: default; }

.wave-wrap { display: flex; align-items: center; gap: 6px; width: 100%; }
.wave-bar {
  position: relative;
  flex: 1;
  height: 14px;
  border-radius: 7px;
  background: #15151c;
  border: 1px solid #333;
  overflow: hidden;
}
.wave-band {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(80, 200, 255, 0.25);
  border-left: 1px solid rgba(80, 200, 255, 0.6);
  border-right: 1px solid rgba(80, 200, 255, 0.6);
  transition: left 0.2s linear, width 0.2s linear;
}
.wave-bar.in-wave .wave-band { background: rgba(80, 255, 180, 0.4); }
.wave-cursor {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 3px;
  margin-left: -1.5px;
  background: #fff;
  transition: left 0.15s linear;
}
.wave-burnout {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 60, 60, 0.5));
  pointer-events: none;
}
```

  Ajuster `.live-controls` si besoin pour empiler `wave-wrap` au-dessus de la rangée de boutons (`flex-wrap: wrap;` et `wave-wrap { order: -1; }`).
- [ ] Audio — déjà piloté par le cran depuis la task 1 (`INTENSITY_ENERGY` : chill 0.35 = kick+sub, groove 0.6 = +hats, peak 0.85 = stack complet, rinse 1.0 + `pushed` = drive/distorsion — les seuils de layering de `engine.ts` (`sub 0.1, hats 0.3, lead 0.45` sur `e×q`) réalisent la table de la spec sans toucher au moteur). Vérifier à l'oreille via `npm run dev` : changer de cran s'entend en ~0.12 s (ramp existant).
- [ ] `PRD.md` — amender §4.1 : remplacer les lignes 83–93 (le bloc « At each set transition … brief … Set quality ») par :

```md
- At each **set transition** the player makes one decision: **who plays next** — chosen
  from the crew present that night (fatigue, genre and risk profile make this a real choice).
- During the set the player drives the **intensity dial**: four tappable crans —
  *CHILL · GROOVE · PEAK · RINSE* — changeable at any moment, no cooldown. The crowd has
  a visible **attente** curve; playing inside the tolerance band (DJ technique widens it,
  charisme bends the attente toward what you play) builds the wave; camping PEAK/RINSE
  burns the crowd out. Discrete taps every ~10–20 s — never a fader, never a reflex.

**Set quality** is computed from: DJ stats × platines tier × fatigue, multiplied **live**
by the intensity cran. Quality drives crowd arrival, retention and vibe — the same
crowd/vibe/heat simulation as v1, now fed by decisions instead of fader positions.
```

  et mettre à jour les autres mentions du brief — la vérité est dans `grep -n -i "brief\|pousser" PRD.md` : lignes ~34, ~64, ~66, ~229 (« brief the crew » → « set the intensity », « choose next DJ + brief » → « choose next DJ, ride the intensity », « *pousser le son* audibly clips » → « *RINSE* audibly clips »), ~104–105 (la table d'events : « Le public en redemande » donne de la **montée**, plus de « Brief passe en pousser gratuitement »), ~113 (« sound posture (briefs) » → « intensity dial »), ~124 (« Pushed gear (briefs, …) » → « (RINSE, …) »), ~151 (« Interacts with spot choice and briefs » → « and intensity »), ~288 (« who + brief » → « who + intensity »).
- [ ] `npm run test && npm run build` — verts (aucun pin ne bouge : tâche UI).
- [ ] Vérification manuelle `npm run dev` : 4 boutons tappables, bande qui glisse vers la droite au fil de la nuit, jauge verte quand le curseur est dans la bande, liseré rouge qui monte si on campe RINSE.
- [ ] Commit :

```
feat(ui,audio): la jauge de vague — on voit et on entend son cran

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

### Task 4: phases.ts — les 4 phases scriptées (defs pures)

Le module feuille, sa table normative (spec story B) et l'interpolation. Pas encore branché sur la nuit.

**Files:**
- `src/core/phases.ts` (nouveau)
- `src/core/phases.test.ts` (nouveau)

**Steps:**

- [ ] `src/core/phases.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { NIGHT_PHASES, getPhase, phaseAt, phaseAttente } from './phases';

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
```

- [ ] `npx vitest run src/core/phases.test.ts` — échec : module inexistant.
- [ ] `src/core/phases.ts` :

```ts
/**
 * Les 4 phases scriptées de la nuit (story B) : mêmes fractions sur tous les
 * spots — un petit spot = arc compressé (champ 3 min : ouverture de 36 s),
 * le Teknival = arc complet de 10 min. Aucun cas particulier.
 */

export type NightPhaseId = 'ouverture' | 'rush' | 'creux' | 'aube';

export interface NightPhaseDef {
  id: NightPhaseId;
  nom: string;
  icon: string;
  /** fenêtre en fraction de la nuit [début, fin) — la dernière inclut 1 */
  frac: [number, number];
  /** baseline d'attente, interpolée linéairement sur la fenêtre */
  attente: [number, number];
  arrivalMult: number;
  churnMult: number;
  heatMult: number;
  barMult: number;
  /** × sur les gains de rep (events, objectifs, drops) pendant la phase */
  repMult: number;
  /** surpondération d'events par tag — réservé aux stories D/E (partie 2) */
  eventBias?: Record<string, number>;
}

export const NIGHT_PHASES: NightPhaseDef[] = [
  {
    id: 'ouverture',
    nom: 'Ouverture',
    icon: '🌒',
    frac: [0, 0.2],
    attente: [0.3, 0.5],
    arrivalMult: 0.7,
    churnMult: 0.6,
    heatMult: 0.7,
    barMult: 0.7,
    repMult: 1,
  },
  {
    id: 'rush',
    nom: 'Le rush',
    icon: '🔥',
    frac: [0.2, 0.55],
    attente: [0.5, 0.8],
    arrivalMult: 1.5,
    churnMult: 1.0,
    heatMult: 1.0,
    barMult: 1.3,
    repMult: 1,
  },
  {
    id: 'creux',
    nom: 'Le creux',
    icon: '🌫',
    frac: [0.55, 0.75],
    attente: [0.8, 0.45],
    arrivalMult: 0.4,
    churnMult: 1.6,
    heatMult: 1.3,
    barMult: 0.8,
    repMult: 1,
  },
  {
    id: 'aube',
    nom: "L'aube",
    icon: '🌅',
    frac: [0.75, 1],
    attente: [0.5, 0.9],
    arrivalMult: 0.6,
    churnMult: 0.7,
    heatMult: 1.0,
    barMult: 1.1,
    repMult: 2,
  },
];

function clampFrac(frac: number): number {
  return Math.min(0.9999, Math.max(0, frac));
}

export function phaseAt(frac: number): NightPhaseDef {
  const f = clampFrac(frac);
  return (
    NIGHT_PHASES.find((p) => f >= p.frac[0] && f < p.frac[1]) ?? NIGHT_PHASES[NIGHT_PHASES.length - 1]
  );
}

export function getPhase(id: NightPhaseId): NightPhaseDef {
  const phase = NIGHT_PHASES.find((p) => p.id === id);
  if (!phase) throw new Error(`unknown night phase: ${id}`);
  return phase;
}

/** Baseline d'attente de la nuit à cette fraction (interpolation linéaire). */
export function phaseAttente(frac: number): number {
  const p = phaseAt(frac);
  const t = (clampFrac(frac) - p.frac[0]) / (p.frac[1] - p.frac[0]);
  return p.attente[0] + (p.attente[1] - p.attente[0]) * t;
}
```

- [ ] `npx vitest run src/core/phases.test.ts` puis `npm run test && npm run build`.
- [ ] Commit :

```
feat(core): les phases de nuit — defs scriptées et interpolation d'attente

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

### Task 5: Brancher les phases dans la nuit — arc, multiplicateurs, rep ×2 à l'aube

La baseline provisoire de la story A est remplacée par la baseline phasée. Les multiplicateurs de phase composent (produit) avec les modificateurs de nuit. Rep ×2 à l'aube pour events/objectifs/drops, et le dernier drop de l'aube compte double encore.

**Files:**
- `src/core/types.ts`
- `src/core/night.ts`
- `src/core/payout.ts`
- `src/ui/strings.ts` (entrée minimale `events['phase-change']` pour compiler — l'UI riche est en task 6)
- `src/core/phases.test.ts`
- `src/core/progression.test.ts`, `src/core/regions-harness.test.ts` (re-pin)

**Steps:**

- [ ] Étendre `src/core/phases.test.ts` (le câblage) :

```ts
import { createNight, applyEffects, dropMontee, startSet, tickNight } from './night';
import { settleNight } from './payout';
import { newGame } from './save';

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
```

- [ ] `npx vitest run src/core/phases.test.ts` — échec : `nightPhase`/`lastAubeDropRep` n'existent pas, pas d'event `phase-change`.
- [ ] `src/core/types.ts` :
  - `import type { NightPhaseId } from './phases';`
  - `NightState` gagne `/** phase de l'arc de nuit, recalculée chaque tick depuis t/duration */ nightPhase: NightPhaseId;` et `/** rep créditée par le dernier drop de l'aube — re-créditée au règlement (double) */ lastAubeDropRep: number;`
  - `NightTickEventType` gagne `| 'phase-change'`.
- [ ] `src/core/night.ts` :
  - `import { getPhase, phaseAt, phaseAttente } from './phases';`
  - `createNight` : `nightPhase: 'ouverture', lastAubeDropRep: 0,`.
  - En tête de `tickNight` (avant les modificateurs) :

```ts
  // --- l'arc de la nuit : la phase est une pure fonction de t/duration ----------
  const frac = night.duration > 0 ? night.t / night.duration : 0;
  const phase = phaseAt(frac);
  if (phase.id !== night.nightPhase) {
    night.nightPhase = phase.id;
    events.push({ type: 'phase-change' });
  }
```

  - `currentWave` : remplacer la baseline provisoire par `const baseline = phaseAttente(night.duration > 0 ? night.t / night.duration : 0);` (supprimer le `0.35 + 0.45 × …` et son commentaire).
  - Les multiplicateurs composent (produit) avec les modifs du soir :
    - arrivées : `... * arrivalMod * phase.arrivalMult * night.rules.arrivalMult * genreRegionMult;`
    - départs : `... * churnMod * phase.churnMult * branchChurnMult(state) * ...`
    - heat : insérer `* phase.heatMult` dans la grande ligne.
    - buvette : `const drip = night.crowd * BAR_DRIP * spot.priceMult * priceMod * phase.barMult * night.rules.barMult * dt;`
  - Rep ×2 à l'aube — `applyEffects` :

```ts
  if (fx.rep) night.repBonus += fx.rep * getPhase(night.nightPhase).repMult;
```

  - `endCurrentSet`, la récompense d'objectif :

```ts
      night.repBonus += (night.setGoal.reward.rep ?? 0) * night.rules.goalRepMult * getPhase(night.nightPhase).repMult;
```

  - `dropMontee`, après le calcul de `waveMult` (décision tranchée n°4 du plan — barème aube uniquement) :

```ts
  // l'aube paie : le drop crédite de la rep (×2 d'aube intégré au barème de 6),
  // et le dernier drop de l'aube comptera double encore au règlement
  if (night.nightPhase === 'aube') {
    const dropRep = Math.round(6 * m * waveMult);
    night.repBonus += dropRep;
    night.lastAubeDropRep = dropRep;
  }
```

- [ ] `src/core/payout.ts` — `settleNight` : le dernier drop de l'aube double encore :

```ts
  const repGained = Math.round(
    (SUNRISE_REP + night.peakCrowd / 10 + (survivedHighHeat ? 15 : 0) + night.repBonus + night.lastAubeDropRep),
  );
```

- [ ] `src/ui/strings.ts` — entrée minimale pour compiler (`main.ts` toaste `STR.events[ev.type]`) : ajouter `'phase-change': '🌒 La nuit bascule…',` dans `STR.events` (la task 6 la remplace par le toast par-phase).
- [ ] `npm run test`. **Pins en mouvement (mesurer, jamais deviner)** :
  - `progression.test.ts` : l'arc change le rythme (ouverture arrivées ×0.7, rush ×1.5, aube rep ×2). Re-mesurer : le commentaire « ≈ 492 € », la borne rep nuit 2 (`gamine.repReq` = 8 — large), la borne `>= 16` nuit 4, et surtout **temps-vers-Teknival** : lancer, lire la valeur réelle, re-pin la borne basse à `mesuré − 2` avec commentaire `// mesuré X nuits après les phases (story B)`. Garder `< 200`.
  - `regions-harness.test.ts` : mêmes asserts qualitatifs — le creux (churn ×1.6, heat ×1.3) ne doit pas faire bust une nuit prudente au champ (heatBuild champ = 0.004, marge énorme) ; vérifier en lançant.
  - `test/economy.test.ts` « plafonne la recette de la buvette » : le tick de vente passe par `phase.barMult` (ouverture ×0.7 à t≈0) — le test plafonné par `barSales = barCap` reste vert (0 vendu). Vérifier.
  - `regions.test.ts` « Économie morose ×0.8 sur un tick » : les deux nuits comparées sont au même t (ouverture ×0.7 des deux côtés) — le ratio 0.8 tient. Vérifier.
- [ ] `npm run build`.
- [ ] Commit :

```
feat(core): chaque nuit a un arc — ouverture, rush, creux, aube (rep ×2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

### Task 6: Timeline de nuit — l'arc visible, les bascules annoncées

**Files:**
- `src/ui/screens.ts`
- `src/ui/strings.ts`
- `src/style.css`
- `src/main.ts`

**Steps:**

- [ ] `src/ui/strings.ts` — les toasts par phase (et retirer l'entrée provisoire `'phase-change'` de `STR.events` est impossible sans casser le type Record — la garder comme fallback mais le toast riche prend le dessus dans `main.ts`) :

```ts
  phaseToast: {
    ouverture: '🌒 Ouverture — le champ s’éveille, on chauffe doucement',
    rush: '🔥 Le rush — tout le monde arrive, la buvette tourne',
    creux: '🌫 Le creux — la foule fatigue, les bleus rôdent',
    aube: '🌅 L’aube — le final compte double, tiens jusqu’au soleil',
  } as Record<NightPhaseId, string>,
```

  (importer `type NightPhaseId` depuis `../core/phases`)
- [ ] `src/main.ts` — dans la boucle d'events de `frame`, traiter la bascule spécifiquement :

```ts
      for (const ev of events) {
        if (ev.type === 'phase-change') screen.toast(STR.phaseToast[night.nightPhase]);
        else screen.toast(STR.events[ev.type]);
        if (ev.type === 'bust') audio.playSiren();
        if (ev.type === 'set-ended') screen.showTransition(state, night, onStartSet);
      }
```

- [ ] `src/ui/screens.ts` — la timeline fine en haut du HUD, dans `renderNight` juste après `hudTop` :

```ts
  // timeline de l'arc de nuit : 4 segments, curseur de progression, icône de phase
  const timeline = el('div', 'night-timeline');
  const timelineSegs = new Map<string, HTMLElement>();
  for (const p of NIGHT_PHASES) {
    const seg = el('div', `timeline-seg seg-${p.id}`);
    seg.style.width = `${((p.frac[1] - p.frac[0]) * 100).toFixed(1)}%`;
    timelineSegs.set(p.id, seg);
    timeline.append(seg);
  }
  const timelineCursor = el('div', 'timeline-cursor');
  const timelineIcon = el('div', 'timeline-icon', NIGHT_PHASES[0].icon);
  timeline.append(timelineCursor, timelineIcon);
  sceneWrap.append(timeline);
```

  et dans `update(state, night)` :

```ts
      const nightFrac = night.duration > 0 ? Math.min(1, night.t / night.duration) : 0;
      timelineCursor.style.left = `${(nightFrac * 100).toFixed(1)}%`;
      timelineIcon.style.left = `${(nightFrac * 100).toFixed(1)}%`;
      timelineIcon.textContent = getPhase(night.nightPhase).icon;
      for (const [id, seg] of timelineSegs) seg.classList.toggle('current', id === night.nightPhase);
```

  (importer `NIGHT_PHASES, getPhase` depuis `../core/phases`)
- [ ] `src/style.css` :

```css
.night-timeline {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 6px;
  display: flex;
  z-index: 5;
}
.timeline-seg { height: 100%; opacity: 0.35; }
.timeline-seg.current { opacity: 0.9; }
.seg-ouverture { background: #4a5a8a; }
.seg-rush { background: #c2563a; }
.seg-creux { background: #5a6a72; }
.seg-aube { background: #d9a13b; }
.timeline-cursor {
  position: absolute;
  top: -2px;
  width: 2px;
  height: 10px;
  background: #fff;
  margin-left: -1px;
  transition: left 0.3s linear;
}
.timeline-icon {
  position: absolute;
  top: 8px;
  transform: translateX(-50%);
  font-size: 14px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  transition: left 0.3s linear;
}
```

- [ ] `npm run test && npm run build` ; vérification manuelle `npm run dev` (timeline visible, curseur avance, toast à 20 %/55 %/75 % de la nuit).
- [ ] Commit :

```
feat(ui): la timeline de nuit — l'arc en 4 phases, bascules annoncées

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

### Task 7: La descente — déclenchement, compte à rebours, évacuer, négocier

`rules.bustThreshold` devient `rules.descenteThreshold` (défaut 0.85, Zone quadrillée 0.70). La heat au seuil n'est plus un bust : c'est une séquence non bloquante avec compte à rebours `15 + 5×logTier` (logTier plafonné à 3). Timer expiré = bust standard. Le clamp des events redevient 0.99 (décision n°1 du plan).

**Files:**
- `src/core/raid.ts` (nouveau)
- `src/core/raid.test.ts` (nouveau)
- `src/core/types.ts`
- `src/core/night.ts`
- `src/core/regions.ts`
- `src/core/payout.ts`
- `src/core/idle.ts`
- `src/core/prompts.ts` (signes avant-coureurs : surpondération à heat ≥ 0.60)
- `src/ui/strings.ts` (entrée `events.descente` minimale pour compiler)
- `src/core/regions.test.ts`, `src/core/regions-harness.test.ts`, `src/core/progression.test.ts`

**Steps:**

- [ ] `src/core/raid.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { createNight, setIntensity, startSet, tickNight } from './night';
import { descenteCountdown, negoChance, negoCost, raidEvacuer, raidNegocier } from './raid';
import { settleNight } from './payout';
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
```

- [ ] `npx vitest run src/core/raid.test.ts` — échec : module inexistant.
- [ ] `src/core/regions.ts` — le rewire (révision chantier 1 faite) :
  - `RegionRules.bustThreshold` → **`descenteThreshold`**, doc : `/** Seuil de heat qui déclenche la descente (raid.ts) — 0.85 de base. */`, défaut `0.85` dans `defaultRegionRules()`.
  - Trait `zone-quadrillee` : `desc: 'Les bleus patrouillent serré : la descente tombe dès 70 % de chaleur.'`, `apply: (r) => { r.descenteThreshold = 0.7; },`
  - Le commentaire RÉVISION du champ disparaît (fait).
- [ ] `src/core/types.ts` :

```ts
export type RaidOutcome = 'evacue' | 'nego-ok' | 'nego-rate' | 'mur-tenu' | 'mur-casse' | 'bust-timer';

export interface RaidState {
  status: 'countdown' | 'siege' | 'done';
  /** échéance du compte à rebours, en secondes de nuit */
  deadline: number;
  outcome: RaidOutcome | null;
  /** fin du siège (s de nuit) — 0 hors siège */
  siegeEndAt: number;
  /** secondes cumulées sous le seuil de vibe pendant le siège */
  siegeLowT: number;
}
```

  `NightState` gagne `/** la descente du soir (1 max par nuit), ou null */ raid: RaidState | null;`, `/** nuit terminée par une évacuation propre */ evacuated: boolean;`, `/** négo réussie : 50 % de chance d'avoir planté l'arc « flic corrompu » (partie 2) */ negoCorruption: boolean;`. `NightTickEventType` gagne `| 'descente'`. `NightResult` gagne `/** issue de la descente du soir (null si aucune) */ raidOutcome: RaidOutcome | null;` et `/** nuit évacuée proprement */ evacuated: boolean;`.
- [ ] `src/core/raid.ts` :

```ts
import { getDj } from './data';
import { INTENSITY_LEVEL } from './intensity';
import { closeCurrentSet } from './night';
import type { GameState, NightState, NightTickEvent } from './types';

/**
 * La descente jouable (story C). Cycle d'import night ↔ raid assumé : tous les
 * appels croisés sont à l'exécution (tickNight → tickRaid, raid → closeCurrentSet),
 * jamais à l'init de module.
 */

/** Heat des signes avant-coureurs (sirène lointaine, toast — UI). */
export const DESCENTE_WARNING = 0.6;
export const SIEGE_DURATION = 45;
export const SIEGE_VIBE_MIN = 0.65;
/** > 8 s cumulées sous le seuil pendant le siège = mur cassé. */
export const SIEGE_MAX_LOW = 8;
export const NEGO_COST_BASE = 50;
export const NEGO_COST_PER_CROWD = 2;

/** logTier efficace, plafonné à 3 (les tiers 4+ gardent leur value de heat). */
function logTier(state: GameState): number {
  return Math.min(3, state.gear.logistique);
}

/** 15–30 s pour se décider — la logistique paie. */
export function descenteCountdown(state: GameState): number {
  return 15 + 5 * logTier(state);
}

/** Déclenche la descente (1 fois max par nuit). Appelé par tickNight au seuil. */
export function startDescente(state: GameState, night: NightState): void {
  if (night.raid) return;
  night.raid = {
    status: 'countdown',
    deadline: night.t + descenteCountdown(state),
    outcome: null,
    siegeEndAt: 0,
    siegeLowT: 0,
  };
}

function bust(state: GameState, night: NightState, events: NightTickEvent[] | null): void {
  closeCurrentSet(state, night);
  night.phase = 'ended';
  night.busted = true;
  if (events) events.push({ type: 'bust' });
}

/** Fait vivre la descente pendant le tick (la teuf continue : non bloquant). */
export function tickRaid(
  state: GameState,
  night: NightState,
  dt: number,
  events: NightTickEvent[],
): void {
  const raid = night.raid;
  if (!raid) return;
  if (raid.status === 'countdown' && night.t >= raid.deadline) {
    // l'indécision coûte : bust standard
    raid.status = 'done';
    raid.outcome = 'bust-timer';
    bust(state, night, events);
  }
  // (le siège — raid.status === 'siege' — arrive en task 9)
  void dt;
}

/** ÉVACUER : nuit terminée immédiatement, caisse conservée, pas de bust. */
export function raidEvacuer(state: GameState, night: NightState): boolean {
  if (night.raid?.status !== 'countdown') return false;
  night.raid.status = 'done';
  night.raid.outcome = 'evacue';
  night.evacuated = true;
  closeCurrentSet(state, night);
  night.phase = 'ended';
  night.journal.push({ t: night.t, titre: 'La descente', outcome: 'Évacuation propre — le camion était parti avant les bleus.' });
  return true;
}

export function negoCost(night: NightState): number {
  return NEGO_COST_BASE + NEGO_COST_PER_CROWD * Math.round(night.crowd);
}

export function negoChance(state: GameState, night: NightState): number {
  const dj = night.currentDj ? getDj(night.currentDj) : null;
  let p = 0.25 + 0.15 * logTier(state);
  if (dj?.risk === 'discret') p += 0.15;
  if (INTENSITY_LEVEL[night.intensity] <= INTENSITY_LEVEL.groove) p += 0.2;
  return Math.min(0.9, p);
}

/** NÉGOCIER : coût sur la banque, succès = heat 0.45, échec = bust immédiat. */
export function raidNegocier(state: GameState, night: NightState): boolean {
  if (night.raid?.status !== 'countdown') return false;
  const cost = negoCost(night);
  if (night.bank < cost) return false;
  night.bank -= cost;
  night.raid.status = 'done';
  if (night.rng() < negoChance(state, night)) {
    night.raid.outcome = 'nego-ok';
    night.heat = 0.45;
    // 50 % de chance de planter l'arc « flic corrompu » — hook lu par la partie 2
    night.negoCorruption = night.rng() < 0.5;
    night.journal.push({ t: night.t, titre: 'La descente', outcome: 'Négociée. Le gradé est reparti avec une enveloppe et un sourire.' });
  } else {
    night.raid.outcome = 'nego-rate';
    night.journal.push({ t: night.t, titre: 'La descente', outcome: 'La négociation a tourné court. Tout le monde dehors.' });
    bust(state, night, null);
  }
  return true;
}
```

- [ ] `src/core/night.ts` :
  - Exporter l'ex-`endCurrentSet` sous le nom **`closeCurrentSet`** (renommer la fonction et ses 2 appels internes — celui du bloc bust disparaît avec le bloc, reste celui de la fin de set ; export).
  - `import { startDescente, tickRaid } from './raid';`
  - `createNight` : `raid: null, evacuated: false, negoCorruption: false,`.
  - Remplacer le bloc bust de `tickNight` :

```ts
  night.heat = clamp(night.heat, 0, 1);
  night.peakHeat = Math.max(night.peakHeat, night.heat);
  // --- la descente (story C) : le seuil ouvre une séquence jouable, pas un bust --
  if (!night.raid && night.heat >= night.rules.descenteThreshold) {
    startDescente(state, night);
    events.push({ type: 'descente' });
  }
  tickRaid(state, night, dt, events);
  if (night.phase !== 'playing') return events; // bust par timer (ou siège, task 9)
```

  - `applyEffects` : le clamp redevient 0.99 — les events **peuvent** désormais pousser la heat jusqu'au seuil de descente (elle est jouable) :

```ts
  // les events peuvent déclencher la descente (elle se joue) — seul 1.0 est interdit
  if (fx.heat) night.heat = clamp(night.heat + fx.heat, 0, 0.99);
```

  - `dropMontee` : même clamp `0, 0.99`.
- [ ] `src/core/payout.ts` :
  - `settleNight` : l'évacuation conserve la caisse mais rep ×0.4 et buzz ×0.8 :

```ts
  const evacMult = night.evacuated ? 0.4 : 1;
  const repGained = Math.round(
    (SUNRISE_REP + night.peakCrowd / 10 + (survivedHighHeat ? 15 : 0) + night.repBonus + night.lastAubeDropRep) *
      evacMult,
  );
```

  et `buzzAfterNight(state, quality, night.evacuated ? 0.8 : 1);`
  - Garde-fou : évacuer le Teknival n'est pas le gagner — `const won = night.spotId === 'teknival' && !night.evacuated;`
  - Les deux `NightResult` gagnent `raidOutcome: night.raid?.outcome ?? null,` et `evacuated: night.evacuated,`.
- [ ] `src/core/idle.ts` — `buzzAfterNight` gagne un multiplicateur :

```ts
/** Word of mouth after a night; quality in [0, 1]. L'évacuation propre paie ×0.8. */
export function buzzAfterNight(state: GameState, quality: number, mult = 1): void {
  state.buzz = Math.min(BUZZ_CAP, state.buzz + (0.1 + 0.5 * Math.max(0, quality)) * mult);
}
```

- [ ] `src/ui/strings.ts` — entrée minimale : `descente: '🚨 LES BLEUS ARRIVENT — décide vite.',` dans `STR.events` (l'UI riche est en task 10).
- [ ] `src/core/prompts.ts` — les signes avant-coureurs de la spec (seuil 0.60) : le prompt `guetteur` est surpondéré au-delà du seuil de warning — `weight: (ctx) => (ctx.heat >= 0.6 ? 1.8 : ctx.heat > 0.4 ? 1.3 : 0.4),` (0.6 en dur avec commentaire `// = DESCENTE_WARNING — pas d'import de raid.ts depuis un module feuille`). Les events `patrouille` (1 + heat×2) et `barrage` (1.5 dès heat > 0.45) montent déjà avec la heat : ne pas y toucher.
- [ ] Mettre à jour les lecteurs de `bustThreshold` : `grep -rn "bustThreshold" src/ test/` — sites connus : `night.ts` (fait ci-dessus), `regions.ts` (fait), `regions.test.ts` (ci-dessous). Le clamp `bustThreshold - 0.01` de la task 2 dans `dropMontee` est remplacé par `0.99` (fait).
- [ ] `src/core/regions.test.ts` — les attentes changent **parce que le seuil change de sens** :
  - l.51 : `expect(applied('zone-quadrillee').descenteThreshold).toBe(0.7);`
  - Le test « Zone quadrillée : le bust tombe dès 85 % » devient :

```ts
  it('Zone quadrillée : la descente se déclenche dès 70 % de chaleur', () => {
    const base = playingNight([]);
    base.night.heat = 0.71;
    expect(tickNight(base.state, base.night, 0.1).some((e) => e.type === 'descente')).toBe(false);
    const quad = playingNight(['zone-quadrillee']);
    quad.night.heat = 0.71;
    const events = tickNight(quad.state, quad.night, 0.1);
    expect(events.some((e) => e.type === 'descente')).toBe(true);
    expect(quad.night.raid?.status).toBe('countdown');
    expect(quad.night.busted).toBe(false); // la descente se joue, elle ne bust pas
  });
```

  - Le test du clamp devient :

```ts
  it('les events plafonnent la heat à 0.99 — ils peuvent déclencher la descente (jouable)', () => {
    const quad = playingNight(['zone-quadrillee']);
    applyEffects(quad.state, quad.night, { heat: 1 });
    expect(quad.night.heat).toBeCloseTo(0.99, 5);
    const base = playingNight([]);
    applyEffects(base.state, base.night, { heat: 1 });
    expect(base.night.heat).toBeCloseTo(0.99, 5);
  });
```

- [ ] **Harnais** :
  - `regions-harness.test.ts` : ajouter dans la boucle de `playNight`, après le tick : rien — mais à la fin, avant `settleNight` : `expect(night.raid).toBeNull(); // une nuit prudente ne déclenche jamais la descente (tiers 1–3 du harnais)`.
  - `progression.test.ts` (`autoCareer`) : la politique gloutonne peut atteindre 0.85 sur les gros spots — gérer la descente dans la boucle interne de jeu, juste **après** l'appel `tickNight(state, night, 0.1)` :

```ts
        if (night.raid?.status === 'countdown') raidEvacuer(state, night); // sortie propre, déterministe
```

  (import `raidEvacuer` depuis `./raid`) — la rep ×0.4 des nuits évacuées ralentit la carrière : re-mesurer la borne temps-vers-Teknival (procédure de re-pin, commentaire `// mesuré X nuits après la descente (story C)`).
- [ ] `npm run test && npm run build`.
- [ ] Commit :

```
feat(core): la descente se joue — compte à rebours, évacuer, négocier

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

### Task 8: Casier & garde à vue — les conséquences persistent entre les nuits

`GameState.gardeAVue` + `casier` + `mursTenus`, décréments au règlement, casier qui chauffe les spots tier ≥ 4, gel du casier en région « Préfet zélé » (révision chantier 1 faite), gimmick `insaisissable` rebranché sur l'immunité à la garde à vue (révision faite), badges à la prépa.

**Files:**
- `src/core/types.ts`
- `src/core/save.ts`
- `src/core/payout.ts`
- `src/core/crew.ts`
- `src/core/night.ts`
- `src/core/tour.ts`
- `src/core/raid.test.ts`
- `src/ui/screens.ts`, `src/ui/strings.ts`, `src/main.ts`
- `test/tour.test.ts`

**Steps:**

- [ ] Étendre `src/core/raid.test.ts` :

```ts
// étendre l'import existant de './payout' avec applyBust ; nouvel import crew :
import { applyBust, settleNight } from './payout';
import { gardeAVueNights, isEnGardeAVue } from './crew';

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
```

- [ ] `npx vitest run src/core/raid.test.ts` — échec : champs inexistants.
- [ ] `src/core/types.ts` — `GameState` gagne :

```ts
  /** nuits de garde à vue restantes par DJ — décrémente à chaque settle propre (pas sur bust) */
  gardeAVue: Partial<Record<string, number>>;
  /** casier : +1 par bust, −1 par nuit sans bust (min 0, gelé en Préfet zélé) */
  casier: number;
  /** murs tenus pendant un siège (tag légende, ⭐ au départ en tournée) */
  mursTenus: number;
```

- [ ] `src/core/save.ts` :
  - `newGame` : `gardeAVue: {}, casier: 0, mursTenus: 0,`.
  - `migrate` (vieilles saves v3 sans les champs) :

```ts
function migrate(state: GameState): GameState {
  if (!state.tour) state.tour = defaultTour();
  state.gardeAVue ??= {};
  state.casier ??= 0;
  state.mursTenus ??= 0;
  return state;
}
```

  (`SAVE_VERSION` reste 3 : `isValidState` ne vérifie pas ces champs, les defaults suffisent.)
- [ ] `src/core/crew.ts` :

```ts
/** Nuits de garde à vue restantes pour ce DJ (0 = libre). */
export function gardeAVueNights(state: GameState, djId: string): number {
  return state.gardeAVue[djId] ?? 0;
}

export function isEnGardeAVue(state: GameState, djId: string): boolean {
  return gardeAVueNights(state, djId) > 0;
}
```

- [ ] `src/core/payout.ts` :

```ts
/**
 * Une nuit propre passe : la garde à vue décrémente — au settle UNIQUEMENT
 * (spec : « décrémente à chaque settle »). Pas dans applyBust : la nuit du
 * bust aggravé poserait 2 nuits puis en consommerait une immédiatement —
 * le DJ ne raterait qu'une seule nuit au lieu des 2 promises.
 */
function tickGardeAVue(state: GameState): void {
  for (const id of Object.keys(state.gardeAVue)) {
    const left = (state.gardeAVue[id] ?? 0) - 1;
    if (left <= 0) delete state.gardeAVue[id];
    else state.gardeAVue[id] = left;
  }
}
```

  - `settleNight` : après `state.nights += 1;` → `tickGardeAVue(state); if (!night.rules.casierGele) state.casier = Math.max(0, state.casier - 1);`
  - `applyBust` : après `state.nights += 1;` → `state.casier += 1;` (PAS de `tickGardeAVue` ici — voir le doc-comment ci-dessus ; une garde à vue antérieure ne décompte pas non plus sur une nuit bustée, assumé)
- [ ] `src/core/night.ts` — `createNight`, le casier chauffe les villes :

```ts
  // sans caution sur un tier ≥ 3 : +0.1 ; le casier chauffe les villes (tier ≥ 4)
  const casierHeat = spot.tier >= 4 ? 0.05 * state.casier : 0;
  const startHeat = clamp((spot.tier >= 3 && cautionPaid === 0 ? 0.1 : 0) + casierHeat, 0, 0.5);
```

  - Le gimmick `insaisissable` est rebranché (révision chantier 1 faite) : la ligne `riskMult` redevient `const riskMult = dj ? RISK_HEAT[dj.risk] : 1;` (l'immunité à la garde à vue arrive en task 9 dans `raid.ts` ; le commentaire RÉVISION disparaît ici et dans `types.ts` : `/** insaisissable : ne va jamais en garde à vue */`).
- [ ] `src/core/tour.ts` :
  - `computeLegende` : `const mursTenus = state.mursTenus;` (le commentaire RÉVISION se réduit aux arcs, partie 2).
  - `departOnTour` : rien à faire (le `newGame` frais remet `gardeAVue/casier/mursTenus` à zéro — « Le casier — les bleus t'oublient » de `STR.departLost` devient vrai) ; mettre à jour le commentaire RÉVISION en conséquence.
- [ ] `test/tour.test.ts` — le pin du gimmick change (révision sanctionnée par la spec) :

```ts
  it('insaisissable : DJ Sans Nom est immunisé à la garde à vue, heat = discret simple', () => {
    // le gimmick n'est plus « moitié moins de heat » : il devient l'immunité à la
    // garde à vue (story C) — la heat de sansnom est celle d'un discret (×0.8)
    expect(heatAfter('sansnom')).toBeCloseTo(heatAfter('memeacide') * 0.8, 5);
  });
```

  (l'immunité elle-même est testée en task 9)
- [ ] `src/ui/strings.ts` :

```ts
  gardeAVueBadge: (n: number) => `🚔 Garde à vue — ${n} nuit${n > 1 ? 's' : ''}`,
  casierBadge: (n: number) => `📁 Casier : ${n}`,
  casierHint: 'Les villes te connaissent : +5 % de chaleur de départ par cran de casier sur les spots tier 4+.',
```

- [ ] `src/ui/screens.ts` — `renderPrepare` :
  - Badge casier dans le header, après les stats : `if (state.casier > 0) { const chip = stat('📁', String(state.casier), 'casier'); chip.title = STR.casierHint; stats.append(chip); }`
  - DJ en garde à vue : dans la boucle `for (const member of state.crew)`, au début :

```ts
    const jailed = isEnGardeAVue(state, member.id);
```

  la carte gagne la classe `locked` si `jailed`, n'installe **pas** le listener de sélection, et affiche `info.append(el('div', 'dj-risk', STR.gardeAVueBadge(gardeAVueNights(state, member.id))));` à la place des sinks. (imports `gardeAVueNights, isEnGardeAVue` depuis `../core/crew`)
- [ ] `src/main.ts` — filtrer les détenus : dans `showPrepare`, après le nettoyage de `selection.present` : `for (const id of selection.present) { if (isEnGardeAVue(state, id)) selection.present.delete(id); }` ; et dans `startNight` : `const present = [...selection.present].filter((id) => state.crew.some((d) => d.id === id) && !isEnGardeAVue(state, id));`. Le garde-fou « si vide, tout le monde » de `showPrepare` doit lui aussi exclure les détenus : `for (const d of state.crew) if (!isEnGardeAVue(state, d.id)) selection.present.add(d.id);` (le fondateur n'allant jamais en garde à vue, il reste toujours au moins un DJ — no-softlock).
- [ ] `npm run test && npm run build`. Harnais : aucun pin ne bouge (le casier de départ est 0, les harnais ne bustent pas).
- [ ] Commit :

```
feat(core,ui): le casier et la garde à vue — les conséquences persistent

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

### Task 9: Tenir le mur — l'état de siège et le bust aggravé

45 s de siège : vibe moyenne ≥ 0.65 sinon (8 s cumulées sous le seuil) bust aggravé — saisie −1 tier (jamais le starter), DJ aux platines en garde à vue 2 nuits (fondateur et insaisissable immunisés), −50 % de caisse. Mur tenu : rep +25 (×2 à l'aube), tag « légende », Montée pleine, `mursTenus += 1`.

**Files:**
- `src/core/raid.ts`
- `src/core/payout.ts`
- `src/core/types.ts`
- `src/core/raid.test.ts`
- `src/ui/strings.ts` (entrée `events['mur-tenu']`)

**Steps:**

- [ ] Étendre `src/core/raid.test.ts` :

```ts
import { raidTenir, SIEGE_DURATION, SIEGE_MAX_LOW, SIEGE_VIBE_MIN } from './raid';
// (étendre l'import existant de './night' avec resolveEvent)

describe('tenir le mur : le siège', () => {
  function siegeNight(seed = 7) {
    const { state, night } = playing(seed);
    night.heat = 0.86;
    tickNight(state, night, 0.1);
    expect(raidTenir(state, night)).toBe(true);
    expect(night.raid?.status).toBe('siege');
    return { state, night };
  }

  it('vibe tenue ≥ 0.65 pendant 45 s → mur tenu : rep +25, montée pleine, heat drainée', () => {
    const { state, night } = siegeNight();
    night.vibe = 0.9;
    const repBefore = night.repBonus;
    for (let t = 0; t < SIEGE_DURATION + 1; t += 0.1) {
      if (night.phase === 'event') resolveEvent(state, night, 0);
      night.vibe = Math.max(night.vibe, SIEGE_VIBE_MIN + 0.05); // la vibe tient
      tickNight(state, night, 0.1);
    }
    expect(night.raid?.outcome).toBe('mur-tenu');
    expect(night.repBonus).toBeGreaterThanOrEqual(repBefore + 25);
    expect(night.montee).toBe(1);
    expect(night.heat).toBeLessThan(0.5);
    expect(state.mursTenus).toBe(1);
    expect(night.busted).toBe(false);
  });

  it('> 8 s cumulées sous le seuil → bust aggravé : saisie, garde à vue, −50 % caisse', () => {
    const state = newGame(42);
    state.rep = 100;
    state.gear.mur = 2; // du matos saisissable
    state.crew.push({ id: 'gamine', xp: 0, fatigue: 0, setsPlayed: 0, gifted: false, studioBonus: 0 });
    const night = createNight(state, 'champ', ['gamine'], 7);
    startSet(state, night, 'gamine');
    night.heat = 0.86;
    tickNight(state, night, 0.1);
    raidTenir(state, night);
    night.bank = 400;
    for (let t = 0; t < SIEGE_MAX_LOW + 2 && !night.busted; t += 0.1) {
      night.vibe = 0.1; // le mur casse
      tickNight(state, night, 0.1);
    }
    expect(night.raid?.outcome).toBe('mur-casse');
    expect(night.busted).toBe(true);
    expect(state.gardeAVue.gamine).toBe(2); // le DJ aux platines paie
    const result = applyBust(state, night);
    expect(result.seized).toBe('mur'); // saisie dès le premier bust
    expect(state.gear.mur).toBe(1);
    expect(result.bank).toBe(400);
    expect(result.gross).toBeLessThanOrEqual(200); // −50 % caisse
  });

  it('le fondateur et l’insaisissable ne vont jamais en garde à vue', () => {
    const { state, night } = siegeNight(); // tonton aux platines
    for (let t = 0; t < SIEGE_MAX_LOW + 2 && !night.busted; t += 0.1) {
      night.vibe = 0.1;
      tickNight(state, night, 0.1);
    }
    expect(night.busted).toBe(true);
    expect(state.gardeAVue.tonton).toBeUndefined();
  });
});
```

- [ ] `npx vitest run src/core/raid.test.ts` — échec : `raidTenir` n'existe pas.
- [ ] `src/core/raid.ts` :

```ts
export const MUR_TENU_REP = 25;
export const GARDE_A_VUE_NIGHTS = 2;

/** TENIR LE MUR : 45 s de siège, la vibe contre le seuil. */
export function raidTenir(state: GameState, night: NightState): boolean {
  if (night.raid?.status !== 'countdown') return false;
  night.raid.status = 'siege';
  night.raid.siegeEndAt = night.t + SIEGE_DURATION;
  night.raid.siegeLowT = 0;
  void state;
  return true;
}

/** Le DJ aux platines part en garde à vue — fondateur et insaisissable immunisés. */
function jailCurrentDj(state: GameState, night: NightState): void {
  const id = night.currentDj;
  if (!id || id === 'tonton') return; // no-softlock : le fondateur reste libre
  if (getDj(id).gimmick === 'insaisissable') return;
  state.gardeAVue[id] = GARDE_A_VUE_NIGHTS;
}
```

  et dans `tickRaid`, remplacer le commentaire « task 9 » par :

```ts
  if (raid.status === 'siege') {
    if (night.vibe < SIEGE_VIBE_MIN) raid.siegeLowT += dt;
    if (raid.siegeLowT > SIEGE_MAX_LOW) {
      // mur cassé : bust aggravé (saisie + garde à vue + −50 % caisse, voir payout)
      raid.status = 'done';
      raid.outcome = 'mur-casse';
      jailCurrentDj(state, night);
      night.journal.push({ t: night.t, titre: 'Le siège', outcome: 'Le mur a cassé. Les bleus sont entrés dans le son.' });
      bust(state, night, events);
    } else if (night.t >= raid.siegeEndAt) {
      // mur tenu : les bleus se retirent devant la marée humaine
      raid.status = 'done';
      raid.outcome = 'mur-tenu';
      night.heat = 0.3;
      night.montee = 1; // Montée pleine offerte
      night.repBonus += MUR_TENU_REP * (night.nightPhase === 'aube' ? 2 : 1);
      state.mursTenus += 1;
      night.journal.push({ t: night.t, titre: 'Le siège', outcome: 'Le mur a tenu. Les bleus ont reculé devant la foule. Légende.' });
      events.push({ type: 'mur-tenu' });
    }
  }
```

  (retirer le `void dt;` provisoire ; import `getDj` déjà présent)
- [ ] `src/core/types.ts` : `NightTickEventType` gagne `| 'mur-tenu'`.
- [ ] `src/core/payout.ts` — le bust aggravé remplace l'escalade standard :

```ts
  const aggrave = night.raid?.outcome === 'mur-casse';
  let gross = 0;
  let fine = 0;
  let seized: GearCategory | null = null;

  if (aggrave) {
    // mur cassé : −50 % caisse + saisie immédiate (−1 tier, jamais le starter),
    // quel que soit le casier — la garde à vue a été posée par raid.ts
    gross = Math.round(night.bank * 0.5);
    seized = bestSeizable(state);
    if (seized) state.gear[seized] = Math.max(0, state.gear[seized] - 1);
  } else if (offense === 1) {
    gross = Math.round(night.bank * 0.5);
  } else if (offense === 2) {
    fine = 200 * spot.tier;
  } else {
    fine = 200 * spot.tier;
    seized = bestSeizable(state);
    if (seized) state.gear[seized] = Math.max(0, state.gear[seized] - 1);
  }
```

- [ ] `src/ui/strings.ts` : `'mur-tenu': '🛡 LE MUR A TENU ! Les bleus reculent — légende.',` dans `STR.events`.
- [ ] `npm run test && npm run build`. Harnais : inchangés (aucune nuit de harnais ne déclenche le siège).
- [ ] Commit :

```
feat(core): tenir le mur — l'état de siège, le mur tenu, le bust aggravé

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

### Task 10: UI de la descente — bandeau, siège, gyrophares, recap

Le bandeau non bloquant avec compte à rebours et 3 gros boutons tappables, la vignette « TENIR » avec la jauge de vibe contre le seuil, les gyrophares, la sirène à 0.60 et au déclenchement, les tags du recap. Le warning passe de 0.75 à `DESCENTE_WARNING` (0.60).

**Files:**
- `src/ui/screens.ts`
- `src/main.ts`
- `src/style.css`
- `src/ui/strings.ts`

**Steps:**

- [ ] `src/ui/strings.ts` :

```ts
  raidBanner: (s: number) => `🚨 LES BLEUS ARRIVENT — ${s} s`,
  raidEvacuer: '🚐 ÉVACUER',
  raidEvacuerHint: 'La caisse est sauvée, la rep trinque. Sortie propre.',
  raidNegocier: (cost: number) => `🤝 NÉGOCIER (−${cost} €)`,
  raidNegocierHint: 'Une enveloppe et un sourire. Ça passe ou ça casse.',
  raidTenir: '🛡 TENIR LE MUR',
  raidTenirHint: '45 s de siège : la vibe doit tenir, sinon tout aggrave.',
  siegeVignette: (s: number) => `🛡 TENIR — ${s} s`,
  siegeMarge: (s: number) => `⚠ ${s.toFixed(1)} s de marge`,
  raidNegoOkToast: '🤝 Négocié — le gradé repart, la teuf continue.',
  raidEvacueToast: '🚐 Évacuation propre — tout le monde dehors, la caisse au chaud.',
  recapMurTenu: '🛡 LÉGENDE — le mur a tenu',
  recapEvacue: '🚐 Évacuation propre',
  events: {
    /* … entrées existantes inchangées, plus : */
    heatWarning: '👮 Sirènes au loin… des voitures qui passent. Calme le jeu.',
  },
```

  (remplacer le texte de `heatWarning` existant par celui-ci — les « signes avant-coureurs » de la spec)
- [ ] `src/ui/screens.ts` — dans `renderNight` :
  - `NightLiveCallbacks` gagne `onRaid(choice: 'evacuer' | 'negocier' | 'tenir'): void;`
  - Le bandeau (après le `floor-prompt`) :

```ts
  // bandeau descente : non bloquant — la teuf continue derrière
  const raidBanner = el('div', 'raid-banner hidden');
  const raidTitle = el('div', 'raid-title', '');
  const raidBtns = el('div', 'raid-btns');
  const mkRaidBtn = (label: string, hint: string, choice: 'evacuer' | 'negocier' | 'tenir') => {
    const b = el('button', 'btn raid-btn', label) as HTMLButtonElement;
    b.title = hint;
    b.addEventListener('click', () => live.onRaid(choice));
    raidBtns.append(b);
    return b;
  };
  const evacBtn = mkRaidBtn(STR.raidEvacuer, STR.raidEvacuerHint, 'evacuer');
  const negoBtn = mkRaidBtn(STR.raidNegocier(0), STR.raidNegocierHint, 'negocier');
  const tenirBtn = mkRaidBtn(STR.raidTenir, STR.raidTenirHint, 'tenir');
  raidBanner.append(raidTitle, raidBtns);
  sceneWrap.append(raidBanner);

  // vignette de siège : la vibe contre le seuil
  const siegeBox = el('div', 'siege-box hidden');
  const siegeTitle = el('div', 'siege-title', '');
  const siegeBar = el('div', 'siege-bar');
  const siegeFill = el('div', 'siege-fill');
  const siegeThreshold = el('div', 'siege-threshold');
  siegeThreshold.style.left = `${SIEGE_VIBE_MIN * 100}%`;
  siegeBar.append(siegeFill, siegeThreshold);
  const siegeMarge = el('div', 'siege-marge', '');
  siegeBox.append(siegeTitle, siegeBar, siegeMarge);
  sceneWrap.append(siegeBox);
```

  (imports : `SIEGE_VIBE_MIN, SIEGE_MAX_LOW, negoCost` depuis `../core/raid`)
  - Dans `update(state, night)` :

```ts
      const raid = night.raid;
      if (raid?.status === 'countdown' && playing) {
        raidTitle.textContent = STR.raidBanner(Math.max(0, Math.ceil(raid.deadline - night.t)));
        const cost = negoCost(night);
        negoBtn.textContent = STR.raidNegocier(cost);
        negoBtn.disabled = night.bank < cost;
        evacBtn.disabled = false;
        tenirBtn.disabled = false;
        raidBanner.classList.remove('hidden');
      } else {
        raidBanner.classList.add('hidden');
      }
      if (raid?.status === 'siege' && playing) {
        siegeTitle.textContent = STR.siegeVignette(Math.max(0, Math.ceil(raid.siegeEndAt - night.t)));
        siegeFill.style.width = `${(night.vibe * 100).toFixed(1)}%`;
        siegeFill.classList.toggle('low', night.vibe < SIEGE_VIBE_MIN);
        siegeMarge.textContent = STR.siegeMarge(Math.max(0, SIEGE_MAX_LOW - raid.siegeLowT));
        siegeBox.classList.remove('hidden');
      } else {
        siegeBox.classList.add('hidden');
      }
      // gyrophares sur les bords pendant toute la séquence
      root.classList.toggle('raid-active', (raid?.status === 'countdown' || raid?.status === 'siege') && playing);
```

- [ ] `src/ui/screens.ts` — `renderRecap` : après le titre, les tags d'issue :

```ts
  if (result.raidOutcome === 'mur-tenu') panel.append(el('div', 'recap-sub recap-legende', STR.recapMurTenu));
  if (result.evacuated) panel.append(el('div', 'recap-sub', STR.recapEvacue));
```

- [ ] `src/main.ts` :
  - Imports : `raidEvacuer, raidNegocier, raidTenir, DESCENTE_WARNING` depuis `./core/raid`.
  - Callback :

```ts
    onRaid: (choice) => {
      if (!active) return;
      const night = active.night;
      if (choice === 'evacuer' && raidEvacuer(state, night)) active.screen.toast(STR.raidEvacueToast);
      if (choice === 'negocier' && raidNegocier(state, night)) {
        active.screen.toast(night.raid?.outcome === 'nego-ok' ? STR.raidNegoOkToast : STR.events.bust);
        if (night.raid?.outcome === 'nego-rate') audio.playSiren();
      }
      if (choice === 'tenir' && raidTenir(state, night)) active.screen.toast(STR.raidTenir);
    },
```

  - Le warning à 0.60 (signes avant-coureurs, sirène lointaine dans le mix) :

```ts
      if (!active.heatWarned && night.heat > DESCENTE_WARNING) {
        active.heatWarned = true;
        screen.toast(STR.events.heatWarning);
        audio.playSiren(1.5); // sirène lointaine — courte et discrète
      } else if (night.heat < DESCENTE_WARNING - 0.1) {
        active.heatWarned = false;
      }
```

  - Au déclenchement : dans la boucle d'events, `if (ev.type === 'descente') audio.playSiren();` (et le toast standard `STR.events.descente` passe déjà).
  - **Sortir l'armement de fin de nuit de la boucle de tick** — indispensable : `raidEvacuer` / `raidNegocier` (échec) passent `phase = 'ended'` depuis un **callback de bouton**, entre deux frames. Le bloc `if ((night.phase as string) === 'ended' && active.endAt === null) { active.endAt = …; if (!night.busted) audio.stop(); }` vit aujourd'hui DANS le `while` de tick (qui ne tourne que si `phase === 'playing'`) : il ne se déclencherait jamais et la nuit resterait figée à l'écran. Le déplacer **après** le bloc `if (night.phase === 'playing') { … } else { … }` de `frame`, pour qu'il s'évalue à chaque frame :

```ts
  // la descente peut terminer la nuit depuis un bouton (évacuer / négo ratée),
  // hors du tick — l'armement de fin s'évalue à chaque frame
  if (night.phase === 'ended' && active.endAt === null) {
    active.endAt = now + (night.busted ? 3800 : 4000);
    if (!night.busted) audio.stop();
  }
```

  (supprimer l'occurrence interne au `while` ; le règlement passe ensuite par le chemin existant `endNight()` → `busted ? applyBust : settleNight` — l'évacuation, `busted === false`, settle bien.)
- [ ] `src/style.css` :

```css
.raid-banner {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(20, 8, 12, 0.92);
  border: 2px solid #ff3b3b;
  border-radius: 12px;
  padding: 10px 14px;
  z-index: 30;
  text-align: center;
  max-width: min(92vw, 480px);
}
.raid-title { color: #ff6b6b; font-weight: 800; letter-spacing: 0.06em; margin-bottom: 8px; }
.raid-btns { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.raid-btn { min-height: 48px; flex: 1; white-space: nowrap; }

.siege-box {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(8, 12, 20, 0.92);
  border: 2px solid #6ba8ff;
  border-radius: 12px;
  padding: 10px 14px;
  z-index: 30;
  min-width: 260px;
  text-align: center;
}
.siege-title { color: #9cc2ff; font-weight: 800; margin-bottom: 6px; }
.siege-bar { position: relative; height: 12px; background: #15151c; border-radius: 6px; overflow: hidden; }
.siege-fill { height: 100%; background: #5cf09a; transition: width 0.15s linear; }
.siege-fill.low { background: #ff5c5c; }
.siege-threshold { position: absolute; top: 0; bottom: 0; width: 2px; background: #fff; }
.siege-marge { margin-top: 4px; font-size: 12px; color: #ffb35c; }

/* gyrophares : les bords de l'écran pulsent bleu/rouge */
.screen-night.raid-active .scene-wrap::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 25;
  animation: gyrophares 1s infinite;
}
@keyframes gyrophares {
  0%, 100% { box-shadow: inset 0 0 60px 10px rgba(60, 100, 255, 0.35); }
  50% { box-shadow: inset 0 0 60px 10px rgba(255, 60, 60, 0.35); }
}
.recap-legende { color: #ffd34d; font-weight: 800; }
```

- [ ] `npm run test && npm run build` ; vérification manuelle `npm run dev` (forcer une descente : jouer RINSE au hangar — bandeau, 3 boutons, gyrophares ; tenir → vignette de siège).
- [ ] Self-review final du chantier : `grep -rnF "brief" src/ test/ server/ tools/` (zéro mécanique restante), `grep -rn "RÉVISION CHANTIER 1" src/` (ne restent que les hooks des stories D/E — `data.ts` château/Volt/lumières-A/logistique, `tour.ts` arcs, `regions.ts` `specialNightWeightMult`/`maxEventsBonus` — chacun annoté « partie 2 »), `npm run test && npm run build` verts.
- [ ] Commit :

```
feat(ui,audio): la descente à l'écran — bandeau, siège, gyrophares

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

---

## Registre de symboles (ce que la Partie 2 vient brancher)

**`src/core/intensity.ts`**
- `type Intensity = 'chill' | 'groove' | 'peak' | 'rinse'`
- `INTENSITIES: Intensity[]`, `INTENSITY_LEVEL`, `INTENSITY_QUALITY`, `INTENSITY_HEAT`, `INTENSITY_POWER: Record<Intensity, number>`
- `isHighIntensity(i: Intensity): boolean`, `nearestIntensity(attente: number): Intensity`
- `ATTENTE_GENRE: Record<GenreId, number>` — story D (`attenteMode: 'haute' | 'puriste'` modulera la baseline/tolérance par-dessus)

**`src/core/night.ts`**
- `setIntensity(night: NightState, i: Intensity): boolean` — story D (teuf privée : « jamais RINSE » s'implémente en refusant le cran sous contrat)
- `currentWave(state, night): WaveState` (`{ attente, tol, level, gap, inWave }`), `TOL_BASE`, `TOL_PER_TECH`, `CHARISME_PULL`, `BURNOUT_ATTENTE_MALUS`, `BURNOUT_DROP_MALUS`
- `closeCurrentSet(state, night)` (exporté), `dropMontee`, `MONTEE_MIN_DROP`

**`src/core/types.ts`** (sélection)
- `NightState`: `intensity`, `attente`, `burnout`, `waveScore`, `bestWaveScore`, `softT`, `setPeakRinseT`, `intensitySum`, `setWaveSum/setWaveSamples`, `nightPhase: NightPhaseId`, `lastAubeDropRep`, `raid: RaidState | null`, `evacuated`, **`negoCorruption: boolean`** ← le hook « flic corrompu » que la story E lit au règlement pour planter l'arc
- `EventEffects.forceIntensity?: Intensity`, `EventContext.intensity: Intensity`, `SetRecord = { djId }`
- `RaidState` (`status/deadline/outcome/siegeEndAt/siegeLowT`), `RaidOutcome`
- `NightResult`: `bestWaveScore` (story D : score du soundclash), `raidOutcome`, `evacuated`
- `GameState`: `gardeAVue: Partial<Record<string, number>>`, `casier: number`, `mursTenus: number`
- `NightTickEventType` += `'phase-change' | 'descente' | 'mur-tenu'`

**`src/core/phases.ts`**
- `type NightPhaseId`, `interface NightPhaseDef` (avec `eventBias?: Record<string, number>` — **réservé**, story D/E), `NIGHT_PHASES`, `phaseAt(frac)`, `getPhase(id)`, `phaseAttente(frac)` — story D (soundclash phase par phase, anniversaire `attenteMode`)

**`src/core/raid.ts`**
- `DESCENTE_WARNING = 0.6`, `SIEGE_DURATION = 45`, `SIEGE_VIBE_MIN = 0.65`, `SIEGE_MAX_LOW = 8`, `MUR_TENU_REP = 25`, `GARDE_A_VUE_NIGHTS = 2`
- `descenteCountdown(state)`, `startDescente(state, night)`, `tickRaid(state, night, dt, events)`, `raidEvacuer(state, night)`, `raidNegocier(state, night)`, `raidTenir(state, night)`, `negoCost(night)`, `negoChance(state, night)` — story D (`noDescente` du contrat de teuf privée court-circuitera `startDescente`), story E (la négo réussie + `negoCorruption` plante l'arc)

**`src/core/crew.ts`**
- `gardeAVueNights(state, djId)`, `isEnGardeAVue(state, djId)`, `FATIGUE_BASE_PER_SET = 0.18`, `FATIGUE_PEAKRINSE_BONUS = 0.16`, `applySetToll(dj, fracPeakRinse, setSeconds)`

**`src/core/regions.ts`**
- `RegionRules.descenteThreshold` (ex-`bustThreshold`, défaut 0.85), `RegionRules.attenteTolBonus` (Public exigeant −0.05), `casierGele` (branché)
- Restent dormants pour la partie 2 : `specialNightWeightMult` (story D), `maxEventsBonus` (fallback vivant)

**`src/core/idle.ts`** — `buzzAfterNight(state, quality, mult = 1)`

**`src/core/tour.ts`** — `computeLegende` lit `state.mursTenus` (les arcs terminés restent à 0, partie 2)

**RÉVISION CHANTIER 1 restants (à la charge de la Partie 2, stories D/E)** : `data.ts` château (arc fermier), Volt (soundclash), lumières voie A (« burnout ralenti » — peut se rebrancher sur `BURNOUT_CHARGE` via un `GearEffects.burnoutMult` si la partie 2 le souhaite), logistique voie A (« négo + ») ; `tour.ts` arcs terminés ; `regions.ts` `specialNightWeightMult`.
