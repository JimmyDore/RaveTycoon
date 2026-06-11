export type SpotId =
  | 'champ'
  | 'foret'
  | 'carriere'
  | 'hangar'
  | 'friche'
  | 'teknival';

export type GenreId = 'hardtek' | 'acid' | 'dub';

export type GearCategory = 'amps' | 'subs' | 'gen';

export interface SpotDef {
  id: SpotId;
  nom: string;
  description: string;
  cap: number;
  /** base raver arrivals per second */
  arrival: number;
  /** heat build rate per second at full tilt */
  heatBuild: number;
  repReq: number;
  tier: number;
  /** rave length in seconds */
  duration: number;
  /** bar price multiplier */
  priceMult: number;
  /** quirk: generator capacity multiplier (carriere = poor power access) */
  genCapacityMult: number;
}

export interface GenreDef {
  id: GenreId;
  nom: string;
  bpm: number;
  /** arrival rate multiplier */
  arrival: number;
  /** fraction of crowd leaving per second at zero bass */
  churn: number;
  heatMult: number;
  description: string;
}

export interface GearItem {
  category: GearCategory;
  tier: number;
  nom: string;
  price: number;
  /** headroom or capacity granted (volume/bass cap, kW budget) */
  value: number;
  seizable: boolean;
}

/** Desk fader positions, all in [0, 1]. */
export interface Controls {
  volume: number;
  bass: number;
  power: number;
}

export interface RepairJob {
  category: GearCategory;
  /** epoch ms at which the repair completes */
  readyAt: number;
}

export interface GameState {
  version: number;
  cash: number;
  rep: number;
  buzz: number;
  busts: number;
  nights: number;
  /** owned tier index per gear category */
  gear: Record<GearCategory, number>;
  damaged: Record<GearCategory, boolean>;
  repairs: RepairJob[];
  pseudo: string;
  /** epoch ms of last time idle was applied */
  lastSeen: number;
  bestCrowd: number;
  bestPayout: number;
  wonTeknival: boolean;
}

export interface RaveState {
  spotId: SpotId;
  genreId: GenreId;
  /** seconds elapsed */
  t: number;
  duration: number;
  crowd: number;
  peakCrowd: number;
  /** current vibe in [0, 1] */
  vibe: number;
  vibeSum: number;
  vibeSamples: number;
  heat: number;
  peakHeat: number;
  /** cash banked during the night (bar drip) */
  bank: number;
  ampStress: number;
  subStress: number;
  genStress: number;
  ampBlown: boolean;
  subBlown: boolean;
  /** seconds of brownout remaining (sound cut) */
  brownoutT: number;
  /** seconds until another brownout may trigger */
  brownoutCooldown: number;
  ended: boolean;
  busted: boolean;
  sunrise: boolean;
  /** snapshot of effective gear parameters for the night */
  ampHeadroom: number;
  subHeadroom: number;
  genCapacity: number;
  rng: () => number;
}

export type RaveEventType =
  | 'brownout'
  | 'blown-amp'
  | 'blown-sub'
  | 'bust'
  | 'sunrise';

export interface RaveEvent {
  type: RaveEventType;
}

export interface NightResult {
  spotId: SpotId;
  genreId: GenreId;
  busted: boolean;
  /** true when the night was the teknival finale survived to sunrise */
  won: boolean;
  /** cash banked during the night */
  bank: number;
  donationMult: number;
  /** final cash credited (after donations or bust losses) */
  payout: number;
  fine: number;
  /** gear category seized by the cops, if any */
  seized: GearCategory | null;
  repGained: number;
  peakCrowd: number;
  avgVibe: number;
  duration: number;
}
