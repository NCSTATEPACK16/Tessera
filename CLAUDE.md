# Tessera — working notes

A photo jigsaw where progress is literally light. Web-first → PWA → native iOS/iPadOS.

## Source of truth, in order

> **These files are gitignored and exist only on the working machine.** They are updated in place —
> PLAN.md gets ticked off as steps land — and deliberately kept out of the repo. If they are not
> present, say so rather than guessing at what they contain; this file is a summary, not a
> substitute.

1. **`docs/Tessera Design Doc.dc.html`** — the locked UI/UX spec. Engine, state model, cut
   geometry, tray behaviour, light system, motion, tokens, persistence. **This wins every
   disagreement.**
2. **`docs/DESIGN_BRIEF_Tessera.md`** — product intent, voice, visual thesis, modes.
3. **`PLAN.md`** — the build schedule, reconciled to the design doc. Backend shape, native path,
   privacy, licensing.

The design doc is a rendered document; its tables live in the `<script type="text/x-dc">` block as
plain data, not in the prose.

## Invariants

Break any of these and something downstream breaks in a way that looks like a different bug.

- **The board never re-renders through React.** Piece positions update at 60fps. React reads only
  derived summary state — progress %, combo, hints left, timer.
- **Snap resolution asks a graph neighbour, never an absolute board position.** This is what makes
  free-floating islands work identically to placing on the board frame, with no special-case code.
  The single exception is the board frame itself, because cluster 0 starts empty and a piece with no
  placed neighbour would otherwise be unplaceable: a piece may also resolve against **its own slot**,
  and only that. It loses every tie to a real neighbour, and it is the only absolute-position test in
  the codebase — `SnapOptions.boardFrame`.
- **Only clusters on the mat may be snapped to** — `SnapOptions.eligible`. A piece waiting in the
  tray has never been moved, so it is still parked on its own solved slot, which makes it the *best*
  neighbour for anything dropped near where it belongs. Without this the first placement of every
  puzzle merges with a tray piece instead of the board: no error, nothing drawn differently, and the
  tray and the board silently disagree about who owns that piece.
- **The tray is home; the mat is where you work.** A piece is in exactly one of `tray`, `mat`, or
  placed. `Board` knows nothing about the first two — to the union-find a tray piece is an ordinary
  loose cluster of one, which is why adding the tray changed `board.ts` not at all.
- **Every piece placement goes through the union-find.** Merging with cluster 0 is what "placed"
  means; completion is `cluster0.pieceIds.length === N` and nothing else.
- **Snap tolerance is always world-space**, so zoom never changes difficulty.
- **The cut is deterministic from a seed.** Never store geometry or piece images — a snapshot is
  ~6 KB because it stores neither.
- **Per-concern PRNG streams**, derived from `(seed, kind, id)` via `rngFor`. Never a shared
  stream: it would make values depend on iteration order, and interlock depends on two different
  pieces drawing the same edge.
- **Cutting happens in a worker.** The main thread never blocks.
- **Piece bitmaps are rasterised once** at `min(dpr, 2)` and never re-rasterised while zooming.
- **Tray filters are lenses, never sorts.** The canonical order never reflows. Machine-checkable
  form: **every lens's output is a subsequence of the canonical order**, asserted for all six in
  `test/tray/lenses.test.ts`. There is no comparator in `lenses.ts` and there must never be one.
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
- **Group collapse is designed-and-deferred, not abandoned.** `PlaySession.moveWorksetBy`,
  `PlayRuntime.toggleGroupCollapsed`, `Renderer.drawGroupChips`'s collapsed branch, and
  `WorksetStore.isHidden` have no gesture wired to them yet — the only tap a group chip answers is
  rename. See `PLAN.md`'s 3b entry for what's carried forward.
- **Pinning is an attribute, not a location.** A piece is still in exactly one of `tray`, `mat`, or
  placed. A pinned chip leaves every lens and appears once, on the shelf.
- **The chip cedes the vertical axis to the browser** — `touch-action: pan-y`, and drag-out commits
  on horizontal movement, for touch pointers only. `touch-action: none` does not lose a race with
  native scrolling, it *disables* it, which left the tray unscrollable by touch through all of 3a.
- **No `localStorage` for session state** — IndexedDB only.
- **No feedback may depend on a channel the web build lacks.** Haptics are an amplifier, never the
  carrier. The snap must feel complete on a silent device with no vibration.
- **Colour is never the only signal.** Edge pieces get a corner notch glyph; colour bins get a
  numeral alongside the swatch.
- **There is no lose state anywhere in this app**, and no bounce-back on a failed drop. A dropped
  cluster stays exactly where it was dropped.
