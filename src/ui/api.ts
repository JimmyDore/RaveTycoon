import { getDj } from '../core/data';
import type { NightResult } from '../core/types';

export type BoardKind = 'crowd' | 'payout' | 'bust';

export interface ScoreRow {
  pseudo: string;
  crowd: number;
  payout: number;
  busted: boolean;
  spot: string;
  genre: string;
  createdAt: string;
}

const BASE = '/api';

/** Fire-and-forget score submission. Resolves false when the API is absent. */
export async function submitScore(pseudo: string, result: NightResult): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pseudo,
        crowd: result.peakCrowd,
        payout: result.payout,
        busted: result.busted,
        heatAtEnd: 0,
        spot: result.spotId,
        // le son c'est le DJ : on remonte les genres joués, dérivés du line-up
        genre: [...new Set(result.lineup.map((s) => getDj(s.djId).genre))].join(','),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Fetch a board; null means the API is unreachable (offline mode). */
export async function fetchBoard(board: BoardKind, limit = 20): Promise<ScoreRow[] | null> {
  try {
    const res = await fetch(`${BASE}/leaderboard?board=${board}&limit=${limit}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { scores: ScoreRow[] };
    return data.scores;
  } catch {
    return null;
  }
}
