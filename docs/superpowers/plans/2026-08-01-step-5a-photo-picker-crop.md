# Step 5a — Photo Picker & Crop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `src/ui/App.tsx`'s hardcoded `createSyntheticImage()` call with a real
picker-and-crop flow: choose a curated or uploaded photo, crop/rotate it under a live grid
preview, and hand a real `ImageBitmap` + seed to `PlayRuntime`.

**Architecture:** Two new pure, tested modules (`src/play/photo.ts` for crop geometry,
`src/play/curated.ts` for the bundled photo manifest) back two new thin UI components
(`PhotoPicker.tsx`, `PhotoCrop.tsx`), which `App.tsx` gates in front of the existing board mount
via a small local state machine. `test/browser/board-page.ts`'s single navigation choke point is
updated so all ~60 existing browser specs drive through the real flow unchanged.

**Tech Stack:** React 19 + TypeScript, Tailwind v4 (arbitrary-value classes against the existing
`--color-*`/plain CSS custom properties in `src/ui/theme.css`), vitest (node environment, pure
functions only), Playwright (real browser, canvas/File APIs).

## Global Constraints

- Source photos downscale to **max 2560px long edge** before cutting (CLAUDE.md "Hard numbers").
- **No `localStorage`** for any state this plan touches — not needed here, but nothing added may
  introduce it.
- **Touch target 44pt floor, everywhere** — every new interactive element (`theme.css` already
  enforces this on `button`/`[role=button]`, so plain `<button>` elements inherit it for free).
- **Colour is never the only signal** — the curated grid's selection state and the aspect chips
  must not rely on colour alone (existing patterns in this codebase pair colour with a border/text
  change or an icon; follow that, e.g. a checkmark or border-weight change, not just an accent tint).
- **No feedback may depend on a channel the web build lacks** — no haptics-only affordance in the
  new screens.
- Cut geometry PRNG streams derive from `(seed, kind, id)` via `rngFor`/`seedFromPuzzleId`
  (`src/core/rng.ts`) — this plan mints a puzzle id and derives its seed the same way; it must not
  invent a second seeding scheme.
- `npm run test:browser` is a gate, not an optional extra — every task that touches UI ends with it
  green, and the final task runs the full four-command gate (`npm test`, `npm run typecheck`,
  `npm run build`, `npm run test:browser`).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/play/photo.ts` (new) | Pure crop geometry: rotation-aware sizing, cover-fit crop rect, pan clamping, 2560px downscale target. No DOM, no canvas — tested in vitest's node environment like `src/cut/grid.ts`. |
| `test/play/photo.test.ts` (new) | Unit tests for every function in `photo.ts`. |
| `src/play/curated.ts` (new) | The bundled curated-photo manifest (id/name/dimensions) plus a canvas-based procedural renderer per photo. The manifest lookup is pure and tested; the canvas renderer is browser-only, same "thin enough to judge by hand" category as `src/dev/synthetic-image.ts`. |
| `test/play/curated.test.ts` (new) | Unit tests for the manifest (unique ids, valid dimensions) — not the canvas rendering. |
| `src/ui/PhotoPicker.tsx` (new) | Curated-grid tab + upload/drag-drop tab. Emits one chosen photo (curated id or `File`) up to `App.tsx`. Owns its own inline error state for a bad upload. |
| `src/ui/PhotoCrop.tsx` (new) | Aspect chips, pan/zoom/rotate gesture surface, live grid overlay, confirm → rasterizes and calls back with `{ source, seed }`. Owns the `rasterizeCrop` canvas helper locally (not in `photo.ts`, which stays DOM-free). |
| `src/ui/App.tsx` (modify) | Replace the unconditional `createSyntheticImage()` mount effect with a `picker → cropping → playing` state gate. Remove `createSyntheticImage` import from the product path (the file itself is untouched — `dev.html` still uses it). |
| `test/browser/board-page.ts` (modify) | `BoardPage.open()` drives the real picker → crop → confirm flow before `waitForCut()`, so it stays the single choke point every other spec depends on. |
| `test/browser/photo-picker.spec.ts` (new) | Curated pick → crop → play; upload via `setInputFiles` with an inline buffer; corrupt-file inline error path. |

No existing file other than `App.tsx` and `board-page.ts` changes.

---

## Interfaces (shared types across tasks)

These are defined once, in Task 1 and Task 2, and consumed verbatim by every later task. Copy them
exactly — a mismatch here is the most common way a multi-task plan breaks.

```ts
// src/play/photo.ts
export interface PhotoSize { width: number; height: number }
export interface Point { x: number; y: number }
export interface CropRect { x: number; y: number; width: number; height: number }
export type RotateSteps = 0 | 1 | 2 | 3;

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export function effectiveSize(photo: PhotoSize, rotateSteps: RotateSteps): PhotoSize;
export function baseCropSize(effective: PhotoSize, frameAspect: number): { width: number; height: number };
export function clampPan(
  photo: PhotoSize,
  frameAspect: number,
  rotateSteps: RotateSteps,
  zoom: number,
  pan: Point,
): Point;
export function computeCropRect(
  photo: PhotoSize,
  frameAspect: number,
  rotateSteps: RotateSteps,
  zoom: number,
  pan: Point,
): CropRect;
export function downscaleTarget(
  width: number,
  height: number,
  maxLongEdge?: number, // default 2560
): { width: number; height: number };
```

```ts
// src/play/curated.ts
export interface CuratedPhoto { id: string; name: string; width: number; height: number }
export const CURATED_PHOTOS: CuratedPhoto[];
export function curatedPhotoById(id: string): CuratedPhoto | undefined;
export async function renderCuratedPhoto(id: string): Promise<ImageBitmap>;
```

```ts
// src/ui/PhotoPicker.tsx
export type PhotoChoice =
  | { kind: 'curated'; id: string }
  | { kind: 'upload'; file: File };

export interface PhotoPickerProps {
  onPhotoChosen: (choice: PhotoChoice) => void;
}
export function PhotoPicker(props: PhotoPickerProps): React.ReactElement;
```

```ts
// src/ui/PhotoCrop.tsx
export interface PhotoCropResult { source: ImageBitmap; seed: number; puzzleId: string }
export interface PhotoCropProps {
  source: ImageBitmap; // the full-resolution decoded photo, pre-crop
  onConfirm: (result: PhotoCropResult) => void;
  onBack: () => void;
}
export function PhotoCrop(props: PhotoCropProps): React.ReactElement;
```

---

### Task 1: Crop geometry — `src/play/photo.ts`

**Files:**
- Create: `src/play/photo.ts`
- Test: `test/play/photo.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces: `PhotoSize`, `Point`, `CropRect`, `RotateSteps`, `MIN_ZOOM`, `MAX_ZOOM`,
  `effectiveSize`, `baseCropSize`, `clampPan`, `computeCropRect`, `downscaleTarget` — the exact
  signatures in the Interfaces section above. `PhotoCrop.tsx` (Task 4) and its tests are the
  consumers.

**Semantics, so the implementer isn't guessing:**

- `effectiveSize`: rotation swaps width/height at odd steps (90°/270°). `rotateSteps` counts
  quarter-turns clockwise.
