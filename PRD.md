# PRD — Rave Tycoon (working title)

**Status**: Draft v2 — 2026-06-11
**Owner**: Jimmy
**Type**: Personal side project, build-in-public potential

> **v2 pivot**: v1 made the player a DJ riding faders in real time. Playtesting showed
> the continuous-input desk was the weak point. v2 reframes the game as **management in
> the Game Dev Tycoon mold**: the player runs the collective, every input is a discrete
> decision, and the rave itself is the animated spectacle that pays those decisions off.
> The v1 simulation skeleton (heat/busts, economy, idle, saves, leaderboard, adaptive
> audio engine) survives; the desk UI and player-driven mixing do not.

---

## 1. Vision

A management tycoon game about running a **free-party sound system collective**. You are
the crew boss, not the performer: you recruit DJs from the scene, build the lineup, buy
the matos, pick the spot, and set how hard the crew pushes the sound. Then the night
unfolds before you — the crowd grows, the bass drops, the heat builds — and you make the
calls that matter: who plays peak time, what to do when the cops are sighted, when to
ease off. Survive until sunrise, split the *prix libre*, and climb from a muddy field to
the legendary teknival.

The game's identity rests on three pillars:

1. **The outlaw free-party fantasy** — French rave scene, fully assumed: spots squattés,
   prix libre, les bleus, la famille du son.
2. **Decisions, then spectacle** (Game Dev Tycoon energy) — you never babysit a fader.
   You make a few meaningful choices per night and *watch the party answer*: ravers
   arrive in waves, dance harder, vibe rises off the crowd. Anticipation over dexterity.
3. **Sound you can feel** — adaptive audio stems driven by the simulation: you *hear*
   your booking and your intensity dial. *RINSE* audibly clips; a cheap
   generator audibly sputters; the crowd dances on the actual kick.

## 2. Goals & non-goals

### Goals
- A real, finishable game (~beatable arc ending at the legendary teknival) that players
  come back to between sessions.
- Playable instantly in any browser, **including phones**, shareable by URL.
- Friends can compete via a lightweight leaderboard.
- Fun to build and to show off publicly (audio-reactive pixel-art crowds demo extremely well).

### Non-goals (v1 of this redesign)
- No accounts, no auth, no server-side saves, no anti-cheat.
- No monetization.
- No prestige/reset loop (designed-for, not built — see §12).
- No native mobile app.
- No real-time performance minigames — every player input is a discrete choice.

## 3. Game structure

Hybrid **active / idle** loop:

- **Active — the rave**: a timed night divided into DJ sets, punctuated by decisions
  and events. This is the core gameplay.
- **Idle — between raves**: real-world time passing matters lightly (repairs, buzz decay,
  DJ fatigue recovery), creating a "come back tomorrow" hook without making the active
  part optional.

```
[Prepare]  choose spot × genre × lineup, buy gear, set the intensity
    ↓
[Rave]     sets play out → choose next DJ, ride the intensity,
           respond to event popups → survive until sunrise
    ↓
[Payout]   bar drip + prix libre multiplier − DJ cuts (or bust consequences)
    ↓
[Idle]     repairs tick, buzz decays, DJs recover fatigue
    ↺
```

## 4. The active loop — a night

### 4.1 Sets, not faders

A rave is a **timed run** to sunrise, divided into **DJ sets**:

- Set count scales with the spot tier: 2 sets on the first field (~3 min night) up to
  6 sets at the teknival (~10 min night). Each set ≈ 90 seconds of real time.
- At each **set transition** the player makes one decision: **who plays next** — chosen
  from the crew present that night (fatigue, genre and risk profile make this a real choice).
- During the set the player drives the **intensity dial**: four tappable crans —
  *CHILL · GROOVE · PEAK · RINSE* — changeable at any moment, no cooldown. The crowd has
  a visible **attente** curve; playing inside the tolerance band (DJ technique widens it,
  charisme bends the attente toward what you play) builds the wave; camping PEAK/RINSE
  burns the crowd out. Discrete taps every ~10–20 s — never a fader, never a reflex.

**Set quality** is computed from: DJ stats × platines tier × fatigue, multiplied **live**
by the intensity cran. Quality drives crowd arrival, retention and vibe — the same
crowd/vibe/heat simulation as v1, now fed by decisions instead of fader positions.

### 4.2 Events — the surprises

2–4 times per night, the simulation interrupts with a **decision popup** (the night
pauses): a situation, 2–3 options, immediate consequences. Examples of the v1 event deck:

