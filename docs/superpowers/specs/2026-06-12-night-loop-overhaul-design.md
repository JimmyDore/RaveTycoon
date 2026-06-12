# Rave Tycoon — Refonte de la boucle de nuit : design

**Status**: Design validé (brainstorming 2026-06-12) — prêt pour un plan d'implémentation
**Auteur**: Jimmy + Claude
**Chantier**: 1/4 (suivi de : économie & contenu, prestige « La Tournée », modificateurs de run)

## Problème

Après la passe « densifier la nuit » (Montée, prompts, objectifs, modificateurs), la nuit
reste **résolue** une fois le pattern compris : on monte la jauge, on lâche le drop, on tape
les prompts. Quatre symptômes remontés en playtest (1h de jeu) :

1. **Trop passif** — entre deux inputs on regarde des jauges.
2. **Les décisions ne comptent pas** — brief/drop/events n'ouvrent jamais de vrai dilemme.
3. **Pas assez de tension** — le bust est binaire, rare, et sans conséquence durable.
4. **Répétitif** — chaque nuit a la même forme, du Champ paumé au Teknival.

## Objectif

Faire de chaque nuit **une partie qui se joue**, pas une simulation qui se regarde — sans
trahir les piliers du PRD : *décisions discrètes (jamais de fader ni de réflexe), mobile-clean,
on entend ses décisions*. Cinq mécaniques, toutes dans la nuit ou à cheval sur plusieurs nuits.

## Décisions de design (verrouillées)

1. **Le brief disparaît, l'intensité le remplace** — `safe/normal/pousser` (figé par set,
   cooldown 18s) devient **4 crans d'intensité** changeables à tout moment :
   `CHILL · GROOVE · PEAK · RINSE`. Ce sont des **boutons tappables**, pas un slider — le
   pilier « décisions discrètes » est respecté : on change de cran ~toutes les 10–20s, pas
   de geste continu, pas de réflexe demandé.
