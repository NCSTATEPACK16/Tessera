#!/usr/bin/env node
/**
 * CI's bundle-budget gate (Track 1/2). The whole point of Track 1's dynamic
 * `import('heic-to')` inside `heic.worker.ts` is that the ~3 MB libheif WASM
 * chunk never reaches the main entry chunk — every curated-photo puzzle and
 * every JPEG upload must pay nothing for it. That's easy to break silently: a
 * future refactor that hoists the import, or a bundler config change that
 * disables code-splitting, produces a working app with a much heavier first
 * load and no test failure anywhere else.
 *
 * Run after `npm run build`. Reads the built `dist/index.html` to find the
 * real entry chunk (rather than guessing a filename pattern), then asserts:
 *  1. the entry chunk stays under a byte budget generous enough not to nag on
 *     routine growth, but tight enough to catch libheif landing in it, and
 *  2. a chunk matching `heic-to-*.js` still exists as its own file.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distDir = path.join(repoRoot, 'dist');
const assetsDir = path.join(distDir, 'assets');

/**
 * Comfortable headroom above the ~368 KB this chunk was at when Track 1
 * landed (2026-08-11) — this is a regression guard against something as
 * drastic as an accidentally-inlined 3 MB WASM chunk, not a tight diet.
 * Retune upward if legitimate feature growth needs it; that's a one-line
 * change, not a reason to delete the check.
 */
const MAIN_CHUNK_BUDGET_BYTES = 700 * 1024;

const indexHtml = readFileSync(path.join(distDir, 'index.html'), 'utf8');
const entryMatch = indexHtml.match(/<script[^>]*type="module"[^>]*src="\/assets\/(main-[^"]+\.js)"/);

if (!entryMatch) {
  console.error('Could not find the main entry script tag in dist/index.html — did the build output shape change?');
  process.exit(1);
}

const entryFile = entryMatch[1];
const entrySize = statSync(path.join(assetsDir, entryFile)).size;

const problems = [];

if (entrySize > MAIN_CHUNK_BUDGET_BYTES) {
  problems.push(
    `${entryFile} is ${(entrySize / 1024).toFixed(1)} KB, over the ${(MAIN_CHUNK_BUDGET_BYTES / 1024).toFixed(0)} KB budget. ` +
      `If this is legitimate growth, raise MAIN_CHUNK_BUDGET_BYTES in this script. If it's not, something (most likely heic-to) ` +
      `has stopped being code-split into its own chunk.`,
  );
}

const heicChunk = readdirSync(assetsDir).find((f) => /^heic-to-.*\.js$/.test(f));
if (!heicChunk) {
  problems.push(
    'No dist/assets/heic-to-*.js chunk found. Either heic-to was removed, or its dynamic import() ' +
      'in src/play/heic.worker.ts got inlined into another chunk instead of staying split out.',
  );
}

if (problems.length > 0) {
  console.error(`Bundle budget check failed:\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `Bundle budget OK — ${entryFile} is ${(entrySize / 1024).toFixed(1)} KB (budget ${(MAIN_CHUNK_BUDGET_BYTES / 1024).toFixed(0)} KB), heic-to stays split into ${heicChunk}.`,
);
