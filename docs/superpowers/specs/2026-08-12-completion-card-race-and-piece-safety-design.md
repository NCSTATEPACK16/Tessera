# Completion-card race, a hard drag boundary, and a box-lid reference panel

**Written:** 2026-08-12
**Trigger:** a user screenshot of the completion screen showing a piece-shaped gap in the "Your
photo" card, on a puzzle the app itself reports complete (tray reads "0 left", `Done` enabled).
**Scope:** one bug fix plus two small features, bundled into a single PR at the user's request.
All three touch the play session / tray chrome and are independently testable.

---

## A. Bug — the Puzzle Card can be composed before the last piece finishes settling

### Root cause, traced through the source

1. `PlaySession` merges a piece into cluster 0 and immediately calls `startSettle(...)` (kicks off
   the ~120ms spring), then — same tick, same call — `rebuild()`, `emit({type: 'snap', ...})`, and
   `announceMilestones()` (`src/play/session.ts:578`).
2. `announceMilestones()` (`session.ts:845`) checks `this.board.isComplete` and emits
   `{type: 'complete'}` (`session.ts:852`) the instant `cluster0.pieceIds.length === N` — before the
   spring that was just started has advanced at all.
3. `PlayRuntime.onPlayEvent` (`src/play/runtime.ts:864`) handles `'complete'` synchronously:
   `this.renderer.completePuzzle(now)` then `this.patch({status: 'complete', ...})`. The React
   state flip happens in the same tick as the merge.
4. `App.tsx`'s `composeCard` effect (`src/ui/App.tsx:945`) fires on that state change and calls
   `composeCard(rt.boardCanvas(), meta)` (`App.tsx:958`) after only `await document.fonts.ready` —
   typically resolved already, so this runs within a frame or two, well under 120ms.
5. `boardCanvas()` (`runtime.ts:544`) returns `renderer.getStaticCanvas()` — the **static** layer
   only. `PlaySession.scene()` (`session.ts:677`) classifies a piece still in `this.moving` (i.e.
   still mid-spring) as `loose`, not `placed` (`session.ts:705`) — the code comment says exactly
   why: *"Settling pieces stay on the dynamic layer until they stop, or the static layer would have
   to recomposite every frame of the spring."*

Net effect: the piece(s) that just completed the puzzle are, by construction, still mid-spring at
the exact moment the card is composed, so they are on the **dynamic** layer and absent from the
**static** canvas the card is drawn from. This is deterministic — not intermittent — for any drop
that completes the puzzle, which is why it reproduces every time. `commitCompletion`'s thumbnail
capture (`App.tsx:758`, used for the `completions` store) reads `boardCanvas()` too, but only after
the user taps `Done`, seconds later, so it isn't exposed to this race in practice — no fix needed
there for correctness, but see the defense-in-depth note below.

### Fix

- Add `get animating(): boolean` to `PlayRuntime`, delegating to the existing (currently private)
  `PlaySession.animating` (`session.ts:283`, `this.settling.length > 0`).
- In `App.tsx`'s `composeCard` effect, after `await document.fonts.ready` and before calling
  `composeCard`, wait for `rt.animating` to go false — poll on `requestAnimationFrame`, capped at a
  short safety timeout (e.g. 500ms) so a future bug in the settle logic can't hang card composition
  forever. The spring is ~120ms, so in practice this resolves in one or two frames and is
  imperceptible.
- Apply the same wait to `commitCompletion`'s `captureThumbnail(rt.boardCanvas())` call
  (`App.tsx:758`). Not required by the trace above, but nothing currently *guarantees* "the user
  waited a few seconds" holds — a fast automated `Done` click (e.g. a future Playwright test) would
  hit the identical race. One helper, two call sites, defense-in-depth.

### Files

