# Rave Tycoon — Onboarding « Première teuf » : design

**Status**: Design validé (brainstorming 2026-06-15) — prêt pour le plan d'implémentation
**Auteur**: Jimmy + Claude
**Cible**: nouveau joueur qui reçoit l'URL, mobile-first

## Problème

Browse complet de la prod (`ravetycoon.jimmydore.fr`, mobile + desktop, prépa + nuit live)
le 2026-06-15. Quatre frictions vérifiées pour un joueur qui découvre le jeu :

1. **La prépa est un marathon de scroll.** Sur mobile, le conteneur `.screen-prepare`
   fait **3423 px = 4,1 écrans** avant d'atteindre `▶ Lancer la teuf`, tout en bas. Pour
   lancer une partie il faut scroller : 9 spots → frais de nuit → crew → 5 catégories de
   matos → *puis* le bouton.
2. **Mur de contenu verrouillé.** Partie neuve : **8 spots sur 9 verrouillés**, plusieurs
   DJs verrouillés, et **les 5 items de matos désactivés** (on démarre à 0 €). Ça se lit
   comme « cassé », pas comme « progression ».
3. **Aucune explication, nulle part.** Le seul `firstTimeHint` existant est rendu *sous le
   footer* (`screens.ts:436`, condition `state.nights === 0`) — donc sous 4 écrans de
   contenu : personne ne le voit. Toutes les vraies explications (`barStockHint`,
   `cautionHint`, `intensiteHints`, etc.) vivent dans **9 tooltips `title=` desktop-only**,
   invisibles au tactile — alors que le README cible le mobile en premier.
4. **La nuit live n'est pas légendée pour un débutant.** Les jauges (👮 Les bleus / 🔥
   ambiance / 🌊 la vague) ont leurs labels icônes, mais l'objectif (tenir jusqu'au soleil,
   garder la chaleur sous la barre) et les contrôles (Chill/Groove/Peak/Rinse, LÂCHER) ne
   sont jamais expliqués.

Le reste est bon : la nuit live est superbe (vraie scène pixel-art, foule dansante, DJ sur
scène). Le manque est purement **pédagogie + vitesse d'entrée**.

## Objectif

Faire entrer un joueur froid **dans une nuit qui tourne en quelques secondes**, et garantir
qu'il comprenne la prépa *et* la nuit. Garder les vétérans rapides. Mobile-first. Tout le
texte en argot free-party maison (cohérent avec `strings.ts`).

Décisions de cadrage (validées en brainstorming) :
- **Layout prépa** : onglets + bouton lancer persistant.
- **Contenu verrouillé** : caché derrière un teaser compact dépliable.
- **Pédagogie** : modale « Comment jouer » réouvrable + coachmarks guidés.
- **Ampleur** : refonte onboarding complète (prépa + modale + coachmarks + légendes nuit +
  hints tactiles).

## Persistance — clé dédiée, zéro migration de save

Nouvelle clé `localStorage` **séparée** : `rave-tycoon-onboarding`
```ts
{ v: 1, helpSeen: boolean, prepCoachDone: boolean, nightCoachDone: boolean }
```
Choix délibéré pour **ne pas toucher `SAVE_VERSION`** (actuellement 3, avec un
`isValidState` strict sur `version === SAVE_VERSION` dans `save.ts`) : aucune migration,
aucun risque sur les saves existantes.

- « Nouvelle partie » **ne réinitialise pas** l'onboarding (le joueur sait déjà jouer) ; la
  modale `[?]` reste réouvrable à la place.
- Module dédié pour l'accès (lecture/écriture/défaut), testable en isolation.

## Composant 1 — Prépa : onglets + lancer persistant + verrouillé caché

`.prepare-grid` garde ses **3 panneaux** (`SPOT`, `CREW`, `MATOS`). Présentation responsive,
**un seul chemin de rendu** :

- **Tous les panneaux sont toujours rendus.** Le CSS décide :
  - **Desktop (large)** : grille 3 colonnes inchangée, barre d'onglets masquée. (Le desktop
    n'a jamais eu le problème de scroll.)
  - **Mobile (étroit)** : barre d'onglets `SPOT / CREW / MATOS` visible ; seul `.panel.active`
    s'affiche. L'onglet actif est stocké sur l'objet `selection` (persisté entre les
    re-rendus que chaque clic déclenche).
- **Barre de lancement collante** : `▶ Lancer la teuf` sort du contenu scrollable vers une
  barre épinglée en bas de viewport — toujours atteignable. L'état désactivé garde le label
  `Embarque au moins un DJ` (`STR.needOneDj`).
- **Teasers « verrouillé caché »** :
  - Panneau SPOT : ne rend que les spots débloqués, puis une ligne tappable
    `🔒 +N spots à débloquer ⌄` qui déplie les cartes verrouillées du moment.
  - Panneau CREW : ne rend que crew + recrutables, puis `🔒 +N DJs à débloquer ⌄`.
  - Matos : reste visible (informatif — montre ce qui arrive) ; ajoute une note douce
    « reviens quand la caisse suit 💶 » la nuit 0 si rien n'est abordable.
- Frais de nuit (stock du bar / caution) restent sous l'onglet SPOT. La caution n'apparaît
  qu'au tier ≥ 3 (`screens.ts:233`) : un débutant ne la voit jamais.

