# Completion-Card Race, Drag Boundary, and Box-Lid Reference Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Puzzle Card composing with a piece-shaped gap when the last piece is still
mid-spring, add a hard invisible drag boundary so a piece can never be dragged out of reach, and
add a persistent box-lid reference thumbnail docked in the tray.

**Architecture:** Three independently testable parts (A, B, C), landing as one PR per the spec.
A is a pure timing fix (wait for `PlaySession.animating` before reading the static canvas). B adds
a clamp at the one choke point every drag already funnels through (`PlaySession.dragBy`). C is new
UI chrome — a component that decodes its own copy of the source photo from IndexedDB (never the
`playConfig.source` bitmap, which is detached by the time a puzzle is playable) and docks in
`Sheet`'s pinned region next to the existing shelf.

**Tech Stack:** TypeScript, React, Vitest (`*.test.ts`), Playwright (`*.spec.ts`).

**Spec:** `docs/superpowers/specs/2026-08-12-completion-card-race-and-piece-safety-design.md` — read
it first; this plan implements it task-by-task and corrects one stale assumption in Part C (see
Task 6).

## Global Constraints

- No `localStorage` for session state — IndexedDB only, with the one existing carve-out
  (`hasSeenFirstRunSync`). `referencePanelOpen` is ordinary session state — it persists through
  `SessionSnapshot.assists` → IndexedDB, same as `comfort` and `ghostOpacity`.
- Touch target floor is 44pt everywhere (`--touch-min`).
- `npm run test:browser` is a gate, not optional — run it after each part (A, B, C), not only at
  the end.
- The board never re-renders through React. None of these three parts may add per-frame React
  state — Part A's wait is a `requestAnimationFrame` poll outside React state, Part B's clamp is
  inside the DOM-free session model, Part C's canvas draw is imperative, not per-frame.
- No bounce-back on a failed drop, ever. Part B must clamp *during* the drag so a release outside
  the bound rect is impossible, never correct position after release.
