# Rave Tycoon Gameplay Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken crowd sprites, make the first hour of play full of real choices, add live interaction during sets, and replace the chiptune synth with real loadable music stems.

**Architecture:** Seven independent stories, ordered by impact. Stories 1–2 fix the asset pipeline and terrain (visual). Story 3 rebalances `src/core/data.ts` + payout with a deterministic night-simulation test harness. Story 4 adds live in-set actions to the pure sim (`src/core/night.ts`) and a HUD. Story 5 deepens events and adds a night journal to the recap. Story 6 makes `AudioEngine` load real stem files with synth fallback. Story 7 diagnoses the unclickable launch button.

**Tech Stack:** TypeScript + Vite + vitest (already configured, zero tests exist yet — this plan introduces the first ones). Asset pipeline: node + sharp (`tools/build-assets.mjs`). Audio: Web Audio API.

**Context from the gameplay review (2026-06-11):**
- Crowd renders as floating heads: `public/assets/ravers.png` frames slice characters mid-body. Root cause verified by pixel probe: the LimeZu premade sheets are 896×656 with animation rows at y = 0, 32, 64, … and character ink starting ~10px into each 32px row. `tools/build-assets.mjs` uses `ROW_IDLE=16, ROW_WALK=48, ROW_LIFT=368, REF_FIRST_INK=2`, so every extraction is shifted ~24px and straddles two animation rows.
- One night at Champ paumé ≈ 153 € and +2 rep. First gear costs 250–400 €, first DJ needs 15 rep, first venue 25 rep → ~10 identical nights before anything unlocks.
- During a set there is zero interactivity (verified: no interactive elements, canvas clicks/keys ignored). Events are good but all binary safe/risky with invisible stakes.
- Audio is procedural Web Audio synthesis; the engine is cleanly isolated behind `start/stop/update(params)/beatPhase()`.

---

## Story 1 — Fix the floating-head crowd sprites

The single highest-impact visual fix. The renderer (`src/render/ravers.ts`) is correct; only the extraction constants in the asset pipeline are wrong.

### Task 1.1: Sprite-sheet integrity check script

**Files:**
- Create: `tools/check-ravers.mjs`

- [ ] **Step 1: Write the check script (it is the "failing test" for this story)**

A correct frame has the character's ink starting ≥6px below the frame top (head room), reaching the bottom rows (feet), with no internal vertical gap (a gap means the frame straddles two animation rows).

```js
/** Verifies public/assets/ravers.png frames contain whole bodies. Exit 1 on failure. */
import sharp from 'sharp';

const { data, info } = await sharp('public/assets/ravers.png')
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const FRAME_W = 16;
const FRAME_H = 32;
const CHARS = 20;
const FRONT_IDLE_COL = 18; // first front-facing idle frame (down direction starts at 6*3)

let bad = 0;
for (let c = 0; c < CHARS; c++) {
  const fx = FRONT_IDLE_COL * FRAME_W;
  const fy = c * FRAME_H;
  const inkRows = [];
  for (let y = 0; y < FRAME_H; y++) {
    let ink = false;
    for (let x = 0; x < FRAME_W; x++) {
      if (data[((fy + y) * info.width + fx + x) * 4 + 3] > 0) { ink = true; break; }
    }
    if (ink) inkRows.push(y);
  }
  const top = inkRows[0] ?? -1;
  const bottom = inkRows[inkRows.length - 1] ?? -1;
  let maxGap = 0;
  for (let i = 1; i < inkRows.length; i++) maxGap = Math.max(maxGap, inkRows[i] - inkRows[i - 1] - 1);
  const ok = top >= 6 && bottom >= FRAME_H - 3 && maxGap <= 4 && inkRows.length >= 14;
  if (!ok) {
    bad++;
    console.error(`char ${c}: ink y[${top},${bottom}] gap=${maxGap} rows=${inkRows.length} — body truncated or split`);
  }
}
if (bad > 0) {
  console.error(`${bad}/${CHARS} characters broken`);
  process.exit(1);
}
console.log(`all ${CHARS} characters have full bodies`);
```

- [ ] **Step 2: Run it against the current (broken) sheet to verify it fails**

Run: `node tools/check-ravers.mjs`
Expected: FAIL — every character reported with `top=0` and/or `gap>4`, exit code 1.

- [ ] **Step 3: Commit the check script**

```bash
git add tools/check-ravers.mjs
git commit -m "test(assets): ravers sheet integrity check (currently failing)"
```

### Task 1.2: Fix the extraction offsets

**Files:**
- Modify: `tools/build-assets.mjs:19-27` and `tools/build-assets.mjs:43`

- [ ] **Step 1: Correct the row constants**

The actual sheet (pixel-probed on `Premade_Character_01.png`, 896×656): animation rows sit on a 32px grid starting at y=0, and the reference character's first ink row is y=10. The old constants assumed a 16px-offset grid and first ink at y=2. Keep the same *relative* row structure (idle row 0, walk row 1, lift row 11):

```js
// 16x16 premade sheet geometry (verified by pixel probe 2026-06-11:
// sheet 896x656, frame rows on a 32px grid from y=0, first ink at y=10)
const FRAME_W = 16;
const FRAME_H = 32;
const ROW_IDLE = 0;
const ROW_WALK = 32;
const ROW_LIFT = 352;
const IDLE_FRAMES = 24; // 6 per direction: right, up, left, down
const WALK_FRAMES = 24;
const LIFT_FRAMES = 56; // 14 per direction
const CHAR_COUNT = 20;
```

