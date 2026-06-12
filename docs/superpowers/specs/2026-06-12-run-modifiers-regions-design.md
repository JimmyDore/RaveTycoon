# Rave Tycoon — Modificateurs de run : les Régions : design

**Status**: Design validé (brainstorming 2026-06-12) — prêt pour un plan d'implémentation
**Auteur**: Jimmy + Claude
**Chantier**: 4/4 — dépend du chantier 3 (le départ en tournée est le point d'entrée).

## Problème

Le prestige seul (chantier 3) accélère mais ne **varie** pas : tournée 2 = tournée 1 en
plus vite. L'objectif « rejouabilité infinie » validé en brainstorming demandait les deux
combinés : prestige + contraintes de run façon roguelite.

## Objectif

Chaque tournée se joue dans une **région** aux règles différentes, choisie parmi un tirage —
assez d'agence pour construire une stratégie, assez de hasard pour que deux tournées ne se
ressemblent pas. Les régions dures paient plus de ⭐.

## Décisions de design (verrouillées)

1. **On choisit 1 région parmi 3 tirées** — au départ en tournée. Du draft, pas de la
   loterie : le joueur construit sa tournée autour des traits (« région à dub + flics
   mous → j'emmène Bob Lépine en vétéran »).
2. **Une région = 2 traits + 1 multiplicateur de ⭐** — les traits sont data-driven et
   composables ; la difficulté agrégée fixe le multiplicateur (×1.0 à ×2.0).
3. **Les traits changent les règles, pas seulement les chiffres** — au moins un tiers du
   pool modifie une mécanique (seuil de descente, fréquence des nuits spéciales...), pas
   juste un multiplicateur.
4. **La tournée 1 n'a pas de région** — la première partie reste le tutoriel implicite ;
   les régions apparaissent au premier départ en tournée.

---

## 1. Le tirage

À l'écran « Partir en tournée » (chantier 3) : 3 cartes-régions, nom généré
(`{La Creuse profonde, Le Triangle des Landes, La Vallée grise, ...}` — pool de noms ×
traits tirés), chacune montrant ses 2 traits et son multiplicateur de ⭐. On en choisit
une ; elle s'applique à **toute la tournée**.

```ts
export interface RegionTraitDef {
  id: string; nom: string; desc: string; icon: string;
  difficulty: -1 | 0 | 1 | 2;          // négatif = confort, positif = contrainte
  apply: (rules: RegionRules) => void; // mutation d'un objet de règles centralisé
  weight: number;
}
// Région = 2 traits distincts, pas deux traits de confort ensemble.
// Multiplicateur ⭐ = 1 + 0.25 × max(0, somme des difficulty)  → ×1.0 à ×2.0
```

`RegionRules` est un objet **centralisé** de surcharges lu par la sim (même philosophie
que les perks du chantier 3 : pas de `if trait` éparpillés — la sim lit `rules.X` partout
où une règle est paramétrable).

## 2. Le pool de traits (lancement : 12)

**Contraintes** (difficulty 1–2) :

| Trait | Effet |
|---|---|
| **🚔 Zone quadrillée** (2) | La descente se déclenche à heat 0.70 (au lieu de 0.85) |
| **👮 Préfet zélé** (1) | Heat ×1.3, le casier ne décroît pas |
| **💸 Économie morose** (1) | Prix libre ×0.75, bar ×0.8 |
| **🌧 Climat pourri** (1) | Les modificateurs météo négatifs sont 2× plus fréquents |
| **🧱 Terre de béton** (2) | Spots champêtres (champ, forêt, plage) indisponibles |
| **😤 Public exigeant** (1) | Tolérance d'attente −0.05 partout |
| **📵 Zone blanche** (1) | Le buzz décroît 2× plus vite |

**Caractère** (difficulty 0) :

| Trait | Effet |
|---|---|
| **🎶 Terre de dub** | Genres ≤ 140 BPM : arrivées ×1.3 ; > 170 BPM : ×0.7 (variante tirée par famille de genres) |
| **🎪 Pays des fêtes votives** | Nuits spéciales 2× plus fréquentes, rep des objectifs ×0.8 |
| **🛣 Grands axes** | Arrivées ×1.2, churn ×1.2 |

**Confort** (difficulty −1, max 1 par région) :

| Trait | Effet |
|---|---|
| **🤝 Terre d'accueil** | Heat ×0.7 (sa difficulty −1 réduit déjà le multiplicateur de ⭐ via la somme) |
| **🍾 Région riche** | Prix libre ×1.25 |

## 3. Interactions

- Le multiplicateur de ⭐ s'applique au gain du chantier 3 ; le perk « Tournée infernale »
  l'amplifie (+50% sur les régions à somme ≥ 2).
- Les traits composent avec phases, modificateurs de nuit et nuits spéciales par produit
  de multiplicateurs — aucune exclusion à gérer hormis **Terre de béton** (le tirage de
  région garantit qu'au moins un spot tier 1–2 reste jouable : le harness le vérifie).
- Le HUD de prépa affiche la région et ses traits en permanence (bandeau sous le titre).

## Architecture

Nouveau `src/core/regions.ts` (traits, tirage 3 parmi N à graine, génération de noms,
construction de `RegionRules`), `types.ts` (`GameState.region`), lecture de `rules` dans
`night.ts` / `payout.ts` / `idle.ts` aux points déjà paramétrables. UI : cartes de tirage
dans l'écran de départ en tournée (chantier 3), bandeau région à la prépa.

## Tests (`regions.test.ts`)

Tirage déterministe à graine ; jamais deux conforts ; multiplicateur conforme à la somme ;
chaque trait mute la bonne règle (un tick/settle le prouve) ; Terre de béton laisse un
spot jouable ; le harness boucle une tournée complète sous 2–3 régions types.

## Hors-scope

- Régions persistantes / carte du monde — les régions sont jetables par design.
- Traits saisonniers liés à la vraie date — gadget, écarté.
- Défis hebdomadaires à graine partagée (leaderboard de région) — bon candidat v3,
  l'architecture à graine le permet déjà.