2. **La foule a une attente** — une courbe d'attente visible ; le jeu se joue dans l'écart
   entre ce que tu joues et ce qu'elle attend. La technique du DJ pardonne (tolérance),
   le charisme emmène (plie l'attente vers le cran joué).
3. **Le burnout de foule interdit le spam** — camper PEAK/RINSE sature la foule ; il faut
   sculpter des vagues. Le payoff du drop dépend de la qualité de la vague construite.
4. **Chaque nuit a un arc dramatique** — 4 phases scriptées (ouverture, rush, creux, aube)
   qui modulent arrivées, churn, attente, heat et événements.
5. **La descente est une séquence jouable** — à heat critique : évacuer / négocier / tenir
   le mur, avec des conséquences qui **persistent entre les nuits** (garde à vue, saisie,
   casier).
6. **La variété vient de l'extérieur de la sim** — nuits spéciales proposées à la prépa,
   et arcs de conséquences plantés par les choix d'événements.

## Architecture

Inchangée dans l'esprit : logique pure et testée dans `src/core/` (harness déterministe),
UI fine dans `src/ui/screens.ts` + HUD dans `main.ts`, decks data-driven, strings dans
`src/ui/strings.ts`. Chaque story = shippable seule, `npm run test && npm run build` vert
après chacune. Ordre : **A → B → C → D → E**.

---

## Story A — L'énergie du set *(remplace le brief)*

### Sim (`types.ts`, `night.ts`, `crew.ts`)

`NightState` :
- `- brief: Brief` (supprimé, ainsi que le type `Brief`, `BRIEF_QUALITY/HEAT/POWER`, le
  cooldown de changement de brief)
- `+ intensity: Intensity` (`'chill' | 'groove' | 'peak' | 'rinse'`)
- `+ attente: number` (0–1, recalculée chaque tick)
- `+ burnout: number` (0–1)
- `+ waveScore: number` (moyenne glissante ~20s de « dans la vague », 0–1)

Constantes :

```ts
const INTENSITY_LEVEL:   Record<Intensity, number> = { chill: 0.25, groove: 0.5, peak: 0.75, rinse: 1.0 };
const INTENSITY_QUALITY: Record<Intensity, number> = { chill: 0.92, groove: 1.0, peak: 1.08, rinse: 1.15 };
const INTENSITY_HEAT:    Record<Intensity, number> = { chill: 0.5,  groove: 1.0, peak: 1.6,  rinse: 2.4 };
const INTENSITY_POWER:   Record<Intensity, number> = { chill: 0,    groove: 0.06, peak: 0.16, rinse: 0.3 };
const TOL_BASE = 0.10;          // tolérance de base
const TOL_PER_TECH = 0.03;      // + par point de technique (5 → 0.25)
const CHARISME_PULL = 0.06;     // attraction de l'attente vers le cran joué, par point
const BURNOUT_CHARGE = { peak: 0.02, rinse: 0.04 };   // /s
const BURNOUT_DECAY  = { chill: 0.03, groove: 0.01 }; // /s
const BURNOUT_ATTENTE_MALUS = 0.3;   // l'attente baisse de 0.3×burnout
const BURNOUT_DROP_MALUS = 0.5;      // payoff du drop ×(1 − 0.5×burnout)
const DROP_BURNOUT_RESET = 0.6;      // le drop fait burnout ×= 0.6
const WAVE_WINDOW = 20;              // s de moyenne glissante
```

Chaque tick (phase `playing`) :

1. **Attente brute** : baseline de la phase de nuit (Story B) × profil du genre, − malus
   burnout. Sans Story B, baseline provisoire = montée linéaire 0.35 → 0.8 sur la nuit.
2. **Attente effective** : `attenteEff = attente + (level − attente) × CHARISME_PULL × charisme`
   (le DJ charismatique plie la foule vers ce qu'il joue).
3. **Écart** : `gap = level − attenteEff`, `tol = TOL_BASE + TOL_PER_TECH × technique`.
   - `|gap| ≤ tol` (**dans la vague**) : cible de vibe relevée, charge de Montée ×1.5,
     `waveScore` accumule.
   - `gap < −tol` (**trop mou**) : churn ×(1 + 2×(|gap|−tol)), cible de vibe abaissée,
     gain de buzz de fin de nuit réduit.
   - `gap > tol` (**trop fort**) : heat ×(1 + 2×(gap−tol)) en plus de `INTENSITY_HEAT`,
     stress du mur accéléré, fatigue du DJ ×1.5 sur ces secondes.
4. **Burnout** : charge à PEAK/RINSE, décharge à CHILL/GROOVE (constantes ci-dessus).
5. **Qualité live** : `quality = baseQuality × INTENSITY_QUALITY[intensity]` — la qualité
   de set n'est plus figée au départ du set, le facteur brief devient live.
6. **Power & mur** : `INTENSITY_POWER` remplace `BRIEF_POWER` dans la demande électrique ;
   le stress du mur ne charge qu'à RINSE (et à PEAK si `gap > tol`).

**Drop** : inchangé dans son déclenchement (jauge de Montée ≥ seuil), mais payoff
`× (0.5 + waveScore) × (1 − BURNOUT_DROP_MALUS × burnout)`. Un drop au sommet d'une vraie
vague vaut ~1.5× ; un drop spammé sur foule cramée vaut ~0.4×.

**Fatigue** (`crew.ts`) : `+0.22` par set devient `+0.18 + 0.16 × fracPeakRinse` (fraction
du set passée à PEAK/RINSE, pondérée par le temps). Supprime le bonus forfaitaire `pousser`.

API : `setIntensity(night, i: Intensity): boolean` (refuse hors phase `playing`). Pas de
cooldown : le coût EST dans la sim (burnout, heat, fatigue).

### Migration des systèmes existants

- **Transition de set** : le modal ne choisit plus que le DJ (l'intensité persiste d'un set
  à l'autre, le joueur la pilote en continu).
- **Events/prompts** référencant le brief : « le public en redemande » donne `montee` au
  lieu de « pousser gratuit » ; le contexte `EventContext.brief` devient `intensity`.
- **Objectifs de set** : « gros drop » lit le payoff post-multiplicateurs ; nouveaux
  objectifs Story B/C ; « tenir la heat sous 0.5 » inchangé.
- **Recap/leaderboard** : `bestWaveScore` remplace rien (ajout), le reste inchangé.

### UI (`main.ts`, `style.css`, `strings.ts`)

Barre du bas : **4 boutons-crans** (le cran actif glow), au-dessus une **jauge de vague**
horizontale — la bande de tolérance (position = attente, largeur = tol) et un curseur
(= cran joué). Dans la bande = la jauge s'illumine. Burnout = liseré rouge qui envahit la
jauge. Tout est tap, zéro hover, zéro drag.

### Audio (`main.ts`, moteur existant)

Le cran pilote les couches de synthèse (déjà par-genre) : CHILL = kick+sub, GROOVE = +hats,
PEAK = stack complet, RINSE = stack + drive/filtre ouvert. **On entend son cran** — c'est
l'extension naturelle de « on entend ses décisions ».

### Tests (`energy.test.ts`, harness étendu)

Gap dans/hors tolérance → effets attendus sur vibe/churn/heat ; charisme plie l'attente ;
burnout charge/décharge et plafonne le drop ; fatigue suit `fracPeakRinse` ; l'autoplay du
harness gagne une **politique d'intensité** (suivre l'attente) et `progression.test.ts`
reste vert.

---

## Story B — Phases de nuit scriptées

### Sim (`types.ts`, nouveau `src/core/phases.ts`, `night.ts`)

```ts
export interface NightPhaseDef {
  id: 'ouverture' | 'rush' | 'creux' | 'aube';
  nom: string; icon: string;
  frac: [number, number];            // fenêtre en fraction de la nuit
  attente: [number, number];         // baseline d'attente, interpolée linéairement
  arrivalMult: number; churnMult: number; heatMult: number; barMult: number;
  eventBias?: Record<string, number>; // surpondération d'events par tag
}
```

| Phase | Fenêtre | Attente | Caractère |
|---|---|---|---|
| **Ouverture** | 0–20% | 0.30→0.50 | arrivées ×0.7, churn ×0.6, heat ×0.7, bar ×0.7 |
| **Le rush** | 20–55% | 0.50→0.80 | arrivées ×1.5, churn ×1.0, heat ×1.0, bar ×1.3 |
| **Le creux** | 55–75% | 0.80→0.45 | arrivées ×0.4, churn ×1.6, heat ×1.3, bar ×0.8 |
| **L'aube** | 75–100% | 0.50→0.90 | arrivées ×0.6, churn ×0.7, heat ×1.0, bar ×1.1, **rep ×2** |

- `NightState.nightPhase` recalculée chaque tick depuis `t / duration` ; toast à chaque
  changement de phase (« 🌫 Le creux — la foule fatigue, les bleus rôdent »).
- **Rep ×2 à l'aube** : les gains de rep d'événements, objectifs et drops survenus pendant
  l'aube comptent double ; le « dernier drop » (le plus tardif de l'aube) compte double
  encore — le final est le moment le plus précieux de la nuit.
- Les multiplicateurs composent avec les modificateurs de nuit existants (produit).
- Petits spots = arc compressé (3 min : ouverture de 36s) ; Teknival = arc complet de 10 min.
  Mêmes fractions partout, pas de cas particulier.

### UI

**Timeline** fine en haut du HUD : 4 segments colorés, curseur de progression, icône de
phase courante. Les toasts annoncent les bascules.

### Tests (`phases.test.ts`)

Bornes de fenêtres ; interpolation d'attente ; rep doublée sur un gain en aube ; les
multiplicateurs s'appliquent sur un tick ; harness vert (la politique d'intensité de
l'autoplay suit l'attente phasée).

