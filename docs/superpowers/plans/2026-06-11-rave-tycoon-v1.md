# Rave Tycoon v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full v1 of Rave Tycoon per PRD.md: a French-language, mobile-responsive browser tycoon game where you run a free-party sound system (active rave loop with a real Web Audio mixing desk, idle layer, progression to a teknival finale), plus a tiny dockerized leaderboard API.

**Architecture:** Strict separation between a deterministic, fully-tested pure simulation core (`src/core/`) and the impure shells around it: Web Audio engine with procedurally synthesized stems (`src/audio/`), canvas pixel-art renderer with beat-synced ravers (`src/render/`), DOM-based French UI (`src/ui/`), and a state-machine app shell (`src/main.ts`). The leaderboard is a separate tiny Node service (`server/`) with SQLite, packaged with nginx via docker-compose.

**Tech Stack:** Vite + TypeScript (vanilla, no framework), Vitest for tests, Canvas 2D, Web Audio API (OfflineAudioContext for stem synthesis — no external audio assets), Node + better-sqlite3 for the leaderboard, Docker + nginx for deployment.

---

## File structure

```
index.html                  app entry, viewport meta, root containers
src/main.ts                 app shell: screen state machine, game loop (rAF), wiring
src/core/types.ts           all shared types (GameState, RaveState, Controls, defs)
src/core/data.ts            data-driven defs: SPOTS, GENRES, GEAR (amps/subs/gens tiers)
src/core/rave.ts            tickRave(): crowd, vibe, heat, power, gear stress, bar drip
src/core/payout.ts          settleNight(): payout, donations, rep; applyBust() consequences
src/core/idle.ts            applyIdleTime(): buzz decay, repair timers; startRepair/rushRepair
src/core/save.ts            serialize/load, localStorage, export/import save codes
src/core/rng.ts             seedable mulberry32 PRNG (deterministic tests)
src/audio/synth.ts          pure pattern generators + OfflineAudioContext stem rendering
src/audio/engine.ts         stem playback graph, master/clip/sub controls, brownout, SFX
src/render/scene.ts         canvas renderer: backdrop per spot, sky/sunrise, speaker stack
src/render/ravers.ts        raver sprite sim: spawn/leave/dance/scatter, beat sync, perf caps
src/ui/strings.ts           all French UI strings (externalized for future i18n)
src/ui/screens.ts           DOM screens: prepare (spot×genre×shop), rave HUD, recap, leaderboard
src/ui/recap-card.ts        shareable sunrise recap card (canvas → PNG)
src/ui/api.ts               leaderboard client (graceful offline)
src/style.css               responsive layout, big touch sliders, pixel aesthetic
test/*.test.ts              Vitest suites mirroring src/core modules + server
server/index.mjs            Express + better-sqlite3 leaderboard API
server/db.mjs               schema + queries
server/package.json
deploy/Dockerfile.web       nginx static frontend
deploy/Dockerfile.api       node leaderboard
deploy/nginx.conf
docker-compose.yml
README.md
```

## Core simulation model (locked-in formulas)

Controls each tick: `volume v∈[0,1]`, `bass b∈[0,1]`, `power p∈[0,1]` (generator budget).

- **Power**: `supply = genCapacity·p`, `demand = 0.6v + 0.8b` (in kW-ish units, gear tiers raise capacity/headroom). `demand > supply` → brownout event (sound cut ~1.5s, vibe hit, ravers leave). Sustained `p > 0.85` accrues generator stress → sputter risk.
- **Headroom/clipping**: `v > ampHeadroom` → clipping (audible distortion, amp stress accrues). `b > subHeadroom` → sub stress accrues. Stress ≥ 1 → gear **blown**: channel degraded for the night, needs repair after.
- **Crowd**: `arrival = spot.arrival · genre.arrival · (1+buzz) · (1+rep·0.002) · appeal(v,b)` with `appeal = clamp(0.2 + 0.9v + 0.7b, 0, 1.6)`; capped at spot.cap. `leaving = crowd · (genre.churn · (1 − 0.5b)) + eventPenalties`. Brownouts/blown gear multiply leaving.
- **Vibe** ∈ [0,1]: rises when v,b in sweet zone without incidents, drops on dropouts/clipping/quiet.
- **Heat**: `heatRate = spot.heatBuild · genre.heatMult · (0.7v² + 0.3b)`; decays at `−0.012/s` when `v < 0.35`. Heat ≥ 1 → **bust** (night ends early).
- **Bar drip**: `cash += crowd · 0.05 €/raver/s · spot.priceMult`, banked during the night.
- **Sunrise settle**: `donationMult = 1 + 0.8·avgVibe + 0.6·(peakCrowd/spot.cap)`; `total = bank · donationMult`. `rep += peak/10 + survivedHighHeat bonus`.
- **Bust consequences** (escalate with `busts` count): #1 lose 50% of bank; #2 lose bank + fine (200·spotTier); #3+ fine + **seizure** of the best seizable gear item. Tier-0 starter gear (`seizable: false`, "les vieilles enceintes du camion") can never be seized → no softlock.
- **Idle**: buzz half-life 24h (`buzz · 0.5^(hours/24)`); buzz += `0.1 + 0.5·nightQuality` after a good night, capped at 1.5. Repairs: real-time timer `30min · tier`, rushable for `80·tier` cash.
- **Durations**: spot tier → rave length: 180s, 240s, 300s, 420s, 540s, 600s (teknival).

