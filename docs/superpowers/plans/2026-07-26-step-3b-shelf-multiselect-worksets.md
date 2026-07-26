# Tessera Step 3b — Shelf, Multi-Select, and Worksets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close step 3 by adding the tray's pinned shelf, multi-select, and pull-out-onto-the-mat, plus the containing outline and label chip that step 2 deferred — and fix the 3a defect that makes the tray unscrollable by touch.

**Architecture:** Pull-out produces a **Workset** — a label plus a membership set over ordinary one-piece clusters — and not a union-find cluster, because a pull-out group's internal offsets are wrong by construction and `snap.ts` would resolve against them silently. `snap.ts` and `board.ts` learn nothing. Every unit with a decision in it is DOM-free and unit-tested; the DOM-touching files stay thin enough to judge by hand.

**Tech Stack:** TypeScript, React 19, Vite, Tailwind v4, Zustand, Canvas 2D. Vitest (node env, `*.test.ts`). Playwright (`*.spec.ts`).

**Spec:** `docs/superpowers/specs/2026-07-26-step-3b-shelf-multiselect-worksets-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **The board never re-renders through React.** Board state lives outside React; Zustand carries chrome state only. Group chips are drawn on canvas, never as DOM over the canvas.
- **`snap.ts` and `board.ts` must not learn that Worksets exist.** No import of `workset.ts` from either.
- **A Workset stores no position.** Its bounds derive from its members every frame.
- **Tray filters are lenses, never sorts.** No comparator may appear in `lenses.ts`. Every lens's output stays a subsequence of the canonical order.
- **All tolerances are world-space**, never screen-space, so zoom never changes behaviour.
- `WORKSET_DROP_TOLERANCE = 1.0` (× piece size, world units).
- `SELECT_HOLD_MS = 450` (ms).
- `MOVE_THRESHOLD_PX = 6` — imported from `@/input/pointer`, never restated.
- **Colour is never the only signal.** Selection badges carry a numeral; the pinned state carries a glyph.
- **44pt touch-target floor**, everywhere.
- **Chips use `drawImage`, never `transferFromImageBitmap`** — that would consume the bitmap the renderer draws the piece from.
- **No `localStorage`.** Nothing in this step persists at all; persistence is step 5.
- Vitest owns `*.test.ts`, Playwright owns `*.spec.ts`. Neither ever collects the other's files.
- Verification commands: `npm test`, `npm run typecheck`, `npm run test:browser`.

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `src/tray/selection.ts` | `TraySelection` — the ordered selection set. DOM-free |
| `src/play/workset.ts` | `WorksetStore`, `worksetBounds`, `escapedBounds`. DOM-free |
| `src/play/layout.ts` | `gridLayout` — pull-out arrangement. DOM-free, pure |
| `src/ui/Shelf.tsx` | The pinned row |
| `src/ui/SelectionBar.tsx` | Select-mode action bar |
| `test/tray/selection.test.ts` | |
| `test/play/workset.test.ts` | **This step's load-bearing test file** |
| `test/play/layout.test.ts` | |
| `test/browser/tray-3b.spec.ts` | The browser gate for this step |

**Modify:** `src/input/tray-drag.ts`, `src/ui/useTrayDrag.ts`, `src/tray/lenses.ts`, `src/tray/tray.ts`, `src/play/session.ts`, `src/play/runtime.ts`, `src/render/scene.ts`, `src/render/renderer.ts`, `src/ui/PieceChip.tsx`, `src/ui/PieceGrid.tsx`, `src/ui/Tray.tsx`, `src/ui/store.ts`, `test/input/tray-drag.test.ts`, `test/tray/lenses.test.ts`, `test/browser/board-page.ts`, `CLAUDE.md`, `PLAN.md`.

---

# Task 1: TrayDrag — axis commit and select-hold

**Files:**
- Modify: `src/input/tray-drag.ts`
- Test: `test/input/tray-drag.test.ts` (rewrite two cases, add four)

**Interfaces:**
- Consumes: `MOVE_THRESHOLD_PX` from `@/input/pointer`.
- Produces: `SELECT_HOLD_MS: number`; `TrayDragOptions { onPullOut, onEnterSelect?, onTap?, selecting? }`; `TrayDrag` with unchanged `down`/`move`/`tick`/`up`/`cancel`/`pressing`/`pressedPiece`.

**Context for the implementer.** Today `TrayDrag` promotes to drag-out on *both* 6px of movement and 120ms of stillness. §06 needs that stillness for multi-select, and only one can have it. Separately, the chip currently sets `touch-action: none`, which does not lose a race with native scrolling — it *disables* it, so on a phone the tray cannot be scrolled by touch at all. Task 9 sets `touch-action: pan-y`; this task teaches `TrayDrag` to leave the vertical axis alone so the browser can use it.

- [ ] **Step 1: Write the failing tests**

Replace the `promotes on a long press…` case and add the new ones. The `at()` helper needs a `pointerType`, so update it too.

In `test/input/tray-drag.test.ts`, replace the header comment, the `at` helper, the `harness` function, and the `promotes on a long press` case:

```ts
/**
 * The tray half of drag-out (§06), and the entry to multi-select.
 *
 * Two rules earn their tests here. **Stillness selects, movement drags** — the
 * mat's 120ms long press no longer applies to a chip, because §06 spends that
 * input on multi-select and only one gesture can have it. And **the chip cedes
 * the vertical axis to the browser**: the grid scrolls vertically, so a vertical
 * touch is a scroll and must never become a drag.
 */

import { describe, expect, it } from 'vitest';
import { MOVE_THRESHOLD_PX } from '@/input/pointer';
import { SELECT_HOLD_MS, TrayDrag } from '@/input/tray-drag';

const at = (
  x: number,
  y: number,
  t: number,
  id = 1,
  pointerType = 'mouse',
): PointerEvent => ({ pointerId: id, clientX: x, clientY: y, timeStamp: t, pointerType }) as PointerEvent;

const touch = (x: number, y: number, t: number, id = 1): PointerEvent =>
  at(x, y, t, id, 'touch');

function harness(taken = true, selecting = false) {
  const pulled: number[] = [];
  const tapped: number[] = [];
  const selected: number[] = [];
  const drag = new TrayDrag({
    onPullOut: (pieceId) => {
      pulled.push(pieceId);
      return taken;
    },
    onEnterSelect: (pieceId) => selected.push(pieceId),
    onTap: (pieceId) => tapped.push(pieceId),
    selecting: () => selecting,
  });
  return { drag, pulled, tapped, selected };
}
```

Then the new cases:

```ts
it('stillness enters select mode, and never drags out', () => {
  const { drag, pulled, selected } = harness();
  drag.down(4, at(10, 10, 0));

  drag.tick(SELECT_HOLD_MS - 1);
  expect(selected).toEqual([]);

  drag.tick(SELECT_HOLD_MS);
  expect(selected).toEqual([4]);
  expect(pulled).toEqual([]);
});

it('a vertical touch is the grid scrolling, not a drag', () => {
  const { drag, pulled } = harness();
  drag.down(4, touch(0, 0, 0));
  drag.move(touch(2, 40, 16));

  expect(pulled).toEqual([]);
  // Cleared, not left watching: a scroll that curves sideways is still a scroll.
  expect(drag.pressing).toBe(false);
});

it('a horizontal touch commits to the drag', () => {
  const { drag, pulled } = harness();
  drag.down(4, touch(0, 0, 0));
  drag.move(touch(-40, 2, 16));

  expect(pulled).toEqual([4]);
});

it('the axis check is touch only — mouse and pen keep 3a behaviour', () => {
  const { drag, pulled } = harness();
  drag.down(4, at(0, 0, 0));
  drag.move(at(0, 40, 16));

  expect(pulled).toEqual([4]);
});

it('in select mode a chip is a checkbox, never a handle', () => {
  const { drag, pulled } = harness(true, true);
  drag.down(4, at(0, 0, 0));
  drag.move(at(40, 0, 16));

  expect(pulled).toEqual([]);
});
```

Keep every other existing case as written — `uses the same thresholds as the mat`, `a press that goes nowhere is a tap`, `promotes exactly once`, `clears itself before handing over`, `watches one pointer only`, and `forgets everything on a cancel`. In `promotes exactly once`, change `drag.tick(1000)` to remain last; it now asserts that a promoted probe cannot also enter select mode.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/input/tray-drag.test.ts`
Expected: FAIL — `SELECT_HOLD_MS` is not exported from `@/input/tray-drag`.

- [ ] **Step 3: Implement**

In `src/input/tray-drag.ts`, change the import line and add the constant:

```ts
import { MOVE_THRESHOLD_PX } from './pointer';

/**
 * §06: stillness on a chip enters multi-select.
 *
 * Longer than the mat's `LONG_PRESS_MS` on purpose. 120ms is the right latency
 * for a piece coming up into the hand, and far too eager for a mode change the
 * player has to be *deciding* to make — at 120ms an ordinary hesitation before a
 * drag would put the tray into select mode instead.
 */
export const SELECT_HOLD_MS = 450;
```

Extend the options:

```ts
export interface TrayDragOptions {
  /**
   * The gesture became a drag. Return true if the piece was taken — false when
   * it could not be (already deployed, or a second finger is down), which
   * abandons the probe rather than leaving it half-promoted.
   */
  onPullOut: (pieceId: PieceId, event: PointerEvent) => boolean;
  /** Stillness past `SELECT_HOLD_MS`: enter multi-select with this chip as #1. */
  onEnterSelect?: (pieceId: PieceId) => void;
  /** Under both thresholds and released: a tap on the chip, not a drag. */
  onTap?: (pieceId: PieceId, event: PointerEvent) => void;
  /** True while the tray is in select mode. Asked, never cached. */
  selecting?: () => boolean;
}
```

Replace `move`:

```ts
move(event: PointerEvent): void {
  const probe = this.probe;
  if (!probe || event.pointerId !== this.pointerId) return;

  const dx = event.clientX - probe.x;
  const dy = event.clientY - probe.y;
  if (Math.hypot(dx, dy) < MOVE_THRESHOLD_PX) return;

  // In select mode the chip is a checkbox and nothing else.
  if (this.options.selecting?.()) {
    this.clear();
    return;
  }

  // The chip cedes the vertical axis to the browser (`touch-action: pan-y`), so
  // a vertical touch is the grid scrolling and must not become a drag.
  //
  // Cleared rather than left watching: a scroll that later curves sideways is
  // still a scroll, and promoting mid-flick would pull a piece out from under a
  // finger that was reading the tray.
  //
  // Touch only, deliberately. A mouse never scrolls from a drag, so applying the
  // check there would leave the desktop build with a dead gesture — and would
  // quietly rewrite what the Playwright suite measures.
  if (event.pointerType === 'touch' && Math.abs(dy) >= Math.abs(dx)) {
    this.clear();
    return;
  }

  this.promote(probe, event);
}
```

