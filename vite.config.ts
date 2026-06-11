import { defineConfig } from 'vite';

// leaderboard API during dev/preview: `node server/index.mjs` on :8787
const proxy = { '/api': 'http://localhost:8787' };

export default defineConfig({
  server: { proxy },
  preview: { proxy },
});
