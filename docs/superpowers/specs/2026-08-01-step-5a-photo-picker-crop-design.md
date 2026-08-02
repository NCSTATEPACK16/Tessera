# Step 5a — Photo picker & crop

**Status:** approved, pending implementation plan
**Depends on:** step 4 (merged). Precedes step 5b (puzzle setup screen: count/mode/rotation),
which this sub-step deliberately does not build.

## Why this is a separate sub-step

PLAN.md's step 5 bundles photo import/crop, puzzle setup, library, pause sheet, and the full save
format into one entry. Steps 3 and 4 were both split into lettered sub-steps with their own
spec/plan/PR; step 5 is larger than either, so the same split applies. This sub-step is the first
slice: it is the smallest piece that replaces the dev harness's hardcoded synthetic image with a
real photo end to end, without requiring the setup screen, library, or persistence to exist yet.

## Scope

Replace `src/ui/App.tsx`'s unconditional `createSyntheticImage()` call with a real pre-play flow:

1. **Pick a photo** — a bundled curated image, or an uploaded/dragged-in file.
2. **Crop & frame** — aspect selector, pan/zoom under a fixed frame, 90°-increment rotate, a live
   grid overlay (visual only, not the real cut).
3. Confirming produces a cropped, downscaled `ImageBitmap`, a freshly minted puzzle id, and a seed
   derived from it — then mounts `PlayRuntime` exactly as today.

Piece count, mode, and rotation-in-play stay at their current hardcoded defaults
(`SEED`/`TARGET_COUNT` today, becoming the crop flow's own minted seed but still the same hardcoded
`TARGET_COUNT`, `mode: 'classic'`, no piece-rotation toggle). Choosing those is step 5b's job.

### Explicitly out of scope

- Piece-count / mode / rotation-toggle UI (puzzle setup screen — step 5b).
- Library screen, pause sheet, save/resume, "puzzle this again, harder" (later step-5 sub-steps).
- EXIF orientation correction and HEIC-from-iOS-picker handling. Both are still-open items under
  PLAN.md's Step 1 (the cutter), unowned by this pass. This sub-step's only obligation here is to
  fail visibly (an inline picker error) if `createImageBitmap` rejects outright, not to fix
  orientation or convert formats.
- Networked/stock photo catalogs beyond the bundled curated set — no backend exists yet and §14
  requires everything to work signed out, forever.

## Reference asset

`TesseraV3Figma/src/App.tsx`'s `NewPuzzleScreen` (step 1: source toggle + curated grid + upload
dropzone) is the layout starting point, ported onto this repo's real `theme.css` §13 tokens
(`--color-ink-primary`, `--color-edge-hair`, `--color-mat-raised`, etc.) instead of its inline `T`
object. Its crop/frame step does not exist in the prototype — it stops at "pick a photo" and goes
straight to a configure screen — so `PhotoCrop.tsx` has no prototype to port and is designed fresh
here.

## Architecture

### New pure module — `src/play/photo.ts`

DOM-free, unit-tested the way `src/cut/grid.ts` is. No canvas, no `Image`/`File` objects — takes
and returns plain numbers/rects so it's testable in vitest's node environment.

- `computeCropRect(photo: {width, height}, frameAspect: number, pan: Point, zoom: number, rotateSteps: 0|1|2|3): CropRect`
  — the source-image pixel rect the frame currently shows, accounting for the 90°-multiple rotation
  (which swaps width/height at odd steps).
- `clampPan(photo, frameAspect, zoom, pan): Point` — keeps the frame fully covered by the photo at
  the current zoom; called on every pan/zoom update so the frame can never show empty space.
- `downscaleTarget(width: number, height: number, maxLongEdge = 2560): {width, height}` — enforces
  the CLAUDE.md invariant "Source downscale: max 2560px long edge." This was moot before now
  because only the synthetic dev image was ever cut; this sub-step is the first real enforcement
  point.

### `src/ui/PhotoPicker.tsx`

Two tabs, matching the prototype's shape:

- **Curated** — a grid of thumbnails from a small bundled manifest, e.g.
  `src/assets/curated/manifest.ts` exporting `{ id, file, name }[]`, with the actual image files
  under `src/assets/curated/`. Imported through Vite's normal asset pipeline. No network calls, no
  Unsplash hotlinking — matches "everything works signed out, forever" (§14) and keeps this screen
  functional offline.
- **Upload** — a dropzone (`<input type="file" accept="image/*">` plus native drag-and-drop
  handlers) matching the prototype's copy ("Tap to pick from your library or drag a photo here").
  On a bad/corrupt file, shows an inline error in the same panel rather than a console-only failure
  or a dead end.

