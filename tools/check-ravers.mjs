/** Verifies public/assets/ravers.png frames contain whole bodies. Exit 1 on failure. */
import sharp from 'sharp';

const { data, info } = await sharp('public/assets/ravers.png')
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const FRAME_W = 16;
const FRAME_H = 32;
const CHARS = 20;
// one front-facing frame per animation: idle, walk (down starts at 24+3*6), lift (48+3*14)
const PROBES = [
  { name: 'idle', col: 18 },
  { name: 'walk', col: 42 },
  { name: 'lift', col: 90 },
];

let bad = 0;
for (let c = 0; c < CHARS; c++) {
  for (const { name, col } of PROBES) {
    const fx = col * FRAME_W;
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
    // top >= 4: no neighbour-row feet leaking in above the head;
    // bottom near frame edge: the character's own feet not cut off
    const ok = top >= 4 && bottom >= FRAME_H - 3 && maxGap <= 4 && inkRows.length >= 14;
    if (!ok) {
      bad++;
      console.error(`char ${c} ${name}: ink y[${top},${bottom}] gap=${maxGap} rows=${inkRows.length} — body truncated or split`);
    }
  }
}
if (bad > 0) {
  console.error(`${bad}/${CHARS * PROBES.length} frames broken`);
  process.exit(1);
}
console.log(`all ${CHARS} characters have full bodies in idle/walk/lift`);
