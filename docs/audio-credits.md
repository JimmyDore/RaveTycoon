# Audio credits

The music stems in `public/audio/` are 4-bar loops built (2026-06-11) from Freesound
material plus ffmpeg-synthesized elements. Licenses were verified on each sound's
Freesound page at download time. All sources used are **CC0 (public domain)** — no
attribution legally required, credited anyway out of etiquette.

Preparation pipeline (ffmpeg 8.0.1): tempo-shift to the genre BPM (`atempo`),
sample-exact 4-bar trim (`atrim=end_sample`), loudness normalization
(`loudnorm=I=-14:TP=-1.5`), Opus-in-Ogg encode (`libopus 96k`, 48 kHz stereo).
Loop lengths: hardtek 170 BPM = 5.647059 s, acid 140 BPM = 6.857143 s, dub 75 BPM = 12.800 s.
Raw downloads live in `assets-src/audio-src/` (gitignored).

## Hardtek (170 BPM)

| Stem | Source | Author | License | What it became |
|---|---|---|---|---|
| `hardtek-kick.ogg` | [Hardtekk Samples - Hardtek Kick](https://freesound.org/people/Cyclez/sounds/493665/) | Cyclez | CC0 | One-shot distorted kick, trimmed to 1 beat and sequenced 4-on-the-floor (16 hits) |
| `hardtek-sub.ogg` | — (synthesized) | ffmpeg `aevalsrc` | n/a | Offbeat 55 Hz donk bass, periodic by construction |
| `hardtek-lead.ogg` | [2m.wav — 180 BPM hardtek piano](https://freesound.org/people/rap2h/sounds/115262/) | rap2h | CC0 | First 4 bars, tempo-shifted 180 → 170 BPM |
| `hardtek-hats.ogg` | [Gabber Breakbeat 160BPM Assembled](https://freesound.org/people/goac0re1/sounds/322315/) | goac0re1 | CC0 | First 4 bars, tempo-shifted 160 → 170 BPM, used as percussion/hats layer |

## Acid (140 BPM)

| Stem | Source | Author | License | What it became |
|---|---|---|---|---|
| `acid-kick.ogg` | — (synthesized) | ffmpeg `aevalsrc` | n/a | 909-style four-on-the-floor kick (pitch-sweep sine) |
| `acid-sub.ogg` | [ACID 27 — TB-303 loop](https://freesound.org/people/XHALE303/sounds/466178/) | XHALE303 | CC0 | First 4 bars, tempo-shifted 130 → 140 BPM, 303 bassline layer |
| `acid-lead.ogg` | [phat acidic synth melody - 140bpm](https://freesound.org/people/voxbox_502_/sounds/850199/) | voxbox_502_ | CC0 | Native 140 BPM 4-bar loop, trimmed sample-exact |
| `acid-hats.ogg` | — (synthesized) | ffmpeg `aevalsrc` noise | n/a | Offbeat open-hat bursts, high-passed at 7 kHz |

## Dub (75 BPM)

| Stem | Source | Author | License | What it became |
|---|---|---|---|---|
| `dub-kick.ogg` | — (synthesized) | ffmpeg `aevalsrc` | n/a | Steppers-style round kick on every beat |
| `dub-sub.ogg` | [ReDub.WAV — 1-bar dub bass](https://freesound.org/people/kejkz/sounds/16445/) | kejkz | CC0 | Native 75 BPM 1-bar bass loop (exactly 3.2 s), looped 4× |
| `dub-lead.ogg` | [Reggae Keyboard Skank Chord Toolkit](https://freesound.org/people/nlux/sounds/638940/) | nlux | CC0 | One chord hit extracted (~1.40 s into the reel) and placed on every offbeat |
| `dub-hats.ogg` | — (synthesized) | ffmpeg `aevalsrc` noise | n/a | 8th-note hats with offbeat accent, high-passed at 7.5 kHz |

## Downloaded but not used in the final stems

| Source | Author | License | Why not used |
|---|---|---|---|
| [xKicks - Loop](https://freesound.org/people/ElectroShockNetwork/sounds/331819/) | ElectroShockNetwork | CC0 | Backup hardtek kick (180 BPM loop); Cyclez one-shot sequenced cleaner |
| [ACID 7](https://freesound.org/people/XHALE303/sounds/465750/) | XHALE303 | CC0 | Alternative 303 line, ACID 27 preferred |
| [acid notes](https://freesound.org/people/D0tDashDialUp/sounds/627756/) | D0tDashDialUp | CC0 | Bar structure unclear, no exact-loop math |
| [140 bpm ATTACK LOOP 1 ELEMENT 5](https://freesound.org/people/Jovica/sounds/1971/) | Jovica | **CC-BY 4.0** (not CC0 as planned) | Skipped to keep the pack all-CC0 |
| [Real-Reggea Dub Loop](https://freesound.org/people/hello_flowers/sounds/31892/) / [Loop 2](https://freesound.org/people/hello_flowers/sounds/31891/) | hello_flowers | CC0 | Full-mix band recordings; layering them over the stem mixer would clash |
| [Rock beat loop 9 - reggae backbeat](https://freesound.org/people/bigjoedrummer/sounds/77299/) | bigjoedrummer | CC0 | ~106 BPM; the 106 → 75 tempo shift smeared the transients |

Note: stems were sourced from Freesound's public preview MP3s (the same audio at
preview quality); preview transcoding quality is acceptable for in-game loops.
