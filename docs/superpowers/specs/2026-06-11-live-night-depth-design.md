# Rave Tycoon — Densifier la nuit : design

**Status**: Design validé (brainstorming 2026-06-11) — prêt pour un plan d'implémentation
**Auteur**: Jimmy + Claude

## Problème

La phase active (« on regarde le set ») est trop **éparse**, pas trop longue. Sur une nuit
à Champ paumé (180s, 2 sets) le joueur ne dispose que de **2 leviers live** — le brief
(`safe`/`normal`/`pousser`, lock 18s) et la Relance (`dropHype`, cooldown 50s) — plus
~2 events modaux. Soit ~6 interactions sur 3 minutes ; le reste du temps il regarde des
jauges bouger (`heat`, `vibe`, `crowd`, power, `murStress`) **sans prise dessus**. La sim
est riche en interne ; le joueur n'a pas assez de manettes.

## Objectif

Rendre la nuit **dense, tendue et variée** sans trahir les piliers du PRD : *décisions
discrètes, jamais de fader ni de réflexe, mobile-clean*. Quatre mécaniques indépendantes,
toutes **dans la nuit** (la couche prépa/méta reste volontairement inchangée).

## Décisions de design (verrouillées)

1. **La Montée remplace la Relance** — un seul levier « hype », la jauge à charger, au lieu
   de deux boosts de vibe qui se chevauchent. `dropHype`/`HYPE_COOLDOWN` sont supprimés.
2. **Risque épicé** — tenir une jauge de Montée pleine expose vraiment : un brownout la
   draine fort, une enceinte pétée la reset, et le « drop avorté » dégonfle la foule
   d'autant plus que la jauge était haute.
3. **Modificateurs en surprise** — révélés par une bannière au lancement de la nuit, pas à
   la prépa. Pure variété/ambiance, zéro charge stratégique.

## Architecture

Le moteur reste **séparé** : logique pure et testée dans `src/core/night.ts` (alimentée par
le harness déterministe de `progression.test.ts`), UI fine dans `src/ui/screens.ts`, decks
data-driven (comme `events.ts`), strings dans `src/ui/strings.ts`, câblage dans `main.ts`,
styles dans `style.css`. Chaque mécanique = une **story indépendante**, shippable seule,
`npm run test && npm run build` vert après chacune. Ordre : A → B → C → D.

Un refactor transverse sert B et C : extraire de `resolveEvent` une fonction
`applyEffects(state, night, fx: EventEffects)` réutilisée par les events, les flash-prompts
et (pour le champ `montee`) la Montée. On ajoute `montee?: number` à `EventEffects`.

---

## Story A — La Montée *(remplace la Relance)*

Le cœur. Une jauge de tension qu'on charge en faisant vibrer le floor et qu'on **encaisse
au moment choisi** : drop tôt = petit gain safe, jauge pleine = climax énorme mais exposé.

### Sim (`types.ts`, `night.ts`)

`NightState` : `+ montee: number` (0→1). Retirer `hypeT`. Ajouter `bestDropThisSet: number`
(sert l'objectif « gros drop », reset dans `startSet`).

Constantes (`night.ts`) :

```ts
const MONTEE_RATE = 0.05;                  // charge/s à pleine vibe
const MONTEE_GENRE: Record<GenreId, number> = { hardtek: 1.1, acid: 1.2, dub: 0.8 };
const MONTEE_DECAY = 0.03;                 // /s quand vibe < 0.3
const MONTEE_BROWNOUT_DRAIN = 0.4;         // ×= sur brownout / coupure son
const MONTEE_MIN_DROP = 0.1;               // seuil minimal pour lâcher
```

Dans `tickNight` (phase `playing`) :
- **Charge** : `montee = clamp(montee + dt*MONTEE_RATE*vibe*(brief==='pousser'?1.4:1)*MONTEE_GENRE[genreId], 0, 1)`.
- **Décroissance** : `if (vibe < 0.3) montee = max(0, montee - dt*MONTEE_DECAY)`.
- **Drain épicé** : dans le bloc brownout existant, `montee *= MONTEE_BROWNOUT_DRAIN`, et
  le « drop avorté » ajoute une déflation foule ∝ `montee` d'avant le drain :
  `crowd *= (1 - 0.08*prevMontee)`.
- **Reset épicé** : dans le bloc `mur-blown`, `montee = 0` + même déflation foule.

Nouvelle API (remplace `dropHype`) :

```ts
export function dropMontee(night: NightState): boolean {
  if (night.phase !== 'playing' || night.montee < MONTEE_MIN_DROP) return false;
  const m = night.montee;
  night.vibe  = clamp(night.vibe + 0.10 + 0.25 * m, 0, 1);
  night.crowd = clamp(night.crowd + night.cap * 0.05 * m, 0, night.cap);
  night.heat  = clamp(night.heat + 0.02 + 0.06 * m, 0, 0.99);
  night.bestDropThisSet = Math.max(night.bestDropThisSet, m);
  night.montee = 0;
  return true;
}
```

**Pas de cooldown** : la recharge EST la barrière. Supprimer `HYPE_COOLDOWN`.

### UI (`screens.ts`, `strings.ts`, `main.ts`, `style.css`)

Remplacer le bouton Relance par : une **barre de charge** (largeur = `montee`, glow près du
plein) + un bouton **🔊 LÂCHER** activé dès `montee >= MONTEE_MIN_DROP`. `onHype` → `onDrop`.
Strings : `dropAction: '🔊 LÂCHER'`, `dropToast: '🔊 Le drop fait exploser le champ !'`.

### Audio (`main.ts`)

Passer `montee` aux params de l'`AudioEngine` (un riser/filtre qui monte avec la jauge,
impact au drop). Le moteur réagit déjà à des params — extension minimale, pas d'asset.

