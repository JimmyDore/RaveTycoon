import type { NightModifierDef } from './modifiers';
import type { RegionRules, RegionState } from './regions';

export type SpotId =
  | 'champ'
  | 'foret'
  | 'carriere'
  | 'plage'
  | 'hangar'
  | 'tunnel'
  | 'chateau'
  | 'friche'
  | 'teknival';

export type GenreId =
  | 'hardtek'
  | 'acid'
  | 'dub'
  | 'frenchcore'
  | 'mentale'
  | 'techno'
  | 'raggatek'
  | 'darkpsy'
  | 'tribe'
  | 'hardcore'
  | 'downtempo'
  | 'electro';

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
  /** quirk: crowd churn multiplier (plage = on reste) */
  churnMult: number;
  /** quirk: set quality multiplier (tunnel = acoustique énorme) */
  qualityMult: number;
  /** quirk: prix libre multiplier at settle (château = ×1.3) */
  donationMult: number;
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

export type GearBranch = 'A' | 'B';

/** Branch perks mapped onto existing sim levers (see night.ts). */
export interface GearEffects {
  /** platines B — charisme effectif +1 pour tous les DJs */
  charismeBonus?: number;
  /** mur A / lumières A — la foule reste (multiplie le churn) */
  churnMult?: number;
  /** mur B / groupe A — le son porte moins loin (multiplie la heat) */
  heatMult?: number;
  /** mur B — line array : bonus de qualité de set */
  qualityMult?: number;
  /** groupe B — pousser le son ne surcharge plus le groupe.
   *  RÉVISION CHANTIER 1 : devient « RINSE sans surcharge » avec les crans. */
  pousserPowerFree?: boolean;
  /** lumières B — payoff du drop multiplié */
  dropMult?: number;
  /** logistique B — cautions multipliées (< 1 = réduction) */
  cautionMult?: number;
}

export interface GearItem {
  category: GearCategory;
  tier: number;
  /** voie exclusive à partir du tier 3 ('A' | 'B'), absente avant */
  branch?: GearBranch;
  nom: string;
  price: number;
  /** category-specific magnitude (see data.ts for semantics) */
  value: number;
  seizable: boolean;
  /** tier mythique : achat en € gated par le perk `mythe-<categorie>` de l'Héritage */
  mythic?: boolean;
  /** leviers de voie additionnels (voir GearEffects) */
  effects?: GearEffects;
}

export type DjRisk = 'discret' | 'normal' | 'chaud';

/**
 * Gimmick unique des DJs légendaires — branché sur des leviers existants :
 * - insaisissable : moitié moins de heat (RÉVISION CHANTIER 1: deviendra
 *   l'immunité à la garde à vue quand elle existera)
 * - increvable : ne prend jamais de fatigue
 */
export type DjGimmick = 'insaisissable' | 'increvable';

/** Static definition of a DJ available in the scene. */
export interface DjDef {
  id: string;
  nom: string;
  description: string;
  /** raw set quality, 1-5 */
  technique: number;
  /** crowd draw & retention, 1-5 */
  charisme: number;
  /** signature genre — the only sound this DJ plays */
  genre: GenreId;
  risk: DjRisk;
  /** share of the night's takings this DJ demands, e.g. 0.15 */
  cut: number;
  /** reputation needed before they want to join the crew */
  repReq: number;
  /** index into the character sprite roster (visuals + portrait) */
  sprite: number;
  /** perk de l'Héritage requis pour apparaître dans le pool (Têtes d'affiche) */
  perk?: string;
  /** gimmick unique des DJs légendaires */
  gimmick?: DjGimmick;
}

/** Mutable per-save state of a crew member. */
export interface DjState {
  id: string;
  xp: number;
  /** 0 = fresh, 1 = exhausted; recovers per rested night (a night played no set) */
  fatigue: number;
  setsPlayed: number;
  /** 🎁 cadeau reçu — son cut a baissé de 2 points, une fois pour toutes */
  gifted: boolean;
  /** 🎚 bonus de technique permanent acheté en studio (0 / 0.5 / 1) */
  studioBonus: number;
}

export type Brief = 'safe' | 'normal' | 'pousser';

export interface RepairJob {
  category: GearCategory;
  /** epoch ms at which the repair completes */
  readyAt: number;
}

