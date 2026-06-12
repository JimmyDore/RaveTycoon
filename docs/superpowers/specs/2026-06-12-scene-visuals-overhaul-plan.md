# Rave Tycoon — Refonte du rendu de scène (in-game) : plan d'implémentation

**Status**: ✅ Implémenté (2026-06-12) — phases 0–4 livrées en 7 commits (a63c610…ff732cc),
vérifiées par gates indépendants + review adversariale 4 lentilles + QA visuelle headless
**Auteur**: Jimmy + Claude
**Périmètre**: uniquement la **scène de jeu** (`src/render/*`), pas les menus.
**Pilier directeur**: on garde le style pixel-art LimeZu tel quel. On ne dessine quasi rien à la
main — on **réutilise et on extrait** ce qui est déjà acheté dans les packs.

---

## 1. Problème (constaté en jeu)

Dogfood d'une nuit complète au *Champ paumé* (prép → lancement → set → intensité poussée) :

1. **La foule est clairsemée et éparpillée.** Même quand les teufeurs arrivent, ils se diluent
   sur un grand champ d'herbe avec beaucoup de vide. Le dancefloor lit « quelques points sur une
   pelouse », pas un pit.
2. **Seuls 2 achats sur 5 se voient.** `mur` (les stacks grandissent) et `lumieres` (faisceaux +
   strobe). `platines`, `groupe`, `logistique` sont **invisibles** à l'écran.
3. **La nuit est atmosphérique mais figée.** Pas de fumée, pas de machines à laser, aucun élément
   de scène animé — alors que ces assets sont **déjà extraits** dans `public/assets/animated/` et
   **jamais utilisés**.
4. **Le décor est mince et collé aux bords.** Arbres/campers longent les bordures ; le centre est
   de la terre tuilée vide.

Le style lui-même est bon. Le sujet, c'est **densité, réactivité, et exploiter ce qu'on a déjà payé**.

## 2. Objectif

- **Chaque euro dépensé change l'écran.** Les 5 catégories de matos ont une signature visuelle qui
  scale avec le tier ET la voie (A/B).
- **Le dancefloor ressemble à une teuf** : foule dense vers la scène, un pit au pied du barrièrage.
- **La scène vit** : fumée, lasers, spots animés, qui réagissent à la vibe / au drop.
- **Les spots ont une identité** : un teknival ne ressemble pas à un château.
- **Zéro régression de perf mobile** (cap sprites existant respecté).

## 3. Principes

1. **Réutiliser > extraire > teinter > dessiner.** Dans cet ordre. Le pack couvre ~tout.
2. **Le pixel reste net.** Tout passe par le buffer 480×270 (`SCENE_W`/`SCENE_H`) puis upscale
   `image-rendering: pixelated`. Aucun asset n'est rendu en sous-pixel.
3. **Le moteur reste en couches.** On étend `SceneRenderer`, on ne le réécrit pas.
4. **Tout ce qui bouge est piloté par le temps de jeu** (`timeMs`) et les jauges de nuit (`vibe`,
   `montee`, `beatPhase`, `heat`, `progress`) — pas d'état nouveau dans le moteur de simu.
5. **Dégradation gracieuse.** Si un asset manque (`bank.props[x]` absent), on retombe sur le rendu
   actuel — comme le fait déjà `drawStage` avec ses fallbacks canvas.

---

## 4. État actuel du moteur (rappel ancré)

`src/render/scene.ts` — buffer 480×270, dessiné en couches dans `render()` (`scene.ts:206`) :

```
drawTerrain → drawProps → drawStage → ravers.draw → drawDarkness → drawLights → drawGyro → blit
```

