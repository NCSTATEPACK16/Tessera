# Step 3b — the shelf, multi-select, and pull-out

Design spec. Companion to `PLAN.md` step 3 and design doc §05, §06.
Step 3a (the tray and its lenses) merged as PR #4; 3b closes step 3 and must land before step 4 starts.

---

## What this step is

Three features from §06's "Shelf and islands" paragraph, plus the presentational half of islands that
step 2 deliberately deferred to here:

- a **pinned shelf row** at the top of the tray, surviving every lens;
- **multi-select** in the tray, with numbered order badges;
- **pull-out**, which lifts the selection onto the mat as a labelled group;
- the **containing outline, label chip, and collapse** that §05 named as an island's only special
  behaviour.

It also fixes a shipping defect in 3a: the tray grid cannot be scrolled by touch. See
[The axis rule](#5-the-axis-rule-and-the-3a-scroll-defect).

## What this step is not

| Out of scope | Where it goes |
|---|---|
| Persistence of shelf and groups | Step 5. The snapshot *shape* is decided here, in [§7](#7-persistence-shape-decided-here-built-at-step-5) |
| Mat-side multi-select (the pointer machine's `multiselect` state) | Unbuilt, and stays unbuilt |
| "Pin all selected" as a bulk action | Not built. Pinning stays one piece at a time |
| Hints, light, X-Ray | Step 4 |

---

## 1. The model: a Workset is not a cluster

**The design doc uses "island" for two incompatible things, and this is the decision the rest of the
step hangs off.**

§05: *"An island is a cluster with `kind:'island'`… It drags, rotates, and snaps by the same rules as
a single piece."* That is a **welded** group — pieces that snapped together off-board, holding their
true relative offsets. `Board.merge` already produces these, and step 2 confirmed island-to-island
snapping runs the identical code path.

§06: *"Pull out lifts them onto the mat as a labelled island, auto-arranged in a loose grid so they
are immediately workable."* Those pieces are **not** adjacent and are **not** in their true relative
offsets.

These cannot be one object. If pull-out produced a union-find cluster:

- `snap.ts` computes each candidate's error from the dragged cluster's frame. A pull-out cluster's
  internal offsets are wrong *by construction*, so resolution would fire against false geometry —
  no error raised, nothing drawn differently. The same class of silent failure as the tray-piece bug
  that `SnapOptions.eligible` exists to prevent.
- Dragging any one of the twelve would drag all twelve, which is the exact opposite of
  "immediately workable".

So pull-out creates a **Workset**: a label plus a membership set over ordinary one-piece clusters.

```ts
// src/play/workset.ts
interface Workset {
  id: number;
  label: string;
  /** Membership, in selection order. */
  pieceIds: PieceId[];
  collapsed: boolean;
}
```

### A Workset stores no position

Its position *is* its members' positions. Its outline is the bounding box of them, derived every
frame from live cluster coordinates. A stored group position would be a second source of truth for
where things are, and it would disagree with the pieces the first time a member was dragged.

### Membership

- **A piece is in at most one Workset.** This is the invariant the test file guards.
- Membership ends on any of three events, all routed through one `worksets.remove(pieceId)`:
  1. **merge into any cluster** — placement, or joining another loose cluster;
  2. **return to tray**;
  3. **proximity drop** — released beyond `WORKSET_DROP_TOLERANCE` outside the group's bounding box.
- Below two members the Workset **dissolves**. A group of one is not a group.

`WORKSET_DROP_TOLERANCE` is **world-space**, in the same family as snap tolerance, so it scales with
piece size and never with zoom. Proposed starting value **1.0 × piece size**, tuned by hand.

The proximity rule is what keeps the outline honest. Under permanent membership one wandering piece
turns the box into a rectangle spanning the mat, which reads as a rendering bug rather than as
information. It also means "I took that one out to work on it" needs no button.

### What does not change

`snap.ts` and `board.ts` learn nothing about Worksets. `PlaySession` calls `worksets.remove` at the
points where it already handles merge and return — the same narrowness with which
`SnapOptions.eligible` kept the tray out of `snap.ts`.

### Selection

```ts
// src/tray/selection.ts
class TraySelection   // ordered set of PieceId
```

Order is what the numbered badges render. **Selection is over pieces, not over the current view**, so
changing lens mid-selection disturbs nothing: a selected piece the new lens hides stays selected and
still counts toward the pull-out total.

---

## 2. Gestures

### The chip's gesture budget

`TrayDrag` today spends both promotion paths on drag-out — 6px of movement, and 120ms of stillness.
§06 wants that same stillness for multi-select, and only one can have it.

| Input | Result |
|---|---|
| 6px movement, horizontal commit | drag-out — the gesture is otherwise unchanged |
| still past `SELECT_HOLD_MS` (450ms) | enter select mode, that chip selected as #1 |
| tap, in select mode | toggle selection |
| movement, in select mode | never a drag-out. Vertical scrolls natively; horizontal does nothing |
| tap, Recent lens, piece on mat | locate — existing 3a behaviour, unchanged |

This retires `LONG_PRESS_MS` from `tray-drag.ts` in favour of `SELECT_HOLD_MS`, and rewrites part of
`test/input/tray-drag.test.ts`.

> **Named risk.** Drag-out feel is a behaviour 3a tuned by hand, and this changes when it fires. The
> `tick()` docstring currently defends the still-hold: *"holding still is what someone does while
> deciding, which is precisely the moment the piece should come up into the hand."* That argument is
> real and we are overriding it, because §06 asks for the same input and because stillness is the only
> signal multi-select can have. Goes back on the iPad before the PR.

### Exiting select mode

Explicit and cheap: **Cancel** in the selection bar, **Escape**, or completing a **Pull out**. Not on
outside-tap — a stray tap on the board during a careful ten-piece selection must not discard it.

### Pinning reuses a path that already exists

§06 already says a single piece released over the tray goes back into it. So pinning is
**return-to-tray with a flag**: drag a chip out, release over the shelf sub-region, and it returns
pinned. One boolean on a call `PlaySession.returnToTray` already makes — no new gesture, no new drop
machinery. Unpin is the mirror: drag off the shelf, release over the grid.

Mechanically this is a **narrowing of a rect test that already exists**, not a new one. 3a already
decides "was this released over the tray?" to return a piece; pinning asks the same question against
the shelf's rect rather than the tray's. Both rects come from the DOM in `runtime.ts`, which is where
the tray/board seam already lives — the board's release path stays unaware that a shelf exists, and
`board-controls.ts` gains nothing.

The shelf is hidden when empty, but **a dashed placeholder row appears while any chip drag is in
flight**, so the drop target is visible exactly when it is useful and costs no space the rest of the
time.

---

## 3. The shelf

Order within the tray: count header → lens chips → shelf → grid. On iPhone the lens chips are already
pinned to the sheet header; the shelf sits directly beneath them, in the same sticky region.

- One row, horizontally scrollable, **no cap**.
- Shelf chips are ordinary `PieceChip`s with ordinary drag-out.
- **A pinned piece is filtered out of every lens's output** and appears only on the shelf. It is
  never on screen twice, so there is never a question of which copy is being dragged. This is the
  same thing placing a piece already does, and filtering preserves the subsequence property that
  `test/tray/lenses.test.ts` asserts.
- Pinning is **an attribute of a tray piece, not a fourth location.** The `tray` / `mat` / `placed`
  invariant is untouched. §14's snapshot already carries `tray: { …, pinned[], … }`, which confirms
  this was always the intent.
- **Pin is tray-only and is cleared on deploy.** A pinned piece dragged to the mat is simply on the
  mat; returning it does not restore the pin. Slightly lossy, and much simpler than a fourth piece
  of state to keep coherent.

---

## 4. Rendering

`Scene` gains one channel:

```ts
// src/render/scene.ts
interface SceneGroup {
  id: number;
  label: string;
  collapsed: boolean;
  /** World units. Bounding box of members, or of the chip when collapsed. */
  bounds: Rect;
  kind: 'workset' | 'island';
}
```

**Both kinds render identically** — a faint containing outline and a mono label chip. That is what
makes the two-concept split of §1 invisible to the player, which is the point: the doc's word
"island" stays true on screen even though the model has two objects behind it.

Drawn on the **dynamic** layer, outlines before loose pieces and chips after, so z-order is correct
without splitting a single feature across two layers.

### Collapse is where this gets teeth

A collapsed group hides its members. One predicate, `isHidden(pieceId)`, must be honoured in **two**
places or the board disagrees with itself:

- `PlaySession.scene()` must not draw them;
- `PlaySession.rebuild()` must not index them for hit-testing.

Honour it in one and not the other and the player grabs invisible pieces, or sees pieces that cannot
be touched.

### The first non-piece hit target

A collapsed chip must itself be grabbable — to expand it, and to drag the group by it. **This is the
first time the hit-test entry point learns about a target that is not a piece**, and it is the
largest genuinely new surface in 3b.

The alternative — DOM chips positioned over the canvas — is **rejected outright**. They would
re-render through React at 60fps during a drag, which is the one thing this codebase is built not to
do, and `test/browser/invariants.spec.ts` counts exactly that.

Dragging a group chip translates every member cluster by the same delta. Because a Workset stores no
position, this is a loop over members and nothing else needs updating.

---

## 5. The axis rule, and the 3a scroll defect

### The defect

`PieceChip` sets `touchAction: 'none'` (`src/ui/PieceChip.tsx:81`). That does not lose a race with
native scrolling — **it disables native scrolling for any touch beginning on a chip.** So
`pointercancel` never fires and `useTrayDrag`'s handler for it (`src/ui/useTrayDrag.ts:48`) never
runs. Chips are 56px on an 8px gap, so the scroll container is reachable only through thin gutters:
**on a phone the tray is effectively unscrollable by touch.** Worse, because `tick()` deploys at 120ms
of stillness, the most likely result of trying to scroll is a piece landing on the mat.

Retiring the still-hold ([§2](#2-gestures)) fixes half of it. The other half needs an axis rule.

### Why one `touch-action` value cannot serve both form factors

The scroll axis and the natural pull-out axis are **perpendicular on iPad and parallel on iPhone**.
The dock is on the right, so pulling out is leftward while the grid scrolls vertically. The sheet is
at the bottom, so pulling out is *upward* — the same axis the grid scrolls on.

### The rule

- The chip gets **`touch-action: pan-y`**, ceding vertical to the browser. Native scrolling works
  again, and it cancels our pointer through a path that is already wired.
- `TrayDrag` commits to drag-out **only when `|dx| > |dy|`** at the moment the 6px threshold is
  crossed. **After the commit the drag is free in any direction** — a small sideways flick claims the
  gesture, then the piece goes wherever, the way a Mail row reveal works.
- On iPhone that flick is also what triggers the auto-collapse to peek that 3a already built, so the
  board appears underneath as the piece comes up.
- **The axis check applies only to `pointerType === 'touch'`.** Mouse and pen keep 3a's behaviour
  exactly, which keeps the existing Playwright drag-out assertions honest rather than quietly
  rewriting them to match a new rule.
- A `pointercancel` from native scroll must clear the probe before the 450ms select timer fires.
  `useTrayDrag` already listens for it; the test below pins the ordering.

> Open on hardware: whether the sideways commit reads as natural on iPhone. If it does not, the
> fallback is per-detent perpendicular axes — `pan-x` on the peek row, chips scroll-only in
> half/full — which is more native-feeling but has a rule that changes with the detent.

---

## 6. Pull-out placement

```ts
// src/play/layout.ts
function gridLayout(n: number, pieceW: number, pieceH: number, safe: Rect): Point[]
```

Pure, DOM-free, tested.

- `ceil(sqrt(n))` columns, 1.15× piece spacing, so pieces never overlap and the outline is tight.
- Centred on the **safe rect** — the viewport minus the dock width or the current sheet detent — and
  **not** the viewport centre. This is precisely the trap `BoardPage.matPoint()` exists to prevent:
  on a phone the centre of the board canvas is underneath the sheet, so a naive centre would deal
  every pulled-out piece behind the tray.
- Spacing tightens toward 1.02× before the grid is allowed to exceed the safe rect.
- The grid is nudged clear of cluster 0's bounds when there is room to do so.
- **The camera never moves.** Camera easing is §07 hint behaviour and belongs to step 4.

### Labels

Auto-assigned `"Set 1"`, `"Set 2"`… with **tap-to-rename** on the label chip — a single-line input in
a small sheet. The wireframe's `island · "the roof"` is the charm of the whole feature, so renaming is
in scope; it is also **the first thing to cut if the step runs long**, since auto-labels alone leave
the feature functional.

---

## 7. Persistence shape (decided here, built at step 5)

§14's snapshot carries `clusters: [{ id, kind, label, x, y, rot, collapsed }]` and nothing else. **A
Workset is not a cluster, so the format as written cannot hold one.** It gains:

```
worksets: [{ id, label, collapsed, pieceIds[] }]
tray:     { order[], pinned[], lens, lensArg, scroll }    // pinned[] already specified
```

**No positions in `worksets`** — they derive from the pieces, which the snapshot already stores. The
~6 KB budget for a 250-piece board is unaffected.

Nothing in this step writes to IndexedDB. The shape is settled now so step 5 implements a decision
rather than rediscovering one.

---

## 8. File plan

**New — all DOM-free and tested:**

| File | Contents |
|---|---|
| `src/tray/selection.ts` | `TraySelection` — ordered selection set |
| `src/play/workset.ts` | `WorksetStore` — membership, dissolve, collapse |
| `src/play/layout.ts` | `gridLayout` — pull-out arrangement |

**Changed:**

| File | Change |
|---|---|
| `src/input/tray-drag.ts` | `SELECT_HOLD_MS` replaces `LONG_PRESS_MS`; horizontal axis commit for touch |
| `src/tray/tray.ts` | `pinned` set, `pin` / `unpin`, shelf accessor; pinned excluded from `visible()` |
| `src/play/session.ts` | `deployMany`; workset wiring; `isHidden` in `scene()` and `rebuild()`; membership removal on merge and return; `returnToTray(clusterId, pin)` |
| `src/play/runtime.ts` | `pullOut(pieceIds)`; group-chip hit-testing and group drag; shelf-rect test on release |
| `src/ui/useTrayDrag.ts` | Select-mode entry; `pointercancel` must beat the select timer |
| `src/render/scene.ts` | `groups: SceneGroup[]` |
| `src/render/renderer.ts` | Containing outline and mono label chip |
| `src/ui/PieceChip.tsx` | `touch-action: pan-y`; selection badge; pinned state |
| `src/ui/Tray.tsx` | Shelf region, selection bar |
| `src/ui/` (new) | `Shelf.tsx`, `SelectionBar.tsx` |
| `src/ui/store.ts` | Select mode, selection count, shelf contents |
| `CLAUDE.md` | Invariants for Worksets and for the axis rule |

---

## 9. Testing

### Unit — `test/play/workset.test.ts` is this step's load-bearing file

It is to 3b what `lenses.test.ts` was to 3a and `interlock.test.ts` was to step 1. Its central
assertion is **a piece is in at most one Workset, and membership ends on merge**, because that
failure is silent: a placed piece still counted in a group draws an outline stretching into the
assembled board, with nothing on screen to explain it and no error anywhere.

Also covered: dissolve below two members; proximity drop at the tolerance boundary; and — per the
project's own rule that *a test that passes at both extremes of the constant it is guarding is not
testing that constant* — an assertion that fails if `WORKSET_DROP_TOLERANCE` is set to zero or to
infinity.

| File | Asserts |
|---|---|
| `test/play/workset.test.ts` | At most one Workset per piece; membership ends on merge, return, and proximity; dissolve below two |
| `test/tray/selection.test.ts` | Order preserved; a lens change disturbs nothing; toggle is idempotent |
| `test/play/layout.test.ts` | Grid fits the safe rect; no two pieces overlap; tightening engages before overflow |
| `test/tray/lenses.test.ts` (extend) | Pinned pieces leave every lens, and the subsequence property still holds |
| `test/input/tray-drag.test.ts` (rewrite) | Horizontal commits and vertical does not, for touch only; mouse is unchanged; `pointercancel` beats the select timer |

### Browser — the gate, run before the PR

Per CLAUDE.md, `npm run test:browser` is a gate and not an optional extra, and both viewports run.

- Hold a chip to enter select mode, select three, pull out; assert `remaining()` drops by three and a
  group chip is drawn. **Use `remaining()` and `matPoint()`, never a chip count** — the tray is
  virtualised and the sheet overlays the board.
- Extend the DOM-mutation counter in `invariants.spec.ts` across a **Workset drag**: the board must
  still not re-render through React while a labelled group is moving.
- An idle board carrying a collapsed Workset still schedules **zero** frames.
- Pin a chip, switch lens, assert the shelf chip survives.
- Drag a chip vertically on a touch pointer and assert the grid scrolls and no piece is deployed —
  the regression test for the 3a defect.

### Hardware

iPad and iPhone, per §17. Two things are only answerable there: whether the sideways commit reads as
natural on a phone, and whether losing the still-hold has cost drag-out any of the feel 3a tuned.
Chromium on a desk cannot answer either.

---

## 10. Invariants this step adds to `CLAUDE.md`

- **A Workset is not a cluster.** Pull-out groups loose pieces under a label; it never merges them.
  `snap.ts` and `board.ts` do not know Worksets exist.
- **A Workset stores no position.** Its bounds derive from its members every frame.
- **A piece is in at most one Workset**, and membership ends on merge, on return to tray, or on
  proximity drop.
- **Pinning is an attribute, not a location.** A piece is still in exactly one of `tray`, `mat`, or
  placed.
- **The chip cedes the vertical axis to the browser.** Drag-out commits on horizontal movement, for
  touch pointers only.