and:

```js
const REF_FIRST_INK = 10;
```

- [ ] **Step 2: Rebuild assets**

Run: `npm run assets`
Expected: `ravers.png: 20 chars × 104 frames`, `portraits: 8 DJs`, no MISSING warnings for ravers/portraits.

- [ ] **Step 3: Run the integrity check**

Run: `node tools/check-ravers.mjs`
Expected: PASS — `all 20 characters have full bodies`.

If any character still fails, that sheet has different padding; print its `sheetOffset` and inspect a crop:
`sips -c 128 128 public/assets/ravers.png --out /tmp/ravers-crop.png && sips -z 512 512 /tmp/ravers-crop.png --out /tmp/ravers-big.png` then view `/tmp/ravers-big.png` — you should see complete little characters (head + torso + feet), not detached heads.

- [ ] **Step 4: Visual confirmation in-game**

Run: `npm run dev` then with agent-browser open `http://localhost:5173/`, launch a night (`Lancer la teuf`), wait ~20s, screenshot. Crowd members must be full bodies; the DJ portrait on the set-choice modal must be a face, not a hair blob. Also verify the row assignment is right: crowd members should *stand/bob* (idle), walkers should *walk* — if animations look swapped or characters T-pose, the idle/walk row indices need re-probing (check rows 0 and 1 of the source sheet frame-by-frame).

- [ ] **Step 5: Commit**

```bash
git add tools/build-assets.mjs
git commit -m "fix(assets): align ravers extraction to the real LimeZu 32px row grid"
```

Note: `public/assets/` is gitignored — the fix ships via the pipeline, CI/docker must run `npm run assets`.

---

## Story 2 — Terrain cleanup (the "buggy" brown squares)

The scattered brown tiles come from `grass_3` (`Grass_1_21`, a different-family tile) being mixed into the grass at ~8% of cells with hard edges, in `SceneRenderer.drawTerrain`. Same for the asphalt spots. Make variation subtle and same-family.

### Task 2.1: Same-family two-tile terrain variation

**Files:**
- Modify: `src/render/scene.ts:45-131` (RECIPES terrain arrays) and `src/render/scene.ts:197-204` (drawTerrain)

- [ ] **Step 1: Drop the off-family tile from the grass recipes**

In `RECIPES`, change the three grass spots to two-tile arrays (both are Grass_2-family center tiles):

```ts
champ:    { terrain: ['grass_1', 'grass_2'], ... }     // was ['grass_1', 'grass_2', 'grass_3']
foret:    { terrain: ['grass_2', 'grass_1'], ... }     // was ['grass_2', 'grass_3', 'grass_1']
teknival: { terrain: ['grass_1', 'grass_2'], ... }     // was ['grass_1', 'grass_3', 'grass_2']
```

Leave the asphalt recipes (3 variations of the same Asphalt_1 family) untouched — they already match.

- [ ] **Step 2: Soften the variation frequency in drawTerrain**

Replace the tile-pick at `src/render/scene.ts:199-201`:

```ts
// deterministic variation, heavily biased to the first tile
const h = (tx * 31 + ty * 17) % 13;
const tile = tiles[h < 11 ? 0 : 1 % tiles.length];
```

- [ ] **Step 3: Visual check**

Run: `npm run dev`, launch a night at Champ paumé, screenshot. The floor should read as continuous grass with subtle variation — no isolated hard-edged brown squares.

- [ ] **Step 4: Commit**

```bash
git add src/render/scene.ts
git commit -m "fix(render): subtle same-family terrain variation, no more dirt squares"
```

---

## Story 3 — Early-game progression rebalance

Measured baseline: night 1 ≈ 153 € / +2 rep. Targets after this story: something new to buy after night 1, first DJ after ~2 nights, first venue after ~3 nights.

### Task 3.1: Deterministic night-simulation test harness

This harness is the regression net for all balance work. It plays a full night headlessly through the real sim.

**Files:**
- Create: `src/core/progression.test.ts`

- [ ] **Step 1: Write the harness and the (initially failing) progression tests**

```ts
import { describe, expect, it } from 'vitest';
import { DJS, GEAR } from './data';
import { createNight, resolveEvent, startSet, tickNight } from './night';
import { settleNight } from './payout';
import { newGame } from './save';
import type { GameState, NightResult } from './types';

/** Play one full night at the current selection, always picking event option 0. */
function playNight(state: GameState, seed: number): NightResult {
  const night = createNight(state, 'champ', 'hardtek', ['tonton'], seed);
  // guard against balance changes hanging the loop
  for (let guard = 0; guard < 100_000 && night.phase !== 'ended'; guard++) {
    if (night.phase === 'transition') startSet(state, night, 'tonton', 'normal');
    if (night.phase === 'event') resolveEvent(state, night, 0);
    tickNight(state, night, 0.1);
  }
  expect(night.phase).toBe('ended');
  expect(night.sunrise).toBe(true); // a normal-brief champ night must never bust
  return settleNight(state, night);
}

describe('early-game progression curve', () => {
  it('night 1 funds a first purchase', () => {
    const state = newGame(42);
    playNight(state, 1234);
    // at least one tier-1 gear upgrade must be affordable after one night
    const cheapest = Math.min(
      ...Object.values(GEAR).map((items) => items[1].price),
    );
    expect(state.cash).toBeGreaterThanOrEqual(cheapest);
  });

  it('first DJ unlocks within 2 nights, first venue within 4', () => {
    const state = newGame(42);
    playNight(state, 1);
    playNight(state, 2);
    const gamine = DJS.find((d) => d.id === 'gamine')!;
    expect(state.rep).toBeGreaterThanOrEqual(gamine.repReq);
    playNight(state, 3);
    playNight(state, 4);
    expect(state.rep).toBeGreaterThanOrEqual(12); // forêt threshold after Task 3.2
  });
});
```