/** Méta-progression : la tournée courante et l'Héritage. Survit au départ en tournée. */
export interface TourState {
  /** numéro de la tournée en cours (1 = première partie) */
  number: number;
  /** ⭐ Légende en banque — la monnaie permanente de l'Héritage */
  legende: number;
  /** ids des perks achetés ; un id stackable apparaît plusieurs fois */
  perks: string[];
  /** ids des vétérans emmenés au départ de cette tournée (hors fondateur) */
  veteranIds: string[];
  /** victoires au Teknival sur cette tournée — remis à zéro à chaque départ */
  teknivalWins: number;
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
  /** voie choisie par catégorie une fois le tier 3 acheté */
  gearBranch: Partial<Record<GearCategory, GearBranch>>;
  damaged: Partial<Record<GearCategory, boolean>>;
  repairs: RepairJob[];
  crew: DjState[];
  pseudo: string;
  lastSeen: number;
  bestCrowd: number;
  bestPayout: number;
  wonTeknival: boolean;
  /** région de la tournée courante (chantier 4) — absente en tournée 1 */
  region?: RegionState;
  tour: TourState;
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
  /** charge/décharge la jauge de montée */
  montee?: number;
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

/** Flash-prompt non bloquant du dancefloor : tap pour saisir, ignore = expire. */
export interface FloorPromptDef {
  id: string;
  icon: string;
  label: string;
  /** secondes pour réagir (3–6) */
  window: number;
  /** effets au tap */
  seize: EventEffects;
  /** effets si ignoré (prompts « désamorçage ») */
  lapse?: EventEffects;
  /** poids contextuel ; 0 désactive (voir prompts.ts) */
  weight: (ctx: EventContext) => number;
}

/** Snapshot des accumulateurs d'un set, évalué à sa fin pour l'objectif. */
export interface SetStats {
  /** vibe moyenne sur le set */
  avgVibe: number;
  /** teufeurs gagnés (crowd fin − crowd début) */
  crowdGained: number;
  /** teufeurs présents en fin de set */
  crowdEnd: number;
  /** capacité du spot ce soir */
  cap: number;
  /** nombre de brownouts subis sur le set */
  brownouts: number;
  /** plus gros drop lâché sur le set */
  bestDrop: number;
  /** heat en fin de set */
  heat: number;
}

/**
 * Mini-objectif de set, tiré à chaque set. Bonus only — jamais de punition.
 * `met` lit les accumulateurs du set ; `weight` pondère le tirage au contexte.
 */
export interface SetGoalDef {
  id: string;
  label: string;
  reward: { rep?: number; cash?: number };
  met: (s: SetStats) => boolean;
  weight: (ctx: EventContext) => number;
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
  /** stock du bar choisi à la prépa — plafonne la recette buvette */
  barStock: 'leger' | 'normal' | 'large';
  /** plafond de vente buvette (en €) imposé par le stock */
  barCap: number;
  /** ventes buvette cumulées (seule la buvette est plafonnée, pas les events) */
  barSales: number;
  /** caution versée au lancement (0 si aucune) — rendue à l'aube, perdue sur bust */
  cautionPaid: number;
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
  /** tension gauge [0,1] — chargée en jouant, encaissée par un drop */
  montee: number;
  /** plus gros drop lâché sur le set courant (reset à chaque set) */
  bestDropThisSet: number;
  /** objectif du set courant, tiré à chaque startSet (ou null en transition) */
  setGoal: SetGoalDef | null;
  /** accumulateurs du set courant (reset à chaque startSet) */
  setVibeSum: number;
  setVibeSamples: number;
  setBrownouts: number;
  setCrowdStart: number;
  /** labels des objectifs atteints sur la nuit (rappelés au recap) */
  goalsMet: string[];
  /** flash-prompt non bloquant du dancefloor, ou null */
  floorPrompt: { def: FloorPromptDef; expiresAt: number } | null;
  /** prochain instant (en s) où un flash-prompt peut surgir */
  nextPromptAt: number;
  /** ids des flash-prompts déjà tirés (sans remise) */
  firedPrompts: string[];
  playedSets: SetRecord[];
  journal: JournalEntry[];
  /** modificateurs passifs du soir (météo/foule), révélés au lancement */
  modifiers: NightModifierDef[];
  /** règles de la région de tournée (identité en tournée 1), figées au lancement */
  rules: RegionRules;
  busted: boolean;
  sunrise: boolean;
  rng: () => number;
  /** flux RNG dédié au tirage des objectifs — isolé du flux des events */
  goalRng: () => number;
}

export type NightTickEventType =
  | 'brownout'
  | 'mur-blown'
  | 'bust'
  | 'sunrise'
  | 'set-ended'
  | 'prompt-missed';

export interface NightTickEvent {
  type: NightTickEventType;
}

export interface NightResult {
  spotId: SpotId;
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
  /** essence du groupe, prélevée sur le brut */
  essence: number;
  /** restock du bar, prélevé sur le brut */
  restock: number;
  /** caution versée au lancement */
  cautionPaid: number;
  /** caution rendue à l'aube (0 sur bust ou sans caution) */
  cautionReturned: number;
  seized: GearCategory | null;
  repGained: number;
  peakCrowd: number;
  avgVibe: number;
  duration: number;
  lineup: SetRecord[];
  journal: JournalEntry[];
  /** labels des objectifs de set atteints sur la nuit */
  goalsMet: string[];
  /** modificateurs passifs du soir (météo/foule), pour rappel au recap */
  modifiers: NightModifierDef[];
}
