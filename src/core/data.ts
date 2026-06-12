import type {
  DjDef,
  GameState,
  GearBranch,
  GearCategory,
  GearItem,
  GenreDef,
  GenreId,
  SpotDef,
  SpotId,
} from './types';

export const SPOTS: SpotDef[] = [
  {
    id: 'champ',
    nom: 'Champ paumé',
    description: 'Un champ boueux au bout d’un chemin. Personne pour se plaindre, ou presque.',
    cap: 60,
    arrival: 0.55,
    heatBuild: 0.004,
    repReq: 0,
    tier: 1,
    duration: 180,
    setCount: 2,
    priceMult: 1,
    powerMult: 1,
  },
  {
    id: 'foret',
    nom: 'Forêt',
    description: 'Pas de voisins, des arbres qui bouffent le son. Longues nuits tranquilles.',
    cap: 120,
    arrival: 0.6,
    heatBuild: 0.006,
    repReq: 12,
    tier: 2,
    duration: 240,
    setCount: 3,
    priceMult: 1,
    powerMult: 1,
  },
  {
    id: 'carriere',
    nom: 'Carrière abandonnée',
    description: 'Une acoustique de cathédrale, mais le courant n’arrive pas jusqu’ici : le groupe électrogène est le goulot.',
    cap: 220,
    arrival: 0.95,
    heatBuild: 0.011,
    repReq: 45,
    tier: 3,
    duration: 300,
    setCount: 3,
    priceMult: 1,
    powerMult: 0.6,
  },
  {
    id: 'hangar',
    nom: 'Hangar urbain',
    description: 'En pleine ville. Gros cachet, grosse jauge — et les bleus à deux rues.',
    cap: 400,
    arrival: 1.7,
    heatBuild: 0.022,
    repReq: 150,
    tier: 4,
    duration: 420,
    setCount: 4,
    priceMult: 1.5,
    powerMult: 1,
  },
  {
    id: 'friche',
    nom: 'Friche industrielle',
    description: 'Le grand frisson : immense, risqué, légendaire si tu tiens jusqu’au matin.',
    cap: 650,
    arrival: 2.1,
    heatBuild: 0.017,
    repReq: 280,
    tier: 5,
    duration: 540,
    setCount: 5,
    priceMult: 1.2,
    powerMult: 1,
  },
  {
    id: 'teknival',
    nom: 'Teknival',
    description: 'LE rendez-vous. Des murs de son à perte de vue. Tiens jusqu’au lever du soleil et tu entres dans la légende.',
    cap: 2000,
    arrival: 5.2,
    heatBuild: 0.013,
    repReq: 500,
    tier: 6,
    duration: 600,
    setCount: 6,
    priceMult: 1.3,
    powerMult: 1,
  },
];

