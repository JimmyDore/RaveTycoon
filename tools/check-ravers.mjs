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
