/**
 * Les régions (chantier 4) : chaque tournée se joue sous 2 traits qui changent
 * les règles, plus un multiplicateur de ⭐. `RegionRules` est l'objet centralisé
 * de surcharges lu par la sim — pas de `if trait` éparpillés (même philosophie
 * que les modificateurs de nuit).
 */

/** État persisté d'une région (`GameState.region`) — absente en tournée 1. */
export interface RegionState {
  nom: string;
  /** ids dans REGION_TRAITS */
  traits: string[];
}

export interface RegionRules {
  /** × sur la montée de chaleur (tickNight) */
  heatMult: number;
  /**
   * Seuil de heat qui termine la nuit en bust (tickNight) — 1 de base.
   * RÉVISION CHANTIER 1 : remplacera le seuil de descente (0.85 de base, 0.70
   * pour Zone quadrillée).
   */
  bustThreshold: number;
  /**
   * Le casier ne décroît pas. Dormant : aucune décroissance de casier n'existe.
   * RÉVISION CHANTIER 1 : brancher sur la décroissance du casier.
   */
  casierGele: boolean;
  /** × sur le prix libre (settleNight) */
  prixLibreMult: number;
  /** × sur la buvette (tickNight) */
  barMult: number;
  /** × sur la vitesse de décroissance du buzz (applyIdleTime) */
  buzzDecayMult: number;
  /** × sur le poids des modificateurs de nuit négatifs (rollModifiers) */
  negativeModifierWeightMult: number;
  /** spots indisponibles dans la région (isSpotAvailable) */
  bannedSpotIds: string[];
  /** surcharge du seuil de rep d'un spot, par id (isSpotAvailable) */
  repReqOverride: Record<string, number>;
  /**
   * × sur la qualité de set (computeSetQuality).
   * RÉVISION CHANTIER 1 : fallback de « tolérance d'attente −0.05 ».
   */
  setQualityMult: number;
  /** × sur la rep des objectifs de set (endCurrentSet) */
  goalRepMult: number;
  /**
   * Events de nuit supplémentaires possibles (maxEvents).
   * RÉVISION CHANTIER 1 : fallback vivant des « nuits spéciales 2× plus fréquentes ».
   */
  maxEventsBonus: number;
  /** Dormant. RÉVISION CHANTIER 1 : poids du tirage des nuits spéciales. */
  specialNightWeightMult: number;
  /** × sur les arrivées (tickNight) */
  arrivalMult: number;
  /** × sur le churn (tickNight) */
  churnMult: number;
  /** × arrivées des genres ≤ 140 BPM (tickNight) */
  slowGenreArrivalMult: number;
  /** × arrivées des genres > 170 BPM (tickNight) */
  fastGenreArrivalMult: number;
}

/** Les défauts sont l'identité : sans région, la sim est inchangée. */
export function defaultRegionRules(): RegionRules {
  return {
    heatMult: 1,
    bustThreshold: 1,
    casierGele: false,
    prixLibreMult: 1,
    barMult: 1,
    buzzDecayMult: 1,
    negativeModifierWeightMult: 1,
    bannedSpotIds: [],
    repReqOverride: {},
    setQualityMult: 1,
    goalRepMult: 1,
    maxEventsBonus: 0,
    specialNightWeightMult: 1,
    arrivalMult: 1,
    churnMult: 1,
    slowGenreArrivalMult: 1,
    fastGenreArrivalMult: 1,
  };
}

export interface RegionTraitDef {
  id: string;
  nom: string;
  desc: string;
  icon: string;
  /** négatif = confort, positif = contrainte */
  difficulty: -1 | 0 | 1 | 2;
  /** mutation de l'objet de règles centralisé */
  apply: (rules: RegionRules) => void;
  /** poids du tirage (tuning futur) */
  weight: number;
}

