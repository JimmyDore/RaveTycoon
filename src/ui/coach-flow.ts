/** One coachmark: highlight the element matched by `anchor` and show `text`. */
export interface CoachStep {
  /** CSS selector of the element to highlight; re-queried each animation frame (survives re-renders). */
  anchor: string;
  text: string;
  placement?: 'top' | 'bottom';
  /** Optional: prepare the screen before showing (e.g. switch the active prep tab). Called once on entry. */
  onEnter?: () => void;
}

export interface CoachCursor {
  current(): CoachStep | null;
  index(): number;
  total(): number;
  /** Advance one step; returns the new current step, or null once finished. */
  next(): CoachStep | null;
  isDone(): boolean;
}

export function createCoachCursor(steps: CoachStep[]): CoachCursor {
  let i = 0;
  return {
    current: () => (i < steps.length ? steps[i] : null),
    index: () => i,
    total: () => steps.length,
    next: () => {
      if (i < steps.length) i++;
      return i < steps.length ? steps[i] : null;
    },
    isDone: () => i >= steps.length,
  };
}