- New tuned constants (Part B's margin formula) get a named constant plus a row in `CLAUDE.md`'s
  "Hard numbers" table, per that file's own standing rule.

---

## Part A — the Puzzle Card can be composed before the last piece finishes settling

### Task 1: Expose `PlayRuntime.animating`

**Files:**
- Modify: `src/play/runtime.ts` (new getter, near `boardCanvas()` at line 544)
- Test: none dedicated — `PlayRuntime` has no unit-test harness anywhere in the repo (it is only
  ever constructed in `src/ui/App.tsx:865`, against a real DOM container, canvas, and audio
  engine); `grep -rn "new PlayRuntime(" src` confirms this. The delegation is a one-line pass-through
  to `PlaySession.animating`, which is already covered by `test/play/session.test.ts`'s `settle`
  helper. Real regression coverage for this getter is the browser test in Task 2.

**Interfaces:**
- Consumes: `PlaySession.animating` (`src/play/session.ts:283`, already exists — `get animating():
  boolean { return this.settling.length > 0; }`), reached through the existing private field
  `this.session: PlaySession | null` (`src/play/runtime.ts`, set at line 723).
- Produces: `PlayRuntime.prototype.animating: boolean` — a public getter, `false` when no session
  exists yet (mirrors every other `this.session?.…` call site in this file, e.g. line 263, 265,
  271).

- [ ] **Step 1: Read the file around the insertion point**

Open `src/play/runtime.ts` and confirm line 544 still reads:

```ts
  boardCanvas(): HTMLCanvasElement {
    return this.renderer.getStaticCanvas();
  }
```

- [ ] **Step 2: Add the getter immediately above `boardCanvas()`**

```ts
  /**
   * True while any cluster is mid-spring. `App.tsx` polls this before reading
   * `boardCanvas()` for the Puzzle Card or the completion thumbnail — both
   * read the static layer, and a piece still mid-spring lives on the dynamic
   * layer only (`PlaySession.scene()`), so composing while this is true grabs
   * a canvas with a piece-shaped hole in it.
   */
  get animating(): boolean {
    return this.session?.animating ?? false;
  }

  /**
   * §11: the completed board canvas, fully lit — what the Puzzle Card composes
   * from and `captureThumbnail` captures. The completion bloom lives on a
   * separate layer, so this is the assembled photo, seams and all, without the
   * payoff wash baked in.
   */
  boardCanvas(): HTMLCanvasElement {
    return this.renderer.getStaticCanvas();
  }
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean — no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/play/runtime.ts
git commit -m "Expose PlayRuntime.animating for the completion-card race fix"
```

---

### Task 2: Wait for settle before composing the card or the completion thumbnail

**Files:**
- Modify: `src/ui/App.tsx` (new helper, wired into the `composeCard` effect at line 945 and
  `commitCompletion` at line 750)
- Test: `test/browser/completion.spec.ts` (new case)

**Interfaces:**
- Consumes: `PlayRuntime.animating` from Task 1; `runtime.current: PlayRuntime | null` (existing
  ref in `App.tsx`).
- Produces: `waitForSettled(rt: PlayRuntime): Promise<void>` — resolves once `rt.animating` is
  `false`, or after a 500ms safety timeout, whichever comes first. Used by both call sites below.

- [ ] **Step 1: Add the helper near the top of `App.tsx`, alongside the other small async helpers**

Find where `composeCard` is imported (`src/ui/App.tsx:50`) and add the helper in the same
module-scope region as other free functions in the file (not inside the component). Search
`grep -n "^function \|^async function " src/ui/App.tsx` first to place it next to similar
utilities rather than inside the component body.

```ts
/**
 * A settling spring is ~120ms (`CLAUDE.md`'s "Snap spring" row), so this
 * resolves in one or two frames in practice. The 500ms cap is defense against
 * a future bug in the settle logic hanging card composition forever — it must
 * never block the player from finishing.
 */
async function waitForSettled(rt: PlayRuntime): Promise<void> {
  const deadline = performance.now() + 500;
  while (rt.animating && performance.now() < deadline) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
```

`PlayRuntime` is already imported as a type in this file (it is the type of `runtime.current`) —
confirm with `grep -n "PlayRuntime" src/ui/App.tsx | head -5` and add the import if it is
currently type-only via inference rather than an explicit `import type`.

- [ ] **Step 2: Wire it into the `composeCard` effect**

In the effect at `src/ui/App.tsx:945` (`// Compose the Puzzle Card once, when a puzzle
completes.`), insert the wait after the fonts wait and before `composeCard`:

```ts
    void (async () => {
      // Fonts first: `ctx.font` falls back silently if the webfont has not
      // arrived, and a card in the wrong typeface is a defect nothing reports.
      await document.fonts.ready;
      // And the board itself: a piece that just completed the puzzle is still
      // mid-spring on the dynamic layer for ~120ms, absent from the static
      // layer this reads from. See `waitForSettled`.
      await waitForSettled(rt);
      if (cancelled) return;
      const blob = await composeCard(rt.boardCanvas(), meta);
      if (cancelled) return;
      setCardBlob(blob);
      setCardMeta(meta);
    })();
```

(The `if (cancelled) return;` right after `waitForSettled` is new — without it, an unmount during
the wait would still call `composeCard` on a torn-down runtime.)

- [ ] **Step 3: Wire it into `commitCompletion`**

In `src/ui/App.tsx:750`, before the existing `captureThumbnail(rt.boardCanvas())` call at line 758:

```ts
    if (rt) {
      const photoId =
        playConfig.photoId ?? (isDailyPuzzleId(playConfig.puzzleId) ? daily.photoId : null);
      const curated = photoId ? curatedPhotoById(photoId) : undefined;
      await waitForSettled(rt);
      const thumbnailBlob = await captureThumbnail(rt.boardCanvas());
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Write the browser regression test**

Add to `test/browser/completion.spec.ts`, inside the `describe('completion', ...)` block:

```ts
  test('the composed card is never missing the last piece', async ({ page }) => {
    test.setTimeout(600_000);
    await BoardPage.openZenAndComplete(page);

    // The static canvas the card and the completion thumbnail both read from.
    // With the fix, by the time the card is on screen the last piece's spring
    // has already been waited out, so ink coverage here must already equal
    // what it is after a further, generous wait — no more piece can arrive.
    const inkOf = (): Promise<number> =>
      page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-layer="static"]');
        if (!canvas) throw new Error('no static layer');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2d context');
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let lit = 0;
        for (let i = 3; i < data.length; i += 4) {
          if ((data[i] as number) > 0) lit++;
        }
        return lit;
      });

    const atCardVisible = await inkOf();
    await page.waitForTimeout(400); // past the ~120ms spring, generously
    const afterSettle = await inkOf();

    expect(atCardVisible).toBe(afterSettle);
  });
```

- [ ] **Step 6: Run the browser suite for this file**

Run: `npx playwright test test/browser/completion.spec.ts --project=dock`
Expected: all cases pass, including the new one.

- [ ] **Step 7: Run the full gate**

Run: `npm test && npm run typecheck && npm run build && npm run test:browser`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/ui/App.tsx test/browser/completion.spec.ts
git commit -m "Fix: wait for the last piece to settle before composing the Puzzle Card"
```

---

## Part B — a hard boundary on how far a piece can be dragged

### Task 3: Clamp `PlaySession.dragBy` to a bound rect

**Files:**
- Modify: `src/play/session.ts` (`dragBy` at line 489, new private `dragBounds()` helper)
- Test: `test/play/session.test.ts` (new `describe` block)

