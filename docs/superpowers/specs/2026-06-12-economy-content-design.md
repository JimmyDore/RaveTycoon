# Rave Tycoon — Économie & contenu avant-set : design

**Status**: Design validé (brainstorming 2026-06-12) — prêt pour un plan d'implémentation
**Auteur**: Jimmy + Claude
**Chantier**: 2/4 — dépend du chantier 1 (l'intensité remplace le brief)

## Problème

Le matos complet coûte ~13 000 € ; après 1h de jeu le joueur a ~40 000 € en caisse et
**plus rien à acheter**. L'argent n'a que trois usages (matos fini, réparations, amendes),
les DJs et spots sont gated à la réputation seule. La caisse devient un score mort.

## Objectif

Que l'argent **reste une décision** toute la partie : des coûts récurrents qui pèsent, des
achats exclusifs qui engagent, et assez de contenu (matos, DJs, spots) pour que la courbe
tienne plusieurs heures — tout en préservant le **no-softlock** (PRD §4.3 : jouer ne peut
jamais coûter plus que la nuit ne rapporte).

## Décisions de design (verrouillées)

1. **Frais de nuit prélevés sur le brut** — jamais sur la banque. La caisse ne peut pas
   devenir négative en jouant : rock bottom = nuit à frais quasi nuls au Champ paumé.
2. **Le matos branche à partir du tier 3** — deux voies exclusives par catégorie ; changer
   de voie se paie plein pot. Les prix grimpent fort (tier 5 ≈ 20 000 €).
3. **L'argent achète aussi du temporaire** — stock du bar, pots-de-vin, jour off payé :
   des sinks récurrents qui scalent avec l'ambition du joueur.
4. **Quelques débloquages se font à l'argent ET à la rep** — cautions de spots, cadeaux
   aux DJs : la rep ouvre la porte, l'argent la franchit.

---

## 1. Frais de nuit (prélevés sur le brut)

Affichés à la prépa (estimation) et détaillés au payout :

| Poste | Formule | Note |
|---|---|---|
| **Essence du groupe** | `2€ × min de nuit × (0.5 + intensité moyenne)` | RINSE toute la nuit coûte ~2× CHILL. Tier 0 du groupe (« poussif ») : gratuit (no-softlock). |
| **Stock du bar** | choix prépa : `Léger / Normal / Large` = 0 / 15% / 30% de la recette bar potentielle, payé sur le brut | Le bar drip est **plafonné par le stock** : Léger couvre ~50% de la jauge, Normal ~80%, Large 110%. Sous-stocker une grosse nuit = recette qui sature. |
| **Caution du spot** | `cap × 1€`, tiers ≥ 3 uniquement | Rendue à l'aube si pas de bust ; perdue sur bust. Payée sur la banque (c'est un choix d'ambition, pas un frais subi) — un spot reste jouable sans caution avec heat de départ +0.1. |

## 2. Matos : tiers 4–5 et branches

Chaque catégorie gagne : un **tier 4** (~4 000 €), un **tier 5** (~10 000 €), et à partir
du tier 3 le choix entre **deux voies exclusives** (A/B) — la voie se choisit à l'achat du
tier 3, les tiers 4–5 prolongent la voie choisie. La voie non choisie reste visible,
grisée — changer de voie = racheter le tier courant au prix plein.

| Catégorie | Voie A | Voie B |
|---|---|---|
| **Platines** | *Précision* : qualité ++ | *Showmanship* : charisme effectif +1 pour tous les DJs |
| **Mur** | *Infrabasses* : cap ++, churn − | *Line array* : qualité +, portée du son → heat − |
| **Groupe** | *Silencieux* : heat −, power = | *Monstre* : power ++, RINSE sans surcharge |
| **Lumières** | *Hypnose* : vibe +, burnout de foule ralenti | *Stroboscopique* : payoff de drop + |
| **Logistique** | *Réseau* : descente retardée, négo + | *Mobilité* : évacuation sans malus de rep, cautions −50% |

Les valeurs exactes se calent au tuning contre le harness ; l'intention : **deux builds
viables par catégorie**, pas un optimum unique. Prix existants des tiers 1–3 multipliés
par ~2.5 (le 200€ devient 500€, etc.) — la première heure ralentit, sans changer l'ordre
des achats.

## 3. Sinks récurrents côté crew

- **🎁 Cadeau au DJ** — `500€ × niveau` : son cut baisse de 2 points (min 3%), une fois
  par DJ. Rend les gros cuts négociables, tard dans la partie.
- **🛋 Jour off payé** — `100€ × niveau` : le DJ récupère toute sa fatigue cette nuit
  **même s'il joue la suivante** (au lieu du repos forcé d'une nuit).