- `baseCropSize`: the crop rectangle's size **at `zoom === MIN_ZOOM`** — the largest
  `frameAspect`-shaped rectangle that fits entirely inside the (rotated) photo. This is a
  "cover" fit: if the photo is wider than the frame's aspect, the crop height equals the photo's
  full height; otherwise the crop width equals the photo's full width.
- `zoom` scales that base size down: `cropWidth = base.width / zoom`, `cropHeight = base.height /
  zoom`. Higher zoom → smaller crop rect → more magnified. `zoom` is always in `[MIN_ZOOM,
  MAX_ZOOM]`; this module does not clamp `zoom` itself (the caller does, same as the board's
  camera clamps its own zoom) — only `pan` is clamped here, because pan's valid range depends on
  zoom.
- `pan` is the crop rectangle's center offset from the photo's center, in the rotated photo's
  pixel space. `clampPan` keeps the crop rect fully inside the photo bounds at the given zoom.
- `computeCropRect` returns the crop rectangle's top-left `(x, y)` and `(width, height)` in the
  rotated photo's pixel space, using the **clamped** pan internally (it must call `clampPan`
  itself, not trust the caller already did — a caller passing a stale unclamped pan must still get
  a valid rect back).
- `downscaleTarget` returns integer pixel dimensions. If the long edge is already `<= maxLongEdge`,
  return the (rounded) input unchanged — never upscale.

- [ ] **Step 1: Write the failing tests**

```ts
// test/play/photo.test.ts
import { describe, expect, it } from 'vitest';
import {
  baseCropSize,
  clampPan,
  computeCropRect,
  downscaleTarget,
  effectiveSize,
  MAX_ZOOM,
  MIN_ZOOM,
} from '@/play/photo';

describe('effectiveSize', () => {
  it('leaves size unchanged at 0 and 2 quarter-turns', () => {
    expect(effectiveSize({ width: 400, height: 300 }, 0)).toEqual({ width: 400, height: 300 });
    expect(effectiveSize({ width: 400, height: 300 }, 2)).toEqual({ width: 400, height: 300 });
  });

  it('swaps width and height at 1 and 3 quarter-turns', () => {
    expect(effectiveSize({ width: 400, height: 300 }, 1)).toEqual({ width: 300, height: 400 });
    expect(effectiveSize({ width: 400, height: 300 }, 3)).toEqual({ width: 300, height: 400 });
  });
});

describe('baseCropSize', () => {
  it('fits full height when the photo is wider than the frame aspect', () => {
    // 4:3 photo (1.333), 1:1 frame — height-limited.
    const base = baseCropSize({ width: 400, height: 300 }, 1);
    expect(base).toEqual({ width: 300, height: 300 });
  });

  it('fits full width when the photo is narrower than the frame aspect', () => {
    // 4:3 photo (1.333), 16:9 frame (1.778) — width-limited.
    const base = baseCropSize({ width: 400, height: 300 }, 16 / 9);
    expect(base.width).toBeCloseTo(400, 6);
    expect(base.height).toBeCloseTo(400 / (16 / 9), 6);
  });

  it('exactly reproduces the photo when the frame aspect matches it', () => {
    const base = baseCropSize({ width: 400, height: 300 }, 4 / 3);
    expect(base.width).toBeCloseTo(400, 6);
    expect(base.height).toBeCloseTo(300, 6);
  });
});

describe('clampPan', () => {
  it('leaves pan at (0,0) unchanged — always valid, centered', () => {
    const pan = clampPan({ width: 400, height: 300 }, 1, 0, MIN_ZOOM, { x: 0, y: 0 });
    expect(pan).toEqual({ x: 0, y: 0 });
  });

  it('clamps pan that would push the crop rect outside the photo', () => {
    // 1:1 frame on a 400x300 photo at MIN_ZOOM: base crop is 300x300, so pan.x
    // can range over +/-50 (400-300)/2 before the rect leaves the photo.
    const pan = clampPan({ width: 400, height: 300 }, 1, 0, MIN_ZOOM, { x: 1000, y: 0 });
    expect(pan.x).toBeCloseTo(50, 6);
    expect(pan.y).toBe(0);
  });

  it('shrinks the allowed pan range as zoom increases', () => {
    const panAtMinZoom = clampPan({ width: 400, height: 300 }, 1, 0, MIN_ZOOM, { x: 1000, y: 0 });
    const panAtMaxZoom = clampPan({ width: 400, height: 300 }, 1, 0, MAX_ZOOM, { x: 1000, y: 0 });
    expect(panAtMaxZoom.x).toBeGreaterThan(panAtMinZoom.x);
  });
});

describe('computeCropRect', () => {
  it('is centered on the photo at pan (0,0) and MIN_ZOOM', () => {
    const rect = computeCropRect({ width: 400, height: 300 }, 1, 0, MIN_ZOOM, { x: 0, y: 0 });
    expect(rect).toEqual({ x: 50, y: 0, width: 300, height: 300 });
  });

  it('shrinks toward the requested aspect as zoom increases, staying centered at pan 0', () => {
    const rect = computeCropRect({ width: 400, height: 300 }, 1, 0, 2, { x: 0, y: 0 });
    expect(rect.width).toBeCloseTo(150, 6);
    expect(rect.height).toBeCloseTo(150, 6);
    expect(rect.x).toBeCloseTo(125, 6);
    expect(rect.y).toBeCloseTo(75, 6);
  });

  it('accounts for a 90-degree rotation swapping the effective photo size', () => {
    // A 400x300 photo rotated 1 step is effectively 300x400. A 1:1 frame at
    // MIN_ZOOM should now be limited by the effective width (300), not by 300
    // coincidentally matching the unrotated height.
    const rect = computeCropRect({ width: 400, height: 300 }, 1, 1, MIN_ZOOM, { x: 0, y: 0 });
    expect(rect.width).toBeCloseTo(300, 6);
    expect(rect.height).toBeCloseTo(300, 6);
  });

  it('clamps an out-of-range pan rather than returning a rect outside the photo', () => {
    const rect = computeCropRect({ width: 400, height: 300 }, 1, 0, MIN_ZOOM, { x: 10_000, y: 0 });
    expect(rect.x + rect.width).toBeLessThanOrEqual(400 + 1e-6);
    expect(rect.x).toBeGreaterThanOrEqual(-1e-6);
  });
});

describe('downscaleTarget', () => {
  it('leaves dimensions unchanged when already under the max long edge', () => {
    expect(downscaleTarget(1200, 800)).toEqual({ width: 1200, height: 800 });
  });

  it('leaves dimensions unchanged exactly at the boundary', () => {
    expect(downscaleTarget(2560, 1440)).toEqual({ width: 2560, height: 1440 });
  });

  it('scales the long edge down to exactly maxLongEdge, preserving aspect', () => {
    const result = downscaleTarget(5120, 2880);
    expect(result.width).toBe(2560);
    expect(result.height).toBe(1440);
  });

  it('scales down a tall (portrait) image by its long edge, which is the height', () => {
    const result = downscaleTarget(2000, 6000);
    expect(result.height).toBe(2560);
    expect(result.width).toBeCloseTo((2000 * 2560) / 6000, 0);
  });

  it('never upscales', () => {
    const result = downscaleTarget(100, 80, 2560);
    expect(result).toEqual({ width: 100, height: 80 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/play/photo.test.ts`
