/**
 * Browser tests — the gate the unit suite cannot be.
 *
 * `npm test` is 319 assertions about pure functions, and it will stay green
 * while the app fails to boot. This config exists because the two invariants
 * that matter most at step 3 are only observable in a browser: **the board never
 * re-renders through React**, and **an idle board draws nothing at all.** Both
 * are measured in `invariants.spec.ts` rather than asserted by intention.
 *
 * It is not a replacement for the real-hardware gate. This is Chromium on a
 * desktop; §17's week of snap tuning and the iPad Safari behaviours in the plan
 * are judged by hand and cannot be reproduced here.
 *
 * **The version is pinned deliberately.** `@playwright/test` ties each release
 * to one Chromium build, so bumping it silently triggers a browser download.
 * Bump it on purpose, and run `npx playwright install chromium` when you do.
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = 5179;

export default defineConfig({
  testDir: './test/browser',
  // Vitest owns `*.test.ts`; this owns `*.spec.ts`. Neither ever collects the
  // other's files, so `npm test` stays fast and dependency-free.
  testMatch: '**/*.spec.ts',

  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  // One worker: several specs drive the camera and the frame loop, and a
  // contended machine makes "did this settle in 500ms" a coin toss.
  workers: 1,
  reporter: process.env['CI'] ? 'github' : [['list']],

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      // §06's iPad landscape: tray docked right.
      name: 'dock',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      // §06's iPhone portrait: three-detent bottom sheet.
      name: 'phone',
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
  ],

  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
});
