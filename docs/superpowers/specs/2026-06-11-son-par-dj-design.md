# Rave Tycoon — Le son, c'est le DJ : design

**Status**: Design validé (brainstorming 2026-06-11) — prêt pour un plan d'implémentation
**Auteur**: Jimmy + Claude

## Problème

Deux constats de playtest :

1. **Répétitif.** Il n'y a que 3 genres (hardtek/acid/dub), et chaque genre est **une seule
   boucle de 4 mesures** rejouée pendant toute la nuit. Un set de 90s reboucle la même phrase
   de ~5s une quinzaine de fois, et toute la nuit tient sur un seul son.
2. **Pas logique.** Le genre est un choix **global de prépa** (panneau « Le son »), posé avant
   la nuit et figé. Or une nuit enchaîne plusieurs DJs : il serait plus naturel que **le son
   vienne du DJ qui joue**.

## Objectif

Lier le son au DJ. Chaque DJ a un **genre signature** ; quand il prend un set, c'est *son*
son qui tourne. Comme une nuit enchaîne 2 à 6 sets, **la BO change à chaque transition** sans
effort — ça tue la répétition « même son toute la nuit » et ça transforme la composition +
l'ordre du line-up en **pilotage de l'arc sonore** de la nuit (chauffe en dub → monte en acid
→ climax en frenchcore). Ça branche directement sur la Montée (`MONTEE_GENRE`, story A du doc
live-night). On passe de 3 à **8 genres**, un par DJ, variété maximale.

## Décisions de design (verrouillées)

1. **Le son c'est le DJ.** Le genre disparaît de la prépa. Chaque `DjDef` porte un `genre`
   signature unique. `night.genreId` devient **le genre du set en cours**, posé à chaque
   `startSet` depuis le DJ qui joue.
2. **8 genres, un par DJ.** Aucun partage. La palette s'élargit avec la progression : les
   nouveaux DJs ayant des `repReq` élevés, les nuits tier-1 ne voient que hardtek/acid/dub.
3. **Synth distinct d'abord, vrais loops ensuite.** Chaque nouveau genre reçoit un pattern
   synthétisé distinct (déterministe, dans le repo, marche sans aucun asset). Les vrais loops
   se branchent par-dessus via le manifest, en remplacement incrémental.
4. **Affinités supprimées.** Un DJ ne joue que son genre ; le terme `affinities[genreId]` de
   `computeSetQuality` disparaît. La qualité reste portée par `technique × platines × brief ×
   fatigue`. La nuit 1 (Tonton/hardtek, affinité ×1.0) est **inchangée au pixel près**.

## Le mapping 8 genres ↔ DJs

| DJ | Genre | BPM | repReq | Logique |
|---|---|---|---|---|
| Tonton Madère | Hardtek | 170 | 0 | « le son du camion » (inchangé) |
| La Gamine | Acid | 140 | 6 | la 303 (inchangé) |
| Bob Lépine | Dub | 75 | 20 | jamais au-dessus de 90 BPM (inchangé) |
| Kilowatt | Frenchcore | 200 | 55 | « pousse tout dans le rouge », ancien électricien |
| Mémé Acide | Mentale | 180 | 160 | crate-digger oldschool, hardtek mélodique/hypnotique |
| Le Notaire | Techno | 130 | 260 | propre, carré, discret — « costume en semaine » |
| Sirène | Raggatek | 175 | 380 | toasting/voix qui fait danser même les guetteurs |
| Fantôme | Darkpsy | 150 | 500 | hypnotique, insaisissable — « apparaît, disparaît » |

## Stats gameplay par genre (point de départ, à équilibrer)

Le genre porte arrival / churn / heatMult / `MONTEE_GENRE`, **désormais variables par set**
selon qui joue.

| Genre | arrival | churn | heatMult | montée | Profil |
|---|---|---|---|---|---|
| hardtek | 1.0 | 0.010 | 1.0 | 1.1 | fédérateur baseline *(inchangé)* |
| acid | 1.35 | 0.016 | 1.3 | 1.2 | afflue/chauffe vite *(inchangé)* |
| dub | 0.6 | 0.004 | 0.6 | 0.8 | roi de la rétention *(inchangé)* |
| frenchcore | 1.5 | 0.022 | 1.6 | 1.3 | draw max + heat max (zone rouge) |
| mentale | 1.1 | 0.010 | 1.1 | 1.1 | mélodique équilibré |
| techno | 0.9 | 0.008 | 0.8 | 0.9 | banquier discret, peu de heat |
| raggatek | 1.4 | 0.009 | 1.1 | 1.15 | gros draw + bonne rétention |
| darkpsy | 1.0 | 0.006 | 0.9 | 1.0 | transe hypnotique, churn bas |

