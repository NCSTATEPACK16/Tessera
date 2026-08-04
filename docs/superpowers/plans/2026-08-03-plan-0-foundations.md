# Plan 0 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the six procedurally-drawn curated scenes with ~30 real, licence-verified
photographs behind a precomputed manifest; confirm and regression-test the EXIF/HEIC handling that
`PLAN.md` Step 1 still lists as open; and delete the dead workset-collapse surface without breaking
the mat-gating invariant or any saved snapshot.

**Architecture:** `renderCuratedPhoto(id)` keeps its exact signature and swaps its body from
`OffscreenCanvas` drawing to decoding a bundled asset, so every call site is untouched. A build-time
Node script reads `assets/curated/*` and emits `src/play/curated-manifest.ts`; the manifest is
plain data, so `curated.ts` stays pure and testable. The collapse removal is three separate
concerns — runtime surface, the `isHidden` mat-gating invariant, and save-format tolerance — and
they are separate tasks because half-doing any one of them is a silent failure.

**Tech Stack:** TypeScript, Vite 6, React 19, vitest (node env), Playwright, IndexedDB.

## Global Constraints

- **The design doc wins every disagreement.** `docs/Tessera Design Doc.dc.html`, §15 for the
  library and §04 for the cut.
- **Piece ceiling 250. Source downscale max 2560px long edge.** Unchanged by this plan.
- **DOM-free is the same word as tested.** Anything with a real decision in it is unit-tested;
  files touching DOM/canvas/Web Audio are judged by hand.
- **`vitest` owns `test/**/*.test.ts` in a node environment; Playwright owns
  `test/browser/*.spec.ts`.** Neither ever collects the other's files.
- **`npm run test:browser` is a gate, not an optional extra.** Run it before the PR, without
  exception.
- **Never store geometry or piece images.** The cut is deterministic from a seed.
- **Touch target floor 44pt, everywhere.**
- **Colour is never the only signal.**
- Commands: `npm test` · `npm run typecheck` · `npm run build` · `npm run test:browser`

---

### Task 1: The curated photo shortlist — a human-gated research deliverable

**Files:**
- Create: `docs/superpowers/curated-shortlist.md`

**Interfaces:**
- Consumes: nothing.
- Produces: the approved photo list that Task 2's manifest and Task 4's assets are built from.
  No code depends on this file; it is the licence audit trail.

**This task ends in a review gate, not a commit of assets.** §15 requires per-image licence
verification rather than trusting the platform default, so nothing enters `assets/curated/` until
the shortlist is approved.

- [ ] **Step 1: Research ~30 photographs across the three shelves**

Source from Unsplash, Pexels, and public-domain museum collections (Rijksmuseum, the Met Open
Access, Smithsonian Open Access). Target roughly balanced thirds across `wide-and-calm`,
`dense-and-busy`, and `one-animal-close`.

Apply §15's cuttability rule while shortlisting: prefer photos without large near-uniform regions
(open sky, flat snow, plain studio backdrop). A photo with a big flat area is not disqualified —
it will be tagged `'hard'` in Task 3 — but the set should not be dominated by them.

One photo must be nominated as **the guided twelve's hero** (Plan 7 consumes it): high subject
contrast, strong internal structure, readable at 12 pieces, and unambiguously beautiful. §16's
whole thesis rests on it.

- [ ] **Step 2: Write the shortlist table**

```markdown
# Curated photo shortlist

**Status:** awaiting approval
**Target:** ~30 photos, ~10 per shelf. Hero for the guided twelve marked ★.

| id | name | shelf | source URL | licence | attribution |
|---|---|---|---|---|---|
| ★ harbour-june | Harbour, June | wide-and-calm | https://… | Unsplash License | Photo: A. Example / Unsplash |
| … | | | | | |

## Licence verification

Each row's licence was read on the source page on <date>, not inferred from the platform default.
Rows sourced from museum collections cite the collection's own rights statement.
```

- [ ] **Step 3: Stop and request approval**

Present the shortlist to the user. **Do not download any file or proceed to Task 2 until it is
approved.** If the user rejects entries, replace them and re-present.

- [ ] **Step 4: Commit the approved shortlist**

```bash
git add docs/superpowers/curated-shortlist.md
git commit -m "Plan 0: the approved curated photo shortlist, with per-image licences"
```

---

### Task 2: The manifest types and the licence-validation gate

