import { createServer } from 'node:http';
import { openDb, validateScore, insertScore, getBoard } from './db.mjs';

const PORT = Number(process.env.PORT ?? 8787);
const DB_PATH = process.env.DB_PATH ?? './data/scores.db';

/** Tiny no-dependency leaderboard API: pseudonym scores, no accounts, no auth. */
export function createApp(db) {
  return createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host}`);

    try {
      if (req.method === 'POST' && url.pathname === '/api/scores') {
        const body = await readJson(req);
        const error = body === undefined ? 'JSON invalide' : validateScore(body);
        if (error) {
          json(res, 400, { error });
          return;
        }
        insertScore(db, body);
        json(res, 201, { ok: true });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/leaderboard') {
        const board = url.searchParams.get('board') ?? 'crowd';
        const limit = Number(url.searchParams.get('limit') ?? 20);
        const scores = getBoard(db, board, limit);
        if (scores === null) {
          json(res, 400, { error: 'board inconnu' });
          return;
        }
        json(res, 200, { scores });
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/health') {
        json(res, 200, { ok: true });
        return;
      }
      json(res, 404, { error: 'introuvable' });
    } catch (err) {
      console.error(err);
      json(res, 500, { error: 'erreur serveur' });
    }
  });
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 16384) {
        resolve(undefined);
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(undefined);
      }
    });
    req.on('error', () => resolve(undefined));
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const { mkdirSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  if (DB_PATH !== ':memory:') mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = openDb(DB_PATH);
  createApp(db).listen(PORT, () => {
    console.log(`rave-tycoon leaderboard sur :${PORT} (db: ${DB_PATH})`);
  });
}