export const GENRES: GenreDef[] = [
  {
    id: 'hardtek',
    nom: 'Hardtek',
    bpm: 170,
    arrival: 1.0,
    churn: 0.01,
    heatMult: 1.0,
    description: 'Le son du camion. Rapide, énergique, fédérateur.',
  },
  {
    id: 'acid',
    nom: 'Acid',
    bpm: 140,
    arrival: 1.35,
    churn: 0.016,
    heatMult: 1.3,
    description: 'La 303 qui rend fou. Ça afflue vite, ça chauffe vite.',
  },
  {
    id: 'dub',
    nom: 'Dub',
    bpm: 75,
    arrival: 0.6,
    churn: 0.004,
    heatMult: 0.6,
    description: 'Lourd et lent. Le public arrive doucement mais ne part plus.',
  },
  {
    id: 'frenchcore',
    nom: 'Frenchcore',
    bpm: 200,
    arrival: 1.5,
    churn: 0.022,
    heatMult: 1.6,
    description: 'Le kick dans le rouge. Ça tape à 200, ça part en fumée vite.',
  },
  {
    id: 'mentale',
    nom: 'Mentale',
    bpm: 180,
    arrival: 1.1,
    churn: 0.01,
    heatMult: 1.1,
    description: 'Hardtek mélodique et hypnotique. La transe des vieux briscards.',
  },
  {
    id: 'techno',
    nom: 'Techno',
    bpm: 130,
    arrival: 0.9,
    churn: 0.008,
    heatMult: 0.8,
    description: 'Carré, propre, implacable. Monte sans jamais déborder.',
  },
  {
    id: 'raggatek',
    nom: 'Raggatek',
    bpm: 175,
    arrival: 1.4,
    churn: 0.009,
    heatMult: 1.1,
    description: 'Du sound system sur du tek. Les voix scotchent le public.',
  },
  {
    id: 'darkpsy',
    nom: 'Darkpsy',
    bpm: 150,
    arrival: 1.0,
    churn: 0.006,
    heatMult: 0.9,
    description: 'Forêt, basses roulantes, transe sans fin. On ne sait plus l’heure.',
  },
  {
    id: 'tribe',
    nom: 'Tribe',
    bpm: 165,
    arrival: 1.05,
    churn: 0.009,
    heatMult: 1.0,
    description: 'Le kick roulé des montagnes. Hypnotique, tribal, increvable.',
  },
  {
    id: 'hardcore',
    nom: 'Hardcore',
    bpm: 220,
    arrival: 1.6,
    churn: 0.025,
    heatMult: 1.8,
    description: 'Au-delà du rouge. Ça déferle, ça crame, ça repart en ambulance.',
  },
  {
    id: 'downtempo',
    nom: 'Downtempo',
    bpm: 95,
    arrival: 0.55,
    churn: 0.003,
    heatMult: 0.5,
    description: 'Le souffle entre deux tempêtes. Personne ne part, personne ne s’énerve.',
  },
  {
    id: 'electro',
    nom: 'Electro',
    bpm: 128,
    arrival: 1.2,
    churn: 0.012,
    heatMult: 0.9,
    description: 'Carré, funky, fédérateur. Le son qui fait danser même les guetteurs.',
  },
];

/**
 * Gear semantics by category (`value`):
 * - platines:   set quality multiplier
 * - mur:        crowd capacity multiplier (also the visible wall on screen)
 * - groupe:     power supply (vs demand from crowd+brief) — low tier = brownouts
 * - lumieres:   flat vibe bonus
 * - logistique: heat multiplier (lower = guetteurs warn earlier, cops bite less)
 *
 * Branch effects are typed in GearEffects (see types.ts) — extra levers mapped
 * onto the existing sim, layered on top of the per-category `value`.
 */
