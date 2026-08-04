/**
 * Module resolution hook for running `scripts/*.ts` directly under
 * `node --experimental-strip-types`. Node's own resolver does neither of the
 * two things this project's TS source relies on — the `@/*` → `src/*` path
 * alias `tsconfig.json` declares, nor extensionless specifiers — because both
 * are normally handled by Vite/tsc's "bundler" module resolution, not
 * Node's ESM resolver. This hook does only that translation; it does not
 * transpile anything (`--experimental-strip-types` does that part).
 *
 * Loaded via `--experimental-loader`, which runs in its own thread and so
 * only touches ESM resolution — unlike `module.registerHooks()`, which also
 * intercepts the main thread's CommonJS `require` and broke `sharp`'s own
 * internal CJS dependency resolution when tried here.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CANDIDATE_SUFFIXES = ['', '.ts', '.tsx', '/index.ts'];

function resolveOnDisk(basePath) {
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = basePath + suffix;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const resolved = resolveOnDisk(join(ROOT, 'src', specifier.slice(2)));
    if (resolved) return nextResolve(pathToFileURL(resolved).href, context);
  } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const importerPath = context.parentURL ? fileURLToPath(context.parentURL) : ROOT;
    const resolved = resolveOnDisk(join(dirname(importerPath), specifier));
    if (resolved) return nextResolve(pathToFileURL(resolved).href, context);
  }
  return nextResolve(specifier, context);
}
