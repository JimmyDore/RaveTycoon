import { DatabaseSync } from 'node:sqlite';

const SPOTS = ['champ', 'foret', 'carriere', 'plage', 'hangar', 'tunnel', 'chateau', 'friche', 'teknival'];
const GENRES = ['hardtek', 'acid', 'dub'];

export function openDb(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pseudo TEXT NOT NULL,
      crowd INTEGER NOT NULL,
      payout INTEGER NOT NULL,
      busted INTEGER NOT NULL,
      heat_at_end REAL NOT NULL DEFAULT 0,
      spot TEXT NOT NULL,
      genre TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_scores_crowd ON scores(crowd DESC);
    CREATE INDEX IF NOT EXISTS idx_scores_payout ON scores(payout DESC);
  `);
  return db;
}

/** Validate a submitted score. Returns an error string or null when valid. */
export function validateScore(body) {
  if (typeof body !== 'object' || body === null) return 'corps invalide';
  const { pseudo, crowd, payout, busted, spot, genre } = body;
  if (typeof pseudo !== 'string' || pseudo.trim().length === 0) return 'pseudo requis';
  if (pseudo.trim().length > 24) return 'pseudo trop long (24 max)';
  if (!Number.isFinite(crowd) || crowd < 0 || crowd > 100000) return 'crowd invalide';
  if (!Number.isFinite(payout) || payout < 0 || payout > 100000000) return 'payout invalide';
  if (typeof busted !== 'boolean') return 'busted invalide';
  if (!SPOTS.includes(spot)) return 'spot invalide';
  if (!GENRES.includes(genre)) return 'genre invalide';
  return null;
}

export function insertScore(db, body) {
  const stmt = db.prepare(
    `INSERT INTO scores (pseudo, crowd, payout, busted, heat_at_end, spot, genre)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  stmt.run(
    body.pseudo.trim(),
    Math.round(body.crowd),
    Math.round(body.payout),
    body.busted ? 1 : 0,
    Number.isFinite(body.heatAtEnd) ? body.heatAtEnd : 0,
    body.spot,
    body.genre,
  );
}

const BOARDS = {
  crowd: 'SELECT * FROM scores ORDER BY crowd DESC, payout DESC LIMIT ?',
  payout: 'SELECT * FROM scores ORDER BY payout DESC, crowd DESC LIMIT ?',
  // the most legendary bust: busted nights ranked by crowd at the moment it blew up
  bust: 'SELECT * FROM scores WHERE busted = 1 ORDER BY crowd DESC LIMIT ?',
};

export function getBoard(db, board, limit = 20) {
  const sql = BOARDS[board];
  if (!sql) return null;
  const rows = db.prepare(sql).all(Math.min(Math.max(1, limit | 0), 100));
  return rows.map((r) => ({
    pseudo: r.pseudo,
    crowd: r.crowd,
    payout: r.payout,
    busted: r.busted === 1,
    spot: r.spot,
    genre: r.genre,
    createdAt: r.created_at,
  }));
}
