# Handoff — after step 3b

**Written:** 2026-07-27
**Last merged:** PR #5, `52cb75a` — "Step 3b: the shelf, multi-select, and worksets"
**Branch state:** `step-3b-shelf-multiselect-worksets` fully merged into `origin/main`, 0 commits ahead.

> Note: this file sits at the repo root and is **not** gitignored, unlike `PLAN.md` and `docs/`.
> If it should be local-only, add `/handoff.md` to `.gitignore`.

Gates at the merge commit: `npm test` 368/368 (27 files) · `npm run typecheck` clean ·
`npm run build` clean · `npm run test:browser` 54 passed / 4 skipped (viewport-conditional),
both dock and phone.

---

## 1. Real-hardware verdict (closed 2026-08-01)

**Tested on an iPhone 15 Pro Max.** Overall a good start: snap resolution feels correct, and the
standing blocker below is now closed. `npm run test:browser` still 54 passed / 4 skipped after the
fix in this section.

- Items 1–5 from the original priority list (safe-area inset, `full`-detent pull-out overflow,
  drag-out axis feel, still-hold timing, `WORKSET_DROP_TOLERANCE`) all read fine on device — no
  action taken, no regressions felt.
- **New finding: the 450ms select-mode hold lost the race with iOS's native text-selection
  callout often enough to be the dominant failure mode.** Trying to select several chips in a row
  produced the copy/select magnifier over the chip instead of entering select mode, which reads as
  "you have to tap each one separately" — not a missing drag-select gesture (§06 never specified
  one; the model is long-press to enter, then tap each additional piece, per
  `TrayDrag.tick`'s doc comment), but the *entry* gesture itself misfiring under iOS's own touch
  handling. **Fixed:** `src/ui/PieceChip.tsx`'s chip button now sets `WebkitUserSelect: 'none'`,
  `userSelect: 'none'`, `WebkitTouchCallout: 'none'` alongside its existing `touchAction: 'pan-y'`.
  Never reproduced in Chromium, which has no callout to race — this is why it survived 3b's review
  and its own browser-test suite untouched.

**Original text, superseded:** *Nothing in step 3b has ever run on real hardware. `CLAUDE.md` says
to test on a device every step, and §17 budgets a week on snap feel and says to spend it. This was
ruled a merge blocker by the final review and merged anyway.*

---

## 1a. Step 4a landed: the light system core

`src/render/light.ts` — pure, tested (`test/render/light.test.ts`, 13 assertions) intensity
functions for all four §07 jobs (progress bloom, hint glow, merge seam, completion), matching the
numbers in `PLAN.md`'s table exactly. `Renderer.drawBloom` is the one shared primitive: downsample
a source canvas, blur it, draw it back additively (`globalCompositeOperation:'lighter'`).

Two jobs are wired end-to-end: **progress bloom** (`Renderer.paintStatic`, driven by
`Scene.completion` — that field already existed, unused, before this) and **completion payoff**
(`Renderer.completePuzzle()`, called from `PlayRuntime.onPlayEvent` on `PlayEvent.complete`,
sourced from the static layer, retires its own `startAnimating` source once settled so the
idle-board invariant still holds after a puzzle finishes).

**Not yet wired:** hint glow and merge seam. Both have their exact timing curves in `light.ts`
already, but hint glow needs a hint tier and a fired-region rect (step 4b), and merge seam needs
seam-edge geometry that doesn't exist anywhere in the codebase yet — nothing computes *which edge*
just joined, only that a merge happened (`PlayEvent.snap`'s `mergedSize`/`mergedClusters`).

No accent tint yet — the bloom draws with the photo's own colours, per §07's literal description
("a downsampled copy of the static layer... drawn back with `lighter`"). Accent extraction (step
4c) is a separate question about chrome tokens (`--accent`, `--accent-bloom`), not this pass.

## 1b. Step 4b landed: hint tiers

Model layer, fully tested (`test/play/hints.test.ts`, `test/play/session.test.ts`'s `useHint`
block): `src/play/hints.ts` has the economy (3/puzzle Classic, +1/10min, Zen unlimited) and tier
costs (0/1/2), and `PlaySession.useHint` spends against it. Tier 3 reuses `release()` verbatim —
the real spring, audio, and merge, not a diminished stand-in.

Two design gaps the doc itself doesn't resolve, both decided and documented as judgment calls
rather than guessed silently:

- **How a hint gets a target.** The doc says "tap a loose piece, then the hint button," which
  conflicts with `CLAUDE.md`'s "no tap-to-select, direct manipulation only" until you notice that
  rule only ever governed *placement*. `PointerMachine` already discarded a plain tap (down+up
  under the drag threshold) as a complete no-op — that gesture now reports `onTap`, wired only to
  hint targeting. Tested in `test/input/pointer.test.ts`'s new `tap` block, including that it never
  fires once a press crosses into a real drag.
- **What escalates Tier 2 → Tier 3.** The doc confirms tap = Tier 1, hold = Tier 2, and stops
  there. Treated as one continuum — tap / hold / hold-longer — with two threshold constants in
  `hints.ts` flagged in a comment as chosen, not measured. Revisit on hardware.

**Also built early, out of order:** `PlaySession` gained a minimal `startedAtMs`/`elapsedMs` pair —
step 5's save format already specifies `timer: { elapsedMs, running }` as core session state, so
this isn't scope creep, just built when the hint economy needed it. No pause/resume across
`interrupted` yet; that's still step 5. `mode` is hardcoded to `'classic'` in `PlayRuntime` — there
is nowhere in the app yet to reach Zen or Daily from, since no mode-select screen exists (step 5).
`hints.ts` already takes `mode` as a parameter, so enabling Zen later is one call-site change.

**Renderer:** `fireHintGlow`/`fireHintOutline` reuse the same `drawBloom` primitive as progress
bloom and completion, generalised to draw into a cropped region instead of the full viewport. Tier
2's outline draws; the "magnetised 6px lean" is not built — flagged in a code comment, not fudged.

**Caught by `test/browser/hints.spec.ts`, not by hand or by unit tests:** the hint button, floated
bottom-right per the design mockup, sat underneath the iPhone sheet at every detent — invisible and
unclickable, because the sheet's own section intercepts the pointer event first. Fixed by feeding
the sheet's live height back in as clearance, the same way `PlayRuntime.setTrayInsets` already
tracks it for the mat. Passed on `dock` from the start because the docked tray is a flex sibling
that never overlaps the board.

## 1c. Step 4c landed: accent extraction (assists deferred)

`src/render/accent.ts`, fully tested (`test/render/accent.test.ts`, 14 assertions, including the
§17 "near-black photo" muddy-result case in the same spirit as `colour.test.ts`'s forest case).
Three dominant colours via the same k-means/OKLab machinery `binByColour` uses (`kMeans` and
`hueOf` are now exported and `kMeans` takes an explicit `kind` string, so extraction gets its own
`rngFor` stream — `'accent'` — rather than silently sharing the tray's `'colourBins'` one, which
would have been the same invariant violation `CLAUDE.md` names for cut-geometry PRNGs).

Wired end-to-end: `PlayRuntime.build()` extracts once per puzzle from `CutPiece.meanColor` (no
second pixel pass) and publishes it on `RuntimeSummary.accent`; `App.tsx` writes it onto
`document.documentElement` as `--accent`/`--color-accent`/`--color-accent-bloom`/
`--color-accent-tray`, replacing `theme.css`'s comment-flagged fallback. The renderer's bloom
passes (progress/hint/completion) still use the photo's own colours per §07's literal description,
not this token set — accent is chrome-only for now.

**Not built: the rest of §13/step 4c's assists** (ghost underlay, edge highlight, snap tolerance
selector, large-piece mode) and the "use neutral accent" escape's UI. `extractAccent` already takes
a `useNeutral` parameter as the seam, and `PlayRuntimeOptions.difficulty` already accepts a
`SnapDifficulty` for the tolerance selector — but every one of these is a settings-sheet control,
and no settings sheet exists yet. That's step 5's pause sheet, not a step-4 gap. Recorded here so
it isn't mistaken for forgotten rather than blocked.

## 1d. Step 4d landed: the remaining three light jobs

Closes out §07's "one light system, four jobs" — hint glow and completion were the only two wired
at 4a; X-Ray, merge seam, and the edge-frame beat are wired now, all through the same `drawBloom`
primitive (or, for X-Ray and the trace, the same overlay layer) rather than one-off passes.

- **`Board.candidateSockets(clusterId)`** (`src/board/board.ts`) is the new pure primitive: placed
  pieces a held cluster's graph neighbours actually touch. Same question `resolveSnap` asks, for
  display instead of a merge. Tested in `test/board/board.test.ts`.
- **X-Ray focus.** `Scene.xray` is `ReadonlySet<PieceId> | null` — non-null (possibly empty)
  whenever a cluster is held, computed by `PlaySession.scene()` from `candidateSockets`. The model
  drops it straight to `null` on release; the 160ms restore in §09 is purely a `Renderer` concern,
  the same division `settle.ts` already draws between the model and the spring. `Renderer.paintXray`
  dims every placed piece not in the set to `--xray-dim` (0.35), via a bounding-box fill rather than
  the cut silhouette — cheaper per frame, and close enough at drag zoom.
- **Merge seam.** `PlayEvent.snap` gained `seam: Rect | null` — the two resolved pieces' bounding
  box, computed post-align in `PlaySession.seamOf`, `null` when the candidate resolved against the
  board frame's own slot (§05's absolute-position exception, which has no second piece to draw a
  seam between). `PlayRuntime` fires `Renderer.fireMergeSeam` whenever it's present. **Scoped
  deliberately to merges that land on the board** — `paintMergeSeam` sources from the static layer,
  same as progress bloom and completion, so an island-to-island merge on the mat (no static-layer
  pixels yet) has nowhere to source the glow from. Revisit if island merges turn out to need it too;
  nothing in the model prevents computing the rect for those, only the renderer's current source.
- **Edge-frame beat.** New pure function `edgeFrameProgress` in `light.ts` (linear, not eased — a
  trace reads as constant motion, not an approach curve) drives `Renderer.paintEdgeFrame`: a single
  growing dash around the board outline, 600ms, clockwise from the top-left corner because that's
  the order `strokeRect` already draws in. Fired from `PlayRuntime` on `PlayEvent.edgeFrame`.
- **Accent finally reaches the renderer.** `Renderer.setAccent(color)`, called once from
  `PlayRuntime.build()` after `extractAccent` runs, replaces the hardcoded `HINT_OUTLINE_COLOR` and
  feeds the edge-frame stroke too. Both bloom-style passes (hint/progress/completion/seam) still use
  the photo's own colours per §07's literal description — only the two *stroke* passes (hint outline,
  edge frame) use the extracted token, since a stroke has no photo pixels of its own to draw from.

Not unit-tested beyond the two new pure functions (`candidateSockets`, `edgeFrameProgress`) — the
paint passes are canvas code, in the same "thin enough to judge by hand" category as the rest of
`renderer.ts`. `npm run test:browser` stayed at the branch's established 58/62 (4 viewport-conditional
skips); the one intermittent failure (`drag-out.spec.ts`'s "Recent finds it again") reproduced 0/3 on
a targeted rerun, so it's a pre-existing flake, not a regression from this pass.

**Still open from §07/§09, not touched by this pass:** the group-merge outline flash (both clusters'
containing outlines flashing at 40% for 120ms before the seam light-bleeds) — `paintMergeSeam` draws
the seam glow but not the outline flash, which is a `drawGroupOutlines`-adjacent concern rather than
the bloom primitive. Bugs A–D from section 3 below are also untouched; this pass was scoped to the
light system only.

## 1e. Step 5a landed: the photo picker and crop flow

Replaces `App.tsx`'s hardcoded `createSyntheticImage()` mount with a real `picker → cropping →
playing` flow: choose a curated or uploaded photo, crop/rotate under a live grid preview, hand a
real `ImageBitmap` + seed to `PlayRuntime`. `npm test` 454/454 (32 files) · `npm run typecheck`
clean · `npm run build` clean · `npm run test:browser` 66 passed / 4 skipped, both dock and phone,
zero flakiness on a 20× targeted repeat of the two tests this pass touched most.

- **`src/play/photo.ts`** — pure, DOM-free crop geometry (`effectiveSize`, `baseCropSize`,
  `clampPan`, `computeCropRect`, `downscaleTarget`), same standard as `src/cut/grid.ts`. Tested.
- **`src/play/curated.ts`** — six curated photos, **procedurally drawn with `OffscreenCanvas`, not
  real photo files.** No licensed image assets exist in this repo or could be added sight-unseen by
  an implementer following a text plan. **Flag this explicitly for before shipping**: swap in real
  bundled images behind the same `CuratedPhoto`/`renderCuratedPhoto` interface — nothing downstream
  needs to change to do that.
- **`src/ui/PhotoPicker.tsx`** — curated grid + upload dropzone, both real `<button>`s, selection
  shown by border-weight *and* a checkmark (never colour alone).
- **`src/ui/PhotoCrop.tsx`** — aspect chips, pan/zoom/rotate (90° steps only — arbitrary angles
  would fight the cutter's axis-aligned grid math and aren't EXIF-safe), live grid preview,
  confirm → rasterizes and mints `puzzleId`/`seed` via `seedFromPuzzleId` (the one and only seeding
  scheme, per `CLAUDE.md`). Task review caught the live preview never actually moving under drag
  (the CSS transform read zoom but not `pan`), the zoom slider missing the 44pt touch floor, and a
  per-drag-frame full-bitmap redecode from an inline canvas ref callback — all three were literally
  the plan's own verbatim code block, fixed with the project owner's sign-off since they conflicted
  with `CLAUDE.md`'s own invariants and the intended UX, not implementer error.
- **`test/browser/board-page.ts`** — `open()` now drives the real picker → crop → confirm flow
  before `waitForCut()`, so all ~60 pre-existing browser specs run through it unchanged.
- **`test/browser/photo-picker.spec.ts`** — curated pick, upload, corrupt-upload inline error, and
  rotate, all passing on both viewports.

**Two second-order fixes, found only by actually running the full gate, not part of the original
task list:**

1. **The board's cut seed is now genuinely random** (`crypto.randomUUID()` → `seedFromPuzzleId`,
   correct production behaviour), which means `BoardPage.open()` cuts a *different* board on every
   test run. That silently flaked an existing regression test
   (`tray-3b.spec.ts`'s group-label-rename case) about 1 run in 3. Fixed with a test-only
   determinism hook: `BoardPage.open()` now stubs `window.crypto.randomUUID` via
   `page.addInitScript()` before navigation, so the browser suite always cuts the same board.
   Production is untouched — real users still get a real random seed per photo confirmed.
2. Fixing the seed turned that occasional flake into a **100%-reproducible** failure, which is how
   a second, previously-latent bug surfaced: `boardInk()`'s canvas-pixel chip-finder keyed off
   "near-black = the label chip," true only of the old synthetic dev image
   (`createSyntheticImage` kept every piece between 28–68% lightness). Real curated photos have
   genuinely dark regions, and dark piece pixels were getting misclassified as chip pixels,
   inflating the detected bounding box. Fixed by keying off the chip's actual distinguishing
   property — its 86%-alpha translucent fill vs. every piece's full opacity — via an
   alpha-band connected-component flood-fill rather than a raw min/max bounding box (a plain
   threshold alone still misfired on anti-aliased piece-edge noise). Independently re-verified:
   66/0/4 clean, 20/20 on a targeted 5×-repeat of both affected tests. Both fixes are confined to
   `test/browser/board-page.ts` — no production file changed.

**Still open, unchanged from before this pass:** EXIF orientation and HEIC upload handling
(already tracked in `PLAN.md`'s Step 1 checklist, not newly deferred here). `TARGET_COUNT`, mode,
and rotation-in-play remain hardcoded in `App.tsx` pending step 5b's setup screen.

**Real-device check (§ "Step 2" of this step's plan): not performed in this session.** Per
`CLAUDE.md`'s testing posture this is a real gate, not a formality — upload from a device's photo
library, pan/zoom gesture feel with a finger rather than a mouse, and the 44pt floor on the aspect
chips/rotate/zoom-slider all need judging on an iPad and/or iPhone before this is truly done.
Flagging here rather than silently skipping it.

**Deferred minors, not blocking, parked in the step's SDD ledger** (full detail there —
`.superpowers/sdd/2026-08-01-step-5a-photo-picker-crop/progress.md` before it's cleaned up):
a stale test-description comment inherited verbatim from the plan (says pan range "shrinks" as
zoom increases; it grows); `let instance` in `App.tsx`'s mount effect could be `const` now that the
async IIFE it needed is gone; the crop preview's on-screen scale still mixes unrotated
`source.width` with rotated-space `rect.width` at 90°/270° rotation (direction of drag stays
correct, only magnitude is off — pre-existing in the plan's own code, not touched by this pass).

## 1f. Step 5b landed: the puzzle setup screen

**Branch `step-5b-puzzle-setup`, pushed to origin, PR not yet opened** — the PAT in this
environment cannot create pull requests (`gh` CLI and the GitHub MCP both return
"Resource not accessible by personal access token"). See §1f.3 below. Gates at the branch head:
`npm test` 469/469 (33 files) · `npm run typecheck` clean · `npm run build` clean ·
`npm run test:browser` 78 passed / 4 skipped, both dock and phone.

Inserts a `configuring` phase between crop-confirm and the board mount. `App.tsx`'s
`TARGET_COUNT = 200` and the implicit hardcoded mode/difficulty/rotation are **deleted**, not
overridden — every one of those is now a player choice.

- **`src/play/setup.ts`** — pure, tested: `PIECE_COUNT_LADDER` (50/100/150/200/250),
  `pieceScreenSize` (the actual-size swatch math — `chooseGrid` → world-unit board size →
  `fitScale`, which *is* the piece's screen pixel width because a world unit is one piece width),
  `clampGhostOpacity`, and the `PuzzleConfig`/`PuzzleAssists` types.
- **`src/ui/PuzzleSetup.tsx`** — count ladder with swatches, Classic/Zen, rotation toggle, and the
  four assists. Shaped after `TesseraV3Figma`'s `NewPuzzleScreen` step 2, on real `theme.css`
  tokens.
- **The four assists.** Snap tolerance and rotation were pure wiring — `PlayRuntime` already took
  both. Ghost underlay and edge highlight are new paint passes in `renderer.ts`. Large-piece mode
  is a floor on the *existing* zoom clamp: `clampZoom`/`zoomAbout` gained an optional
  `minRelativeZoom`, threaded through `camera-controls.ts` → `board-controls.ts` → `runtime.ts`,
  set to `REGION_LENS_ZOOM` (1.5×). It changes what the player sees and never `SnapDifficulty`'s
  tolerances — snap stays world-space, so zoom still never changes difficulty.

**Two defects the browser spec caught, both live in the plan as written and neither with any
unit-test surface:**

1. **The ghost underlay drew a detached `ImageBitmap`.** `cutInWorker` *transfers*
   `options.source` to the worker, so drawing it later in `paintStatic` threw
   `InvalidStateError` — which took the whole static paint down with it and left a blank board
   with nothing on screen to explain it. `PlayRuntime.start()` now copies the source
   (`OffscreenCanvas` → `transferToImageBitmap`, synchronous by necessity) *before* the transfer
   and only when the assist is on, and closes the copy in `destroy()`. **Anything else that wants
   to draw the source photo after the cut starts — the pause sheet's reference image, 5c's library
   thumbnails — hits exactly this and needs the same treatment.**
2. **Mode was chosen and then dropped.** `PlayRuntime.mode` was hardcoded `'classic'`, so picking
   Zen did nothing to the hint budget. Now a `PlayRuntimeOptions` field — the "one line that moves
   when step 5 adds real mode selection" its own comment had predicted.

**`BoardPage.open()` changed again, same as 5a:** it clicks "Start cutting" on defaults
(`DEFAULT_PUZZLE_CONFIG` — 150 pieces, Classic, every assist off) before `waitForCut()`.
`photo-picker.spec.ts` drives the flow itself in two tests and needed the same click — **any spec
that does its own `page.goto('/')` must click through this screen too.**

**Real-device check: not performed in this session.** The piece-count swatches ("a piece next to a
thumb") and the large-piece zoom floor both want judging by eye on an iPad; Chromium cannot answer
either question. Same standing gate as 5a's, still open.

### 1f.1. What step 5c is

The next slice of `PLAN.md`'s Step 5, and the one 5b's assists have nowhere to live without:

- **Library screen** — in-progress cards whose **thumbnails show the actual current board, not the
  source photo**, with a % ring in the session accent. Empty state is an invitation, not an
  apology. Needs the save format below to exist first, or there is nothing to list.
- **Pause sheet** — resume, reference image (full-bleed, tap to dismiss), restart confirm,
  settings, leave. **This is where assists become reachable mid-puzzle**; today they are
  set-once-at-setup because §4c's handoff recorded there being nowhere else to reach them from,
  and 5b did not change that.
- **Save/resume — `SessionSnapshot`** (`PLAN.md` §14, format spec is already written there):
  ~6 KB for 250 pieces because the cut is seeded and **no geometry and no piece images are ever
  stored**. IndexedDB, debounced 800ms plus a **synchronous write on `visibilitychange`**. No
  `localStorage`. Note the snapshot's fields already include `mode` and `assists` — 5b is what
  finally makes both of those real values worth persisting.
- **"Puzzle this again, harder"** — same photo at the next count up. `PLAN.md` is emphatic that
  this gets built *here*, not later: it is nearly free once 5b's ladder exists and it is the
  cheapest repeat session in the product (§15).

Whether that is one sub-step or two (5c library+save, 5d pause sheet) is a scoping call for the
brainstorm; save/resume is the dependency under everything else in it.

### 1f.2. What is left in Step 5 after 5b

`PLAN.md`'s Step 5 checklist, current state:

| Item | State |
|---|---|
| Photo import, crop & frame, live piece-grid overlay | **done** (5a) |
| Puzzle setup: count ladder at actual size, mode, rotation, assists, cutting progress | **done** (5b) — cutting progress already existed in `TopBar` |
| Library screen | open (5c) |
| Pause sheet | open (5c) |
| "Puzzle this again, harder" | open (5c) |
| `SessionSnapshot` save format, IndexedDB, 800ms debounce + `visibilitychange` | open (5c) |

Also still open and **not owned by any Step 5 sub-step so far**: EXIF orientation and HEIC upload
handling (tracked in `PLAN.md`'s Step 1 checklist), the curated photos being procedurally drawn
rather than real bundled images (§1e), and `dev.html` / the step-2 harness, which `CLAUDE.md` says
is deleted at step 5 and which is **still present**.

### 1f.3. Opening 5b's PR

The branch is pushed and tracking `origin/step-5b-puzzle-setup`. The token needs
`pull_requests: write` (fine-grained PAT) or the `repo` scope (classic), after which:

```
gh pr create --base main --title "Step 5b: puzzle setup screen" --body-file <body>
```

Or open it in the browser: https://github.com/NCSTATEPACK16/Tessera/pull/new/step-5b-puzzle-setup

## 1g. Step 6 landed: daily and streak

**Branch `step-5b-puzzle-setup`, not yet pushed.** Gates at the branch head: `npm test` 549/549
(37 files) · `npm run typecheck` clean · `npm run build` clean · `npm run test:browser` 115 passed /
5 skipped (viewport-conditional), both dock and phone.

The daily is a closed-form function of the date — `dailyFor(dateKey)` in `src/daily/daily.ts` —
rather than a pre-seeded table, and is otherwise an *ordinary puzzle* with a deterministic
`daily-YYYY-MM-DD` id. That is what makes it apply to every piece of step 5c's persistence
(autosave, `Board.restore`, thumbnails, photo blobs, the library) with zero daily-specific save
code. The only genuinely new durable state is one streak record, in a new `daily` IndexedDB store
(schema bumped to v2, additive — `daily.spec.ts` asserts an existing session survives the bump).
`src/daily/streak.ts` is pure and fully unit-tested: freeze economy, auto-spend on `settle`, one
manual repair a month, week pips, and the month grid.

**Scoped out of this step, deliberately, and named here so it does not read as an oversight later:**

- **Supabase, Edge Functions, and accounts.** `PLAN.md` originally specified server-side streak
  validation and a stored per-user timezone; both require an account, and play stays account-free
  through step 9. The streak lives entirely in the client's IndexedDB. With no accounts and no
  leaderboard there is nothing to cheat for, so **local time is trivially spoofable and left
  unaddressed on purpose.**
- **Pre-seeded daily tables.** Made moot by the closed-form design — there is no rota to seed and
  no rota to run out of, so "a missing day must never break the hub" cannot fail.

**The six-photo rota is a content gap, not an architecture one.** `CURATED_PHOTOS`
(`src/play/curated.ts`) has six procedurally-drawn scenes, so the daily repeats on a six-day cycle.
`dailyPhotoIndex`'s coprime-stride rotation only guarantees no *consecutive-day* repeat; it does not
hide a six-day period. `CURATED_PHOTOS` growing fixes this with no code change, but **it must not
ship at six.** Sits next to §1e's existing note that the curated photos are not real photographs —
same root cause, still open.

**Three judgment calls with no design document behind them**, all in `src/daily/streak.ts` or
`src/daily/daily.ts` and flagged in comments at the point of definition:

- `MAX_FREEZES = 3` — a cap so a long streak cannot become literally unbreakable; the design doc's
  own wireframe shows "2 freezes" but does not commit to a number.
- `REPAIR_MAX_GAP_DAYS = 7` — "generous on purpose" is the brief, but without *some* cap a single
  tap resurrects a streak after a months-long absence, which is a different feature from forgiving
  a missed Tuesday. (This cap is also why one of the plan's own draft unit tests turned out to be
  wrong — see below.)
- `DAILY_COUNT_BY_WEEKDAY = [150, 100, 100, 150, 150, 200, 200]` — light midweek, heavier at the
  weekend, so the week has a shape; no document specifies daily counts at all.

**A bug in the plan's own test, caught by actually running it.** The draft plan's
`streak.test.ts` asserted that opening a new calendar month reopens `canRepair` regardless of how
long the player had been away — directly contradicting its own next test, which asserts a >7-day
absence must stay unrepairable. Running the test against the implementation (rather than trusting
the draft) surfaced the contradiction immediately; the test's expectation was corrected to keep the
gap cap meaningful across a month boundary rather than waived by one. Nothing in `src/daily/` was
changed to make this pass — only the one test assertion.

**A second bug, this time in a hand-written browser spec, also caught by running it.** The first
draft of `test/browser/daily.spec.ts`'s "same board on every visit" test used `page.addInitScript`
to clear IndexedDB before the first visit — but `addInitScript` re-fires on *every* subsequent
navigation, including the test's own later `page.reload()`, silently wiping the daily's autosaved
session right before the assertion that depends on it existing. Fixed by deleting the database once,
via `page.evaluate` against the already-loaded page, matching `BoardPage.open()`'s existing pattern.
Separately, the same test discovered that **autosave never fires on a completely untouched
board** — `PlayRuntime.scheduleSave()` only runs from a real play event, and dealing pieces into the
tray at cut-completion does not by itself produce one worth persisting across a reload in under
1.2s. The test now places one piece via `placeViaHint` before reloading, the same pattern
`persistence.spec.ts` already established — this is a fact about when autosave is worth relying on,
not a bug in the app.

**The deliberate coverage gap.** "Daily completion increments the streak" has no browser
coverage — `recordCompletion`/`streakLength` are unit-covered in `test/daily/streak.test.ts` and the
`App.tsx` wiring is covered by inspection, but no browser spec exercises the full path. The daily is
Classic (`DAILY_CONFIG.mode`), and `completion.spec.ts` — the only spec that ever reaches
`status === 'complete'` — only works because it picks Zen, where every hint tier is free; there is no
solve path anywhere in the codebase (`grep -rn "solve" src test` returns only prose), and adding a
test-only solve hook to `PlayRuntime` was declined, as it has been once before at step 3b's browser
suite. The alternative that *would* close this — a Zen daily — is a product decision, not a testing
one, and was not made here.

**`DAILY_CONFIG` hardcodes Classic**, in `App.tsx`. A player who prefers Zen cannot play the daily
in Zen. Intentional — everyone is meant to be playing the same challenge — but stated here so it
does not read as an oversight.

**The real-hardware check, still the standing open gate it has been since 5a.** The specific new
question this step adds is the month calendar's 44pt touch floor on an actual phone — `MonthCalendar`
sizes cells at `h-[44px] min-w-[44px]` but Chromium's own layout cannot answer whether that reads
as cramped next to the streak flame above it.

## 2. What's next — Step 4: Hints and light

**Superseded by sections 1a–1d above** — every item this section describes has landed. Left in place
as the original scoping note rather than deleted, per this file's own convention elsewhere.

Full detail in `PLAN.md` §"Step 4 — Hints and light" (gitignored, local only). The shape:

**One light system, four jobs.** Progress bloom, hint glow, merge seam, and completion payoff are
the *same renderer feature at different intensities* — a downsampled copy of the static layer,
blurred, drawn back with `globalCompositeOperation:'lighter'`, with a per-region intensity mask.
Implement once; everything else is a value fed into that mask. §07 is explicit that treating these
as four features is the mistake.

| Job | Value |
|---|---|
| Progress bloom | Scales with completion, 0 → 0.9, spilling ~one piece-width past the assembled boundary |
| Hint glow | Localised region mask at 0.55, breathing on a 1400ms cycle for two breaths |
| Merge seam | Thin, short-lived mask along the newly joined edge, 260ms, peak 0.7, feathered out |
| Completion | Global mask ramps to 1.0 over 1200ms, holds 3s, settles to 0.85 |

**Three hint tiers.** Tier 1 Warm is free, unlimited, and the default button behaviour — a 3×3
region breathing for 3s, feathered over a piece-and-a-half *so no exact slot is legible*. Tier 2
Guide (costs 1) draws exact slot outlines. Tier 3 Place (costs 2) auto-places with the **full**
snap treatment — never a diminished version. In Zen every tier is free and the counter is
*absent*, not greyed out.

**Accent extraction** with a clamp that is the difference between a bloom and a stain: force `L`
into 0.62–0.78 and `C` into 0.09–0.16, minimum 25° hue separation between accent and bloom,
fallback `#6FA8FF`, and never let extraction block the start of play.

Also worth knowing: `dev.html` and the step-2 harness are slated for deletion at **step 5**, not 4.

---

## 3. Open bugs, ranked by whether a player can see them

All were found by the final whole-branch review and consciously deferred. None is a regression —
they shipped this way.

> **Line numbers in the original review were unreliable** (taken from a diff-file's numbering, not
> the source). Everything below is described by content so it can be found by search.

### Player-visible

**A. A mat piece can be selected in select mode, and the count lies.**
`src/ui/PieceChip.tsx` — `onClick` routes to `onActivate` whenever `selecting` is true with no
`onMat` guard, though `onPointerDown` already has one. `src/ui/PieceGrid.tsx` passes `badgeOf(id)`
unconditionally. So under the Recent lens, tapping a chip for a piece already on the mat badges it
and increments "Pull out N". `deployMany` then correctly skips it, so `taken` comes up short — and
if that drops `taken` below two, `WorksetStore.create` returns `-1` and **no group forms at all**
while a piece was still deployed. No corruption, but the button's count does not match its
outcome. *Fix: mirror `onPointerDown`'s `onMat` bail in `onClick` when `selecting`.*

**B. A shelf chip opens select mode with an invisible selection.**
`src/ui/Shelf.tsx` passes `onChipPointerDown` (so the 450ms hold reaches `TrayDrag.tick`) but
passes neither `badge` nor `selecting`. Holding a pinned chip enters select mode and the bar reads
"Pull out 1" with no badge visible anywhere — the pinned piece is out of every lens by design.
*Fix: thread `selecting`/`badge` through to `Shelf`, or gate the shelf out of the hold path.*

**C. Pull-out from the `full` detent deals into a sliver.**
`SelectionBar`'s pull-out → `PlayRuntime.pullOut` never touches the sheet detent, while a *chip
drag* calls `collapseForDrag()`. So the two pull-out paths behave differently, and from `full` the
grid is dealt into ~12% of the viewport. *Fix is one `collapseForDrag()` call in `App.tsx`'s
pull-out handler — but judge it on hardware first, it may feel worse than it reads.*

**D. The shelf is one-way.** `src/ui/Shelf.tsx`'s `onActivate` is a no-op, so a pinned piece can
only be unpinned by deploying it. Spec-consistent (§06 specifies pinning, not unpinning) and
deploying is a real exit, so this is a design question rather than a defect — but it is worth an
explicit decision rather than staying an accident.

### Dead code with no way in

**E. Group collapse is designed-and-deferred, and nothing can reach it.**
The design spec calls the collapsed chip "the largest genuinely new surface in 3b". No task ever
designed the gesture, so:
- `PlaySession.moveWorksetBy` — zero callers, zero tests
- `PlayRuntime.toggleGroupCollapsed` — reachable from no gesture
- and therefore `Renderer.drawGroupChips`'s collapsed branch, `groupChipText`'s `⌄`,
  `WorksetStore.setCollapsed`, and `isHidden`'s entire purpose are dead at runtime

A tap on a group's label chip opens rename, and that is its only meaning. This is recorded in
`CLAUDE.md` and `PLAN.md` so the paths have a breadcrumb. **Either design the gesture or delete
the surface** — do not leave it a third time.

**F. `gridLayout` has no knowledge of cluster 0.** The spec says the pull-out grid should be
"nudged clear of cluster 0's bounds when there is room". Never carried into the plan, so never
built. Pieces can be dealt on top of the assembled board.

**G. `worksetChanged` has zero consumers.** Emitted from four places in `src/play/session.ts`;
`PlayRuntime.onPlayEvent` has no case for it and no other listener exists. Its doc comment
describes a repaint that does not happen — repaints are actually covered by `wake()` on the paths
that matter, which is why nothing looks broken. **Wire it or delete it**; a documented event
nobody reads is a trap. (The related "emits unconditionally even when the piece was in no group"
nit is moot until this is decided.)

### Code hygiene

**H.** `src/ui/App.tsx` — `overTray` and `overShelf` are a verbatim 7-line point-in-rect duplicate.
**I.** `src/ui/Tray.tsx` — `useChrome()` with no selector subscribes to every store field; the
Escape effect's dep array omits `exitSelect`. Both benign today (zustand setters are stable
identities, and the browser mutation counters prove no per-frame cost), but they remove the option
of memoising `Tray` later without fixing them first.
**J.** `PlaySession.scene()` re-derives workset bounds inline instead of calling `groupBounds()`.
**K.** `src/ui/useTrayDrag.ts` — the `requestAnimationFrame` heartbeat runs unconditionally for the
life of the app, not only while pressing. **Pre-existing from 3a.** It draws nothing, so the
idle-board invariant is intact and the browser test confirms it — but it is a permanent rAF on a
battery-powered target. *Gate it on `pressing`.*