## Spots & genres (data)

| id | nom | cap | arrival/s | heatBuild | repReq | tier | quirk |
|---|---|---|---|---|---|---|---|
| champ | Champ paumé | 60 | 0.5 | 0.004 | 0 | 1 | tutorial |
| foret | Forêt | 120 | 0.55 | 0.006 | 25 | 2 | calm, long |
| carriere | Carrière abandonnée | 220 | 0.9 | 0.011 | 70 | 3 | genCapacity ×0.6 |
| hangar | Hangar urbain | 400 | 1.6 | 0.022 | 150 | 4 | priceMult ×1.5, heat vicious |
| friche | Friche industrielle | 650 | 2.0 | 0.017 | 280 | 5 | high stakes |
| teknival | Teknival | 2000 | 5.0 | 0.013 | 500 | 6 | finale, win moment |

| id | nom | bpm | arrival | churn/s | heatMult |
|---|---|---|---|---|---|
| hardtek | Hardtek | 170 | 1.0 | 0.010 | 1.0 |
| acid | Acid | 140 | 1.35 | 0.016 | 1.3 |
| dub | Dub | 75 | 0.6 | 0.004 | 0.6 |

Gear (3 categories × 4 tiers, tier 0 free/unseizable): amps raise `ampHeadroom` (0.55/0.7/0.85/1.0), subs raise `subHeadroom` (0.5/0.65/0.85/1.0), generators raise `genCapacity` (0.8/1.0/1.25/1.6). Prices ~ 300/900/2500 per upgrade, visible as bigger speaker stacks.

---

### Task 1: Scaffold project

**Files:** Create `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.ts` (hello stub), `src/style.css`, `.gitignore`.

- [x] Step 1: `npm create vite@latest . -- --template vanilla-ts` equivalent by hand (avoid interactive); add `vitest` dev dep. Scripts: `dev`, `build`, `test: vitest run`, `preview`.
- [x] Step 2: `npm install` then `npm run build` — expect a `dist/` with no TS errors.
- [x] Step 3: Commit `chore: scaffold vite+ts+vitest project`.

### Task 2: Core types, RNG, and data

**Files:** Create `src/core/types.ts`, `src/core/rng.ts`, `src/core/data.ts`. Test: `test/data.test.ts`.

- [x] Step 1: Write failing tests: SPOTS has 6 entries sorted by repReq ascending with teknival last; GENRES has 3 with distinct bpm; every gear category has a tier-0 item with `seizable: false` and price 0; raveDuration(champ)=180, raveDuration(teknival)=600; mulberry32 with same seed yields same sequence.
- [x] Step 2: Run `npx vitest run` — expect FAIL (modules missing).
- [x] Step 3: Implement types (GameState, Controls, RaveState, SpotDef, GenreDef, GearItem, NightResult), data tables above, mulberry32.
- [x] Step 4: `npx vitest run` — PASS. Commit `feat(core): types, seeded rng, spots/genres/gear data`.

### Task 3: Rave tick — crowd, vibe, heat, power, damage, drip

**Files:** Create `src/core/rave.ts`. Test: `test/rave.test.ts`.

`createRave(state, spotId, genreId, seed) → RaveState` and `tickRave(rave, controls, dt) → events[]` (mutates rave; returns events like `{type:'brownout'|'blown'|'bust'|'sunrise'}`).

