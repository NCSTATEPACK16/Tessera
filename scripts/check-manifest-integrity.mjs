#!/usr/bin/env node
/**
 * CI's manifest-integrity gate (Track 2). Deliberately separate from
 * `validateManifest` (src/play/curated.ts), which only checks that licence
 * fields are non-empty — the exact gap that let `'stub'` sit in the manifest
 * silently until someone happened to read it. This checks the two things
 * that gap can't: every asset↔manifest-row pair actually exists in both
 * directions, and no field is a placeholder value rather than a real one.
 *
 * Deliberately dependency-free and TypeScript-free — reads
 * assets/curated/manifest.json directly rather than importing
 * src/play/curated.ts, so this job needs nothing but `node` and runs in
 * seconds without npm ci.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const assetsDir = path.join(repoRoot, 'assets/curated');
const manifestPath = path.join(assetsDir, 'manifest.json');

const PLACEHOLDER_VALUES = new Set(['stub', 'todo', 'tbd', 'placeholder', 'unknown', 'n/a', 'xxx']);

const isPlaceholder = (value) => PLACEHOLDER_VALUES.has(value.trim().toLowerCase());

const problems = [];

/** @type {Array<{id: string, file: string, licence: {name: string, attribution: string, sourceUrl: string}}>} */
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const jpgFiles = new Set(readdirSync(assetsDir).filter((f) => f.endsWith('.jpg')));
const manifestFiles = new Set();

for (const photo of manifest) {
  const where = photo.id ?? '(missing id)';

  manifestFiles.add(photo.file);
  if (!photo.file || !jpgFiles.has(photo.file)) {
    problems.push(`${where}: manifest row points at "${photo.file}", which is not in assets/curated/`);
  }

  for (const [field, value] of Object.entries(photo.licence ?? {})) {
    if (typeof value === 'string' && isPlaceholder(value)) {
      problems.push(`${where}: licence.${field} is a placeholder ("${value}"), not a real value`);
    }
  }
}

for (const file of jpgFiles) {
  if (!manifestFiles.has(file)) {
    problems.push(`assets/curated/${file} has no manifest row — it will never be shown to a player`);
  }
}

if (problems.length > 0) {
  console.error(`Manifest integrity check failed (${problems.length}):\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`Manifest integrity OK — ${manifest.length} photos, all real files, no placeholder licences.`);
