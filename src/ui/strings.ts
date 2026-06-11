/**
 * Toutes les chaînes UI, externalisées pour une future i18n.
 * Français only, argot free-party pleinement assumé.
 */
export const STR = {
  title: 'Rave Tycoon',
  tagline: 'Monte ton sound system. Tiens jusqu’au lever du soleil.',

  // prepare screen
  prepare: 'Préparation',
  chooseSpot: 'Le spot',
  chooseGenre: 'Le son',
  locked: 'Verrouillé',
  repNeeded: (n: number) => `${n} rép nécessaire`,
  launch: 'Lancer la teuf',
  shop: 'Le matos',
  owned: 'Installé',
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
  buzzHint: 'Le bouche-à-oreille booste l’affluence de la prochaine teuf. Il retombe si tu restes silencieux.',
  duration: (min: number) => `~${min} min`,
  capacity: (n: number) => `${n} pers. max`,
  gearCats: { amps: 'Amplis', subs: 'Enceintes', gen: 'Groupe électrogène' } as const,
  gearEffect: {
    amps: 'Plus de marge avant de clipper',
    subs: 'Plus de basses sans tout cramer',
    gen: 'Plus de budget électrique',
  } as const,

  // rave HUD
  volume: 'VOLUME',
  bass: 'BASSES',
  power: 'GROUPE',
  heat: 'Les bleus',
  crowdLabel: 'teufeurs',
  bankLabel: 'buvette',
  sunriseIn: 'lever du soleil',
  events: {
    brownout: '⚡ Le groupe décroche ! Baisse le son ou monte le jus.',
    'blown-amp': '🔥 Ampli cramé ! Le son est dégradé pour la nuit.',
    'blown-sub': '💥 Enceinte explosée ! Les basses sont à genoux.',
    bust: '🚨 LES BLEUS ! La teuf est terminée.',
    sunrise: '🌅 Le soleil se lève sur le dancefloor…',
    heatWarning: '👮 Ça sent le roussi… calme le son.',
  },

  // recap
  sunrise: 'Lever du soleil',
  busted: 'PERQUISITIONNÉ',
  wonTitle: 'LÉGENDE DU TEKNIVAL',
  wonText:
    'Tu as tenu le mur de son jusqu’au matin devant une marée humaine. Le téléphone arabe de la scène ne parle plus que de toi. Le camion repart, et l’histoire est en marche.',
  peakCrowd: 'Pic d’affluence',
  barTotal: 'Recette buvette',
  donations: 'Prix libre',
  donationsMult: (m: string) => `×${m} (ambiance + affluence)`,
  fine: 'Amende',
  seized: (gear: string) => `Matos saisi : ${gear}`,
  bustCut: 'Recette perdue dans la panique',
  repGained: (n: number) => `+${n} réputation`,
  total: 'Total',
  continue: 'Retour au camion',
  share: 'Partager la carte',
  shareSaved: 'Carte enregistrée !',

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
  startHint: 'Touche les faders pour démarrer le son',
  firstTimeHint:
    'Pousse le volume et les basses pour attirer du monde — mais surveille la jauge des bleus et la marge de ton matos.',
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
