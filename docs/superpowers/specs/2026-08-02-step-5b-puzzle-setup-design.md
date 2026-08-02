# Step 5b — Puzzle setup screen

**Status:** approved, pending implementation plan
**Depends on:** step 5a (merged) — `PhotoCrop.onConfirm` currently hands `{ source, seed, puzzleId }`
straight to `PlayRuntime`. Precedes step 5c+ (library, pause sheet, save/resume, "puzzle this
again, harder" — PLAN.md's remaining Step 5 bullets, not built here).

## Why this is a separate sub-step

PLAN.md's Step 5 bundles photo import/crop (5a, done), puzzle setup, library, pause sheet, and the
full save format into one entry. Steps 3, 4, and 5a were all split into lettered sub-steps with
their own spec/plan/PR; the remainder of Step 5 is still too large for one plan. This sub-step is
the next slice: the smallest piece that lets a player choose piece count, mode, rotation, and
assists before the cut starts, instead of playing every puzzle at a hardcoded 200-piece Classic
default.

## Scope

Insert a `configuring` phase between crop-confirm and play. Replace `App.tsx`'s hardcoded
`TARGET_COUNT = 200`, `mode: 'classic'`, and default `difficulty`/`rotation` with real values
chosen on a new screen, then wire those values — plus four assists — through to `PlayRuntime`.

1. **Count ladder** — 50 / 100 / 150 / 200 / 250, each shown next to a piece-shaped swatch
   rendered at its actual on-screen size for this device and this cropped photo. Never just a
   number (PLAN.md: "'250' means nothing, a piece next to a thumb does").
2. **Mode select** — Classic / Zen. (Daily is its own hub, step 6 — not reachable from this
   generic "new puzzle" flow.)
3. **Rotation toggle** — default off.
4. **Assists** — four controls, detailed below. All default to off/neutral.
5. Confirming ("Start Cutting") builds a `PuzzleConfig` and mounts `PlayRuntime` with every field
   populated for real, replacing today's hardcoded constants.

Cutting progress is **already built** — `TopBar` shows `"Cutting {done} of {total}"` live from
`RuntimeSummary.cut`, fed by `cut-client.ts`'s progressive `onPieces` callback. This sub-step does
not touch it.

### The four assists

Named in PLAN.md's Step 4 "Assists" bullet without behavior specs; each is pinned down here since
an undefined assist can't be built or tested.

- **Snap tolerance selector** — Precise / Standard / Generous. Zero new engine work: `difficulty:
  SnapDifficulty` is already a `PlaySession`/`PlayRuntimeOptions` field, consumed by
  `resolveSnap`'s `SNAP_TOLERANCE` lookup. This control is UI-only.
- **Ghost underlay (0–30%)** — a dimmed full copy of the source photo, composited into the mat
  layer beneath every piece, at a slider-controlled opacity. Off (0%) by default.
- **Edge highlight** — every loose and placed piece's cut-edge silhouette is stroked more crisply,
  making tab/socket shapes easier to read for matching. (Not to be confused with the existing
  corner-notch glyph that marks border/frame pieces in the tray — unrelated, untouched.)
- **Large-piece mode** — raises the camera's minimum relative zoom from today's 0.5× floor to
  **1.5×**, so pieces never render smaller than that regardless of piece count. 1.5× is not an
  arbitrary choice: it's the existing threshold that unlocks the Region lens (`REGION_LENS_ZOOM` in
  `render/camera.ts`), so large-piece-mode players get Region lens available from the
  start as a natural side effect.

### Explicitly out of scope

- Library screen, pause sheet, save/resume, "puzzle this again, harder" (later Step 5 sub-steps).
- A general settings sheet. Assists live only on this setup screen for now — there is nowhere else
  to reach them from yet (no pause sheet), matching the constraint recorded in step 4c's handoff.
- EXIF orientation and HEIC upload handling (still-open Step 1 items, unowned by this pass).
- Daily/Duo mode selection (Daily is step 6's own hub).

## Reference asset

`TesseraV3Figma/src/App.tsx`'s `NewPuzzleScreen` step 2 (the "Configure" half, after its own photo
picker) is the layout starting point for count ladder, mode select, and the rotation toggle —
ported onto this repo's real `theme.css` tokens, same convention step 5a used for step 1 of that
same prototype component. The prototype's step 2 has no actual-size piece preview (it prints a
ratio string) and no assists section beyond a bare rotation toggle — both are designed fresh here,
against PLAN.md's and the design doc's explicit requirements rather than the prototype's mockup.

## Architecture

### New pure module — `src/play/setup.ts`

DOM-free, unit-tested the way `src/play/photo.ts` and `src/cut/grid.ts` are.

