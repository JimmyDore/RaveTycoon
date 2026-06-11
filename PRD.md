# PRD — Rave Tycoon (working title)

**Status**: Draft v1 — 2026-06-11
**Owner**: Jimmy
**Type**: Personal side project, build-in-public potential

---

## 1. Vision

A hybrid active/idle tycoon game about running a **free-party sound system**. You work the mixing desk during illegal raves: push the volume and the bass to grow the crowd, but every dB feeds the heat — cops, blown speakers, seized gear. Survive until sunrise, collect the *prix libre*, reinvest in bigger matos, and climb from a muddy field to the legendary teknival.

The game's identity rests on two pillars:

1. **The outlaw free-party fantasy** — French rave scene, fully assumed: spots squattés, prix libre, les bleus, sunrise sur le dancefloor.
2. **Sound you can feel** — the desk genuinely mixes the music (adaptive audio stems); the crowd dances to the actual beat; clipping audibly distorts. This is the rare tycoon game where the core mechanic *is* a mixing desk, and you hear every decision.

## 2. Goals & non-goals

### Goals
- A real, finishable game (~beatable arc ending at the legendary teknival) that players come back to between sessions.
- Playable instantly in any browser, **including phones**, shareable by URL.
- Friends can compete via a lightweight leaderboard.
- Fun to build and to show off publicly (audio-reactive pixel-art crowds demo extremely well).

### Non-goals (v1)
- No accounts, no auth, no server-side saves, no anti-cheat.
- No monetization.
- No prestige/reset loop (designed-for, not built — see §11).
- No native mobile app.

## 3. Game structure

Hybrid **active / idle** loop:

- **Active — the rave**: a timed session at the mixing desk. This is the core gameplay and where all tension lives.
- **Idle — between raves**: real-world time passing matters lightly (repairs, buzz), creating a "come back tomorrow" hook without ever making the active part optional.

```
[Prepare]  choose spot × genre, buy/repair gear
    ↓
[Rave]     work the desk → grow the crowd → survive until sunrise
    ↓
[Payout]   bar drip + donations multiplier (or bust consequences)
    ↓
[Idle]     repairs tick, buzz grows then decays
    ↺
```

## 4. The active loop — a rave

### 4.1 The mixing desk

Three interacting controls, each mapped to a gear category and to a real audio parameter:

| Control | Effect on crowd | Risk | Gear that raises headroom | Audio mapping |
|---|---|---|---|---|
| **Volume** | Attracts ravers, builds vibe | Heat builds faster; clipping past amp headroom | Amps | Master gain; distortion when clipping |
| **Bass** | Strongly attracts & retains ravers | Stresses the subs → damage risk | Subs | Sub/kick stem level & filter |
| **Power budget** | Caps how hard volume+bass can be pushed simultaneously | Overdraw → generator sputter (sound cuts) | Generator | Brief dropouts/brownouts |

Design intent: there is no "set it and forget it" position. The player rides the faders through the night — pushing during peak moments, easing off when heat spikes or a speaker overheats.

### 4.2 The night's arc

- A rave is a **timed run**: hold out until **sunrise**.
- Duration scales with spot tier: **~3 minutes** for the first field, up to **~10 minutes** for the endgame teknival.
- Crowd arrives over time at a rate driven by: spot profile, genre profile, buzz, reputation, and current sound quality (volume/bass levels). Ravers leave if the sound dips too long or the vibe collapses.

### 4.3 Heat & busts

- A **heat meter** fills as a function of sustained volume and spot sensitivity; it can ebb when you ease off.
- If heat maxes out, the cops shut the rave down early — a **bust**.
- **Escalating consequences** with the heat level / repeat offenses at bust time:
  1. Lose a cut of the night's earnings.
  2. Fines (flat cash penalties).
  3. **Gear seizure** — equipment confiscated.
- **No softlock guarantee**: the player always keeps an unseizable starter rig ("les vieilles enceintes du camion"). Rock bottom = grinding small field raves again, never a dead save.

### 4.4 Gear damage

