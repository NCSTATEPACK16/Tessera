#!/usr/bin/env node
/**
 * Step 9's PWA gate. Playwright can't cover this the way it covers the rest
 * of the app: `playwright.config.ts`'s `webServer` boots the Vite *dev*
 * server, and the service worker is deliberately disabled there (vite.config.ts —
 * `npm run dev` is the real-device iteration loop; a dev-mode SW would sit
 * between every edit and the device under test). So the SW only exists in
 * `dist/`, which means only a build-output check can see it at all.
 *
 * Run after `npm run build`. Reads dist/ directly rather than importing
 * vite.config.ts, matching check-bundle-budget.mjs's own reasoning: this is
 * an assertion about what actually got written to disk, not about the
 * config that (hopefully) produced it.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distDir = path.join(repoRoot, 'dist');

const problems = [];

const requiredFiles = [
  'sw.js',
  'manifest.webmanifest',
  'apple-touch-icon.png',
  'favicon.png',
  'pwa-192x192.png',
  'pwa-512x512.png',
  'pwa-maskable-512x512.png',
];
for (const file of requiredFiles) {
  if (!existsSync(path.join(distDir, file))) {
    problems.push(`missing dist/${file}`);
  }
}

if (existsSync(path.join(distDir, 'manifest.webmanifest'))) {
  const manifest = JSON.parse(readFileSync(path.join(distDir, 'manifest.webmanifest'), 'utf8'));
  if (manifest.display !== 'standalone') {
    problems.push(`manifest.display is "${manifest.display}", expected "standalone"`);
  }
  const sizes = new Set((manifest.icons ?? []).map((i) => i.sizes));
  for (const required of ['192x192', '512x512']) {
    if (!sizes.has(required)) problems.push(`manifest is missing a ${required} icon entry`);
  }
  if (!(manifest.icons ?? []).some((i) => i.purpose === 'maskable')) {
    problems.push('manifest has no maskable icon');
  }
}

if (existsSync(path.join(distDir, 'sw.js'))) {
  const sw = readFileSync(path.join(distDir, 'sw.js'), 'utf8');

  // Regression guard for the exact bug this script was written after: the
  // libheif/HEIC decoder is a ~3MB WASM-backed chunk Track 1 deliberately
  // code-splits out of the main bundle so only a HEIC upload ever pays for
  // it. Precaching it would force that 3MB onto every install and also
  // exceeds Workbox's 2MB default precache limit, which fails the build
  // outright rather than just bloating it — so if this ever regresses,
  // `npm run build` fails before this script even runs. Checked anyway,
  // as a second, more specific signal than "the build failed somehow".
  if (/heic-to-.*\.js/.test(sw)) {
    problems.push('sw.js precaches a heic-to-*.js chunk — it must stay runtime-only, not precached');
  }

  // The 30-photo curated library is ~25MB — cached on first play via
  // runtimeCaching, never precached, so a fresh install doesn't force a
  // 25MB download before the player has touched anything (§17, §14).
  if (/\{url:"assets\/[^"]*\.jpg"/.test(sw)) {
    problems.push('sw.js precaches a curated photo — photos must be runtime-cached, not precached');
  }

  if (!sw.includes('curated-photos')) {
    problems.push('sw.js has no "curated-photos" runtime cache — curated photos would never work offline');
  }
}

if (problems.length > 0) {
  console.error('PWA build check failed:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log('PWA build check OK — manifest, icons, and service worker precache shape are all correct.');
