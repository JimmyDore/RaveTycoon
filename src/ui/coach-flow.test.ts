import { describe, expect, it } from 'vitest';
import { createCoachCursor, type CoachStep } from './coach-flow';

const steps: CoachStep[] = [
  { anchor: '.a', text: 'one' },
  { anchor: '.b', text: 'two' },
];

describe('createCoachCursor', () => {
  it('starts on the first step', () => {
    const c = createCoachCursor(steps);
    expect(c.index()).toBe(0);
    expect(c.total()).toBe(2);
    expect(c.current()?.text).toBe('one');
    expect(c.isDone()).toBe(false);
  });

  it('advances and finishes past the end', () => {
    const c = createCoachCursor(steps);
    expect(c.next()?.text).toBe('two');
    expect(c.index()).toBe(1);
    expect(c.next()).toBeNull();
    expect(c.isDone()).toBe(true);
    expect(c.current()).toBeNull();
  });

  it('is immediately done when empty', () => {
    const c = createCoachCursor([]);
    expect(c.isDone()).toBe(true);
    expect(c.current()).toBeNull();
  });
});