---

## Story C — La descente jouable

### Sim (`types.ts`, nouveau `src/core/raid.ts`, `night.ts`, `payout.ts`)

Seuils de heat visibles :
- **0.60 — Signes avant-coureurs** : surpondération des prompts « voiture qui passe »,
  « appel voisin » ; sirène lointaine dans le mix.
- **0.85 — « Les bleus arrivent »** : la descente se déclenche (1 fois max par nuit).
  Compte à rebours `15 + 5 × logistiqueTier` secondes (15–30s). La teuf continue
  (non bloquant). Panneau de choix :

| Choix | Effet |
|---|---|
| **ÉVACUER** | Nuit terminée immédiatement : caisse de la nuit conservée, rep ×0.4, buzz ×0.8, pas d'incrément du compteur de bust. La sortie propre. |
| **NÉGOCIER** | Coût `50 + 2×crowd` €. Proba de succès `0.25 + 0.15×logTier + 0.15 si DJ discret aux platines + 0.20 si intensité ≤ GROOVE` (cap 0.9). Succès : heat → 0.45, la nuit continue, 50% de chance de planter l'arc « flic corrompu » (Story E). Échec : bust immédiat (escalade standard). |
| **TENIR LE MUR** | État de siège 45s : si la vibe moyenne tient ≥ 0.65, le heat draine et les bleus se retirent → **mur tenu** : rep +25 (×2 si aube), tag « légende » au recap, Montée pleine offerte. Si la vibe passe > 8s cumulées sous le seuil : **bust aggravé** — une catégorie de matos saisie (−1 tier, jamais le starter), DJ aux platines en **garde à vue 2 nuits**, −50% caisse. |
| *(timer expiré)* | Bust standard — l'indécision coûte. |