**Files:**
- Modify: `src/play/curated.ts`
- Create: `src/play/curated-manifest.ts` (generated in Task 3; hand-written stub here)
- Test: `test/play/curated.test.ts` (modify)

**Interfaces:**
- Consumes: nothing.
- Produces: `CuratedPhoto`, `CuratedShelf`, `CuratedLicence`, `CURATED_PHOTOS: readonly
  CuratedPhoto[]`, `curatedPhotoById(id: string): CuratedPhoto | undefined`,
  `photosByShelf(shelf: CuratedShelf): readonly CuratedPhoto[]`,
  `validateManifest(photos: readonly CuratedPhoto[]): string[]` — returns a list of human-readable
  problems, empty when valid. Task 3's build script and Task 6's picker both consume these.

- [ ] **Step 1: Write the failing test**

Add to `test/play/curated.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CURATED_PHOTOS,
  curatedPhotoById,
  photosByShelf,
  validateManifest,
  type CuratedPhoto,
} from '@/play/curated';

const valid: CuratedPhoto = {
  id: 'harbour-june',
  name: 'Harbour, June',
  shelf: 'wide-and-calm',
  width: 2400,
  height: 1600,
  file: 'harbour-june.jpg',
  licence: {
    name: 'Unsplash License',
    attribution: 'Photo: A. Example / Unsplash',
    sourceUrl: 'https://unsplash.com/photos/example',
  },
  dominant: ['#3d6b8c', '#e8c07d', '#0d1b2a'],
  difficulty: 'standard',
  recommendedCounts: [100, 150, 200],
};

describe('validateManifest', () => {
  it('accepts a complete entry', () => {
    expect(validateManifest([valid])).toEqual([]);
  });

  // The whole reason this gate exists: §15 requires attribution on the
  // completion card, and a missing licence must fail the build rather than
  // silently print nothing.
  it('rejects a missing attribution', () => {
    const bad = { ...valid, licence: { ...valid.licence, attribution: '' } };
    expect(validateManifest([bad])).toContain(
      'harbour-june: licence.attribution is empty',
    );
  });

  it('rejects a missing licence name', () => {
    const bad = { ...valid, licence: { ...valid.licence, name: '' } };
    expect(validateManifest([bad])).toContain('harbour-june: licence.name is empty');
  });

  it('rejects a duplicate id, which would make the daily rota land twice', () => {
    expect(validateManifest([valid, valid])).toContain('harbour-june: duplicate id');
  });

  it('rejects a non-positive dimension, which would divide by zero in chooseGrid', () => {
    const bad = { ...valid, width: 0 };
    expect(validateManifest([bad])).toContain('harbour-june: width and height must be positive');
  });
});

describe('photosByShelf', () => {
  it('returns only that shelf, in manifest order', () => {
    const calm = photosByShelf('wide-and-calm');
    expect(calm.length).toBeGreaterThan(0);
    expect(calm.every((p) => p.shelf === 'wide-and-calm')).toBe(true);
    const ids = calm.map((p) => p.id);
    const canonical = CURATED_PHOTOS.filter((p) => p.shelf === 'wide-and-calm').map((p) => p.id);
    expect(ids).toEqual(canonical);
  });
});

describe('the shipped manifest', () => {
  // handoff.md §1g: "it must not ship at six." The daily's photo rota only
  // guarantees no *consecutive-day* repeat, so at six the cycle is visible
  // within a week.
  it('has enough photos that the daily does not visibly cycle', () => {
    expect(CURATED_PHOTOS.length).toBeGreaterThanOrEqual(28);
  });

  it('is valid', () => {
    expect(validateManifest(CURATED_PHOTOS)).toEqual([]);
  });

  it('resolves every id', () => {
    for (const photo of CURATED_PHOTOS) {
      expect(curatedPhotoById(photo.id)).toBe(photo);
    }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run test/play/curated.test.ts`
Expected: FAIL — `validateManifest` and `photosByShelf` are not exported.

- [ ] **Step 3: Write the types and the validator**

Replace the type block and `CURATED_PHOTOS` in `src/play/curated.ts`:

