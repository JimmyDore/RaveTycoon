import { describe, expect, it } from 'vitest';
import { NIGHT_PHASES, getPhase, phaseAt, phaseAttente } from './phases';

describe('les phases de nuit', () => {
  it('couvrent [0,1] sans trou ni chevauchement', () => {
    let prev = 0;
    for (const p of NIGHT_PHASES) {
      expect(p.frac[0]).toBeCloseTo(prev, 5);
      prev = p.frac[1];
    }
    expect(prev).toBe(1);
  });

  it('phaseAt retombe sur la bonne fenêtre (mêmes fractions sur tous les spots)', () => {
    expect(phaseAt(0).id).toBe('ouverture');
    expect(phaseAt(0.19).id).toBe('ouverture');
    expect(phaseAt(0.2).id).toBe('rush');
    expect(phaseAt(0.55).id).toBe('creux');
    expect(phaseAt(0.75).id).toBe('aube');
    expect(phaseAt(1).id).toBe('aube'); // borne haute incluse
    expect(phaseAt(1.2).id).toBe('aube'); // clamp
  });

  it("interpole l'attente linéairement dans chaque fenêtre", () => {
    expect(phaseAttente(0)).toBeCloseTo(0.3, 5);
    expect(phaseAttente(0.1)).toBeCloseTo(0.4, 5); // milieu de l'ouverture 0.3→0.5
    expect(phaseAttente(0.375)).toBeCloseTo(0.65, 5); // milieu du rush 0.5→0.8
    expect(phaseAttente(0.65)).toBeCloseTo(0.625, 5); // milieu du creux 0.8→0.45
    expect(phaseAttente(0.875)).toBeCloseTo(0.7, 5); // milieu de l'aube 0.5→0.9
  });

  it("l'aube paie double, le creux churn et chauffe, le rush remplit", () => {
    expect(getPhase('aube').repMult).toBe(2);
    expect(getPhase('rush').repMult).toBe(1);
    expect(getPhase('creux').churnMult).toBe(1.6);
    expect(getPhase('creux').heatMult).toBe(1.3);
    expect(getPhase('rush').arrivalMult).toBe(1.5);
    expect(getPhase('ouverture').barMult).toBe(0.7);
  });
});