Expected: FAIL — `Cannot find module '@/play/photo'` (the module doesn't exist yet).

- [ ] **Step 3: Implement `src/play/photo.ts`**

```ts
/**
 * Crop geometry for the photo-picker flow (step 5a).
 *
 * Pure and DOM-free, same standard as `src/cut/grid.ts` — no ImageBitmap, no
 * canvas. `PhotoCrop.tsx` owns turning these numbers into pixels; this module
 * only answers "where is the crop rectangle."
 */

export interface PhotoSize {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Quarter-turns clockwise. */
export type RotateSteps = 0 | 1 | 2 | 3;

/** Zoom 1 shows the largest crop the frame aspect allows — never less of the photo than that. */
export const MIN_ZOOM = 1;
/** Matches the board camera's own top end (CLAUDE.md "Hard numbers": zoom 0.5x-4x). */
export const MAX_ZOOM = 4;

/** The photo's size after applying `rotateSteps`, since 90/270 degree turns swap the axes. */
export function effectiveSize(photo: PhotoSize, rotateSteps: RotateSteps): PhotoSize {
  return rotateSteps % 2 === 0
    ? { width: photo.width, height: photo.height }
    : { width: photo.height, height: photo.width };
}

/**
 * The crop rectangle's size at `MIN_ZOOM` — the largest `frameAspect`-shaped
 * rectangle that fits entirely inside `effective` (a "cover" fit).
 */
export function baseCropSize(
  effective: PhotoSize,
  frameAspect: number,
): { width: number; height: number } {
  const photoAspect = effective.width / effective.height;
  if (photoAspect > frameAspect) {
    return { width: effective.height * frameAspect, height: effective.height };
  }
  return { width: effective.width, height: effective.width / frameAspect };
}

function cropSizeAt(
  photo: PhotoSize,
  frameAspect: number,
  rotateSteps: RotateSteps,
  zoom: number,
): { width: number; height: number } {
  const base = baseCropSize(effectiveSize(photo, rotateSteps), frameAspect);
  return { width: base.width / zoom, height: base.height / zoom };
}

/** Keeps the crop rectangle fully inside the (rotated) photo at the given zoom. */
export function clampPan(
  photo: PhotoSize,
  frameAspect: number,
  rotateSteps: RotateSteps,
  zoom: number,
  pan: Point,
): Point {
  const size = effectiveSize(photo, rotateSteps);
  const crop = cropSizeAt(photo, frameAspect, rotateSteps, zoom);
  const maxX = Math.max(0, (size.width - crop.width) / 2);
  const maxY = Math.max(0, (size.height - crop.height) / 2);
  return {
    x: Math.max(-maxX, Math.min(maxX, pan.x)),
    y: Math.max(-maxY, Math.min(maxY, pan.y)),
  };
}

/** The crop rectangle, in the rotated photo's pixel space, top-left + size. */
export function computeCropRect(
  photo: PhotoSize,
  frameAspect: number,
  rotateSteps: RotateSteps,
  zoom: number,
  pan: Point,
): CropRect {
  const size = effectiveSize(photo, rotateSteps);
  const crop = cropSizeAt(photo, frameAspect, rotateSteps, zoom);
  const clamped = clampPan(photo, frameAspect, rotateSteps, zoom, pan);
  return {
    x: size.width / 2 + clamped.x - crop.width / 2,
    y: size.height / 2 + clamped.y - crop.height / 2,
    width: crop.width,
    height: crop.height,
  };
}

/** CLAUDE.md "Hard numbers": source downscale, max 2560px long edge. Never upscales. */
export function downscaleTarget(
  width: number,
  height: number,
  maxLongEdge = 2560,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxLongEdge / longEdge;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/play/photo.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: clean.

```bash
git add src/play/photo.ts test/play/photo.test.ts
git commit -m "Step 5a: pure crop geometry for the photo picker"
```

---

### Task 2: Curated photo manifest — `src/play/curated.ts`

**Files:**
- Create: `src/play/curated.ts`
- Test: `test/play/curated.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `CuratedPhoto`, `CURATED_PHOTOS`, `curatedPhotoById`, `renderCuratedPhoto` (Task 3's
  `PhotoPicker.tsx` and Task 4's `App.tsx` wiring consume `CURATED_PHOTOS` and
  `renderCuratedPhoto`).

**Why procedural instead of real photo files:** no real licensed photo assets exist in this repo
or can be added sight-unseen by an implementer following a text plan. `renderCuratedPhoto` draws a
distinct, deterministic scene per id with `OffscreenCanvas` — same category of code as
`src/dev/synthetic-image.ts`, just styled as a picker choice instead of a cut-validation grid. This
satisfies "everything works signed out, forever" (§14) with zero network dependency. Swapping in
real bundled image files later is a drop-in replacement behind the same `CuratedPhoto` /
`renderCuratedPhoto` interface — nothing downstream needs to change.

- [ ] **Step 1: Write the failing tests**

```ts
// test/play/curated.test.ts
import { describe, expect, it } from 'vitest';
import { CURATED_PHOTOS, curatedPhotoById } from '@/play/curated';

describe('CURATED_PHOTOS', () => {
  it('has at least four entries', () => {
    expect(CURATED_PHOTOS.length).toBeGreaterThanOrEqual(4);
  });

  it('has unique ids', () => {
    const ids = CURATED_PHOTOS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every entry positive dimensions and a non-empty name', () => {
    for (const photo of CURATED_PHOTOS) {
      expect(photo.width).toBeGreaterThan(0);
      expect(photo.height).toBeGreaterThan(0);
      expect(photo.name.length).toBeGreaterThan(0);
    }
  });
});

describe('curatedPhotoById', () => {
  it('finds an entry that exists', () => {
    const first = CURATED_PHOTOS[0]!;
    expect(curatedPhotoById(first.id)).toEqual(first);
  });

  it('returns undefined for an id that does not exist', () => {
    expect(curatedPhotoById('not-a-real-id')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/play/curated.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/play/curated.ts`**

```ts
/**
 * The bundled curated-photo set for the picker (step 5a).
 *
 * Procedurally drawn rather than real image files — see the plan note in
 * docs/superpowers/plans/2026-08-01-step-5a-photo-picker-crop.md, Task 2, for
 * why. `CURATED_PHOTOS` and `curatedPhotoById` are pure and tested;
 * `renderCuratedPhoto` touches `OffscreenCanvas` and is judged by hand, same
 * as `src/dev/synthetic-image.ts`.
 */

export interface CuratedPhoto {
  id: string;
  name: string;
  width: number;
  height: number;
}

export const CURATED_PHOTOS: CuratedPhoto[] = [
  { id: 'aurora-ridge', name: 'Aurora Ridge', width: 2400, height: 1600 },
  { id: 'harbor-grid', name: 'Harbor Grid', width: 2400, height: 1600 },
  { id: 'canyon-light', name: 'Canyon Light', width: 1600, height: 2400 },
  { id: 'orchard-rows', name: 'Orchard Rows', width: 2400, height: 1800 },
  { id: 'tide-pools', name: 'Tide Pools', width: 2400, height: 1800 },
  { id: 'glacier-blue', name: 'Glacier Blue', width: 2000, height: 2000 },
];

export function curatedPhotoById(id: string): CuratedPhoto | undefined {
  return CURATED_PHOTOS.find((photo) => photo.id === id);
}

/** One deterministic scene per id, distinct enough to tell apart in a thumbnail grid. */
function drawScene(ctx: OffscreenCanvasRenderingContext2D, id: string, w: number, h: number): void {
  const palettes: Record<string, [string, string, string]> = {
    'aurora-ridge': ['#0b1d3a', '#1f6f6f', '#8fe3c7'],
    'harbor-grid': ['#0d1b2a', '#3d6b8c', '#e8c07d'],
    'canyon-light': ['#3a1d0b', '#a85c32', '#f2c879'],
    'orchard-rows': ['#12240f', '#3f6b2f', '#c7e08f'],
    'tide-pools': ['#001f2b', '#0f6b7a', '#bfe9e6'],
    'glacier-blue': ['#0a1f33', '#3c7fa8', '#dff3ff'],
  };
  const [a, b, c] = palettes[id] ?? ['#101418', '#3a4552', '#c8d2dc'];

  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, a);
  gradient.addColorStop(0.55, b);
  gradient.addColorStop(1, c);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  // A few soft bands so the "photo" has some internal structure for a cut
  // preview to look like it's cutting something, not a flat swatch.
  const bandCount = 5;
  for (let i = 0; i < bandCount; i++) {
    const y = (h / bandCount) * i + (h / bandCount) * 0.5;
    ctx.strokeStyle = `rgba(255,255,255,${0.05 + i * 0.02})`;
    ctx.lineWidth = h * 0.03;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(w * 0.33, y - h * 0.06, w * 0.66, y + h * 0.06, w, y);
    ctx.stroke();
  }
}

export async function renderCuratedPhoto(id: string): Promise<ImageBitmap> {
  const photo = curatedPhotoById(id);
  if (!photo) throw new Error(`renderCuratedPhoto: unknown curated photo id "${id}"`);

  const canvas = new OffscreenCanvas(photo.width, photo.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('renderCuratedPhoto: no 2d context');

  drawScene(ctx, id, photo.width, photo.height);
  return canvas.transferToImageBitmap();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/play/curated.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/play/curated.ts test/play/curated.test.ts
git commit -m "Step 5a: curated photo manifest and procedural renderer"
```

---

### Task 3: `src/ui/PhotoPicker.tsx`

**Files:**
- Create: `src/ui/PhotoPicker.tsx`

**Interfaces:**
- Consumes: `CURATED_PHOTOS` from `@/play/curated` (Task 2). `PhotoChoice`, `PhotoPickerProps`,
  `PhotoPicker` as declared in the plan's Interfaces section.
- Produces: `PhotoChoice`, `PhotoPickerProps`, `PhotoPicker` — consumed by Task 5 (`App.tsx`) and
  Task 7 (browser spec).

**Required accessibility hooks** (the browser spec and `BoardPage.open()` select on these — use
these exact strings):
- Each curated tile: `<button aria-label={`Curated photo: ${photo.name}`}>`.
- Tab buttons: `<button aria-label="Curated photos">` / `<button aria-label="Upload photo">`.
- File input: `<input type="file" accept="image/*" aria-label="Upload a photo">`.
- Confirm button once a curated photo is selected: `<button aria-label="Choose this photo">`.
- Inline error text, when present: `role="alert"`.

**Behavior:**
- Two tabs: `curated` (default) and `upload`.
- Curated tab: a responsive grid of `CURATED_PHOTOS`, each rendered as a `<button>` (not a `<div
  onClick>` — keyboard/AT reachable, and the 44pt floor from `theme.css` applies automatically).
  One is selected at a time; default selection is `CURATED_PHOTOS[0]`. Selection is shown by a
  border-weight/colour change **and** a checkmark glyph — never colour alone (Global Constraints).
  A primary "Choose this photo" button below the grid calls `onPhotoChosen({ kind: 'curated', id:
  selectedId })`.
- Upload tab: a dropzone `<div>` wrapping a hidden `<input type="file">`, plus native
  `onDragOver`/`onDrop` handlers. Both a picked file and a dropped file call `onPhotoChosen({
  kind: 'upload', file })` — this component does not decode the file itself, it only classifies
  the user's choice; decoding and error handling happen in `App.tsx` (Task 5), which is what
  needs to catch a bad `createImageBitmap` and show it back on this screen.
- Styling: Tailwind utility classes against the existing CSS custom properties, matching
  `HintButton.tsx`'s convention (`var(--edge-hair)`, `var(--mat-raised)`, `var(--ink-primary)`,
  `var(--accent)`) — do not introduce new colour tokens.