- Pushing volume/bass past the gear's headroom risks **blowing a speaker/amp**: that output channel is muted or degraded for the rest of the night.
- Damaged gear must be repaired between raves (time or money — see §6).

### 4.5 Payout

- **Bar drip**: each raver generates a small income per minute present (rewards *sustaining* a crowd, not just attracting it).
- **Donations (prix libre)** at sunrise: a multiplier on the night based on peak crowd and overall vibe quality.
- **Reputation** is earned from successful nights (peak crowd, legendary moments, surviving high heat) and unlocks spots.

## 5. Pre-rave decisions — spot × genre

The strategic layer: before each rave, the player picks a **spot** and a **genre**. The combination space is the replayability engine.

### 5.1 Spots — risk/reward personalities, unlocked by reputation

Spots are *not* a pure size ladder; each has a personality. Indicative v1 lineup (5–6 spots):

| Spot | Crowd arrival | Heat build | Quirk |
|---|---|---|---|
| Champ paumé | Slow | Very slow | Tutorial-grade, tiny cap |
| Forêt | Slow | Slow | No neighbors; long calm nights |
| Carrière abandonnée | Medium | Medium | Poor power access — generator is the bottleneck |
| Hangar urbain | Fast | Vicious | Big cap, big money, cops on a hair trigger |
| Friche industrielle | Fast | High | Late-game high-stakes |
| **Teknival** (finale) | Massive | Special | The endgame event — see §8 |

- Spots unlock with **reputation** (word spreads in the scene; you get invited), not money. Money buys gear; rep opens doors.

### 5.2 Genres — as mechanics, from day one

Launch with **2–3 genres**, each with its own **audio stem set** and **crowd profile**:

| Genre | Crowd profile (indicative) |
|---|---|
| Hardtek / tribe | Baseline: fast arrival, energetic, moderate heat |
| Acid | Surges fast, volatile vibe, draws heat faster |
| Dub | Slow arrival but chill crowd that stays long; low heat |

- Genre choice interacts with spot choice (e.g., dub in the quarry = long safe grind; acid in the hangar = high-roll night).
- More genres are the primary post-launch content lever.

## 6. The idle layer — between raves

Light idle, **no passive income**:

- **Repairs**: blown gear repairs on real-time timers; rushable for money. Consequences have weight without hard-blocking play.
- **Buzz**: grows after a good rave (word of mouth), **decays** if you stay quiet too long (the scene forgets you). Buzz boosts crowd arrival rate at the next rave. This is the retention hook: checking in regularly rewards you with a better next rave, not free money.

## 7. Progression

Two currencies, two ladders:

- **Money → gear**: amps, subs, generator, plus durability upgrades. Gear raises desk headroom (you can push harder safely) and is *visible on screen* (bigger speaker stacks).
- **Reputation → spots**: bigger, riskier, richer venues.

Rave duration scaling with spot tier makes progression *felt*: bigger spots are literally bigger nights.

## 8. Endgame

- v1 has a **win moment**: hosting the **legendary teknival** — a finale-scale rave that serves as the game's climax and credits moment.
- The economy and crowd systems must be architected so a **prestige loop** can bolt on in v2 ("the crew moves to a new region": reset money/gear/spots, keep permanent perks).

## 9. Presentation

### 9.1 Visuals — detailed sprite simulation (Game Dev Tycoon energy)

- **Individual animated ravers** with behaviors: arrive in waves, dance harder as vibe rises, drift away when the sound dips, scatter when cops arrive.
- **Pixel-art environments** per spot.
- **Beat sync is mandatory**: dance animations sync to the actual audio kick. This sells the rave more than art fidelity.
- **Asset strategy**: pixel asset packs for crowds and tilesets (sourced during development); custom effort reserved for **hero assets** that define identity — the speaker stacks (visible progression), the sunrise moment, key spot backdrops.

### 9.2 Audio — the killer feature

- **Adaptive stem-based mixing** via Web Audio API: each genre's track is built from stems (kick, bass, synth, hats…); the desk controls genuinely mix them.
  - Volume fader = master gain.
  - Bass slider = sub stem level / filter.
  - **Clipping audibly distorts** — the danger zone is heard, not just seen.
  - Power overdraw = brownouts/dropouts.