- **The daily is an ordinary puzzle with a deterministic id** — `daily-YYYY-MM-DD`, seeded through
  `seedFromPuzzleId` like every other puzzle. That is what lets step 5c's autosave, `Board.restore`,
  thumbnails, and photo blobs all apply to it with no daily-specific persistence anywhere. If a
  second save path for dailies ever appears, something has been misunderstood.
- **`localDateKey` is the only place a local `Date` is read.** The daily resets at 00:00 *local*
  (`PLAN.md` §6), and the usual shortcut — `toISOString().slice(0, 10)` — is UTC, which flips the
  daily over at 19:00 for a player at UTC-5. All arithmetic on date keys is done in UTC on whole
  days, because a local `setDate(+1)` across a DST boundary is 23 or 25 hours and rounds wrong.

## Coordinate spaces

Named, because conflating them is where snap bugs come from.

| Space | Unit | Who knows about it |
|---|---|---|
| `image` | source px, post-EXIF, post-downscale to 2560 | the cutter, and nothing else |
| `world` | 1 = one piece width, origin at board top-left | piece positions, clusters, snap tolerance |
| `screen` | CSS px after the camera | the renderer and the hit-test entry point |

`Camera` in `src/render/camera.ts` is the only world↔screen mapping. Nothing else converts.

## Layout

```
src/
  core/     rng.ts geom.ts            seeded streams, path maths
  cut/      grid lattice edge edges   the cut, §04 step by step
            piece-path raster graph
            cutter.ts                 orchestrator, thread-agnostic
            cutter.worker.ts          transport shell only
            cut-client.ts             main-thread front door
  board/    board.ts                  clusters, union-find, cluster 0
            snap.ts                   resolution over graph neighbours
            settle.ts                 the spring, and reduced motion
            hit-test.ts               spatial hash + point-in-outline
  input/    pointer.ts                the pointer machine, DOM-free
            board-controls.ts         listener shell, arbitration only
            tray-drag.ts              the chip's press threshold, DOM-free
  audio/    ladder.ts voices.ts       pitch ladder, three-layer voicing
            bank.ts engine.ts         synthesised samples, Web Audio buses
  tray/     order.ts                  canonical order — seeded, never reflows
            lenses.ts                 the lens filter; the invariant lives here
            selection.ts              the ordered multi-select set
            colour.ts                 OKLab, weighted k-means, six bins + mixed
            recent.ts tray.ts         the twenty-ring, and the model over it
  play/     session.ts                board + snap + settle + scene + tray/mat
            workset.ts                pull-out groups — not clusters, see above
            layout.ts                 the pull-out grid, on the safe rect
            runtime.ts                the whole board, mounted and pumped
  daily/    dates.ts                  local day keys, UTC arithmetic
            daily.ts                  date → (photo, count, seed), closed form
            streak.ts                 freezes, repair, pips, month grid
  render/   renderer.ts               draw(scene, camera) — the whole surface
            frame-scheduler.ts        invalidation; "idle draws nothing"
            camera.ts camera-controls.ts scene.ts mat.ts
            group-chip.ts             a Workset's label chip — canvas, never DOM over it
  ui/       App.tsx store.ts          React chrome; board never renders through it
            Tray Sheet PieceGrid PieceChip LensChips TopBar ProgressRing
            Shelf SelectionBar        the pinned row, and the pull-out bar
            DailyHub StreakFlame MonthCalendar   the daily hub and its streak (step 6)
            theme.css                 §13 tokens, once, for both consumers
  main.tsx                            the product entry — index.html
test/                                 mirrors src/ — vitest, *.test.ts
  browser/  *.spec.ts board-page.ts   playwright, the app in a real browser
docs/                                 the three sources of truth are gitignored, local only;
                                       docs/superpowers/ (plans, specs) is committed
```

One page. `index.html` is the product. `dev.html` and the step-2 harness were deleted at step 5c —
the setup screen and the pause sheet's live settings now carry the snap-tuning dials it existed for.

All cutting logic lives in `cutter.ts`, not the worker, so it stays testable off-thread. The same
split runs through steps 2 and 3: everything with a decision in it is DOM-free and tested, and the
files that touch the DOM, React, or Web Audio (`board-controls.ts`, `ui/`, `engine.ts`) are thin
enough to judge by hand — which is the only way snap feel can be judged anyway. `vitest` runs in a
node environment, so **DOM-free is the same word as tested**; anything with a real decision in it
belongs on the tested side of that line.

**The model is truth; the settle is presentation.** A snapped cluster merges into the board on the
same tick as the release, and what springs over the next ~120ms is where the renderer *draws* it. The
alternative — merging when the animation ends — lets a dropped frame or a backgrounded tab leave the
board disagreeing with itself.

## Hard numbers

Do not drift from these without changing the design doc first.

