# Onboarding « Première teuf » Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a cold-start player reach a running night in seconds, and teach both the prep and the live night — via a tabbed prep screen with an always-visible launch bar, hidden-locked content, a reopenable "Comment jouer" modal, and first-time guided coachmarks.

**Architecture:** Two new *pure* modules carry the testable logic (onboarding persistence in its own `localStorage` key; a coach step-cursor). One new *DOM* module renders the help modal and the coachmark overlay. The existing `screens.ts`/`main.ts`/`style.css` are edited to add prep tabs, a sticky launch bar, locked-content teasers, and the `[?]` buttons. No change to `GameState` / `SAVE_VERSION` — onboarding flags live in a separate key, so existing saves are untouched.

**Tech Stack:** TypeScript (strict), Vite, Vitest (node environment — pure logic is unit-tested; DOM/CSS is verified manually with the `agent-browser` CLI on `localhost:5173`). Plain DOM (no framework). CSS with theme vars in `:root`.

---

## Conventions used by this plan

- **Run unit tests:** `npm test` (vitest, node env). Single file: `npx vitest run src/ui/onboarding-state.test.ts`.
- **Type-check (the build gate for DOM tasks):** `npx tsc --noEmit`. Expected: no errors.
- **Dev server for manual verification:** `npm run dev` (serves `:5173`). The leaderboard API is optional; the prep/night screens work without it.
- **Browser verification:** the `agent-browser` CLI. Mobile viewport: `agent-browser set viewport 390 844`. Desktop: `agent-browser set viewport 1280 800`. Always `agent-browser open http://localhost:5173` and `agent-browser wait --load networkidle` first. To reach a clean first-time state, clear storage: `agent-browser eval "localStorage.clear()"` then re-open.
- **Theme vars (already in `src/style.css:1`):** `--bg`, `--bg-panel`, `--bg-card`, `--border`, `--text`, `--text-dim`, `--accent` (#ff5d8f), `--accent-2` (#7b5dff), `--accent-3` (#3ddc97), `--gold`, `--danger`.
- **Responsive breakpoint:** `860px` (desktop ≥ 860; mobile < 860), matching the existing `@media (min-width: 860px)` on `.prepare-grid`.
- **Commit style:** angular, e.g. `feat(onboarding): ...`. End every commit body with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Work happens on branch `feat/onboarding-premiere-teuf` (already created).

## File structure

| File | Responsibility |
|---|---|
| `src/ui/onboarding-state.ts` *(new)* | Pure persistence for the onboarding key (`load`/`save`/default). No DOM. |
| `src/ui/onboarding-state.test.ts` *(new)* | Unit tests for persistence. |
| `src/ui/coach-flow.ts` *(new)* | Pure coach step-cursor (`CoachStep`, `createCoachCursor`). No DOM. |
| `src/ui/coach-flow.test.ts` *(new)* | Unit tests for the cursor. |
| `src/ui/onboarding.ts` *(new)* | DOM helpers: `helpButton`, `howToModal`, `mountCoach`. |
| `src/ui/strings.ts` *(modify)* | New `STR.onboarding` block; drop unused `firstTimeHint`. |
| `src/ui/screens.ts` *(modify)* | Prep tabs + sticky launch + teasers + `[?]`; night `[?]` + cran hint; remove dead first-hint render. |
| `src/main.ts` *(modify)* | Selection fields (`tab`, `expanded`); onboarding load/save; `onHelp`; coach triggers. |
| `src/style.css` *(modify)* | Styles for tabs, launch bar, teaser, help button, modal, coach ring, cran hint + media queries. |

---

## Task 1: Onboarding persistence (pure, TDD)

**Files:**
- Create: `src/ui/onboarding-state.ts`
- Test: `src/ui/onboarding-state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/ui/onboarding-state.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/onboarding-state.test.ts`
Expected: FAIL — cannot resolve `./onboarding-state`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/onboarding-state.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ui/onboarding-state.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/onboarding-state.ts src/ui/onboarding-state.test.ts
git commit -m "feat(onboarding): persistence dans une clé localStorage dédiée

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Coach step-cursor (pure, TDD)

**Files:**
- Create: `src/ui/coach-flow.ts`
- Test: `src/ui/coach-flow.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/ui/coach-flow.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/coach-flow.test.ts`
Expected: FAIL — cannot resolve `./coach-flow`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/coach-flow.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ui/coach-flow.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/coach-flow.ts src/ui/coach-flow.test.ts
git commit -m "feat(onboarding): curseur d'étapes pur pour les coachmarks

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Onboarding strings

**Files:**
- Modify: `src/ui/strings.ts` (add a block before the closing `} as const;` at line 276; remove `firstTimeHint` at lines 274-275)

- [ ] **Step 1: Add the `onboarding` block**

In `src/ui/strings.ts`, replace the `// misc` block (lines 273-275):

```ts
  // misc
  firstTimeHint:
    'Choisis ton spot et embarque ton crew — chaque DJ amène son propre son. Enchaîne les bons sets pendant la nuit : pousser le son remplit le champ… et la jauge des bleus.',
```

with:

```ts
  // onboarding (« première teuf »)
  onboarding: {
    helpShort: '?',
    help: 'Comment jouer',
    howToTitle: 'Comment jouer',
    prepaTitle: '☀️ La prépa',
    nuitTitle: '🌙 La nuit',
    prepaSteps: [
      '📍 Choisis ton spot — capacité, durée, nombre de sets.',
      '🎧 Embarque ton crew — chaque DJ amène son son et sa part de recette.',
      '🔊 Achète du matos quand la caisse suit.',
      '▶ Lance la teuf.',
    ],
    nuitSteps: [
      '🎚 À chaque set, choisis qui prend les platines.',
      "Règle l'énergie : Chill calme les bleus, Rinse fait tout monter.",
      '🌊 La vague se remplit — LÂCHE le drop au bon moment pour faire exploser le champ.',
      "👮 Garde Les bleus sous la barre, sinon c'est la descente.",
      "🔥 L'ambiance fait la recette et le prix libre.",
      '🌅 Tiens jusqu’au lever du soleil.',
    ],
    tabs: { spot: 'Le spot', crew: 'Le crew', matos: 'Le matos' } as const,
    lockedSpots: (n: number) => `🔒 +${n} spot${n > 1 ? 's' : ''} à débloquer`,
    lockedDjs: (n: number) => `🔒 +${n} DJ${n > 1 ? 's' : ''} à débloquer`,
    brokeMatos: 'Reviens quand la caisse suit 💶',
    next: 'Suivant',
    skip: 'Passer',
    gotIt: "C'est parti 🔥",
    coachPrep: [
      'Ton premier spot : un champ paumé, parfait pour débuter. Le détail des règles est sous le bouton ? en haut.',
      "Ton crew est là. Tonton est déjà embarqué — tape une carte DJ pour l'ajouter ou la retirer.",
      "Quand t'es prêt — lance la teuf 🔥",
    ],
    coachNight: [
      "Règle l'énergie ici : Chill calme les bleus, Rinse fait tout monter.",
      'Garde Les bleus sous la barre, sinon c’est la descente.',
      'Quand la vague est pleine, LÂCHE le drop.',
    ],
  },
```

Note: `firstTimeHint` is removed here. Its only render (`screens.ts:435-437`) is removed in Task 5; nothing else references it (verified: `rg firstTimeHint src/` → only strings.ts + screens.ts:436).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: an error at `src/ui/screens.ts` about `STR.firstTimeHint` no longer existing. That's expected — it is removed in Task 5. (If you prefer a clean gate now, temporarily skip this step; it goes green after Task 5.)

- [ ] **Step 3: Commit**

```bash
git add src/ui/strings.ts
git commit -m "feat(onboarding): chaînes FR (modale, onglets, teasers, coachmarks)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: DOM helpers + "Comment jouer" modal + night `[?]`

**Files:**
- Create: `src/ui/onboarding.ts`
- Modify: `src/ui/screens.ts` (add import; add `[?]` into the night `hud-top`)
- Modify: `src/style.css` (help button, onboarding modal, coach ring/tip — full block added here, used by later tasks too)

- [ ] **Step 1: Create `src/ui/onboarding.ts`**

```ts
import { createCoachCursor, type CoachStep } from './coach-flow';
import { STR } from './strings';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Round "?" button for the top bar / night HUD. `pulse` draws attention until first opened. */
export function helpButton(pulse: boolean, onClick: () => void): HTMLButtonElement {
  const b = el('button', `help-btn${pulse ? ' pulse' : ''}`, STR.onboarding.helpShort) as HTMLButtonElement;
  b.type = 'button';
  b.title = STR.onboarding.help;
  b.setAttribute('aria-label', STR.onboarding.help);
  b.addEventListener('click', onClick);
  return b;
}

function howToSection(title: string, steps: readonly string[]): HTMLElement {
  const sec = el('section', 'howto-section');
  sec.append(el('h3', '', title));
  const ul = el('ul', 'howto-list');
  for (const s of steps) ul.append(el('li', 'howto-item', s));
  sec.append(ul);
  return sec;
}

/** Reopenable "Comment jouer" modal. Appends itself to <body>; `onClose` fires after it's removed. */
export function howToModal(onClose: () => void): void {
  const overlay = el('div', 'onboarding-modal');
  const panel = el('div', 'modal-panel');
  panel.append(el('h2', '', STR.onboarding.howToTitle));
  panel.append(howToSection(STR.onboarding.prepaTitle, STR.onboarding.prepaSteps));
  panel.append(howToSection(STR.onboarding.nuitTitle, STR.onboarding.nuitSteps));
  const close = el('button', 'btn accent', STR.onboarding.gotIt) as HTMLButtonElement;
  const dismiss = () => {
    overlay.remove();
    onClose();
  };
  close.addEventListener('click', dismiss);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });
  panel.append(close);
  overlay.append(panel);
  document.body.append(overlay);
}

