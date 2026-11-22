# Modernize PR 0 — first-run clip fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a 402pt-wide phone, the guided twelve's board frame and every scattered piece are on screen at open and after Fit.

**Architecture:** Two pure functions carry the decisions, both unit-tested in node: a scatter that is centred under the board and wrapped to its width (`src/play/layout.ts`), and a content-framing camera that, when the zoom floor bites, slides the centre just enough to keep the board frame in view (`src/render/camera.ts`). `PlayRuntime.frameContent()` and `CameraControls.fit()` both call the camera function, so open and Fit can never disagree. A `@phone` browser spec at 402 × 874 proves it.

**Tech Stack:** TypeScript, Vitest (node), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-modernize-design.md` §7. This is one of six plans; phases a–e each get their own plan when they start.

## Global Constraints

- No hard number changes: `MIN_ZOOM` 0.5, `MAX_ZOOM` 4, fit margin 0.9, the 1.35 scatter pitch, `boardH + 0.8` scatter offset all stay.
- `Camera` in `src/render/camera.ts` is the only world↔screen mapping.
- The scatter uses `rngFor(seed, 'firstRunScatter', 0)` — same stream, so restored and fresh first runs stay deterministic.
- `__tessera` additions are dev-only; `scripts/check-bundle-budget.mjs` must still pass.
- Gates: `npm test`, `npm run typecheck`, `npm run test:browser:smoke`, `npm run test:browser` before the PR.

## Review Focus

- Large-piece mode (`minRelativeZoom = REGION_LENS_ZOOM`, 1.5×): the board itself no longer fits, so the camera must keep the content centre rather than oscillate or pin to a corner — Task 2 test 4.
- A player who has dragged pieces far right and presses Fit: the frame stays visible and the far piece may be off-screen (clamp unchanged) — Task 2 test 3.
- An ordinary 150-piece tray puzzle: content fits within the clamp, so framing is byte-identical to today — Task 2 test 1.
- Restore of a saved guided twelve: scatter is skipped on restore (unchanged), and framing uses the saved positions — covered by the existing persistence specs; no new test.
- Landscape phone (874 × 402): the board fits by height; the frame must stay in view vertically too — Task 2 test 2 runs both axes.

---

### Task 1: the 402pt browser proof (first — it must fail before the fix)

**Files:**
- Modify: `src/dev/e2e.ts` (two hook methods)
- Modify: `src/play/runtime.ts` (two `e2e*` methods beside `e2eLoosePoints`)
- Test: `test/browser/first-run.spec.ts` (new test)

**Interfaces:**
- Produces on `E2eHook`: `frameRect(): ClientRect | null` and `looseBounds(): ClientRect | null`, where `type ClientRect = { left: number; top: number; right: number; bottom: number }` in client px. Backed by `PlayRuntime.e2eFrameRect()` (board `[0,0]–[boardW,boardH]` through `worldToScreen`, offset by the container's client rect, as `e2eLoosePoints` does) and `PlayRuntime.e2eLooseBounds()` (union of every loose piece's `x, y, w, h` the same way; null when none).

- [ ] **Step 1: Write the failing spec** — `test('@phone the guided twelve fits a 402pt phone, before and after Fit', …)` with `test.use({ viewport: { width: 402, height: 874 } })` scoped by a `test.describe`. Open with `openFreshProfile`, wait `remaining(page) === 12` and `__tessera.idle()`. Then, before and after clicking the `Fit` button:

```ts
const inView = async () => {
  const [frame, loose] = await page.evaluate(() => [
    window.__tessera!.frameRect(), window.__tessera!.looseBounds(),
  ]);
  for (const r of [frame!, loose!]) {
    expect(r.left).toBeGreaterThanOrEqual(0);
    expect(r.right).toBeLessThanOrEqual(402);
    expect(r.top).toBeGreaterThanOrEqual(0);
    expect(r.bottom).toBeLessThanOrEqual(874);
  }
};
```

- [ ] **Step 2: Implement the two runtime methods and hook entries.**
- [ ] **Step 3: Run** `npm run test:browser:one -- first-run.spec.ts --project=phone -g 402` — expected FAIL with `frame.left` negative (the bug, reproduced). Record the value for the PR body.
- [ ] **Step 4: Commit** — `git commit -m "First run: @phone 402pt spec for the frame and scatter (fails until the fix)"`

---

### Task 2: `fitCameraToContent` — frame content, never clip the board

**Files:**
- Modify: `src/render/camera.ts` (add after `fitCameraToBounds`)
- Modify: `src/render/camera-controls.ts:102-116` (`fit()`)
- Modify: `src/play/runtime.ts:1028-1041` (`frameContent()`)
- Test: `test/render/camera.test.ts`

**Interfaces:**
- Produces: `fitCameraToContent(viewport: Size, content: Rect, board: { w: number; h: number }, minRelativeZoom?: number): Camera`

Behaviour: `framed = fitCameraToBounds(viewport, content)`; `zoom = clampZoom(framed.zoom, fitScale(viewport, board.w, board.h), minRelativeZoom)`. Then per axis, with `half = viewportSide / 2 / zoom`: if the board's extent on that axis (`[0, board.w]` / `[0, board.h]`) is ≤ `2 × half`, clamp the centre into `[boardSide − half, half]`; otherwise keep `framed`'s centre. When the clamp does not bite the board is already inside the content box, so the result equals `framed` exactly.

- [ ] **Step 1: Write the failing tests** in a new `describe('fitCameraToContent')`:

```ts
const PHONE = { w: 402, h: 874 };
const BOARD = { w: 3, h: 4 };
const boardOnScreen = (cam: Camera, vp: Size) => {
  const tl = worldToScreen(cam, vp, { x: 0, y: 0 });
  const br = worldToScreen(cam, vp, { x: BOARD.w, y: BOARD.h });
  return { tl, br };
};