**Interfaces:**
- Consumes: `this.options.pieces.length` (`PlaySessionOptions.pieces`, `session.ts:94`),
  `this.options.boardW` / `this.options.boardH` (`session.ts:95-96`), `this.board.piece(pieceId)`
  (returns `{ w, h, localX, localY, clusterId, ... }`), `this.board.worldOf(pieceId): Point`
  (`board.ts:211`), `this.board.cluster(clusterId): Cluster` (has `.pieceIds`).
- Produces: `dragBy(clusterId: number, dx: number, dy: number): void` — same signature as today,
  now clamps `dx`/`dy` before applying them. No change to any caller (`board-controls.ts:87`).

- [ ] **Step 1: Read the current `dragBy` and its neighbours**

Confirm `src/play/session.ts:489-492` still reads:

```ts
  dragBy(clusterId: number, dx: number, dy: number): void {
    this.board.moveClusterBy(clusterId, dx, dy);
    this.syncCluster(clusterId);
  }
```

- [ ] **Step 2: Write the failing unit tests**

Add to `test/play/session.test.ts`, in a new `describe` block near the other `dragBy`-adjacent
tests (search `grep -n "dragBy" test/play/session.test.ts` for existing coverage to sit near):

```ts
describe('the drag boundary', () => {
  // 6 pieces (COLS=3 * ROWS=2), so margin = clamp(sqrt(6) * 0.8, 4, 18) = clamp(1.96, 4, 18) = 4.
  // boardW = COLS = 3, boardH = ROWS = 2, so the bound rect is
  // x: -4, y: -4, w: 3 + 8 = 11, h: 2 + 8 = 10.

  it('lets an ordinary drag inside the bound through untouched', () => {
    const play = session();
    const clusterId = play.board.clusterIdOf(id(0, 0));
    const before = play.board.cluster(clusterId);
    play.dragBy(clusterId, 1, 1);
    const after = play.board.cluster(clusterId);
    expect(after.x).toBeCloseTo(before.x + 1);
    expect(after.y).toBeCloseTo(before.y + 1);
  });

  it('clamps a drag that would push the cluster past the right/bottom edge', () => {
    const play = session();
    const clusterId = play.board.clusterIdOf(id(0, 0));
    // A huge drag right and down should stop at the bound, not sail past it.
    play.dragBy(clusterId, 10_000, 10_000);
    const cluster = play.board.cluster(clusterId);
    const piece = play.board.piece(id(0, 0));
    // The piece's right/bottom edge must land exactly on the bound rect's
    // right/bottom edge (boardW + margin, boardH + margin), never beyond it.
    expect(cluster.x + piece.localX + piece.w).toBeCloseTo(3 + 4, 1);
    expect(cluster.y + piece.localY + piece.h).toBeCloseTo(2 + 4, 1);
  });

  it('clamps a drag that would push the cluster past the left/top edge', () => {
    const play = session();
    const clusterId = play.board.clusterIdOf(id(0, 0));
    play.dragBy(clusterId, -10_000, -10_000);
    const cluster = play.board.cluster(clusterId);
    const piece = play.board.piece(id(0, 0));
    expect(cluster.x + piece.localX).toBeCloseTo(-4, 1);
    expect(cluster.y + piece.localY).toBeCloseTo(-4, 1);
  });

  it('applies partial progress up to the boundary rather than blocking outright', () => {
    const play = session();
    const clusterId = play.board.clusterIdOf(id(0, 0));
    const piece = play.board.piece(id(0, 0));
    const startRight = play.board.cluster(clusterId).x + piece.localX + piece.w;
    const room = 3 + 4 - startRight; // distance to the right bound
    play.dragBy(clusterId, room + 5, 0); // ask for 5 more than there is room
    const cluster = play.board.cluster(clusterId);
    expect(cluster.x + piece.localX + piece.w).toBeCloseTo(3 + 4, 1);
  });

  it('scales the margin with piece count via the ladder formula', () => {
    // 250 pieces: clamp(sqrt(250) * 0.8, 4, 18) = clamp(12.6, 4, 18) ≈ 12.65,
    // well above the 6-piece test board's margin of 4 — asserted indirectly:
    // a bigger board has more room before the same absolute drag clamps.
    // margin(n) = clamp(sqrt(n) * 0.8, 4, 18)
    const margin = (n: number): number => Math.min(18, Math.max(4, Math.sqrt(n) * 0.8));
    expect(margin(6)).toBeCloseTo(4); // floors at 4
    expect(margin(250)).toBeCloseTo(12.65, 1);
    expect(margin(1000)).toBe(18); // ceilings at 18
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run test/play/session.test.ts -t "the drag boundary"`
Expected: FAIL — clamping does not exist yet, so drags past the edge are not stopped.

- [ ] **Step 4: Implement the clamp**

Replace `dragBy` in `src/play/session.ts`:

```ts
  /**
   * §B: a hard, invisible boundary — soft resistance, the same technique
   * `clampZoom` uses for the zoom limits, applied to position. Centered on the
   * board frame and expanded by a margin that scales with piece count, so a
   * 12-piece puzzle stays easy to reach and a 250-piece puzzle has room to
   * spread pieces out. Margin is in world units, which are piece widths
   * (CLAUDE.md's coordinate-space table), so no further conversion.
   */
  private dragBounds(): Rect {
    const margin = Math.min(18, Math.max(4, Math.sqrt(this.options.pieces.length) * 0.8));
    return {
      x: -margin,
      y: -margin,
      w: this.options.boardW + margin * 2,
      h: this.options.boardH + margin * 2,
    };
  }

  dragBy(clusterId: number, dx: number, dy: number): void {
    const bounds = this.dragBounds();
    const cluster = this.board.cluster(clusterId);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const pieceId of cluster.pieceIds) {
      const piece = this.board.piece(pieceId);
      const origin = this.board.worldOf(pieceId);
      minX = Math.min(minX, origin.x);
      minY = Math.min(minY, origin.y);
      maxX = Math.max(maxX, origin.x + piece.w);
      maxY = Math.max(maxY, origin.y + piece.h);
    }
    const clampedDx = clampAxis(dx, minX, maxX, bounds.x, bounds.x + bounds.w);
    const clampedDy = clampAxis(dy, minY, maxY, bounds.y, bounds.y + bounds.h);
    this.board.moveClusterBy(clusterId, clampedDx, clampedDy);
    this.syncCluster(clusterId);
  }
```

Add the free function `clampAxis` near the bottom of `session.ts`, alongside any other module-scope
helpers (search `grep -n "^function " src/play/session.ts` to place it consistently):

```ts
/**
 * How far `delta` may move a span currently at `[min, max]` before it would
 * cross outside `[boundMin, boundMax]`. `Math.max(0, ...)` /
 * `Math.min(0, ...)` guard the case where the span is already outside the
 * bound (should not happen given this runs on every drag, but a defensive
 * clamp here is one line, and the alternative — letting `boundMax - max`
 * go negative — would yank an already-out-of-bounds cluster backward
 * instead of simply refusing to move it further out).
 */
function clampAxis(
  delta: number,
  min: number,
  max: number,
  boundMin: number,
  boundMax: number,
): number {
  if (delta > 0) return Math.min(delta, Math.max(0, boundMax - max));
  if (delta < 0) return Math.max(delta, Math.min(0, boundMin - min));
  return delta;
}
```

Confirm `Rect` is already imported in `session.ts` (it is used elsewhere, e.g. `contentBounds():
Rect`) — no new import needed.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/play/session.test.ts -t "the drag boundary"`
Expected: PASS, all 5 cases.

- [ ] **Step 6: Run the full unit suite**

Run: `npm test`
Expected: all existing tests still pass — `dragBy`'s signature and ordinary-range behaviour are
unchanged, so nothing outside the new tests should move.

- [ ] **Step 7: Commit**

```bash
git add src/play/session.ts test/play/session.test.ts
git commit -m "Add a hard invisible drag boundary to PlaySession.dragBy"
```

---

### Task 4: Document the constant and add browser coverage

**Files:**
- Modify: `CLAUDE.md` (the "Hard numbers" table)
- Test: `test/browser/drag-out.spec.ts` (new case — this file already covers drag-related gestures,
  per `git log`/the file list; if it does not exist under this name, add the case to the nearest
  existing browser spec that opens a board and performs a raw pointer drag, e.g.
  `test/browser/invariants.spec.ts`)

- [ ] **Step 1: Add the row to `CLAUDE.md`'s "Hard numbers" table**

Insert a new row (keep the table's existing column order — value, then description):

```
| Drag boundary margin | `clamp(√pieces × 0.8, 4, 18)` piece-widths each side, centered on the board frame |
```

- [ ] **Step 2: Write the browser test**

Uses `BoardPage`'s existing `dragOut` (tray → mat, `test/browser/board-page.ts:247`) and
`dragOnMat` (mat → mat, `board-page.ts:260`) helpers — both raw `page.mouse` drags stepped past the
6px promotion threshold, exactly what this test needs to exercise the real drag path rather than a
synthetic `dragTo`.

```ts
test('a piece dragged far past the mat stops at a fixed boundary', async ({ page }) => {
  const board = await BoardPage.open(page, { pieceCount: 50, mode: 'Zen' });
  const mat = await board.matPoint();

  // Onto the mat first — the boundary only governs mat drags.
  await board.dragOut(0, mat);
  const onMat = await board.chip(0).boundingBox();
  expect(onMat, 'piece 0 did not land on the mat').not.toBeNull();

  // A huge drag, then a second, larger huge drag from wherever the first
  // landed. If the boundary is a fixed edge rather than an ever-tracking
  // offset, both land at the same clamped position.
  await board.dragOnMat(
    { x: onMat!.x + onMat!.width / 2, y: onMat!.y + onMat!.height / 2 },
    { x: mat.x + 5000, y: mat.y + 5000 },
  );
  const first = await board.chip(0).boundingBox();
  expect(first, 'piece 0 is no longer a mounted chip after the first huge drag').not.toBeNull();

  await board.dragOnMat(
    { x: first!.x + first!.width / 2, y: first!.y + first!.height / 2 },
    { x: mat.x + 8000, y: mat.y + 8000 },
  );
  const second = await board.chip(0).boundingBox();

  expect(second?.x).toBeCloseTo(first!.x, 0);
  expect(second?.y).toBeCloseTo(first!.y, 0);
});
```

- [ ] **Step 3: Run it**

Run: `npx playwright test test/browser/drag-out.spec.ts --project=dock`
Expected: PASS.

- [ ] **Step 4: Run the full gate**

Run: `npm test && npm run typecheck && npm run build && npm run test:browser`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md test/browser/drag-out.spec.ts
git commit -m "Document the drag boundary margin and add browser coverage"
```

