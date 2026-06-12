import { describe, expect, it } from 'vitest';
import {
  REGION_TRAITS,
  type RegionRules,
  applyRegionLegende,
  buildRegionRules,
  defaultRegionRules,
  getRegionTrait,
  legendeMultiplier,
  regionTraits,
} from './regions';

function traits(...ids: string[]) {
  return ids.map(getRegionTrait);
}

describe('le pool de traits', () => {
  it('contient les 12 traits du design avec leurs difficultés', () => {
    expect(REGION_TRAITS).toHaveLength(12);
    const diff = Object.fromEntries(REGION_TRAITS.map((t) => [t.id, t.difficulty]));
    expect(diff).toEqual({
      'zone-quadrillee': 2,
      'prefet-zele': 1,
      'economie-morose': 1,
      'climat-pourri': 1,
      'terre-de-beton': 2,
      'public-exigeant': 1,
      'zone-blanche': 1,
      'terre-de-dub': 0,
      'fetes-votives': 0,
      'grands-axes': 0,
      'terre-daccueil': -1,
      'region-riche': -1,
    });
  });

  it('chaque trait mute la bonne règle', () => {
    const applied = (id: string): RegionRules => {
      const rules = defaultRegionRules();
      getRegionTrait(id).apply(rules);
      return rules;
    };
    expect(applied('zone-quadrillee').bustThreshold).toBe(0.85);
    expect(applied('prefet-zele').heatMult).toBeCloseTo(1.3, 5);
    expect(applied('prefet-zele').casierGele).toBe(true);
    expect(applied('economie-morose').prixLibreMult).toBeCloseTo(0.75, 5);
    expect(applied('economie-morose').barMult).toBeCloseTo(0.8, 5);
    expect(applied('climat-pourri').negativeModifierWeightMult).toBeCloseTo(2, 5);
    expect(applied('terre-de-beton').bannedSpotIds).toEqual(['champ', 'foret', 'plage']);
    expect(applied('terre-de-beton').repReqOverride.carriere).toBe(0);
    expect(applied('public-exigeant').setQualityMult).toBeCloseTo(0.95, 5);
    expect(applied('zone-blanche').buzzDecayMult).toBeCloseTo(2, 5);
    expect(applied('terre-de-dub').slowGenreArrivalMult).toBeCloseTo(1.3, 5);
    expect(applied('terre-de-dub').fastGenreArrivalMult).toBeCloseTo(0.7, 5);
    expect(applied('fetes-votives').specialNightWeightMult).toBeCloseTo(2, 5);
    expect(applied('fetes-votives').maxEventsBonus).toBe(1);
    expect(applied('fetes-votives').goalRepMult).toBeCloseTo(0.8, 5);
    expect(applied('grands-axes').arrivalMult).toBeCloseTo(1.2, 5);
    expect(applied('grands-axes').churnMult).toBeCloseTo(1.2, 5);
    expect(applied('terre-daccueil').heatMult).toBeCloseTo(0.7, 5);
    expect(applied('region-riche').prixLibreMult).toBeCloseTo(1.25, 5);
  });

  it('les traits composent par produit (Préfet zélé × Terre d’accueil)', () => {
    const rules = buildRegionRules({ nom: 'Test', traits: ['prefet-zele', 'terre-daccueil'] });
    expect(rules.heatMult).toBeCloseTo(1.3 * 0.7, 5);
  });

  it('sans région (tournée 1), les règles sont l’identité', () => {
    expect(buildRegionRules(undefined)).toEqual(defaultRegionRules());
  });
});

describe('legendeMultiplier', () => {
  it('vaut 1 + 0.25 × max(0, somme des difficultés), borné ×1.0 à ×2.0', () => {
    expect(legendeMultiplier([])).toBe(1);
    expect(legendeMultiplier(traits('terre-daccueil', 'region-riche'))).toBe(1); // somme −2 → max(0,·)
    expect(legendeMultiplier(traits('prefet-zele', 'terre-daccueil'))).toBe(1); // somme 0
    expect(legendeMultiplier(traits('zone-quadrillee', 'prefet-zele'))).toBeCloseTo(1.75, 5);
    expect(legendeMultiplier(traits('zone-quadrillee', 'terre-de-beton'))).toBe(2); // somme 4 → ×2.0
  });

  it('Tournée infernale : +50 % seulement si la somme ≥ 2', () => {
    expect(legendeMultiplier(traits('zone-quadrillee'), true)).toBeCloseTo(1.5 * 1.5, 5);
    expect(legendeMultiplier(traits('prefet-zele'), true)).toBeCloseTo(1.25, 5); // somme 1 : pas d'ampli
  });
});

describe('applyRegionLegende', () => {
  it('multiplie le gain de ⭐ et arrondit au floor ; tournée 1 = ×1', () => {
    expect(applyRegionLegende(10, undefined, [])).toBe(10);
    const region = { nom: 'La Vallée grise', traits: ['zone-quadrillee', 'prefet-zele'] };
    expect(applyRegionLegende(10, region, [])).toBe(17); // 10 × 1.75 = 17.5 → 17
    expect(applyRegionLegende(10, region, ['tournee-infernale'])).toBe(26); // 10 × 2.625 → 26
  });
});

describe('regionTraits', () => {
  it('résout les ids et rend [] sans région', () => {
    expect(regionTraits(undefined)).toEqual([]);
    expect(regionTraits({ nom: 'x', traits: ['terre-de-dub'] })[0].nom).toBe('Terre de dub');
    expect(() => regionTraits({ nom: 'x', traits: ['nimporte-quoi'] })).toThrow();
  });
});