export const REGION_TRAITS: RegionTraitDef[] = [
  // --- contraintes (difficulty 1–2) -------------------------------------------
  {
    id: 'zone-quadrillee',
    nom: 'Zone quadrillée',
    desc: 'Les bleus patrouillent serré : la teuf tombe dès 85 % de chaleur.',
    icon: '🚔',
    difficulty: 2,
    apply: (r) => {
      r.bustThreshold = 0.85;
    },
    weight: 1,
  },
  {
    id: 'prefet-zele',
    nom: 'Préfet zélé',
    desc: 'Un préfet à médailles : la chaleur monte 30 % plus vite et le casier ne s’efface pas.',
    icon: '👮',
    difficulty: 1,
    apply: (r) => {
      r.heatMult *= 1.3;
      r.casierGele = true;
    },
    weight: 1,
  },
  {
    id: 'economie-morose',
    nom: 'Économie morose',
    desc: 'Les poches sont vides : prix libre ×0.75, buvette ×0.8.',
    icon: '💸',
    difficulty: 1,
    apply: (r) => {
      r.prixLibreMult *= 0.75;
      r.barMult *= 0.8;
    },
    weight: 1,
  },
  {
    id: 'climat-pourri',
    nom: 'Climat pourri',
    desc: 'Ici il pleut même en août : la météo qui fâche tombe deux fois plus souvent.',
    icon: '🌧',
    difficulty: 1,
    apply: (r) => {
      r.negativeModifierWeightMult *= 2;
    },
    weight: 1,
  },
  {
    id: 'terre-de-beton',
    nom: 'Terre de béton',
    desc: 'Que du bitume : champ, forêt et plage introuvables — mais la carrière est ouverte à tous.',
    icon: '🧱',
    difficulty: 2,
    apply: (r) => {
      r.bannedSpotIds.push('champ', 'foret', 'plage');
      // garde-fou no-softlock : un spot de départ reste jouable à rep 0
      r.repReqOverride.carriere = 0;
    },
    weight: 1,
  },
  {
    id: 'public-exigeant',
    nom: 'Public exigeant',
    desc: 'Des oreilles difficiles : les sets paraissent toujours un peu moins bons.',
    icon: '😤',
    difficulty: 1,
    apply: (r) => {
      r.setQualityMult *= 0.95;
    },
    weight: 1,
  },
  {
    id: 'zone-blanche',
    nom: 'Zone blanche',
    desc: 'Pas de réseau : le buzz retombe deux fois plus vite entre les teufs.',
    icon: '📵',
    difficulty: 1,
    apply: (r) => {
      r.buzzDecayMult *= 2;
    },
    weight: 1,
  },
  // --- caractère (difficulty 0) ------------------------------------------------
  {
    id: 'terre-de-dub',
    nom: 'Terre de dub',
    desc: 'Pays de basses lourdes : les sons ≤ 140 BPM attirent ×1.3, au-delà de 170 BPM ×0.7.',
    icon: '🎶',
    difficulty: 0,
    apply: (r) => {
      r.slowGenreArrivalMult *= 1.3;
      r.fastGenreArrivalMult *= 0.7;
    },
    weight: 1,
  },
  {
    id: 'fetes-votives',
    nom: 'Pays des fêtes votives',
    desc: 'Il se passe toujours quelque chose : plus d’histoires la nuit, mais la rep des objectifs ×0.8.',
    icon: '🎪',
    difficulty: 0,
    apply: (r) => {
      r.specialNightWeightMult *= 2;
      r.maxEventsBonus += 1;
      r.goalRepMult *= 0.8;
    },
    weight: 1,
  },
  {
    id: 'grands-axes',
    nom: 'Grands axes',
    desc: 'L’autoroute passe à côté : le monde afflue ×1.2 et repart ×1.2.',
    icon: '🛣',
    difficulty: 0,
    apply: (r) => {
      r.arrivalMult *= 1.2;
      r.churnMult *= 1.2;
    },
    weight: 1,
  },
  // --- confort (difficulty −1, max 1 par région) --------------------------------
  {
    id: 'terre-daccueil',
    nom: 'Terre d’accueil',
    desc: 'Les gendarmes d’ici ont d’autres chats à fouetter : chaleur ×0.7.',
    icon: '🤝',
    difficulty: -1,
    apply: (r) => {
      r.heatMult *= 0.7;
    },
    weight: 1,
  },
  {
    id: 'region-riche',
    nom: 'Région riche',
    desc: 'Le prix libre coule : dons ×1.25.',
    icon: '🍾',
    difficulty: -1,
    apply: (r) => {
      r.prixLibreMult *= 1.25;
    },
    weight: 1,
  },
];

export function getRegionTrait(id: string): RegionTraitDef {
  const trait = REGION_TRAITS.find((t) => t.id === id);
  if (!trait) throw new Error(`unknown region trait: ${id}`);
  return trait;
}

/** Les defs des traits d'une région (ou [] sans région — tournée 1). */
export function regionTraits(region: RegionState | undefined): RegionTraitDef[] {
  return region ? region.traits.map(getRegionTrait) : [];
}

/** Multiplicateur ⭐ = 1 + 0.25 × max(0, somme des difficulty) → ×1.0 à ×2.0. */
export function legendeMultiplier(traits: RegionTraitDef[], infernale = false): number {
  const sum = traits.reduce((acc, t) => acc + t.difficulty, 0);
  let mult = 1 + 0.25 * Math.max(0, sum);
  // le perk Héritage « Tournée infernale » amplifie les régions à somme ≥ 2
  if (infernale && sum >= 2) mult *= 1.5;
  return mult;
}

/** id du perk Héritage « Tournée infernale » (chantier 3). */
export const PERK_TOURNEE_INFERNALE = 'tournee-infernale';

/** Applique le multiplicateur de région au gain de ⭐ calculé par tour.ts. */
export function applyRegionLegende(
  base: number,
  region: RegionState | undefined,
  perks: string[],
): number {
  return Math.floor(
    base * legendeMultiplier(regionTraits(region), perks.includes(PERK_TOURNEE_INFERNALE)),
  );
}

/** Construit l'objet de règles depuis la région courante (identité sans région). */
export function buildRegionRules(region: RegionState | undefined): RegionRules {
  const rules = defaultRegionRules();
  for (const trait of regionTraits(region)) trait.apply(rules);
  return rules;
}