- [ ] **Step 2: Run to verify current balance fails it**

Run: `npx vitest run src/core/progression.test.ts`
Expected: FAIL — cash after night 1 (~150) is below the cheapest tier-1 price (250), and rep after 2 nights (~4) is below La Gamine's 15.

- [ ] **Step 3: Commit the harness**

```bash
git add src/core/progression.test.ts
git commit -m "test(core): deterministic night harness + progression targets (red)"
```

### Task 3.2: Rebalance the numbers

**Files:**
- Modify: `src/core/data.ts` (GEAR prices, DJ repReq, spot repReq)
- Modify: `src/core/payout.ts:34` (flat sunrise rep)

- [ ] **Step 1: Cheaper tier-1 gear, closer early unlocks**

In `src/core/data.ts`, change only these numbers (tiers 2–3 and late-game stay as-is):

```ts
// GEAR tier-1 prices — first purchase after night 1, second after night 2
platines tier 1:   price: 350 → 200
mur tier 1:        price: 400 → 250
groupe tier 1:     price: 300 → 180
lumieres tier 1:   price: 250 → 120
logistique tier 1: price: 300 → 180

// DJ unlocks — first new DJ ~2 nights in
gamine:    repReq: 15 → 6
boblepine: repReq: 40 → 20
kilowatt:  repReq: 90 → 55

// Spots — first new venue ~3 nights in
foret:    repReq: 25 → 12
carriere: repReq: 70 → 45
```

- [ ] **Step 2: Flat sunrise reputation**

Holding a free party to sunrise should always grow the legend. In `src/core/payout.ts`, line 34:

```ts
const SUNRISE_REP = 3;
const repGained = Math.round(
  SUNRISE_REP + night.peakCrowd / 10 + (survivedHighHeat ? 15 : 0) + night.repBonus,
);
```

(`SUNRISE_REP` declared next to the function, module scope.)

- [ ] **Step 3: Run the progression tests**

Run: `npx vitest run src/core/progression.test.ts`
Expected: PASS both tests. If cash lands just short, the lever to pull is `BAR_DRIP` in `src/core/night.ts:16` (0.05 → 0.06) — prefer that over further price cuts, then re-run.

- [ ] **Step 4: Sanity-check the whole suite and the build**

Run: `npm run test && npm run build`
Expected: all green, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/data.ts src/core/payout.ts src/core/night.ts
git commit -m "balance: first purchase after night 1, DJ at 2 nights, venue at 3"
```

---

## Story 4 — Live mixing: things to do during a set

The sim pauses for modals but ignores the player while 'playing'. Add two live actions driven from the HUD: **change the brief mid-set** (with a lock-in period) and a **"Relance !" hype drop** (vibe burst, heat cost, long cooldown). Pure logic in `night.ts` (tested), thin UI in `screens.ts`.

### Task 4.1: Pure sim logic + tests

**Files:**
- Modify: `src/core/types.ts:173-214` (NightState)
- Modify: `src/core/night.ts` (createNight, tickNight, new functions)
- Create: `src/core/live.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { BRIEF_LOCK, HYPE_COOLDOWN, changeBrief, createNight, dropHype, resolveEvent, startSet, tickNight } from './night';
import { newGame } from './save';

/** Tick the sim n seconds, auto-resolving any random event so the clock keeps moving. */
function tickFor(state: ReturnType<typeof newGame>, night: ReturnType<typeof createNight>, seconds: number) {
  for (let t = 0; t < seconds; t += 0.1) {
    if (night.phase === 'event') resolveEvent(state, night, 0);
    tickNight(state, night, 0.1);
  }
}

function playingNight() {
  const state = newGame(42);
  const night = createNight(state, 'champ', 'hardtek', ['tonton'], 7);
  startSet(state, night, 'tonton', 'normal');
  return { state, night };
}

describe('live brief changes', () => {
  it('changes the brief and recomputes quality, then locks', () => {
    const { state, night } = playingNight();
    const q0 = night.setQuality;
    expect(changeBrief(state, night, 'pousser')).toBe(true);
    expect(night.brief).toBe('pousser');
    expect(night.setQuality).toBeGreaterThan(q0);
    expect(changeBrief(state, night, 'safe')).toBe(false); // locked
  });

  it('unlocks after BRIEF_LOCK seconds of play', () => {
    const { state, night } = playingNight();
    changeBrief(state, night, 'pousser');
    tickFor(state, night, BRIEF_LOCK + 1);
    expect(changeBrief(state, night, 'safe')).toBe(true);
  });

  it('refuses outside the playing phase', () => {
    const state = newGame(42);
    const night = createNight(state, 'champ', 'hardtek', ['tonton'], 7);
    expect(changeBrief(state, night, 'pousser')).toBe(false); // transition phase
  });
});

