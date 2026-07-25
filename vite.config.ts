// `vitest/config` rather than `vite` — it is the same defineConfig widened to
// accept the `test` block below.
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    // Real-hardware testing is a gate at every step, so the dev server must be
    // reachable from an iPad or iPhone on the same network.
    host: true,
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