it('equals fitCameraToBounds when the content fits inside the zoom floor', () => {
  const content = { x: -0.5, y: -0.5, w: 4, h: 9 };
  expect(fitCameraToContent(PHONE, content, BOARD)).toEqual(fitCameraToBounds(PHONE, content));
});

it('keeps the board frame on screen when a wide scatter hits the floor (both orientations)', () => {
  const content = { x: 0, y: 0, w: 20, h: 10 }; // left-anchored, far wider than the board
  for (const vp of [PHONE, { w: 874, h: 402 }]) {
    const cam = fitCameraToContent(vp, content, BOARD);
    expect(cam.zoom).toBeCloseTo(fitScale(vp, BOARD.w, BOARD.h) * MIN_ZOOM, 6);
    const { tl, br } = boardOnScreen(cam, vp);
    expect(tl.x).toBeGreaterThanOrEqual(0);
    expect(br.x).toBeLessThanOrEqual(vp.w);
    expect(tl.y).toBeGreaterThanOrEqual(0);
    expect(br.y).toBeLessThanOrEqual(vp.h);
  }
});

it('keeps the frame when content runs off to the right', () => {
  const cam = fitCameraToContent(PHONE, { x: 0, y: 0, w: 30, h: 4 }, BOARD);
  const { tl } = boardOnScreen(cam, PHONE);
  expect(tl.x).toBeGreaterThanOrEqual(0);
});