- **Terrain** : tuiles 16×16 répétées, cache par spot (`drawTerrain`, `scene.ts:219`).
- **Props** : table `RECIPES` par spot, placements statiques (`scene.ts:45`, `drawProps:254`).
- **Stage** (`drawStage`, `scene.ts:261`) : deck (`stage_deck`), truss (`stage_big` splicé en 2),
  mâts spots (`stage_spot_left/right`), **mur de son** = stacks de `speaker_big` dont le nombre de
  colonnes/rangées scale sur `gear.mur` (`scene.ts:293-312`), le DJ (`drawRaverFrame`), la régie
  (`dj_set`), les LEDs du mixer.
- **Foule** (`src/render/ravers.ts`) : sprites LimeZu, danse beat-synced (`lift`/`idle`/`walk`),
  `danceSpot()` cluster vers la scène (`ravers.ts:62`), points de densité au-delà du cap
  (`draw():154`). Cap perf : `deviceSpriteCap()` 120 mobile / 300 desktop.
- **Obscurité** (`drawDarkness`, `scene.ts:347`) : voile sombre + pools de lumière percés
  (scène + feux du `RECIPES.fires`), teinte chaude, fondu à l'aube.
- **Lumières** (`drawLights`, `scene.ts:403`) : faisceaux `hsla` en `lighter` + strobe, scale sur
  `gear.lumieres`. **100 % canvas, aucun sprite.**
- **Gyro** police (`drawGyro`, `scene.ts:428`) sur bust / heat haute.

**Manques structurels :**
- Pas de helper d'**animation de prop** (seuls les personnages s'animent, `drawRaverFrame`,
  `sprites.ts:82`). Les sheets animés (`fog`, `laser`, `spotlight`) ne peuvent pas être joués.
- `SceneParams` (`scene.ts:11`) ne transporte ni `gearBranch`, ni `montee`, ni `murBlown`.
  Pour des visuels branche-spécifiques et réactifs au drop, il faut les passer.
- `RECIPES` n'a qu'une couche de props (tout derrière la foule) — pas de premier plan.

## 5. Le manque buy→visuel

| Catégorie | Effet sim (`data.ts`) | À l'écran aujourd'hui | Signature visuelle cible |
|---|---|---|---|
| **platines** | qualité de set | rien | régie qui monte en gamme par tier ; voie B *showmanship* → **DJ animé** (`Beach_Concert_DJ`) + spots latéraux modulaires |
| **mur** | cap foule | stacks grandissent ✅ | enceintes **câblées** + caissons qui élargissent le mur ; voie B *line array* → **line-array suspendu** au truss au lieu d'empiler |
| **groupe** | power / brownout | rien | **groupe électrogène / turbine** à côté de la scène ; bas tier = vacille + fumée au brownout (`soundCut`) |
| **lumieres** | vibe | faisceaux + strobe ✅ | **machines à laser + spots + machine à fumée** réels (sprites) ; voie A *hypnose* = balayages lents, voie B *strobe* = white-out |
| **logistique** | heat / négo | rien | **guetteurs** au périmètre + barrières + le **convoi** ; présence qui grandit par tier |

> `mur` et `lumieres` ont déjà une base : on l'enrichit, on ne la remplace pas. Les 3 autres
> partent de zéro et c'est là que l'effet « mes achats se voient » sera le plus fort.

---

## 6. Stratégie ressources (réponse à « recréer ou réutiliser »)

**Conclusion : ne rien dessiner à la main, ou presque.** Les packs contiennent une sous-thématique
**« Beach Concert »** faite exactement pour ça, plus un **kit de scène modulaire**. Le pipeline
(`tools/build-assets.mjs`) n'en extrait qu'une fraction.

### 6.1 Déjà extrait, jamais branché (gains gratuits)
Dans `public/assets/animated/` et `props/`, présents mais non référencés par le moteur :
`fog_loop`, `laser_machine`, `laser_machine_2`, `spotlight`, `speaker_small`, `stage_small`,
`police_spot`.

### 6.2 Dans le pack, à extraire (étendre `PROPS`/`ANIMATED` dans `build-assets.mjs`)
Racine : `THEMES = assets-src/modernexteriors/Modern_Exteriors_16x16/ME_Theme_Sorter_16x16`
Animés : `ANIM = assets-src/modernexteriors/Modern_Exteriors_16x16/Animated_16x16/Animated_sheets_16x16`

