import type { Brief } from '../core/types';

/**
 * Toutes les chaînes UI, externalisées pour une future i18n.
 * Français only, argot free-party pleinement assumé.
 */
export const STR = {
  title: 'Rave Tycoon',
  tagline: 'Monte ton sound system. Mène ton crew jusqu’au lever du soleil.',

  // prepare screen
  prepare: 'Préparation',
  chooseSpot: 'Le spot',
  chooseCrew: 'Le crew',
  locked: 'Verrouillé',
  repNeeded: (n: number) => `${n} rép nécessaire`,
  launch: 'Lancer la teuf',
  needOneDj: 'Embarque au moins un DJ',
  shop: 'Le matos',
  buy: 'Acheter',
  maxed: 'Au max',
  damaged: 'HS',
  repair: 'Réparer',
  repairing: 'En réparation…',
  rush: (cost: number) => `Réparer cash (${cost} €)`,
  readyIn: (txt: string) => `prêt dans ${txt}`,
  cash: 'Caisse',
  rep: 'Réputation',
  buzz: 'Buzz',
  buzzHint:
    'Le bouche-à-oreille booste l’affluence de la prochaine teuf et retombe si tu restes silencieux. Les DJ laissés à quai récupèrent leur fatigue à chaque nuit.',
  duration: (min: number) => `~${min} min`,
  setsCount: (n: number) => `${n} sets`,
  capacity: (n: number) => `${n} pers. max`,
  gearCats: {
    platines: 'Platines',
    mur: 'Mur de son',
    groupe: 'Groupe électrogène',
    lumieres: 'Lumières',
    logistique: 'Logistique',
  } as const,
  gearEffect: {
    platines: 'Meilleurs sets pour tous les DJs',
    mur: 'Plus de monde devant le mur',
    groupe: 'Moins de coupures de courant',
    lumieres: 'Plus d’ambiance, plus de spectacle',
    logistique: 'Guetteurs et plans de repli — moins de chaleur',
  } as const,

  // crew
  technique: 'Technique',
  charisme: 'Charisme',
  fatigue: 'Fatigue',
  exhausted: 'Cramé·e',
  fresh: 'Frais·che',
  qualityMalus: (pct: number) => `−${pct} % qualité`,
  cut: (pct: number) => `${Math.round(pct * 100)} % de la recette`,
  level: (n: number) => `Niv. ${n}`,
  risk: { discret: 'Discret', normal: 'Normal', chaud: 'Chaud bouillant' } as const,
  riskHint: { discret: 'passe sous les radars', normal: '', chaud: 'attire les bleus' } as const,
  recruit: 'Recruter',
  inCrew: 'Dans le crew',
  bringTonight: 'Embarquer ce soir',
  newRecruit: (nom: string) => `${nom} veut rejoindre le crew !`,

  // night screen
  setLabel: (n: number, total: number) => `Set ${n}/${total}`,
  whoPlays: 'Qui prend les platines ?',
  briefLabel: 'La consigne',
  briefs: {
    safe: 'Jouer safe',
    normal: 'Set normal',
    pousser: 'Pousser le son',
  } as const,
  briefHints: {
    safe: 'La chaleur retombe, le public s’ennuie un peu',
    normal: 'Le plan prévu, ni plus ni moins',
    pousser: 'Plus de monde, plus de vibe — et les bleus rappliquent',
  } as const,
  startSet: 'Balance le son',
  briefShort: { safe: 'Calmer', normal: 'Normal', pousser: 'Pousser' } as Record<Brief, string>,
  dropAction: '🔊 LÂCHER',
  dropToast: '🔊 Le drop fait exploser le champ !',
  briefToast: (b: Brief) => `🎚 Consigne : ${STR.briefs[b]}`,
  promptToast: (icon: string, label: string) => `${icon} ${label}`,
  nowPlaying: (nom: string) => `${nom} aux platines`,
  heat: 'Les bleus',
  crowdLabel: 'teufeurs',
  bankLabel: 'buvette',
  sunriseIn: 'lever du soleil',
  vibeLabel: 'ambiance',
  setGoalLabel: 'objectif',
  modifiersBanner: 'Ce soir…',
  modifiersRecapTitle: 'La couleur du soir',
  events: {
    brownout: '⚡ Le groupe décroche ! Le son se coupe.',
    'mur-blown': '💥 Une enceinte vient de lâcher !',
    bust: '🚨 LES BLEUS ! La teuf est terminée.',
    sunrise: '🌅 Le soleil se lève sur le dancefloor…',
    'set-ended': '🎚 Fin du set — à qui le tour ?',
    'prompt-missed': '🙈 Trop tard — tu as laissé passer le moment.',
    heatWarning: '👮 Ça sent le roussi… calme le jeu.',
  },
  cantAfford: 'La caisse ne suit pas',

  // recap
  sunrise: 'Lever du soleil',
  busted: 'PERQUISITIONNÉ',
  wonTitle: 'LÉGENDE DU TEKNIVAL',
  wonText:
    'Ton crew a tenu le mur de son jusqu’au matin devant une marée humaine. Le téléphone arabe de la scène ne parle plus que de vous. Le camion repart, et l’histoire est en marche.',
  peakCrowd: 'Pic d’affluence',
  barTotal: 'Recette buvette',
  donations: 'Prix libre',
  donationsMult: (m: string) => `×${m} (ambiance + affluence)`,
  djCuts: (pct: number) => `Parts du crew (−${Math.round(pct * 100)} %)`,
  lineupLabel: 'Le line-up de la nuit',
  fine: 'Amende',
  seized: (gear: string) => `Matos saisi : ${gear}`,
  bustCut: 'Recette perdue dans la panique',
  repGained: (n: number) => `+${n} réputation`,
  nightJournal: 'Les histoires de la nuit',
  goalsRecapTitle: 'Objectifs tenus',
  total: 'Pour la caisse',
  continue: 'Retour au camion',
  share: 'Partager la carte',

  // leaderboard
  leaderboard: 'Classement',
  boards: { crowd: 'Plus grosse teuf', payout: 'Plus gros gain', bust: 'Bust le plus légendaire' } as const,
  pseudoPlaceholder: 'Ton blaze',
  submitScore: 'Envoyer au classement',
  scoreSent: 'Score envoyé !',
  offline: 'Classement injoignable — mode hors-ligne',
  emptyBoard: 'Personne pour l’instant. Sois la légende.',
  back: 'Retour',

  // save
  saves: 'Sauvegarde',
  exportSave: 'Exporter le code',
  importSave: 'Importer un code',
  importPrompt: 'Colle ton code de sauvegarde :',
  importOk: 'Sauvegarde importée !',
  importBad: 'Code invalide.',
  copied: 'Code copié !',
  newGameBtn: 'Nouvelle partie',
  newGameConfirm: 'Tout effacer et repartir de zéro ?',

  // misc
  firstTimeHint:
    'Choisis ton spot et embarque ton crew — chaque DJ amène son propre son. Enchaîne les bons sets pendant la nuit : pousser le son remplit le champ… et la jauge des bleus.',
} as const;

export function fmtCash(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} €`;
}

export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
  if (s >= 60) return `${Math.floor(s / 60)} min`;
  return `${s} s`;
}
