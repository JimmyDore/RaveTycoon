import type { KVStorage } from '../core/save';

export const ONBOARDING_KEY = 'rave-tycoon-onboarding';
export const ONBOARDING_VERSION = 1;

/** First-run teaching flags. Stored in its own localStorage key — never touches the game save. */
export interface OnboardingState {
  v: number;
  helpSeen: boolean;
  prepCoachDone: boolean;
  nightCoachDone: boolean;
}

export function defaultOnboarding(): OnboardingState {
  return { v: ONBOARDING_VERSION, helpSeen: false, prepCoachDone: false, nightCoachDone: false };
}

export function loadOnboarding(storage: KVStorage): OnboardingState {
  try {
    const raw = storage.getItem(ONBOARDING_KEY);
    if (!raw) return defaultOnboarding();
    const o = JSON.parse(raw) as Partial<OnboardingState> | null;
    if (typeof o !== 'object' || o === null || o.v !== ONBOARDING_VERSION) return defaultOnboarding();
    return {
      v: ONBOARDING_VERSION,
      helpSeen: o.helpSeen === true,
      prepCoachDone: o.prepCoachDone === true,
      nightCoachDone: o.nightCoachDone === true,
    };
  } catch {
    return defaultOnboarding();
  }
}

export function saveOnboarding(storage: KVStorage, st: OnboardingState): void {
  storage.setItem(ONBOARDING_KEY, JSON.stringify(st));
}