**Concert / scène animée** (`ANIM/`) :
- `Beach_Concert_DJ_16x16.png` — DJ **animé** (remplace le perso statique en voie B)
- `Beach_Concert_Singer_1/2/3_16x16.png` — performers sur scène
- `Beach_Stage_Fog_Machine_Turn_On / _Loop / _Turn_Off_16x16.png` — fumée à états
- `Beach_Stage_Fog_Machine_Fog_Only_{Loop,Turn_On,Turn_Off}_16x16.png` — fumée détourée
- `Beach_Concert_Laser_Machine_White_Light_1/2_16x16.png` + `Beach_Stage_Laser_Machine_1/2_16x16.png`
- `Spotlight_1_Light_16x16.png`, `Spotlight_1_Head_Only_Light_16x16.png` — spots animés avec cône

**Scène modulaire** (`THEMES/21_Beach_Singles_16x16/`) — pour une scène qui **grandit avec le spot** :
- `…_Stage_Structure_Left / _Middle_Modular_1/2 / _Right.png`
- `…_Left_Side_Stage_1 / _Right_Side_Stage_1.png`
- `…_Stage_Stairs_Up/Down/Left/Right.png`
- `…_Stage_Structure_Spotlight_Modular_Left_1/2 / _Right_1/2.png` (2 frames → clignotables)
- `…_Big_Loudspeaker_1_Cable / _2_Cable_Sand.png` — enceintes câblées (mur « vrai rig »)

**Barrièrage de front de scène** (`THEMES/21_Beach_Singles_16x16/`) :
- `…_Stage_Barrier_1/2/3.png`, `…_Stage_Lateral_Barrier_1/2/3.png` — le pit pousse contre

**Décor festival** (divers thèmes) :
- Groupe électrogène : `THEMES/24_Additional_Houses_Singles_16x16/24_Additional_Houses_Post_Apocalyptic_House_Generator_1_16x16.png`
- Lampadaires : `THEMES/3_City_Props_Singles_16x16/…_Street_Lamp_4/5.png`
- Lanternes camping : `THEMES/11_Camping_Singles_16x16/…_Lantern_1/3.png`
- Food : `THEMES/10_Vehicles_Singles_16x16/…_Street_Food_Cart_1.png`, `…_Street_Food_Chair_1.png`
- Toilettes : `THEMES/8_Worksite_Singles_16x16/…_Portable_Toilet_1/3.png`
- Stands : `THEMES/13_School_Singles_16x16/…_Stands_1/2.png`
- Drapeaux : `THEMES/21_Beach_Singles_16x16/…_Sand_Castle_{Red,Blue}_Flag_Vers_1.png`
- Pergola (poteaux à guirlandes) : `THEMES/17_Garden_Singles_16x16/…_Pergola_*`

### 6.3 Teinter (multiplier la variété de foule à peu de frais)
Le pack ne ships que **20 premade characters**. Au lieu du character-generator (gros chantier),
ajouter une passe **hue-shift** dans `build-assets.mjs` : 20 sheets → 60+ variantes colorées
(vestes/cheveux décalés). Cheap, et la foule cesse d'être 20 clones.

### 6.4 Ce qui pourrait demander un vrai dessin (à éviter si possible)
- Guirlandes lumineuses « string lights » : pas de sprite dédié net → **composer** à partir de
  petits points lumineux dessinés en canvas entre deux poteaux de pergola. (Pas de pixel-art à la main.)

---

## 7. Plan par phases

> Chaque phase est livrable seule et testable en jeu. Ordre conçu pour que l'effet « waouh » arrive
> vite (Phases 0→1→2), la richesse ensuite (3→4).

### Phase 0 — Fondations (débloque tout le reste)