| File | Change |
|---|---|
| `src/play/runtime.ts` | Add `get animating(): boolean`. |
| `src/ui/App.tsx` | New small helper (e.g. `waitForSettled(rt)`) used by both the `composeCard` effect and `commitCompletion`. |
| `test/play/runtime.test.ts` (or nearest existing runtime test) | Unit test: `animating` is true immediately after a completing drop and false once `advance()` has run past the settle duration. |
| `test/browser/*.spec.ts` | Browser test: drop the last piece of a small puzzle, assert the composed card's static canvas has full ink coverage (no transparent/background pixel where the last piece sits) — same `staticInk`-style pixel-count technique `puzzle-setup.spec.ts` already uses. |

This is a pure timing fix — no change to *what* gets drawn, only *when* the snapshot is taken. No
architecture questions here; already agreed.

---

## B. A hard boundary on how far a piece can be dragged

### Problem this solves

Today, nothing stops a piece from being dragged an arbitrary distance from the board. The `Fit`
button (`TopBar.tsx` → `PlayRuntime.fit()` → `session.contentBounds()`, `session.ts:331`) already
frames every piece on the mat, however far out it is — so a piece is never *unrecoverable* — but
it's a manual, camera-only recovery, and a player who doesn't think to tap `Fit` can be left
believing a piece is gone. The fix moves this from "recoverable if you know the trick" to
"impossible in the first place."

### Design

**Choke point:** `PlaySession.dragBy(clusterId, dx, dy)` (`session.ts:489`). Every drag — a lone
piece, an island, or a piece pulled out of a workset (worksets hold loose pieces, not clusters, so
pulling one out just drags its own 1-piece cluster through this same path) — funnels through here
via `board-controls.ts:87`'s `onDragTo`. One choke point, already DOM-free and tested.

**Mechanism:** before calling `this.board.moveClusterBy(clusterId, dx, dy)`, compute the cluster's
resulting bounding box and clamp the applied `dx`/`dy` so the box cannot leave a bound rect. This
must happen *during* the drag, not as a post-release correction — the "no bounce-back on a failed
drop" invariant means a piece must never spring back after release, so release-outside-bounds has
to be made impossible rather than corrected after the fact. Feel: "soft resistance" — the piece
simply stops gaining distance past the boundary while the pointer keeps moving, the same technique
`clampZoom` already uses for the zoom limits, applied to position instead.

**The bound rect:** centered on the board frame, expanded by a margin (world units — piece widths)
that scales with total piece count, so a 12-piece puzzle gets a tight, easy-to-reach area and a
250-piece board gets room to actually spread pieces out:

```
margin = clamp(sqrt(totalPieces) * 0.8, 4, 18)   // piece-widths, each side
```

Written as a named constant near `PlaySession`, not inline — and added to `CLAUDE.md`'s "Hard
numbers" table alongside the other tuned constants, since it's exactly that kind of number.

**No visible boundary line** — invisible clamp, per the "soft resistance" decision. Nothing to
render.

### Files

| File | Change |
|---|---|
| `src/play/session.ts` | `dragBy` gains the clamp; new private helper (e.g. `dragBounds()`) computing the rect from `this.options.pieces.length` and `boardW`/`boardH`. |
| `CLAUDE.md` | New row in the "Hard numbers" table for the margin formula/constants. |
| `test/play/session.test.ts` | Unit tests: a drag that would leave the bound rect is clamped to the boundary, not blocked outright (partial progress still applies up to the edge); the bound scales with piece count; a drag that stays inside the bound is untouched (no behavior change for ordinary play). |
| `test/browser/*.spec.ts` | Browser test: drag a piece far past the visible mat and assert it stops at a fixed screen distance rather than continuing to track the pointer. |

---

## C. A box-lid reference panel in the tray

### Design

**Not the existing ghost-underlay assist.** `PuzzleAssists.ghostOpacity` (`src/play/setup.ts:97`,
`DEFAULT_ASSISTS` in `runtime.ts:55`) already draws a dimmed copy of the source photo under placed
pieces, on the board itself, via `Renderer.setGhostUnderlay` (`renderer.ts:274`). This is a
separate, new thing: a persistent small thumbnail of the *whole* target photo, docked in the tray,
independent of the board's render pipeline entirely.