- `PIECE_COUNT_LADDER: readonly [50, 100, 150, 200, 250]`.
- `pieceScreenSize(photo: {width, height}, targetCount: number, viewport: {width, height}): number`
  — the real on-screen CSS pixel width one piece would render at, for this device, this photo, and
  this candidate count. Computes `chooseGrid({imageWidth, imageHeight, targetCount})` for real
  `cols`/`rows`, derives `boardW`/`boardH` in world units the same way `cutter.ts` does
  (`imageWidth / cellW`, `imageHeight / cellW` — world unit is one piece width, per CLAUDE.md's
  coordinate-space table), then returns `fitScale(viewport, boardW, boardH)` from `render/camera.ts`
  (piece width is exactly 1 world unit, so the fit scale *is* the piece's screen pixel width).
- `clampGhostOpacity(value: number): number` — clamps to `[0, 0.3]`, the assist's documented range.
- `PuzzleConfig` interface — aggregates everything this screen produces: `targetCount, mode,
  rotation, difficulty, assists: { ghostOpacity, edgeHighlight, largePieceMode }`.

### `src/ui/PuzzleSetup.tsx`

New screen, styled like `PhotoPicker.tsx`/`PhotoCrop.tsx` (existing `theme.css` tokens, real
`<button>`s, 44pt floor inherited automatically).

- A small preview of the cropped photo at the top (reuses the `ImageBitmap` `PhotoCrop` already
  produced — no re-crop, no re-decode).
- Piece-count row: five buttons, each showing the count and a small swatch box sized via
  `pieceScreenSize` (capped visually so a 50-piece swatch on a huge screen doesn't dominate the
  layout — the swatch communicates *relative* size at a glance, not a literal full-size render).
- Mode select: Classic / Zen, two cards (icon + one-line description), matching the prototype's
  shape.
- Rotation toggle, default off.
- Assists section: snap-tolerance chips, ghost-underlay slider (0–30%), edge-highlight toggle,
  large-piece-mode toggle. Every non-colour-only selection state follows the existing pattern
  (border-weight + text/icon change, never colour alone).
- "Start Cutting" confirms; a "← Back" returns to `PhotoCrop` (re-entering crop, not re-picking a
  photo — matches the prototype's two-step back behavior).

### `src/render/renderer.ts`

- `setGhostUnderlay(bitmap: ImageBitmap | null, opacity: number)` — mirrors `setAccent`'s call
  shape. `paintMat` composites the bitmap at `opacity` when set; redrawn only on resize or when
  this setter is called again (mat's existing "redrawn on resize" cadence, per §03), never per
  frame.
- Edge-highlight stroke pass: a boolean flag consulted in the existing per-piece draw code. Loose
  pieces (dynamic layer, every frame while active, typically <20 objects) get the stroke added
  directly in that loop using the piece's already-cached `Path2D` — no new geometry. Placed pieces
  (baked into the static-layer bitmap) get the stroke added at the same trigger the static layer
  already redraws on — piece placement — so no per-frame cost is added, only marginally more work
  at the (infrequent) placement event.

### `src/render/camera.ts`

`clampZoom(zoom, fit)` gains an optional `minRelativeZoom` parameter (default: today's `MIN_ZOOM`
constant, 0.5). `PlayRuntime` passes `REGION_LENS_ZOOM` (1.5, already exported from this file) when
`assists.largePieceMode` is on. No new independent zoom system — this is a floor on the existing
one, and `camera-controls.ts` (the gesture-input layer) needs no change since it already calls
`clampZoom` rather than reimplementing the bound.

### `src/play/runtime.ts`

`PlayRuntimeOptions` gains `assists?: { ghostOpacity: number; edgeHighlight: boolean; largePieceMode:
boolean }`. `difficulty` and `rotation` already exist as options — this sub-step is the first real
caller to pass non-default values. `PlayRuntime.build()` wires `assists.ghostOpacity` /
`edgeHighlight` into the new `Renderer` setters, and `largePieceMode` into camera creation.

### `src/ui/App.tsx`

The `SetupPhase` union (`'picker' | 'cropping'`, from step 5a) gains `'configuring'`.
`PhotoCrop.onConfirm` now transitions to `configuring` with the crop result in hand;
`PuzzleSetup.onConfirm` produces the final `PuzzleConfig`, which is what triggers the existing
mount effect — replacing today's `{ source, seed }`-only `playConfig` with the full config object.
`TARGET_COUNT` and the hardcoded `mode`/`difficulty`/`rotation` constants are deleted, not just
overridden.

## Data flow

```
PhotoCrop.onConfirm({ source, seed, puzzleId })
  → App: phase = 'configuring'
      → PuzzleSetup (setup.ts for the ladder + actual-size math)
          → confirm: PuzzleConfig { targetCount, mode, rotation, difficulty, assists }
              → App: playConfig = { source, seed, ...config } → PlayRuntime
```

## Error handling

Nothing in this screen can fail the way `PhotoPicker`'s upload path can (no file I/O, no decode) —
every control is a bounded, valid selection by construction (buttons/toggles/a clamped slider).
The only failure mode is downstream, in the cut itself, and that error path (`RuntimeSummary.status
=== 'failed'`) already exists and is untouched by this sub-step.

## Testing

- `test/play/setup.test.ts` (vitest) — `pieceScreenSize` at each ladder value against known
  photo/viewport combinations (exact numbers, same rigor as `photo.test.ts`), `clampGhostOpacity`'s
  boundary cases.
- `test/browser/puzzle-setup.spec.ts` (new, playwright) — selecting each piece count changes the
  swatch and reaches `PlayRuntime` with the real count (assert via `TopBar`'s `cols × rows` text,
  already rendered post-cut); mode/rotation selection reaching the runtime; snap-tolerance and
  large-piece-mode assists observable through actual snap/zoom behavior, not just UI state; ghost
  underlay's visible effect via pixel sampling (same technique `board-page.ts`'s `boardInk` helper
  already uses for chip detection).
- **`BoardPage.open()` update is load-bearing again**, same as 5a: it must drive the new setup
  screen (accept defaults, click "Start Cutting") before `waitForCut()`, so the ~66 existing
  browser specs keep passing through the real flow.

## Gate

Same exit bar as every prior step: `npm test`, `npm run typecheck`, `npm run build`, and
`npm run test:browser` all green, plus a real-device check per `CLAUDE.md`'s testing posture — the
piece-count swatches and the large-piece-mode zoom floor both need judging by eye on real hardware,
not just asserted in Chromium.
