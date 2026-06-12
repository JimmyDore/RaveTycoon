import { isHighIntensity } from './intensity';
import type { EventContext, NightEventDef } from './types';

/**
 * The night's event deck. Weights are contextual — an event with weight 0
 * cannot fire. Drawn without replacement within a single night.
 */
export const NIGHT_EVENTS: NightEventDef[] = [
  {
    id: 'patrouille',
    titre: 'Patrouille',
    texte: 'Les guetteurs signalent une voiture des bleus qui tourne sur la départementale. Elle ralentit à chaque passage.',
    options: [
      {
        label: 'Baisser le son un moment',
        outcome: 'Le mur murmure pendant un quart d’heure. La voiture finit par passer son chemin.',
        effects: { heat: -0.12, vibe: -0.08, forceIntensity: 'chill' },
      },
      {
        label: 'On continue, c’est la teuf',
        outcome: 'Le kick reprend de plus belle. La voiture s’arrête un peu plus longtemps cette fois…',
        effects: { heat: 0.1, vibe: 0.04 },
      },
      {
        label: 'Graisser la patte (80 €)',
        outcome: 'Une poignée de billets de la buvette change de main. La voiture ne repassera pas cette nuit.',
        effects: { cash: -80, heat: -0.25 },
      },
    ],
    weight: (ctx) => 1 + ctx.heat * 2 + ctx.spotTier * 0.2,
  },
  {
    id: 'groupe-toussote',
    titre: 'Le groupe toussote',
    texte: 'Le groupe électrogène crachote. L’odeur d’essence se mêle à la fumée des clopes.',
    options: [
      {
        label: 'Le bricoler maintenant',
        outcome: 'Dix minutes de silence et de jurons, mais il repart propre.',
        effects: { soundCut: 6, vibe: -0.1 },
      },
      {
        label: 'Il tiendra bien la nuit',
        outcome: 'Il tient. Pour l’instant. Quelque chose sent le chaud.',
        effects: { damageRisk: { category: 'groupe', chance: 0.45 } },
      },
    ],
    weight: (ctx) => (ctx.gear.groupe <= 1 ? 1.6 : 0.4),
  },
  {
    id: 'enceinte-chauffe',
    titre: 'Une enceinte chauffe',
    texte: 'Un caisson sent le cramé. La membrane fatigue sous les basses.',
    options: [
      {
        label: 'La ménager',
        outcome: 'Le son perd du coffre, mais le matos survivra à la nuit.',
        effects: { qualityMult: 0.8 },
      },
      {
        label: 'Elle tiendra',
        outcome: 'Le caisson hurle sa vie. Chaque kick est un pari.',
        effects: { damageRisk: { category: 'mur', chance: 0.35 }, vibe: 0.04 },
      },
      {
        label: 'Sacrifier un câble de rechange (40 €)',
        outcome: 'Rewiring de fortune à l’arrache. Le caisson respire, le son tient.',
        effects: { cash: -40, qualityMult: 0.95 },
      },
    ],
    weight: (ctx) => (isHighIntensity(ctx.intensity) ? 1.5 : 0.5) + (ctx.gear.mur === 0 ? 0.5 : 0),
  },
  {
    id: 'public-en-redemande',
    titre: 'Le public en redemande',
    texte: 'Le dancefloor scande le nom du sound system. Ils veulent que ça tape plus fort.',
    options: [
      {
        label: 'Lâcher les watts',
        outcome: 'Le DJ charge la tension. Le champ entier retient son souffle.',
        effects: { montee: 0.3, vibe: 0.08 },
      },
      {
        label: 'Tenir le plan de vol',
        outcome: 'On garde la tête froide. Quelques déçus, zéro problème.',
        effects: { vibe: -0.05 },
      },
    ],
    weight: (ctx) => (!isHighIntensity(ctx.intensity) && ctx.crowdRatio > 0.3 ? 1.4 : 0),
  },
  {
    id: 'voisin',
    titre: 'Un voisin au portail',
    texte: 'Un type en robe de chambre débarque, furieux. Il parle de gendarmes et de tracteur.',
    options: [
      {
        label: 'Lui offrir une bière et la visite',
        outcome: 'Deux bières plus tard il hoche la tête sur le kick. On le reverra.',
        effects: { cash: -30, heat: -0.08 },
      },
      {
        label: 'L’embrouiller gentiment',
        outcome: 'Il repart en marmonnant. Pas sûr qu’il n’appelle personne.',
        effects: { heat: 0.08 },
      },
    ],
    weight: (ctx) => (ctx.spotTier <= 3 ? 1.2 : 0.3),
  },
  {
    id: 'blog-scene',
    titre: 'La scène regarde',
    texte: 'Une figure connue de la scène filme le mur de son pour son canal Telegram.',
    options: [
      {
        label: 'Lui faire visiter la régie',
        outcome: 'Ses stories tournent déjà. Le nom du sound circule.',
        effects: { rep: 12, heat: 0.05 },
      },
      {
        label: 'Pas de caméras ici',
        outcome: 'Il range son téléphone, respect. La légende restera orale.',
        effects: { vibe: 0.03 },
      },
    ],
    weight: (ctx) => ctx.crowdRatio > 0.4 ? 1 : 0.4,
  },
  {
    id: 'soundclash',
    titre: 'Soundclash',
    texte: 'Un autre sound system s’installe à trois cents mètres. Leurs basses commencent à mordre sur les tiennes.',
    options: [
      {
        label: 'Clash — on les enterre',
        outcome: 'Mur contre mur. La plaine entière vibre. Historique.',
        effects: { vibe: 0.15, heat: 0.1 },
      },
      {
        label: 'Partager la plaine',
        outcome: 'Deux teufs valent mieux qu’une embrouille. Une partie du public migre.',
        effects: { crowdFrac: -0.12, heat: -0.05 },
      },
    ],
    weight: (ctx) => (ctx.spotTier >= 4 ? 1.1 : 0),
  },
  {
    id: 'dj-en-vrille',
    titre: 'Le DJ part en vrille',
    texte: 'Le set dérape — montées sauvages, kicks doublés, la table tremble. Le public adore. Le matos moins.',
    options: [
      {
        label: 'Laisser faire l’artiste',
        outcome: 'Un moment de légende. Le champ devient volcan.',
        effects: { vibe: 0.12, heat: 0.1, damageRisk: { category: 'mur', chance: 0.15 } },
      },
      {
        label: 'Un mot à l’oreille',
        outcome: 'Le set retombe sur ses pattes. Le DJ fait la gueule.',
        effects: { vibe: -0.04, forceIntensity: 'groove' },
      },
    ],
    weight: (ctx) => (ctx.djRisk === 'chaud' && isHighIntensity(ctx.intensity) ? 1.6 : 0),
  },
  {
    id: 'rush-buvette',
    titre: 'Rush à la buvette',
    texte: 'La file de la buvette fait vingt mètres. Les bières partent plus vite que le camion ne les a montées.',
    options: [
      {
        label: 'Monter un peu les prix',
        outcome: 'Personne ne bronche vraiment. La caisse sonne.',
        effects: { cash: 60, vibe: -0.05 },
      },
      {
        label: 'Prix libre, comme tout ici',
        outcome: 'Des sourires, des pourboires, et une ambiance en or.',
        effects: { vibe: 0.08 },
      },
    ],
    weight: (ctx) => (ctx.crowdRatio > 0.5 ? 1.2 : 0),
  },
  {
    id: 'bourbier',
    titre: 'Bourbier',
    texte: 'Devant le mur, la danse a transformé la terre en soupe. Des teufeurs y laissent leurs chaussures.',
    options: [
      {
        label: 'Sacrifier des palettes',
        outcome: 'Un plancher de fortune. Le pit repart de plus belle.',
        effects: { cash: -40, vibe: 0.06 },
      },
      {
        label: 'C’est ça, la teuf',
        outcome: 'Les plus motivés dansent pieds nus. Les autres reculent.',
        effects: { crowdFrac: -0.06 },
      },
    ],
    weight: (ctx) => (ctx.spotTier <= 2 && ctx.crowdRatio > 0.4 ? 1 : 0.2),
  },
  {
    id: 'barrage',
    titre: 'Barrage en formation',
    texte: 'Les guetteurs annoncent un fourgon qui se gare au croisement. Ils notent les plaques à l’entrée.',
    options: [
      {
        label: 'Faire passer le mot',
        outcome: 'Les arrivants passent par le chemin de traverse. Moins de monde, moins de traces.',
        effects: { arrivalCutT: 40, heat: -0.1 },
      },
      {
        label: 'On ne change rien',
        outcome: 'Le flot continue sous l’œil du fourgon. Le dossier s’épaissit.',
        effects: { heat: 0.09 },
      },
    ],
    weight: (ctx) => (ctx.heat > 0.45 ? 1.5 : 0),
  },
  {
    id: 'perdu',
    titre: 'Un teufeur perdu',
    texte: 'Un gamin a perdu ses potes et son téléphone. Il erre près de la régie, l’air sonné.',
    options: [
      {
        label: 'Une annonce au micro',
        outcome: 'Le son se calme deux minutes. Des bras se lèvent au fond — retrouvailles sous les applaudissements.',
        effects: { vibe: 0.05, soundCut: 2 },
      },
      {
        label: 'Le laisser près du feu',
        outcome: 'Il finira bien par les croiser. La nuit est longue.',
        effects: {},
      },
    ],
    weight: () => 0.6,
  },
];

export function drawEvent(
  ctx: EventContext,
  alreadyFired: string[],
  rng: () => number,
): NightEventDef | null {
  const pool = NIGHT_EVENTS.filter((e) => !alreadyFired.includes(e.id));
  const weights = pool.map((e) => Math.max(0, e.weight(ctx)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let roll = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}