```ts
export type CuratedShelf = 'wide-and-calm' | 'dense-and-busy' | 'one-animal-close';

/**
 * §15: "Each entry needs licence and attribution stored alongside it, surfaced
 * quietly on the completion card." `validateManifest` is what makes that a
 * build failure rather than a blank line on a card nobody notices.
 */
export interface CuratedLicence {
  name: string;
  attribution: string;
  sourceUrl: string;
}

export interface CuratedPhoto {
  id: string;
  name: string;
  /** §15: "browse by feeling, not folder" — a mood for the next forty minutes. */
  shelf: CuratedShelf;
  width: number;
  height: number;
  /** Basename under `assets/curated/`. */
  file: string;
  licence: CuratedLicence;
  /** Precomputed at build time, OKLab-derived. Drives nothing yet; §15 wants it ready. */
  dominant: readonly string[];
  /**
   * §15's cuttability rule: over ~25% near-uniform area is tagged 'hard' and
   * capped at 150, "a badge of honour rather than a bad surprise" — never
   * rejected outright.
   */
  difficulty: 'easy' | 'standard' | 'hard';
  recommendedCounts: readonly number[];
}

export { CURATED_PHOTOS } from './curated-manifest';

export function photosByShelf(shelf: CuratedShelf): readonly CuratedPhoto[] {
  return CURATED_PHOTOS.filter((photo) => photo.shelf === shelf);
}

/** Human-readable problems, empty when the manifest is shippable. */
export function validateManifest(photos: readonly CuratedPhoto[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const photo of photos) {
    if (seen.has(photo.id)) problems.push(`${photo.id}: duplicate id`);
    seen.add(photo.id);
    if (!photo.licence.name) problems.push(`${photo.id}: licence.name is empty`);
    if (!photo.licence.attribution) problems.push(`${photo.id}: licence.attribution is empty`);
    if (!photo.licence.sourceUrl) problems.push(`${photo.id}: licence.sourceUrl is empty`);
    if (!photo.file) problems.push(`${photo.id}: file is empty`);
    if (photo.width <= 0 || photo.height <= 0) {
      problems.push(`${photo.id}: width and height must be positive`);
    }
  }
  return problems;
}
```

Note the re-export: `CURATED_PHOTOS` moves to the generated `curated-manifest.ts` so the build
script can rewrite it without touching hand-written code. Write a stub `curated-manifest.ts` now
holding the existing six entries widened to the new shape, so the tree typechecks; Task 3 replaces
it wholesale.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/play/curated.test.ts`
Expected: all pass except the `>= 28` assertion, which fails against the six-entry stub. That is
correct — it is the gate that Task 4 closes. Mark it `it.fails` is **not** acceptable; leave it red
and note it in the commit message.

- [ ] **Step 5: Commit**

```bash
git add src/play/curated.ts src/play/curated-manifest.ts test/play/curated.test.ts
git commit -m "Plan 0: the curated manifest shape and its licence-validation gate

The >= 28 assertion is deliberately red until the real photos land."
```

---

### Task 3: The build-time precompute script

**Files:**
- Create: `scripts/build-curated-manifest.ts`
- Modify: `package.json` (a `curated:manifest` script)
- Test: `test/play/curated-precompute.test.ts`

**Interfaces:**
- Consumes: `CuratedPhoto`, `validateManifest` from Task 2; `src/tray/colour.ts`'s OKLab helpers.
- Produces: `nearUniformFraction(pixels: Uint8ClampedArray, width: number, height: number):
  number` and `difficultyFor(fraction: number): { difficulty: CuratedPhoto['difficulty'];
  recommendedCounts: number[] }`, both pure and exported from the script module so they are
  testable without running the build.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { difficultyFor, nearUniformFraction } from '../../scripts/build-curated-manifest';

/** A w×h RGBA buffer filled with one colour. */
function solid(w: number, h: number, rgb: [number, number, number]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = rgb[0];
    out[i * 4 + 1] = rgb[1];
    out[i * 4 + 2] = rgb[2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

describe('nearUniformFraction', () => {
  it('is 1 for a flat image — the open-sky case §15 warns about', () => {
    expect(nearUniformFraction(solid(32, 32, [120, 140, 200]), 32, 32)).toBeCloseTo(1, 2);
  });

  it('is near 0 for high-frequency noise', () => {
    const w = 32;
    const h = 32;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const v = (i * 97) % 256;
      px[i * 4] = v;
      px[i * 4 + 1] = (v * 3) % 256;
      px[i * 4 + 2] = (v * 7) % 256;
      px[i * 4 + 3] = 255;
    }
    expect(nearUniformFraction(px, w, h)).toBeLessThan(0.2);
  });
});

describe('difficultyFor', () => {
  // §15: "reject any photo with more than ~25% near-uniform area at counts
  // above 150, or tag it 'hard'". The threshold is the whole point of this
  // function — a test that passed either side of it would be testing nothing.
  it('caps a flat photo at 150 and calls it hard', () => {
    const out = difficultyFor(0.4);
    expect(out.difficulty).toBe('hard');
    expect(Math.max(...out.recommendedCounts)).toBe(150);
  });

  it('lets a busy photo go to the top of the ladder', () => {
    const out = difficultyFor(0.05);
    expect(out.difficulty).toBe('easy');
    expect(Math.max(...out.recommendedCounts)).toBe(250);
  });

  it('puts the threshold at 0.25, not near it', () => {
    expect(difficultyFor(0.24).difficulty).not.toBe('hard');
    expect(difficultyFor(0.26).difficulty).toBe('hard');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/play/curated-precompute.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the script**

```ts
/**
 * Build-time precompute for the curated library (§15: "pre-compute everything —
 * dominant colours, difficulty rating, recommended piece counts — at build
 * time, so a curated photo opens instantly").
 *
 * Run with `npm run curated:manifest`. Emits `src/play/curated-manifest.ts`.
 * The two functions below are pure and exported so they can be tested without
 * decoding a single image.
 */