### Conséquences persistantes (`GameState`, `payout.ts`, `crew.ts`)

```ts
gardeAVue: Partial<Record<DjId, number>>;  // nuits restantes, décrémente à chaque settle
casier: number;                            // +1 par bust, −1 par nuit sans bust (min 0)
```

- Un DJ en garde à vue est grisé à la prépa (« 🚔 Garde à vue — 2 nuits »), non sélectionnable.
  Le DJ fondateur ne va jamais en garde à vue (no-softlock).
- `casier` ajoute `+0.05 × casier` au heat de départ des spots tier ≥ 4 (les villes te
  connaissent). Visible à la prépa.
- Matos saisi : la catégorie redescend d'un tier, à racheter — réutilise la mécanique de
  saisie existante mais déclenchable par le « mur cassé » dès le premier bust.

### UI

Bandeau descente avec compte à rebours + 3 gros boutons. Pendant le siège : vignette
« TENIR » avec la jauge de vibe contre le seuil, gyrophares sur les bords de l'écran,
sirènes dans le mix. À la prépa : badges garde à vue et casier.

### Tests (`raid.test.ts`)

Déclenchement à 0.85 une seule fois ; chaque issue applique ses effets ; timer expiré =
bust ; garde à vue décrémente et bloque la sélection ; casier monte/descend et module le
heat initial ; le DJ fondateur est insaisissable ; harness : une nuit prudente ne déclenche
jamais la descente sur tier 1–2.

---

## Story D — Nuits spéciales proposées

### Sim (`types.ts`, nouveau `src/core/specials.ts`, `screens.ts`, `payout.ts`)

À la prépa, ~1 nuit sur 3 (`p = 0.35`, dès rep ≥ 12), une **offre** apparaît — acceptable
ou refusable, valable cette nuit seulement :

```ts
export interface SpecialNightDef {
  id: string; nom: string; pitch: string; icon: string;
  constraints: { genreImpose?: GenreId; maxIntensity?: Intensity; spotImpose?: SpotId;
                 crowdCap?: number; noDescente?: boolean };
  rewards: { cashUpfront?: number; repMult?: number; attenteMode?: 'haute' | 'puriste' };
  weight: (state: GameState) => number;
}
```

Pool de lancement (4, data-driven) :

- **🥊 Soundclash** — un crew rival joue en face. Score de vague (`waveScore` moyen) comparé
  phase par phase à un rival simulé (qualité tirée du tier du spot). Victoire ≥ 2 phases
  sur 4 : rep ×1.5 + son headliner rejoint le pool de recrutement avec −30% de cut. Défaite :
  buzz ×0.5.
- **🤫 Teuf privée** — cash d'avance (×3 le potentiel du spot), foule plafonnée à 60%,
  **zéro rep**, contrat : genre imposé + jamais RINSE + pas de descente déclenchée. Contrat
  rompu = remboursement de 60%.
- **🎂 Anniversaire de la scène** — rep ×2 toute la nuit, mais `attenteMode: 'haute'` :
  baseline d'attente +0.15 et tolérance −0.05. La nuit difficile qui paie.
- **🎵 Nuit à thème** — un seul genre (tiré), foule de puristes : tolérance −0.08 mais
  drops +40% et bar ×1.3. Faite pour le DJ du genre.

### UI