export interface CoachHandle {
  stop(): void;
}

/**
 * Spotlight a sequence of elements with a tooltip. The ring follows the anchor's
 * bounding rect every frame, so it survives the full DOM re-renders that prep clicks trigger.
 */
export function mountCoach(steps: CoachStep[], onDone: () => void): CoachHandle {
  if (steps.length === 0) {
    onDone();
    return { stop() {} };
  }
  const cursor = createCoachCursor(steps);
  const ring = el('div', 'coach-ring');
  const tip = el('div', 'coach-tip');
  const txt = el('p', 'coach-text', '');
  const row = el('div', 'coach-actions');
  const skip = el('button', 'btn ghost small', STR.onboarding.skip) as HTMLButtonElement;
  const next = el('button', 'btn accent small', STR.onboarding.next) as HTMLButtonElement;
  row.append(skip, next);
  tip.append(txt, row);
  document.body.append(ring, tip);

  let raf = 0;
  let stopped = false;
  const finish = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    ring.remove();
    tip.remove();
    onDone();
  };
  const enter = () => {
    const step = cursor.current();
    if (!step) {
      finish();
      return;
    }
    step.onEnter?.();
    txt.textContent = step.text;
    next.textContent = cursor.index() === cursor.total() - 1 ? STR.onboarding.gotIt : STR.onboarding.next;
    cancelAnimationFrame(raf);
    const loop = () => {
      if (stopped) return;
      const anchor = document.querySelector(step.anchor) as HTMLElement | null;
      if (anchor && anchor.getBoundingClientRect().width > 0) {
        const r = anchor.getBoundingClientRect();
        ring.style.left = `${r.left - 6}px`;
        ring.style.top = `${r.top - 6}px`;
        ring.style.width = `${r.width + 12}px`;
        ring.style.height = `${r.height + 12}px`;
        ring.style.opacity = '1';
        const below = (step.placement ?? 'bottom') === 'bottom';
        tip.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - tip.offsetWidth - 8))}px`;
        tip.style.top = below ? `${r.bottom + 12}px` : `${Math.max(8, r.top - tip.offsetHeight - 12)}px`;
        tip.style.visibility = 'visible';
      } else {
        ring.style.opacity = '0';
        tip.style.visibility = 'hidden';
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
  };
  next.addEventListener('click', () => {
    cursor.next();
    enter();
  });
  skip.addEventListener('click', finish);
  enter();
  return { stop: finish };
}
```