Replace `tick`, and delete `syntheticEvent` entirely:

```ts
/**
 * Driven from the frame loop, exactly as the board's long press is.
 *
 * Stillness is multi-select now, not drag-out. A finger that has not moved is
 * deciding *which pieces*, not which piece — and §06 has no other input to spend
 * on entering the mode.
 */
tick(nowMs: number): void {
  const probe = this.probe;
  if (!probe || nowMs - probe.t < SELECT_HOLD_MS) return;
  this.clear();
  this.options.onEnterSelect?.(probe.pieceId);
}
```

Update the file's header comment: the sentence naming `LONG_PRESS_MS` as an imported threshold is now false. Replace that paragraph with:

```
 * The chip shares `MOVE_THRESHOLD_PX` with the board — imported rather than
 * restated, because two copies of 6 would drift and the drift would present as
 * "the tray feels different from the mat". It does **not** share the board's
 * `LONG_PRESS_MS`: §06 spends stillness on multi-select, so the chip's hold is
 * `SELECT_HOLD_MS` and means something else entirely.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/input/tray-drag.test.ts && npm run typecheck`
Expected: PASS, and no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/input/tray-drag.ts test/input/tray-drag.test.ts
git commit -m "Stillness selects, movement drags, and the chip cedes the vertical axis"
```

---

# Task 2: TraySelection

**Files:**
- Create: `src/tray/selection.ts`
- Test: `test/tray/selection.test.ts`

**Interfaces:**
- Consumes: `PieceId` from `@/cut/types`.
- Produces: `class TraySelection` with `size: number`, `ordered: readonly PieceId[]`, `has(id): boolean`, `badgeOf(id): number` (1-based, `0` when absent), `toggle(id): void`, `remove(id): void`, `clear(): void`.

- [ ] **Step 1: Write the failing test**

Create `test/tray/selection.test.ts`:

```ts
/**
 * The selection set (§06).
 *
 * The load-bearing property is that **selection is over pieces, not over the
 * view**. A lens change is a change of what is on screen and nothing else, so a
 * selected piece the new lens hides is still selected and still counts toward
 * the pull-out total. Anything else and a player who selects five edges, checks
 * the colour bins, and comes back finds an empty selection.
 */

import { describe, expect, it } from 'vitest';
import { TraySelection } from '@/tray/selection';