import { PIECE_COUNT_LADDER } from '../src/play/setup';

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
```

Then the I/O half: read `assets/curated/manifest.json` (the hand-maintained id/name/shelf/licence
rows from Task 1), decode each image, compute `width`/`height`/`dominant`/`difficulty`, run
`validateManifest`, **exit non-zero on any problem**, and write `src/play/curated-manifest.ts`.

Derive `dominant` by sampling the decoded pixels and reusing the OKLab weighted k-means already in
`src/tray/colour.ts` — do not write a second colour clusterer. The forest case in
`test/tray/colour.test.ts` is the one that proved a bare lightness weight cannot work; that
reasoning applies identically here, and duplicating the algorithm would duplicate the bug.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/play/curated-precompute.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the npm script and commit**

```bash
npm pkg set scripts.curated:manifest="node --experimental-strip-types scripts/build-curated-manifest.ts"
git add scripts/build-curated-manifest.ts test/play/curated-precompute.test.ts package.json
git commit -m "Plan 0: build-time precompute for the curated library — cuttability and dominants"
```

---

### Task 4: Land the photos and swap `renderCuratedPhoto`

**Files:**
- Create: `assets/curated/*.jpg`, `assets/curated/manifest.json`
- Modify: `src/play/curated.ts`, `src/play/curated-manifest.ts` (regenerated)
- Test: `test/play/curated.test.ts` (the `>= 28` assertion goes green), `test/daily/daily.test.ts`

**Interfaces:**
- Consumes: Task 1's approved shortlist, Task 2's types, Task 3's script.
- Produces: `renderCuratedPhoto(id: string): Promise<ImageBitmap>` — **unchanged signature**.
  `App.tsx`'s `handlePhotoChosen` and `handleStartDaily` are not modified.

- [ ] **Step 1: Add the files and the hand-maintained rows**

Download the approved photos into `assets/curated/`, downscaled to 2560px on the long edge (the
`PLAN.md` source cap — shipping larger wastes precache budget for no gain). Write
`assets/curated/manifest.json` with one row per photo: `id`, `name`, `shelf`, `file`, `licence`.

- [ ] **Step 2: Generate the manifest**

Run: `npm run curated:manifest`
Expected: writes `src/play/curated-manifest.ts` with ~30 entries and exits 0. If it exits non-zero,
a licence row is incomplete — fix the JSON, do not weaken the validator.

- [ ] **Step 3: Swap `renderCuratedPhoto` to real assets**

Replace `drawScene` and the body of `renderCuratedPhoto` in `src/play/curated.ts`:

```ts
/**
 * Vite resolves every file under `assets/curated/` to its hashed build URL at
 * build time. `eager: false` so a picker showing thirty thumbnails does not
 * decode thirty full-size photos — only the chosen one is fetched.
 */
const FILES = import.meta.glob<{ default: string }>('../../assets/curated/*.jpg');

