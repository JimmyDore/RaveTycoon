# Rave Tycoon — Prestige « La Tournée » : design

**Status**: Design validé (brainstorming 2026-06-12) — prêt pour un plan d'implémentation
**Auteur**: Jimmy + Claude
**Chantier**: 3/4 — dépend des chantiers 1 (tags légende) et 2 (courbe économique).
Le PRD prévoyait ce hook (§10 « the crew moves to a new region », §13).

## Problème

Après le Teknival (~quelques heures avec le chantier 2), le jeu est fini : pas de raison
de relancer. L'objectif validé en brainstorming : **rejouabilité infinie**, prestige comme
colonne vertébrale + modificateurs de run (chantier 4) comme variateur.

## Objectif

Une méta-boucle où **recommencer est un choix gourmand, pas une punition** : on abandonne
sa progression contre une monnaie permanente qui rend chaque tournée différente et plus
ambitieuse, et qui débloque du contenu inaccessible autrement.

## Décisions de design (verrouillées)

1. **Partir en tournée est volontaire** — disponible dès la première victoire au Teknival
   (`wonTeknival`), proposé mais jamais forcé. On peut continuer sa partie.
2. **La monnaie s'appelle ⭐ Légende** — gagnée au départ en tournée, fonction de ce que
   la partie a accompli. Elle ne s'achète pas, ne se farme pas en boucle courte (le gros
   du gain vient du Teknival et des hauts faits).
3. **Un vétéran t'accompagne** — au départ, choisir **un** DJ (hors fondateur, qui vient
   toujours) qui garde niveau et bonus studio. Le hook PRD §10, et la raison affective
   de s'attacher à son crew.
4. **L'Héritage achète du confort ET de l'exclusif** — des départs plus rapides (confort)
   et du contenu impossible sans prestige (tier 6 mythique, DJs légendaires). La carotte
   des tournées 3+.

---

## 1. Le départ en tournée

Sur l'écran de prépa, une fois `wonTeknival` : carte **« 🚐 Partir en tournée »**.
Confirmation avec le détail exact de ce qui est perdu/gagné, puis :

**Reset** : caisse, matos (→ starter, sauf perks), rep, buzz, spots, roster (sauf fondateur
+ vétéran choisi), niveaux/XP des DJs quittés, casier, arcs en cours, garde à vue.
**Conservé** : ⭐ Légende (cumulée), perks de l'Héritage, compteur de tournées, stats
all-time (leaderboard inchangé — il track déjà des maxima).

`GameState` gagne un bloc `tour: { number: number; legende: number; perks: string[]; veteranId?: DjId }`.
Migration de save : bloc absent = tournée 1, 0 ⭐.

## 2. Le gain de ⭐ Légende

Calculé au moment du départ (affiché en preview sur la carte) :

```
legende = floor(rep / 100)
        + 3 × victoires Teknival cette tournée
        + 1 par « mur tenu » (tag légende, chantier 1 Story C)
        + 1 par arc mené à terme
```

Une première tournée complète ≈ **10–14 ⭐**. Le multiplicateur de région (chantier 4)
s'appliquera là-dessus.

## 3. L'Héritage (la boutique permanente)

Accessible depuis la prépa (onglet « ⭐ Héritage »), achats définitifs :

| Perk | Coût | Effet |
|---|---|---|
| **Le camion aménagé** | 2 ⭐ | Départ avec 1 500 € |
| **Carnet d'adresses** | 3 ⭐ | Les DJs se débloquent à 70% de leur seuil de rep |
| **Réputation qui précède** | 3 ⭐ | Départ avec 30 rep (Forêt ouverte direct) |
| **Matos planqué** | 4 ⭐ | Départ avec tier 1 partout |
| **La famille s'agrandit** | 5 ⭐ | +1 vétéran emmené par tournée (stack ×2) |
| **Mythes du son** (×5 catégories) | 6 ⭐ chacun | Débloque le **tier 6 mythique** d'une catégorie — achetable en € en partie, effets au-delà du tier 5 + un effet signature (ex. mur mythique : la foule en sur-cap de 10%) |
| **Les Têtes d'affiche** (×2) | 8 ⭐ chacun | Débloque un **DJ légendaire** dans le pool de recrutement (stats 5/5, cuts 35%, gimmick unique chacun — ex. « DJ Sans Nom » : immunisé garde à vue) |
| **Tournée infernale** | 5 ⭐ | Les régions difficiles (chantier 4) donnent +50% de ⭐ |

Total = 68 ⭐ → **5–6 tournées pour tout voir** (les multiplicateurs de région accélèrent
les dernières), et les tournées suivantes restent
variées par les régions (chantier 4).

## 4. La boucle cible

Tournée 1 : ~3–4h (courbe chantier 2). Tournée 2 avec ~10 ⭐ de confort : ~2h, on vise
les hauts faits qu'on a ratés. Tournées 3+ : on optimise le gain de ⭐ par heure, on
débloque le mythique, on chasse les Têtes d'affiche. La rejouabilité « infinie » vient du
produit perks × régions × hauts faits, pas d'un mur de grind.

## Architecture

Nouveau `src/core/tour.ts` (calcul de ⭐, reset, application des perks au `newGame`),
`data.ts` (PERKS, tier 6, DJs légendaires), `screens.ts` (carte départ, onglet Héritage),
`save.ts` (migration + le bloc `tour` survit au reset). Les perks s'appliquent en **un
seul point** : la création de partie (pas de `if perk` éparpillés dans la sim — les perks
modifient l'état initial ou des champs de données déjà existants).

## Tests (`tour.test.ts`)

Formule de ⭐ ; reset conserve/détruit exactement la liste ci-dessus ; vétéran garde
niveau et studio ; chaque perk modifie l'état initial attendu ; migration de vieille save ;
le fondateur vient toujours ; no-softlock en tournée N (le starter reste insaisissable).

## Hors-scope

- Régions nommées et leurs traits → **chantier 4** (la tournée y branchera son écran de départ).
- Succès/achievements méta hors leaderboard — plus tard.
- Prestige forcé ou fin de partie dure — jamais : on peut toujours continuer sa tournée.
