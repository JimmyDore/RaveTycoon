import { mulberry32 } from './rng';

/**
 * Modificateur passif de nuit — tiré au lancement (1–2 par nuit), révélé tout de
 * suite, puis multipliant silencieusement les leviers existants pendant toute la
 * teuf. Aucune décision : c'est la météo/la foule du soir, pour la variété.
 *
 * Chaque champ optionnel est un facteur appliqué là où le levier est lu dans
 * `tickNight` (`arrivalMult` sur l'affluence, `churnMult` sur le décrochage,
 * `heatMult` sur la montée de chaleur, `priceMult` sur la buvette) ou un bonus
 * additif (`retentionBonus` sur la rétention, `eventDelay` en secondes sur le
 * premier event). `weight` pondère le tirage au tier du spot.
 */
export interface NightModifierDef {
  id: string;
  nom: string;
  desc: string;
  icon: string;
  arrivalMult?: number;
  churnMult?: number;
  heatMult?: number;
  priceMult?: number;
  retentionBonus?: number;
  eventDelay?: number;
  /** météo/foule qui fâche — pèse plus lourd sous « Climat pourri » (régions) */
  negatif?: boolean;
  /** poids contextuel ; tier-1 ne tire que des modifs douces (voir garde-fou) */
  weight: (spotTier: number) => number;
}

/**
 * Le deck des modificateurs de nuit. Tirés sans remise, 1–2 par nuit.
 *
 * **Garde-fou balance** : au Champ paumé (tier 1) on ne tire QUE des modifs
 * douces — pas de hausse agressive de heat/churn — pour que le harness
 * `progression.test.ts` (« une nuit normale ne bust jamais ») reste vrai. Les
 * modifs qui poussent la chaleur ou le décrochage (Des touristes) ont un poids
 * nul au tier 1.
 */
export const NIGHT_MODIFIERS: NightModifierDef[] = [
  {
    id: 'pluie',
    nom: 'Pluie battante',
    desc: 'La boue avale les pas, mais ceux qui restent sont là pour de bon. Les bleus ne sortent pas sous l’averse.',
    icon: '🌧',
    churnMult: 1.3,
    heatMult: 0.7,
    arrivalMult: 0.85,
    negatif: true,
    weight: () => 1,
  },
  {
    id: 'nuit-claire',
    nom: 'Nuit claire',
    desc: 'Ciel dégagé, lune pleine. Le bouche-à-oreille tourne, le monde afflue.',
    icon: '🌕',
    arrivalMult: 1.2,
    weight: () => 1,
  },
  {
    id: 'brouillard',
    nom: 'Brouillard',
    desc: 'Une purée à couper au couteau. On se perd sur le chemin, mais les guetteurs ont le temps de voir venir.',
    icon: '🌫',
    eventDelay: 30,
    arrivalMult: 0.9,
    negatif: true,
    weight: () => 1,
  },
  {
    id: 'famille-son',
    nom: 'La famille du son',
    desc: 'Que des têtes connues ce soir, des vrais de vrais. Ils restent jusqu’au bout et lâchent à la buvette.',
    icon: '🤝',
    retentionBonus: 0.05,
    priceMult: 1.2,
    weight: () => 1,
  },
  {
    id: 'touristes',
    nom: 'Des touristes',
    desc: 'Des curieux du week-end ont suivi le plan. Ils ramènent du monde mais décrochent vite et parlent fort.',
    icon: '🎒',
    arrivalMult: 1.25,
    churnMult: 1.3,
    heatMult: 1.15,
    negatif: true,
    // poids nul au tier 1 : trop agressif sur la chaleur/le décrochage (garde-fou)
    weight: (tier) => (tier >= 2 ? 1 : 0),
  },
  {
    id: 'soir-paie',
    nom: 'Soir de paie',
    desc: 'Fin de mois, les poches sont pleines. Le prix libre coule à flots dans la cagnotte.',
    icon: '💸',
    priceMult: 1.5,
    // +50% de buvette par pure chance sur-finance la nuit 1 — réservé au tier 2+
    weight: (tier) => (tier >= 2 ? 0.8 : 0),
  },
];

/**
 * Tire 1–2 modificateurs pour la nuit via un flux RNG **dédié**
 * (`mulberry32(seed ^ 0x9e3779b9)`) afin de NE PAS perturber le flux des events
 * porté par `night.rng`. Déterministe pour une graine donnée. Tirage **sans
 * remise**, pondéré par le tier du spot.
 */
export function rollModifiers(spotTier: number, seed: number, negWeightMult = 1): NightModifierDef[] {
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  // 1 ou 2 modifs ce soir (≈ moitié-moitié)
  const count = rng() < 0.5 ? 1 : 2;
  const picked: NightModifierDef[] = [];
  for (let n = 0; n < count; n++) {
    const pool = NIGHT_MODIFIERS.filter((m) => !picked.includes(m));
    const weights = pool.map((m) => Math.max(0, m.weight(spotTier) * (m.negatif ? negWeightMult : 1)));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) break;
    let roll = rng() * total;
    let chosen = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        chosen = pool[i];
        break;
      }
    }
    picked.push(chosen);
  }
  return picked;
}

/** Produit des `field` sur tous les modifs (1 si le champ est absent). */
export function modifierProduct(modifiers: NightModifierDef[], field: keyof NightModifierDef): number {
  return modifiers.reduce((acc, m) => acc * ((m[field] as number | undefined) ?? 1), 1);
}

/** Somme des `field` sur tous les modifs (0 si le champ est absent). */
export function modifierSum(modifiers: NightModifierDef[], field: keyof NightModifierDef): number {
  return modifiers.reduce((acc, m) => acc + ((m[field] as number | undefined) ?? 0), 0);
}