export const GEAR: Record<GearCategory, GearItem[]> = {
  platines: [
    { category: 'platines', tier: 0, nom: 'Platines de récup', price: 0, value: 0.85, seizable: false },
    { category: 'platines', tier: 1, nom: 'Contrôleur d’occase', price: 500, value: 1.0, seizable: true },
    { category: 'platines', tier: 2, nom: 'Setup pro', price: 2500, value: 1.12, seizable: true },
    // voie A — Précision : la qualité avant tout
    { category: 'platines', tier: 3, branch: 'A', nom: 'Cabine de légende', price: 7000, value: 1.3, seizable: true },
    { category: 'platines', tier: 4, branch: 'A', nom: 'Régie chirurgicale', price: 4000, value: 1.38, seizable: true },
    { category: 'platines', tier: 5, branch: 'A', nom: 'Laboratoire du son', price: 10000, value: 1.5, seizable: true },
    // voie B — Showmanship : le charisme effectif de tout le crew +1
    { category: 'platines', tier: 3, branch: 'B', nom: 'Cabine spectacle', price: 7000, value: 1.2, seizable: true, effects: { charismeBonus: 1 } },
    { category: 'platines', tier: 4, branch: 'B', nom: 'Scène à paillettes', price: 4000, value: 1.26, seizable: true, effects: { charismeBonus: 1 } },
    { category: 'platines', tier: 5, branch: 'B', nom: 'Cathédrale du show', price: 10000, value: 1.32, seizable: true, effects: { charismeBonus: 1 } },
  ],
  mur: [
    { category: 'mur', tier: 0, nom: 'Les vieilles enceintes du camion', price: 0, value: 0.6, seizable: false },
    { category: 'mur', tier: 1, nom: 'Stack honnête', price: 625, value: 1.0, seizable: true },
    { category: 'mur', tier: 2, nom: 'Gros système', price: 3000, value: 1.45, seizable: true },
    // voie A — Infrabasses : cap ++, la foule reste collée au mur
    { category: 'mur', tier: 3, branch: 'A', nom: 'Mur de son', price: 7500, value: 2.0, seizable: true, effects: { churnMult: 0.88 } },
    { category: 'mur', tier: 4, branch: 'A', nom: 'Mur d’infrabasses', price: 4000, value: 2.4, seizable: true, effects: { churnMult: 0.82 } },
    { category: 'mur', tier: 5, branch: 'A', nom: 'Cité du caisson', price: 10000, value: 2.9, seizable: true, effects: { churnMult: 0.75 } },
    // voie B — Line array : qualité +, le son porte moins → heat −
    { category: 'mur', tier: 3, branch: 'B', nom: 'Line array', price: 7500, value: 1.85, seizable: true, effects: { qualityMult: 1.06, heatMult: 0.92 } },
    { category: 'mur', tier: 4, branch: 'B', nom: 'Line array V2', price: 4000, value: 2.1, seizable: true, effects: { qualityMult: 1.09, heatMult: 0.88 } },
    { category: 'mur', tier: 5, branch: 'B', nom: 'Arc de son', price: 10000, value: 2.5, seizable: true, effects: { qualityMult: 1.12, heatMult: 0.84 } },
  ],
  groupe: [
    { category: 'groupe', tier: 0, nom: 'Groupe poussif', price: 0, value: 0.62, seizable: false },
    { category: 'groupe', tier: 1, nom: 'Groupe de chantier', price: 450, value: 0.8, seizable: true },
    { category: 'groupe', tier: 2, nom: 'Groupe insonorisé', price: 2250, value: 0.95, seizable: true },
    // voie A — Silencieux : heat −, power honnête
    { category: 'groupe', tier: 3, branch: 'A', nom: 'Semi silencieux', price: 6250, value: 1.2, seizable: true, effects: { heatMult: 0.9 } },
    { category: 'groupe', tier: 4, branch: 'A', nom: 'Caisson furtif', price: 4000, value: 1.32, seizable: true, effects: { heatMult: 0.85 } },
    { category: 'groupe', tier: 5, branch: 'A', nom: 'Centrale fantôme', price: 10000, value: 1.45, seizable: true, effects: { heatMult: 0.8 } },
    // voie B — Monstre : power ++, pousser sans surcharge (RÉVISION CHANTIER 1 : RINSE)
    { category: 'groupe', tier: 3, branch: 'B', nom: 'Semi monstre', price: 6250, value: 1.35, seizable: true },
    { category: 'groupe', tier: 4, branch: 'B', nom: 'Turbine de chantier', price: 4000, value: 1.55, seizable: true, effects: { pousserPowerFree: true } },
    { category: 'groupe', tier: 5, branch: 'B', nom: 'Réacteur du teknival', price: 10000, value: 1.85, seizable: true, effects: { pousserPowerFree: true } },
  ],
  lumieres: [
    { category: 'lumieres', tier: 0, nom: 'Trois ampoules', price: 0, value: 0, seizable: false },
    { category: 'lumieres', tier: 1, nom: 'Barre de LEDs', price: 300, value: 0.06, seizable: true },
    { category: 'lumieres', tier: 2, nom: 'Lasers + stroboscope', price: 2000, value: 0.12, seizable: true },
    // voie A — Hypnose : vibe +, la foule décroche moins
    // RÉVISION CHANTIER 1 : « burnout de foule ralenti » → fallback churnMult
    { category: 'lumieres', tier: 3, branch: 'A', nom: 'Show hypnose', price: 5500, value: 0.24, seizable: true, effects: { churnMult: 0.9 } },
    { category: 'lumieres', tier: 4, branch: 'A', nom: 'Spirale de lasers', price: 4000, value: 0.28, seizable: true, effects: { churnMult: 0.85 } },
    { category: 'lumieres', tier: 5, branch: 'A', nom: 'Aurore artificielle', price: 10000, value: 0.32, seizable: true, effects: { churnMult: 0.8 } },
    // voie B — Stroboscopique : le drop paie plus
    { category: 'lumieres', tier: 3, branch: 'B', nom: 'Mur de strobes', price: 5500, value: 0.2, seizable: true, effects: { dropMult: 1.25 } },
    { category: 'lumieres', tier: 4, branch: 'B', nom: 'Tempête blanche', price: 4000, value: 0.22, seizable: true, effects: { dropMult: 1.5 } },
    { category: 'lumieres', tier: 5, branch: 'B', nom: 'Éclipse stroboscopique', price: 10000, value: 0.25, seizable: true, effects: { dropMult: 1.8 } },
  ],
  logistique: [
    { category: 'logistique', tier: 0, nom: 'Personne au portail', price: 0, value: 1.0, seizable: false },
    { category: 'logistique', tier: 1, nom: 'Deux guetteurs', price: 450, value: 0.85, seizable: true },
    { category: 'logistique', tier: 2, nom: 'Talkies + spots de repli', price: 2250, value: 0.7, seizable: true },
    // voie A — Réseau : la chaleur monte encore moins
    // RÉVISION CHANTIER 1 : « descente retardée, négo + » → fallback value (heat) plus bas
    { category: 'logistique', tier: 3, branch: 'A', nom: 'Réseau de la scène', price: 6000, value: 0.55, seizable: true },
    { category: 'logistique', tier: 4, branch: 'A', nom: 'Toile d’indics', price: 4000, value: 0.48, seizable: true },
    { category: 'logistique', tier: 5, branch: 'A', nom: 'La scène entière', price: 10000, value: 0.4, seizable: true },
    // voie B — Mobilité : cautions −50 %
    // RÉVISION CHANTIER 1 : « évacuation sans malus de rep » à brancher sur la descente
    { category: 'logistique', tier: 3, branch: 'B', nom: 'Convoi mobile', price: 6000, value: 0.6, seizable: true, effects: { cautionMult: 0.5 } },
    { category: 'logistique', tier: 4, branch: 'B', nom: 'Caravane éclair', price: 4000, value: 0.55, seizable: true, effects: { cautionMult: 0.5 } },
    { category: 'logistique', tier: 5, branch: 'B', nom: 'Flotte insaisissable', price: 10000, value: 0.48, seizable: true, effects: { cautionMult: 0.35 } },
  ],
};

