import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, validateScore } from '../db.mjs';
import { createApp } from '../index.mjs';

let server;
let base;

before(async () => {
  const db = openDb(':memory:');
  server = createApp(db);
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const validScore = {
  pseudo: 'DJ Bagarre',
  crowd: 250,
  payout: 1800,
  busted: false,
  heatAtEnd: 0.4,
  spot: 'hangar',
  genre: 'acid',
};

test('validation rejects junk', () => {
  assert.equal(validateScore(null), 'corps invalide');
  assert.equal(validateScore({ ...validScore, pseudo: '' }), 'pseudo requis');
  assert.equal(validateScore({ ...validScore, pseudo: 'x'.repeat(25) }), 'pseudo trop long (24 max)');
  assert.equal(validateScore({ ...validScore, crowd: -1 }), 'crowd invalide');
  assert.equal(validateScore({ ...validScore, spot: 'jardin' }), 'spot invalide');
  assert.equal(validateScore(validScore), null);
});

test('POST /api/scores stores a night, GET ranks it', async () => {
  const res = await fetch(`${base}/api/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validScore),
  });
  assert.equal(res.status, 201);

  await fetch(`${base}/api/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...validScore, pseudo: 'Sono Mobile', crowd: 900, payout: 50, busted: true }),
  });

  const crowd = await (await fetch(`${base}/api/leaderboard?board=crowd`)).json();
  assert.equal(crowd.scores.length, 2);
  assert.equal(crowd.scores[0].pseudo, 'Sono Mobile');

  const payout = await (await fetch(`${base}/api/leaderboard?board=payout`)).json();
  assert.equal(payout.scores[0].pseudo, 'DJ Bagarre');

  const bust = await (await fetch(`${base}/api/leaderboard?board=bust`)).json();
  assert.equal(bust.scores.length, 1);
  assert.equal(bust.scores[0].busted, true);
});

test('rejects invalid submissions with 400', async () => {
  const res = await fetch(`${base}/api/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...validScore, genre: 'schlager' }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, 'genre invalide');
});

test('unknown board and route 4xx', async () => {
  assert.equal((await fetch(`${base}/api/leaderboard?board=zzz`)).status, 400);
  assert.equal((await fetch(`${base}/api/nope`)).status, 404);
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
});