describe('hype drop', () => {
  it('boosts vibe, costs heat, then cools down', () => {
    const { state, night } = playingNight();
    const vibe = night.vibe;
    const heat = night.heat;
    expect(dropHype(night)).toBe(true);
    expect(night.vibe).toBeGreaterThan(vibe);
    expect(night.heat).toBeGreaterThan(heat);
    expect(dropHype(night)).toBe(false); // cooling down
    tickFor(state, night, HYPE_COOLDOWN + 1); // auto-resolves events; 51s stays within the 90s set
    expect(dropHype(night)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/core/live.test.ts`
Expected: FAIL — `changeBrief`/`dropHype`/`BRIEF_LOCK`/`HYPE_COOLDOWN` not exported.

- [ ] **Step 3: Implement**

`src/core/types.ts`, add to `NightState` (after `repBonus: number;`):

```ts
/** seconds before the brief can be changed again mid-set */
briefLockT: number;
/** seconds before the hype drop is available again */
hypeT: number;
```

`src/core/night.ts` — init both to `0` in `createNight` (after `repBonus: 0,`); decrement at the top of `tickNight` (next to the other clocks, inside the playing-phase body):

```ts
night.briefLockT = Math.max(0, night.briefLockT - dt);
night.hypeT = Math.max(0, night.hypeT - dt);
```

New exported API (bottom of `night.ts`):

```ts
export const BRIEF_LOCK = 18;
export const HYPE_COOLDOWN = 50;

/** Change the consigne mid-set. The desk locks for BRIEF_LOCK seconds after. */
export function changeBrief(state: GameState, night: NightState, brief: Brief): boolean {
  if (night.phase !== 'playing' || night.briefLockT > 0 || night.brief === brief) return false;
  night.brief = brief;
  if (night.currentDj) {
    night.setQuality = computeSetQuality(state, night, night.currentDj, brief);
  }
  night.briefLockT = BRIEF_LOCK;
  return true;
}

/** MC grabs the mic: vibe burst now, more heat, long cooldown. */
export function dropHype(night: NightState): boolean {
  if (night.phase !== 'playing' || night.hypeT > 0) return false;
  night.vibe = clamp(night.vibe + 0.12, 0, 1);
  night.heat = clamp(night.heat + 0.05, 0, 0.99);
  night.hypeT = HYPE_COOLDOWN;
  return true;
}
```

Note: `startSet` must also reset `night.briefLockT = 0` so each set starts unlocked.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/core/live.test.ts`
Expected: PASS (also re-run `npm run test` — the progression harness must still pass).

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/core/night.ts src/core/live.test.ts
git commit -m "feat(core): live brief changes and hype drop during sets"
```

### Task 4.2: HUD controls

**Files:**
- Modify: `src/ui/screens.ts:277-453` (NightScreen interface + renderNight)
- Modify: `src/ui/strings.ts` (labels)
- Modify: `src/main.ts:61-99` (wire callbacks)
- Modify: `src/style.css` (control styles)

- [ ] **Step 1: Extend renderNight with live callbacks**

Change the signature and interface:

```ts
export interface NightLiveCallbacks {
  onBrief(brief: Brief): void;
  onHype(): void;
}

export function renderNight(root: HTMLElement, live: NightLiveCallbacks): NightScreen {
```

Inside `renderNight`, after the `vibeWrap` block (`src/ui/screens.ts:316-321`), build a live control cluster appended to `bottomBar`:

```ts
const liveWrap = el('div', 'live-controls');
const briefBtns = new Map<Brief, HTMLButtonElement>();
for (const brief of ['safe', 'normal', 'pousser'] as Brief[]) {
  const b = el('button', 'live-brief', STR.briefShort[brief]) as HTMLButtonElement;
  b.addEventListener('click', () => live.onBrief(brief));
  briefBtns.set(brief, b);
  liveWrap.append(b);
}
const hypeBtn = el('button', 'live-hype', STR.hypeAction) as HTMLButtonElement;
hypeBtn.addEventListener('click', () => live.onHype());
liveWrap.append(hypeBtn);
bottomBar.append(liveWrap);
```

In `update(night)`, reflect sim state:

```ts
const playing = night.phase === 'playing';
for (const [brief, btn] of briefBtns) {
  btn.classList.toggle('selected', night.brief === brief);
  btn.disabled = !playing || night.briefLockT > 0 || night.brief === brief;
}
hypeBtn.disabled = !playing || night.hypeT > 0;
hypeBtn.textContent = night.hypeT > 0 ? `${STR.hypeAction} (${Math.ceil(night.hypeT)})` : STR.hypeAction;
```

- [ ] **Step 2: Strings**

In `src/ui/strings.ts` add (inside `STR`):

```ts
briefShort: { safe: 'Calmer', normal: 'Normal', pousser: 'Pousser' } as Record<Brief, string>,
hypeAction: '📣 Relance !',
hypeToast: '📣 Le MC relance le champ !',
briefToast: (b: Brief) => `🎚 Consigne : ${STR.briefs[b]}`,
```

(`strings.ts` already imports types it needs for `briefs`; mirror that import style for `Brief`.)

- [ ] **Step 3: Wire main.ts**

In `startNight()` (`src/main.ts:67`), pass the callbacks:

```ts
const screen = renderNight(app, {
  onBrief: (brief) => {
    if (active && changeBrief(state, active.night, brief)) {
      active.screen.toast(STR.briefToast(brief));
    }
  },
  onHype: () => {
    if (active && dropHype(active.night)) {
      active.screen.toast(STR.hypeToast);
    }
  },
});
```

Import `changeBrief, dropHype` from `./core/night`.

- [ ] **Step 4: Styles**

In `src/style.css`, next to the `.night-bottom` rules:

```css
.live-controls { display: flex; gap: 6px; align-items: center; }
.live-brief, .live-hype {
  font: inherit; padding: 6px 10px; border-radius: 8px; cursor: pointer;
  background: #1b1430; color: #cfc3ee; border: 1px solid #3a2d63;
}
.live-brief.selected { border-color: #ff4f9a; color: #fff; }
.live-brief:disabled, .live-hype:disabled { opacity: 0.45; cursor: default; }
.live-hype { background: #2a1430; border-color: #7a2d63; }
```

- [ ] **Step 5: Manual verification**

`npm run dev`, launch a night. During a set: brief buttons clickable (current one highlighted), clicking Pousser shows the toast and audibly drives the music harder (the audio engine already reacts to `brief === 'pousser'` via `main.ts:142`); Relance bumps the vibe bar and disables with a countdown. `npm run build` stays clean.

- [ ] **Step 6: Commit**

```bash
git add src/ui/screens.ts src/ui/strings.ts src/main.ts src/style.css
git commit -m "feat(ui): live brief + hype controls in the night HUD"
```

---

## Story 5 — Events with stakes + a night journal

Events stay the heart of the night, but: (a) money-cost options give a third way out, (b) choices and outcomes are remembered and shown at sunrise so consequences are legible.

### Task 5.1: Journal in the sim

**Files:**
- Modify: `src/core/types.ts` (NightState, NightResult)
- Modify: `src/core/night.ts` (createNight, resolveEvent)
- Modify: `src/core/payout.ts` (copy journal into results)
- Create: `src/core/journal.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { NIGHT_EVENTS } from './events';
import { createNight, resolveEvent, startSet } from './night';
import { settleNight } from './payout';
import { newGame } from './save';

describe('night journal', () => {
  it('records each resolved event and surfaces it in the result', () => {
    const state = newGame(42);
    const night = createNight(state, 'champ', 'hardtek', ['tonton'], 7);
    startSet(state, night, 'tonton', 'normal');
    night.pendingEvent = { def: NIGHT_EVENTS[0] };
    night.phase = 'event';
    resolveEvent(state, night, 1);
    expect(night.journal).toHaveLength(1);
    expect(night.journal[0].titre).toBe(NIGHT_EVENTS[0].titre);
    expect(night.journal[0].outcome).toBe(NIGHT_EVENTS[0].options[1].outcome);
    night.phase = 'ended';
    night.sunrise = true;
    const result = settleNight(state, night);
    expect(result.journal).toHaveLength(1);
  });
});
```

Run: `npx vitest run src/core/journal.test.ts` — Expected: FAIL (no `journal` field).

- [ ] **Step 2: Implement**

`src/core/types.ts`:

```ts
export interface JournalEntry {
  /** night-seconds when it happened */
  t: number;
  titre: string;
  outcome: string;
}
```

Add `journal: JournalEntry[];` to `NightState` and `journal: JournalEntry[];` to `NightResult`.

`src/core/night.ts` — `createNight`: `journal: [],`. In `resolveEvent`, before `night.pendingEvent = null;`:

```ts
night.journal.push({ t: night.t, titre: night.pendingEvent.def.titre, outcome: option.outcome });
```

`src/core/payout.ts` — both `settleNight` and `applyBust` result literals get `journal: night.journal,`.

- [ ] **Step 3: Run tests, then commit**

Run: `npm run test` — Expected: all PASS.

```bash
git add src/core/types.ts src/core/night.ts src/core/payout.ts src/core/journal.test.ts
git commit -m "feat(core): night journal of event choices"
```

### Task 5.2: Cash-cost third options + affordability in the UI

**Files:**
- Modify: `src/core/events.ts` (two events get a third option)
- Modify: `src/ui/screens.ts:431-451` (showEvent disables unaffordable options)

- [ ] **Step 1: Add the options**

`patrouille` gains:

```ts
{
  label: 'Graisser la patte (80 €)',
  outcome: 'Une poignée de billets de la buvette change de main. La voiture ne repassera pas cette nuit.',
  effects: { cash: -80, heat: -0.25 },
},
```

`enceinte-chauffe` gains:

```ts
{
  label: 'Sacrifier un câble de rechange (40 €)',
  outcome: 'Rewiring de fortune à l’arrache. Le caisson respire, le son tient.',
  effects: { cash: -40, qualityMult: 0.95 },
},
```

- [ ] **Step 2: Disable what the bank can't cover**

`showEvent` in `src/ui/screens.ts` needs the night's bank. Change the `NightScreen` interface method to `showEvent(night: NightState, pending: PendingEvent, onChoose: (index: number) => string): void;` and in the option loop:

```ts
pending.def.options.forEach((option, i) => {
  const btn = el('button', 'card event-option') as HTMLButtonElement;
  btn.append(el('div', 'card-title', option.label));
  const cost = option.effects.cash && option.effects.cash < 0 ? -option.effects.cash : 0;
  if (cost > night.bank) {
    btn.disabled = true;
    btn.append(el('div', 'card-desc', STR.cantAfford));
  }
  ...
```

Add `cantAfford: 'La caisse ne suit pas',` to `STR`. Update the call site `src/main.ts:124`: `screen.showEvent(night, night.pendingEvent, ...)`.

- [ ] **Step 3: Manual check + commit**

`npm run dev`; with an empty bank early in a night, trigger events (they fire after ~20-50s) — a costed option must show disabled with the hint. `npm run build` clean.

```bash
git add src/core/events.ts src/ui/screens.ts src/ui/strings.ts src/main.ts
git commit -m "feat(events): cash-cost mitigation options, affordability-aware UI"
```

### Task 5.3: Journal on the recap screen

**Files:**
- Modify: `src/ui/screens.ts` (renderRecap)
- Modify: `src/ui/strings.ts`

- [ ] **Step 1: Render it**

In `renderRecap`, insert after `panel.append(lines);` (`src/ui/screens.ts:511`, between the stat lines and the score row), when `result.journal.length > 0`:

```ts
panel.append(el('h3', 'recap-sub', STR.nightJournal));
const list = el('div', 'journal-list');
for (const entry of result.journal) {
  const row = el('div', 'journal-row');
  row.append(el('span', 'journal-title', entry.titre));
  row.append(el('span', 'journal-outcome', entry.outcome));
  list.append(row);
}
panel.append(list);
```

Add `nightJournal: 'Les histoires de la nuit',` to `STR`, and minimal styles (`.journal-row { font-size: 11px; opacity: 0.85; margin: 2px 0; }` etc. in `src/style.css`).

- [ ] **Step 2: Manual check + commit**

Play a night with at least one event; the sunrise recap lists each event title + outcome.

```bash
git add src/ui/screens.ts src/ui/strings.ts src/style.css
git commit -m "feat(ui): night journal on the sunrise recap"
```

---

## Story 6 — Real music: loadable stem packs with synth fallback

Keep the param-driven mixer exactly as is (energy layering, push distortion, brownout cuts — that system is good). Replace only *what* it plays: fetch + decode real per-genre stem loops from `public/audio/`, falling back to the current synthesis when files are absent. This keeps the repo shippable with no audio assets committed.

### Task 6.1: Stem loader in the engine

**Files:**
- Modify: `src/audio/engine.ts`
- Create: `src/audio/manifest.ts`
- Create: `src/audio/manifest.test.ts`

- [ ] **Step 1: Manifest schema + pure helpers (failing test first)**

`src/audio/manifest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { loopSecondsFor, parseManifest } from './manifest';

describe('audio manifest', () => {
  it('computes loop length from bars and bpm', () => {
    expect(loopSecondsFor({ bpm: 170, bars: 4, stems: { kick: 'k', sub: 's', lead: 'l', hats: 'h' } }))
      .toBeCloseTo(4 * 4 * (60 / 170));
  });

  it('rejects entries missing stems', () => {
    expect(parseManifest({ hardtek: { bpm: 170, bars: 4, stems: { kick: 'k' } } })).toEqual({});
    const good = { hardtek: { bpm: 170, bars: 4, stems: { kick: 'k', sub: 's', lead: 'l', hats: 'h' } } };
    expect(parseManifest(good)).toEqual(good);
  });
});
```

Run: `npx vitest run src/audio/manifest.test.ts` — FAIL (module missing).

`src/audio/manifest.ts`:

```ts
import type { GenreId } from '../core/types';

export const STEM_NAMES = ['kick', 'sub', 'lead', 'hats'] as const;
export type StemName = (typeof STEM_NAMES)[number];

export interface StemManifestEntry {
  bpm: number;
  /** loop length in 4/4 bars */
  bars: number;
  /** file names relative to /audio/ */
  stems: Record<StemName, string>;
}

export type StemManifest = Partial<Record<GenreId, StemManifestEntry>>;

export function loopSecondsFor(entry: StemManifestEntry): number {
  return entry.bars * 4 * (60 / entry.bpm);
}

/** Keep only well-formed entries; tolerate junk so a bad manifest can't break the game. */
export function parseManifest(raw: unknown): StemManifest {
  const out: StemManifest = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [genre, entry] of Object.entries(raw as Record<string, unknown>)) {
    const e = entry as StemManifestEntry;
    if (
      e && typeof e.bpm === 'number' && e.bpm > 0 &&
      typeof e.bars === 'number' && e.bars > 0 &&
      e.stems && STEM_NAMES.every((s) => typeof e.stems[s] === 'string')
    ) {
      out[genre as GenreId] = e;
    }
  }
  return out;
}
```

Run again — PASS. Commit:

```bash
git add src/audio/manifest.ts src/audio/manifest.test.ts
git commit -m "feat(audio): stem manifest schema"
```

- [ ] **Step 2: Engine loads real stems, falls back to synth**

In `src/audio/engine.ts`:

Import the manifest module; the engine's local `STEM_NAMES`/`StemName` move to (or re-export from) `manifest.ts` to avoid duplication.

Add fields and the loader:

```ts
private bpm = 0;          // bpm of whatever is currently looping
private manifest: StemManifest | null | undefined; // undefined = not fetched yet

private async fetchManifest(): Promise<StemManifest | null> {
  if (this.manifest !== undefined) return this.manifest;
  try {
    const res = await fetch('/audio/manifest.json');
    this.manifest = res.ok ? parseManifest(await res.json()) : null;
  } catch {
    this.manifest = null;
  }
  return this.manifest;
}

/** Real stems from /audio/, or null → caller falls back to synthesis. */
private async loadRealStems(
  ctx: AudioContext,
  genreId: GenreId,
): Promise<{ buffers: StemBuffers; bpm: number } | null> {
  const manifest = await this.fetchManifest();
  const entry = manifest?.[genreId];
  if (!entry) return null;
  try {
    const buffers = {} as StemBuffers;
    await Promise.all(
      STEM_NAMES.map(async (name) => {
        const res = await fetch(`/audio/${entry.stems[name]}`);
        if (!res.ok) throw new Error(`missing stem ${entry.stems[name]}`);
        buffers[name] = await ctx.decodeAudioData(await res.arrayBuffer());
      }),
    );
    return { buffers, bpm: entry.bpm };
  } catch (err) {
    console.warn('[audio] stem load failed, falling back to synth:', err);
    return null;
  }
}
```

In `start(genreId)`, replace the render call (`engine.ts:91`):

```ts
const real = await this.loadRealStems(ctx, genreId);
const buffers = real ? real.buffers : await renderStems(patterns, ctx.sampleRate);
this.bpm = real ? real.bpm : patterns.bpm;
```

And `beatPhase()` uses `this.bpm` instead of `this.patterns.bpm` (`engine.ts:201`):

```ts
const beat = (this.ctx.currentTime - this.loopStart) / (60 / this.bpm);
```

Loop-length note: `source.loop = true` loops each stem at its own buffer length — stems within a genre MUST be rendered/cut to the identical bar count, which Task 6.2's normalization step guarantees; the manifest's `bars` is the source of truth for documentation, while actual looping uses buffer length.

- [ ] **Step 3: Verify fallback path (no assets yet)**

`npm run test && npm run build`, then `npm run dev`: with no `public/audio/` directory, launching a night must play the synth exactly as before, with one console warn at most. (`fetch` of a missing file in dev returns the index.html 200 — that's why `decodeAudioData` failure must also be caught; the try/catch above covers it.)

- [ ] **Step 4: Commit**

```bash
git add src/audio/engine.ts
git commit -m "feat(audio): load real stem loops when present, synth fallback"
```

### Task 6.2: Acquire and prepare the stems

**Files:**
- Create: `public/audio/manifest.json`, `public/audio/*.ogg` (gitignored like the rest of `public/assets` — decide: either commit them, or add to the `npm run assets` doc; CC0 files CAN be committed)
- Create: `docs/audio-credits.md`
- Create: `assets-src/audio-src/` (raw downloads, gitignored alongside the LimeZu packs)

**Licensing ground rules (researched & verified 2026-06-11):** the game serves raw loop files over HTTP, which counts as redistributing the files. Therefore: **CC0 only by default, CC-BY acceptable with a credits file.** Explicitly AVOID: Looperman (FAQ forbids redistributing loops "as is"), and treat 99Sounds / MusicRadar SampleRadar / Dubmatix free packs as gray-zone (royalty-free in *productions*, no raw-file redistribution) — skip them unless re-rendered into new mixed stems.

- [ ] **Step 1: Download the CC0 source material (free Freesound account needed)**

Save everything into `assets-src/audio-src/<genre>/`, noting author + URL for each file:

*Hardtek (~170 BPM):*
- Cyclez — "Hardtekk Samples - Hardtek Kick", 170 BPM kick loop, CC0: https://freesound.org/people/Cyclez/sounds/493665/
- goac0re1 — Gabber breakbeat 160 BPM, CC0: https://freesound.org/people/goac0re1/sounds/322315/
- ElectroShockNetwork — kick loop 180 BPM, CC0: https://freesound.org/people/ElectroShockNetwork/sounds/331819/
- rap2h — 180 BPM hardtek piano loop (lead material), CC0: https://freesound.org/people/rap2h/sounds/115262/
- More via the CC0 filter: https://freesound.org/search/?q=gabber+kick+loop&f=license:%22Creative+Commons+0%22

*Acid (~140 BPM):*
- XHALE303 — ACID TB-303 pack (filter the profile to CC0 sounds; ~27 loops at ~130 BPM, e.g. https://freesound.org/people/XHALE303/sounds/466178/ and https://freesound.org/people/XHALE303/sounds/465750/); also their TR-909 drum loops (CC0 subset)
- voxbox_502_ — acid synth melody 140 BPM, CC0: https://freesound.org/people/voxbox_502_/sounds/850199/
- Jovica — acid bass attack loop 140 BPM, CC0: https://freesound.org/people/Jovica/sounds/1971/
- D0tDashDialUp — six CC0 303 basslines: https://freesound.org/people/D0tDashDialUp/sounds/627756/

*Dub (~75 BPM):*
- nlux — Reggae keyboard skank chord toolkit 90 BPM, CC0: https://freesound.org/people/nlux/sounds/638940/
- hello_flowers — Real-Reggea Dub Loops 1 & 2, CC0: https://freesound.org/people/hello_flowers/sounds/31892/ and /31891/
- bigjoedrummer — reggae backbeat hat+kick, CC0: https://freesound.org/people/bigjoedrummer/sounds/77299/
- kejkz — ReDub 1-bar dub bass loop, CC0: https://freesound.org/people/kejkz/sounds/16445/

Gaps to fill by rendering (zero license risk, exact BPM by construction): hardtek offbeat bass stem and any missing dub bass — render 4-bar stems in LMMS (Open303 for acid-style lines) or keep the existing in-game synth for just that stem by leaving its manifest entry pointing at a rendered export of the current synth stem (render via the OfflineAudioContext path once and save it).

- [ ] **Step 2: Cut every stem to the exact loop length and encode**

Per genre, each of the 4 stems (kick, sub, lead, hats) must be EXACTLY the same bar count at the target BPM (`source.loop = true` loops on buffer length). Loop lengths for 4 bars of 4/4: hardtek 170 BPM → 5.6471s, acid 140 BPM → 6.8571s, dub 75 BPM → 12.8000s.

Tempo-shift the off-BPM sources first (e.g. XHALE303 130 → 140), then trim sample-exact, normalize, encode:

```bash
# example: one acid stem, 130 → 140 BPM, 4 bars, ogg
ffmpeg -i src.wav -af "atempo=1.0769,loudnorm=I=-14:TP=-1.5" -t 6.8571 \
  -c:a libvorbis -q:a 5 public/audio/acid-lead.ogg
```

Audition each loop twice through (`ffplay -loop 2 public/audio/acid-lead.ogg`) — any click at the seam means the trim isn't on the bar boundary.

- [ ] **Step 3: Write the manifest**

`public/audio/manifest.json`:

```json
{
  "hardtek": { "bpm": 170, "bars": 4, "stems": { "kick": "hardtek-kick.ogg", "sub": "hardtek-sub.ogg", "lead": "hardtek-lead.ogg", "hats": "hardtek-hats.ogg" } },
  "acid":    { "bpm": 140, "bars": 4, "stems": { "kick": "acid-kick.ogg", "sub": "acid-sub.ogg", "lead": "acid-lead.ogg", "hats": "acid-hats.ogg" } },
  "dub":     { "bpm": 75,  "bars": 4, "stems": { "kick": "dub-kick.ogg", "sub": "dub-sub.ogg", "lead": "dub-lead.ogg", "hats": "dub-hats.ogg" } }
}
```

- [ ] **Step 4: Credits file**

`docs/audio-credits.md` — one line per source: author, sound URL, license (CC0/CC-BY), what it became. CC0 doesn't require it; do it anyway (covers any CC-BY additions and it's good etiquette). If any CC-BY source is used, also surface the credits in-game (a line on the leaderboard/about screen is enough).

### Task 6.3: In-game verification

- [ ] **Step 1: Audible A/B**

`npm run dev`, launch one night per genre (use Nouvelle partie + export/import code to keep a save handy). Each genre must: play its real loop, layer stems in as the set energy climbs (sub joins early, hats mid, lead late), distort audibly on Pousser, cut on brownouts, and keep dancers beat-synced (they hop on the kick — `beatPhase` drives this).

- [ ] **Step 2: Loop seam check**

Let a set run ≥ 2 loop lengths; listen for clicks/gaps at the seam. A click means the trim isn't sample-exact at the bar boundary — re-trim that stem.

- [ ] **Step 3: Commit any manifest tweaks**

```bash
git add public/audio/manifest.json docs/audio-credits.md
git commit -m "feat(audio): real stem packs for hardtek/acid/dub"
```

---

## Story 7 — Diagnose the unclickable launch button

During the review, real synthesized mouse clicks on `▶ Lancer la teuf` did nothing (3 attempts), while a programmatic `.click()` worked. If reproducible in a headed browser this is a release-blocking bug; if it is a headless-only artifact, close the story with a note.

### Task 7.1: Reproduce and fix

**Files:**
- Possibly modify: `src/style.css` / `src/ui/screens.ts`

- [ ] **Step 1: Reproduce with a real pointer**

```bash
agent-browser --headed open http://localhost:5173/
agent-browser snapshot -i        # find the launch button ref
agent-browser click @eNN         # the "Lancer la teuf" ref
```

If the night starts: re-test headless. If headless-only: document in the plan journal and stop here (no code change).

- [ ] **Step 2: If reproducible, find what eats the click**

```bash
cat <<'EOF' | agent-browser eval --stdin
(() => {
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Lancer la teuf'));
  const r = btn.getBoundingClientRect();
  const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return { rect: r, hit: el?.tagName + '.' + el?.className, isBtn: el === btn };
})()
EOF
```

`isBtn: false` names the overlay. The usual suspects in this codebase: the `.toasts` container or a full-width footer wrapper stacked above the button. Fix with `pointer-events: none;` on the decorative overlay (children that need clicks get `pointer-events: auto;`).

- [ ] **Step 3: Regression check + commit**

Real `agent-browser click` (no eval) must start the night. Then:

```bash
git add src/style.css src/ui/screens.ts
git commit -m "fix(ui): launch button no longer shadowed by overlay"
```

---

## Execution order & independence

| Story | Depends on | Why this order |
|---|---|---|
| 1 Sprites | — | Biggest visible payoff, zero gameplay risk |
| 2 Terrain | — | Quick visual win |
| 3 Progression | — | Introduces the night-sim test harness others reuse |
| 4 Live mixing | 3 (harness exists) | Core fun fix |
| 5 Events+journal | 3 (harness exists) | Builds on tested sim |
| 6 Music | — (parallel-safe) | Independent of sim changes |
| 7 Launch button | — | Investigation, may be a no-op |

Stories 1, 2, 6, 7 are mutually independent and can be done in any order or in parallel worktrees. After every story: `npm run test && npm run build` must be green.

## Noted but deliberately out of scope (candidates for a follow-up plan)

- **Crowd behaviors** — clusters around the campfire, denser pit in front of the stacks instead of uniform scatter (`src/render/ravers.ts` `danceSpot()`).
- **Grass speck contrast** — the dark tufts baked into the grass tiles read as dead pixels at night brightness; would need tile post-processing in `tools/build-assets.mjs`.
- **Player-imported music** ("branche ta clé USB") — file input + `decodeAudioData` routed through the same master chain; natural follow-up once Story 6 lands.
- **Event outcome rendering in-scene** — showing the speaker blow / the patrol car visually instead of only via toast.