---

## Part C — a box-lid reference panel in the tray

**Correction to the spec:** the design doc says *"`App.tsx` already holds `playConfig.source`
(the full decoded photo)... A new `ReferencePanel.tsx` draws it directly."* This is stale.
`src/ui/App.tsx:897-898`'s own comment says the opposite: `playConfig.source` is handed to the
cutter worker and **detached** before `start()` runs (`"a copy taken after that point throws"`).
By the time a puzzle is playable, `playConfig.source` is not a usable bitmap. `PauseSheet.tsx`
already hit this exact problem for its own (different, on-demand, full-screen) reference viewer
and solved it the same way this task will: `loadPhoto(puzzleId)` (`src/persist/photos.ts`), a
fresh decode from the IndexedDB-stored blob. Task 6 below uses that pattern, not `playConfig.source`.

### Task 5: `PuzzleAssists.referencePanelOpen`

**Files:**
- Modify: `src/play/setup.ts` (`PuzzleAssists` at line 96, `DEFAULT_PUZZLE_CONFIG` at line 112)
- Modify: `src/play/runtime.ts` (`DEFAULT_ASSISTS` at line 55)
- Modify: `src/ui/PuzzleSetup.tsx` (`handleConfirm`'s assists object — add the field so a puzzle
  configured at setup gets the default rather than `undefined`)
- Test: `test/play/setup.test.ts`

**Interfaces:**
- Produces: `PuzzleAssists.referencePanelOpen: boolean`, defaulting `true` everywhere the type is
  constructed.

- [ ] **Step 1: Write the failing test**

Add to `test/play/setup.test.ts`:

```ts
it('defaults the reference panel open', () => {
  expect(DEFAULT_PUZZLE_CONFIG.assists.referencePanelOpen).toBe(true);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run test/play/setup.test.ts -t "defaults the reference panel open"`
Expected: FAIL — `referencePanelOpen` does not exist on the type yet, so this is a type error at
minimum, or `undefined !== true`.

- [ ] **Step 3: Add the field**

In `src/play/setup.ts`:

```ts
export interface PuzzleAssists {
  ghostOpacity: number;
  edgeHighlight: boolean;
  largePieceMode: boolean;
  /** §C Track 3: one flag, read by the lift, the snap floor, tremor damping, and 60pt targets. */
  comfort: boolean;
  /**
   * §C: the box-lid reference thumbnail docked in the tray. Shown by default
   * so the feature is discoverable. Persisted through `SessionSnapshot.assists`
   * — ordinary session state, not the `hasSeenFirstRunSync` localStorage
   * carve-out.
   */
  referencePanelOpen: boolean;
}
```

```ts
export const DEFAULT_PUZZLE_CONFIG: PuzzleConfig = {
  targetCount: 150,
  mode: 'classic',
  rotation: false,
  difficulty: 'standard',
  assists: {
    ghostOpacity: 0,
    edgeHighlight: false,
    largePieceMode: false,
    comfort: false,
    referencePanelOpen: true,
  },
};
```

- [ ] **Step 4: Update the other two literal `PuzzleAssists` object sites**

In `src/play/runtime.ts:55`:

```ts
const DEFAULT_ASSISTS: PuzzleAssists = {
  ghostOpacity: 0,
  edgeHighlight: false,
  largePieceMode: false,
  comfort: false,
  referencePanelOpen: true,
};
```