- SFX layer: crowd noise scaling with crowd size, speaker crackle, police sirens, dawn ambience.
- One stem set per genre at launch (2–3 total). Stems sourced from CC-licensed material or generated loops.

## 10. Platform, UX & social

- **Browser game**, **responsive from day one** — friends must be able to play on their phones. Touch-clean interaction model everywhere: big sliders, no hover-dependent or keyboard-required controls.
- **Language: French only at first.** Free-party slang fully assumed (prix libre, teknival, les bleus…). i18n-ready structure if reach demands English later.
- **Saves**: localStorage autosave + manual **export/import save code** (cross-browser/device portability). No server saves.
- **Hosting**: dockerized on the existing VPS — static frontend (nginx) + one tiny service.
- **Leaderboard**: minimal API (single service + SQLite). At sunrise the game submits the night under a freely-chosen **pseudonym** — no accounts, no auth. Leaderboard screens: biggest crowd, biggest payout, most legendary bust. Cheating is possible and accepted (friends-scale).
- **Sunrise recap card**: a generated shareable image (peak crowd, cash, genre, spot, "PERQUISITIONNÉ" stamp if busted) — canvas-to-image, no backend needed. Doubles as the build-in-public screenshot machine.

## 11. Out of scope v1 / future hooks

| Future feature | v1 design accommodation |
|---|---|
| Prestige loop ("new region") | Economy designed reset-with-perks in mind |
| More genres | Crowd sim built on data-driven genre profiles |
| Incident events mid-rave (overheating triage, neighbor at the gate) | Desk loop must stay fun without them |
| Passive income (rig rental, mixtapes) | Only if the game needs more idle depth post-launch |
| English localization | Strings externalized from day one |
| Server-side saves / accounts | Not planned |

## 12. Risks

- **Stem sourcing**: 2–3 genres × full stem sets of decent quality is the scarcest asset. Mitigation: start with one genre's stems to validate the audio pipeline, add the others before launch.
- **Sprite content cost**: detailed crowd simulation is asset-hungry. Mitigation: asset packs + behavior code (cheap) carry the load; hero assets only where identity demands.
- **Mobile performance**: many animated sprites + Web Audio on low-end phones. Mitigation: crowd rendering must degrade gracefully (sprite count caps by device).
- **Desk depth**: three sliders must stay interesting for a full ~10-minute teknival. Mitigation: playtest early; incident events are the ready v1.5 lever if nights feel flat.

## 13. Success criteria

- A new player reaches their first sunrise payout within ~5 minutes of opening the URL, on a phone.
- Friends return unprompted to beat each other's leaderboard nights.
- At least one person shares a recap card without being asked.
- The developer still thinks it's fun to work on. (Side project rule #1.)

---

## Appendix — Key decisions log

| # | Decision |
|---|---|
| 1 | Hybrid active/idle (not pure idle, not pure management) |
| 2 | Mixing desk with 3 controls: volume, bass, power |
| 3 | Timed runs to sunrise + heat meter + separate gear damage |
| 4 | Illegal free-party fiction; income = bar drip + prix libre at sunrise |
| 5 | Busts have escalating consequences up to gear seizure; unseizable starter rig prevents softlock |
| 6 | Spots = risk/reward personalities, unlocked by reputation |
| 7 | Light idle: repair timers + buzz (grows/decays), no passive income |
| 8 | Adaptive stem-based audio; clipping audibly distorts |
| 9 | Rave duration scales with spot tier (~3 → ~10 min) |
| 10 | Detailed pixel-art sprite simulation; asset packs + hero assets; beat-synced animation |
| 11 | v1 win moment = legendary teknival; prestige is v2 |
| 12 | Responsive browser game from day one; localStorage + export codes |
| 13 | Genres as mechanics from v1 (2–3 stem sets with crowd profiles) |
| 14 | French-only UI at launch; recap card share image |
| 15 | VPS-hosted, dockerized: static frontend + tiny pseudonym leaderboard API (SQLite) |