Both paths converge on one callback, `onPhotoChosen(photo: File | CuratedPhoto)`, handed up to
whatever owns the flow state.

### `src/ui/PhotoCrop.tsx`

- **Aspect selector** — chips: Original / Square / 4:3 / 16:9. Selecting one sets `frameAspect`.
- **Frame + gesture surface** — the source image decoded once via `createImageBitmap`, drawn into a
  canvas (or an `<img>` with CSS transforms — decided during planning, whichever is simpler to test
  and keeps this screen's code on the "thin enough to judge by hand" side of the line, same
  standard as `renderer.ts`). Drag pans, pinch/wheel zooms; every gesture update runs through
  `clampPan` before being applied. This is a from-scratch gesture handler scoped to this screen —
  reusing `input/pointer.ts` is not assumed, since that machine is specialised for board drag/camera
  semantics that don't map cleanly onto a single-image crop frame; the planning pass should confirm
  whether any part of it is worth sharing.
- **Rotate** — a button cycling `rotateSteps` in 90° increments only. No arbitrary-angle rotation:
  it would fight the cutter's grid math and isn't EXIF-safe.
- **Live grid overlay** — calls the existing pure `chooseGrid()` (`src/cut/grid.ts`) with a fixed
  default target count (150) and the frame's current aspect, and draws its `cols × rows` as
  overlay lines. Purely illustrative — "roughly what this will look like cut" — not the real cut,
  since the real count is chosen on step 5b's screen, later.
- **Confirm ("Use this photo")** — rasterizes the current crop into an offscreen canvas at
  `downscaleTarget`'s size, `createImageBitmap`s the result, mints a new puzzle id, derives the seed
  via the existing `seedFromPuzzleId(puzzleId)` (`src/core/rng.ts`) rather than inventing a second
  seeding scheme, and hands `{ source, seed }` up.

### `src/ui/App.tsx`

Gains a small state gate — `'picker' | 'cropping' | 'playing'` — replacing the current
unconditional mount effect. The existing `useEffect` that builds `PlayRuntime` moves behind this
gate and receives the crop step's `{ source, seed }` instead of calling `createSyntheticImage()`
directly. `src/dev/synthetic-image.ts` and its only remaining caller, `dev.html`'s harness, are
untouched — `createSyntheticImage` is removed from the product path (`App.tsx`), not deleted.

`TARGET_COUNT`, the hardcoded mode, and rotation-in-play stay as named constants in `App.tsx`,
clearly flagged as placeholders for step 5b rather than silently permanent.

## Data flow

```
PhotoPicker.onPhotoChosen(File | CuratedPhoto)
  → PhotoCrop (decodes via createImageBitmap; pan/zoom/rotate state; photo.ts for the math)
      → confirm: rasterize → createImageBitmap → mint puzzleId → seedFromPuzzleId
          → App: { source, seed } → PlayRuntime (targetCount/mode/rotation = current defaults)
```

## Error handling

- `createImageBitmap` rejects on a bad file → `PhotoPicker` shows an inline error, stays on the
  picker screen. No dead end, no silent console-only failure.
- Curated tab has no network dependency, so no offline error path is needed there.
- Nothing in this flow can leave `App.tsx` in a state with no runtime and no visible UI — the state
  gate always renders exactly one of picker, crop, or the board.

## Testing

- `test/play/photo.test.ts` (vitest) — `computeCropRect`, `clampPan`, `downscaleTarget`. Same
  rigor as `test/cut/grid.test.ts`: exact numbers, rotation-step edge cases (width/height swap),
  and a case at each of the 2560px boundary's above/below/exactly-at conditions.
- `test/browser/photo-picker.spec.ts` (new, playwright) — choosing a curated photo and confirming a
  default crop reaches a playable board; the upload path via `page.setInputFiles` with a fixture
  image; the inline error path via a corrupt/non-image fixture file.
- **`BoardPage.open()` update is load-bearing for the rest of the suite.** It is the single
  `page.goto('/')` choke point (`test/browser/board-page.ts`) that every other browser spec calls
  through. It must be updated to drive the real flow — pick the first curated photo, confirm the
  default crop — before `waitForCut()`, so the ~60 existing specs keep passing unchanged while
  still exercising the real picker/crop screens rather than bypassing them with a hidden test-only
  shortcut. `invariants.spec.ts`'s `dev.html` case is unaffected, since it doesn't go through
  `BoardPage.open()`.

## Gate

Same exit bar as every prior step: `npm test`, `npm run typecheck`, `npm run build`, and
`npm run test:browser` all green, plus a real-device check per `CLAUDE.md`'s testing posture
(the picker/crop gesture surface is new touch-input code that unit tests cannot judge).
