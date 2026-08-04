/**
 * Build-time precompute for the curated library (§15: "pre-compute everything —
 * dominant colours, difficulty rating, recommended piece counts — at build
 * time, so a curated photo opens instantly").
 *
 * Run with `npm run curated:manifest`. Emits `src/play/curated-manifest.ts`.
 * The two functions below are pure and exported so they can be tested without
 * decoding a single image.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PIECE_COUNT_LADDER } from '../src/play/setup.ts';
import { binByColour } from '../src/tray/colour.ts';
import { validateManifest, type CuratedPhoto } from '../src/play/curated.ts';

/** §15's threshold, and the reason this whole function exists. */
const NEAR_UNIFORM_THRESHOLD = 0.25;
/** Two pixels within this squared RGB distance count as the same tone. */
const UNIFORM_TOLERANCE_SQ = 24 * 24 * 3;
/** Blocks are 16×16; a block is "uniform" when its own variance is under tolerance. */
const BLOCK = 16;

export function nearUniformFraction(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  let uniform = 0;
  let total = 0;
  for (let by = 0; by + BLOCK <= height; by += BLOCK) {
    for (let bx = 0; bx + BLOCK <= width; bx += BLOCK) {
      let rs = 0, gs = 0, bs = 0, n = 0;
      for (let y = by; y < by + BLOCK; y++) {
        for (let x = bx; x < bx + BLOCK; x++) {
          const i = (y * width + x) * 4;
          rs += pixels[i]!; gs += pixels[i + 1]!; bs += pixels[i + 2]!; n++;
        }
      }
      const mr = rs / n, mg = gs / n, mb = bs / n;
      let varSum = 0;
      for (let y = by; y < by + BLOCK; y++) {
        for (let x = bx; x < bx + BLOCK; x++) {
          const i = (y * width + x) * 4;
          varSum +=
            (pixels[i]! - mr) ** 2 + (pixels[i + 1]! - mg) ** 2 + (pixels[i + 2]! - mb) ** 2;
        }
      }
      if (varSum / n < UNIFORM_TOLERANCE_SQ) uniform++;
      total++;
    }
  }
  return total === 0 ? 0 : uniform / total;
}

export function difficultyFor(fraction: number): {
  difficulty: 'easy' | 'standard' | 'hard';
  recommendedCounts: number[];
} {
  if (fraction > NEAR_UNIFORM_THRESHOLD) {
    // Capped, not rejected — §15 wants the badge of honour.
    return { difficulty: 'hard', recommendedCounts: [50, 100, 150] };
  }
  if (fraction > 0.12) {
    return { difficulty: 'standard', recommendedCounts: [...PIECE_COUNT_LADDER] };
  }
  return { difficulty: 'easy', recommendedCounts: [...PIECE_COUNT_LADDER] };
}

// ---------------------------------------------------------------------------
// I/O half. Only runs when this module is invoked directly (`npm run
// curated:manifest`), never when the test file imports the pure functions
// above — that's what keeps this module importable under vitest's node
// environment, which has no `createImageBitmap`/canvas.

interface ManifestRow {
  id: string;
  name: string;
  shelf: CuratedPhoto['shelf'];
  file: string;
  licence: CuratedPhoto['licence'];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const ASSETS_DIR = join(ROOT, 'assets', 'curated');
const OUTPUT_FILE = join(ROOT, 'src', 'play', 'curated-manifest.ts');

async function main(): Promise<void> {
  // Deferred so the pure functions above stay importable in an environment
  // (vitest, node) that never touches this branch.
  const sharp = (await import('sharp')).default;

  const manifestJsonPath = join(ASSETS_DIR, 'manifest.json');
  const rows: ManifestRow[] = JSON.parse(readFileSync(manifestJsonPath, 'utf-8'));

  const photos: CuratedPhoto[] = [];
  for (const row of rows) {
    const { data, info } = await sharp(join(ASSETS_DIR, row.file))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const width = info.width;
    const height = info.height;
    const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);

    const fraction = nearUniformFraction(pixels, width, height);
    const { difficulty, recommendedCounts } = difficultyFor(fraction);

    // Sample every 8th pixel for the dominant-colour clustering — enough
    // signal for six bins without clustering millions of points.
    const inputs: { id: number; meanColor: readonly [number, number, number]; colorVariance: number }[] = [];
    let sampleId = 0;
    for (let i = 0; i < pixels.length; i += 4 * 8) {
      inputs.push({
        id: sampleId++,
        meanColor: [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!],
        colorVariance: 0,
      });
    }
    const binning = binByColour(inputs, 0);
    const dominant = binning.bins
      .filter((bin) => !bin.mixed)
      .map((bin) => bin.swatch);

    photos.push({
      id: row.id,
      name: row.name,
      shelf: row.shelf,
      width,
      height,
      file: row.file,
      licence: row.licence,
      dominant,
      difficulty,
      recommendedCounts,
    });
  }

  const problems = validateManifest(photos);
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    process.exit(1);
  }

  const body = photos
    .map(
      (photo) => `  {
    id: ${JSON.stringify(photo.id)},
    name: ${JSON.stringify(photo.name)},
    shelf: ${JSON.stringify(photo.shelf)},
    width: ${photo.width},
    height: ${photo.height},
    file: ${JSON.stringify(photo.file)},
    licence: {
      name: ${JSON.stringify(photo.licence.name)},
      attribution: ${JSON.stringify(photo.licence.attribution)},
      sourceUrl: ${JSON.stringify(photo.licence.sourceUrl)},
    },
    dominant: ${JSON.stringify(photo.dominant)},
    difficulty: ${JSON.stringify(photo.difficulty)},
    recommendedCounts: ${JSON.stringify(photo.recommendedCounts)},
  }`,
    )
    .join(',\n');

  const output = `/**
 * Generated by \`npm run curated:manifest\` from \`assets/curated/manifest.json\`.
 * Do not hand-edit — re-run the script instead.
 */
import type { CuratedPhoto } from './curated';

export const CURATED_PHOTOS: CuratedPhoto[] = [
${body},
];
`;

  writeFileSync(OUTPUT_FILE, output);
  console.log(`Wrote ${photos.length} entries to ${OUTPUT_FILE}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