### Tests (`live.test.ts`, réécrit)

Charge dans le temps ; `dropMontee` boost vibe+crowd, coûte de la heat, reset à 0 ; refuse
sous le seuil ; un brownout draine la jauge. Le harness `progression.test.ts` reste vert.

---

## Story B — Le floor te parle *(densité live)*

Des bannières **non bloquantes** (la sim continue) entre les events modaux, pour combler les
trous. Tap = saisir l'effet ; ignorer = la bannière expire (effet `lapse` éventuel).

### Refactor préalable

Extraire `applyEffects(state, night, fx)` de `resolveEvent` ; ajouter `montee?: number` à
`EventEffects` (géré dans `applyEffects`).

### Sim (`types.ts`, `prompts.ts`, `night.ts`)

Nouveau `src/core/prompts.ts` :

```ts
export interface FloorPromptDef {
  id: string; icon: string; label: string;
  window: number;          // secondes pour réagir (3–6)
  seize: EventEffects;     // au tap
  lapse?: EventEffects;    // si ignoré (prompts « désamorçage »)
  weight: (ctx: EventContext) => number;
}
export function drawPrompt(ctx, fired, rng): FloorPromptDef | null; // même schéma que drawEvent
```

`NightState` : `+ floorPrompt: { def: FloorPromptDef; expiresAt: number } | null`,
`+ nextPromptAt: number`.

Dans `tickNight` (phase `playing`, **ne change pas la phase**) :
- Expiration : `if (floorPrompt && t > floorPrompt.expiresAt) { applyEffects(lapse); floorPrompt = null; planifier next; }`
- Spawn : `if (!floorPrompt && t >= nextPromptAt && !pendingEvent)` → `drawPrompt`, `expiresAt = t + def.window`, `nextPromptAt = t + PROMPT_SPACING(12) + rng()*6`.
- Quand un event modal s'ouvre, vider `floorPrompt` (évite le doublon visuel).

```ts
export function seizeFloorPrompt(state: GameState, night: NightState): FloorPromptDef | null {
  if (!night.floorPrompt) return null;
  const def = night.floorPrompt.def;
  applyEffects(state, night, def.seize);
  night.floorPrompt = null;
  night.nextPromptAt = night.t + PROMPT_SPACING + night.rng() * 6;
  return def;
}
```

### Pool (~8, data-driven)

`🙌 Rappel` (+montée) · `🚬 Fumée près du groupe` (lapse: mini-brownout / seize: rien de mal)
· `💧 Le pit s'enlise` (seize: −churn ponctuel via `crowdFrac` léger) · `📸 Un type filme`
(seize: `rep` + un peu de `heat`) · `🍾 Bouteille dans le pit` · `🔦 Projecteur qui lâche` …

### UI & tests