**Where it docks:** `Sheet.tsx` (`src/ui/Sheet.tsx`) already has a `shelf` slot for the pinned-chip
bar (§06), rendered inside the `pinned` div (`Sheet.tsx:167`) that a `ResizeObserver` measures to
size peek height (`Sheet.tsx:96-127`) — the comment there is explicit: *"Everything peek must fit,
in one measured box."* A new sibling slot, `reference`, renders in that same `pinned` div, after
`shelf` and before the lens chips — "above the piece grid/lens chips," per the request — and peek
height grows/shrinks around it automatically through the existing measurement, no new layout math.

**Data source:** `App.tsx` already holds `playConfig.source` (the full decoded photo — the same
bitmap `savePhoto` draws to an `OffscreenCanvas` today). A new `ReferencePanel.tsx` draws it
directly into a small thumbnail `<canvas>`. Pure UI chrome; touches neither `renderer.ts` nor
`session.ts`.

**Collapse state:** a new `referencePanelOpen: boolean` field on `PuzzleAssists`
(`src/play/setup.ts:96`), defaulting to `true` (shown by default, so the feature is discoverable),
persisted through the exact path `comfort` and `ghostOpacity` already use — `SessionSnapshot.assists`
(`src/persist/snapshot.ts:29`) → IndexedDB. No new storage mechanism, and it doesn't need — or get
— the `localStorage` carve-out `hasSeenFirstRunSync` has; this is ordinary session state.

**Toggle control:** a 44pt-minimum tap target (the touch-target floor, `CLAUDE.md`'s "Hard
numbers"), collapsing to a slim single-line strip when closed so it costs little of the tray's
limited peek space.

### Files

| File | Change |
|---|---|
| `src/ui/ReferencePanel.tsx` | **New.** Thumbnail canvas + collapse toggle. Pure presentational component — takes the source bitmap and open/closed state as props, emits a toggle callback. |
| `src/ui/Sheet.tsx` | `SheetProps` gains `reference?: React.ReactNode`, rendered in the `pinned` div after `shelf`. |
| `src/ui/Tray.tsx` | Passes the new panel through to `Sheet`'s `reference` slot; `TrayProps` gains whatever's needed to reach `playConfig.source` and the open/closed assist. |
| `src/play/setup.ts` | `PuzzleAssists` gains `referencePanelOpen: boolean`; `DEFAULT_ASSISTS`/`DEFAULT_PUZZLE_CONFIG` default it to `true`. |
| `src/persist/snapshot.ts` | No shape change — `assists: PuzzleAssists` already carries whatever the type adds. |
| `src/ui/App.tsx` | Wires `playConfig.source` and the assist through to `Tray`; toggle handler follows the same `onAssistsChange`-style pattern the pause sheet already uses for other assists. |

### Testing

| Test | What it proves |
|---|---|
| `test/play/setup.test.ts` (or nearest) | `referencePanelOpen` round-trips through a snapshot save/restore, same shape as the other assist fields. |
| `test/browser/*.spec.ts` | The thumbnail renders while a puzzle is playing; toggling it closed shrinks the sheet's measured peek height (same technique `tray-3b.spec.ts` uses for shelf visibility); the collapsed state survives a reload. |

---

## Sequencing

A → B → C. A is already-agreed and self-contained. B and C touch different files (`session.ts`/
`board-controls.ts` vs. `Sheet.tsx`/`Tray.tsx`/`setup.ts`) and don't depend on each other, but B is
smaller and de-risks the drag path before C adds new tray chrome on top of it. All three land as
task groups within one implementation plan, one PR, per the request that started this.

## Testing posture

Per this project's standing rule, `npm run test:browser` is a gate, not optional — run it after
each part, not only at the end. Two of the three parts (A's snapshot timing, B's drag clamp) are
specifically the kind of bug that only shows up in a real browser; vitest alone would stay green
through all of them.