- [x] Step 1: Failing tests (use seed for determinism):
  - crowd grows with high volume+bass and stays 0-ish with faders down;
  - crowd never exceeds spot cap;
  - heat reaches 1 and emits `bust` when riding max volume in hangar; heat decays when volume < 0.35;
  - demand > supply emits `brownout` and crowd drops faster during it;
  - v > ampHeadroom long enough → amp stress ≥1 → `blown` event, effective volume output degraded after;
  - bank increases proportionally to crowd (bar drip);
  - reaching duration emits `sunrise`;
  - carriere quirk: generator capacity reduced ×0.6.
- [x] Step 2: Run — FAIL. Step 3: Implement per locked formulas. Step 4: PASS. Commit `feat(core): rave tick simulation`.

### Task 4: Settle & busts

**Files:** Create `src/core/payout.ts`. Test: `test/payout.test.ts`.

`settleNight(state, rave) → NightResult` (sunrise path), `applyBust(state, rave) → NightResult` (escalating consequences).

- [x] Step 1: Failing tests: donation multiplier math; rep gain > 0 on success; bust #1 halves bank; bust #2 adds fine; bust #3 seizes best seizable gear but never tier-0; cash floor at 0 (no negative); spot unlock by rep not money.
- [x] Steps 2-4: FAIL → implement → PASS. Commit `feat(core): sunrise settle and escalating bust consequences`.

### Task 5: Idle layer

**Files:** Create `src/core/idle.ts`. Test: `test/idle.test.ts`.

`applyIdleTime(state, nowMs)` — buzz decay + repair completion; `startRepair`, `rushRepair`, `buzzAfterNight`.

- [x] Step 1: Failing tests: buzz halves over 24h; buzz capped at 1.5; repair completes after `30min·tier`; rush costs `80·tier` and completes instantly; no passive income (cash unchanged by idle).
- [x] Steps 2-4: FAIL → implement → PASS. Commit `feat(core): idle buzz decay and repair timers`.

### Task 6: Saves

**Files:** Create `src/core/save.ts`. Test: `test/save.test.ts`.

- [x] Step 1: Failing tests: serialize→load roundtrip preserves state; export code is URL-safe base64 with checksum; tampered code rejected; loading a save with unknown version falls back to fresh state; `newGame()` grants tier-0 gear + champ unlocked.
- [x] Steps 2-4: FAIL → implement → PASS (localStorage behind injectable storage interface for tests). Commit `feat(core): save system with export/import codes`.

### Task 7: Audio — procedural stems & engine

**Files:** Create `src/audio/synth.ts`, `src/audio/engine.ts`. Test: `test/synth.test.ts` (pure pattern parts only).

- Per-genre stem set rendered with OfflineAudioContext into AudioBuffers: kick (sine pitch-drop), sub bass line (filtered saw/sine), lead/synth (acid: resonant saw sweeps; hardtek: stabs; dub: skank chords + echo), hats (filtered noise). 2-bar loops at genre bpm.
- Engine graph: stem sources → per-stem gains → master gain → waveshaper (drive ∝ clipping amount) → compressor → destination. Bass slider = sub stem gain + lowshelf. Brownout = scheduled master gain dip + crackle. SFX: crowd noise loop scaled with crowd size, siren on bust, blown-speaker crackle.
- `engine.update({volume, bass, clipping, brownout, crowd})` called from game loop; `engine.start(genreId)` lazily builds AudioContext on first user gesture.
- [x] Step 1: Failing tests for pure parts: pattern generators return correct step counts for bpm/bars; clip drive curve monotonic.
- [x] Steps 2-4: implement; verify in browser manually later (Task 11). Commit `feat(audio): procedural stem synthesis and adaptive mixing engine`.

### Task 8: Renderer — scene & beat-synced ravers

**Files:** Create `src/render/scene.ts`, `src/render/ravers.ts`.

- Pixel look: low-res offscreen canvas (e.g. 320×180) scaled up with `image-rendering: pixelated`. Per-spot procedural backdrop (sky gradient → sunrise lerp over night progress, silhouettes per spot, teknival = massive field). Speaker stack size = gear tiers.
- Ravers: individual sprites (target = crowd count, spawn/leave animations, scatter on bust), 2-frame dance bounce synced to beat phase from `engine.beatPhase()`, intensity ∝ vibe. Sprite cap by device (`navigator.hardwareConcurrency`/mobile → cap 150, desktop 400; above cap render density dots).
- [x] Implement (rendering is verified visually; no unit tests). Commit `feat(render): pixel scene with beat-synced raver simulation`.