Bannière non modale (petite, sans assombrir l'écran), timer qui se vide, tappable —
distincte du modal d'event. `prompts.test.ts` : spawn après l'espacement, expiration après
la fenêtre, seize applique l'effet, ignoré applique `lapse`, aucun spawn en phase `event`.

---

## Story C — Objectifs de set *(tempo / temps perçu)*

Chaque set tire un mini-objectif, évalué à la fin du set, **bonus only (zéro punition)** —
donne une raison de s'investir sur les 90s et raccourcit le temps perçu.

### Sim (`types.ts`, `goals.ts`, `night.ts`)

Nouveau `src/core/goals.ts` :

```ts
export interface SetGoalDef {
  id: string; label: string;
  reward: { rep?: number; cash?: number };
  met: (s: SetStats) => boolean;     // SetStats = accumulateurs du set
  weight: (ctx: EventContext) => number;
}
```

`NightState` : `+ setGoal: SetGoalDef | null`, accumulateurs par set
(`setVibeSum`, `setVibeSamples`, `setBrownouts`, `setCrowdStart`, `bestDropThisSet`),
`+ goalsMet: string[]`. `NightResult` : `+ goalsMet: string[]`.

`startSet` : tire un goal (`weight` selon contexte), reset les accumulateurs
(`setCrowdStart = crowd`, etc.). `tickNight` : accumule la vibe du set, `setBrownouts++` sur
brownout. `endCurrentSet` : évalue `met(stats)` → si ok, `repBonus += reward.rep`,
`bank += reward.cash`, push dans `goalsMet`.

### Pool (échelonné au spot via fractions de `cap`)

« Vibe moyenne > 0.7 » · « Remplir à 80% de la jauge » · « Set propre : zéro brownout » ·
« Lâcher un gros drop (>0.8) » (via `bestDropThisSet`) · « Tenir la heat sous 0.5 ».

### UI & tests

Petit chip « Objectif » dans le HUD avec progression ; recap liste atteints/ratés.
`goals.test.ts` : un set remplissant la condition crédite la récompense et l'enregistre.

---

## Story D — Modificateurs de nuit *(variété, surprise au lancement)*

1–2 modifs passives par nuit, **révélées au lancement**, multipliant les leviers existants.

### Sim (`types.ts`, `modifiers.ts`, `night.ts`)

Nouveau `src/core/modifiers.ts` :

```ts
export interface NightModifierDef {
  id: string; nom: string; desc: string; icon: string;
  arrivalMult?: number; churnMult?: number; heatMult?: number;
  priceMult?: number; retentionBonus?: number; eventDelay?: number;
  weight: (spotTier: number) => number;   // tier-1 ne tire que des modifs douces
}
```

`NightState` : `+ modifiers: NightModifierDef[]`. Tirage **déterministe** dans `createNight`
via un flux RNG dédié (`mulberry32(seed ^ 0x9e3779b9)`) pour **ne pas perturber** le flux des
events. `brouillard` décale `nextEventAt` (`eventDelay`). Appliquer les multiplicateurs
là où les leviers sont lus dans `tickNight` (arrival, leaving/churn, heat, bar drip,
retention).

### Pool

Pluie battante (churn↑, heat↓, arrival↓) · Nuit claire (arrival↑) · Brouillard (events
tardifs, arrival↓) · La famille du son (retention↑, prix libre↑) · Des touristes (arrival↑
mais churn↑/heat↑) · Soir de paie (prix libre↑↑).

**Garde-fou balance** : les modifs sont pondérées par tier — Champ paumé (tier 1) ne tire
que des modifs douces pour que le harness `progression.test.ts` (« une nuit normale ne
bust jamais ») reste vrai. Tester avec une graine fixe.

### UI & tests

Bannière one-shot au début de la nuit + badges discrets dans le HUD ; mention possible au
recap. `modifiers.test.ts` : une graine connue tire les modifs attendues ; un multiplicateur
modifie bien l'arrival/heat sur un tick.

---

## Composition & ordre

| Story | Dépend de | Note |
|---|---|---|
| A — La Montée | — | Le cœur ; remplace Relance, justifie déjà le projet |
| B — Le floor te parle | refactor `applyEffects` | Densité ; les prompts alimentent la Montée |
| C — Objectifs de set | accumulateurs par set | L'objectif « gros drop » lit `bestDropThisSet` (A) |
| D — Modificateurs | — | Indépendant ; pondéré par tier pour la balance |

Les quatre composent par les leviers existants et `applyEffects`. Après chaque story :
`npm run test && npm run build` vert ; le harness déterministe reste la régression-net.

## Hors-scope (suite possible)

- Multiplicateur « chauffe » (combo) — à fusionner dans la Montée plutôt qu'empiler.
- Couche prépa enrichie (plan de jeu par set, synergies matos/DJ).
- Modificateurs connus à la prépa (réintroduirait de la décision prépa, écartée ici).
- Assets audio dédiés au riser de Montée (le param-driven suffit en v1).