| Event | Options (indicative) |
|---|---|
| Les bleus sont passés sur la départementale | Baisser le son (heat −, vibe −) / On continue (heat ↑) |
| Le groupe électrogène toussote | Le bricoler (set interrupted 15 s) / Ignorer (brownout risk ↑) |
| Une enceinte chauffe | La ménager (sound −20 % this set) / La pousser (risk blown speaker) |
| Le public en redemande | Lâcher les watts (montée ↑, vibe ↑) / Tenir le plan |
| Un voisin débarque au portail | L'embrouiller (rng social) / Lui offrir une bière (cash −, heat −) |

Events are drawn from a deck weighted by spot, heat level, gear tier and DJ risk
profiles. The deck is data-driven — new events are the cheapest post-launch content lever.

### 4.3 Special nights & consequence arcs

Variety comes from **outside the simulation** (night-loop overhaul, stories D/E):

- **Special night offers** — from rep ≥ 12, ~1 night in 3 the prepare screen shows a
  one-night offer (accept or leave): *soundclash* (beat a simulated rival's wave score
  on 2 of 4 night phases → rep ×1.5 and their headliner **Volt** joins the recruitment
  pool at −30 % cut), *teuf privée* (cash up front = 3× the spot's capacity, crowd
  capped at 60 %, zero rep, contract: imposed genre, never RINSE, no police raid —
  breach refunds 60 %), *anniversaire de la scène* (rep ×2, demanding crowd) and
  *nuit à thème* (single drawn genre, narrow tolerance, drops +40 %, bar ×1.3).
  Accepted constraints lock the prepare screen; a contract badge lives in the night HUD.
- **Consequence arcs** — event/prompt choices can plant a multi-night arc
  (`pendingArcs`, due in 1–3 nights, injected as a priority modal event): the corrupt
  cop (planted by a successful raid negotiation — pay again, then a 800 € « forfait »
  that clears the casier, or denounce him), the journalist (planted by the « un type
  filme » floor prompt — buzz ×1.6 but hotter starts for 3 nights), and the farmer
  (planted by buying the neighbor a beer — ends in a permanent −20 % heat on Champ
  paumé and Forêt **and unlocks the Château squatté**, which requires the finished arc
  on top of its 350 rep). Finished arcs are worth +1 ⭐ Légende each at tour departure.

### 4.4 Heat & busts *(unchanged from v1)*

- A **heat meter** fills as a function of the intensity dial, DJ risk profiles and
  spot sensitivity; it ebbs when the crew plays safe.
- Heat maxed = **bust**: cops shut the night down early.
- **Escalating consequences** with repeat offenses: lose a cut of the night's earnings →
  fines → **gear seizure**.
