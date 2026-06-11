import type {
  DjDef,
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
];

/**
 * Gear semantics by category (`value`):
 * - platines:   set quality multiplier
 * - mur:        crowd capacity multiplier (also the visible wall on screen)
 * - groupe:     power supply (vs demand from crowd+brief) — low tier = brownouts
 * - lumieres:   flat vibe bonus
 * - logistique: heat multiplier (lower = guetteurs warn earlier, cops bite less)
 */
export const GEAR: Record<GearCategory, GearItem[]> = {
  platines: [
    { category: 'platines', tier: 0, nom: 'Platines de récup', price: 0, value: 0.85, seizable: false },
    { category: 'platines', tier: 1, nom: 'Contrôleur d’occase', price: 200, value: 1.0, seizable: true },
    { category: 'platines', tier: 2, nom: 'Setup pro', price: 1000, value: 1.12, seizable: true },
    { category: 'platines', tier: 3, nom: 'Cabine de légende', price: 2800, value: 1.25, seizable: true },
  ],
  mur: [
    { category: 'mur', tier: 0, nom: 'Les vieilles enceintes du camion', price: 0, value: 0.6, seizable: false },
    { category: 'mur', tier: 1, nom: 'Stack honnête', price: 250, value: 1.0, seizable: true },
    { category: 'mur', tier: 2, nom: 'Gros système', price: 1200, value: 1.45, seizable: true },
    { category: 'mur', tier: 3, nom: 'Mur de son', price: 3000, value: 2.0, seizable: true },
  ],
  groupe: [
    { category: 'groupe', tier: 0, nom: 'Groupe poussif', price: 0, value: 0.62, seizable: false },
    { category: 'groupe', tier: 1, nom: 'Groupe de chantier', price: 180, value: 0.8, seizable: true },
    { category: 'groupe', tier: 2, nom: 'Groupe insonorisé', price: 900, value: 0.95, seizable: true },
    { category: 'groupe', tier: 3, nom: 'Semi-remorque énergie', price: 2500, value: 1.2, seizable: true },
  ],
  lumieres: [
    { category: 'lumieres', tier: 0, nom: 'Trois ampoules', price: 0, value: 0, seizable: false },
    { category: 'lumieres', tier: 1, nom: 'Barre de LEDs', price: 120, value: 0.06, seizable: true },
    { category: 'lumieres', tier: 2, nom: 'Lasers + stroboscope', price: 800, value: 0.12, seizable: true },
    { category: 'lumieres', tier: 3, nom: 'Show lumière complet', price: 2200, value: 0.2, seizable: true },
  ],
  logistique: [
    { category: 'logistique', tier: 0, nom: 'Personne au portail', price: 0, value: 1.0, seizable: false },
    { category: 'logistique', tier: 1, nom: 'Deux guetteurs', price: 180, value: 0.85, seizable: true },
    { category: 'logistique', tier: 2, nom: 'Talkies + spots de repli', price: 900, value: 0.7, seizable: true },
    { category: 'logistique', tier: 3, nom: 'Réseau de la scène', price: 2400, value: 0.55, seizable: true },
  ],
};

export const GEAR_CATEGORIES: GearCategory[] = ['platines', 'mur', 'groupe', 'lumieres', 'logistique'];

/** The scene's DJs. The first one is the founding crew member, unlosable. */
export const DJS: DjDef[] = [
  {
    id: 'tonton',
    nom: 'Tonton Madère',
    description: 'Le pote du camion. Pas le plus fin des mixes, mais il était là avant tout le monde.',
    technique: 1,
    charisme: 2,
    affinities: { hardtek: 1.0, acid: 0.8, dub: 0.8 },
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
    affinities: { hardtek: 0.9, acid: 1.2, dub: 0.6 },
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
    affinities: { hardtek: 0.6, acid: 0.8, dub: 1.2 },
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
    affinities: { hardtek: 1.2, acid: 1.0, dub: 0.6 },
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
    affinities: { hardtek: 1.0, acid: 1.2, dub: 0.8 },
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
    affinities: { hardtek: 1.0, acid: 1.0, dub: 1.0 },
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
    affinities: { hardtek: 1.2, acid: 1.0, dub: 0.8 },
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
    affinities: { hardtek: 1.1, acid: 1.1, dub: 1.1 },
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
