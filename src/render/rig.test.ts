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