describe('TraySelection', () => {
  it('keeps selection order, which is what the badges render', () => {
    const selection = new TraySelection();
    selection.toggle(30);
    selection.toggle(7);
    selection.toggle(19);

    expect(selection.ordered).toEqual([30, 7, 19]);
    expect(selection.badgeOf(7)).toBe(2);
  });

  it('badges are 1-based, and 0 means not selected', () => {
    const selection = new TraySelection();
    selection.toggle(4);

    expect(selection.badgeOf(4)).toBe(1);
    expect(selection.badgeOf(5)).toBe(0);
  });

  it('toggling off closes the gap in the badge numbers', () => {
    const selection = new TraySelection();
    selection.toggle(1);
    selection.toggle(2);
    selection.toggle(3);
    selection.toggle(2);

    expect(selection.ordered).toEqual([1, 3]);
    expect(selection.badgeOf(3)).toBe(2);
  });

  it('re-selecting a piece puts it at the end, not back in its old slot', () => {
    const selection = new TraySelection();
    selection.toggle(1);
    selection.toggle(2);
    selection.toggle(1);
    selection.toggle(1);

    expect(selection.ordered).toEqual([2, 1]);
  });

  it('remove is idempotent and never throws on a stranger', () => {
    const selection = new TraySelection();
    selection.toggle(8);
    selection.remove(8);
    selection.remove(8);
    selection.remove(99);

    expect(selection.size).toBe(0);
  });

  it('clear empties it', () => {
    const selection = new TraySelection();
    selection.toggle(1);
    selection.toggle(2);
    selection.clear();

    expect(selection.ordered).toEqual([]);
    expect(selection.has(1)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/tray/selection.test.ts`
Expected: FAIL — cannot resolve `@/tray/selection`.

- [ ] **Step 3: Implement**

Create `src/tray/selection.ts`:

```ts
/**
 * The tray's multi-select set (§06).
 *
 * An *ordered* set, because §06 specifies numbered order badges — "selected
 * pieces show a numbered order badge" — and a badge is only meaningful if the
 * order is the one the player built.
 *
 * It holds ids and nothing else. **Selection is over pieces, not over the
 * current view**: a lens change alters what is on screen and must not alter what
 * is selected, or checking the colour bins mid-selection would silently discard
 * the player's work.
 *
 * DOM-free, like every other file in `tray/` with a decision in it.
 */

import type { PieceId } from '@/cut/types';

export class TraySelection {
  private ids: PieceId[] = [];

  get size(): number {
    return this.ids.length;
  }

  /** Selection order — the order the badges count in. */
  get ordered(): readonly PieceId[] {
    return this.ids;
  }

  has(id: PieceId): boolean {
    return this.ids.includes(id);
  }

  /** 1-based badge number, or 0 when the piece is not selected. */
  badgeOf(id: PieceId): number {
    return this.ids.indexOf(id) + 1;
  }

  toggle(id: PieceId): void {
    if (this.has(id)) this.remove(id);
    else this.ids.push(id);
  }

  remove(id: PieceId): void {
    const index = this.ids.indexOf(id);
    if (index >= 0) this.ids.splice(index, 1);
  }

  clear(): void {
    this.ids = [];
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/tray/selection.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/tray/selection.ts test/tray/selection.test.ts
git commit -m "The tray's selection set, ordered because the badges are numbered"
```

---

# Task 3: WorksetStore

**Files:**
- Create: `src/play/workset.ts`
- Test: `test/play/workset.test.ts`

**Interfaces:**
- Consumes: `PieceId` from `@/cut/types`, `Rect` from `@/core/geom`.
- Produces:
  - `interface Workset { id: number; label: string; pieceIds: PieceId[]; collapsed: boolean }`
  - `const WORKSET_DROP_TOLERANCE: number`
  - `class WorksetStore` — `create(pieceIds: PieceId[], label?: string): number`, `get(id): Workset | undefined`, `all(): readonly Workset[]`, `worksetOf(pieceId): Workset | undefined`, `remove(pieceId): void`, `dissolve(id): void`, `setCollapsed(id, collapsed): void`, `rename(id, label): void`, `isHidden(pieceId): boolean`
  - `function worksetBounds(pieceIds: readonly PieceId[], boxOf: (id: PieceId) => Rect | null): Rect | null`
  - `function escapedBounds(box: Rect, bounds: Rect, tolerance: number): boolean`

**This is the step's load-bearing test file.** Its central assertion is *a piece is in at most one Workset, and membership ends on merge*, because that failure is silent: a placed piece still counted in a group draws an outline stretching into the assembled board, with nothing on screen to explain it and no error anywhere.

- [ ] **Step 1: Write the failing test**

Create `test/play/workset.test.ts`:

```ts
/**
 * Worksets (§06's pull-out), and the invariant the whole feature rests on.
 *
 * A Workset is **not a cluster.** §05's island is a welded group holding true
 * relative offsets; §06's pull-out group is a loose grid that deliberately does
 * not. Making pull-out a union-find cluster would hand `snap.ts` geometry that
 * is wrong by construction, and it would resolve against it with no error raised
 * and nothing drawn differently — the same silent class of failure that
 * `SnapOptions.eligible` exists to prevent.
 *
 * So the load-bearing assertion here is `membership ends on merge`. A placed
 * piece still counted in a group draws a containing outline stretching into the
 * assembled board: wrong on screen, silent everywhere else.
 */

import { describe, expect, it } from 'vitest';
import type { Rect } from '@/core/geom';
import {
  WORKSET_DROP_TOLERANCE,
  WorksetStore,
  escapedBounds,
  worksetBounds,
} from '@/play/workset';

const box = (x: number, y: number, w = 1, h = 1): Rect => ({ x, y, w, h });

describe('WorksetStore', () => {
  it('a piece is in at most one Workset', () => {
    const store = new WorksetStore();
    store.create([1, 2, 3]);
    const second = store.create([3, 4, 5]);

    expect(store.worksetOf(3)?.id).toBe(second);
    expect(store.all().find((w) => w.id !== second)?.pieceIds).toEqual([1, 2]);
  });

  it('membership ends on merge — the silent failure this file exists for', () => {
    const store = new WorksetStore();
    const id = store.create([1, 2, 3]);

    store.remove(2);

    expect(store.worksetOf(2)).toBeUndefined();
    expect(store.get(id)?.pieceIds).toEqual([1, 3]);
  });

  it('dissolves below two members, because a group of one is not a group', () => {
    const store = new WorksetStore();
    const id = store.create([1, 2]);

    store.remove(1);

    expect(store.get(id)).toBeUndefined();
    expect(store.worksetOf(2)).toBeUndefined();
    expect(store.all()).toEqual([]);
  });

  it('auto-labels in sequence, and rename sticks', () => {
    const store = new WorksetStore();
    const first = store.create([1, 2]);
    const second = store.create([3, 4]);

    expect(store.get(first)?.label).toBe('Set 1');
    expect(store.get(second)?.label).toBe('Set 2');

    store.rename(first, 'the roof');
    expect(store.get(first)?.label).toBe('the roof');
  });

  it('refuses to create a group of fewer than two', () => {
    const store = new WorksetStore();
    expect(store.create([1])).toBe(-1);
    expect(store.all()).toEqual([]);
  });

  it('hides its members only while collapsed', () => {
    const store = new WorksetStore();
    const id = store.create([1, 2]);

    expect(store.isHidden(1)).toBe(false);
    store.setCollapsed(id, true);
    expect(store.isHidden(1)).toBe(true);
    expect(store.isHidden(9)).toBe(false);

    store.setCollapsed(id, false);
    expect(store.isHidden(1)).toBe(false);
  });
});

describe('worksetBounds', () => {
  it('is the bounding box of the members it can locate', () => {
    const boxes = new Map<number, Rect>([
      [1, box(0, 0)],
      [2, box(4, 3)],
    ]);

    expect(worksetBounds([1, 2], (id) => boxes.get(id) ?? null)).toEqual({
      x: 0,
      y: 0,
      w: 5,
      h: 4,
    });
  });

  it('is null when nothing can be located', () => {
    expect(worksetBounds([1, 2], () => null)).toBeNull();
  });
});

describe('escapedBounds', () => {
  const bounds = box(0, 0, 10, 10);

  it('a piece inside the box has not escaped', () => {
    expect(escapedBounds(box(4, 4), bounds, WORKSET_DROP_TOLERANCE)).toBe(false);
  });

  it('a piece just outside is still within tolerance', () => {
    expect(escapedBounds(box(10.5, 4), bounds, WORKSET_DROP_TOLERANCE)).toBe(false);
  });

  it('a piece dragged clear across the mat has escaped', () => {
    expect(escapedBounds(box(40, 4), bounds, WORKSET_DROP_TOLERANCE)).toBe(true);
  });

  /**
   * The project's own rule: *a test that passes at both extremes of the constant
   * it is guarding is not testing that constant.* This one fails at zero and at
   * infinity, so the tolerance is genuinely load-bearing here.
   */
  it('the tolerance actually decides — it is not slack', () => {
    const just = box(11.5, 4);
    expect(escapedBounds(just, bounds, 0)).toBe(true);
    expect(escapedBounds(just, bounds, Infinity)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/play/workset.test.ts`
Expected: FAIL — cannot resolve `@/play/workset`.

- [ ] **Step 3: Implement**

Create `src/play/workset.ts`:

```ts
/**
 * Worksets — §06's pull-out, and the one place the design doc's "island" splits
 * into two objects.
 *
 * §05's island is a **welded** cluster: pieces that snapped together off-board,
 * holding their true relative offsets, produced by `Board.merge` and dragged,
 * rotated and snapped by identical rules. §06's pull-out island is a **loose
 * grid** that deliberately does not hold those offsets.
 *
 * They cannot be one object. A pull-out cluster's internal offsets are wrong by
 * construction, so `snap.ts` — which computes every candidate's error from the
 * dragged cluster's frame — would resolve against false geometry, silently. And
 * dragging one of the twelve would drag all twelve, which is the exact opposite
 * of §06's "immediately workable".
 *
 * So a Workset is a **label over ordinary one-piece clusters**. `snap.ts` and
 * `board.ts` are not aware of this file, and must never become aware of it.
 *
 * **A Workset stores no position.** Its position *is* its members' positions,
 * and its outline is derived from them every frame. A stored group position
 * would be a second source of truth for where things are, and it would disagree
 * with the pieces the first time a member was dragged.
 */

import type { Rect } from '@/core/geom';
import type { PieceId } from '@/cut/types';

/**
 * How far outside its group's box a released piece may sit and still belong.
 *
 * World units, in the same family as snap tolerance and for the same reason: it
 * scales with piece size and never with zoom, so a player who zooms in has not
 * changed what counts as leaving the group.
 */
export const WORKSET_DROP_TOLERANCE = 1.0;

export interface Workset {
  id: number;
  label: string;
  /** Membership, in selection order. */
  pieceIds: PieceId[];
  collapsed: boolean;
}

export class WorksetStore {
  private readonly groups = new Map<number, Workset>();
  private readonly of = new Map<PieceId, number>();
  private nextId = 1;
  private nextLabel = 1;

  /**
   * Group these pieces. Returns the new id, or -1 for a group of fewer than two.
   *
   * A piece already in another Workset leaves it here — membership is exclusive,
   * and the newest intent wins.
   */
  create(pieceIds: readonly PieceId[], label?: string): number {
    if (pieceIds.length < 2) return -1;

    for (const pieceId of pieceIds) this.remove(pieceId);

    const id = this.nextId++;
    this.groups.set(id, {
      id,
      label: label ?? `Set ${this.nextLabel++}`,
      pieceIds: [...pieceIds],
      collapsed: false,
    });
    for (const pieceId of pieceIds) this.of.set(pieceId, id);
    return id;
  }

  get(id: number): Workset | undefined {
    return this.groups.get(id);
  }

  all(): readonly Workset[] {
    return [...this.groups.values()];
  }

  worksetOf(pieceId: PieceId): Workset | undefined {
    const id = this.of.get(pieceId);
    return id === undefined ? undefined : this.groups.get(id);
  }

  /**
   * A piece leaves its group — merged into a cluster, returned to the tray, or
   * dragged clear of the box. All three end the same way, on purpose: there is
   * one exit, so there is one place to get it wrong.
   */
  remove(pieceId: PieceId): void {
    const id = this.of.get(pieceId);
    if (id === undefined) return;

    this.of.delete(pieceId);
    const group = this.groups.get(id);
    if (!group) return;

    group.pieceIds = group.pieceIds.filter((each) => each !== pieceId);
    // A group of one is not a group.
    if (group.pieceIds.length < 2) this.dissolve(id);
  }

  dissolve(id: number): void {
    const group = this.groups.get(id);
    if (!group) return;
    for (const pieceId of group.pieceIds) this.of.delete(pieceId);
    this.groups.delete(id);
  }

  setCollapsed(id: number, collapsed: boolean): void {
    const group = this.groups.get(id);
    if (group) group.collapsed = collapsed;
  }

  rename(id: number, label: string): void {
    const group = this.groups.get(id);
    if (group) group.label = label;
  }

  /**
   * Is this piece inside a collapsed group?
   *
   * Honoured in **two** places or the board disagrees with itself: `scene()` must
   * not draw it and `rebuild()` must not index it. Draw without indexing and the
   * piece cannot be touched; index without drawing and the player grabs
   * something invisible.
   */
  isHidden(pieceId: PieceId): boolean {
    return this.worksetOf(pieceId)?.collapsed ?? false;
  }
}

/** The bounding box of whatever members can be located, or null for none. */
export function worksetBounds(
  pieceIds: readonly PieceId[],
  boxOf: (id: PieceId) => Rect | null,
): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pieceId of pieceIds) {
    const box = boxOf(pieceId);
    if (!box) continue;
    if (box.x < minX) minX = box.x;
    if (box.y < minY) minY = box.y;
    if (box.x + box.w > maxX) maxX = box.x + box.w;
    if (box.y + box.h > maxY) maxY = box.y + box.h;
  }

  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Has this piece been dragged clear of its group?
 *
 * Measured against the group's box grown by `tolerance` on every side. The
 * alternative — permanent membership until dismissed — lets one wandering piece
 * stretch the outline across the whole mat, which reads as a rendering bug
 * rather than as information.
 */
export function escapedBounds(box: Rect, bounds: Rect, tolerance: number): boolean {
  return (
    box.x + box.w < bounds.x - tolerance ||
    box.x > bounds.x + bounds.w + tolerance ||
    box.y + box.h < bounds.y - tolerance ||
    box.y > bounds.y + bounds.h + tolerance
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/play/workset.test.ts && npm run typecheck`
Expected: PASS (12 tests), no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/play/workset.ts test/play/workset.test.ts
git commit -m "Worksets: a label over loose clusters, never a union-find merge"
```

---

# Task 4: gridLayout

**Files:**
- Create: `src/play/layout.ts`
- Test: `test/play/layout.test.ts`

**Interfaces:**
- Consumes: `Point`, `Rect` from `@/core/geom`.
- Produces: `const PULL_OUT_SPACING: { loose: number; tight: number }`; `function gridLayout(n: number, pieceW: number, pieceH: number, safe: Rect): Point[]` returning **bitmap-origin (top-left) positions in world units**.

- [ ] **Step 1: Write the failing test**

Create `test/play/layout.test.ts`:

```ts
/**
 * Where pulled-out pieces land (§06: "auto-arranged in a loose grid so they are
 * immediately workable").
 *
 * The rect passed in is the **safe** rect — the viewport minus the dock or the
 * sheet — never the viewport. On a phone the centre of the board canvas is
 * underneath the sheet, so centring on the viewport would deal every pulled-out
 * piece behind the tray. `BoardPage.matPoint()` exists for exactly this reason.
 */

import { describe, expect, it } from 'vitest';
import type { Rect } from '@/core/geom';
import { PULL_OUT_SPACING, gridLayout } from '@/play/layout';

const safe: Rect = { x: 0, y: 0, w: 40, h: 30 };

describe('gridLayout', () => {
  it('lays n pieces out and returns n origins', () => {
    expect(gridLayout(9, 1, 1, safe)).toHaveLength(9);
    expect(gridLayout(0, 1, 1, safe)).toEqual([]);
  });

  it('never overlaps two pieces', () => {
    const origins = gridLayout(12, 1, 1, safe);

    for (let a = 0; a < origins.length; a++) {
      for (let b = a + 1; b < origins.length; b++) {
        const apart =
          Math.abs(origins[a]!.x - origins[b]!.x) >= 1 ||
          Math.abs(origins[a]!.y - origins[b]!.y) >= 1;
        expect(apart, `pieces ${a} and ${b} overlap`).toBe(true);
      }
    }
  });

  it('centres the block on the safe rect, not on the origin', () => {
    const origins = gridLayout(4, 1, 1, safe);
    const midX = origins.reduce((sum, p) => sum + p.x + 0.5, 0) / origins.length;
    const midY = origins.reduce((sum, p) => sum + p.y + 0.5, 0) / origins.length;

    expect(midX).toBeCloseTo(safe.x + safe.w / 2, 5);
    expect(midY).toBeCloseTo(safe.y + safe.h / 2, 5);
  });

  it('uses loose spacing when the block fits', () => {
    const origins = gridLayout(4, 1, 1, safe);
    const stride = Math.abs(origins[1]!.x - origins[0]!.x);

    expect(stride).toBeCloseTo(PULL_OUT_SPACING.loose, 5);
  });

  it('tightens before it overflows, and never past the tight bound', () => {
    // 25 pieces at loose spacing need 5 x 1.15 = 5.75 units; the rect is 5.
    const cramped: Rect = { x: 0, y: 0, w: 5, h: 5 };
    const origins = gridLayout(25, 1, 1, cramped);
    const stride = Math.abs(origins[1]!.x - origins[0]!.x);

    expect(stride).toBeLessThan(PULL_OUT_SPACING.loose);
    expect(stride).toBeGreaterThanOrEqual(PULL_OUT_SPACING.tight);
  });

  it('overflows rather than stacking, when even tight will not fit', () => {
    const tiny: Rect = { x: 0, y: 0, w: 2, h: 2 };
    const origins = gridLayout(25, 1, 1, tiny);
    const stride = Math.abs(origins[1]!.x - origins[0]!.x);

    // Pieces must still not overlap. A grid that does not fit is a grid the
    // player pans to, never a pile they cannot separate.
    expect(stride).toBeGreaterThanOrEqual(PULL_OUT_SPACING.tight);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/play/layout.test.ts`
Expected: FAIL — cannot resolve `@/play/layout`.

- [ ] **Step 3: Implement**

Create `src/play/layout.ts`:

```ts
/**
 * The pull-out arrangement (§06: "auto-arranged in a loose grid so they are
 * immediately workable").
 *
 * Pure and world-space. It is handed a **safe** rect — the viewport minus the
 * docked tray's width, or minus the sheet at its current detent — and never the
 * raw viewport. On a phone the sheet is a fixed overlay across the bottom of the
 * board canvas, so the canvas centre is underneath the tray: centring there
 * would deal every pulled-out piece behind the sheet, where a drop returns it to
 * the tray. That is the same trap `BoardPage.matPoint()` was written to avoid.
 *
 * The camera never moves as a result of this. Easing the camera toward a region
 * is §07 hint behaviour and belongs to step 4.
 */

import type { Point, Rect } from '@/core/geom';

/**
 * Piece-size multiples between grid origins.
 *
 * `loose` is the default and leaves visible air between pieces, so the
 * containing outline reads as a group rather than as a block. `tight` is the
 * floor: below 1.0 pieces would overlap, and a pile the player has to separate
 * is worse than a grid they have to pan to.
 */
export const PULL_OUT_SPACING = { loose: 1.15, tight: 1.02 };

/**
 * Bitmap-origin positions, in world units, for `n` pulled-out pieces.
 *
 * Row-major from the top-left of the block, and the block is centred on `safe`.
 */
export function gridLayout(n: number, pieceW: number, pieceH: number, safe: Rect): Point[] {
  if (n <= 0) return [];

  const columns = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / columns);

  const spacing = fittedSpacing(columns, rows, pieceW, pieceH, safe);
  const strideX = pieceW * spacing;
  const strideY = pieceH * spacing;

  // Measured across piece *centres*, so the block's own edges are half a piece
  // outside it — which is what makes the centring land where the eye expects.
  const spanX = (columns - 1) * strideX;
  const spanY = (rows - 1) * strideY;

  const firstX = safe.x + safe.w / 2 - spanX / 2 - pieceW / 2;
  const firstY = safe.y + safe.h / 2 - spanY / 2 - pieceH / 2;

  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      x: firstX + (i % columns) * strideX,
      y: firstY + Math.floor(i / columns) * strideY,
    });
  }
  return out;
}

/** Loose if the block fits, otherwise as loose as it can be, never below tight. */
function fittedSpacing(
  columns: number,
  rows: number,
  pieceW: number,
  pieceH: number,
  safe: Rect,
): number {
  const neededX = columns * pieceW;
  const neededY = rows * pieceH;
  if (neededX <= 0 || neededY <= 0) return PULL_OUT_SPACING.loose;

  const fits = Math.min(safe.w / neededX, safe.h / neededY);
  return Math.max(PULL_OUT_SPACING.tight, Math.min(PULL_OUT_SPACING.loose, fits));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/play/layout.test.ts && npm run typecheck`
Expected: PASS (6 tests), no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/play/layout.ts test/play/layout.test.ts
git commit -m "Pull-out grid, centred on the safe rect and never on the canvas"
```

---

# Task 5: Pinning — the lens filter and the tray model

**Files:**
- Modify: `src/tray/lenses.ts`, `src/tray/tray.ts`
- Test: `test/tray/lenses.test.ts` (extend), `test/tray/tray.test.ts` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces: `LensView` gains `pinned: ReadonlySet<PieceId>`. `TrayModel` gains `pin(id): void`, `unpin(id): void`, `isPinned(id): boolean`, `get pinned(): PieceId[]` (canonical order, tray residents only).

**Context.** §06: *"A pinned shelf row sits at the top of the tray and survives every lens."* A pinned piece is lifted out of the grid and appears once, on the shelf — the same thing placing a piece already does. Filtering preserves the subsequence property, so the invariant test still means what it means.

- [ ] **Step 1: Write the failing tests**

`test/tray/lenses.test.ts` already has everything needed. Its `view()` helper (line 47) spreads its overrides over defaults, so the `LensView` change costs **one line there and no changes at any call site**:

```ts
const view = (overrides: Partial<LensView> = {}): LensView => ({
  region: null,
  recent: new Set<number>(),
  pinned: new Set<number>(),
  ...overrides,
});
```

Then add two cases, reusing the file's existing `ORDER`, `build()`, `view()`, and `isSubsequence` — do not build new fixtures:

```ts
it('a pinned piece leaves every lens — the shelf is where it lives now', () => {
  const pieces = build();
  const v = view({ recent: new Set([13]), pinned: new Set([13]) });

  for (const lens of LENSES) {
    expect(visible(ORDER, pieces, lens, null, v), `${lens} showed a pinned piece`).not.toContain(13);
  }
});

it('pinning is still a filter, so the subsequence property holds', () => {
  const pieces = build();
  const out = visible(ORDER, pieces, 'all', null, view({ pinned: new Set([2, 7, 11]) }));

  expect(isSubsequence(out, ORDER)).toBe(true);
});
```

Add to `test/tray/tray.test.ts`, using its existing `model(locations?)` fixture (line 41):

```ts
it('the shelf is in canonical order, not pin order', () => {
  const tray = model();
  const first = tray.order[3]!;
  const second = tray.order[1]!;

  tray.pin(first);
  tray.pin(second);

  // Canonical, so the later-pinned piece comes first — the muscle memory §06
  // protects does not stop applying because there are two chips instead of 200.
  expect(tray.pinned).toEqual([second, first]);
});

it('a pinned piece is on the shelf and out of the grid', () => {
  const tray = model();
  const id = tray.order[0]!;
  tray.pin(id);

  expect(tray.pinned).toContain(id);
  expect(tray.visible('all', null, null)).not.toContain(id);

  tray.unpin(id);
  expect(tray.visible('all', null, null)).toContain(id);
});

it('a piece that leaves the tray leaves the shelf, and does not come back pinned', () => {
  const locations = new Map<number, PieceLocation>();
  const tray = model(locations);
  const id = tray.order[0]!;

  tray.pin(id);
  locations.set(id, 'mat');
  tray.unpin(id);

  expect(tray.pinned).not.toContain(id);

  locations.set(id, 'tray');
  expect(tray.pinned).not.toContain(id);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/tray/`
Expected: FAIL — `pinned` is not a property of `LensView`; `tray.pin` is not a function.

> The `LensView` change is additive with a defaulted helper, so it should **not** cascade into other files. If typecheck reports construction sites outside `tray/`, that means someone built a `LensView` literal by hand — fix those to go through a helper rather than adding the field in five places.

- [ ] **Step 3: Implement**

In `src/tray/lenses.ts`, extend `LensView`:

```ts
export interface LensView {
  /**
   * The visible world rectangle, or null when the Region lens is locked.
   *
   * Locked below 1.5× because below that the "region" is most of the board and
   * the lens filters nothing — offering it there would teach the player it does
   * not work.
   */
  region: Rect | null;
  /** Membership only. Recency is not an order here — see `recent.ts`. */
  recent: ReadonlySet<PieceId>;
  /**
   * Pinned to the shelf (§06), and therefore out of every lens.
   *
   * The shelf "survives every lens", which means the shelf is a region rather
   * than a filter — so a pinned chip is lifted out of the grid and rendered once,
   * above it. Two copies of one chip would raise a question the player should
   * never have to answer: which one am I dragging?
   *
   * This is still a filter and not a sort, so the subsequence property is intact.
   */
  pinned: ReadonlySet<PieceId>;
}
```

In `keeps`, add the pinned test **first**, before the `recent` branch:

```ts
function keeps(piece: LensPiece, lens: Lens, arg: number | null, view: LensView): boolean {
  // Before everything, including Recent: the shelf is a region of the tray, and
  // a piece cannot be in two regions at once.
  if (view.pinned.has(piece.id)) return false;

  // Recent is the one lens that reaches onto the mat — finding a piece you put
  // down and lost is the entire reason it exists.
  if (lens === 'recent') return view.recent.has(piece.id);
  if (piece.location !== 'tray') return false;

  // …unchanged…
}
```

In `src/tray/tray.ts`, add the field, the methods, and the `view` change:

```ts
  private readonly pinned_ = new Set<PieceId>();
```

```ts
  /**
   * Pin to the shelf (§06): "drag a piece there to say I am working on this one."
   *
   * An attribute of a tray piece, never a fourth location — a piece is still in
   * exactly one of `tray`, `mat`, or placed, and `PlaySession` remains the sole
   * authority on which.
   */
  pin(id: PieceId): void {
    if (this.locationOf(id) === 'tray') this.pinned_.add(id);
  }

  unpin(id: PieceId): void {
    this.pinned_.delete(id);
  }

  isPinned(id: PieceId): boolean {
    return this.pinned_.has(id);
  }

  /**
   * The shelf, in canonical order.
   *
   * Canonical and not pin order, deliberately: the shelf is a smaller tray, and
   * the muscle memory §06 is protecting does not stop applying because there are
   * four chips instead of two hundred.
   */
  get pinned(): PieceId[] {
    return this.order_.filter(
      (id) => this.pinned_.has(id) && this.options.locationOf(id) === 'tray',
    );
  }
```

Update `view` to publish it:

```ts
  private view(region: Rect | null): LensView {
    return { region, recent: this.recent_.ids, pinned: this.pinned_ };
  }
```

And in `place`, drop the pin along with the recency — a placed piece is not on the shelf:

```ts
  /** A piece landed on the board. "Touched but did not place" stops applying. */
  place(id: PieceId): void {
    this.recent_.forget(id);
    this.pinned_.delete(id);
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS across the whole unit suite — the `LensView` change touches every construction site, and they must all be updated.

- [ ] **Step 5: Commit**

```bash
git add src/tray/lenses.ts src/tray/tray.ts test/tray/
git commit -m "The shelf: pinning lifts a chip out of every lens, filtering not sorting"
```

---

# Task 6: PlaySession — worksets, hidden pieces, and pinned returns

**Files:**
- Modify: `src/play/session.ts`
- Test: `test/play/tray-deploy.test.ts` (extend — it already owns the tray boundary cases and has the fixture these need)

**Interfaces:**
- Consumes: `WorksetStore`, `worksetBounds`, `escapedBounds`, `WORKSET_DROP_TOLERANCE` from `@/play/workset`.
- Produces on `PlaySession`:
  - `readonly worksets: WorksetStore`
  - `deployMany(pieceIds: readonly PieceId[], origins: readonly Point[]): PieceId[]` — the ids actually deployed
  - `pullOut(pieceIds: readonly PieceId[], origins: readonly Point[]): number` — workset id, or `-1`
  - `returnToTray(clusterId: number, pin?: boolean): boolean`
  - `boxOf(pieceId: PieceId): Rect | null`
  - `groupBounds(worksetId: number): Rect | null`
  - `moveWorksetBy(worksetId: number, dx: number, dy: number): void`
- `PlayEvent` gains `{ type: 'return'; pieceId: PieceId; pinned: boolean }` (the `pinned` field is new) and `{ type: 'worksetChanged' }`.

- [ ] **Step 1: Write the failing test**

Add to `test/play/tray-deploy.test.ts`, using its existing `session(onEvent?)` fixture (line 53) and `id(col, row)` helper (line 63). The board there is 3×2:

```ts
describe('worksets', () => {
  /** Three ids that are not graph neighbours of each other, laid out apart. */
  const pulled = () => [id(0, 0), id(2, 0), id(1, 1)];
  const spread = [
    { x: 20, y: 20 },
    { x: 24, y: 20 },
    { x: 28, y: 20 },
  ];

  it('pull-out groups pieces without merging them', () => {
    const play = session();
    const group = play.pullOut(pulled(), spread);

    expect(group).toBeGreaterThan(0);
    // Three separate clusters, not one. A merge here is the silent bug this
    // whole file exists to catch.
    const [a, b] = pulled();
    expect(play.board.clusterIdOf(a!)).not.toBe(play.board.clusterIdOf(b!));
    expect(play.locationOf(a!)).toBe('mat');
    expect(play.worksets.get(group)?.pieceIds).toHaveLength(3);
  });

  it('a piece merged into the board leaves its workset', () => {
    const play = session();
    const group = play.pullOut(pulled(), spread);
    const [a] = pulled();

    // Drop it exactly on its own slot: the board frame bootstraps cluster 0, so
    // this places it.
    const piece = play.board.piece(a!);
    const cluster = play.board.clusterIdOf(a!);
    play.grab(cluster);
    play.board.moveCluster(cluster, piece.targetX, piece.targetY);
    play.release(cluster, { x: 0, y: 0 });

    expect(play.board.isPlaced(a!)).toBe(true);
    expect(play.worksets.worksetOf(a!)).toBeUndefined();
    expect(play.worksets.get(group)?.pieceIds).not.toContain(a);
  });

  it('a collapsed workset draws nothing and cannot be picked up', () => {
    const play = session();
    const group = play.pullOut(pulled(), spread);
    play.setWorksetCollapsed(group, true);

    const [a] = pulled();
    expect(play.scene().loose.map((p) => p.id)).not.toContain(a);
    expect(play.pickCluster({ x: 20.5, y: 20.5 })).toBeNull();
  });

  it('a pinned return puts the piece back in the tray, flagged', () => {
    const seen: string[] = [];
    const play = session((event) => {
      if (event.type === 'return') seen.push(`${event.pieceId}:${event.pinned}`);
    });

    const a = id(0, 0);
    const cluster = play.deploy(a, { x: 20, y: 20 })!;
    play.returnToTray(cluster, true);

    expect(play.locationOf(a)).toBe('tray');
    expect(seen).toEqual([`${a}:true`]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/play/`
Expected: FAIL — `session.pullOut` is not a function.

- [ ] **Step 3: Implement**

In `src/play/session.ts`:

Add the import and the field:

```ts
import { WORKSET_DROP_TOLERANCE, WorksetStore, escapedBounds, worksetBounds } from './workset';
```

```ts
  /**
   * §06's pull-out groups. Deliberately *not* clusters — see `workset.ts`.
   *
   * `board.ts` and `snap.ts` know nothing about this. It is consulted here, in
   * `scene()` and `rebuild()`, and nowhere else in the model.
   */
  readonly worksets = new WorksetStore();
```

Change the `return` event in `PlayEvent`:

```ts
  /** …and went back. `pinned` when it landed on the shelf rather than the grid. */
  | { type: 'return'; pieceId: PieceId; pinned: boolean }
  /** Membership or collapse changed; the chrome needs a repaint. */
  | { type: 'worksetChanged' };
```

Add the deploy-many and pull-out pair after `deploy`:

```ts
  /**
   * Deploy several pieces at once, each onto its own origin.
   *
   * Returns the ids that actually left the tray — a piece already on the mat is
   * skipped rather than moved, which keeps a double-fired pull-out harmless.
   */
  deployMany(pieceIds: readonly PieceId[], origins: readonly Point[]): PieceId[] {
    const taken: PieceId[] = [];

    pieceIds.forEach((pieceId, index) => {
      const origin = origins[index];
      if (!origin) return;
      if (!this.inTray.delete(pieceId)) return;

      const clusterId = this.board.clusterIdOf(pieceId);
      this.board.moveCluster(clusterId, origin.x, origin.y);
      taken.push(pieceId);
      this.emit({ type: 'deploy', pieceId, clusterId });
    });

    if (taken.length > 0) this.rebuild();
    return taken;
  }

  /**
   * §06's pull-out: deploy the selection and group it under one label.
   *
   * Returns the workset id, or -1 when fewer than two pieces made it out. It
   * **never merges** — the pieces are laid out in a grid, so their relative
   * offsets are wrong by construction and a union-find merge would hand
   * `resolveSnap` geometry that quietly resolves against nothing real.
   */
  pullOut(pieceIds: readonly PieceId[], origins: readonly Point[]): number {
    const taken = this.deployMany(pieceIds, origins);
    const id = this.worksets.create(taken);
    if (id !== -1) this.emit({ type: 'worksetChanged' });
    return id;
  }

  setWorksetCollapsed(worksetId: number, collapsed: boolean): void {
    this.worksets.setCollapsed(worksetId, collapsed);
    this.rebuild();
    this.emit({ type: 'worksetChanged' });
  }

  /** A piece's world box — what the group outline is built from. */
  boxOf(pieceId: PieceId): Rect | null {
    if (this.inTray.has(pieceId)) return null;
    const origin = this.board.worldOf(pieceId);
    const piece = this.board.piece(pieceId);
    return { x: origin.x, y: origin.y, w: piece.w, h: piece.h };
  }

  groupBounds(worksetId: number): Rect | null {
    const group = this.worksets.get(worksetId);
    if (!group) return null;
    return worksetBounds(group.pieceIds, (id) => this.boxOf(id));
  }

  /**
   * Drag a whole group by its label chip.
   *
   * A loop over members and nothing else, because a Workset stores no position
   * of its own. There is no group frame to keep in step.
   */
  moveWorksetBy(worksetId: number, dx: number, dy: number): void {
    const group = this.worksets.get(worksetId);
    if (!group) return;

    const moved = new Set<number>();
    for (const pieceId of group.pieceIds) {
      const clusterId = this.board.clusterIdOf(pieceId);
      if (moved.has(clusterId)) continue;
      moved.add(clusterId);
      this.board.moveClusterBy(clusterId, dx, dy);
      this.syncCluster(clusterId);
    }
  }
```

Change `returnToTray` to take the pin flag and drop membership:

```ts
  returnToTray(clusterId: number, pin = false): boolean {
    if (clusterId === BOARD_CLUSTER) return false;
    const cluster = this.board.cluster(clusterId);
    if (cluster.pieceIds.length !== 1) return false;

    const pieceId = cluster.pieceIds[0]!;
    if (this.held === clusterId) this.held = null;
    this.cancelSettlesFor(clusterId);
    this.inTray.add(pieceId);
    // Back in the tray is out of the group. One of the three exits in §06.
    this.worksets.remove(pieceId);
    this.rebuild();

    this.emit({ type: 'return', pieceId, pinned: pin });
    return true;
  }
```

In `release`, after the successful-snap branch's `applySnap` call and before `startSettle`, drop every merged piece out of its group — merging is the first of the three exits:

```ts
    // Merged is out of the group (§06). Done here rather than in `board.ts`,
    // which must stay unaware that Worksets exist at all.
    for (const pieceId of pieceIds) this.worksets.remove(pieceId);
    this.emit({ type: 'worksetChanged' });
```

Still in `release`, in the **miss** branch, apply the proximity rule before `this.emit({ type: 'miss' })`:

```ts
    // §06's third exit: released clear of its group's box, the piece leaves it.
    // World-space, so zooming in has not changed what counts as leaving.
    for (const pieceId of pieceIds) {
      const group = this.worksets.worksetOf(pieceId);
      if (!group) continue;
      const others = group.pieceIds.filter((id) => id !== pieceId);
      const bounds = worksetBounds(others, (id) => this.boxOf(id));
      const box = this.boxOf(pieceId);
      if (!bounds || !box) continue;
      if (escapedBounds(box, bounds, WORKSET_DROP_TOLERANCE)) {
        this.worksets.remove(pieceId);
        this.emit({ type: 'worksetChanged' });
      }
    }
```

In `rebuild`, add the hidden test alongside the tray test:

```ts
      // Tray pieces likewise — they are not on the mat to be touched.
      if (this.inTray.has(piece.id)) continue;
      // A collapsed group's members are not drawn, so they must not be pickable
      // either — index one without drawing it and the player grabs thin air.
      if (this.worksets.isHidden(piece.id)) continue;
```

In `scene`, the same, right after the `inTray` check:

```ts
      if (this.inTray.has(piece.id)) continue;
      // Collapsed to the chip, to reclaim mat space (§05).
      if (this.worksets.isHidden(piece.id)) continue;
```

And in `contentBounds`, skip hidden pieces too, so collapsing actually reclaims the space a fit would frame:

```ts
      if (this.inTray.has(piece.id)) continue;
      if (this.worksets.isHidden(piece.id)) continue;
```

Finally, extend the class docstring near `inTray` to name the second predicate, since a future reader needs to find both:

```
   * Two predicates gate the mat: `inTray` and `worksets.isHidden`. Both are
   * consulted in `rebuild`, `scene`, and `contentBounds`, and honouring one
   * without the other is how the board comes to disagree with itself.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: PASS. Any existing caller of `returnToTray` still compiles — the new parameter has a default.

- [ ] **Step 5: Commit**

```bash
git add src/play/session.ts test/play/
git commit -m "Session: pull-out, the two exits from a group, and hidden pieces"
```

---

# Task 7: Scene and renderer — the containing outline and label chip

**Files:**
- Modify: `src/render/scene.ts`, `src/render/renderer.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `interface SceneGroup { id: number; label: string; collapsed: boolean; bounds: Rect; kind: 'workset' | 'island' }`; `Scene` gains `groups: SceneGroup[]`; `emptyScene` returns `groups: []`. `Renderer` gains private `drawGroupOutlines` and `drawGroupChips`.

**Context.** §05: *"islands render with a faint containing outline and a mono label chip, and they can be collapsed to that chip."* Both kinds render identically, which is what keeps the two-object split of Task 3 invisible to the player.

- [ ] **Step 1: Extend the scene contract**

In `src/render/scene.ts`, add the import and the type:

```ts
import type { CubicPath, Rect } from '@/core/geom';
```

```ts
/**
 * A group drawn on the mat — §05's island, or §06's pull-out Workset.
 *
 * **Both kinds render identically**, deliberately. The model has two objects
 * because a pull-out group's internal offsets are wrong by construction and must
 * never reach the union-find; the player has one concept, and this is where that
 * stays true.
 */
export interface SceneGroup {
  id: number;
  label: string;
  collapsed: boolean;
  /** World units. The members' bounding box, or the chip's box when collapsed. */
  bounds: Rect;
  kind: 'workset' | 'island';
}
```

In `Scene`, after `loose`:

```ts
  /** Containing outlines and label chips. Drawn with the dynamic layer. */
  groups: SceneGroup[];
```

And in `emptyScene`, add `groups: [],` after `loose: [],`.

- [ ] **Step 2: Run typecheck to see every site that must be updated**

Run: `npm run typecheck`
Expected: FAIL, listing each `Scene` literal missing `groups`. Fix each by adding `groups: []` (or the real value, in `PlaySession.scene`).

- [ ] **Step 3: Draw them**

In `src/render/renderer.ts`, extend `paintDynamic` so outlines go **under** the loose pieces and chips **over** them — one layer, correct z-order, no feature split across two canvases.

`layerContext` already sets the device-pixel transform (`ctx.setTransform(this.pixelRatio, …)`, line 177) and `applyCamera` scales and translates on top of it. So the camera has to be wound back before the chips are drawn, which is what the `save`/`restore` pair is for:

```ts
  private paintDynamic(): void {
    const ctx = this.layerContext('dynamic');
    // …keep whatever clearRect line is already here…
    ctx.save();
    this.applyCamera(ctx);
    this.drawGroupOutlines(ctx);
    this.stats.lastDynamicCount = this.drawPieces(ctx, this.scene.loose);
    ctx.restore();
    // Camera unwound; the device-pixel transform is back. Screen space from here.
    this.drawGroupChips(ctx);
  }
```

> Preserve the existing `clearRect` (or equivalent) exactly as written. The only changes are the `save`/`restore` pair and the two new calls.

Add the two methods next to `drawBoardOutline`:

```ts
  /**
   * The faint containing outline (§05).
   *
   * Under the pieces on purpose: it is a surface the group sits on, not a box
   * drawn around it. Line width is divided by zoom so it stays a hairline at
   * every scale, the same way the board outline does.
   */
  private drawGroupOutlines(ctx: CanvasRenderingContext2D): void {
    const groups = this.scene.groups;
    if (groups.length === 0) return;

    const zoom = this.camera.zoom;
    ctx.save();
    for (const group of groups) {
      const pad = group.collapsed ? 0 : 0.25;
      const { x, y, w, h } = group.bounds;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      ctx.roundRect(x - pad, y - pad, w + pad * 2, h + pad * 2, 0.2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * The mono label chip (§05), and the whole of a collapsed group.
   *
   * Drawn in *screen* space rather than world space: a label that scaled with
   * zoom would be unreadable at 0.5× and absurd at 4×, and it is a piece of
   * chrome about the group rather than a thing lying on the mat. It is also the
   * first non-piece hit target in the app — `PlayRuntime` tests these same rects.
   */
  private drawGroupChips(ctx: CanvasRenderingContext2D): void {
    const groups = this.scene.groups;
    if (groups.length === 0) return;

    ctx.save();
    ctx.font = '11px ui-monospace, monospace';
    ctx.textBaseline = 'middle';

    for (const group of groups) {
      const at = worldToScreen(this.camera, this.viewport, {
        x: group.bounds.x,
        y: group.bounds.y,
      });
      const text = group.collapsed ? `${group.label} ⌄` : group.label;
      const w = ctx.measureText(text).width + 16;
      const h = 22;
      const x = at.x;
      const y = at.y - h - 4;

      ctx.fillStyle = 'rgba(20, 20, 22, 0.86)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
      ctx.fillText(text, x + 8, y + h / 2);
    }
    ctx.restore();
  }
```

Verified against the current file: `this.scene` (line 58), `this.camera` (line 59), `this.viewport`, and `this.pixelRatio` (line 146) all exist under those names, and `worldToScreen` is exported from `@/render/camera` (line 42) — add it to the existing camera import. **`this.size` and `this.dpr` do not exist**; do not introduce them.

The chip font is plain `ui-monospace` rather than `var(--font-data)`: canvas `ctx.font` does not resolve CSS custom properties, and a `var()` there silently falls back to the default font with no error — exactly the kind of quiet wrongness §13's token rule is otherwise good at preventing.

- [ ] **Step 4: Verify**

Run: `npm test && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/render/scene.ts src/render/renderer.ts src/play/session.ts
git commit -m "Groups on the scene: containing outline under, label chip over"
```

---

# Task 8: PlaySession.scene emits groups, and the runtime wires pull-out

**Files:**
- Modify: `src/play/session.ts`, `src/play/runtime.ts`

**Interfaces:**
- Consumes: `gridLayout` from `@/play/layout`; `SceneGroup` from `@/render/scene`; `screenToWorld` (already imported in `runtime.ts`).
- Produces on `PlayRuntime`: `pullOut(pieceIds: readonly PieceId[]): number`, `safeWorldRect(insets: { left: number; right: number; top: number; bottom: number }): Rect`, `setTrayInsets(insets): void`, `groupChipAt(screen: Point): number | null`, `toggleGroupCollapsed(id: number): void`.

- [ ] **Step 1: Emit groups from the scene**

In `PlaySession.scene()`, build the groups before the return:

```ts
    const groups: SceneGroup[] = [];
    for (const group of this.worksets.all()) {
      const bounds = worksetBounds(group.pieceIds, (id) => this.boxOf(id));
      if (!bounds) continue;
      groups.push({
        id: group.id,
        label: group.label,
        collapsed: group.collapsed,
        // A collapsed group has no drawn members, so its box is the chip's
        // anchor and nothing more — the outline shrinks to the label.
        bounds: group.collapsed ? { ...bounds, w: 0, h: 0 } : bounds,
        kind: 'workset',
      });
    }
```

The collapsed case needs the bounds of members that `boxOf` still returns — it does, because `boxOf` only excludes tray pieces, and a hidden piece is on the mat. Add `groups` to the returned object.

- [ ] **Step 2: Wire the runtime**

In `src/play/runtime.ts`, add the insets field and the safe rect:

```ts
  /**
   * How much of the canvas the chrome is sitting on top of, in CSS pixels.
   *
   * The docked tray is a flex sibling and takes its width out of the canvas, so
   * it contributes nothing here. The iPhone sheet is a fixed overlay *across* the
   * canvas, so it contributes its height — and getting this wrong deals every
   * pulled-out piece behind the sheet, where a drop returns it to the tray.
   */
  private insets = { left: 0, right: 0, top: 0, bottom: 0 };

  setTrayInsets(insets: { left: number; right: number; top: number; bottom: number }): void {
    this.insets = insets;
  }

  /** The part of the mat the player can actually see and reach, in world units. */
  safeWorldRect(): Rect {
    const size = this.viewport;
    const topLeft = screenToWorld(this.camera, size, {
      x: this.insets.left,
      y: this.insets.top,
    });
    const bottomRight = screenToWorld(this.camera, size, {
      x: size.w - this.insets.right,
      y: size.h - this.insets.bottom,
    });
    return {
      x: topLeft.x,
      y: topLeft.y,
      w: bottomRight.x - topLeft.x,
      h: bottomRight.y - topLeft.y,
    };
  }
```

Add pull-out:

```ts
  /**
   * §06's pull-out. Lays the selection out on the safe rect and groups it.
   *
   * Not a drag: this is a button press, so no pointer is adopted and nothing is
   * handed to `BoardControls`. The pieces simply arrive, already workable.
   */
  pullOut(pieceIds: readonly PieceId[]): number {
    const session = this.session;
    if (!session || pieceIds.length < 2) return -1;

    const first = pieceIds[0]!;
    const piece = session.board.piece(first);
    const origins = gridLayout(pieceIds.length, piece.w, piece.h, this.safeWorldRect());

    const id = session.pullOut(pieceIds, origins);
    for (const pieceId of pieceIds) this.tray?.touch(pieceId);
    this.bumpTray();
    this.wake();
    return id;
  }
```

Add the group-chip hit test. It mirrors `drawGroupChips` exactly — **if you change the chip geometry in one, change it in the other**, and say so in both comments:

```ts
  /**
   * The group chip under a screen point, or null.
   *
   * The first non-piece hit target in the app. Its geometry is a copy of
   * `Renderer.drawGroupChips` — canvas has no retained scene graph to ask, so the
   * two must be changed together. A DOM chip would avoid the duplication and
   * re-render the tray sixty times a second during a drag, which is precisely
   * what keeping the board out of React was for.
   */
  groupChipAt(screen: Point): number | null {
    const session = this.session;
    if (!session) return null;

    for (const group of session.scene().groups) {
      const at = worldToScreen(this.camera, this.viewport, {
        x: group.bounds.x,
        y: group.bounds.y,
      });
      const w = group.label.length * 7 + 24;
      const h = 22;
      const x = at.x;
      const y = at.y - h - 4;
      if (screen.x >= x && screen.x <= x + w && screen.y >= y && screen.y <= y + h) {
        return group.id;
      }
    }
    return null;
  }

  toggleGroupCollapsed(id: number): void {
    const session = this.session;
    const group = session?.worksets.get(id);
    if (!session || !group) return;
    session.setWorksetCollapsed(id, !group.collapsed);
    this.bumpTray();
    this.wake();
  }
```

> The width here is an approximation of `measureText`. That is acceptable for a hit target and not for drawing — note it in the comment so nobody "fixes" the renderer to match.

Finally, in the runtime's release handling, add the shelf test. Find where 3a decides "released over the tray → return it" and narrow it:

```ts
    // Pinning is that same rect test, one region smaller (§06). The board's
    // release path stays unaware a shelf exists; `board-controls.ts` gains
    // nothing.
    const overShelf = this.options.shelfRect?.() ?? null;
    const pin =
      overShelf !== null &&
      point.x >= overShelf.x &&
      point.x <= overShelf.x + overShelf.w &&
      point.y >= overShelf.y &&
      point.y <= overShelf.y + overShelf.h;
    session.returnToTray(clusterId, pin);
```

Add `shelfRect?: () => Rect | null;` to `PlayRuntimeOptions`, documented as "client rect of the shelf row, in CSS pixels — the tray supplies it because only React knows where it is."

Finally, clear the pin when a piece leaves the tray. In `onPlayEvent`, in the existing `deploy` branch:

```ts
      case 'deploy':
        this.tray?.touch(event.pieceId);
        // Pin is a tray-only attribute and is cleared on deploy (spec §3). A
        // piece dragged to the mat is simply on the mat, and returning it does
        // not restore the pin — one less piece of state to keep coherent.
        this.tray?.unpin(event.pieceId);
        break;
```

> Match the branch to whatever `onPlayEvent` already does for `deploy`; the only addition is the `unpin` call. Doing it here rather than at each call site covers both single drag-out and pull-out, because both emit `deploy`.

- [ ] **Step 3: Verify**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/play/session.ts src/play/runtime.ts
git commit -m "Runtime: pull-out onto the safe rect, group chips, and the shelf drop"
```

---

# Task 9: The chrome — touch-action, badges, shelf, selection bar

**Files:**
- Modify: `src/ui/PieceChip.tsx`, `src/ui/PieceGrid.tsx`, `src/ui/Tray.tsx`, `src/ui/store.ts`, `src/ui/useTrayDrag.ts`
- Create: `src/ui/Shelf.tsx`, `src/ui/SelectionBar.tsx`

**Interfaces:**
- Consumes: `TraySelection` (Task 2), `SELECT_HOLD_MS` (Task 1), `TrayModel.pin`/`unpin`/`pinned` (Task 5), `PlayRuntime.pullOut`/`setTrayInsets`/`groupChipAt`/`toggleGroupCollapsed` (Task 8).
- Produces: `ChromeState` gains `selecting: boolean`, `selectedCount: number`, `shelf: PieceId[]`, and actions `enterSelect(pieceId)`, `exitSelect()`, `toggleSelected(pieceId)`.

- [ ] **Step 1: Fix the chip, and give it a badge**

In `src/ui/PieceChip.tsx`, change the style and add the two new props. **This is the 3a defect fix** — the comment matters as much as the value:

```tsx
      // `pan-y`, never `none`. `none` does not lose a race with native scrolling
      // — it disables it, so no `pointercancel` ever fires and the handler in
      // `useTrayDrag` never runs. Chips are 56px on an 8px gap, which left the
      // scroll container reachable only through the gutters: on a phone the tray
      // could not be scrolled by touch at all. The vertical axis belongs to the
      // browser; `TrayDrag` commits to a drag on horizontal movement.
      style={{ width: size, height: size, touchAction: 'pan-y' }}
```

Add to `PieceChipProps`:

```tsx
  /** 1-based selection order, or 0. Rendered as a numeral — never colour alone. */
  badge?: number;
  pinned?: boolean;
  selecting?: boolean;
```

Extend `aria-label` so the browser suite can assert on it, and add the badge element after the notch glyph:

```tsx
      aria-label={
        onMat
          ? `Find piece ${pieceId} on the mat`
          : badge
            ? `Piece ${pieceId}, selected ${badge}`
            : `Piece ${pieceId}`
      }
      aria-pressed={selecting ? badge > 0 : undefined}
```

```tsx
      {badge > 0 && (
        // §06's numbered order badge. The numeral is the signal; the ring is
        // decoration, because colour is never the only signal.
        <span className="pointer-events-none absolute right-[2px] top-[2px] flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[var(--accent)] px-[3px] font-[var(--font-data)] text-[10px] text-black">
          {badge}
        </span>
      )}
```

Default `badge = 0` in the destructure so `badge > 0` is safe.

- [ ] **Step 2: Thread selection through the grid**

In `src/ui/PieceGrid.tsx`, add `badgeOf?: (id: PieceId) => number`, `selecting?: boolean`, and `onChipClick?: (id: PieceId) => void` to `PieceGridProps`, and pass them into `PieceChip`. Keep the virtualisation untouched — it is what makes the tray cheap, and the browser suite measures it.

In `PieceChip`, route the click:

```tsx
      onClick={() => {
        if (selecting) onActivate(pieceId);
        else if (onMat) onActivate(pieceId);
      }}
```

> Simpler: keep one `onActivate` and let `Tray` decide what activation means — locate on the mat, toggle in select mode. Do not add a second callback for the same event.

- [ ] **Step 3: The shelf and the selection bar**

Create `src/ui/Shelf.tsx`:

```tsx
/**
 * The pinned shelf (§06): "a pinned shelf row sits at the top of the tray and
 * survives every lens."
 *
 * Hidden when empty — a permanently reserved 96pt row is a lot of tray to spend
 * on nothing, and on the iPhone sheet at peek it is most of the tray. A dashed
 * placeholder appears while a chip drag is in flight instead, so the drop target
 * is visible in the one moment it is useful.
 */

import React from 'react';
import type { PieceId } from '@/cut/types';
import { PieceChip } from './PieceChip';

export interface ShelfProps {
  ids: readonly PieceId[];
  cell: number;
  dragging: boolean;
  bitmapOf: (id: PieceId) => ImageBitmap | null;
  isEdge: (id: PieceId) => boolean;
  onChipPointerDown: (pieceId: PieceId, event: React.PointerEvent) => void;
}

export function Shelf({
  ids,
  cell,
  dragging,
  bitmapOf,
  isEdge,
  onChipPointerDown,
}: ShelfProps): React.ReactElement | null {
  if (ids.length === 0 && !dragging) return null;

  return (
    <div
      data-shelf
      aria-label="Shelf"
      className={[
        'flex shrink-0 gap-[8px] overflow-x-auto px-[12px] py-[6px]',
        ids.length === 0 ? 'rounded-[8px] border border-dashed border-[var(--edge-hair)]' : '',
      ].join(' ')}
    >
      {ids.length === 0 ? (
        <p className="py-[8px] text-[12px] text-[var(--ink-muted)]">Drop a piece here to keep it.</p>
      ) : (
        ids.map((id) => (
          <PieceChip
            key={id}
            pieceId={id}
            bitmap={bitmapOf(id)}
            size={cell}
            isEdge={isEdge(id)}
            onMat={false}
            pinned
            onPointerDown={onChipPointerDown}
            onActivate={() => {}}
          />
        ))
      )}
    </div>
  );
}
```

Create `src/ui/SelectionBar.tsx`:

```tsx
/**
 * Select mode's action bar (§06).
 *
 * Exit is explicit — Cancel, Escape, or completing the pull-out — and never an
 * outside tap. A stray tap on the board during a careful ten-piece selection
 * must not discard it.
 */

import React from 'react';

export interface SelectionBarProps {
  count: number;
  onPullOut: () => void;
  onCancel: () => void;
}

export function SelectionBar({ count, onPullOut, onCancel }: SelectionBarProps): React.ReactElement {
  return (
    <div className="flex shrink-0 items-center gap-[8px] px-[12px] py-[8px]">
      <button
        type="button"
        // 44pt floor, everywhere.
        className="min-h-[44px] flex-1 rounded-[8px] bg-[var(--accent)] px-[12px] text-[14px] text-black disabled:opacity-40"
        disabled={count < 2}
        onClick={onPullOut}
      >
        Pull out {count}
      </button>
      <button
        type="button"
        className="min-h-[44px] rounded-[8px] border border-[var(--edge-hair)] px-[12px] text-[14px]"
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Store and Tray wiring**

In `src/ui/store.ts`, add to `ChromeState`:

```ts
  /** Select mode (§06). Chrome state — the board knows nothing about it. */
  selecting: boolean;
  selectedCount: number;
  /** Pinned piece ids, in canonical order. Republished when the tray bumps. */
  shelf: PieceId[];
```

with initial values `selecting: false`, `selectedCount: 0`, `shelf: []`, and setters in the same style as the existing ones.

In `src/ui/Tray.tsx`:

- hold a `TraySelection` in a `useRef` (never in state — the badges come from the store's `selectedCount` plus a render-time read, and putting a mutable set in state would re-render the grid on every toggle anyway; the count is what React needs);
- render `<Shelf>` between the lens chips and `<PieceGrid>`;
- render `<SelectionBar>` when `selecting`;
- pass `selecting`, `badgeOf`, and the activation handler into `PieceGrid`;
- add an `Escape` key listener that calls `exitSelect`;
- report the shelf row's client rect via the `shelfRect` option the runtime now takes, and report insets via `setTrayInsets` from the same `ResizeObserver` 3a already uses for the dock edge.

In `src/ui/useTrayDrag.ts`, pass the two new options through:

```ts
    drag.current = new TrayDrag({
      onPullOut: (pieceId, event) => latest.current.onPullOut(pieceId, event),
      onEnterSelect: (pieceId) => latest.current.onEnterSelect?.(pieceId),
      onTap: (pieceId) => latest.current.onTap?.(pieceId),
      selecting: () => latest.current.selecting?.() ?? false,
    });
```

and extend `UseTrayDragOptions` to match. Update the `tick` comment, which still says the hold brings the piece into the hand:

```ts
    // The select hold needs a heartbeat, exactly as the board's long press does —
    // a player who presses a chip and holds still is deciding *which pieces*.
```

- [ ] **Step 5: Tap-to-rename**

A tap on a group's label chip opens a one-line rename. The chip is on canvas, so the tap arrives through `PlayRuntime.groupChipAt` — a **tap**, distinguished from a drag by the same 6px threshold the rest of the app uses. In `App.tsx`, hold `renaming: number | null` and render:

```tsx
{renaming !== null && (
  <form
    className="absolute left-1/2 top-[64px] flex -translate-x-1/2 gap-[8px] rounded-[8px] border border-[var(--edge-hair)] bg-[var(--mat-felt)] p-[8px]"
    onSubmit={(event) => {
      event.preventDefault();
      const value = new FormData(event.currentTarget).get('label');
      if (typeof value === 'string' && value.trim()) runtime.renameGroup(renaming, value.trim());
      setRenaming(null);
    }}
  >
    <input
      name="label"
      autoFocus
      aria-label="Group name"
      defaultValue={runtime.groupLabel(renaming) ?? ''}
      className="min-h-[44px] rounded-[6px] bg-transparent px-[8px] font-[var(--font-data)] text-[14px]"
      onKeyDown={(event) => {
        if (event.key === 'Escape') setRenaming(null);
      }}
    />
    <button type="submit" className="min-h-[44px] px-[12px] text-[14px]">
      Rename
    </button>
  </form>
)}
```

Add the two pass-throughs to `PlayRuntime`:

```ts
  renameGroup(id: number, label: string): void {
    this.session?.worksets.rename(id, label);
    this.wake();
  }

  groupLabel(id: number): string | null {
    return this.session?.worksets.get(id)?.label ?? null;
  }
```

> **This is the first thing to cut if the step runs long.** Auto-labels alone leave the feature entirely functional; the wireframe's `island · "the roof"` is charm, not capability.

- [ ] **Step 6: Verify by hand and by suite**

Run: `npm test && npm run typecheck && npm run dev`
Expected: PASS. In the browser at a phone viewport, confirm the tray scrolls by touch (device emulation, touch input on), a chip held still enters select mode, and Pull out places pieces on visible mat rather than under the sheet.

- [ ] **Step 7: Commit**

```bash
git add src/ui/ src/play/runtime.ts
git commit -m "The chrome: pan-y on the chip, the shelf, and select mode"
```

---

# Task 10: The browser gate

**Files:**
- Create: `test/browser/tray-3b.spec.ts`
- Modify: `test/browser/board-page.ts`, `test/browser/invariants.spec.ts`

**Interfaces:**
- Consumes: `BoardPage`, `watchTrayMutations`, `trayMutations`.
- Produces on `BoardPage`: `shelf: Locator`, `groupChip: Locator`, `enterSelect(pieceId): Promise<void>`, `scrollTrayByTouch(pieceId): Promise<number>`.

**This is the gate, not an optional extra.** A green `npm test` is ~340 assertions about pure functions and stays green while the app fails to boot.

- [ ] **Step 1: Extend BoardPage**

Add to `test/browser/board-page.ts`:

```ts
  readonly shelf: Locator = this.page.locator('[aria-label="Shelf"]');
  readonly groupChips: Locator = this.page.locator('[aria-label="Pieces"] [data-group-chip]');
```

> Declare these in the constructor alongside `tray`, `chips`, and `board` rather than as field initialisers, to match the file's existing shape.

```ts
  /**
   * Hold a chip still until the tray enters select mode.
   *
   * `SELECT_HOLD_MS` is 450; the wait is generous because the hold is driven from
   * the frame loop rather than a timer, so it lands on a frame boundary.
   */
  async enterSelect(pieceId: number): Promise<void> {
    const box = await this.chip(pieceId).boundingBox();
    expect(box, `piece ${pieceId} is not a mounted chip`).not.toBeNull();

    await this.page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await this.page.mouse.down();
    await this.page.waitForTimeout(700);
    await this.page.mouse.up();
  }

  /**
   * Drag a chip straight down with a *touch* pointer.
   *
   * Returns the tray's scrollTop afterwards. The whole point is that this
   * scrolls rather than deploying a piece — with `touch-action: none` it did
   * neither, because native scrolling was disabled and the still-hold fired.
   */
  async scrollTrayByTouch(pieceId: number): Promise<number> {
    const box = await this.chip(pieceId).boundingBox();
    expect(box, `piece ${pieceId} is not a mounted chip`).not.toBeNull();

    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;
    await this.page.touchscreen.tap(x, y).catch(() => {});
    await this.page.mouse.move(x, y);
    await this.page.mouse.down();
    await this.page.mouse.move(x, y - 120, { steps: 10 });
    await this.page.mouse.up();
    await this.page.waitForTimeout(200);

    return this.page.evaluate(() => {
      const el = document.querySelector('[aria-label="Pieces"] .overflow-y-auto');
      return el ? el.scrollTop : -1;
    });
  }
```

> Playwright's mouse cannot produce `pointerType: 'touch'`. Drive the touch case with `page.touchscreen` / a CDP touch emulation context in the phone project, or use `page.evaluate` to dispatch synthetic `PointerEvent`s with `pointerType: 'touch'`. **Pick one and state it in the spec's comment** — a test that silently exercises a mouse pointer is not testing the axis rule.

- [ ] **Step 2: Write the spec**

Create `test/browser/tray-3b.spec.ts`:

```ts
/**
 * Step 3b in a real browser.
 *
 * Two of this project's invariants are only observable here, and both are
 * measured rather than asserted: the board never re-renders through React, and
 * an idle board draws nothing at all. This file extends both to cover a Workset,
 * and adds the regression test for the 3a scroll defect.
 *
 * **The tray is virtualised and the sheet overlays the board.** Use
 * `remaining()` and `matPoint()`; counting chips measures the viewport.
 */

import { expect, test } from '@playwright/test';
import { BoardPage, trayMutations, watchTrayMutations } from './board-page';

test('pull-out puts the selection on the mat as one labelled group', async ({ page }) => {
  const board = await BoardPage.open(page);
  const before = await board.remaining();
  const ids = (await board.mountedIds()).slice(0, 3);

  await board.enterSelect(ids[0]!);
  await board.chip(ids[1]!).click();
  await board.chip(ids[2]!).click();
  await page.locator('button:has-text("Pull out")').click();
  await page.waitForTimeout(400);

  // remaining() reads the header, so virtualisation cannot skew it.
  expect(await board.remaining()).toBe(before);
  expect(await board.chip(ids[0]!).count()).toBe(0);
});

test('a vertical touch scrolls the tray and deploys nothing', async ({ page }) => {
  const board = await BoardPage.open(page);
  const before = await board.remaining();
  const id = (await board.mountedIds())[0]!;

  const scrollTop = await board.scrollTrayByTouch(id);

  expect(scrollTop).toBeGreaterThan(0);
  expect(await board.remaining()).toBe(before);
});

test('a pinned chip survives a lens change', async ({ page }) => {
  const board = await BoardPage.open(page);
  const id = (await board.mountedIds())[0]!;

  await board.pin(id);
  await board.pick('edges');

  await expect(board.shelf).toBeVisible();
  await expect(board.shelf.locator(`button[aria-label^="Piece ${id}"]`)).toBeVisible();
});

test('the board does not re-render through React while a group moves', async ({ page }) => {
  await watchTrayMutations(page);
  const board = await BoardPage.open(page);
  const ids = (await board.mountedIds()).slice(0, 3);

  await board.enterSelect(ids[0]!);
  await board.chip(ids[1]!).click();
  await board.chip(ids[2]!).click();
  await page.locator('button:has-text("Pull out")').click();
  await page.waitForTimeout(400);

  const before = await trayMutations(page);
  const at = await board.matPoint();
  await board.dragOnMat(at, { x: at.x + 60, y: at.y + 40 });
  const after = await trayMutations(page);

  // A re-render of the chip grid is hundreds of mutations. This is not a matter
  // of opinion, which is the entire reason the counter exists.
  expect(after - before).toBeLessThan(50);
});

test('an idle board carrying a collapsed group still draws nothing', async ({ page }) => {
  const board = await BoardPage.open(page);
  const ids = (await board.mountedIds()).slice(0, 3);

  await board.enterSelect(ids[0]!);
  await board.chip(ids[1]!).click();
  await board.chip(ids[2]!).click();
  await page.locator('button:has-text("Pull out")').click();
  await page.waitForTimeout(1200);

  const scheduled = await page.evaluate(
    () => (window as unknown as { __scheduled?: boolean }).__scheduled ?? false,
  );
  expect(scheduled).toBe(false);
});
```

> The idle assertion must read whatever readout `invariants.spec.ts` already uses for "scheduled". Copy that expression exactly rather than inventing `__scheduled`.
>
> `board.pin(id)` needs adding to `BoardPage`: drag the chip out and release over the shelf rect, reusing `dragOut`'s stepping so the promotion is genuinely exercised.

- [ ] **Step 3: Run the gate**

Run: `npm run test:browser`
Expected: PASS on both the dock and the phone viewport.

- [ ] **Step 4: Commit**

```bash
git add test/browser/
git commit -m "Browser gate for 3b, including the tray-scroll regression"
```

---

# Task 11: Documentation

**Files:**
- Modify: `CLAUDE.md`, `PLAN.md`

- [ ] **Step 1: Add the invariants**

In `CLAUDE.md`, under **Invariants**, after the tray-lenses bullet:

```markdown
- **A Workset is not a cluster.** Pull-out groups loose pieces under a label; it never merges them.
  §05's island is welded and holds true relative offsets; §06's pull-out group is a loose grid that
  deliberately does not, so making it a cluster would hand `snap.ts` geometry that is wrong by
  construction and it would resolve against it silently. `snap.ts` and `board.ts` do not know
  `workset.ts` exists. **A Workset stores no position** — its bounds derive from its members every
  frame, because a stored one would disagree with the pieces the first time a member moved.
- **A piece is in at most one Workset**, and membership ends on merge, on return to tray, or on
  proximity drop. Two predicates gate the mat — `inTray` and `worksets.isHidden` — and both are
  consulted in `rebuild`, `scene`, and `contentBounds`. Honour one without the other and the player
  grabs invisible pieces.
- **Pinning is an attribute, not a location.** A piece is still in exactly one of `tray`, `mat`, or
  placed. A pinned chip leaves every lens and appears once, on the shelf.
- **The chip cedes the vertical axis to the browser** — `touch-action: pan-y`, and drag-out commits
  on horizontal movement, for touch pointers only. `touch-action: none` does not lose a race with
  native scrolling, it *disables* it, which left the tray unscrollable by touch through all of 3a.
```

Add to the **Layout** block:

```
  tray/     order.ts                  canonical order — seeded, never reflows
            lenses.ts                 the lens filter; the invariant lives here
            selection.ts              the ordered multi-select set
            colour.ts                 OKLab, weighted k-means, six bins + mixed
            recent.ts tray.ts         the twenty-ring, and the model over it
  play/     session.ts                board + snap + settle + scene + tray/mat
            workset.ts                pull-out groups — not clusters, see above
            layout.ts                 the pull-out grid, on the safe rect
            runtime.ts                the whole board, mounted and pumped
```

Add to the **Testing posture** section, after the `lenses.test.ts` paragraph:

```markdown
`test/play/workset.test.ts` is step 3b's equivalent. Its central assertion is that **a piece is in at
most one Workset and membership ends on merge**, because the failure is silent: a placed piece still
counted in a group draws a containing outline stretching into the assembled board, with nothing on
screen to explain it and no error anywhere.
```

- [ ] **Step 2: Tick off PLAN.md**

In PLAN.md's step 3 section, check the two 3b boxes:

```markdown
- [x] **Pinned shelf row** at the top of the tray, surviving every lens. Drag a piece there to say
      "I am working on this one." *A pinned chip leaves every lens — filtering, not reflowing, so the
      subsequence property is intact.*
- [x] **Multi-select** by long-press; selected chips carry a numbered order badge. "Pull out" lifts
      them onto the mat as a labelled island, auto-arranged in a loose grid so they are immediately
      workable. *§05 and §06 use "island" for two incompatible things; the pull-out group is a
      **Workset**, a label over loose clusters, because a union-find merge would give `snap.ts`
      geometry that is wrong by construction.*
```

And add a line under the save-format section of step 5:

```markdown
- [ ] `worksets: [{ id, label, collapsed, pieceIds[] }]` — **no positions**, which derive from the
      pieces the snapshot already stores. Decided at 3b; the §14 format as written cannot hold a
      pull-out group, because a Workset is not a cluster.
```

- [ ] **Step 3: Final verification**

Run: `npm test && npm run typecheck && npm run test:browser`
Expected: all three green. **Do not claim the step is done on `npm test` alone** — it stays green while the app fails to boot.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md PLAN.md
git commit -m "Invariants and plan for step 3b"
```

---

## Before the PR

- [ ] `npm test` green
- [ ] `npm run typecheck` clean
- [ ] `npm run test:browser` green on **both** viewports
- [ ] **On an iPad and an iPhone**, by hand:
  - the tray scrolls by touch, from anywhere including on a chip
  - drag-out still feels right after losing the still-hold — §17 budgets this and says to spend it
  - the sideways commit reads as natural on the phone. If it does not, the fallback is per-detent perpendicular axes (`pan-x` on the peek row, chips scroll-only in half/full), written up in spec §5
  - `WORKSET_DROP_TOLERANCE` at 1.0 feels like "I took that one out", not like the group falling apart