**État déplié** : un `Set<string>` d'onglets/teasers dépliés sur `selection` (ou un petit
objet d'état UI persisté côté `main.ts`), pour survivre au re-rendu complet.

## Composant 2 — Modale « Comment jouer » (réouvrable, les deux vues)

Bouton `[?]` ajouté à la top bar de prépa **et** au `hud-top` de la nuit. Ouvre une modale à
deux sections, **La prépa** et **La nuit** :

- **La prépa** : 📍 choisis le spot (capacité, durée, sets) · 🎧 embarque ton crew (chaque DJ
  = son son + son cut) · 🔊 achète du matos quand la caisse suit · ▶ lance la teuf.
- **La nuit** : 🎚 qui prend les platines à chaque set · règle l'énergie (Chill calme les
  bleus → Rinse fait tout monter) · 🌊 LÂCHE le drop quand la vague est pleine · 👮 garde Les
  bleus sous la barre, sinon descente · 🔥 l'ambiance fait la recette et le prix libre · 🌅
  tiens jusqu'au lever du soleil.

Remplace le `firstTimeHint` mort (à supprimer du rendu sous-footer).

## Composant 3 — Coachmarks guidés de première nuit

Popups séquentiels légers ancrés aux **vrais** contrôles (sélecteurs CSS stables,
re-positionnés après re-rendu), chacun avec **Suivant / Passer** :

- **Prépa (3)** : carte spot → « ton premier spot, un champ paumé pour débuter » · carte crew
  → « Tonton est déjà là, tape pour l'embarquer/retirer » · barre de lancement → « quand
  t'es prêt, lance 🔥 ».
- **Nuit (3, au premier set)** : boutons d'intensité → « monte/descends l'énergie » · jauge
  👮 Les bleus → « garde-la sous la barre, sinon descente » · 🌊 la vague + LÂCHER → « vague
  pleine = lâche le drop ».

**Décision (question ouverte tranchée)** : au tout premier lancement, **les coachmarks
pilotent la première partie** (moins intimidant qu'un mur de texte). La modale `[?]` complète
reste la référence disponible partout, surfacée dans le 1er coachmark (« le détail est sous
[?] »). On **n'auto-ouvre pas** la modale. Chaque flux (prépa, nuit) marque sa complétion
(`prepCoachDone`, `nightCoachDone`) pour ne jamais re-déclencher.

**Mécanique** : un `CoachController` prend une file de `{ anchorSelector, text, placement }`,
suit l'index d'étape, se re-positionne après chaque re-rendu (re-`querySelector` par classe
stable, pas de réf d'élément conservée). Backdrop assombri optionnel + spotlight, ou simple
highlight + tooltip (plus robuste) — au choix de l'implémentation, highlight simple préféré.

## Composant 4 — Légendes nuit + hints tactiles

Les jauges portent déjà leurs labels icônes. Le vrai manque : les hints piégés dans les 9
tooltips `title=` desktop-only. Helper partagé `infoPopover` pour rendre les principaux
**révélables au tap sur mobile** : crans d'intensité (`intensiteHints`), stock du bar,
caution, cadeau/jour-off/studio, buzz.

## Structure du code

- **NOUVEAU `src/ui/onboarding.ts`** — `howToModal()`, `CoachController` (file + machine à
  états d'étapes), `infoPopover()`, et l'accès à la clé de persistance. Garde `screens.ts`
  (déjà 1203 lignes) de grossir et rend la logique testable.
- `src/ui/screens.ts` — onglets prépa + lancer collant + teasers ; `[?]` en top bar & dans
  `hud-top` ; retrait du `firstTimeHint` sous-footer.
- `src/main.ts` — câblage `[?]`, déclencheur première fois, lecture/écriture de la clé
  onboarding, passage de l'onglet actif.
- `src/ui/strings.ts` — nouveau copy (how-to, coachmarks, labels d'onglets, teasers).
- `src/style.css` — barre d'onglets, lancer collant, teaser, modale, coachmark, popover +
  media queries.

## Tests

- **Unitaires (vitest, purs)** : accès persistance onboarding (get/set/défaut) ; progression
  de la machine d'étapes du coach. Ce sont les cœurs testables extraits dans `onboarding.ts`.
- **Manuel via agent-browser (mobile + desktop)** : la hauteur de scroll tombe à ~1 écran ;
  le bouton lancer est toujours visible ; la modale s'ouvre dans les deux vues ; le contenu
  verrouillé est caché + dépliable ; les deux séquences de coachmarks se déclenchent une fois.

## Risques

- `renderPrepare` se re-rend entièrement à chaque clic → les coachmarks doivent s'ancrer par
  **sélecteur stable et se re-positionner**, jamais garder une réf d'élément.
- Onglets en CSS show/hide : marquer les panneaux cachés `aria-hidden`, éviter les pièges de
  focus.
- Ne pas régresser la grille 3 colonnes desktop.

## Hors scope

- Pas de refonte du gameplay de nuit (la boucle est validée par le chantier précédent).
- Pas de système i18n (le projet est français only, `strings.ts` reste la source).
- Pas de tutoriel vidéo / interactif scénarisé au-delà des 3+3 coachmarks.