export async function renderCuratedPhoto(id: string): Promise<ImageBitmap> {
  const photo = curatedPhotoById(id);
  if (!photo) throw new Error(`renderCuratedPhoto: unknown curated photo id "${id}"`);

  const loader = FILES[`../../assets/curated/${photo.file}`];
  if (!loader) throw new Error(`renderCuratedPhoto: missing asset for "${id}"`);

  const url = (await loader()).default;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`renderCuratedPhoto: fetch failed for "${id}"`);
  // `createImageBitmap` from a Blob honours EXIF orientation by default in
  // Safari and Chromium; these files are pre-rotated at import anyway.
  return createImageBitmap(await response.blob());
}
```

Delete `drawScene` entirely.

- [ ] **Step 4: Fix the daily tests that assumed six photos**

`src/daily/daily.ts` derives `PHOTO_STEP = coprimeStep(CURATED_PHOTOS.length)` at module load, so
the rota adapts on its own — but `test/daily/daily.test.ts` asserts concrete indices against
`n = 6`. Read that file and re-derive each expectation against the new length. **Do not weaken an
assertion to make it pass**; the property being tested (no consecutive-day repeat, full coverage of
the rota) is unchanged and must still be asserted exactly.

- [ ] **Step 5: Run the full suite**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass, including `curated.test.ts`'s `>= 28`.

- [ ] **Step 6: Commit**

```bash
git add assets/curated src/play/curated.ts src/play/curated-manifest.ts test/
git commit -m "Plan 0: real curated photographs — the daily stops cycling every six days"
```

---

### Task 5: Shelves in the picker

**Files:**
- Modify: `src/ui/PhotoPicker.tsx`
- Test: `test/browser/photo-picker.spec.ts`

**Interfaces:**
- Consumes: `photosByShelf`, `CuratedShelf` from Task 2.
- Produces: no new exports. `PhotoChoice` and `PhotoPickerProps` are unchanged.

- [ ] **Step 1: Write the failing browser test**

Add to `test/browser/photo-picker.spec.ts`:

```ts
test('curated photos are grouped by feeling, not by category', async ({ page }) => {
  const board = new BoardPage(page);
  await board.open();
  // The three §15 shelves, by their human labels.
  await expect(page.getByRole('heading', { name: 'Wide and calm' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dense and busy' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'One animal, close' })).toBeVisible();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test test/browser/photo-picker.spec.ts`
Expected: FAIL — no such headings.

- [ ] **Step 3: Group the grid by shelf**

Read `src/ui/PhotoPicker.tsx` and replace the single `CURATED_PHOTOS.map(...)` grid at line ~101
with one section per shelf, in this order and with these labels:

```ts
const SHELVES: readonly { key: CuratedShelf; label: string }[] = [
  { key: 'wide-and-calm', label: 'Wide and calm' },
  { key: 'dense-and-busy', label: 'Dense and busy' },
  { key: 'one-animal-close', label: 'One animal, close' },
];
```

Keep the existing chip markup, selection state, and 44pt touch targets exactly as they are — this
is a regrouping, not a redesign. A `'hard'` photo gets a small text marker beside its name;
**not a colour alone**, per `CLAUDE.md`.

- [ ] **Step 4: Run the browser tests**

Run: `npm run test:browser -- test/browser/photo-picker.spec.ts`
Expected: PASS on both the dock and phone projects.

- [ ] **Step 5: Commit**

```bash
git add src/ui/PhotoPicker.tsx test/browser/photo-picker.spec.ts
git commit -m "Plan 0: the picker browses by feeling, not folder (§15)"
```

---

### Task 6: EXIF and HEIC — verify, test, tick the boxes

**Files:**
- Modify: `src/ui/App.tsx` (only if verification finds a real gap)
- Test: `test/browser/photo-picker.spec.ts`
- Modify: `PLAN.md`

**Interfaces:**
- Consumes: `decodeUpload`, `looksLikeHeic`, `HEIC_MESSAGE` in `src/ui/App.tsx`.
- Produces: nothing new.

**This is confirmation, not construction.** Commit `cf2747e` landed both behaviours. Do not assume
a gap exists; do not assume one does not.

- [ ] **Step 1: Read the current implementation**

Read `src/ui/App.tsx:74-131` — `probeImageSize`, `HEIC_MESSAGE`, `looksLikeHeic`, `decodeUpload`.
Establish exactly what each does before writing a test that asserts it.

- [ ] **Step 2: Write the regression tests**

```ts
test('a HEIC upload gets the clear error path, not a silent failure', async ({ page }) => {
  const board = new BoardPage(page);
  await board.open();
  await page.setInputFiles('input[type=file]', {
    name: 'photo.heic',
    mimeType: 'image/heic',
    // Not a real HEIC; `looksLikeHeic` reads the name and type, and the decode
    // would fail regardless — which is the path under test.
    buffer: Buffer.from([0, 0, 0, 0]),
  });
  await expect(page.getByText(/HEIC photos aren.t supported directly/)).toBeVisible();
});

test('a portrait JPEG with EXIF orientation 6 is not sliced sideways', async ({ page }) => {
  const board = new BoardPage(page);
  await board.open();

  // A 200×300 portrait tagged orientation 6 ("rotate 90° CW") is *stored*
  // 300×200. Honouring EXIF must yield 200×300 again; ignoring it yields
  // 300×200 — and PLAN.md's Step 1 box is exactly "portrait photos slice
  // sideways".
  const jpeg = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 200;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#3d6b8c';
    ctx.fillRect(0, 0, 300, 200);
    const blob = await new Promise<Blob>((res) =>
      canvas.toBlob((b) => res(b!), 'image/jpeg', 0.9),
    );
    return [...new Uint8Array(await blob.arrayBuffer())];
  });

  await page.setInputFiles('input[type=file]', {
    name: 'portrait.jpg',
    mimeType: 'image/jpeg',
    buffer: withExifOrientation(Buffer.from(jpeg), 6),
  });

  // The crop screen reports the decoded aspect. Portrait means height > width.
  const aspect = await page
    .getByTestId('crop-source-aspect')
    .evaluate((el) => Number(el.textContent));
  expect(aspect).toBeLessThan(1);
});
```

`withExifOrientation` does not exist yet. Create `test/browser/fixtures/exif.ts` — a binary fixture
is not committed, because a hand-built header is readable and a committed JPEG is not:

```ts
/**
 * Splice a minimal APP1/Exif segment carrying one Orientation tag into a JPEG.
 *
 * Little-endian ("II"), one IFD0 entry: tag 0x0112 (Orientation), type 3
 * (SHORT), count 1. Everything else a real Exif block carries is optional for
 * this purpose, and omitting it keeps the fixture legible.
 */
export function withExifOrientation(jpeg: Buffer, orientation: number): Buffer {
  const tiff = Buffer.alloc(26);
  tiff.write('II', 0, 'ascii');       // little-endian
  tiff.writeUInt16LE(42, 2);          // magic
  tiff.writeUInt32LE(8, 4);           // offset to IFD0
  tiff.writeUInt16LE(1, 8);           // one entry
  tiff.writeUInt16LE(0x0112, 10);     // Orientation
  tiff.writeUInt16LE(3, 12);          // SHORT
  tiff.writeUInt32LE(1, 14);          // count
  tiff.writeUInt16LE(orientation, 18);
  tiff.writeUInt32LE(0, 22);          // no next IFD

  const header = Buffer.from('Exif\0\0', 'ascii');
  const payload = Buffer.concat([header, tiff]);
  const segment = Buffer.alloc(4);
  segment.writeUInt16BE(0xffe1, 0);              // APP1
  segment.writeUInt16BE(payload.length + 2, 2);  // length includes itself

  // After SOI (the first two bytes), before everything else.
  return Buffer.concat([jpeg.subarray(0, 2), segment, payload, jpeg.subarray(2)]);
}
```

If `src/ui/PhotoCrop.tsx` has no `crop-source-aspect` test id, add one — a `data-testid` on an
element already rendering the source's dimensions. Do not add a new visible element for the test.

- [ ] **Step 3: Run them**

Run: `npm run test:browser -- test/browser/photo-picker.spec.ts`
Expected: both pass if `cf2747e` is complete. **If either fails, fix `decodeUpload` and re-run** —
that is the real gap the box was tracking.

- [ ] **Step 4: Tick `PLAN.md`**

Change the two Step 1 lines from `- [ ]` to `- [x]`, and append to each the commit that landed it
(`cf2747e`) and the spec that now covers it.

- [ ] **Step 5: Commit**

```bash
git add test/browser PLAN.md
git commit -m "Plan 0: regression coverage for EXIF orientation and the HEIC error path"
```

---

### Task 7: Delete the workset-collapse runtime surface

**Files:**
- Modify: `src/play/workset.ts`, `src/play/session.ts`, `src/play/runtime.ts`,
  `src/render/renderer.ts`, `src/render/group-chip.ts`, `src/render/scene.ts`
- Test: `test/play/workset.test.ts`, `test/play/tray-deploy.test.ts`,
  `test/render/group-chip.test.ts`, `test/browser/tray-3b.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `groupChipText(label: string): string` and
  `groupChipRect(label: string, at: Point, measure: (t: string) => number): Rect` — both lose their
  `collapsed` parameter. `SceneGroup` loses its `collapsed` field. Task 8 consumes the same removal
  on the persistence side.

**Do Task 7 and Task 8 in the same session.** Between them the tree does not typecheck.

- [ ] **Step 1: Update the tests first — they define the target shape**

In `test/play/workset.test.ts`, **delete** the `'hides its members only while collapsed'` block
(lines ~76-87) and add in its place:

```ts
it('never hides a member — collapse was removed at plan 0', () => {
  const store = new WorksetStore();
  const id = store.create('the roof', [1, 2]);
  expect(store.worksetOf(1)?.id).toBe(id);
  // The mat's only remaining gate is `inTray`. If a second predicate ever
  // returns here, `rebuild`, `scene` and `contentBounds` must all consult it —
  // see CLAUDE.md. Honouring one without the others draws pieces the player
  // cannot grab.
  expect('isHidden' in store).toBe(false);
});
```

In `test/play/tray-deploy.test.ts`, delete the `'a collapsed workset draws nothing and cannot be
picked up'` block (~line 257). In `test/render/group-chip.test.ts`, delete the two collapsed cases
(~lines 19 and 40) and update the remaining calls to the one-argument `groupChipText`.

- [ ] **Step 2: Run to confirm they fail**

Run: `npx vitest run test/play test/render/group-chip.test.ts`
Expected: FAIL — `isHidden` still exists, `groupChipText` still takes two arguments.

- [ ] **Step 3: Remove the surface**

In `src/play/workset.ts`: delete the `collapsed` field from the Workset interface (line ~42), its
initialiser (line ~67), `setCollapsed` (~111), and `isHidden` (~122-131).

In `src/play/session.ts`: delete `setWorksetCollapsed` (~435) and `moveWorksetBy` (~461). Remove
the three `worksets.isHidden` guards at **~331 (`rebuild`), ~353 (hit-testing), and ~723
(`contentBounds`)** — all three, together. In `scene()` (~708-711) drop `collapsed` from the
emitted group and always emit the real member bounds.

In `src/play/runtime.ts`: delete `toggleGroupCollapsed` (~617-621), drop `collapsed` from the
workset branch of the snapshot writer (~391), drop it from the `groupChipRect` call (~602), and
delete the restore line at ~697 that re-applies it.

In `src/render/group-chip.ts`: `groupChipText(label)` returns `label`; drop the `⌄`. Remove
`collapsed` from `groupChipRect`'s parameters.

In `src/render/renderer.ts`: the `const pad = group.collapsed ? 0 : 0.25` at ~642 becomes
`const pad = 0.25`; delete the collapsed branch in `drawGroupChips` (~657-680) and update the
`groupChipText`/`groupChipRect` calls.

In `src/render/scene.ts`: delete `collapsed` from `SceneGroup` (~49) and fix the doc comment on
~50, which currently reads *"or the chip's box when collapsed."*

**Leave `ClusterState.collapsed` in `src/board/board.ts:57,67,146` alone.** That is the island
field, a different concept, and whether it is separately dead is not this task's question.

- [ ] **Step 4: Run the unit tests**

Run: `npx vitest run`
Expected: PASS everything except `test/persist/snapshot.test.ts` and `test/board/board.test.ts`,
which still reference the snapshot's `collapsed`. Task 8 closes those.

- [ ] **Step 5: Do not commit yet** — the tree does not typecheck until Task 8. Proceed directly.

---

### Task 8: Remove `collapsed` from the save format, tolerantly

**Files:**
- Modify: `src/persist/snapshot.ts`, `src/board/board.ts`, `CLAUDE.md`, `PLAN.md`
- Test: `test/persist/snapshot.test.ts`, `test/board/board.test.ts`, `test/browser/persistence.spec.ts`

**Interfaces:**
- Consumes: Task 7's removals.
- Produces: `SessionSnapshot.worksets: { id: number; label: string; pieceIds: PieceId[] }[]` — no
  `collapsed`. `Board.restore` accepts snapshots both with and without it.

**The failure this task exists to prevent:** a real player's IndexedDB already holds snapshots
containing `worksets[].collapsed`. §14 is unambiguous — *"losing progress is unforgivable."* A
schema tidy-up that rejects those snapshots destroys in-progress 250-piece boards.

- [ ] **Step 1: Write the failing test**

Add to `test/persist/snapshot.test.ts`:

```ts
it('restores a snapshot written before collapse was removed', () => {
  // Exactly the shape 5c and step 6 wrote. The extra key must be ignored, not
  // rejected: §14, "losing progress is unforgivable."
  const legacy = {
    ...validSnapshot(),
    worksets: [{ id: 1, label: 'the roof', collapsed: true, pieceIds: [3, 4] }],
  };
  const board = Board.restore(legacy as unknown as SessionSnapshot);
  expect(board.worksets[0]?.label).toBe('the roof');
  expect(board.worksets[0]).not.toHaveProperty('collapsed');
});

it('writes no collapsed field', () => {
  const snap = takeSnapshot(sessionWithWorkset());
  expect(snap.worksets[0]).not.toHaveProperty('collapsed');
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run test/persist/snapshot.test.ts`
Expected: FAIL — the restored workset still carries `collapsed`.

- [ ] **Step 3: Make the change**

In `src/persist/snapshot.ts:34`, drop `collapsed: boolean` from the `worksets` element type and
update the doc comment at line ~10, which currently promises *"position, rotation, kind, label, and
collapsed state."*

In `src/board/board.ts:146`, delete the conditional spread that copies `saved.collapsed`. Reading a
key that no longer exists on the type is already safe at runtime — the point is that nothing
propagates it forward.

**Do not bump the snapshot `version`.** The format is strictly narrower and old snapshots restore
correctly, so a bump would gain nothing and would strand readers that check it.

- [ ] **Step 4: Update the invariants**

In `CLAUDE.md`, the mat-gating invariant currently reads *"Two predicates gate the mat — `inTray`
and `worksets.isHidden` — and both are consulted in `rebuild`, `scene`, and `contentBounds`."*
Rewrite it to name `inTray` as the single gate, and keep the *reason* — that a predicate honoured
in one place and not another leaves the player grabbing invisible pieces — because that reasoning
outlives this particular predicate.

Delete the **"Group collapse is designed-and-deferred, not abandoned"** invariant entirely, and the
matching entry in `PLAN.md`'s 3b section.

- [ ] **Step 5: Run every gate**

```bash
npm test && npm run typecheck && npm run build && npm run test:browser
```
Expected: all green. `test/browser/tray-3b.spec.ts:402` carries a comment explaining that a
collapsed group is deliberately uncovered *"because `toggleGroupCollapsed` is reachable from no
gesture"* — delete that comment; it now describes something that does not exist.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Plan 0: delete workset collapse — the surface, the mat gate, and the saved field

handoff.md §E: 'either design the gesture or delete the surface — do not
leave it a third time.' Deleted. §06 never required collapse; the chip's
tap-to-rename is a complete feature.

Board.restore stays tolerant of snapshots already written with the field,
because §14 is unambiguous that losing progress is unforgivable."
```

---

## Definition of done

- [ ] `npm test` green, and `test/play/curated.test.ts` asserts `CURATED_PHOTOS.length >= 28`.
- [ ] `npm run typecheck`, `npm run build` clean.
- [ ] `npm run test:browser` green on both the dock and phone projects.
- [ ] `npm run curated:manifest` exits non-zero when a licence row is incomplete — verify by
      deleting an attribution and re-running.
- [ ] `grep -rn "collapsed\|isHidden" src` returns only `src/board/board.ts`'s island field.
- [ ] `PLAN.md`'s two Step 1 EXIF/HEIC boxes are ticked.
- [ ] `handoff.md` gains a Plan 0 section: what landed, what the shortlist covers, and the
      remaining gap between ~30 photos and §15's 50.
- [ ] Judged on real hardware: the picker's shelves on a phone, and one real photo cut at 250.
