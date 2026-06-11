import { getDj, getGenre, getSpot } from '../core/data';
import type { NightResult } from '../core/types';
import { STR, fmtCash } from './strings';

const W = 800;
const H = 418;

/**
 * The build-in-public screenshot machine: a shareable sunrise recap card
 * rendered straight to canvas. No backend involved.
 */
export function drawRecapCard(result: NightResult, pseudo: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d')!;

  // sky
  const sky = c.createLinearGradient(0, 0, 0, H * 0.75);
  if (result.busted) {
    sky.addColorStop(0, '#0a0820');
    sky.addColorStop(1, '#2a1430');
  } else {
    sky.addColorStop(0, '#2c3e7a');
    sky.addColorStop(0.6, '#c2571f');
    sky.addColorStop(1, '#ffd166');
  }
  c.fillStyle = sky;
  c.fillRect(0, 0, W, H);

  // sun or gyro glow
  if (!result.busted) {
    const glow = c.createRadialGradient(W / 2, H * 0.72, 10, W / 2, H * 0.72, 160);
    glow.addColorStop(0, 'rgba(255, 240, 180, 0.95)');
    glow.addColorStop(1, 'rgba(255, 200, 100, 0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#fff3c4';
    c.fillRect(W / 2 - 22, H * 0.72 - 22, 44, 44);
  } else {
    c.fillStyle = 'rgba(40, 90, 255, 0.22)';
    c.fillRect(0, 0, W / 3, H);
    c.fillStyle = 'rgba(255, 40, 60, 0.16)';
    c.fillRect((2 * W) / 3, 0, W / 3, H);
  }

  // ground + crowd silhouettes
  c.fillStyle = '#120e1c';
  c.fillRect(0, H * 0.75, W, H * 0.25);
  c.fillStyle = '#0a0712';
  const crowdN = Math.min(160, Math.max(12, Math.round(result.peakCrowd / 4)));
  for (let i = 0; i < crowdN; i++) {
    const x = (i * 5.07 * 997) % W;
    const y = H * 0.75 - 4 - ((i * 37) % 26);
    c.fillRect(x, y, 6, 18);
    c.fillRect(x + 1, y - 5, 4, 5);
  }
  // speaker stacks
  for (const sx of [60, W - 110]) {
    c.fillStyle = '#080610';
    c.fillRect(sx, H * 0.42, 50, H * 0.33);
    c.fillStyle = '#1c1628';
    for (let i = 0; i < 4; i++) c.fillRect(sx + 8, H * 0.44 + i * 32, 34, 24);
  }

  // text
  c.textAlign = 'left';
  c.fillStyle = '#ffffff';
  c.font = 'bold 38px monospace';
  c.fillText(STR.title.toUpperCase(), 36, 60);
  c.font = '20px monospace';
  c.fillStyle = 'rgba(255,255,255,0.85)';
  const genresPlayed = [...new Set(result.lineup.map((s) => getDj(s.djId).genre))]
    .map((g) => getGenre(g).nom)
    .join(' · ');
  const subLine = genresPlayed
    ? `${getSpot(result.spotId).nom} · ${genresPlayed}`
    : getSpot(result.spotId).nom;
  c.fillText(subLine, 36, 92);
  if (pseudo) {
    c.fillText(pseudo, 36, 120);
  }

  c.font = 'bold 30px monospace';
  c.fillStyle = '#ffe066';
  c.fillText(`${result.peakCrowd} ${STR.crowdLabel}`, 36, H - 92);
  c.fillText(fmtCash(result.payout), 36, H - 52);

  c.font = '16px monospace';
  c.fillStyle = 'rgba(255,255,255,0.7)';
  const date = new Date().toLocaleDateString('fr-FR');
  c.fillText(date, W - 140, H - 24);

  if (result.won) {
    c.font = 'bold 34px monospace';
    c.fillStyle = '#ffd700';
    c.textAlign = 'center';
    c.fillText(`🏆 ${STR.wonTitle} 🏆`, W / 2, 160);
    c.textAlign = 'left';
  }

  // the night's lineup
  const lineupNames = [...new Set(result.lineup.map((s) => s.djId))].map((id) => getDj(id).nom);
  if (lineupNames.length > 0) {
    c.font = '18px monospace';
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.textAlign = 'right';
    c.fillText(`Line-up : ${lineupNames.join(' · ')}`, W - 36, H - 56);
    c.textAlign = 'left';
  }

  // PERQUISITIONNÉ stamp
  if (result.busted) {
    c.save();
    c.translate(W / 2, H / 2);
    c.rotate(-0.18);
    c.font = 'bold 64px monospace';
    c.fillStyle = 'rgba(255, 40, 60, 0.85)';
    c.textAlign = 'center';
    c.fillText(STR.busted, 0, 20);
    c.strokeStyle = 'rgba(255, 40, 60, 0.85)';
    c.lineWidth = 6;
    c.strokeRect(-330, -50, 660, 100);
    c.restore();
  }

  return canvas;
}

/** Share via the Web Share API when available, otherwise download the PNG. */
export async function shareRecapCard(result: NightResult, pseudo: string): Promise<void> {
  const canvas = drawRecapCard(result, pseudo);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;
  const file = new File([blob], 'rave-tycoon.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: STR.title });
      return;
    } catch {
      // user cancelled — fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rave-tycoon.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