Carte d'offre sur l'écran de prépa (au-dessus du choix de spot) : pitch, contraintes,
récompenses, `ACCEPTER / LAISSER`. Si acceptée, les contraintes verrouillent la prépa
(genre/spot imposés grisés) et un badge reste visible dans le HUD de nuit.

### Tests (`specials.test.ts`)

Tirage à graine fixe ; contraintes appliquées (RINSE refusé en teuf privée) ; rupture de
contrat rembourse ; soundclash compare les scores et applique victoire/défaite.

---

## Story E — Arcs de conséquences

### Sim (`types.ts`, nouveau `src/core/arcs.ts`, `events.ts`, `payout.ts`)

```ts
export interface ArcStageDef {
  event: NightEventDef;              // l'event injecté quand l'échéance arrive
  delay: [number, number];           // nuits avant l'échéance (tirage)
}
export interface ArcDef { id: string; stages: ArcStageDef[]; }   // 2–3 temps max

// GameState
pendingArcs: { arcId: string; stage: number; nightsLeft: number; payload?: number }[];
```

- Les **options d'événements** (et la négociation de descente) peuvent planter un arc :
  champ `plantsArc?: { arcId: string; chance: number }` sur `EventOption`.
- À chaque `settleNight`, `nightsLeft--`. À 0, l'event du stage est **prioritaire** sur le
  tirage aléatoire de la prochaine nuit (injecté comme premier event modal).
- Résoudre un stage peut planter le stage suivant ou clore l'arc.

Pool de lancement (3 arcs) :

- **🚔 Le flic corrompu** — planté par une négociation réussie. Stage 1 (2–3 nuits) : il
  revient — payer le double (heat −40% cette nuit) / refuser (heat +0.15 immédiat, arc clos).
  Stage 2 (si payé, 2–3 nuits) : il propose un « forfait » — 800€ pour casier effacé + heat
  de base −20% pendant 5 nuits, ou le dénoncer (rep +20, heat de base +10% pendant 5 nuits).
- **📰 Le journaliste** — planté par le prompt « un type filme » saisi ou un event. Stage 1
  (2 nuits) : l'article sort — buzz ×1.6 mais heat de départ +0.1 sur les 3 prochaines
  nuits (la presse attire tout le monde, y compris les bleus).
- **🚜 Le fermier** — planté par l'event « voisin au portail » résolu à la bière. Stage 1
  (1–2 nuits) : il passe voir — l'inviter (vibe +0.1 ce soir) → stage 2 (3 nuits) : il
  devient allié, **heat de base −20% permanent sur Champ paumé et Forêt**.

L'effet « heat de base pendant N nuits » s'implémente comme un champ générique
`tempEffects: { heatBase?: number; nightsLeft: number }[]` sur `GameState`.

### UI

Les events d'arc sont des events modaux normaux (même UI), avec un marqueur discret « suite ».
Le recap mentionne les arcs avancés (« 📰 L'article est sorti »).

### Tests (`arcs.test.ts`)

Plantage par option ; décompte par settle ; injection prioritaire ; chaînage de stages ;
`tempEffects` expire ; déterminisme à graine fixe.

---

## Composition & ordre

| Story | Dépend de | Note |
|---|---|---|
| A — Énergie du set | — | Le cœur ; supprime le brief, justifie seule le chantier |
| B — Phases de nuit | A (baseline d'attente) | Donne sa forme stratégique à A |
| C — Descente jouable | A (intensité lue par la négo) | La tension + la persistance |
| D — Nuits spéciales | A+B (waveScore, attente) | La variété côté prépa |
| E — Arcs | C (négo plante un arc) | La variété côté conséquences |

Après chaque story : `npm run test && npm run build` vert, harness déterministe vert.
Le PRD a été amendé : §4.1 réécrit avec la Story A (partie 1), §4.3 + décisions 20–22
ajoutés avec les Stories D/E (partie 2). ✅

## Hors-scope (chantiers suivants)

- Rééquilibrage économique global, nouveaux sinks, matos branché → **spec 2**.
- Rival soundsystem persistant (némésis qui progresse) → candidat spec 4 ou v3 ; le
  soundclash de la Story D en est la version légère.
- Prestige, monnaie de légende → **spec 3**. Régions & traits de run → **spec 4**.