- [ ] **Step 1: Write the component**

```tsx
/**
 * Step 5a's photo picker — the first screen of the setup flow, replacing the
 * old hardcoded synthetic image.
 *
 * Ported in shape from `TesseraV3Figma/src/App.tsx`'s `NewPuzzleScreen` step
 * 1 (source toggle + curated grid + upload dropzone), restyled onto this
 * repo's real `theme.css` tokens instead of that prototype's inline `T`
 * object.
 */

import { useRef, useState } from 'react';
import { CURATED_PHOTOS } from '@/play/curated';

export type PhotoChoice = { kind: 'curated'; id: string } | { kind: 'upload'; file: File };

export interface PhotoPickerProps {
  onPhotoChosen: (choice: PhotoChoice) => void;
  /** Surfaced by `App.tsx` when a previously chosen upload failed to decode. */
  error?: string | null;
}

type Source = 'curated' | 'upload';

export function PhotoPicker({ onPhotoChosen, error }: PhotoPickerProps): React.ReactElement {
  const [source, setSource] = useState<Source>('curated');
  const [selectedId, setSelectedId] = useState<string>(CURATED_PHOTOS[0]!.id);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | undefined): void => {
    if (!file) return;
    onPhotoChosen({ kind: 'upload', file });
  };

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <div>
        <div className="font-[var(--font-display)] text-[28px] text-[var(--ink-primary)]">
          New Puzzle
        </div>
        <div className="mt-1 font-[var(--font-data)] text-[12px] text-[var(--ink-muted)]">
          Step 1 of 2 — Pick a photo
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          aria-label="Curated photos"
          aria-pressed={source === 'curated'}
          onClick={() => setSource('curated')}
          className={`flex-1 rounded-[var(--radius-md)] border px-0 py-2 font-[var(--font-data)] text-[12px] ${
            source === 'curated'
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-[var(--edge-hair)] text-[var(--ink-muted)]'
          }`}
        >
          Curated photos
        </button>
        <button
          type="button"
          aria-label="Upload photo"
          aria-pressed={source === 'upload'}
          onClick={() => setSource('upload')}
          className={`flex-1 rounded-[var(--radius-md)] border px-0 py-2 font-[var(--font-data)] text-[12px] ${
            source === 'upload'
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-[var(--edge-hair)] text-[var(--ink-muted)]'
          }`}
        >
          + Upload Photo
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-[var(--radius-sm)] border border-[var(--accent)] p-3 text-[13px] text-[var(--ink-primary)]">
          {error}
        </div>
      )}

      {source === 'curated' ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            {CURATED_PHOTOS.map((photo) => {
              const selected = photo.id === selectedId;
              return (
                <button
                  key={photo.id}
                  type="button"
                  aria-label={`Curated photo: ${photo.name}`}
                  aria-pressed={selected}
                  onClick={() => setSelectedId(photo.id)}
                  className={`overflow-hidden rounded-[var(--radius-md)] border-2 text-left ${
                    selected ? 'border-[var(--accent)]' : 'border-[var(--edge-hair)]'
                  }`}
                >
                  <div
                    className="flex aspect-[4/3] items-center justify-center text-[24px]"
                    style={{ background: 'var(--mat-raised)' }}
                  >
                    {selected ? '✓' : ''}
                  </div>
                  <div className="px-3 py-2" style={{ background: 'var(--mat-raised)' }}>
                    <div className="text-[13px] text-[var(--ink-primary)]">{photo.name}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            aria-label="Choose this photo"
            onClick={() => onPhotoChosen({ kind: 'curated', id: selectedId })}
            className="w-full rounded-[var(--radius-md)] bg-[var(--accent)] py-3 text-[15px] text-[var(--mat-void)]"
          >
            Choose this photo →
          </button>
        </>
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a photo here or tap to choose a file"
          onClick={() => fileInput.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFile(e.dataTransfer.files[0]);
          }}
          className={`flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border-2 border-dashed p-10 text-center ${
            dragOver ? 'border-[var(--accent)]' : 'border-[var(--edge-hair)]'
          }`}
        >
          <div className="font-[var(--font-data)] text-[12px] text-[var(--ink-muted)]">
            Tap to pick from your library
            <br />
            or drag a photo here
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            aria-label="Upload a photo"
            className="sr-only"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean. (No unit test for this task — it's a thin, hand-judged UI component per
`CLAUDE.md`'s testing posture; Task 7's browser spec is where it earns its coverage.)

- [ ] **Step 3: Commit**

```bash
git add src/ui/PhotoPicker.tsx
git commit -m "Step 5a: the photo picker screen — curated grid and upload dropzone"
```

---

### Task 4: `src/ui/PhotoCrop.tsx`

**Files:**
- Create: `src/ui/PhotoCrop.tsx`

**Interfaces:**
- Consumes: `effectiveSize`, `clampPan`, `computeCropRect`, `downscaleTarget`, `MIN_ZOOM`,
  `MAX_ZOOM`, `RotateSteps`, `Point` from `@/play/photo` (Task 1). `seedFromPuzzleId` from
  `@/core/rng`. `chooseGrid` from `@/cut/grid`.
- Produces: `PhotoCropResult`, `PhotoCropProps`, `PhotoCrop` — consumed by Task 5 and Task 7.

**Required accessibility hooks:**
- Aspect chips: `<button aria-label={`Aspect: ${label}`}>` for `Original`, `Square`, `4:3`,
  `16:9`.
- Rotate button: `<button aria-label="Rotate 90 degrees">`.
- Confirm button: `<button aria-label="Use this photo">`.
- Back button: `<button aria-label="Back to photo picker">`.

**Behavior:**
- Internal state: `frameAspect` (default: the source's own aspect, i.e. "Original"), `rotateSteps`
  (default 0), `zoom` (default `MIN_ZOOM`), `pan` (default `{x:0, y:0}`).
- Renders `props.source` into a `<canvas>` sized to fit the available space, drawn rotated by
  `rotateSteps * 90deg` via a CSS transform on an `<img>`/`<canvas>` layer (simplest correct
  approach — do the actual pixel rotation only at confirm time, in `rasterizeCrop`; the live
  preview can rotate the whole visual layer with `transform: rotate(...)`, which is cheap and
  exactly matches what the final crop will look like).
- A fixed-size frame overlay (a bordered `<div>` with `aspectRatio: frameAspect`) sits centered
  over the photo layer; pointer drag on the photo layer updates `pan` (each drag-delta pixel maps
  1:1 to a photo-pixel delta at the current on-screen scale — compute the on-screen-to-photo-pixel
  ratio from the rendered element's `getBoundingClientRect()` vs. `effectiveSize`), clamped via
  `clampPan` on every update. A zoom slider (`<input type="range">`, `min={MIN_ZOOM}`
  `max={MAX_ZOOM}` `step={0.01}`) updates `zoom`, re-clamping `pan` afterward (zooming in can make
  a previously valid pan invalid).
- Live grid overlay: `chooseGrid({ imageWidth: rect.width, imageHeight: rect.height, targetCount:
  150 })` where `rect = computeCropRect(...)`, drawn as `cols - 1` vertical and `rows - 1`
  horizontal lines inside the frame — purely illustrative.
- Confirm (`"Use this photo"`):
  1. Compute `rect = computeCropRect(source dimensions, frameAspect, rotateSteps, zoom, pan)`.
  2. Compute `target = downscaleTarget(rect.width, rect.height)`.
  3. Call the local `rasterizeCrop(source, rotateSteps, rect, target)` helper (below) to get the
     final `ImageBitmap`.
  4. Mint `const puzzleId = crypto.randomUUID();` and `const seed = seedFromPuzzleId(puzzleId);`.
  5. Call `onConfirm({ source: finalBitmap, seed, puzzleId })`.

```ts
// Local to PhotoCrop.tsx — canvas code, not part of photo.ts's pure surface.
function rasterizeCrop(
  source: ImageBitmap,
  rotateSteps: RotateSteps,
  rect: CropRect,
  target: { width: number; height: number },
): ImageBitmap {
  const size = effectiveSize({ width: source.width, height: source.height }, rotateSteps);

  const rotated = new OffscreenCanvas(size.width, size.height);
  const rctx = rotated.getContext('2d');
  if (!rctx) throw new Error('rasterizeCrop: no 2d context');
  rctx.save();
  rctx.translate(size.width / 2, size.height / 2);
  rctx.rotate((rotateSteps * Math.PI) / 2);
  rctx.drawImage(source, -source.width / 2, -source.height / 2);
  rctx.restore();

  const out = new OffscreenCanvas(target.width, target.height);
  const octx = out.getContext('2d');
  if (!octx) throw new Error('rasterizeCrop: no 2d context');
  octx.drawImage(rotated, rect.x, rect.y, rect.width, rect.height, 0, 0, target.width, target.height);
  return out.transferToImageBitmap();
}
```

- [ ] **Step 1: Write the component**

```tsx
/**
 * Step 5a's crop screen — the second half of the setup flow.
 *
 * No prototype to port here: `TesseraV3Figma`'s `NewPuzzleScreen` goes
 * straight from picking a photo to configuring piece count, with no crop
 * step at all. This screen is designed fresh, per
 * docs/superpowers/specs/2026-08-01-step-5a-photo-picker-crop-design.md.
 *
 * Rotation is 90-degree increments only — arbitrary-angle rotation would
 * fight the cutter's grid math (`src/cut/grid.ts` assumes an axis-aligned
 * rectangle) and isn't EXIF-safe.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { chooseGrid } from '@/cut/grid';
import { seedFromPuzzleId } from '@/core/rng';
import type { CropRect, Point, RotateSteps } from '@/play/photo';
import {
  clampPan,
  computeCropRect,
  downscaleTarget,
  effectiveSize,
  MAX_ZOOM,
  MIN_ZOOM,
} from '@/play/photo';

export interface PhotoCropResult {
  source: ImageBitmap;
  seed: number;
  puzzleId: string;
}

export interface PhotoCropProps {
  source: ImageBitmap;
  onConfirm: (result: PhotoCropResult) => void;
  onBack: () => void;
}

const ASPECTS: { label: string; value: number | 'original' }[] = [
  { label: 'Original', value: 'original' },
  { label: 'Square', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '16:9', value: 16 / 9 },
];

/** Purely illustrative — the real count is chosen on the setup screen, step 5b. */
const PREVIEW_TARGET_COUNT = 150;

