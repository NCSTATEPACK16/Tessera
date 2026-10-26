/**
 * Browser tests — the gate the unit suite cannot be.
 *
 * `npm test` is several hundred assertions about pure functions, and it will stay green
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

  // Every test gets its own browser context, so its own IndexedDB — nothing is
  // shared between workers. The exception is timing, handled by project below.
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: process.env['CI'] ? 3 : 4,
  // Headroom for a loaded machine (the suite is meant to run in the background);
  // a healthy test here finishes in under fifteen seconds.
  timeout: 60_000,
  reporter: process.env['CI'] ? 'github' : [['list']],

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  // Tags, in the test titles' `tag` option:
  //   @timing — measures the frame loop or counts mutations; runs alone, first.
  //   @phone  — about the sheet form factor; the only tests the phone runs.
  //   @slow   — unavoidably long (HEIC decode, double 150-piece cuts); left out
  //             of `npm run test:browser`, run by `test:browser:full` and CI.
  projects: [
    {
      // A contended machine makes "did this settle in 500ms" a coin toss, so
      // these run on one worker before anything else starts.
      name: 'timing',
      grep: /@timing/,
      workers: 1,
      fullyParallel: false,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      // §06's iPad landscape: tray docked right. Runs everything but @timing.
      name: 'dock',
      grepInvert: /@timing/,
      dependencies: ['timing'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      // §06's iPhone portrait: three-detent bottom sheet. Only what is about
      // the sheet — a flow that works on the dock works here too, and running
      // the whole suite twice was half of what made it take sixteen minutes.
      name: 'phone',
      grep: /@phone/,
      dependencies: ['timing'],
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