export const GEAR_CATEGORIES: GearCategory[] = ['platines', 'mur', 'groupe', 'lumieres', 'logistique'];

/** Le matos branche à partir de ce tier — la voie se choisit à l'achat. */
export const BRANCH_TIER = 3;

export function gearItem(cat: GearCategory, tier: number, branch?: GearBranch): GearItem {
  const item = GEAR[cat].find(
    (g) => g.tier === tier && (tier < BRANCH_TIER || g.branch === branch),
  );
  if (!item) throw new Error(`unknown gear: ${cat} t${tier} ${branch ?? ''}`);
  return item;
}

/** L'item possédé d'une catégorie (tier + voie choisie). */
export function ownedGear(state: GameState, cat: GearCategory): GearItem {
  return gearItem(cat, state.gear[cat], state.gearBranch[cat]);
}

/** Prochains achats : deux options au passage du tier 3, une seule ensuite. */
export function nextGearOptions(state: GameState, cat: GearCategory): GearItem[] {
  const nextTier = state.gear[cat] + 1;
  if (nextTier < BRANCH_TIER) return GEAR[cat].filter((g) => g.tier === nextTier);
  if (nextTier === BRANCH_TIER) {
    return ['A', 'B'].map((b) => gearItem(cat, BRANCH_TIER, b as GearBranch));
  }
  const branch = state.gearBranch[cat];
  return GEAR[cat].filter((g) => g.tier === nextTier && g.branch === branch);
}