In `src/ui/PuzzleSetup.tsx`'s `handleConfirm` (search `grep -n "comfort: DEFAULT_PUZZLE_CONFIG"
src/ui/PuzzleSetup.tsx` to find the exact block):

```ts
      assists: {
        ghostOpacity: clampGhostOpacity(ghostOpacity),
        edgeHighlight,
        largePieceMode,
        // Comfort is toggled later, mid-play, from the pause sheet — not a
        // choice offered at setup.
        comfort: DEFAULT_PUZZLE_CONFIG.assists.comfort,
        referencePanelOpen: DEFAULT_PUZZLE_CONFIG.assists.referencePanelOpen,
      },
```

- [ ] **Step 5: Typecheck to find any other construction sites**

Run: `npm run typecheck`
Expected: any remaining literal `PuzzleAssists` object (e.g. in `App.tsx`'s `FIRST_RUN_CONFIG` /
`DAILY_CONFIG`, which spread `DEFAULT_PUZZLE_CONFIG.assists` rather than listing fields — confirm
these do not need edits since they spread the constant already fixed in Step 3) surfaces as a
missing-property error. Fix each the same way: add `referencePanelOpen: true`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run test/play/setup.test.ts`
Expected: PASS, including the new case.

- [ ] **Step 7: Run the full unit suite**

Run: `npm test`
Expected: all green — `SessionSnapshot`'s `assists: PuzzleAssists` field needs no shape change
(`src/persist/snapshot.ts` already carries whatever the type adds, per the spec), so the
save/restore round trip should pass with no code change there, only by virtue of the new field
flowing through structurally.

- [ ] **Step 8: Commit**

```bash
git add src/play/setup.ts src/play/runtime.ts src/ui/PuzzleSetup.tsx test/play/setup.test.ts
git commit -m "Add PuzzleAssists.referencePanelOpen, defaulting to shown"
```

---

### Task 6: `ReferencePanel.tsx`

**Files:**
- Create: `src/ui/ReferencePanel.tsx`
- Test: covered by the browser test in Task 8 (this is presentational chrome with an async load —
  not worth a node-environment unit test given the component has no pure logic of its own beyond
  a collapse toggle; the pattern matches `PauseSheet.tsx`, which also has no dedicated unit test)

**Interfaces:**
- Consumes: `loadBitmap: () => Promise<ImageBitmap>` (supplied by the caller — see Task 8's
  ordering note on why this is a function the caller controls rather than a puzzleId prop this
  component resolves itself).
- Produces: a component taking `{ loadBitmap, open, onToggle }` and rendering either a small
  thumbnail canvas (open) or a slim single-line strip (closed).

- [ ] **Step 1: Write the component**

```tsx
/**
 * The box-lid reference panel (§C) — a persistent small thumbnail of the
 * whole target photo, docked in the tray. Independent of the board's render
 * pipeline entirely: this is a plain `<canvas>` drawn once per photo, not a
 * layer `Renderer` knows about.
 *
 * Not the ghost underlay (`PuzzleAssists.ghostOpacity`, drawn on the board
 * itself by `Renderer.setGhostUnderlay`) — this is a separate assist, shown
 * or hidden independently.
 */

import { useEffect, useRef, useState } from 'react';

export interface ReferencePanelProps {
  /**
   * Resolves to a fresh decode of the source photo. A function rather than a
   * bitmap prop: the caller owns sequencing around the async, fire-and-forget
   * `savePhoto` write this races against on a freshly started puzzle (see
   * `App.tsx`'s wiring in Task 8), and owns closing the bitmap once drawn.
   */
  loadBitmap: () => Promise<ImageBitmap>;
  open: boolean;
  onToggle: () => void;
}

export function ReferencePanel({
  loadBitmap,
  open,
  onToggle,
}: ReferencePanelProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let bitmap: ImageBitmap | null = null;
    void loadBitmap()
      .then((bmp) => {
        if (cancelled) {
          bmp.close();
          return;
        }
        bitmap = bmp;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const scale = Math.min(canvas.width / bmp.width, canvas.height / bmp.height);
        const w = bmp.width * scale;
        const h = bmp.height * scale;
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        ctx?.drawImage(bmp, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      bitmap?.close();
    };
  }, [open, loadBitmap]);

  if (!open) {
    return (
      <button
        type="button"
        aria-label="Show reference photo"
        onClick={onToggle}
        className="touch-target flex w-full items-center justify-between px-[12px] text-1 text-[var(--ink-muted)]"
      >
        <span>Reference photo</span>
        <span aria-hidden>Show</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-[4px] px-[12px] pb-[8px]">
      <div className="flex items-center justify-between">
        <span className="text-1 text-[var(--ink-muted)]">Reference photo</span>
        <button
          type="button"
          aria-label="Hide reference photo"
          onClick={onToggle}
          className="touch-target text-1 text-[var(--ink-muted)]"
        >
          Hide
        </button>
      </div>
      {failed ? (
        <div className="text-1 text-[var(--ink-muted)]">Not available yet</div>
      ) : (
        <canvas
          ref={canvasRef}
          width={280}
          height={140}
          className="w-full rounded-[var(--radius-sm)]"
          aria-label="Reference photo thumbnail"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean (this component is not wired in anywhere yet, so it only needs to typecheck in
isolation).

- [ ] **Step 3: Commit**

```bash
git add src/ui/ReferencePanel.tsx
git commit -m "Add ReferencePanel — the box-lid reference thumbnail, unwired"
```

---

### Task 7: `Sheet.tsx` gains a `reference` slot

**Files:**
- Modify: `src/ui/Sheet.tsx`

**Interfaces:**
- Produces: `SheetProps.reference?: React.ReactNode` — rendered inside the same `pinned` ref'd div
  as `shelf`, after it, so `Sheet`'s existing `ResizeObserver` (`heightOf`, `pinnedPx`) grows peek
  to fit it automatically with no new layout math.

- [ ] **Step 1: Add the prop**

In `SheetProps` (`src/ui/Sheet.tsx:23`), after `shelfVisible`:

```ts
  /**
   * §C: the box-lid reference panel, rendered in the same pinned region as
   * `shelf`, after it. Grows/shrinks peek automatically through the existing
   * `ResizeObserver` on `pinned` — no new measurement needed.
   */
  reference?: React.ReactNode;