- **No softlock guarantee**: the unseizable starter rig ("les vieilles enceintes du
  camion") and the founding DJ can never be lost. Rock bottom = grinding small field
  raves again, never a dead save.

### 4.5 Gear damage

- Pushed gear (RINSE, ignored events) can **blow a speaker or stall the generator**:
  degraded sound and vibe for the rest of the night, audible in the mix.
- Damaged gear must be repaired between raves (time or money — see §8).

### 4.6 Payout

- **Bar drip**: each raver generates a small income per minute present.
- **Prix libre** at sunrise: a multiplier on the night based on peak crowd and overall vibe.
- **DJ cuts**: each DJ who played takes a negotiated **percentage of the night's
  takings** (better DJs demand bigger cuts). No income = no cost — the crew shares the
  recette, nobody invoices. Preserves the no-softlock rule by construction.
- **Reputation** is earned from successful nights and unlocks spots *and DJs*.

## 5. The crew — DJs as the core management axis

The GDT "staff" system, reskinned for the scene. **Permanent crew, scene-gated.**

- **Start**: one founding DJ, "le pote du camion" — mediocre, free (symbolic cut), loyal,
  unseizable/unleavable.
- **Recruitment**: as reputation grows, word spreads and better DJs become available to
  join the collective (rep thresholds, not cash). Roster cap ~6 in v1.
- **Each DJ has**:
  - **Stats**: *technique* (set quality) and *charisme* (crowd draw & retention), leveling
    up through sets played.
  - **Genre affinities**: a hardtek wizard is mediocre on dub — lineup must match the
    night's genre, or cover multi-genre strategies.
  - **Risk profile**: some DJs draw heat (notorious, heavy-handed), some fly under the
    radar. Interacts with spot choice and intensity.
  - **Fatigue**: playing sets tires a DJ; recovery happens in **real time between raves**
    (idle hook). A tired DJ performs below their stats.
  - **Cut**: negotiated % of the night, scaling with skill tier.
- **Attachment over optimization**: DJs are named characters with portraits; the player
  should feel "my crew", not "interchangeable units".

## 6. Pre-rave decisions — spot × genre × lineup

The strategic layer, now three-dimensional. Spot and genre tables are **unchanged from
v1** (6 spots from Champ paumé to Teknival, rep-gated, each with personality quirks;
3 genres — Hardtek / Acid / Dub — with distinct crowd profiles and stem sets). The new
third axis: **which DJs come tonight** (fatigue management, affinity matching, risk
stacking).

## 7. Gear — five categories serving the management sim

Money → gear, rep → spots & DJs. Each category produces a **visible or audible**
difference during the night:

| Category | Effect | Felt as |
|---|---|---|
| **Platines / contrôleurs** | Multiplies every DJ's set quality | Better sets, happier DJs |
| **Mur de son** | Crowd cap + attraction radius | *The* visible progression: the wall of speakers grows on screen |
| **Groupe électrogène** | Reliability | Cheap one = sputter events & audible brownouts |
| **Lumières** | Vibe/spectacle bonus | Beams, strobes, lasers on screen at night |
| **Logistique** | Heat & bust mitigation (guetteurs, camion rapide) | Earlier cop warnings, smaller seizures |

3–4 tiers per category; tier 0 of mur de son and groupe is the unseizable starter rig.

## 8. The idle layer — between raves

Light idle, **no passive income**:

- **Repairs**: blown gear repairs on real-time timers; rushable for money.
- **Buzz**: grows after a good rave, **decays** if you stay quiet. Boosts crowd arrival
  at the next rave.
- **DJ fatigue** *(new)*: recovers in real time. Raving every five minutes burns the
  crew out; coming back tomorrow fields a fresh lineup. Third reason to check in.

## 9. Progression

- **Money → gear** (five categories, §7).
- **Reputation → spots and DJs** (bigger venues, better artists want in).
- Night length and set count scale with spot tier: progression is *felt* — bigger spots
  are literally bigger nights with deeper lineup decisions.

## 10. Endgame

- v1 win moment: hosting the **legendary teknival** with a full, leveled crew — the
  finale-scale night that serves as climax and credits moment.
- Economy and crew systems architected so a **prestige loop** can bolt on in v2
  ("the crew moves to a new region": reset money/gear/spots, keep permanent perks and
  possibly one veteran DJ).

## 11. Presentation

### 11.1 Visuals — asset packs, closer camera, characters

- **Sourced pixel-art asset packs** (itch.io, CC0 or cheap paid — licenses verified for a
  public web game, budget 10–30 €): character packs with walk/dance animations, tilesets,
  props. No more procedural rectangles.
- **Closer camera**: a stage-anchored scene rather than a wide landscape. Ravers are
  **24–32 px tall with real dance frames**; the current DJ is visible behind the decks;
  the mur de son dominates the frame and grows with gear tiers.
- **DJ portraits** for the management UI (recruitment, lineup, fatigue) — pack-based or
  generated, consistent style.
- **Beat sync stays mandatory**: dance animations sync to the actual audio kick.
- Custom effort reserved for **hero assets**: the speaker wall, the sunrise moment, key
  spot backdrops.
- **Mobile performance**: sprite count caps by device, density fallback beyond the cap.

### 11.2 Audio — the killer feature, now sim-driven

- **Adaptive stem mixing** via Web Audio API (engine already built): each genre's track
  is stems (kick, sub, lead, hats) synthesized procedurally — no audio assets.
- **The simulation is the DJ**: each set has an energy arc that layers stems in and out
  (sparse warm-up → full peak-time stack → melodic sunrise lift).
- You **hear your decisions**: *RINSE* audibly clips and distorts; a stressed
  generator brownouts; a blown speaker crackles; a high-charisme DJ gets the crowd
  noticeably louder.
- SFX layer: crowd noise scaling with crowd size, sirens on bust, dawn ambience.

## 12. Platform, UX & social *(unchanged from v1)*

- **Browser game, responsive from day one**, touch-clean: cards, buttons and popups —
  no hover, no keyboard, no continuous gestures.
- **French only at first**, free-party slang fully assumed; strings externalized for i18n.
- **Saves**: localStorage autosave + manual export/import save code.
- **Hosting**: dockerized on the existing VPS — static frontend (nginx) + leaderboard API
  (node:sqlite, zero dependencies). *Built and working.*
- **Leaderboard**: pseudonym submissions, three boards (biggest crowd, biggest payout,
  most legendary bust). *Built and working.*
- **Sunrise recap card**: shareable canvas-generated image, "PERQUISITIONNÉ" stamp on
  busts — now also featuring the night's lineup.

## 13. Out of scope v1 / future hooks

| Future feature | v1 design accommodation |
|---|---|
| Prestige loop ("new region") | Economy + crew designed reset-with-perks in mind |
| More genres | Data-driven genre profiles & stem sets |
| More events | Data-driven event deck from day one |
| Guest-star headliners for big nights | Crew model leaves room for a `guest` DJ flag |
| DJ storylines / loyalty arcs | DJs are named entities with persistent state |
| English localization | Strings externalized from day one |
| Server-side saves / accounts | Not planned |

## 14. Risks

- **The watch-phase must be fun to watch**: with no continuous input, the spectacle
  (crowd behavior, audio reactivity, light show) carries the night. Mitigation: closer
  camera + real animation frames + audio-reactive everything; playtest pacing early.
- **Event deck depth**: too few events = repetitive nights. Mitigation: data-driven deck,
  ~12 events minimum at launch, weighted draws to avoid repeats.
- **Asset pack coherence**: mixing packs can look like a collage. Mitigation: pick one
  primary character pack + one tileset family; recolor over remixing.
- **DJ balance**: dominant-strategy lineups would flatten the game. Mitigation: fatigue +
  affinities + cuts create rotating incentives; tune against sim runs.

## 15. Success criteria

- A new player reaches their first sunrise payout within ~5 minutes of opening the URL,
  on a phone — having made at least 3 meaningful decisions on the way.
- Players name a favorite DJ in their crew unprompted.
- Friends return unprompted to beat each other's leaderboard nights.
- At least one person shares a recap card without being asked.
- The developer still thinks it's fun to work on. (Side project rule #1.)

---

## Appendix — Key decisions log

| # | Decision |
|---|---|
| 1 | Hybrid active/idle (not pure idle, not pure management) |
| 2 | **v2: player is the crew boss, not the DJ — all input is discrete decisions (GDT model)** |
| 3 | **v2: nights divide into DJ sets; decisions at set transitions (who + intensity) plus 2–4 event popups** |
| 4 | **v2: permanent DJ crew, scene-gated recruitment; stats, affinities, risk profiles, real-time fatigue** |
| 5 | **v2: DJs paid as a cut of the night's takings — no fixed costs, no-softlock preserved** |
| 6 | Timed runs to sunrise + heat meter + separate gear damage |
| 7 | Illegal free-party fiction; income = bar drip + prix libre at sunrise |
| 8 | Busts escalate up to gear seizure; unseizable starter rig + founding DJ prevent softlock |
| 9 | Spots = risk/reward personalities, unlocked by reputation |
| 10 | Light idle: repairs + buzz decay + **v2: DJ fatigue recovery**; no passive income |
| 11 | **v2: adaptive stem audio driven by the simulation — the player hears their decisions** |
| 12 | Night length & set count scale with spot tier (~3 → ~10 min) |
| 13 | **v2: sourced pixel asset packs, closer stage camera, 24–32 px animated ravers, DJ portraits** |
| 14 | **v2: gear = 5 categories (platines, mur de son, groupe, lumières, logistique), each felt on screen or in the mix** |
| 15 | v1 win moment = legendary teknival; prestige is v2 |
| 16 | Responsive browser game; localStorage + export codes |
| 17 | Genres as mechanics (data-driven profiles + stem sets) |
| 18 | French-only UI at launch; recap card share image |
| 19 | VPS-hosted, dockerized: static frontend + pseudonym leaderboard API (SQLite) — built |
| 20 | **Night-loop overhaul (chantier 1)**: the brief is replaced by 4 tappable intensity crans played against a visible crowd attente (tolerance/charisme/burnout/waveScore); nights run a scripted 4-phase arc (rep ×2 at dawn); heat ≥ 0.85 opens a playable descente (evacuate/negotiate/hold the wall) with persistent casier & garde à vue |
| 21 | Variety lives outside the sim: special night offers at prepare (soundclash → Volt, teuf privée, anniversaire, nuit à thème) and consequence arcs planted by choices (corrupt cop, journalist, farmer → château squatté) |
| 22 | Gameplay-gated unlocks are canon: Volt joins only crews that beat him in a soundclash; the château requires the finished farmer arc on top of reputation |