- **🎚 Session studio** — `1 200€` : +0.5 de technique permanent (max +1 par DJ, au-delà
  des 3 niveaux d'XP). Le sink de fin de partie pour son crew favori.

## 4. Nouveau contenu

### 4 DJs (roster 8 → 12)

| Nom | T/C | Genre | Risque | Cut | Déblocage |
|---|---|---|---|---|---|
| **La Doyenne** | 3/5 | Tribe · 165 BPM | normal | 16% | rep 100 |
| **Morse** | 5/2 | Hardcore · 220 BPM | chaud | 20% | rep 320 |
| **Plume** | 2/5 | Downtempo · 95 BPM | discret | 8% | rep 40 |
| **Volt** | 4/4 | Electro · 128 BPM | normal | 24% | **soundclash gagné** (chantier 1, Story D) — le headliner rival |

Tribe, Hardcore, Downtempo, Electro = 4 nouveaux genres dans `GENRES` (profils + stems),
portant à 12. Volt est le premier DJ débloqué par le gameplay et non par un seuil.

### 3 spots (6 → 9)

| Spot | Cap | Durée | Sets | Rep | Personnalité |
|---|---|---|---|---|---|
| **Plage abandonnée** | 300 | ~6 min | 4 | 90 | Churn faible (on reste), heat lent, mais arrivées lentes — la nuit posée |
| **Tunnel désaffecté** | 500 | ~8 min | 4 | 200 | Acoustique énorme (qualité +15%), heat rapide, cautions chères — risque/récompense |
| **Château squatté** | 800 | ~9 min | 5 | **arc « le fermier » fini + rep 350** | Le premier spot débloqué par un arc — prix libre ×1.3, descente retardée |

### Intervalles de rep recalés

Avec 9 spots et 12 DJs, les seuils s'étalent : la fourchette 0–500 actuelle devient
0–650, le Teknival passe à 650. Tuning précis contre le harness de progression.

## 5. Cibles de courbe (critères de tuning)

- Matos complet (une voie par catégorie) ≈ **110 000 €** — contre 13 000 aujourd'hui
  (tiers 1–3 ×2.5 ≈ 10 000 €/catégorie, + tiers 4–5 ≈ 14 000 €/catégorie, ×5 catégories).
- À mi-partie (rep ~250), les frais de nuit représentent **15–25% du brut** d'une nuit
  ambitieuse.
- Le harness vérifie : aucune config où jouer au Champ paumé avec le starter perd de
  l'argent ; et le temps-vers-Teknival simulé (politique autoplay) ≥ 3× l'actuel.

## Architecture

Tout est data : `data.ts` (matos branché → `GearItem.branch?: 'A' | 'B'`, nouveaux DJs,
spots, genres), `payout.ts` (frais de nuit, caution), `crew.ts` (cadeau, jour off, studio),
`screens.ts` (UI prépa : stock du bar, branches, badges). Stories indépendantes :
**frais de nuit → branches matos → sinks crew → contenu (DJs/spots/genres) → tuning**.

## Tests

`economy.test.ts` : frais sur le brut jamais sur la banque ; stock plafonne le bar ;
caution rendue/perdue ; branches exclusives ; cadeau/studio/jour off appliquent et
plafonnent. Harness : no-softlock vérifié par simulation, temps-vers-Teknival mesuré.

## Hors-scope

- Salaires fixes de crew — contredit la décision PRD #5 (cut only), écarté.
- Marché d'occasion / revente de matos — pas de valeur de jeu claire, écarté.
- Spots saisonniers — recoupe les régions du chantier 4.
