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

## 2. What's next — Step 4: Hints and light

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