function rasterizeCrop(
  source: ImageBitmap,
  rotateSteps: RotateSteps,
  rect: CropRect,
  target: { width: number; height: number },
): ImageBitmap {
  const size = effectiveSize({ width: source.width, height: source.height }, rotateSteps);

  const rotated = new OffscreenCanvas(size.width, size.height);
  const rctx = rotated.getContext('2d');
  if (!rctx) throw new Error('rasterizeCrop: no 2d context');
  rctx.save();
  rctx.translate(size.width / 2, size.height / 2);
  rctx.rotate((rotateSteps * Math.PI) / 2);
  rctx.drawImage(source, -source.width / 2, -source.height / 2);
  rctx.restore();

  const out = new OffscreenCanvas(target.width, target.height);
  const octx = out.getContext('2d');
  if (!octx) throw new Error('rasterizeCrop: no 2d context');
  octx.drawImage(
    rotated,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    target.width,
    target.height,
  );
  return out.transferToImageBitmap();
}

export function PhotoCrop({ source, onConfirm, onBack }: PhotoCropProps): React.ReactElement {
  const originalAspect = source.width / source.height;
  const [aspectChoice, setAspectChoice] = useState<number | 'original'>('original');
  const [rotateSteps, setRotateSteps] = useState<RotateSteps>(0);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const frameRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ pointerId: number; x: number; y: number; pan: Point } | null>(null);

  const frameAspect = aspectChoice === 'original' ? originalAspect : aspectChoice;

  // Zooming in can make a pan that was valid at a lower zoom fall outside the
  // photo — re-clamp whenever zoom or aspect changes, not only on drag.
  useEffect(() => {
    setPan((p) =>
      clampPan({ width: source.width, height: source.height }, frameAspect, rotateSteps, zoom, p),
    );
  }, [zoom, frameAspect, rotateSteps, source.width, source.height]);

  const rect = useMemo(
    () =>
      computeCropRect(
        { width: source.width, height: source.height },
        frameAspect,
        rotateSteps,
        zoom,
        pan,
      ),
    [source.width, source.height, frameAspect, rotateSteps, zoom, pan],
  );

  const grid = useMemo(() => {
    try {
      return chooseGrid({
        imageWidth: rect.width,
        imageHeight: rect.height,
        targetCount: PREVIEW_TARGET_COUNT,
      });
    } catch {
      // Extreme aspect ratios can fall outside chooseGrid's search window —
      // the overlay is illustrative, so skip it rather than block the crop.
      return null;
    }
  }, [rect.width, rect.height]);

  const onFramePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragStart.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, pan };
  };

  const onFramePointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const start = dragStart.current;
    const frameEl = frameRef.current;
    if (!start || start.pointerId !== e.pointerId || !frameEl) return;

    // Screen pixels -> photo pixels: the frame's on-screen width represents
    // `rect.width` photo pixels at the current zoom.
    const screenToPhoto = rect.width / frameEl.getBoundingClientRect().width;
    const dx = (e.clientX - start.x) * screenToPhoto;
    const dy = (e.clientY - start.y) * screenToPhoto;
    // Dragging the photo right moves the visible window left, hence the
    // negation — the same convention the board's camera pan uses.
    const next = clampPan(
      { width: source.width, height: source.height },
      frameAspect,
      rotateSteps,
      zoom,
      { x: start.pan.x - dx, y: start.pan.y - dy },
    );
    setPan(next);
  };

  const onFramePointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (dragStart.current?.pointerId === e.pointerId) dragStart.current = null;
  };

  const handleConfirm = (): void => {
    const target = downscaleTarget(rect.width, rect.height);
    const finalBitmap = rasterizeCrop(source, rotateSteps, rect, target);
    const puzzleId = crypto.randomUUID();
    const seed = seedFromPuzzleId(puzzleId);
    onConfirm({ source: finalBitmap, seed, puzzleId });
  };

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <div>
        <div className="font-[var(--font-display)] text-[28px] text-[var(--ink-primary)]">
          New Puzzle
        </div>
        <div className="mt-1 font-[var(--font-data)] text-[12px] text-[var(--ink-muted)]">
          Step 2 of 2 — Crop &amp; frame
        </div>
      </div>

      <div
        ref={frameRef}
        onPointerDown={onFramePointerDown}
        onPointerMove={onFramePointerMove}
        onPointerUp={onFramePointerUp}
        onPointerCancel={onFramePointerUp}
        className="relative touch-none overflow-hidden rounded-[var(--radius-md)] border border-[var(--edge-hair)]"
        style={{ aspectRatio: frameAspect, background: 'var(--mat-void)' }}
      >
        <canvas
          ref={(el) => {
            if (!el) return;
            el.width = source.width;
            el.height = source.height;
            const ctx = el.getContext('2d');
            ctx?.clearRect(0, 0, el.width, el.height);
            ctx?.drawImage(source, 0, 0);
          }}
          className="absolute left-1/2 top-1/2 max-w-none"
          style={{
            width: `${(source.width / rect.width) * 100}%`,
            transform: `translate(-50%, -50%) rotate(${rotateSteps * 90}deg)`,
          }}
        />
        {grid && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
            {Array.from({ length: grid.cols - 1 }, (_, i) => (
              <line
                key={`v${i}`}
                x1={`${((i + 1) / grid.cols) * 100}%`}
                y1="0"
                x2={`${((i + 1) / grid.cols) * 100}%`}
                y2="100%"
                stroke="rgba(255,255,255,0.35)"
                strokeWidth={1}
              />
            ))}
            {Array.from({ length: grid.rows - 1 }, (_, i) => (
              <line
                key={`h${i}`}
                x1="0"
                y1={`${((i + 1) / grid.rows) * 100}%`}
                x2="100%"
                y2={`${((i + 1) / grid.rows) * 100}%`}
                stroke="rgba(255,255,255,0.35)"
                strokeWidth={1}
              />
            ))}
          </svg>
        )}
      </div>

      <div className="flex gap-2">
        {ASPECTS.map(({ label, value }) => (
          <button
            key={label}
            type="button"
            aria-label={`Aspect: ${label}`}
            aria-pressed={aspectChoice === value}
            onClick={() => setAspectChoice(value)}
            className={`flex-1 rounded-[var(--radius-sm)] border py-2 font-[var(--font-data)] text-[11px] ${
              aspectChoice === value
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-[var(--edge-hair)] text-[var(--ink-muted)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <input
        type="range"
        aria-label="Zoom"
        min={MIN_ZOOM}
        max={MAX_ZOOM}
        step={0.01}
        value={zoom}
        onChange={(e) => setZoom(Number(e.target.value))}
      />

      <button
        type="button"
        aria-label="Rotate 90 degrees"
        onClick={() => setRotateSteps((r) => (((r + 1) % 4) as RotateSteps))}
        className="rounded-[var(--radius-sm)] border border-[var(--edge-hair)] py-2 text-[13px] text-[var(--ink-primary)]"
      >
        Rotate
      </button>

      <div className="flex gap-3">
        <button
          type="button"
          aria-label="Back to photo picker"
          onClick={onBack}
          className="rounded-[var(--radius-md)] border border-[var(--edge-hair)] px-4 py-3 text-[15px] text-[var(--ink-muted)]"
        >
          ← Back
        </button>
        <button
          type="button"
          aria-label="Use this photo"
          onClick={handleConfirm}
          className="flex-1 rounded-[var(--radius-md)] bg-[var(--accent)] py-3 text-[15px] text-[var(--mat-void)]"
        >
          Use this photo
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/ui/PhotoCrop.tsx
git commit -m "Step 5a: the crop screen — pan/zoom/rotate with a live grid preview"
```

---

### Task 5: Wire the flow into `src/ui/App.tsx`

**Files:**
- Modify: `src/ui/App.tsx:1-135` (imports, constants, and the mount effect described in the
  Context section below)

**Interfaces:**
- Consumes: `PhotoPicker`/`PhotoChoice` (Task 3), `PhotoCrop`/`PhotoCropResult` (Task 4),
  `renderCuratedPhoto` (Task 2).
- Produces: nothing new for later tasks — this is the integration point.

**Context (current code, from the earlier read of this file):**

```tsx
import { createSyntheticImage } from '@/dev/synthetic-image';
// ...
const SEED = 1;
const TARGET_COUNT = 200;

export function App(): React.ReactElement {
  // ...
  useEffect(() => {
    const container = boardRef.current;
    if (!container) return;

    let live = true;
    let instance: PlayRuntime | null = null;

    void (async () => {
      const source = await createSyntheticImage();
      if (!live) return;

      instance = new PlayRuntime({
        container,
        source,
        seed: SEED,
        targetCount: TARGET_COUNT,
        // ...
      });

      runtime.current = instance;
      updateInsets();
      void instance.start();
    })();

    return () => {
      live = false;
      instance?.destroy();
      runtime.current = null;
    };
  }, []);

  // ... renders the board/tray JSX unconditionally below
}
```

**Changes:**

1. Remove the `createSyntheticImage` import. `TARGET_COUNT` stays (rename its comment — it's now
   the step-5b placeholder, not "step 5 brings the picker" since step 5a *is* that picker); `SEED`
   is removed, replaced by the seed the crop screen produces.
2. Add imports:
   ```ts
   import { PhotoPicker } from './PhotoPicker';
   import type { PhotoChoice } from './PhotoPicker';
   import { PhotoCrop } from './PhotoCrop';
   import type { PhotoCropResult } from './PhotoCrop';
   import { renderCuratedPhoto } from '@/play/curated';
   ```
3. Add state, before the existing `runtime`/`summary` state:
   ```ts
   type SetupPhase =
     | { kind: 'picker'; error: string | null }
     | { kind: 'cropping'; source: ImageBitmap };

   const [setupPhase, setSetupPhase] = useState<SetupPhase>({ kind: 'picker', error: null });
   const [playConfig, setPlayConfig] = useState<{ source: ImageBitmap; seed: number } | null>(null);
   ```
4. Add a handler, defined before the mount effect:
   ```ts
   const handlePhotoChosen = useCallback(async (choice: PhotoChoice): Promise<void> => {
     try {
       const bitmap =
         choice.kind === 'curated'
           ? await renderCuratedPhoto(choice.id)
           : await createImageBitmap(choice.file);
       setSetupPhase({ kind: 'cropping', source: bitmap });
     } catch {
       setSetupPhase({
         kind: 'picker',
         error: "Couldn't open that photo. Try a different file.",
       });
     }
   }, []);

   const handleCropConfirm = useCallback((result: PhotoCropResult): void => {
     setPlayConfig({ source: result.source, seed: result.seed });
   }, []);
   ```
5. Change the mount effect's guard and dependency array so it only runs once `playConfig` exists,
   and rebuilds if it ever changes (it won't change again within this sub-step's scope, but the
   dependency must be honest about what the effect reads):
   ```tsx
   useEffect(() => {
     const container = boardRef.current;
     if (!container || !playConfig) return;

     let live = true;
     let instance: PlayRuntime | null = null;

     instance = new PlayRuntime({
       container,
       source: playConfig.source,
       seed: playConfig.seed,
       targetCount: TARGET_COUNT,
       isOverTray: (client) => overTray.current(client),
       isOverShelf: (client) => overShelf.current(client),
       onDragStateChange: (isDragging) => {
         const store = useChrome.getState();
         if (isDragging) store.collapseForDrag();
         else store.restoreAfterDrag();
         setDragging(isDragging);
       },
       notify: setSummary,
     });

     runtime.current = instance;
     updateInsets();
     void instance.start();

     return () => {
       live = false;
       instance?.destroy();
       runtime.current = null;
     };
     // eslint-disable-next-line react-hooks/exhaustive-deps -- `updateInsets`
     // is called for its side effect on the runtime it just created, not
     // watched for change here; see the original comment this replaces.
   }, [playConfig]);
   ```
   Note this drops the `async`/`await createSyntheticImage()` — `PlayRuntime` can now be
   constructed synchronously inside the effect, since decoding already happened during the crop
   step. `live` is now unused inside the effect body (nothing async left to guard) — remove it
   too, along with the comment block above the effect that referenced "the microtask queue" /
   "step 5's real photo picker introduces a genuine `await`", since that await now lives in
   `handlePhotoChosen`, not here. Leave `updateInsets()` called eagerly right after
   `runtime.current = instance` exactly as today — the handoff note in `handoff.md` §4 says this
   ordering is load-bearing.
6. Gate the render. Find where this component currently returns its board/tray JSX
   unconditionally, and wrap it:
   ```tsx
   if (!playConfig) {
     return setupPhase.kind === 'picker' ? (
       <PhotoPicker onPhotoChosen={handlePhotoChosen} error={setupPhase.error} />
     ) : (
       <PhotoCrop
         source={setupPhase.source}
         onConfirm={handleCropConfirm}
         onBack={() => setSetupPhase({ kind: 'picker', error: null })}
       />
     );
   }

   // ...existing board/tray JSX, unchanged...
   ```

- [ ] **Step 1: Make the edits above**

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Run the existing unit suite**

Run: `npm test`
Expected: PASS, unchanged (nothing in `test/**/*.test.ts` touches `App.tsx`).

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev`, open the printed URL, confirm: the picker screen shows instead of an immediate
board; choosing a curated photo goes to the crop screen; the grid overlay lines are visible over
the frame; dragging pans, the zoom slider zooms, rotate spins the preview in 90° steps; "Use this
photo" transitions to the real board with pieces cut from the chosen crop.

- [ ] **Step 5: Commit**

```bash
git add src/ui/App.tsx
git commit -m "Step 5a: gate the board mount behind the real picker and crop flow"
```

---

### Task 6: Update `test/browser/board-page.ts`'s `open()`

**Files:**
- Modify: `test/browser/board-page.ts:64-69` (the `static async open` method)

**Interfaces:**
- Consumes: the `aria-label` strings from Task 3 (`"Choose this photo"`) and Task 4
  (`"Use this photo"`).
- Produces: `BoardPage.open()`'s existing signature is unchanged — every other spec file keeps
  calling it exactly as before.

**Context (current code):**

```ts
static async open(page: Page): Promise<BoardPage> {
  const board = new BoardPage(page);
  await page.goto('/', { waitUntil: 'load' });
  await board.waitForCut();
  return board;
}
```

- [ ] **Step 1: Update `open()` to drive the real flow**

```ts
static async open(page: Page): Promise<BoardPage> {
  const board = new BoardPage(page);
  await page.goto('/', { waitUntil: 'load' });
  await page.getByRole('button', { name: 'Choose this photo' }).click();
  await page.getByRole('button', { name: 'Use this photo' }).click();
  await board.waitForCut();
  return board;
}
```

The picker defaults to the curated tab with its first photo already selected (Task 3's
`selectedId` default), so no photo-selection click is needed before "Choose this photo" — it's
already clickable. Likewise the crop screen's defaults (`Original` aspect, `MIN_ZOOM`, centered
pan, no rotation) are already a valid crop, so "Use this photo" is immediately clickable too.

- [ ] **Step 2: Run the full browser suite**

Run: `npm run test:browser`
Expected: PASS at the same count as the branch's established baseline (58 passed / 4 skipped per
`handoff.md` §1d) — every spec that calls `BoardPage.open()` now goes through the real picker/crop
screens first, but the board they land on is otherwise identical to before (the curated photo's
procedural scene, not the old synthetic grid — if any spec asserts on the synthetic image's
specific pixel content rather than piece *count*/*position*, it will need a look; none should,
since piece geometry comes from `chooseGrid`/the cutter, not from the source image's pixels).

- [ ] **Step 3: Commit**

```bash
git add test/browser/board-page.ts
git commit -m "Step 5a: BoardPage.open() drives the real picker/crop flow"
```

---

### Task 7: New browser spec — `test/browser/photo-picker.spec.ts`

**Files:**
- Create: `test/browser/photo-picker.spec.ts`

**Interfaces:**
- Consumes: `PhotoPicker`'s and `PhotoCrop`'s `aria-label`s from Tasks 3 and 4;
  `BoardPage`'s `waitForCut()` from Task 6.

- [ ] **Step 1: Write the spec**

```ts
import { expect, test } from '@playwright/test';
import { BoardPage } from './board-page';

// A minimal valid 2x2 red PNG, inlined so the spec has no on-disk fixture to
// go stale or need licensing — `page.setInputFiles` accepts a buffer directly.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mNk+M9QDwAChAGA' +
  'CFYIRQAAAABJRU5ErkJggg==';

test.describe('photo picker and crop', () => {
  test('choosing a curated photo and confirming the default crop reaches a playable board', async ({
    page,
  }) => {
    const board = await BoardPage.open(page);
    await expect(board.chips.first()).toBeVisible();
  });

  test('uploading a photo skips the curated grid and reaches the crop screen', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Upload photo' }).click();

    const input = page.getByLabel('Upload a photo');
    await input.setInputFiles({
      name: 'sample.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG_BASE64, 'base64'),
    });

    await expect(page.getByRole('button', { name: 'Use this photo' })).toBeVisible();
    await page.getByRole('button', { name: 'Use this photo' }).click();

    const board = new BoardPage(page);
    await board.waitForCut();
    await expect(board.chips.first()).toBeVisible();
  });

  test('a corrupt upload shows an inline error and stays on the picker', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Upload photo' }).click();

    const input = page.getByLabel('Upload a photo');
    await input.setInputFiles({
      name: 'not-a-photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from('this is not image data'),
    });

    await expect(page.getByRole('alert')).toBeVisible();
    // Still on the picker, not stuck on a blank screen or a dead crop step.
    await expect(page.getByRole('button', { name: 'Curated photos' })).toBeVisible();
  });

  test('rotate cycles in 90-degree steps without breaking the crop', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.getByRole('button', { name: 'Choose this photo' }).click();

    const rotate = page.getByRole('button', { name: 'Rotate 90 degrees' });
    await rotate.click();
    await rotate.click();
    await rotate.click();
    await rotate.click(); // back to 0 degrees

    await page.getByRole('button', { name: 'Use this photo' }).click();
    const board = new BoardPage(page);
    await board.waitForCut();
    await expect(board.chips.first()).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the new spec**

Run: `npx playwright test test/browser/photo-picker.spec.ts`
Expected: PASS, all four cases, on both the `dock` and `phone` projects configured in
`playwright.config.ts`.

- [ ] **Step 3: Commit**

```bash
git add test/browser/photo-picker.spec.ts
git commit -m "Step 5a: browser coverage for the picker, upload, error, and rotate paths"
```

---

### Task 8: Full gate, handoff notes, and PR

**Files:**
- Modify: `handoff.md` (append a new dated section, following its existing convention of appending
  rather than rewriting)

- [ ] **Step 1: Run the complete gate**

```bash
npm test
npm run typecheck
npm run build
npm run test:browser
```

Expected: all four green.

- [ ] **Step 2: Real-device check**

Per `CLAUDE.md`'s testing posture, test the picker and crop screens on an iPad and/or iPhone over
`npm run dev`'s host-exposed server: upload from the device's photo library, drag-and-drop is
desktop-only so skip it there, confirm the pan/zoom gesture feels correct with a finger (not just a
mouse), confirm the 44pt touch floor is comfortable on the aspect chips and rotate button.

- [ ] **Step 3: Append to `handoff.md`**

Add a new top-level section (after the existing step-4 sections, before "What's next"), following
the file's established voice — what landed, what design calls were made and why, what's still
open. At minimum record:
- Curated photos are procedurally generated placeholders (Task 2's rationale), not real bundled
  images — flag this explicitly as a thing to revisit with real licensed assets before shipping.
- EXIF orientation and HEIC handling remain open (unchanged from before this sub-step — they were
  already tracked in PLAN.md's Step 1 checklist, not newly deferred here).
- `TARGET_COUNT`, mode, and rotation-in-play are still hardcoded pending step 5b.
- Any real-device findings from Step 2 above, in the same style as the step-3b real-hardware
  section (§1 of the current `handoff.md`).

- [ ] **Step 4: Commit the handoff update**

```bash
git add handoff.md
git commit -m "Step 5a: handoff notes"
```

- [ ] **Step 5: Open the PR**

Push the branch and open a PR against `main`, summarizing the picker/crop flow and linking the spec
at `docs/superpowers/specs/2026-08-01-step-5a-photo-picker-crop-design.md`. Follow this
repository's existing PR description conventions (see recent merged PRs, e.g. #5).