| | |
|---|---|
| Piece ceiling | 250, genuinely playable on an iPhone 12 at sustained 60fps while dragging a 20-piece island |
| Source downscale | max 2560px long edge |
| Cut budget | under 1.2s in the worker on an iPhone 12 |
| Piece aspect | 0.82–1.22, hard reject outside |
| Lattice jitter | ±0.12 × piece size, interior vertices only |
| Tab geometry | knob at t ≈ 0.5 ± 0.06, neck 0.20, head radius 0.14, protrusion 0.22 × edge length ± 10% |
| Snap tolerance | 0.18 / 0.28 / 0.40 × piece size (Precise / Standard / Generous), 12° in Rotation |
| Snap spring | stiffness 520, damping 26, mass 1, integrated from release velocity |
| Lift | scale 1.06, 8pt above the finger, never under it |
| Zoom | 0.5× to 4×, rubber-banded; region lens unlocks above 1.5×. **Relative to the fitted board — 1× is the board filling the viewport.** `camera.zoom` itself is screen px per world unit, so clamping it to these numbers directly means "pieces are four pixels across" |
| Bloom / hint / X-Ray | 0.90 max / 0.55 peak / 0.35 dim |
| Save | IndexedDB, debounced 800ms + synchronous write on `visibilitychange` |
| Touch target | 44pt floor, everywhere |

## Commands

```
npm run dev          # host-exposed for real-device testing — the product at /
npm test             # vitest — pure functions, node environment
npm run test:browser # playwright — the app, in a browser, dock and phone
npm run typecheck
npm run build
```

## Testing posture

The cut is deterministic, so it is genuinely testable and the tests are worth trusting: same seed →
identical geometry, tabs exactly reverse their sockets, piece aspect in band, graph symmetric,
border unjittered. `test/cut/interlock.test.ts` is the load-bearing one.

The tray's lens engine is the same kind of testable, and `test/tray/lenses.test.ts` is its
`interlock.test.ts`. Two others earn their keep: `test/play/tray-deploy.test.ts` catches the tray
leaking into the scene, which would render a puzzle solved on the first frame with no error
anywhere; and the forest case in `test/tray/colour.test.ts` is the one that told us a bare
lightness weight cannot work — it passed at every setting until the axes were normalised.
**A test that passes at both extremes of the constant it is guarding is not testing that constant.**

`test/play/workset.test.ts` is step 3b's equivalent. Its central assertion is that **a piece is in at
most one Workset and membership ends on merge**, because the failure is silent: a placed piece still
counted in a group draws a containing outline stretching into the assembled board, with nothing on
screen to explain it and no error anywhere.

### `npm run test:browser` is a gate, not an optional extra

**Run it on every change, and without exception at the end of every step, before the PR.** A green
`npm test` is not evidence the app works — it is 300-odd assertions about pure functions, and it
stays green while the app fails to boot.

Two things in this codebase are *only* observable in a browser, and both are top-line invariants:

- **The board never re-renders through React.** `test/browser/invariants.spec.ts` counts DOM
  mutations inside the tray during a camera gesture and a 60-frame drag. A re-render of the chip
  grid is hundreds of mutations, so the answer is unambiguous rather than a matter of opinion.
- **An idle board draws nothing at all.** Asserted against the harness's own `scheduled` readout.

Step 3b is why this is not a formality: `test/browser/tray-3b.spec.ts` found two real defects that
reading the code had missed — a select-mode hold that deselected the piece it had just selected
(the terminating click toggled it back off), and drop-to-pin unreachable on a phone because the
shelf rendered below the fold at peek. Neither had any unit-test surface; both are fixed.

`@playwright/test` boots vite itself and runs `test/browser/*.spec.ts` over a dock viewport and a
phone viewport. Vitest owns `*.test.ts`, Playwright owns `*.spec.ts`, and neither ever collects the
other's files. **The Playwright version is pinned** because each release ties to one Chromium build;
bump it deliberately and run `npx playwright install chromium` when you do.

Writing browser tests here has one recurring trap, and it has caught every bad assertion so far:
**the tray is virtualised and the sheet overlays the board.** Only ~70 of 250 chips are ever
mounted, so counting chips measures the viewport; and on a phone the centre of the board canvas is
underneath the sheet, so dropping there returns the piece to the tray. `BoardPage` in
`test/browser/board-page.ts` exists to make both facts unavoidable — use `remaining()` and
`matPoint()` rather than reaching past it.

Snap *feel* is not testable, by Playwright or anything else. It is judged by hand on an iPad, and
that is a real gate, not a formality — §17 budgets a week on it and says to spend it.

Test on real hardware every step. Chromium on a desk is not iPad Safari, and the behaviours in the
plan are not reproducible in Chrome devtools.