- [ ] **Step 2: Add the CSS block**

Append to `src/style.css`:

```css
/* ---------- onboarding ---------- */
.help-btn {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: 2px solid var(--accent-2);
  background: var(--bg-card);
  color: var(--text);
  font-weight: bold;
  font-size: 0.95rem;
  cursor: pointer;
  flex-shrink: 0;
  line-height: 1;
}
.help-btn.pulse {
  animation: help-pulse 1.6s ease-in-out infinite;
}
@keyframes help-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(123, 93, 255, 0.55); }
  50% { box-shadow: 0 0 0 7px rgba(123, 93, 255, 0); }
}
.hud-help {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 6;
}

.onboarding-modal {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(7, 5, 18, 0.78);
  backdrop-filter: blur(3px);
  z-index: 50;
  padding: 0.8rem;
}
.howto-section {
  margin: 0.4rem 0 0.9rem;
}
.howto-list {
  margin: 0;
  padding-left: 1.15rem;
}
.howto-item {
  font-size: 0.86rem;
  line-height: 1.5;
  margin-bottom: 0.4rem;
  color: var(--text);
}
.onboarding-modal .btn.accent {
  width: 100%;
  margin-top: 0.4rem;
}

.coach-ring {
  position: fixed;
  border: 3px solid var(--accent);
  border-radius: 10px;
  box-shadow: 0 0 0 9999px rgba(7, 5, 18, 0.62);
  z-index: 60;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.coach-tip {
  position: fixed;
  z-index: 61;
  max-width: min(320px, calc(100vw - 16px));
  background: var(--bg-panel);
  border: 2px solid var(--accent-2);
  border-radius: 10px;
  padding: 0.7rem 0.8rem;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
  visibility: hidden;
}
.coach-text {
  margin: 0 0 0.6rem;
  font-size: 0.85rem;
  line-height: 1.45;
}
.coach-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
```

- [ ] **Step 3: Wire the night `[?]` button**

In `src/ui/screens.ts`, add to the imports near the top (after line 25, `import type { BoardKind, ScoreRow } from './api';`):

```ts
import { helpButton, howToModal } from './onboarding';
```

Then in `renderNight`, immediately after the `sceneWrap.append(hudTop);` line (currently `src/ui/screens.ts:545`), add:

```ts
  sceneWrap.append(helpButton(false, () => howToModal(() => {})));
```

The help button is absolutely positioned (`.hud-help` is applied below). Update the just-added line to give it the HUD class:

```ts
  const nightHelp = helpButton(false, () => howToModal(() => {}));
  nightHelp.classList.add('hud-help');
  sceneWrap.append(nightHelp);
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: still the `STR.firstTimeHint` error from Task 3 (removed in Task 5). No new errors from `onboarding.ts` or the night wiring.

- [ ] **Step 5: Manual verification (night `[?]`)**

This depends on launching a night, which is easiest after Task 5 wires the launch bar; if verifying now, launch via the existing flow. With `npm run dev` running:

```bash
agent-browser open http://localhost:5173
agent-browser eval "localStorage.clear()"
agent-browser open http://localhost:5173
agent-browser wait --load networkidle
# start a night (select all crew is default), then:
agent-browser eval "[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Lancer la teuf')).click()"
agent-browser wait 1500
agent-browser eval "!!document.querySelector('.hud-help')"   # expect: true
agent-browser eval "document.querySelector('.hud-help').click(); !!document.querySelector('.onboarding-modal')"  # expect: true
agent-browser screenshot /tmp/rt-howto.png
```
Expected: a `.hud-help` round button exists in the night view; clicking it opens `.onboarding-modal` showing both "☀️ La prépa" and "🌙 La nuit" sections.

- [ ] **Step 6: Commit**

```bash
git add src/ui/onboarding.ts src/style.css src/ui/screens.ts
git commit -m "feat(onboarding): helpers DOM + modale Comment jouer + [?] en vue nuit

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Prep screen — tabs, sticky launch bar, `[?]`, remove dead hint

**Files:**
- Modify: `src/ui/screens.ts` (`PrepareSelection`, `PrepareCallbacks`, `renderPrepare` structure)
- Modify: `src/main.ts` (selection init; `onHelp` callback)
- Modify: `src/style.css` (tabs, scroll wrapper, launch bar)

- [ ] **Step 1: Extend the selection + callbacks types**

In `src/ui/screens.ts`, replace the `PrepareSelection` interface (currently lines 72-77):

```ts
export interface PrepareSelection {
  spot: SpotId;
  present: Set<string>;
  barStock: BarStock;
  caution: boolean;
}
```

with:

```ts
export type PrepTab = 'spot' | 'crew' | 'matos';

export interface PrepareSelection {
  spot: SpotId;
  present: Set<string>;
  barStock: BarStock;
  caution: boolean;
  /** Active tab on narrow screens (ignored by the desktop 3-column grid). */
  tab: PrepTab;
  /** Keys of expanded "locked content" teasers, e.g. 'spots' / 'crew'. */
  expanded: Set<string>;
}
```

In the same file, add `onHelp` to `PrepareCallbacks` (currently lines 79-97) — insert after `onLeaderboard(): void;`:

```ts
  onHelp(): void;
```

- [ ] **Step 2: Add the help button + tab bar to the prep top, and restructure into scroll + launch bar**

In `renderPrepare` (`src/ui/screens.ts`), do the following edits.

(a) Import the onboarding-state read (top of file, with the other imports):

```ts
import { loadOnboarding } from './onboarding-state';
```

(b) Add the `[?]` button to the top bar. After the `header.append(stats);` line (currently `src/ui/screens.ts:122`), insert:

```ts
  header.append(helpButton(!loadOnboarding(localStorage).helpSeen, () => cb.onHelp()));
```

(c) Wrap the scrollable content and split off the launch bar. The function currently appends `header`, then banners/offer, then `main` (`.prepare-grid`), then `footer`. Change the structure so everything except the launch button lives in a `.prepare-scroll` wrapper, and the launch button lives in a always-visible `.launch-bar`.

Replace the line `root.append(header);` (currently `src/ui/screens.ts:123`) with:

```ts
  const scroll = el('div', 'prepare-scroll');
  scroll.append(header);
```

Throughout the rest of the function, every `root.append(...)` for content (won-banner, region banner, offer card, `main`) becomes `scroll.append(...)`. Concretely, change these existing appends to use `scroll`:
- `root.append(depart);` → `scroll.append(depart);` (line ~132)
- `root.append(banner);` (region) → `scroll.append(banner);` (line ~144)
- `root.append(card);` (offer) → `scroll.append(card);` (line ~176)
- `root.append(main);` → `scroll.append(main);` (line ~404)

(d) Add the tab bar just before `const main = el('div', 'prepare-grid');` (line ~180):

```ts
  const tabs = el('div', 'prep-tabs');
  const TAB_ORDER: PrepTab[] = ['spot', 'crew', 'matos'];
  for (const t of TAB_ORDER) {
    const b = el('button', `btn tab prep-tab${selection.tab === t ? ' selected' : ''}`, STR.onboarding.tabs[t]);
    b.dataset.tab = t;
    b.addEventListener('click', () => {
      selection.tab = t;
      renderPrepare(root, state, selection, now, cb);
    });
    tabs.append(b);
  }
  scroll.append(tabs);
```

(e) Tag each panel with a tab class so CSS can show/hide them on mobile. Change the three panel creations:
- spots: `const where = el('section', 'panel');` → `const where = el('section', \`panel panel-spot${selection.tab === 'spot' ? ' active' : ''}\`);`
- crew: `const crewSec = el('section', 'panel');` → `const crewSec = el('section', \`panel panel-crew${selection.tab === 'crew' ? ' active' : ''}\`);`
- gear: `const shopSec = el('section', 'panel');` → `const shopSec = el('section', \`panel panel-matos${selection.tab === 'matos' ? ' active' : ''}\`);`

(f) Replace the footer block (currently lines 406-433, from `const footer = el('footer', 'prepare-footer');` through `root.append(footer);`) with a launch bar (always visible, outside the scroll) + a meta-actions row (inside the scroll):

```ts
  // meta actions stay in the scroll area (secondary)
  const meta = el('div', 'meta-actions');
  const herBtn = el('button', 'btn ghost', `⭐ ${STR.heritage} (${state.tour.legende})`);
  herBtn.addEventListener('click', () => cb.onHeritage());
  const lbBtn = el('button', 'btn ghost', `🏅 ${STR.leaderboard}`);
  lbBtn.addEventListener('click', () => cb.onLeaderboard());
  const expBtn = el('button', 'btn ghost', STR.exportSave);
  expBtn.addEventListener('click', () => cb.onExport());
  const impBtn = el('button', 'btn ghost', STR.importSave);
  impBtn.addEventListener('click', () => cb.onImport());
  const resetBtn = el('button', 'btn ghost danger', STR.newGameBtn);
  resetBtn.addEventListener('click', () => cb.onNewGame());
  meta.append(herBtn, lbBtn, expBtn, impBtn, resetBtn);
  scroll.append(meta);

  root.append(scroll);

  // always-visible launch bar (outside the scroll area)
  const launchBar = el('div', 'launch-bar');
  const canLaunch = selection.present.size > 0;
  const launch = el(
    'button',
    'btn launch',
    canLaunch ? `▶ ${STR.launch} — ${getSpot(selection.spot).nom}` : STR.needOneDj,
  );
  launch.disabled = !canLaunch;
  launch.addEventListener('click', () => cb.onLaunch());
  launchBar.append(launch);
  root.append(launchBar);
```

(g) Remove the dead first-hint render. Delete the final block (currently lines 435-437):

```ts
  if (state.nights === 0) {
    root.append(el('div', 'first-hint', STR.firstTimeHint));
  }
```

- [ ] **Step 3: Initialize the new selection fields in `main.ts`**

In `src/main.ts`, replace the `selection` initializer (lines 46-51):

```ts
const selection: PrepareSelection = {
  spot: 'champ',
  present: new Set(state.crew.map((d) => d.id)),
  barStock: 'normal',
  caution: false,
};
```

with:

```ts
const selection: PrepareSelection = {
  spot: 'champ',
  present: new Set(state.crew.map((d) => d.id)),
  barStock: 'normal',
  caution: false,
  tab: 'spot',
  expanded: new Set(),
};
```

- [ ] **Step 4: Wire `onHelp` in `main.ts`**

First add the onboarding imports near the top of `src/main.ts` (with the other `./ui` imports):

```ts
import { loadOnboarding, saveOnboarding } from './ui/onboarding-state';
import { howToModal } from './ui/onboarding';
```

Add a module-level onboarding state right after the `selection` block:

```ts
let onboarding = loadOnboarding(localStorage);
```

In the `renderPrepare(app, state, selection, Date.now(), { ... })` callbacks object (starts `src/main.ts:296`), add an `onHelp` handler (place it next to `onLeaderboard`):

```ts
    onHelp: () => {
      howToModal(() => {
        if (!onboarding.helpSeen) {
          onboarding = { ...onboarding, helpSeen: true };
          saveOnboarding(localStorage, onboarding);
          showPrepare(); // drop the pulse on the [?] button
        }
      });
    },
```

- [ ] **Step 5: Add the prep layout CSS**

Append to `src/style.css`:

```css
/* ---------- prep: tabs + sticky launch ---------- */
.prepare-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 1rem;
}
.prep-tabs {
  display: flex;
  gap: 0.4rem;
  padding: 0.6rem 1rem 0;
}
.prep-tab {
  flex: 1;
}
.launch-bar {
  flex-shrink: 0;
  padding: 0.7rem 1rem calc(0.7rem + env(safe-area-inset-bottom, 0px));
  border-top: 2px solid var(--border);
  background: var(--bg-panel);
}
.launch-bar .btn.launch {
  width: 100%;
}
@media (max-width: 859px) {
  .prepare-grid > .panel {
    display: none;
  }
  .prepare-grid > .panel.active {
    display: block;
  }
}
@media (min-width: 860px) {
  .prep-tabs {
    display: none;
  }
}
```

Then update the existing `.screen-prepare` rule (currently `src/style.css:107-110`) — the scroll now lives on `.prepare-scroll`, so change:

```css
.screen-prepare {
  overflow-y: auto;
  padding-bottom: 1rem;
}
```

to:

```css
.screen-prepare {
  overflow: hidden;
}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). The `STR.firstTimeHint` reference is now gone.

- [ ] **Step 7: Manual verification (mobile + desktop)**

With `npm run dev` running:

```bash
agent-browser open http://localhost:5173
agent-browser eval "localStorage.clear()"
agent-browser set viewport 390 844
agent-browser open http://localhost:5173
agent-browser wait --load networkidle
# launch bar always visible without scrolling, scroll area is short:
agent-browser eval "JSON.stringify({launchVisible: (()=>{const b=[...document.querySelectorAll('.launch-bar .btn.launch')][0]; const r=b.getBoundingClientRect(); return r.bottom<=window.innerHeight+1 && r.top>=0;})(), scrollRatio:(()=>{const s=document.querySelector('.prepare-scroll'); return +(s.scrollHeight/s.clientHeight).toFixed(2);})()})"
# expect launchVisible:true, and scrollRatio much smaller than the old 4.1 (one tab's content only)
agent-browser eval "[...document.querySelectorAll('.prep-tab')].map(t=>t.textContent)"  # expect ["Le spot","Le crew","Le matos"]
agent-browser eval "[...document.querySelectorAll('.prep-tab')].find(t=>t.dataset.tab==='crew').click(); document.querySelector('.panel-crew.active')?true:false"  # expect true
agent-browser screenshot /tmp/rt-prep-mobile.png
# desktop: tabs hidden, 3 columns, launch bar present
agent-browser set viewport 1280 800
agent-browser open http://localhost:5173
agent-browser wait --load networkidle
agent-browser eval "JSON.stringify({tabsHidden: getComputedStyle(document.querySelector('.prep-tabs')).display==='none', cols: getComputedStyle(document.querySelector('.prepare-grid')).gridTemplateColumns.split(' ').length})"  # expect tabsHidden:true, cols:3
agent-browser screenshot /tmp/rt-prep-desktop.png
```
Expected: on mobile the launch bar sits at the bottom of the viewport at first paint (no scroll needed), only the active tab's panel shows, tab switching works; on desktop tabs are hidden and the 3-column grid is intact with the launch bar below.

- [ ] **Step 8: Commit**

```bash
git add src/ui/screens.ts src/main.ts src/style.css
git commit -m "feat(onboarding): prépa en onglets + barre de lancement toujours visible

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Prep screen — hide locked content behind teasers

**Files:**
- Modify: `src/ui/screens.ts` (spots loop, crew locked-DJ loop, gear broke note)
- Modify: `src/style.css` (`.locked-teaser`)

- [ ] **Step 1: Spots — render unlocked, collapse locked behind a teaser**

In `renderPrepare`, the spots loop is currently `for (const spot of SPOTS) { ... where.append(card); }` (lines ~185-215). Replace that whole loop with a version that splits unlocked vs locked and gates the locked cards behind a teaser:

```ts
  const lockedSpots: typeof SPOTS = [];
  for (const spot of SPOTS) {
    const imposed = contract?.spotId;
    const unlocked = isSpotAvailable(state, spot.id) && (!imposed || spot.id === imposed);
    if (!unlocked && !selection.expanded.has('spots')) {
      lockedSpots.push(spot);
      continue;
    }
    const card = el('button', `card spot-card${selection.spot === spot.id ? ' selected' : ''}${unlocked ? '' : ' locked'}`);
    card.disabled = !unlocked;
    card.append(el('div', 'card-title', spot.id === 'teknival' ? `🏆 ${spot.nom}` : spot.nom));
    card.append(
      el('div', 'card-meta', `${STR.capacity(spot.cap)} · ${STR.duration(Math.round(spot.duration / 60))} · ${STR.setsCount(spot.setCount)}`),
    );
    const banned = buildRegionRules(state.region).bannedSpotIds.includes(spot.id);
    card.append(
      el(
        'div',
        'card-desc',
        unlocked
          ? spot.description
          : banned
            ? `🚧 ${STR.spotBanned}`
            : spot.requiresArc && !state.arcsCompleted.includes(spot.requiresArc)
              ? `🔒 ${STR.chateauLocked}`
              : `🔒 ${STR.repNeeded(spot.repReq)}`,
      ),
    );
    if (unlocked) {
      card.addEventListener('click', () => {
        selection.spot = spot.id;
        renderPrepare(root, state, selection, now, cb);
      });
    }
    where.append(card);
  }
  if (lockedSpots.length > 0) {
    const teaser = el('button', 'card locked-teaser', STR.onboarding.lockedSpots(lockedSpots.length));
    teaser.addEventListener('click', () => {
      selection.expanded.add('spots');
      renderPrepare(root, state, selection, now, cb);
    });
    where.append(teaser);
  }
```

Note: when `selection.expanded.has('spots')` is true, all spots (locked included) render exactly as before — no teaser. This preserves the existing "see everything" behaviour for players who tap to expand.

- [ ] **Step 2: Crew — collapse locked DJs behind a teaser**

The locked-DJ loop is currently `for (const def of lockedDjs(state)) { ... crewSec.append(card); }` (lines ~337-342). Replace it with:

```ts
  const locked = lockedDjs(state);
  if (locked.length > 0 && !selection.expanded.has('crew')) {
    const teaser = el('button', 'card locked-teaser', STR.onboarding.lockedDjs(locked.length));
    teaser.addEventListener('click', () => {
      selection.expanded.add('crew');
      renderPrepare(root, state, selection, now, cb);
    });
    crewSec.append(teaser);
  } else {
    for (const def of locked) {
      const card = el('div', 'card dj-card locked');
      card.append(el('div', 'card-title', `🔒 ${def.nom}`));
      card.append(el('div', 'card-desc', `${STR.repNeeded(djRepThreshold(state, def))}`));
      crewSec.append(card);
    }
  }
```

- [ ] **Step 3: Gear — gentle note when nothing is affordable**

After the gear loop, the code currently appends `shopSec.append(el('p', 'hint', STR.buzzHint));` (line ~402). Insert, immediately before that line:

```ts
  const anyAffordable = GEAR_CATEGORIES.some((cat) => {
    if (state.damaged[cat]) return state.cash >= rushCost(state, cat);
    return nextGearOptions(state, cat).some((o) => (!o.mythic || hasPerk(state, `mythe-${cat}`)) && state.cash >= o.price);
  });
  if (!anyAffordable) {
    shopSec.append(el('p', 'hint', STR.onboarding.brokeMatos));
  }
```

(`rushCost`, `nextGearOptions`, `hasPerk`, `GEAR_CATEGORIES` are already imported at the top of `screens.ts`.)

- [ ] **Step 4: Teaser CSS**

Append to `src/style.css`:

```css
.locked-teaser {
  text-align: center;
  color: var(--text-dim);
  border-style: dashed;
  font-size: 0.82rem;
  padding: 0.6rem 0.8rem;
}
.locked-teaser:hover {
  color: var(--text);
  border-color: var(--accent-2);
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Manual verification**

With `npm run dev` running:

```bash
agent-browser open http://localhost:5173
agent-browser eval "localStorage.clear()"
agent-browser set viewport 390 844
agent-browser open http://localhost:5173
agent-browser wait --load networkidle
# SPOT tab: exactly 1 unlocked spot card + 1 teaser (8 locked hidden)
agent-browser eval "JSON.stringify({spotCards: document.querySelectorAll('.panel-spot .spot-card').length, teaser: document.querySelector('.panel-spot .locked-teaser')?.textContent})"
# expect spotCards:1, teaser:"🔒 +8 spots à débloquer"
agent-browser eval "document.querySelector('.panel-spot .locked-teaser').click(); document.querySelectorAll('.panel-spot .spot-card').length"  # expect 9 after expanding
# CREW tab teaser
agent-browser eval "[...document.querySelectorAll('.prep-tab')].find(t=>t.dataset.tab==='crew').click(); document.querySelector('.panel-crew .locked-teaser')?.textContent"  # expect "🔒 +N DJs à débloquer"
# MATOS tab broke note (0 € start)
agent-browser eval "[...document.querySelectorAll('.prep-tab')].find(t=>t.dataset.tab==='matos').click(); [...document.querySelectorAll('.panel-matos .hint')].map(h=>h.textContent).join(' | ')"  # includes "Reviens quand la caisse suit 💶"
agent-browser screenshot /tmp/rt-teasers.png
```
Expected: a fresh game shows one spot + one teaser; expanding reveals all spots; the crew tab shows a DJ teaser; the matos tab shows the broke note.

- [ ] **Step 7: Commit**

```bash
git add src/ui/screens.ts src/style.css
git commit -m "feat(onboarding): masque le contenu verrouillé derrière un teaser dépliable

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: First-time coachmarks (prep + night)

**Files:**
- Modify: `src/main.ts` (build coach steps; trigger once on first prep render and first night set)

- [ ] **Step 1: Add `mountCoach` to the main.ts onboarding import**

In `src/main.ts`, change the onboarding DOM import added in Task 5:

```ts
import { howToModal } from './ui/onboarding';
```

to:

```ts
import { howToModal, mountCoach } from './ui/onboarding';
import type { CoachStep } from './ui/coach-flow';
```

- [ ] **Step 2: Add coach-trigger guards and a tab-switch helper**

In `src/main.ts`, right after `let onboarding = loadOnboarding(localStorage);` (added in Task 5), add:

```ts
let prepCoachActive = false;
let nightCoachActive = false;

function setPrepTab(tab: PrepareSelection['tab']): void {
  selection.tab = tab;
  showPrepare();
}

function maybeStartPrepCoach(): void {
  if (state.nights !== 0 || onboarding.prepCoachDone || prepCoachActive) return;
  prepCoachActive = true;
  const steps: CoachStep[] = [
    { anchor: '.panel-spot .spot-card', text: STR.onboarding.coachPrep[0], placement: 'bottom', onEnter: () => setPrepTab('spot') },
    { anchor: '.panel-crew .dj-card', text: STR.onboarding.coachPrep[1], placement: 'bottom', onEnter: () => setPrepTab('crew') },
    { anchor: '.launch-bar .btn.launch', text: STR.onboarding.coachPrep[2], placement: 'top', onEnter: () => setPrepTab('spot') },
  ];
  mountCoach(steps, () => {
    prepCoachActive = false;
    onboarding = { ...onboarding, prepCoachDone: true };
    saveOnboarding(localStorage, onboarding);
  });
}

function maybeStartNightCoach(): void {
  if (state.nights !== 0 || onboarding.nightCoachDone || nightCoachActive) return;
  nightCoachActive = true;
  const steps: CoachStep[] = [
    { anchor: '.live-controls', text: STR.onboarding.coachNight[0], placement: 'top' },
    { anchor: '.heat-wrap', text: STR.onboarding.coachNight[1], placement: 'top' },
    { anchor: '.wave-wrap', text: STR.onboarding.coachNight[2], placement: 'top' },
  ];
  mountCoach(steps, () => {
    nightCoachActive = false;
    onboarding = { ...onboarding, nightCoachDone: true };
    saveOnboarding(localStorage, onboarding);
  });
}
```

Note: `setPrepTab` calls `showPrepare()` which re-renders, but `prepCoachActive` is already `true`, so the `maybeStartPrepCoach()` guard prevents a re-mount. The coach overlay lives on `<body>` and survives the re-render; its ring re-queries the anchor each frame.

- [ ] **Step 3: Trigger the prep coach after the prep render**

In `showPrepare()` (`src/main.ts`), the function ends by calling `renderPrepare(app, state, selection, Date.now(), { ... })`. Immediately after that call returns (i.e. after the closing `});` of the callbacks object), add:

```ts
  maybeStartPrepCoach();
```

- [ ] **Step 4: Trigger the night coach on the first set**

In `onStartSet(djId)` (`src/main.ts:134`), there is already a `firstSet` boolean. After the existing `active.screen.toast(...)` at the end of the function (line ~142), add:

```ts
  if (firstSet) maybeStartNightCoach();
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Manual verification (both sequences, fire once)**

With `npm run dev` running:

```bash
agent-browser open http://localhost:5173
agent-browser eval "localStorage.clear()"
agent-browser set viewport 390 844
agent-browser open http://localhost:5173
agent-browser wait --load networkidle
agent-browser wait 400
agent-browser eval "JSON.stringify({ring: !!document.querySelector('.coach-ring'), tip: document.querySelector('.coach-text')?.textContent})"  # expect ring:true, tip = coachPrep[0]
# advance the prep coach
agent-browser eval "[...document.querySelectorAll('.coach-actions button')].find(b=>!b.classList.contains('ghost')).click(); document.querySelector('.coach-text').textContent"  # expect coachPrep[1] (and CREW tab now active)
agent-browser eval "[...document.querySelectorAll('.coach-actions button')].find(b=>!b.classList.contains('ghost')).click(); document.querySelector('.coach-text').textContent"  # expect coachPrep[2]
agent-browser eval "[...document.querySelectorAll('.coach-actions button')].find(b=>!b.classList.contains('ghost')).click(); JSON.stringify({coachGone: !document.querySelector('.coach-ring'), prepDone: JSON.parse(localStorage.getItem('rave-tycoon-onboarding')).prepCoachDone})"  # expect coachGone:true, prepDone:true
# reload: prep coach must NOT reappear
agent-browser open http://localhost:5173
agent-browser wait --load networkidle
agent-browser wait 400
agent-browser eval "!!document.querySelector('.coach-ring')"  # expect false
# night coach: launch, pick DJ, start set
agent-browser eval "document.querySelector('.launch-bar .btn.launch').click()"
agent-browser wait 1200
agent-browser eval "[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Balance le son')).click()"
agent-browser wait 1500
agent-browser eval "JSON.stringify({ring:!!document.querySelector('.coach-ring'), tip:document.querySelector('.coach-text')?.textContent})"  # expect ring:true, tip = coachNight[0]
agent-browser screenshot /tmp/rt-coach-night.png
```
Expected: on a fresh game the prep coach auto-runs (3 steps, switches to the CREW tab on step 2), marks `prepCoachDone`, and does not reappear after reload; the night coach auto-runs on the first set (3 steps anchored to the live controls, heat bar, wave bar).

- [ ] **Step 7: Commit**

```bash
git add src/main.ts
git commit -m "feat(onboarding): coachmarks guidés de première teuf (prépa + nuit)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Night HUD — visible energy-hint caption (mobile-friendly)

**Rationale:** the per-intensity explanations (`STR.intensiteHints`) currently live only in desktop `title=` tooltips on the cran buttons, invisible on touch. Instead of a tap-popover system, show the *selected* cran's hint as a small always-visible caption above the cran buttons — it teaches what the current energy does, on every device.

