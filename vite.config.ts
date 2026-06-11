import { configDefaults, defineConfig } from 'vitest/config';

// leaderboard API during dev/preview: `node server/index.mjs` on :8787
const proxy = { '/api': 'http://localhost:8787' };

export default defineConfig({
  server: { proxy },
  preview: { proxy },
  // server/test/ uses node:test (run via `node --test server/test/`), not vitest
  test: { exclude: [...configDefaults.exclude, 'server/**'] },
});