it('keeps the content centre when the board itself cannot fit (large-piece floor)', () => {
  const content = { x: 0, y: 0, w: 20, h: 10 };
  const cam = fitCameraToContent(PHONE, content, BOARD, REGION_LENS_ZOOM);
  expect(cam.x).toBeCloseTo(10, 6);
  expect(cam.y).toBeCloseTo(5, 6);
});
```

- [ ] **Step 2: Run** `npx vitest run test/render/camera.test.ts` — expected FAIL, `fitCameraToContent` is not exported.

- [ ] **Step 3: Implement `fitCameraToContent`** in `src/render/camera.ts` as described above, with a doc comment naming the 402pt first-run clip as the case it exists for.

- [ ] **Step 4: Run** `npx vitest run test/render/camera.test.ts` — expected PASS.

- [ ] **Step 5: Route both callers through it.** `CameraControls.fit()` keeps its no-bounds branch (`fitCamera`) and replaces the framed+clamp pair with `fitCameraToContent(viewport, bounds, this.options.getBoard(), this.minRelativeZoom)`. `PlayRuntime.frameContent()` replaces its framed+clamp pair with `fitCameraToContent(this.viewport, bounds, { w: this.boardW, h: this.boardH }, largePieceMode ? REGION_LENS_ZOOM : undefined)`. Drop imports that become unused.

- [ ] **Step 6: Run** `npm test && npm run typecheck` — expected all green.

- [ ] **Step 7: Commit** — `git commit -m "Camera: frame content without ever clipping the board frame"`

---

### Task 3: `firstRunScatter` — centred under the board, wrapped to its width

**Files:**
- Modify: `src/play/layout.ts` (add export)
- Modify: `src/play/runtime.ts:818-831` (the `startInTray === false` block)
- Test: `test/play/layout.test.ts`

**Interfaces:**
- Consumes: `Rng` from `@/core/rng`.
- Produces: `firstRunScatter(count: number, boardW: number, boardH: number, rng: Rng): Point[]` — one origin per piece, in input order.

Values: `perRow = max(3, round(boardW))`; pitch 1.35; jitter `rng.range(-0.15, 0.15)` on x then y per piece (same draw order as today); row 0 at `y = boardH + 0.8`; the grid's x-extent `(perRow − 1) × 1.35 + 1` centred on `boardW / 2`. A short last row is centred too.

- [ ] **Step 1: Write the failing tests:**

```ts
describe('firstRunScatter', () => {
  const pts = firstRunScatter(12, 3, 4, rngFor(7, 'firstRunScatter', 0));

  it('places one origin per piece, all below the board', () => {
    expect(pts).toHaveLength(12);
    for (const p of pts) expect(p.y).toBeGreaterThanOrEqual(4 + 0.8 - 0.15);
  });

  it('is centred under the board', () => {
    const xs = pts.map((p) => p.x);
    const mid = (Math.min(...xs) + Math.max(...xs) + 1) / 2;
    expect(Math.abs(mid - 1.5)).toBeLessThan(0.3);
  });

  it('wraps to the board width, not to sqrt(n)', () => {
    const xs = pts.map((p) => p.x);
    expect(Math.max(...xs) + 1 - Math.min(...xs)).toBeLessThanOrEqual(3 * 1.35 + 0.3);
  });

  it('is deterministic per seed', () => {
    expect(firstRunScatter(12, 3, 4, rngFor(7, 'firstRunScatter', 0))).toEqual(pts);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run test/play/layout.test.ts` — expected FAIL, not exported.
- [ ] **Step 3: Implement `firstRunScatter`** in `src/play/layout.ts`.
- [ ] **Step 4: Run** the same — expected PASS.
- [ ] **Step 5: Use it in `PlayRuntime.build()`**: the loop becomes `moveCluster(clusterOf(piece.id), origin.x, origin.y)` over `firstRunScatter(cut.length, this.boardW, this.boardH, rngFor(seed, 'firstRunScatter', 0))`. Keep the existing comment block above it; update its last sentence to say where the layout now lives.
- [ ] **Step 6: Run** `npm test && npm run typecheck` — green. `test/play/first-run.test.ts` must still pass untouched.
- [ ] **Step 7: Run** `npm run test:browser:one -- first-run.spec.ts --project=phone` — the 402pt spec from Task 1 now PASSES, and the other first-run tests still pass.
- [ ] **Step 8: Run the gates:** `npm run build` (bundle budget passes, `__tessera` absent), `npm run test:browser:smoke`, `npm run test:browser`.
- [ ] **Step 9: Commit** — `git commit -m "First run: scatter centred under the board and wrapped to its width"`

---

### Task 4: PR

- [ ] Push `claude/modernize-5e3d27` (never main) and open the PR "Modernize 0: guided twelve fits a 402pt phone". Body: root cause (spec §7), the before value from Task 3 step 2, the after screenshot at 402 × 874, gates run, and the owner check: *guided twelve on the iPhone, portrait, then Fit*.
- [ ] Bind with `ccd_pr`, read CI.