### Task 9: UI screens & French strings

**Files:** Create `src/ui/strings.ts`, `src/ui/screens.ts`, `src/style.css` (real styles).

- Screens: **Préparation** (choose spot×genre, shop with gear cards, repairs status, buzz indicator, "Lancer la teuf"), **Rave HUD** (3 big vertical touch sliders VOLUME/BASSES/GROUPE ÉLECTROGÈNE, heat meter "les bleus", crowd count, cash drip, clock to sunrise, event toasts), **Recap** (payout breakdown, rep gained, bust stamp "PERQUISITIONNÉ", share card button, leaderboard submit with pseudo), **Leaderboard** (3 boards).
- All strings in `strings.ts` (French, free-party slang per PRD).
- Responsive: portrait phone = sliders bottom, scene top; desktop = side-by-side. No hover-dependent controls.
- [x] Implement. Commit `feat(ui): french screens, touch desk, responsive layout`.

### Task 10: App shell — wire everything

**Files:** Create/replace `src/main.ts`.

- State machine: `prepare → rave → recap → prepare`; rAF loop ticking sim at fixed 100ms steps, render every frame; autosave on settle + visibilitychange; `applyIdleTime` on boot.
- [x] Wire core+audio+render+ui; `npm run build` clean; manual smoke via `npm run preview` + agent-browser screenshot. Commit `feat: playable game loop end to end`.

### Task 11: Recap share card

**Files:** Create `src/ui/recap-card.ts`.

- [x] 800×418 canvas card: pixel sunrise bg, peak crowd, cash, spot, genre, date, pseudo, "PERQUISITIONNÉ" red stamp if busted; export PNG via `toBlob` → download / Web Share API when available. Commit `feat(ui): shareable sunrise recap card`.

### Task 12: Leaderboard — server + client

**Files:** Create `server/index.mjs`, `server/db.mjs`, `server/package.json`, `server/test/api.test.mjs`, `src/ui/api.ts`.

- API: `POST /api/scores {pseudo, crowd, payout, busted, heatAtEnd, spot, genre}` (validated, pseudo ≤ 24 chars), `GET /api/leaderboard?board=crowd|payout|bust&limit=20`. SQLite via better-sqlite3. CORS open. "Most legendary bust" board = busted nights ranked by crowd at bust.
- Client: fire-and-forget submit at recap; fetch boards; fully graceful when API absent (offline mode badge).
- [x] Step 1: Failing server tests (node --test + supertest-style fetch against ephemeral server, in-memory sqlite).
- [x] Steps 2-4: FAIL → implement → PASS. Commit `feat(leaderboard): sqlite api and client`.

### Task 13: Docker packaging

**Files:** Create `deploy/Dockerfile.web`, `deploy/Dockerfile.api`, `deploy/nginx.conf`, `docker-compose.yml`, `.dockerignore`.

- nginx serves `dist/` and proxies `/api` → api service; api persists sqlite to a volume.
- [x] Write configs; validate `docker compose config` parses (full build only if docker available). Commit `chore(deploy): dockerized frontend + leaderboard`.

### Task 14: Final pass — README, full test run, manual playthrough

- [x] `npx vitest run` all green; `npm run build` clean; agent-browser playthrough: reach a sunrise payout on champ paumé, verify audio controls audibly change mix, bust path on hangar, save survives reload.
- [x] README.md (French): pitch, dev setup, deploy. Commit `docs: readme` and final commit.

## Self-review notes

- PRD §4 desk/heat/damage/payout → Tasks 3-4. §5 spots×genres → Task 2 data + Task 9 UI. §6 idle → Task 5. §7 progression → Tasks 2/4/9 (gear shop, rep unlocks, visible stacks). §8 endgame → teknival in data + win screen in Task 9/10. §9 presentation → Tasks 7-8. §10 platform → Tasks 6 (saves), 9 (responsive FR), 11 (recap card), 12 (leaderboard), 13 (VPS docker). §11 future hooks → data-driven genres, strings externalized, economy fields kept serializable for prestige.
- Out of scope honored: no auth, no passive income, no prestige.
