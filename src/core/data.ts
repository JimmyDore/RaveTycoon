import type {
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
    arrival: 0.5,
    heatBuild: 0.004,
    repReq: 0,
    tier: 1,
    duration: 180,
    priceMult: 1,
    genCapacityMult: 1,
  },
  {
    id: 'foret',
    nom: 'Forêt',
    description: 'Pas de voisins, des arbres qui bouffent le son. Longues nuits tranquilles.',
    cap: 120,
    arrival: 0.55,
    heatBuild: 0.006,
    repReq: 25,
    tier: 2,
    duration: 240,
    priceMult: 1,
    genCapacityMult: 1,
  },
  {
    id: 'carriere',
    nom: 'Carrière abandonnée',
    description: 'Une acoustique de cathédrale, mais le courant n’arrive pas jusqu’ici : le groupe électrogène est le goulot.',
    cap: 220,
    arrival: 0.9,
    heatBuild: 0.011,
    repReq: 70,
    tier: 3,
    duration: 300,
    priceMult: 1,
    genCapacityMult: 0.6,
  },
  {
    id: 'hangar',
    nom: 'Hangar urbain',
    description: 'En pleine ville. Gros cachet, grosse jauge — et les bleus à deux rues.',
    cap: 400,
    arrival: 1.6,
    heatBuild: 0.022,
    repReq: 150,
    tier: 4,
    duration: 420,
    priceMult: 1.5,
    genCapacityMult: 1,
  },
  {
    id: 'friche',
    nom: 'Friche industrielle',
    description: 'Le grand frisson : immense, risqué, légendaire si tu tiens jusqu’au matin.',
    cap: 650,
    arrival: 2.0,
    heatBuild: 0.017,
    repReq: 280,
    tier: 5,
    duration: 540,
    priceMult: 1.2,
    genCapacityMult: 1,
  },
  {
    id: 'teknival',
    nom: 'Teknival',
    description: 'LE rendez-vous. Des murs de son à perte de vue. Tiens jusqu’au lever du soleil et tu entres dans la légende.',
    cap: 2000,
    arrival: 5.0,
    heatBuild: 0.013,
    repReq: 500,
    tier: 6,
    duration: 600,
    priceMult: 1.3,
    genCapacityMult: 1,
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

export const GEAR: Record<GearCategory, GearItem[]> = {
  amps: [
    { category: 'amps', tier: 0, nom: 'Ampli de récup', price: 0, value: 0.55, seizable: false },
    { category: 'amps', tier: 1, nom: 'Ampli d’occase', price: 300, value: 0.7, seizable: true },
    { category: 'amps', tier: 2, nom: 'Rack d’amplis pro', price: 900, value: 0.85, seizable: true },
    { category: 'amps', tier: 3, nom: 'Mur d’amplis', price: 2500, value: 1.0, seizable: true },
  ],
  subs: [
    { category: 'subs', tier: 0, nom: 'Les vieilles enceintes du camion', price: 0, value: 0.5, seizable: false },
    { category: 'subs', tier: 1, nom: 'Caissons bricolés', price: 300, value: 0.65, seizable: true },
    { category: 'subs', tier: 2, nom: 'Stack de subs', price: 900, value: 0.85, seizable: true },
    { category: 'subs', tier: 3, nom: 'Mur de basses', price: 2500, value: 1.0, seizable: true },
  ],
  gen: [
    { category: 'gen', tier: 0, nom: 'Groupe poussif', price: 0, value: 0.8, seizable: false },
    { category: 'gen', tier: 1, nom: 'Groupe de chantier', price: 300, value: 1.0, seizable: true },
    { category: 'gen', tier: 2, nom: 'Groupe insonorisé', price: 900, value: 1.25, seizable: true },
    { category: 'gen', tier: 3, nom: 'Semi-remorque énergie', price: 2500, value: 1.6, seizable: true },
  ],
};

export const GEAR_CATEGORIES: GearCategory[] = ['amps', 'subs', 'gen'];

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