```

- [ ] **Step 2: Destructure and render it**

In the `Sheet` function signature, add `reference` to the destructured props. In the JSX, inside
the `pinned` div, after `{shelf}`:

```tsx
      <div ref={pinned} className="shrink-0">
        {/* ...handle and header, unchanged... */}
        <div className="shrink-0 px-[12px]">{header}</div>
        {shelf}
        {reference}
      </div>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean — `reference` is optional, so no existing caller of `Sheet` breaks.

- [ ] **Step 4: Commit**

```bash
git add src/ui/Sheet.tsx
git commit -m "Sheet: add a reference slot in the pinned region, after the shelf"
```

---

### Task 8: Wire `ReferencePanel` through `Tray` and `App`

**Files:**
- Modify: `src/ui/Tray.tsx` (`TrayProps`, dock and sheet branches)
- Modify: `src/ui/App.tsx` (pass the loader and open/toggle state through to `Tray`)
- Test: none dedicated at this layer — the prop-plumbing is exercised end-to-end by Task 9's
  browser test.

**Interfaces:**
- Consumes: `ReferencePanel` from Task 6, `SheetProps.reference` from Task 7.
- Produces: `TrayProps` gains `referenceOpen: boolean`, `onReferenceToggle: () => void`, and
  `loadReferenceBitmap: () => Promise<ImageBitmap>`.

- [ ] **Step 1: Add the props to `TrayProps`**

In `src/ui/Tray.tsx`, after `pulseLenses` in `TrayProps`:

```ts
  /** §C: the box-lid reference panel's open/closed state (`PuzzleAssists.referencePanelOpen`). */
  referenceOpen: boolean;
  onReferenceToggle: () => void;
  /** See `ReferencePanel`'s own prop doc for why this is a loader, not a bitmap. */
  loadReferenceBitmap: () => Promise<ImageBitmap>;
```

- [ ] **Step 2: Build the panel node once, alongside `shelf`/`lenses`/`grid`**

In the `Tray` function body, after the existing `shelf` construction:

```tsx
  const reference = (
    <ReferencePanel
      loadBitmap={props.loadReferenceBitmap}
      open={props.referenceOpen}
      onToggle={props.onReferenceToggle}
    />
  );
```

Add the import: `import { ReferencePanel } from './ReferencePanel';`

- [ ] **Step 3: Pass it to `Sheet` in the non-docked branch**

```tsx
      <Sheet
        rootRef={props.rootRef}
        detent={props.detent}
        onDetent={props.onDetent}
        header={title}
        shelf={shelf}
        shelfVisible={shelfVisible}
        reference={reference}
        lenses={lenses}
      >
```

- [ ] **Step 4: Render it in the docked branch, after the title/lenses block and before `shelf`**

```tsx
      <div className="flex shrink-0 flex-col gap-[12px] px-[12px] pb-[12px] pt-[16px]">
        {title}
        {lenses}
      </div>
      {reference}
      {shelf}
      {grid}
```

(Docked has no peek to protect, so placement is purely visual — "above the piece grid/lens chips"
per the spec is satisfied either above or below the lens block; placing it after the title/lenses
box and before the shelf keeps the dock's visual order close to the sheet's.)

- [ ] **Step 5: Wire it from `App.tsx`**

In `src/ui/App.tsx`, near where `liveAssists`/`playConfig.assists` are already read for the
first-run comfort toggle (line ~1340), add a resolved-assists convenience if one does not already
exist, then wire the three new `Tray` props at the call site (line ~1385, right after
`pulseLenses`):

