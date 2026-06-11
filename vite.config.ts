import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      // leaderboard API during dev: `node server/index.mjs` on :8787
      '/api': 'http://localhost:8787',
    },
  },
});