### Test-suite weaknesses

**L.** `test/browser/tray-3b.spec.ts` — the per-lens `gridBody … toHaveCount(0)` is load-bearing
only under the `All` lens; under `Edges`/`Corners`/`Colour` the piece is absent for the *filter's*
reason, not the shelf's. The paired `pinned toHaveCount(1)` carries the real claim.
**M.** `test/play/layout.test.ts` — the "overflows rather than stacking" case asserts only
`stride >= PULL_OUT_SPACING.tight`, which restates `Math.max`'s definition and passes for any
clamping value. It never checks the block actually exceeds the rect.

---

## 4. Things that will bite step 5 (persistence)

- **`updateInsets` ordering was fixed in 3b's final wave** — it is now called immediately after
  `runtime.current = instance`. The reason it mattered: the runtime is built in an async IIFE, and
  it only worked before because `createSyntheticImage` has no real `await`. **Step 5's photo
  picker introduces one.** If you refactor that mount effect, keep the eager call after the
  assignment or the insets silently sit at zero on phones.
- Peek is now **101px** (121px with a chip in the shelf) whenever the shelf shows, against the
  design doc's "~96pt". Unchanged at exactly 96 when the shelf is hidden. **The design doc's §06
  should get a sentence** recording that peek grows to the measured pinned region, so the next
  reader does not treat 96 as a hard number.
- `dev.html` and the step-2 harness are deleted at step 5.

---

## 5. Process notes worth keeping

- **The SDD workspace for 3b is still at**
  `.superpowers/sdd/2026-07-26-step-3b-shelf-multiselect-worksets/` — ledger, briefs, reports, and
  review packages. Everything load-bearing from it is in this file now, so it is safe to
  `rm -rf`. It is gitignored scratch; `git clean -fdx` will take it.
- **Local `main` was stale** at `07d23be` during 3b while `origin/main` was well ahead, so
  `git merge-base main HEAD` returned the wrong base and produced an 876KB "whole project" diff.
  Check `origin/main`, not `main`, when picking a review base.
- Two lessons from 3b that generalise:
  > A plan that states a rule in prose and contradicts it in the code block below it will be
  > implemented as the code block.

  > Layout constants derived by arithmetic are wrong. Measure them in a browser, and measure the
  > thing you actually care about — `shelfBottom − sectionTop`, not the box's own height.
- `npm run test:browser` earned its keep twice in 3b, finding two defects that code review had
  missed entirely. Treat it as the gate `CLAUDE.md` says it is, not an optional extra.