**Livrables**
1. **Helper d'animation de prop** dans `src/render/sprites.ts` :
   - Type `AnimatedSheet { img, frameW, frameH, frames, fps }` + un registre `bank.animated`.
   - `drawAnimatedFrame(ctx, sheet, x, y, timeMs, {loop, startedAt})` qui calcule l'index frame
     depuis `timeMs`. Modèle : `drawRaverFrame` (`sprites.ts:82`) mais piloté par le temps.
   - Gérer les sheets **à états** (fumée : on / loop / off) via un petit FSM côté `SceneRenderer`.
2. **Sonde de géométrie des sheets animés** (les dimensions ne donnent pas le frame size seul) :
   - `fog_loop` 576×96, `laser_machine` 2560×144, `spotlight` 384×48 — écrire un mini-script de
     probe (comme le commentaire `build-assets.mjs:18` l'a fait pour les ravers) et **figer
     frameW/frameH/frames par sheet** dans un manifest `public/assets/animated/manifest.json`.
3. **Pipeline étendu** (`tools/build-assets.mjs`) :
   - Ajouter toutes les entrées 6.2 aux maps `PROPS`/`ANIMATED` + une fonction `buildAnimatedMeta()`
     qui écrit le manifest des frames.
   - Ajouter `buildTintedCharacters()` (passe hue-shift, 6.3) → étend `ravers.png` ou produit
     `ravers_tints.png` + met à jour `ravers.json` (`characters` passe de 20 à N).
4. **Élargir `SceneParams`** (`scene.ts:11`) : ajouter `gearBranch: Partial<Record<GearCategory,'A'|'B'>>`,
   `montee: number`, `murBlown: boolean`. Les câbler dans `main.ts:208` (déjà dispo sur `state`/`night`).

**Fichiers** : `src/render/sprites.ts`, `src/render/scene.ts` (interface), `src/main.ts` (params),
`tools/build-assets.mjs`, nouveau `tools/probe-animated.mjs`.

**Critères d'acceptation**
- `npm run assets` régénère tout sans `MISSING`, écrit le manifest animé + les teintes.
- Une machine à fumée de test s'anime à l'écran en boucle, nette, au bon endroit.
- `npm test` vert (ajouter un test de chargement du manifest, cf. `audio/manifest.test.ts`).

---

### Phase 1 — Chaque achat se voit (impact/effort maximal)

**Livrables** — dans `drawStage` (`scene.ts:261`), mapper tier+branche → visuel :

1. **`lumieres` → vrai light-show** (le plus spectaculaire) :
   - Tier ≥ 1 : poser `spotlight` animés sur le truss ; tier ≥ 2 : `laser_machine` aux extrémités.
   - **Machine à fumée** (`fog`) au pied de scène, états on/off pilotés par `soundCut` et par les
     passages PEAK/RINSE (`night.intensity` via energy déjà calculé).
   - Garder les faisceaux canvas existants **par-dessus** les sprites (ils donnent la couleur).
   - **Voie A (hypnose)** : balayages lents, fumée dense, fondu doux. **Voie B (strobe)** : bursts
     blancs synchronisés `beatPhase`, lasers nerveux. Lire `gearBranch.lumieres`.
   - Le **drop** (`montee` qui s'encaisse) déclenche un flash laser + bouffée de fumée.

2. **`groupe` → groupe électrogène visible** :
   - Prop `generator` posé près de la régie, sprite/échelle qui monte par tier.
   - Sur `soundCut`/brownout : vacillement + petite fumée (réutilise le helper fog détouré).
   - Voie A *silencieux* : compact, peu de fumée. Voie B *monstre* : turbine, plus imposant.

3. **`platines` → régie + DJ qui montent en gamme** :
   - Tier 0–2 : `dj_set` actuel. Tier 3+ voie A : régie « chirurgicale » (variante câblée/teintée).
   - Voie B *showmanship* : remplacer le perso DJ statique par **`Beach_Concert_DJ` animé**, +
     spots latéraux modulaires qui clignotent (`Stage_Structure_Spotlight_Modular_*`, 2 frames).

4. **`mur` → enrichir l'existant** :
   - Tier bas : enceintes **câblées** (`Big_Loudspeaker_*_Cable`). Voie A *infrabasses* : caissons
     qui élargissent la base. Voie B *line array* : colonne **suspendue au truss** plutôt qu'empilée.
   - `murBlown` : un stack penché/éteint + étincelle.

5. **`logistique` → présence au périmètre** :
   - Tier ≥ 1 : 1–2 **guetteurs** (sprites perso) postés en lisière, scalant avec le tier.
   - Tier ≥ 2 : barrières (`barrier`/`Stage_Lateral_Barrier`). Voie B *mobilité* : le convoi
     (`camper`) prêt à partir, moteur qui fume.

**Fichiers** : `src/render/scene.ts` (gros de la phase), `src/render/sprites.ts` (noms de props),
éventuellement un module `src/render/rig.ts` pour isoler la logique « tier/branche → placements ».

**Critères d'acceptation**
- Acheter chaque catégorie change visiblement la scène (test manuel via 5 paliers).
- Voie A vs B donne deux scènes distinctes pour `lumieres`, `mur`, `platines`.
- Drop visible : un RINSE + LÂCHER produit un pic visuel net.
- Perf : 60 fps desktop, pas de chute sous le cap mobile (profiler rapide).

---

### Phase 2 — Une vraie foule (`src/render/ravers.ts`)

**Livrables**
1. **Densifier vers la scène** : resserrer `danceSpot()` (`ravers.ts:62`) — distribution plus
   piquée vers le haut-centre, et un **pit** dense collé au barrièrage de front de scène (zone
   `y` juste sous `STAGE_BOTTOM`).
2. **Foule en couches de profondeur** : tri `y` déjà fait (`draw():169`) — ok ; ajouter une légère
   variation d'échelle (1px) par rangée pour la profondeur.
3. **Points de densité plus crédibles** au-delà du cap (`draw():154`) : packer plus dense, faire
   **pulser** les points sur `beatPhase`, teinter selon la `vibe`.
4. **Plus de variété** : tirer `character` parmi les N teintes de Phase 0 (au lieu de `% 20`,
   `ravers.ts:94`). Quelques ravers « lift » bras en l'air en continu près du pit quand `vibe` haute.
5. **Réactions** : sur drop (`montee` encaissée) → vague de « lift » synchronisée ; sur `soundCut`
   → la foule retombe en `idle`.

**Critères d'acceptation**
- À cap égal, la scène lit « pit bondé » et non « points sur pelouse ».
- Le beat se voit dans la foule (hop + pulse des points).
- Aucune régression perf (même cap, même nombre de draws).

---

### Phase 3 — Scènes & décor (`RECIPES` dans `scene.ts:45`)

**Livrables**
1. **Couche premier plan** : étendre `PropPlacement` avec `layer: 'back'|'front'` ; dessiner les
   `front` **après** la foule (silhouettes de teufeurs/poteaux qui cadrent la scène).
2. **Remplir le vide** par spot avec le décor festival (6.2) : food cart, toilettes, lampadaires,
   lanternes, stands, drapeaux, pergola — chacun cohérent avec le lieu.
3. **Guirlandes lumineuses** : tendre des points lumineux canvas entre poteaux de pergola
   (composition, pas d'asset), qui scintillent la nuit et s'éteignent à l'aube.
4. **Identité par spot** :
   - `teknival` : murs de `speaker_medium` à perte de vue, multi-feux, tentes denses.
   - `chateau` : le `bunker` éclairé, ambiance « squat chic ».
   - `tunnel`/`friche` : industriel, néons, scrap.
   - `plage`/`champ`/`foret` : nature, lanternes, feux.
5. **Scène modulaire qui scale** : assembler une scène plus large à partir des pièces modulaires
   (6.2) pour les gros spots (`SpotDef.tier`/`cap`), au lieu du `stage_deck` unique.

**Fichiers** : `src/render/scene.ts` (RECIPES + draw front), `src/render/sprites.ts` (noms).

**Critères d'acceptation**
- Chaque spot a une silhouette reconnaissable au premier coup d'œil.
- Plus de grandes zones de terrain nu au centre.
- La profondeur (premier plan) se lit.

---

### Phase 4 — Atmosphère & polish

**Livrables**
1. **Fumée au sol** qui stagne au pied de scène, densité ∝ `vibe`/tier `lumieres`.
2. **Cônes de spot** réactifs au beat (les spots balaient, s'intensifient au PEAK/RINSE).
3. **Personnalités lumineuses** finalisées (hypnose vs strobe) + interaction avec le fondu d'aube
   (`drawDawnTint`, `scene.ts:392`) : les lasers pâlissent quand le soleil monte.
4. **Détails réactifs** : LEDs régie déjà là (`scene.ts:338`) → étendre au mur/groupe ; étincelles
   sur `murBlown` ; gyrophare police (`drawGyro`) enrichi par les vrais `police_spot`.

**Critères d'acceptation**
- Une montée→drop se ressent : fumée + lasers + foule + flash, tout converge.
- L'aube reste belle avec les nouveaux sprites (pas de laser « plein jour »).

---

## 8. Risques & inconnues

1. **Géométrie des sheets animés** : frameW/H/count non garantis par les dimensions seules →
   **bloquant Phase 0**, traité par le script de probe + manifest figé.
2. **Perf** : fumée/lasers en `lighter` + plus de props peuvent coûter. Mitigations : pré-rendre
   les sprites animés une fois, plafonner les overlays par `deviceSpriteCap`-like, garder le cache
   terrain. Profiler après Phase 1 et Phase 4.
3. **Licence assets** : packs LimeZu non redistribuables, déjà gitignored (`build-assets.mjs:1-4`).
   On reste sur le même schéma : sources hors git, `public/assets/` régénéré. **Rien de nouveau à
   committer côté binaire.**
4. **Cohérence d'échelle** : certains sheets « Concert » sont plus grands que 16×16 (DJ, lasers) →
   vérifier l'alignement sur le deck (le truss est déjà splicé manuellement, `scene.ts:282`).
5. **Variété de foule via teinte** : un hue-shift naïf peut salir la peau/visages. Mitigation :
   teinter par **plage de couleur** (vêtements/cheveux) plutôt que global, ou accepter 3–4 teintes
   sûres si le masquage est trop coûteux.
6. **`drawStage` grossit** : déjà ~85 lignes. Extraire la logique tier/branche→placements dans
   `src/render/rig.ts` pour rester lisible et testable.

## 9. Séquencement recommandé

**0 → 1 → 2** d'abord : c'est là que la différence se sent le plus vite (chaque achat change
l'écran, la foule devient une foule). **3 → 4** ensuite pour la richesse et l'âme.

Découpage possible en chantiers commit-par-commit (style du repo, cf. historique `feat(core/ui)`):
- `feat(render): helper d'animation de prop + pipeline assets étendu` (Phase 0)
- `feat(render): le light-show réel — lasers, fumée, spots (lumières)` (Phase 1.1)
- `feat(render): groupe électrogène, régie & DJ, mur câblé, guetteurs` (Phase 1.2–1.5)
- `feat(render): un vrai pit — densité, beat, variété de foule` (Phase 2)
- `feat(render): décor festival & identité par spot` (Phase 3)
- `feat(render): atmosphère — fumée au sol, cônes réactifs, aube` (Phase 4)

## 10. Première action concrète

Phase 0, étape 2+3 : écrire `tools/probe-animated.mjs`, figer le manifest des frames animés, et
étendre `build-assets.mjs` (maps `PROPS`/`ANIMATED` + `buildAnimatedMeta` + `buildTintedCharacters`).
Sans ça, rien d'animé ne peut être branché proprement. Tout le reste en découle.
