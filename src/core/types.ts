export type SpotId =
  | 'champ'
  | 'foret'
  | 'carriere'
  | 'hangar'
  | 'friche'
  | 'teknival';

export type GenreId = 'hardtek' | 'acid' | 'dub';

/** v2 gear: five categories serving the management sim. */
export type GearCategory = 'platines' | 'mur' | 'groupe' | 'lumieres' | 'logistique';

export interface SpotDef {
  id: SpotId;
  nom: string;
  description: string;
  /** base crowd capacity (multiplied by mur de son tier) */
  cap: number;
  /** base raver arrivals per second */
  arrival: number;
  /** heat build rate per second at full tilt */
  heatBuild: number;
  repReq: number;
  tier: number;
  /** rave length in seconds */
  duration: number;
  /** number of DJ sets in the night */
  setCount: number;
  /** bar price multiplier */
  priceMult: number;
  /** quirk: power supply multiplier (carriere = poor power access) */
  powerMult: number;
}

export interface GenreDef {
  id: GenreId;
  nom: string;
  bpm: number;
  arrival: number;
  /** fraction of crowd leaving per second at baseline */
  churn: number;
  heatMult: number;
  description: string;
}

export interface GearItem {
  category: GearCategory;
  tier: number;
  nom: string;
  price: number;
  /** category-specific magnitude (see data.ts for semantics) */
  value: number;
  seizable: boolean;
}

export type DjRisk = 'discret' | 'normal' | 'chaud';

/** Static definition of a DJ available in the scene. */
export interface DjDef {
  id: string;
  nom: string;
  description: string;
  /** raw set quality, 1-5 */
  technique: number;
  /** crowd draw & retention, 1-5 */
  charisme: number;
  affinities: Record<GenreId, number>;
  risk: DjRisk;
  /** share of the night's takings this DJ demands, e.g. 0.15 */
  cut: number;
  /** reputation needed before they want to join the crew */
  repReq: number;
  /** index into the character sprite roster (visuals + portrait) */
  sprite: number;
}

/** Mutable per-save state of a crew member. */
export interface DjState {
  id: string;
  xp: number;
  /** 0 = fresh, 1 = exhausted; recovers in real time */
  fatigue: number;
  setsPlayed: number;
}

export type Brief = 'safe' | 'normal' | 'pousser';

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
  damaged: Partial<Record<GearCategory, boolean>>;
  repairs: RepairJob[];
  crew: DjState[];
  pseudo: string;
  lastSeen: number;
  bestCrowd: number;
  bestPayout: number;
  wonTeknival: boolean;
}

// --- the night ----------------------------------------------------------------

export type NightPhase = 'transition' | 'playing' | 'event' | 'ended';

export interface EventOption {
  label: string;
  /** short flavor of what happened, shown after choosing */
  outcome: string;
  effects: EventEffects;
}

export interface EventEffects {
  heat?: number;
  vibe?: number;
  /** fraction of current crowd gained/lost, e.g. -0.1 */
  crowdFrac?: number;
  /** flat cash from the bank (can be negative) */
  cash?: number;
  /** force the current set's brief */
  forceBrief?: Brief;
  /** multiply set quality for the rest of the current set */
  qualityMult?: number;
  /** chance [0,1] that a gear category takes damage */
  damageRisk?: { category: GearCategory; chance: number };
  /** cut the sound for n seconds */
  soundCut?: number;
  /** bonus reputation at settle */
  rep?: number;
  /** halve arrivals for n seconds */
  arrivalCutT?: number;
}

export interface NightEventDef {
  id: string;
  titre: string;
  texte: string;
  options: EventOption[];
  /** contextual weight; 0 disables (see events.ts) */
  weight: (ctx: EventContext) => number;
}

export interface EventContext {
  heat: number;
  spotTier: number;
  brief: Brief;
  djRisk: DjRisk;
  crowdRatio: number;
  gear: Record<GearCategory, number>;
}

export interface PendingEvent {
  def: NightEventDef;
}

export interface SetRecord {
  djId: string;
  brief: Brief;
}

export interface JournalEntry {
  /** night-seconds when it happened */
  t: number;
  titre: string;
  outcome: string;
}

export interface NightState {
  spotId: SpotId;
  genreId: GenreId;
  phase: NightPhase;
  /** crew members present tonight */
  presentDjs: string[];
  setIndex: number;
  setCount: number;
  setLen: number;
  setElapsed: number;
  /** total elapsed seconds across the night */
  t: number;
  duration: number;
  currentDj: string | null;
  brief: Brief;
  /** current set quality in ~[0.2, 1.4] */
  setQuality: number;
  crowd: number;
  peakCrowd: number;
  cap: number;
  vibe: number;
  vibeSum: number;
  vibeSamples: number;
  heat: number;
  peakHeat: number;
  bank: number;
  murStress: number;
  murBlown: boolean;
  /** seconds of sound cut remaining (brownout / repairs) */
  soundCutT: number;
  brownoutCooldown: number;
  pendingEvent: PendingEvent | null;
  eventsFired: string[];
  nextEventAt: number;
  qualityMultRestOfSet: number;
  arrivalCutT: number;
  repBonus: number;
  /** seconds before the brief can be changed again mid-set */
  briefLockT: number;
  /** seconds before the hype drop is available again */
  hypeT: number;
  playedSets: SetRecord[];
  journal: JournalEntry[];
  busted: boolean;
  sunrise: boolean;
  rng: () => number;
}

export type NightTickEventType =
  | 'brownout'
  | 'mur-blown'
  | 'bust'
  | 'sunrise'
  | 'set-ended';

export interface NightTickEvent {
  type: NightTickEventType;
}

export interface NightResult {
  spotId: SpotId;
  genreId: GenreId;
  busted: boolean;
  won: boolean;
  bank: number;
  donationMult: number;
  /** gross takings before DJ cuts (after bust losses) */
  gross: number;
  /** sum of DJ cut fractions applied */
  cutsTotal: number;
  /** net cash credited to the crew */
  payout: number;
  fine: number;
  seized: GearCategory | null;
  repGained: number;
  peakCrowd: number;
  avgVibe: number;
  duration: number;
  lineup: SetRecord[];
  journal: JournalEntry[];
}