**Files:**
- Modify: `src/ui/screens.ts` (`renderNight`: add caption element; `update`: set its text)
- Modify: `src/style.css` (`.cran-hint`)

- [ ] **Step 1: Add the caption element to the live controls**

In `renderNight` (`src/ui/screens.ts`), the live controls are built starting at `const liveWrap = el('div', 'live-controls');` (line ~591), and the wave wrap is appended before the cran buttons. Insert a caption element right after `liveWrap.append(waveWrap);` (line ~600) and before the cran-button loop:

```ts
  const cranHint = el('div', 'cran-hint', '');
  liveWrap.append(cranHint);
```

- [ ] **Step 2: Update the caption text each frame**

In the returned `update(state, night)` method, the cran loop is at lines ~714-717:

```ts
      for (const [cran, btn] of cranBtns) {
        btn.classList.toggle('selected', night.intensity === cran);
        btn.disabled = !playing || night.intensity === cran;
      }
```

Immediately after that loop, add:

```ts
      cranHint.textContent = playing ? STR.intensiteHints[night.intensity] : '';
```

(`STR.intensiteHints` is already used in this file via `STR.intensites`; it's part of the same `STR` import.)

- [ ] **Step 3: Caption CSS**

Append to `src/style.css`:

```css
.cran-hint {
  font-size: 0.72rem;
  color: var(--text-dim);
  line-height: 1.3;
  min-height: 1.3em;
  margin: 0.1rem 0 0.2rem;
  text-align: center;
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Manual verification**

With `npm run dev` running, launch a night and start a set (see Task 7 step 6 for the launch commands), then:

```bash
agent-browser eval "document.querySelector('.cran-hint')?.textContent"  # expect a non-empty hint (e.g. the Groove or current cran description)
agent-browser eval "[...document.querySelectorAll('.live-cran')].find(b=>b.textContent==='Peak'&&!b.disabled)?.click(); document.querySelector('.cran-hint').textContent"  # expect the Peak hint text
```
Expected: the caption shows the current energy's description and updates when you change cran.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens.ts src/style.css
git commit -m "feat(onboarding): légende d'énergie visible sous les crans (mobile)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Full verification pass

**Files:** none (verification + final checks)

- [ ] **Step 1: Run the whole unit suite**

Run: `npm test`
Expected: PASS — including the new `onboarding-state` and `coach-flow` suites, and no regressions in the core sim tests.

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds (tsc + vite). No type errors, bundle emitted to `dist/`.

- [ ] **Step 4: End-to-end manual sweep (mobile + desktop)**

With `npm run dev` running, on a fresh game (`localStorage.clear()`), confirm the full beginner flow on **both** `set viewport 390 844` and `set viewport 1280 800`:

1. First load → prep coachmarks run (mobile) / are anchored to visible panels (desktop).
2. `[?]` in the top bar opens "Comment jouer" with both sections; after first open the pulse stops (reload → no pulse).
3. Only the available spot/DJ show; teasers expand the rest.
4. The launch bar is always visible; tapping it starts the night with no scrolling.
5. In the night: `[?]` opens the modal; the night coachmarks run once on the first set; the cran caption shows the energy hint.
6. Reload mid-way → no coach re-fires; `localStorage` has `rave-tycoon-onboarding` with the expected flags.

Capture: `agent-browser screenshot /tmp/rt-final-mobile.png` and `/tmp/rt-final-desktop.png`.

- [ ] **Step 5: Confirm saves are untouched**

Run: `rg "SAVE_VERSION" src/core/save.ts` → still `3`. Confirm no field was added to `GameState` (`rg "interface GameState" -A40 src/core/types.ts` unchanged). The onboarding key is separate (`rave-tycoon-onboarding`), so pre-existing game saves load exactly as before.

- [ ] **Step 6: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "chore(onboarding): vérification finale — tests, build, e2e mobile/desktop

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes (author check against the spec)

- **Spec §Persistance** → Task 1 (separate key, no `SAVE_VERSION` bump; verified in Task 9 step 5).
- **Spec §Composant 1 (onglets + lancer collant + verrouillé caché)** → Tasks 5 (tabs, sticky launch, responsive) + 6 (teasers, broke note).
- **Spec §Composant 2 (modale réouvrable, deux vues)** → Task 4 (modal + night `[?]`) + Task 5 (prep `[?]` + pulse + `onHelp`).
- **Spec §Composant 3 (coachmarks)** → Task 2 (pure cursor) + Task 7 (prep + night triggers, fire-once, tab-switch via `onEnter`).
- **Spec §Composant 4 (hints tactiles)** → Task 8. **Refinement vs spec:** implemented as an always-visible energy caption rather than a tap `infoPopover`, since a visible caption surfaces the hint on every device with far less infrastructure and matches the existing `.hint` pattern. Scope (intensité hints, the most confusing control) is covered; gift/jour-off/studio keep their desktop `title=` (lower priority, noted in the spec's "hors scope" spirit).
- **Spec §Tests** → pure modules unit-tested (Tasks 1-2); DOM/CSS verified via agent-browser (Tasks 4-8) — consistent with the project running vitest in node with no jsdom.
- **Type consistency:** `PrepTab` / `PrepareSelection.tab` / `selection.tab` (screens.ts ↔ main.ts); `CoachStep.onEnter` defined in Task 2, used in Tasks 4 & 7; `mountCoach`/`howToModal`/`helpButton` signatures consistent across Tasks 4, 5, 7; onboarding key string `rave-tycoon-onboarding` only via `onboarding-state.ts`.
- **Placeholder scan:** none — every step has concrete code/commands.