**Garde-fou balance** : hardtek garde ses valeurs exactes ; les genres « chauds » (frenchcore)
sont gatés derrière un `repReq` élevé, donc absents des nuits tier-1. Le harness
`progression.test.ts` (« une nuit normale ne bust jamais ») reste la régression-net : il doit
rester vert avec une graine fixe après chaque story.

## Architecture

On préserve la séparation existante : logique pure et testée dans `src/core/` (harness
`progression.test.ts`), data-driven (`data.ts`), UI fine dans `src/ui/screens.ts`, strings
dans `src/ui/strings.ts`, audio dans `src/audio/`, câblage dans `main.ts`, styles dans
`style.css`. Chaque story est **shippable seule**, `npm run test && npm run build` vert après
chacune.

### Sites touchés par le genre (inventaire exhaustif)

- `src/core/types.ts` : `GenreId` (3→8), `DjDef.affinities` → `DjDef.genre`, `NightState.genreId`
  (sémantique : genre du set courant), `NightResult.genreId` (retiré).
- `src/core/data.ts` : `GENRES` (8 entrées), `DJS` (chaque DJ : `affinities` → `genre`).
- `src/core/night.ts` : `createNight` (drop param `genreId`), `computeSetQuality` (drop le
  terme affinité), `startSet` (`night.genreId = getDj(djId).genre`), `MONTEE_GENRE` (8 clés).
- `src/core/payout.ts` (l.52, l.121) : `NightResult.genreId` retiré.
- `src/audio/synth.ts` : `BUILDERS` (5 nouveaux builders), styles de lead.
- `src/audio/engine.ts` : `scheduleLeads` (styles par genre), switch de genre par set.
- `src/ui/screens.ts` : suppression panneau « Le son » (l.123-133), cartes DJ → badge
  genre·BPM (l.152), bouton lancer (l.244), recap genres (l.514), picker de transition →
  badge genre·BPM par DJ.
- `src/ui/recap-card.ts` (l.73) : genres dérivés du `lineup`.
- `src/ui/strings.ts` : `chooseGenre` retiré ; libellés genres au besoin.
- `src/main.ts` : `PrepareSelection.genre` retiré, `createNight(...)` sans genre,
  `audio.start` → switch par set dans `onStartSet`.

---

## Story A — Le son, c'est le DJ *(le cœur — répond à elle seule à la demande)*

### Data (`types.ts`, `data.ts`)

- `GenreId = 'hardtek' | 'acid' | 'dub' | 'frenchcore' | 'mentale' | 'techno' | 'raggatek' | 'darkpsy'`.
- `GENRES` : 8 entrées (table de stats ci-dessus). Les 3 existantes gardent leurs valeurs.
- `DjDef` : retirer `affinities: Record<GenreId, number>`, ajouter `genre: GenreId`.
- `DJS` : chaque DJ reçoit son `genre` (mapping ci-dessus).

### Sim (`night.ts`)

- `createNight(state, spotId, presentDjs, seed)` : **plus de param `genreId`**. Initialiser
  `night.genreId` au genre du premier DJ présent (`getDj(presentDjs[0]).genre`) — sert d'abord
  la phase `transition` avant le premier set, puis chaque `startSet` le réécrit.
- `startSet` : `night.genreId = getDj(djId).genre` **avant** `computeSetQuality`.
- `computeSetQuality` : retirer `genreAffinity` du produit. Tonton/hardtek (×1.0 avant) est
  inchangé. **Note balance** : les DJs qui avaient une affinité signature > 1.0 (Gamine,
  Bob, Kilowatt, Mémé, Sirène à ~1.2 ; Fantôme 1.1) perdent ce bonus de maîtrise — flatten
  assumé, à retuner via `technique`/stats de genre si la progression en souffre. Ces DJs
  étant gatés par `repReq`, le harness tier-1 n'est pas concerné.
- `MONTEE_GENRE` : 8 clés (table). `tickNight` lit déjà `MONTEE_GENRE[night.genreId]` et
  `getGenre(night.genreId)` → fonctionnent tels quels, reflètent maintenant le genre courant.

### Audio — switch par set (`main.ts`, `engine.ts`, `synth.ts`)

- `onStartSet(djId, brief)` : après `startSet`, déclencher le moteur sur `getDj(djId).genre`.
  Story A : réutiliser `engine.start(genreId)` (stop+load+start ; bref gap acceptable, raffiné
  en story B).