```tsx
          referenceOpen={(liveAssists ?? playConfig?.assists)?.referencePanelOpen ?? true}
          onReferenceToggle={() => {
            const assists = liveAssists ?? playConfig?.assists;
            if (!assists) return;
            const next = { ...assists, referencePanelOpen: !assists.referencePanelOpen };
            setLiveAssists(next);
            runtime.current?.setAssists(next);
          }}
          loadReferenceBitmap={() => {
            // Ordering matters: `photoWrite.current` is the fire-and-forget
            // `savePhoto` write App kicks off once per puzzle
            // (`App.tsx` around line 906) — on a freshly started puzzle the
            // IndexedDB row may not exist yet the instant the tray mounts.
            // Awaiting the in-flight write first (falling through if there
            // is none, e.g. a restored session from a prior visit) makes
            // `loadPhoto` reliable instead of racy.
            const wait = photoWrite.current ?? Promise.resolve();
            return wait.then(() => loadPhoto(playConfig!.puzzleId));
          }}
```

Add the import: `import { loadPhoto } from '@/persist/photos';` if `App.tsx` does not already
import it (check first — `savePhoto` is already imported from the same module per Task 6's spec
excerpt, so this is likely a same-line addition: `import { loadPhoto, savePhoto } from
'@/persist/photos';`).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 7: Run the unit suite**

Run: `npm test`
Expected: all green — no unit-tested surface changed.

- [ ] **Step 8: Commit**

```bash
git add src/ui/Tray.tsx src/ui/App.tsx
git commit -m "Wire the reference panel into Tray and App, loading from IndexedDB"
```

---

### Task 9: Browser coverage for the reference panel

**Files:**
- Modify: `test/browser/puzzle-setup.spec.ts` (or a new `test/browser/reference-panel.spec.ts` if
  that file is already large — check its current line count first with `wc -l
  test/browser/puzzle-setup.spec.ts`; over ~400 lines, prefer a new file)

- [ ] **Step 1: Write the test**

```ts
test('the reference thumbnail shows while playing, and its state survives a reload', async ({
  page,
}) => {
  const board = await BoardPage.open(page, { pieceCount: 50, mode: 'Zen' });

  await expect(page.getByLabel('Reference photo thumbnail')).toBeVisible();

  const sheetBefore = await page.getByLabel('Pieces').boundingBox();
  await page.getByLabel('Hide reference photo').click();
  await expect(page.getByLabel('Reference photo thumbnail')).toBeHidden();
  const sheetAfter = await page.getByLabel('Pieces').boundingBox();
  // Collapsing shrinks the sheet's measured peek height — same technique
  // `tray-3b.spec.ts` uses to prove the shelf's visibility affects layout.
  expect(sheetAfter?.height ?? 0).toBeLessThan(sheetBefore?.height ?? Infinity);

  // Same reload convention `persistence.spec.ts` uses to prove a snapshot
  // round-trips through IndexedDB rather than surviving only in memory.
  await page.reload({ waitUntil: 'load' });
  await board.waitForCut();
  await expect(page.getByLabel('Show reference photo')).toBeVisible();
  await expect(page.getByLabel('Reference photo thumbnail')).toBeHidden();
});
```

`BoardPage.open(page, { pieceCount, mode })` and `board.waitForCut()` are the exact signatures
already used throughout `test/browser/*.spec.ts` (e.g. `completion.spec.ts:78`,
`puzzle-setup.spec.ts`) — confirmed against `test/browser/board-page.ts:68` and `:147`, no
guessing needed.

- [ ] **Step 2: Run it**

Run: `npx playwright test <chosen-file> --project=dock`
Expected: PASS.

- [ ] **Step 3: Run the full gate**

Run: `npm test && npm run typecheck && npm run build && npm run test:browser`
Expected: all green, both `dock` and `phone` projects.

- [ ] **Step 4: Commit**

```bash
git add test/browser/
git commit -m "Add browser coverage for the reference panel's visibility and persistence"
```

---

## Final integration pass

- [ ] **Step 1: Run the complete gate one more time end to end**

Run: `npm test && npm run typecheck && npm run build && npm run test:browser`
Expected: all green.

- [ ] **Step 2: Manual pass on real hardware**

Per `CLAUDE.md`'s standing testing posture, load the app on an iPad/iPhone and by hand: (a)
complete a small puzzle and confirm the card never shows a gap; (b) drag a piece as far as
possible in every direction and confirm it stops rather than tracking the finger past a point;
(c) toggle the reference panel open/closed a few times and confirm it never blocks the shelf or
lens chips from being reached at peek.

- [ ] **Step 3: Update `handoff.md`**

Per this repo's convention (`docs/superpowers/plans` note in `CLAUDE.md`, and the existing
`handoff.md` at the repo root), append a section recording what landed, the gates passed, and any
judgment calls made along the way (e.g. the Part C correction about `playConfig.source` being
detached).
