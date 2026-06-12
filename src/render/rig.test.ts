import { describe, expect, it } from 'vitest';
import { buildRig, rigKey } from './rig';
import type { GearCategory } from '../core/types';

const CX = 240;
const SB = 84;

function gear(over: Partial<Record<GearCategory, number>> = {}): Record<GearCategory, number> {
  return { platines: 0, mur: 0, groupe: 0, lumieres: 0, logistique: 0, ...over };
}

describe('buildRig — lumières', () => {
  it('tier 0 : aucun élément de light-show', () => {
    const rig = buildRig(gear(), {}, false, CX, SB);
    expect(rig.spotlights).toHaveLength(0);
    expect(rig.lasers).toHaveLength(0);
    expect(rig.fog).toBeNull();
  });

  it('le rig grossit avec le tier', () => {
    const t1 = buildRig(gear({ lumieres: 1 }), {}, false, CX, SB);
    expect(t1.spotlights).toHaveLength(2);
    expect(t1.lasers).toHaveLength(0);
    const t2 = buildRig(gear({ lumieres: 2 }), {}, false, CX, SB);
    expect(t2.lasers).toHaveLength(2);
    expect(t2.fog).not.toBeNull();
    const t5 = buildRig(gear({ lumieres: 5 }), { lumieres: 'A' }, false, CX, SB);
    expect(t5.spotlights.length).toBeGreaterThan(t1.spotlights.length);
  });

  it('voie A ≠ voie B : lasers colorés vs blancs, fumée dense côté hypnose', () => {
    const a = buildRig(gear({ lumieres: 3 }), { lumieres: 'A' }, false, CX, SB);
    const b = buildRig(gear({ lumieres: 3 }), { lumieres: 'B' }, false, CX, SB);
    expect(a.lasers.map((l) => l.sheet)).toEqual(['laser_machine', 'laser_machine_2']);
    expect(b.lasers.map((l) => l.sheet)).toEqual(['laser_white', 'laser_white_2']);
    expect(a.fog?.dense).toBe(true);
    expect(b.fog?.dense).toBe(false);
  });
});

describe('buildRig — groupe, platines, mur, logistique', () => {
  it('tier 0 partout : scène nue, mur minimal (une enceinte par côté)', () => {
    const rig = buildRig(gear(), {}, false, CX, SB);
    expect(rig.generators).toHaveLength(0);
    expect(rig.monitors).toHaveLength(0);
    expect(rig.animatedDj).toBe(false);
    expect(rig.lookouts).toHaveLength(0);
    expect(rig.barriers).toHaveLength(0);
    expect(rig.evacCamper).toBeNull();
    expect(rig.wall).toHaveLength(2);
    expect(rig.wall.every((w) => w.prop === 'speaker_big')).toBe(true);
  });

  it('tiers hauts : plus de guetteurs, de barrières, de mur, deux groupes', () => {
    const low = buildRig(gear({ mur: 1, groupe: 1, logistique: 1 }), {}, false, CX, SB);
    const high = buildRig(
      gear({ platines: 5, mur: 5, groupe: 5, lumieres: 5, logistique: 5 }),
      { platines: 'A', mur: 'A', groupe: 'A', lumieres: 'A', logistique: 'A' },
      false,
      CX,
      SB,
    );
    expect(low.generators).toHaveLength(1);
    expect(high.generators).toHaveLength(2);
    expect(high.lookouts.length).toBeGreaterThan(low.lookouts.length);
    expect(low.barriers).toHaveLength(0);
    expect(high.barriers.length).toBeGreaterThan(0);
    expect(high.wall.length).toBeGreaterThan(low.wall.length);
    expect(high.monitors.length).toBeGreaterThan(0);
  });

  it('voie A ≠ voie B : régie vs DJ animé, stacks élargis vs line array, évac', () => {
    const g = gear({ platines: 3, mur: 3, groupe: 3, logistique: 3 });
    const a = buildRig(g, { platines: 'A', mur: 'A', groupe: 'A', logistique: 'A' }, false, CX, SB);
    const b = buildRig(g, { platines: 'B', mur: 'B', groupe: 'B', logistique: 'B' }, false, CX, SB);
    // platines : retours côté A, DJ animé + spots clignotants côté B
    expect(a.monitors.length).toBeGreaterThan(0);
    expect(a.animatedDj).toBe(false);
    expect(b.animatedDj).toBe(true);
    expect(b.blinkSpots).toHaveLength(2);
    // mur : base au sol côté A, colonnes suspendues sous le truss côté B
    expect(a.wall.some((w) => w.y > SB - 40)).toBe(true);
    expect(b.wall.every((w) => w.y + 32 < SB + 12)).toBe(true);
    // groupe : compact A vs turbine ×2 B ; logistique B : camion d'évac
    expect(a.generators.every((x) => x.scale === 1)).toBe(true);
    expect(b.generators[0].scale).toBe(2);
    expect(a.evacCamper).toBeNull();
    expect(b.evacCamper).not.toBeNull();
  });

  it('murBlown : exactement un stack marqué grillé', () => {
    const rig = buildRig(gear({ mur: 2 }), {}, true, CX, SB);
    expect(rig.wall.filter((w) => w.blown)).toHaveLength(1);
  });
});

describe('rigKey', () => {
  it('change avec le tier, la voie et le mur grillé', () => {
    const base = rigKey(gear(), {}, false);
    expect(rigKey(gear({ lumieres: 1 }), {}, false)).not.toBe(base);
    expect(rigKey(gear({ lumieres: 3 }), { lumieres: 'A' }, false)).not.toBe(
      rigKey(gear({ lumieres: 3 }), { lumieres: 'B' }, false),
    );
    expect(rigKey(gear(), {}, true)).not.toBe(base);
  });
});