- `synth.ts` : ajouter 5 `BUILDERS` (frenchcore, mentale, techno, raggatek, darkpsy) — patterns
  distincts (kick/sub/lead/hats) sur la grille existante. Chacun doit sonner clairement
  différent (BPM + signature rythmique + ligne de lead).
- `engine.ts scheduleLeads` : aujourd'hui un `if` sur `bpm` (140 acid, 75 dub, else hardtek).
  Le remplacer par un style de lead **par genre** (303 résonante, stabs détunés, skank, etc.)
  pour que chaque nouveau genre ait son timbre.

### UI (`screens.ts`, `strings.ts`, `main.ts`)

- **Prépa** : supprimer le bloc « Le son » (h2 `chooseGenre` + boucle `GENRES`). Les cartes DJ
  remplacent les étoiles d'affinité par un **badge `genre · BPM`** (via `getGenre(def.genre)`).
- **Transition de set** : chaque DJ proposé affiche son **badge `genre · BPM`** → c'est le levier
  d'arc sonore.
- **Bouton lancer** : « ▶ Lancer — `<spot>` » (sans `/ genre`).
- `PrepareSelection` : retirer `genre`. `main.ts` : `createNight` sans genre ;
  `selection.genre` supprimé.
- `strings.ts` : retirer `chooseGenre`. Ajouter d'éventuels libellés (noms de genre déjà dans
  `GenreDef.nom`).

### Payout & recap (`payout.ts`, `screens.ts`, `recap-card.ts`, `types.ts`)

- `NightResult` : retirer `genreId`. Le `lineup: SetRecord[]` suffit (chaque set → DJ → genre).
- Recap (`screens.ts` l.514) et carte de partage (`recap-card.ts` l.73) : afficher les **genres
  joués**, dérivés de `result.lineup` (dédupliqués, dans l'ordre), au lieu d'un genre unique.

### Tests

- `progression.test.ts` (harness no-bust) : adapter la signature `createNight` ; **rester vert**
  avec graine fixe.
- `live.test.ts` / autres : adapter aux nouvelles signatures.
- Nouveau cas : `startSet` pose bien `night.genreId` au genre du DJ ; deux DJs différents sur
  deux sets donnent deux `genreId` différents.

---

## Story B — Polish audio : transitions douces

Au changement de set, éviter la coupure/rechargement brut de `engine.start`.

- **Cache des buffers décodés par `genreId`** dans le moteur (un DJ qui rejoue, ou un retour au
  même genre, ne re-fetch/-decode pas).
- **Crossfade** : `switchTo(genreId)` fond le master sur ~0.3–0.4s en échangeant les sources de
  stems, au lieu d'un stop sec. La phase `transition` (entre sets) peut couper proprement, le
  démarrage du set suivant fond en entrée.
- Tests : le cache renvoie le même buffer pour un genre déjà chargé ; pas de régression du
  `beatPhase` après switch.

## Story C — Vrais packs de loops pour les nouveaux genres

Remplacement incrémental du synth par de vrais stems, là où je trouve des loops corrects.

- Pour chaque genre sourcé : déposer les mp3 dans `assets-src/audio-src/<genre>/`, étendre
  `assets-src/audio-src/build-stems.sh` (mêmes conventions ffmpeg : loudnorm, trim exact sur le
  BPM, seam fade, encode libopus), produire les 4 stems `.ogg` dans `public/audio/`.
- Ajouter l'entrée du genre dans `public/audio/manifest.json`. Le moteur charge le vrai pack
  quand présent, **retombe sur le synth** sinon (déjà géré par `loadRealStems` → fallback).
- `docs/audio-credits.md` : créditer les sources.
- Aucune dépendance dure : un genre sans pack reste jouable en synth.

---

## Composition & ordre

| Story | Dépend de | Note |
|---|---|---|
| A — Le son c'est le DJ | — | Le cœur ; livre la demande à elle seule (synth distinct) |
| B — Polish audio | A | Crossfade + cache au switch de set |
| C — Vrais loops | A | Incrémental, genre par genre, fallback synth garanti |

`npm run test && npm run build` vert après chaque story ; le harness déterministe
`progression.test.ts` reste la régression-net.

## Hors-scope (suite possible)

- DJ pouvant jouer un genre hors signature (réintroduirait les affinités — écarté : « un son
  par DJ »).
- Variation **intra-set** poussée (sections A/B, fills, leads alternés au sein d'un même set) —
  les boucles plus longues peuvent venir avec les vrais loops (story C) sans nouveau système.
- Asset audio dédié au riser de Montée (le param-driven du doc live-night suffit).
- Re-choix du genre à la prépa (écarté : le son suit le DJ).
