# Fatigue comme vrai levier — design

**Date :** 2026-06-11
**Statut :** approuvé, prêt pour implémentation

## Problème

Le crew reste visuellement épuisé en permanence et la fatigue semble sans impact.
Investigation (`src/core/crew.ts`, `idle.ts`, `night.ts`) :

- **Accumulation rapide** : +0,22 fatigue/set (+0,08 si « pousser »), 2 à 6 sets/nuit
  selon le spot. Un DJ principal monte vite au plafond.
- **Récupération quasi nulle en session** : seule baisse via `recoverFatigue` dans
  `applyIdleTime`, indexée sur le **temps réel** à 1/12 par heure → 12 h réelles pour
  vider une fatigue pleine. Une nuit dure quelques minutes réelles → récup ≈ 0 pendant
  qu'on joue.
- **Malus réel mais invisible** : `fatigueQualityMult = 1 − 0,35·min(1, fatigue)`,
  jusqu'à −35 % de qualité, répercuté sur affluence/vibe/recette. Mais comme la fatigue
  est collée au max toute la session, il n'y a **aucun contraste** : le −35 % est fondu
  dans la « qualité normale » et ne se ressent pas.
- **La barre ment au-dessus de 1,0** : la donnée monte à 1,5 alors que la barre *et* le
  malus plafonnent à 1,0 → surexploiter un DJ déjà cramé est gratuit et invisible.

Conclusion : mécanique fonctionnelle dans le code, **inerte dans le ressenti**.

## Décisions

1. **Récupération 100 % in-game, par nuit.** On supprime la récup au temps réel.
   À la résolution de chaque nuit, tout membre du crew **qui n'a joué aucun set** cette
   nuit récupère un chunk. Règle binaire : a joué ≥ 1 set → toll déjà pris, pas de repos ;
   n'a pas joué (à quai *ou* embarqué mais jamais assigné) → repos.
2. **Pas de dette.** Fatigue plafonnée à **1,0** net : la barre et le malus disent la
   vérité, et surexploiter au plafond n'ajoute rien (pas de double peine).
3. **Cas « 1 seul DJ » non bloquant.** La Gamine se débloque dès ~1 nuit (rep 6), Bob
   vers la nuit 3-4 (rep 20). Le solo ne dure qu'une nuit où Tonton atteint ~0,44
   (malus ~15 %). Pas de filet temps-réel nécessaire.

## Chiffres

| Constante | Avant | Après |
|---|---|---|
| Plafond fatigue | 1,5 (caché) | **1,0** |
| Fatigue / set | 0,22 (+0,08 pousser) | inchangé |
| Malus qualité max | −35 % | inchangé |
| Récup temps réel | 1/12 par heure | **supprimée** |
| Repos / nuit non jouée | — | **−0,5** |

Boucle type : ~3 sets/nuit → +0,66 ; une nuit de banc → −0,5. Plein → frais ≈ 2 nuits
de repos. Aux gros spots (Teknival, 6 sets) un DJ solo plafonne en une nuit → la
rotation des sets *et* des nuits de repos devient obligatoire.

## Changements code

- **`src/core/crew.ts`**
  - `applySetToll` : plafond `Math.min(1.5, …)` → `Math.min(1, …)`.
  - Retirer `FATIGUE_RECOVERY_HOURS` et `recoverFatigue`.
  - Ajouter `REST_RECOVERY = 0.5` et
    `applyNightRest(state, playedDjIds: Set<string>)` : `−REST_RECOVERY` (plancher 0)
    pour chaque membre absent de `playedDjIds`.
  - Ajouter `fatigueMalus(fatigue) = FATIGUE_QUALITY_MALUS · min(1, fatigue)` (fraction
    0…0,35) ; `fatigueQualityMult` devient `1 − fatigueMalus(state.fatigue)`.
- **`src/core/idle.ts`** : retirer l'import et l'appel `recoverFatigue`.
- **`src/core/payout.ts`** : dans `settleNight` *et* `applyBust`, calculer le set des DJ
  ayant joué (`new Set(night.playedSets.map(s => s.djId))`) et appeler `applyNightRest`.
- **`src/ui/screens.ts`** : sous la barre de fatigue (carte crew + modale de choix de DJ),
  afficher le malus chiffré quand `fatigue` est non négligeable (ex. « −18 % qualité »).
- **`src/ui/strings.ts`** : nouveau `qualityMalus(pct)` ; mettre à jour `buzzHint`
  (« Les DJ laissés à quai récupèrent à chaque nuit. »).
- **`src/core/types.ts`** : corriger le commentaire de `DjState.fatigue`
  (« recovers per rested night », plus « in real time »).

## Compat sauvegardes

Aucune migration. Une fatigue chargée à 1,5 s'affiche déjà pleine, le malus est déjà
plafonné à 1,0, et le premier repos/toll la ramène dans [0, 1]. Auto-correctif.

## Tests (TDD)

- `applySetToll` plafonne à 1,0.
- `applyNightRest` : les DJ non joués perdent 0,5 (plancher 0), les joueurs gardent leur
  fatigue.
- `fatigueMalus` / `fatigueQualityMult` : garde-fous sur les bornes (0 → 1, 1 → 0,65).
- Retrait du test de récup temps-réel (`recoverFatigue`).