/** L'item miroir de la voie non choisie au tier courant, ou null avant le tier 3. */
export function switchBranchItem(state: GameState, cat: GearCategory): GearItem | null {
  const tier = state.gear[cat];
  const branch = state.gearBranch[cat];
  if (tier < BRANCH_TIER || !branch) return null;
  return gearItem(cat, tier, branch === 'A' ? 'B' : 'A');
}

/** The scene's DJs. The first one is the founding crew member, unlosable. */
export const DJS: DjDef[] = [
  {
    id: 'tonton',
    nom: 'Tonton Madère',
    description: 'Le pote du camion. Pas le plus fin des mixes, mais il était là avant tout le monde.',
    technique: 1,
    charisme: 2,
    genre: 'hardtek',
    risk: 'normal',
    cut: 0.05,
    repReq: 0,
    sprite: 3,
  },
  {
    id: 'gamine',
    nom: 'La Gamine',
    description: 'Dix-neuf ans, une clé USB, zéro peur. Sa 303 fait lever les champs entiers.',
    technique: 2,
    charisme: 3,
    genre: 'acid',
    risk: 'chaud',
    cut: 0.1,
    repReq: 6,
    sprite: 7,
  },
  {
    id: 'boblepine',
    nom: 'Bob Lépine',
    description: 'Dread jusqu’aux reins, basses jusqu’au sternum. Ne joue jamais au-dessus de 90 BPM.',
    technique: 3,
    charisme: 2,
    genre: 'dub',
    risk: 'discret',
    cut: 0.12,
    repReq: 20,
    sprite: 11,
  },
  {
    id: 'kilowatt',
    nom: 'Kilowatt',
    description: 'Ancien électricien. Pousse tout dans le rouge, y compris sa chance.',
    technique: 3,
    charisme: 3,
    genre: 'frenchcore',
    risk: 'chaud',
    cut: 0.15,
    repReq: 55,
    sprite: 2,
  },
  {
    id: 'memeacide',
    nom: 'Mémé Acide',
    description: 'Elle teufait déjà avant ta naissance. Sa collection de vinyles vaut plus que ton camion.',
    technique: 4,
    charisme: 3,
    genre: 'mentale',
    risk: 'normal',
    cut: 0.18,
    repReq: 160,
    sprite: 15,
  },
  {
    id: 'notaire',
    nom: 'Le Notaire',
    description: 'Costume en semaine, sound system le week-end. Personne ne connaît son vrai nom.',
    technique: 4,
    charisme: 4,
    genre: 'techno',
    risk: 'discret',
    cut: 0.22,
    repReq: 260,
    sprite: 6,
  },
  {
    id: 'sirene',
    nom: 'Sirène',
    description: 'Quand elle mixe, même les guetteurs quittent leur poste pour danser.',
    technique: 5,
    charisme: 4,
    genre: 'raggatek',
    risk: 'chaud',
    cut: 0.25,
    repReq: 380,
    sprite: 17,
  },
  {
    id: 'fantome',
    nom: 'Fantôme',
    description: 'Une légende. Apparaît, retourne le teknival, disparaît. On dit qu’il a déjà joué masqué à ta première teuf.',
    technique: 5,
    charisme: 5,
    genre: 'darkpsy',
    risk: 'discret',
    cut: 0.3,
    repReq: 500,
    sprite: 19,
  },
];

export function getSpot(id: SpotId): SpotDef {
  const spot = SPOTS.find((s) => s.id === id);
  if (!spot) throw new Error(`unknown spot: ${id}`);
  return spot;
}

export function getGenre(id: GenreId): GenreDef {
  const genre = GENRES.find((g) => g.id === id);
  if (!genre) throw new Error(`unknown genre: ${id}`);
  return genre;
}

export function getDj(id: string): DjDef {
  const dj = DJS.find((d) => d.id === id);
  if (!dj) throw new Error(`unknown dj: ${id}`);
  return dj;
}
