import { describe, expect, it } from 'vitest';
import type { KVStorage } from '../core/save';
import { defaultOnboarding, loadOnboarding, saveOnboarding, ONBOARDING_KEY } from './onboarding-state';

function mem(initial: Record<string, string> = {}): KVStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = v) };
}

describe('onboarding-state', () => {
  it('returns defaults when nothing stored', () => {
    expect(loadOnboarding(mem())).toEqual(defaultOnboarding());
  });

  it('round-trips a saved state', () => {
    const s = mem();
    saveOnboarding(s, { v: 1, helpSeen: true, prepCoachDone: true, nightCoachDone: false });
    expect(loadOnboarding(s)).toEqual({ v: 1, helpSeen: true, prepCoachDone: true, nightCoachDone: false });
  });

  it('falls back to defaults on corrupt JSON', () => {
    expect(loadOnboarding(mem({ [ONBOARDING_KEY]: 'not json{' }))).toEqual(defaultOnboarding());
  });

  it('falls back to defaults on a different version', () => {
    expect(loadOnboarding(mem({ [ONBOARDING_KEY]: JSON.stringify({ v: 99, helpSeen: true }) }))).toEqual(defaultOnboarding());
  });

  it('coerces missing flags to false', () => {
    const loaded = loadOnboarding(mem({ [ONBOARDING_KEY]: JSON.stringify({ v: 1, helpSeen: true }) }));
    expect(loaded).toEqual({ v: 1, helpSeen: true, prepCoachDone: false, nightCoachDone: false });
  });
});
