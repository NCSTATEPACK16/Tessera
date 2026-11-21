# Redundancy and test-suite review — 2026-11-15

**Status:** owner chose "3x the speed" (2026-11-16). Implemented on this branch: **G1** (smoke
tier), **G2** (`test:browser:one`), **G7** (3 local workers), **D1–D3** (mutation-proven
deletions). Everything else below is still a proposal. Nothing in `src/` was changed.
**Branch:** `claude/test-review-c691ac`, cut from `main` at `bc82a9a`.
**Machine:** 6 cores, 8 GB, shared. Every timing carries the `uptime` load it was taken at.

## 1. Summary

The time is in the browser suite, and most of it is not redundancy. `npm test` is 5.7s for 675
tests, so no unit-test change can pay for itself. The browser suite is 179s for the per-change gate
and 222s for the full one, and it is CPU-bound: four workers on six cores push the load average to
20–38 on their own.

Only **3 of 124** browser tests are true duplicates (mutation-proven, §4). Deleting them saves
about 4s of wall time. Consolidating tests that share an identical boot saves an estimated 30–35s
more. The change that actually moves delivery speed is a **tiered gate**: a 14-test smoke tier
measured at **34–51s** against today's 179s per change.

| # | Proposal | Saves per run | Est. minutes / week¹ | Risk |
|---|---|---|---|---|
| G1 | `@smoke` tier on every change; today's gate moves to pre-PR | 179s → 34–51s (measured) | **~65** | Medium: a per-change run no longer sees 101 tests. Bounded by pre-PR and CI still running everything. |
| G2 | `npm run test:browser:one` (`--no-deps`) for a single spec | ~21s per targeted run (measured) | ~10 | Low |
| G7 | 3 local workers instead of 4 | 179s → 157s pre-PR (measured, §5) | ~2 | Low |
| C1–C9 | Consolidate same-boot tests (124 → ~95 tests, no assertion removed) | ~30–35s of 179s (estimated, not measured) | ~5 | Low–medium: a failed step hides later steps in the same test |
| D1–D3 | Delete 3 mutation-proven duplicates | ~4s (15.3s of worker time) | <1 | Low |
| G3 | CI: 2 shards | ~250s → ~140s per CI run (estimated) | ~10 of waiting, 0 of machine | Low |
| G4 | Drop `timing` as a dependency of `dock`/`phone` | none measurable | 0 | Medium — **not recommended** |
| G5 | Changed-files selection | — | — | High — **not recommended** |
| G6 | Cheaper boot (piece count, shared `storageState`) | none measurable | 0 | — **not recommended**, boot is already ~0.6s |
| B1 | Remove 7 dead exports | 0 | 0 | Low |
| B2–B4 | `App.tsx` / `runtime.ts` seams, kit swaps | 0 | 0 | Medium — **defer to the modernization session** |

¹ Assumes 30 per-change gate runs and 5 pre-PR runs a week. Scale to the real cadence.

Two things found on the way that are not redundancy but matter to the gate:

- **A targeted run silently drags the whole `timing` project along.** `npx playwright test
  first-run.spec.ts --project=dock` ran 5 extra `@timing` tests first (measured: 10 tests for a
  5-test request), because `dock` declares `dependencies: ['timing']`. That is ~21s on every
  single-spec run.
- **`first-run.spec.ts` › "the tray is not on screen before four pieces are placed" failed once**
  in the full baseline (load 8 → 23), on `getByText('Pieces live here. Filter them.')`, then passed
  5/5 alone. It is a load-sensitive test on a transient coach line. Not fixed here; listed in §8.

## 2. Baselines

| Run | Command | Wall | Result | `uptime` load (start → end) |
|---|---|---|---|---|
| Unit | `vitest run --reporter=json` | **5.7s** | 675 / 675, 46 files | 5.75 → 9.05 |
| Browser, full | `playwright test --reporter=json` | **222s** | 117 passed, 6 skipped, **1 failed** (see above) | 7.76 → 22.71 |
| Browser, per-change | `playwright test --grep-invert @slow` | **179s** | 115 passed, 6 skipped, 0 failed | 9.33 → 20.14 |
| `timing` project alone | `--project=timing` | 21.6s | 5 passed | 10.83 |
| CI, browser job (GitHub, 3 workers) | run of 2026-11-16 01:38Z on `main` | 287s job, 250s in the suite | 118 passed, 6 skipped, **0 flaky** | n/a |

**Invalid runs, discarded.** Two overnight measurements (no-deps, and a repeat of the per-change
gate) ran at load 70–83 and took 45 and 91 minutes with 8 and 29 timeouts. They are not used
anywhere in this document. A second project's Playwright run (`MachZero`, one Chromium GPU process
at 450% CPU) was active during the first attempt at a baseline; timing waited for it to finish.

**Where the 179s goes** (per-change run, summed test time 608s across 4 workers):

| Spec | Tests | Summed time |
|---|---|---|
| `tray-3b` | 19 | 103s |
| `first-run` | 10 | 52s |
| `tray` | 11 | 52s |
| `tabs` | 9 | 54s |
| `drag-out` | 8 | 50s |
| `pause-sheet` | 7 | 41s |
| `photo-picker` (minus `@slow`) | 7 | 36s |
| `daily` | 6 | 35s |
| `persistence` | 4 | 35s |
| everything else (11 specs) | 34 | 150s |

No single spec dominates; the cost is the count of independent boots under contention (§5, G6).

## 3. Inventory

### 3.1 Browser — every test

Wall time is per project: full baseline run, then the per-change run after the slash. `@slow`
tests have only the first. Proposal codes (D, C) are defined in §4 and §5.

| file › test | wall time (full run / fast run) | guards | also guarded by | proposal |
|---|---|---|---|---|
| `collection-wall` › collection wall › the wall is an invitation when empty, not an apology | dock 6.4s / 3.9s | Empty wall copy is an invitation | — | keep |
| `collection-wall` › collection wall › a finished puzzle on the wall › becomes a tile, and the tile reopens its card | dock 1.2s / 0.8s | Completion → tile → reopens card | — | keep (already shares one solve) |
| `collection-wall` › collection wall › a finished puzzle on the wall › survives a reload — it is a possession, not session state | dock 1.9s / 0.6s | Completions persist | — | keep (already shares one solve) |
| `comfort` › comfort mode widens buttons past 44px | dock 6.1s / 3.6s | `data-comfort` → 60pt targets (row button) | first-run "Comfort mode… widens controls live" (overlay toggle, different surface) | merge 3 → 1 boot (C4) |
| `comfort` › comfort mode widens a square icon toggle too, not just full-width rows | dock 6.1s / 3.8s | 60pt applies to square toggles too | — | merge 3 → 1 boot (C4) |
| `comfort` › comfort mode floors snap tolerance and disables the tighter two | dock 7.5s / 3.6s | Comfort floors tolerance at Generous, disables tighter two | test/play/setup.test.ts (pure floor) | merge 3 → 1 boot (C4) |
| `comfort` › a puzzle resumed with comfort already on opens floored at Generous | dock 13.0s / 6.8s | Comfort persists in the snapshot and re-floors on restore | — | keep |
| `completion` › completion › again-harder cuts the next rung up from the same photo | dock 12.3s / 8.8s | Again-harder cuts the next rung | — | keep |
| `completion` › completion › after a solve › the card shows the run, offers the next step up, and can be shared | dock 0.2s / 0.1s | Card, again-harder label, Share/Save; no console error | — | keep · @smoke |
| `completion` › completion › after a solve › the composed card is never missing the last piece | dock 0.0s / 0.0s | Card composed after the last spring settles (race) | — | keep · @smoke |
| `completion` › completion › after a solve › a finished puzzle leaves the library and joins the completions | dock 0.6s / 0.2s | **Protected order.** completion written, session deleted | collection-wall (completion half only) | keep · @smoke |
| `daily` › the hub is reachable from Today on a first visit | dock 7.7s / 2.8s | Hub states for a new player; no leaderboard | daily "finishing the daily…" walks the same path but asserts only "Start a streak." | merge into the streak test, moving its 3 assertions (C7) |
| `daily` › the hub is reachable from Today, and today’s daily is not listed in Puzzles | dock 9.5s / 6.8s | Daily lives on the hub, never doubled in the library | — | keep |
| `daily` › starting the daily skips the picker, the crop, and the setup screen | dock 7.8s / 3.5s | Daily start bypasses picker/crop/setup | streak test walks it, asserts nothing about it | merge into the streak test, moving its 3 assertions (C7) |
| `daily` › the daily is the same board on every visit | dock 11.6s / 7.3s | Daily autosaves and restores like any puzzle | — | keep |
| `daily` › finishing the daily starts the streak | dock 14.6s / 10.4s | **Protected.** Streak increments end to end | — | keep |
| `daily` › upgrading the database to v2 keeps an existing session | dock 5.4s / 4.4s | Stores include `daily`; a session exists | persistence "v2 to v3 bump…" asserts a superset (M3) | **delete** (D3) |
| `drag-out` › pulling a piece out of the tray › the piece leaves the tray and lands on the mat | dock 6.6s / 4.0s<br>phone 8.9s / 8.0s | DOM→canvas seam: `TrayDrag` → `PointerMachine.adopt` | — | keep · @smoke (dock + phone) |
| `drag-out` › pulling a piece out of the tray › Recent finds it again, as a locator rather than a second copy | dock 6.2s / 5.0s | Recent lens offers a locator, never a second copy | test/tray/recent, tray.test (model) | keep |
| `drag-out` › pulling a piece out of the tray › dropping it back over the tray puts it home | dock 9.6s / 6.4s | Drop over tray returns the piece | test/play/tray-deploy `returnToTray` (model) | keep |
| `drag-out` › pulling a piece out of the tray › a piece dropped on bare mat stays exactly where it was dropped | dock 9.5s / 6.3s | No bounce-back on a missed drop | snap.test "leaves a missed drop…" (model) | keep |
| `drag-out` › pulling a piece out of the tray › a piece dragged far past the mat stops at a fixed boundary | dock 13.5s / 8.7s | Drag boundary is a fixed world-space edge | session.test "the drag boundary" (5, model) | keep (pre-PR only; 8.7–13.5s) |
| `drag-out` › the phone form factor › the tray is a sheet, and the handle moves between detents | phone 8.1s / 7.0s | Phone: sheet + detents | test/ui/sheet-detents (maths) | keep |
| `drag-out` › the phone form factor › the lens chips stay reachable at every detent | phone 5.3s / 4.6s | Phone: lens chips pinned in header | — | keep |
| `dynamic-type` › the text tokens actually scale with the root font size | dock 6.2s / 2.5s | `--text-N` are rem, grow with root size | — | merge 3 → 1 boot (C3) |
| `dynamic-type` › nothing clips at 200% text zoom on the pause sheet | dock 4.6s / 2.9s | Pause sheet does not overflow at 200% | — | merge 3 → 1 boot (C3) |
| `dynamic-type` › an axe scan of the paused board finds no target-size or scrollable-content violations at 200% | dock 7.6s / 5.0s | axe target-size / scrollable-region at 200% | — | merge 3 → 1 boot (C3) |
| `first-run` › a brand-new player lands on the guided twelve, not the picker | dock 3.6s / 2.5s | Fresh profile → guided twelve, not picker | — | keep |
| `first-run` › the tray is not on screen before four pieces are placed | dock 13.9s / 4.0s | Coach: tray mounts at 4 placed; lens pulse | test/play/first-run (coach logic) | keep — **failed once in the baseline under load**, see §5 |
| `first-run` › skip is always reachable and never modal | dock 6.8s / 4.7s | Skip never modal | — | keep |
| `first-run` › skipping before the cut finishes streaming raises no console error | dock 2.7s / 2.4s | Regression: skip during streaming cut throws nothing | — | keep |
| `first-run` › a skipped tutorial writes no completion — the wall stays earned | dock 6.8s / 5.4s | **Invariant.** Skipped run writes no completion | — | keep |
| `first-run` › a skipped tutorial leaves nothing in the library | dock 6.0s / 3.9s | v2 B6: skipped tutorial not in library | — | keep |
| `first-run` › a returning player is never taught again | dock 4.9s / 3.6s | `hasSeenFirstRunSync` carve-out + IndexedDB | — | keep |
| `first-run` › Comfort mode is offered by name, quietly, and actually widens controls live | dock 4.7s / 2.4s | Overlay comfort toggle applies live | comfort "widens buttons" (pause-sheet toggle) | keep |
| `first-run` › finishing the twelve earns a real completion and offers the two next steps | dock 10.0s / 12.0s | Finished twelve = real completion; two next steps | — | keep |
| `first-run` › "Today's puzzle" from the guided twelve's card starts the real daily | dock 8.4s / 11.4s | Card → real daily | — | keep |
| `golden-cut` › golden cut geometry › a fixed seed and photo cut the same piece shapes every time | dock 1.7s / 3.1s | Pixel baseline of two chips — visual regressions the algebra misses | test/cut/* (geometry only) | keep (1.7–3.1s; nothing to gain by folding) |
| `hints` › a Classic puzzle shows its hint allowance on the pill | dock 4.1s / 7.0s | v2 §5.1: pill reads "Hint · 3" | — | merge into "a tap targets…" (same Classic boot) (C5) |
| `hints` › a Zen puzzle shows no count — its hints are unlimited | dock 4.2s / 2.7s | Zen pill has no count | — | keep |
| `hints` › hints (§07) › a tap targets a loose piece, enabling the hint button; tap fires tier 1 with no error | dock 12.6s / 4.6s | Tap-to-target over canvas; tier-1 fires with no error | — | keep; absorbs the Classic pill assertion (C5) |
| `hints` › hints (§07) › holding the hint button escalates to tier 3, and auto-places the target | dock 7.7s / 10.6s | Hold escalates; tier 3 really places (real merge) | — | keep · @smoke |
| `home` › a fresh profile with zero history skips Today | dock 4.8s / 2.8s | Entry decision: zero history skips Today; no empty library on first visit | first-run "brand-new player…" (entry only) | keep |
| `home` › a profile with one in-progress puzzle lands on Today and shows Continue | dock 5.8s / 5.5s | History → Today, with Continue / New puzzle / daily hero | tabs "three tabs…", "tab bar absent…", "daily hub is a push…" (M1) | **delete** (D1) |
| `home` › New puzzle reaches the curated picker, and Back returns to Today | dock 12.1s / 5.4s | New puzzle → curated picker; Back → Today | tabs "tab bar is absent in setup…" (M2a, M2b) | **delete** (D2) |
| `home` › the hero caption is readable over the photo | dock 7.6s / 5.1s | B7: hero caption is light ink (was 1.0:1) | — | merge into tabs shared seed (C1) |
| `invariants` › nothing is broken on the console › a full session start raises no errors | dock 9.6s / 5.9s | No console errors across boot, three lenses, a drag-out | hints test 1 and completion also watch the console | keep · @smoke |
| `invariants` › the board never re-renders through React › moving the camera does not churn the tray | timing 3.8s / 2.4s | **Protected.** Board never re-renders through React (camera) | — | keep · @smoke |
| `invariants` › the board never re-renders through React › dragging a piece for sixty frames does not re-render per frame | timing 5.1s / 2.8s | **Protected.** Board never re-renders through React (drag) | — | keep · @smoke |
| `invariants` › an idle tray schedules no wasted work › the drag probe stops rescheduling itself once a press ends | timing 3.0s / 2.8s | **Protected.** Idle board schedules nothing | — | keep · @smoke |
| `library` › a saved session becomes a card that opens back onto its board | dock 9.4s / 5.9s | Library card shows real grid and `placed / total`, reopens board | persistence "a reload mid-session…" covers the restore, **not** the card text | merge into persistence test 1, keep both card assertions (C2) |
| `library` › New Puzzle from the library reaches the picker | dock 8.8s / 5.0s | Puzzles `+` reaches the picker | — | merge into shared seed (C1) |
| `pause-sheet` › pause and resume leaves the runtime intact | dock 6.3s / 4.7s | Pause is an overlay — runtime not torn down, no re-cut | — | merge 5 read-only → 1 boot (C6) |
| `pause-sheet` › the backdrop dismisses the sheet, same as Resume | dock 4.5s / 3.5s | Backdrop tap = Resume | — | merge (C6) |
| `pause-sheet` › restart is a two-step confirm, and cancelling changes nothing | dock 4.1s / 6.8s | Restart needs confirm; cancel changes nothing | — | merge the two restart tests → 1 boot (C6) |
| `pause-sheet` › confirming restart returns the board to zero placed | dock 5.3s / 7.2s | Confirmed restart → zero placed | — | merge (C6) |
| `pause-sheet` › a settings toggle persists its state across opening and closing the sheet | dock 5.1s / 6.9s | Assist toggle survives close/open | — | merge (C6) |
| `pause-sheet` › snap tolerance can be changed mid-session | dock 4.7s / 6.7s | Tolerance changes live | test/play/session.test.ts `setDifficulty` | merge (C6) |
| `pause-sheet` › the reference image opens from the sheet and dismisses on tap | dock 4.0s / 5.2s | Reference overlay opens and dismisses | — | merge (C6) |
| `persistence` › a reload mid-session restores the board rather than resetting it | dock 7.5s / 9.8s | **§14.** Placed-count identity across reload | — | keep · @smoke |
| `persistence` › the v2 to v3 bump is additive — it adds `completions` and loses nothing | dock 7.3s / 9.4s | Schema is v3 with all five stores; session restores | — | keep (absorbs D3) |
| `persistence` › a session left through the pause sheet is still there on the next visit | dock 4.9s / 7.4s | Leave → synchronous save via `interrupt()` | — | keep |
| `persistence` › a thumbnail capture on an idle board does not wait for a frame | dock 7.8s / 8.7s | Thumbnail encode never waits on an idle frame (lost-save bug) | — | keep |
| `photo-picker` › three taps from Today to the board | dock 7.3s / 10.5s | v2 funnel: Today → photo → Start → board in three taps | — | keep · @smoke |
| `photo-picker` › photo picker and crop › uploading a photo skips the curated grid and reaches setup | dock 3.1s / 4.2s | Upload path skips the grid | — | keep |
| `photo-picker` › photo picker and crop › a corrupt upload shows an inline error and stays on the picker | dock 2.0s / 2.7s | Inline error, stays on picker | — | keep |
| `photo-picker` › photo picker and crop › a HEIC upload gets the HEIC-specific error, not the generic one | dock 2.0s | HEIC error copy | test/play/heic | keep (@slow) |
| `photo-picker` › photo picker and crop › a HEIC mislabelled as a JPEG is still routed to the HEIC decoder | dock 4.0s | Mislabelled HEIC still routed to the decoder | test/play/heic (sniff) | keep (@slow) |
| `photo-picker` › photo picker and crop › a JPEG upload never wakes the HEIC decoder | dock 2.0s / 2.3s | JPEG never loads libheif (bundle-budget twin at runtime) | check-bundle-budget (build side) | keep |
| `photo-picker` › photo picker and crop › a portrait JPEG with EXIF orientation 6 is not sliced sideways | dock 3.2s / 5.0s | EXIF-6 portrait not sliced sideways | — | keep |
| `photo-picker` › photo picker and crop › curated photos are grouped by feeling, not by category | dock 2.6s / 4.9s | Curated grouped by feeling | test/play/curated | keep |
| `photo-picker` › photo picker and crop › rotate cycles in 90-degree steps without breaking the crop | dock 4.5s / 6.7s | Crop rotate in 90° steps | test/play/photo | keep |
| `puzzle-setup` › puzzle setup › selecting a piece count reaches the runtime with that count | dock 5.6s / 7.3s | Count reaches the cutter | — | keep |
| `puzzle-setup` › puzzle setup › mode and rotation are selectable and survive into a running board | dock 6.7s / 7.0s | Mode/rotation survive into the board | — | keep |
| `puzzle-setup` › puzzle setup › snap tolerance is selectable and reaches a playable board | dock 6.0s / 5.8s | Tolerance reaches the board | — | keep |
| `puzzle-setup` › puzzle setup › large piece mode holds pieces bigger than the default zoom floor does | dock 18.8s | Large-piece assist changes the zoom floor | — | keep (@slow already) |
| `puzzle-setup` › puzzle setup › the ghost underlay slider changes what the board paints | dock 7.8s / 6.9s | Ghost slider changes what is painted | — | keep |
| `reference-panel` › the reference thumbnail shows while playing, and its state survives a reload | dock 8.6s / 6.9s | Box-lid panel shows; hidden state persists via `setAssists` save | — | keep |
| `tabs` › three tabs, each showing its own screen | dock 6.0s / 4.8s<br>phone 6.7s / 6.8s | v2 §3: three tabs, aria-current, each shows its screen | — | keep · @smoke candidate (phone) |
| `tabs` › the tab bar is absent in setup and on the board | dock 5.4s / 6.8s | Tab bar hidden in setup and play | — | keep (own boot: enters play) |
| `tabs` › a wide screen gets a floating bar on top | dock 4.7s / 5.7s | ≥768pt: centred floating top bar | — | merge into shared seed (C1) |
| `tabs` › Today carries a dot while the daily is unplayed | dock 4.5s / 5.8s | Today dot while daily unplayed | — | merge into shared seed (C1) |
| `tabs` › the daily hub is a push within Today, with a way back | dock 4.7s / 6.7s | Hub pushes within Today, Back returns | — | merge into shared seed (C1) |
| `tabs` › the gear opens Settings, and Tray side persists | dock 7.3s / 7.8s | Settings sheet; Tray side persists across reload (slice 3 adds rows here) | tray "left-handed player…" (dock side applied) | keep (own boot: reloads) |
| `tabs` › no banner is ever fixed over the screen | dock 4.9s / 3.7s | PWA banner never fixed over a tab screen | — | merge into shared seed (C1) |
| `tabs` › a phone gets a bottom bar | phone 4.5s / 5.3s | Phone: bar pinned to bottom | — | keep |
| `tray-3b` › the pull-out puts the selection on the mat as one labelled group | dock 5.0s / 4.4s | Pull-out groups on the mat with a label | test/play/workset, tray-deploy "worksets" | keep |
| `tray-3b` › the pull-out lands on mat the player can see, never behind the tray | dock 4.5s / 5.7s | `setTrayInsets`: pull-out lands on visible mat | test/play/layout (maths) | keep |
| `tray-3b` › the group label chip is canvas, and tapping it renames the group | dock 7.2s / 7.0s | Group chip is canvas; tap renames | test/render/group-chip | keep |
| `tray-3b` › a vertical touch scrolls the tray and deploys nothing | dock 7.6s / 5.5s<br>phone 5.7s / 5.6s | 3a defect: `touch-action: pan-y`, tray scrolls by touch | — | keep |
| `tray-3b` › the shelf › a chip dropped on it is pinned, and lifts out of every lens | dock 5.4s / 7.3s | `isOverShelf`: drop-to-pin, leaves every lens | — | keep |
| `tray-3b` › the shelf › tapping a pinned chip outside select mode removes it from the shelf, undeployed | dock 4.5s / 6.6s | Unpin by tap | — | keep |
| `tray-3b` › select mode › a badged chip carries a numeral and an aria-pressed state | dock 4.2s / 4.3s | Select badge numeral + aria-pressed | — | merge select-mode 8 → 4 boots (C9) |
| `tray-3b` › select mode › a mat piece cannot be selected under the Recent lens, and the count does not lie | dock 4.4s / 7.1s | Recent-lens mat pieces not selectable; count honest | — | keep |
| `tray-3b` › select mode › locate-on-mat still works outside select mode, under the Recent lens | dock 5.0s / 5.5s | Locate works outside select mode | — | keep |
| `tray-3b` › select mode › a stray tap on the board does not discard the selection | dock 5.0s / 5.1s | Board tap keeps the selection | — | merge (C9) |
| `tray-3b` › select mode › Escape leaves it, and the badges go with it | dock 4.3s / 4.8s | Escape exits select mode | — | merge (C9) |
| `tray-3b` › select mode › Pull out is refused below two pieces, and clears the 44pt floor | dock 3.7s / 3.8s | Pull out disabled < 2; 44pt floor | — | merge (C9) |
| `tray-3b` › select mode › the chip the hold started on is selection #1, and can still be tapped off | dock 6.3s / 4.8s | Hold chip is #1 and can be tapped off (real 3b defect) | test/input/tray-drag | keep |
| `tray-3b` › select mode › holding a shelf chip shows the same numbered badge a tray chip would | dock 8.7s / 6.7s | Shelf chip badges like a tray chip | — | keep |
| `tray-3b` › the shelf on a phone › is inside the viewport while a chip is in flight | phone 5.4s / 5.5s | Phone: shelf visible during a chip drag (real 3b defect) | — | keep |
| `tray-3b` › the shelf on a phone › a selection pull-out from the full detent collapses the sheet and does not compress the group | phone 7.0s / 7.2s | Phone: pull-out from full detent | — | keep |
| `tray-3b` › the board does not re-render through React while a group is dragged | timing 3.5s / 3.4s | **Protected (extends).** No React re-render dragging a Workset | — | keep · @smoke |
| `tray-3b` › an idle board carrying a group draws nothing at all | timing 4.8s / 4.3s | **Protected (extends).** Idle board with a Workset draws nothing | — | keep · @smoke |
| `tray` › the tray › fills from a finished cut, and the board opens empty | dock 6.2s / 3.9s | Chips render; 4 layers; board opens empty (tray-leak guard, browser side) | **Protected** test/play/tray-deploy (model) | merge 5 read-only → 2 boots (C8) |
| `tray` › the tray › virtualises — far fewer chips exist than pieces | dock 3.6s / 2.7s | Tray is virtualised | — | merge (C8) |
| `tray` › the tray › a lens change hides and reveals, and never reflows | dock 5.6s / 5.5s | Lens change hides/reveals, DOM order stable | **Protected** test/tray/lenses (model) | merge (C8) |
| `tray` › the tray › Corners is exactly four, and Edges carries the notch glyph | dock 5.9s / 5.3s | Corners = 4; edge notch glyph (colour never the only signal) | — | merge (C8) |
| `tray` › the tray › the colour bins partition every piece, and each one filters | dock 7.6s / 7.4s | Bins partition all pieces; numerals | test/tray/colour (model) | merge (C8) |
| `tray` › the tray › Region is gated on zoom, and never strands the player | dock 9.8s / 8.1s | Region lens is a real gate at 1.5× | — | keep (zooms the camera) |
| `tray` › iPad layout › portrait iPad gets the bottom sheet, not the dock | dock 3.4s / 3.1s | Portrait iPad → sheet | — | keep |
| `tray` › iPad layout › landscape iPad docks the tray on the right | dock 3.0s / 2.9s | Landscape iPad → dock right | — | keep |
| `tray` › iPad layout › rotating mid-puzzle swaps dock for sheet and keeps the lens | dock 3.3s / 2.2s | Rotation swaps dock/sheet, keeps lens | — | keep |
| `tray` › iPad layout › a left-handed player can dock the tray on the left | dock 8.6s / 7.7s | Tray side left, persisted | — | keep |
| `tray` › on a phone the tray opens low, with two whole rows of pieces showing | phone 2.4s / 2.7s | Phone peek shows two whole rows | test/ui/sheet-detents | keep |

**Starting points from the brief, checked:**

- `home.spec.ts` vs `tabs.spec.ts` — two of home's four tests are duplicates (D1, D2). The
  fresh-profile entry test and the hero-contrast test are not covered elsewhere.
- `tray.spec.ts` vs `tray-3b.spec.ts` — **no assertion is made twice.** `tray` is lenses, counts,
  virtualisation and iPad layout; `tray-3b` is the shelf, select mode and Worksets. The overlap is
  in boot cost only (C8, C9).
- `library`, `reference-panel`, `golden-cut` — `library`'s two tests fold into neighbours (C1, C2).
  `reference-panel` and `golden-cut` are 6.9s and 3.1s and each needs its own board; folding them
  saves nothing worth the coupling.
- `first-run.spec.ts` — all ten tests are about the coach, the skip, or the first-run completion.
  None re-tests ordinary play mechanics. Keep all ten.
- `dynamic-type` vs `comfort` — different properties (rem scaling and overflow at 200% vs the 60pt
  retarget). No duplicate assertion. Each has three tests on an identical boot (C3, C4).
- **Browser tests asserting pure logic: none found.** Every browser assertion reads the DOM, a
  canvas, IndexedDB, or the console. Nothing to move to vitest.

### 3.2 Unit — per file

`npm test` total: 5.7s wall, 2.3s of test time. Two statistical tests are 1.6s of that:
`bank.test.ts` "never clips" (994ms) and `rng.test.ts` "stays inside [0, 1)" + "jitters
symmetrically" (592ms).

**Proposal for every unit file: keep.** I read the titles of the five files over 375 lines
(`session` 48 tests, `pointer` 33, `snap` 27, `board` 26, `tray-deploy` 21) and found no
table-driven duplicates. The apparent repeats are the same rule asserted at two layers on purpose
(`board.test` "snaps a piece onto its exact target" vs `snap.test` "places a piece on its exact
target": union-find vs snap resolution). The one real duplication is the fixture: `pieces()` /
`input()` / `id()` for a small grid is copy-pasted in `session`, `tray-deploy`, `drag-to-place`,
`board` and `snap`. Extracting it to `test/fixtures/grid.ts` removes ~100 lines and saves no time.
Listed as U1, lowest priority.

Vitest pool and isolation settings were not measured: with 2.3s of test time in a 5.7s run, the
remainder is process start-up and transform, and there is nothing left to win.

| file | tests | wall ms |
|---|---|---|
| `test/audio/bank.test.ts` | 8 | 1007 |
| `test/audio/ladder.test.ts` | 11 | 5 |
| `test/audio/voices.test.ts` | 10 | 4 |
| `test/board/board.test.ts` | 26 | 18 |
| `test/board/hit-test.test.ts` | 13 | 22 |
| `test/board/settle.test.ts` | 15 | 3 |
| `test/board/snap.test.ts` | 27 | 11 |
| `test/core/geom.test.ts` | 27 | 149 |
| `test/core/rng.test.ts` | 11 | 603 |
| `test/cut/graph.test.ts` | 9 | 4 |
| `test/cut/grid.test.ts` | 8 | 10 |
| `test/cut/interlock.test.ts` | 14 | 58 |
| `test/daily/daily.test.ts` | 11 | 52 |
| `test/daily/dates.test.ts` | 15 | 10 |
| `test/daily/streak.test.ts` | 28 | 17 |
| `test/dev/e2e.test.ts` | 3 | 2 |
| `test/input/pointer.test.ts` | 33 | 16 |
| `test/input/tray-drag.test.ts` | 12 | 4 |
| `test/persist/snapshot.test.ts` | 6 | 10 |
| `test/persist/thumbnail.test.ts` | 2 | 2 |
| `test/play/card.test.ts` | 10 | 13 |
| `test/play/curated-precompute.test.ts` | 5 | 2 |
| `test/play/curated.test.ts` | 14 | 6 |
| `test/play/drag-to-place.test.ts` | 6 | 18 |
| `test/play/first-run.test.ts` | 12 | 4 |
| `test/play/heic.test.ts` | 17 | 3 |
| `test/play/hints.test.ts` | 24 | 2 |
| `test/play/layout.test.ts` | 10 | 38 |
| `test/play/photo.test.ts` | 17 | 4 |
| `test/play/pwa.test.ts` | 8 | 3 |
| `test/play/session.test.ts` | 48 | 28 |
| `test/play/setup.test.ts` | 22 | 5 |
| `test/play/tray-deploy.test.ts` | 21 | 13 |
| `test/play/workset.test.ts` | 12 | 3 |
| `test/render/accent.test.ts` | 26 | 15 |
| `test/render/camera.test.ts` | 26 | 6 |
| `test/render/frame-scheduler.test.ts` | 12 | 6 |
| `test/render/group-chip.test.ts` | 3 | 2 |
| `test/render/light.test.ts` | 16 | 8 |
| `test/tray/colour.test.ts` | 15 | 28 |
| `test/tray/lenses.test.ts` | 15 | 13 |
| `test/tray/order.test.ts` | 8 | 6 |
| `test/tray/selection.test.ts` | 6 | 22 |
| `test/tray/tray.test.ts` | 18 | 23 |
| `test/ui/sheet-detents.test.ts` | 12 | 3 |
| `test/ui/tabs.test.ts` | 3 | 1 |


## 4. Deletions — mutation evidence

Rule applied (brief §A3): break the code test X guards, show that test Y fails. Each mutation was
made with `sed`, the covering test run with `--project=dock --no-deps`, and `git checkout src`
run afterwards. Load during these runs: 4.65 (pass/fail only, no timing taken).

### D1 — delete `home.spec.ts` › "a profile with one in-progress puzzle lands on Today and shows Continue"

Its three assertions are each made by a `tabs.spec.ts` test from the same seeded state: Continue
visible ("three tabs…"), New puzzle clicked ("the tab bar is absent…"), daily hero clicked ("the
daily hub is a push…").

- **Mutation M1:** `src/ui/App.tsx:508` `setScreen(hasHistory ? 'home' : 'setup')` → `setScreen('setup')`.
- **Covering test fails:** `tabs.spec.ts:65` "a wide screen gets a floating bar on top" —
  `Error: expect(locator).toBeVisible() failed · Locator: getByRole('navigation', { name: 'Tabs' }) · element(s) not found`.
  (Every tabs test fails at `seedHistory`'s own `expect(tabs).toBeVisible()`.)

### D2 — delete `home.spec.ts` › "New puzzle reaches the curated picker, and Back returns to Today"

- **Mutation M2a:** `App.tsx:1349` picker `onBack` → `setScreen('library')`.
  **Fails:** `tabs.spec.ts:42` "the tab bar is absent in setup and on the board" —
  `Error: locator.click: Test timeout of 90000ms exceeded` (waiting for "Continue your puzzle",
  which is on Today, not Puzzles).
- **Mutation M2b:** `App.tsx:1216` `pickerInitialSource.current = 'curated'` → `'upload'`.
  **Fails:** same test — `expect(locator).toBeVisible() failed · Locator: getByRole('button', { name: /^Curated photo:/ }).first() · element(s) not found`.

M2a's failure is a 90s timeout rather than a fast assertion. If D2 is taken, the tabs test should
gain home's explicit `expect(Continue).toBeVisible()` after Back so the failure is a 5s assertion.
That is an added assertion, not a weakened one.

### D3 — delete `daily.spec.ts` › "upgrading the database to v2 keeps an existing session"

`persistence.spec.ts` › "the v2 to v3 bump is additive" asserts a superset: the same four store
names plus `completions`, the version number, and that the session actually restores (daily's
only checks `count > 0`).

- **Mutation M3:** `src/persist/db.ts:43` — the `daily` store is never created.
- **Covering test fails:** `persistence.spec.ts:44` "the v2 to v3 bump is additive — it adds
  `completions` and loses nothing" — 1 failed.

**Honest limit of both tests:** neither performs an upgrade. Both delete the database and let the
app create it at v3, so they assert the shape of a fresh schema. A real v2 → v3 upgrade (seed a v2
database by hand, then boot) is untested today. That is a coverage gap, not a redundancy; listed
in §8.

### Considered and rejected as deletions

| Candidate | Why it stays |
|---|---|
| `library` › "a saved session becomes a card…" | `persistence` test 1 walks the same path but never reads the card's `placed / total` text or its `cols × rows` label. A mutation to the card text would pass. → merge with both assertions moved (C2), not delete. |
| `daily` › "the hub is reachable from Today on a first visit", "starting the daily skips the picker…" | The streak test walks the same path and asserts none of their six checks. → merge (C7). |
| `invariants` › "a full session start raises no errors" | `hints` and `completion` also watch the console, but neither changes lenses. Cheap, and it is the smoke tier's boot check. |
| `comfort` › "floors snap tolerance" | `setup.test.ts` covers the floor arithmetic, not that the pause sheet disables the two buttons. |
| `drag-out` › "a piece dragged far past the mat…" (8.7–13.5s) | `session.test.ts` has five boundary tests on the model. The browser test is the only one that proves the clamp survives the camera. Keep, pre-PR tier. |

## 5. Gate proposals

### G1 — a smoke tier (recommended)

`npm run test:browser:smoke` = `playwright test --grep @smoke`. Measured by selecting the same
tests with `-g` on today's titles, no code changed:

| | Wall | Result | Load |
|---|---|---|---|
| Before: `npm run test:browser` | **179s** | 115 passed | 9.33 → 20.14 |
| After, run 1 (JSON reporter) | **51s** | 14 passed | 5.92 → 9.77 |
| After, run 2 (dot reporter) | **34s** | 14 passed | 9.77 → 9.33 |

Under the 60s target both times. The 14 tests and why each is there:

| Test | Project | Why |
|---|---|---|
| `invariants` › moving the camera does not churn the tray | timing | Protected invariant: board never re-renders through React |
| `invariants` › dragging a piece for sixty frames… | timing | Same invariant, drag path |
| `invariants` › the drag probe stops rescheduling… | timing | Protected invariant: idle draws nothing |
| `tray-3b` › board does not re-render while a group is dragged | timing | Same invariant with a Workset |
| `tray-3b` › an idle board carrying a group draws nothing | timing | Same invariant with a Workset |
| `invariants` › a full session start raises no errors | dock | **Boot**: cut, three lenses, one drag-out, clean console |
| `photo-picker` › three taps from Today to the board | dock | **The three-tap funnel** through the real picker and setup |
| `drag-out` › the piece leaves the tray and lands on the mat | dock, phone | **Drag** across the DOM→canvas seam; the only phone test in the tier |
| `hints` › holding the hint button escalates to tier 3… | dock | **A snap**: one real union-find merge from a real gesture |
| `completion` › after a solve (3 tests, one shared solve) | dock | **Solve to the card**; completion written before the session is deleted |
| `persistence` › a reload mid-session restores the board | dock | Save and restore — the path with no unit-test surface at all |

Tiers after G1:

| Tier | Command | When | Tests | Wall |
|---|---|---|---|---|
| smoke | `test:browser:smoke` | every change | 14 | 34–51s |
| pre-PR | `test:browser` (unchanged) | before a PR, and after any change to `src/ui/`, `src/persist/` or `src/input/` | 115 | 179s |
| full | `test:browser:full` (unchanged) | CI | 124 | 222s local, 250s CI |

**Gap this exposes: no browser test drags a piece onto its slot.** Every placement in the suite is
a tier-3 hint or the dev hook. Hint placement goes through the real `release()` path, so the merge
is real, but pointer-drag → `resolveSnap` → merge is covered only by
`test/play/drag-to-place.test.ts` in node. The brief asks for "one drag-and-snap" in smoke; the
honest position is that the suite does not have one. Writing it (drag a tray chip to its own slot
on an empty board, assert placed = 1) is one new test using `__tessera.loosePoints`-style geometry.
Offered as G1b; it is new coverage, so the owner's call.

**Risk.** A per-change run stops seeing 101 tests: tray lenses, select mode, the pause sheet,
first run, daily. A regression there surfaces at pre-PR rather than at the change. `CLAUDE.md`'s
"run it on every change" would need rewording to name the smoke tier, which is the owner's edit.

### G2 — a single-spec script without the `timing` tax (recommended)

`"test:browser:one": "playwright test --no-deps --project=dock"`. Measured: a 5-test request ran 10
tests in 26.4s because `dock` depends on `timing`; `--project=timing` alone is 21.6s (load 10.83).
`--no-deps` was used for all four mutation runs above without trouble. Risk: none to the gates,
which are unchanged.

### G3 — CI sharding (optional)

CI's browser job is 287s: 35s of setup (checkout, `npm ci`, Playwright install) and 250s of tests
at 3 workers. Two shards would each pay the 35s and run roughly half the tests: about 140–160s
wall for the PR check, at double the runner minutes. **Estimated, not measured** — it can only be
measured on GitHub. The `timing` project would run in both shards unless pinned to one.

`retries: 1` is not hiding flakes today: the last CI run reports 118 passed and **0 flaky**. Keep
it, but add `--fail-on-flaky-tests` so a retry that passes still turns the job red. Not a raised
retry, a stricter one.

### G4 — unblock `dock`/`phone` from `timing` (not recommended)

`timing` costs 21.6s during which three of four workers idle. Removing the dependency was measured
once validly: `--project=dock --project=phone --no-deps`, 110 passed in **196s** at load 20 → 38,
against 179s for the full per-change run *including* timing at load 9 → 20. No gain, and the
timing tests would then share the CPU they exist to have alone. The load difference between the
two runs makes the comparison weak; the conclusion is "no evidence of a win", not "proven slower".

### G5 — changed-files selection (not recommended)

Every spec boots `App` → `PlayRuntime` → the cutter, board, renderer and tray, so a coverage-derived
map would name nearly every spec for nearly every `src/` file. It would only discriminate on leaf
UI files (`DailyHub.tsx`, `SettingsSheet.tsx`). The honest version of that map is "smoke always,
plus the spec named after the screen you touched", which G1 + G2 already give without a script to
keep true. Not built, not measured.

### G6 — cheaper boot (not recommended; measured)

A temporary probe spec (deleted, never committed) timed `BoardPage.open()`:

| Pieces | 1 worker (load ~16) | 4 workers (load ~16) |
|---|---|---|
| 50 | 0.50–0.85s | 3.4–4.0s |
| 150 | 0.47–0.63s | 2.3–3.4s |
| 250 | 0.92–1.11s | 3.0–4.2s |

Piece count does not matter below 250, so dropping specs from 150 to 50 buys nothing. The boot is
0.6s of real work; the 3.4s under four workers is contention. A shared `storageState` would remove
the same 0.6s. The seeded-history pattern (place one piece, sleep 1200ms, reload) measured 0.85–1.15s
for the save to land, so replacing the sleep with a poll saves at most ~0.2s per use.

**What the probe does show:** the suite is CPU-bound on this machine. Each boot removed by
consolidation is worth about 3.4s of worker time, 0.85s of wall.

### G7 — three local workers, not four (recommended; measured)

| Workers | Wall | Result | Load (start → end) |
|---|---|---|---|
| 4 (today) | 179s | 115 passed | 9.33 → 20.14 |
| **3** | **157s** | 115 passed | 4.40 → 17.72 |
| 5 | 661s, aborted at the 8-min global timeout | 37 passed, 8 failed | 17.72 → 79.85 — **invalid**, discarded |

On six cores, a fourth Chromium plus Vite and the runner oversubscribes the CPU; three is faster
and matches CI. One-line change in `playwright.config.ts`. The start loads differ, so treat the 22s
as indicative, not exact.


### C1–C9 — consolidation (same assertions, fewer boots)

No assertion is removed, so there is no "Y covers X" claim to prove. The proof owed is after the
fact: for each merged test, re-run one mutation against it and show it still fails. The repo
already has the pattern (`completion.spec.ts` and `collection-wall.spec.ts` share one solve in a
`describe.serial` with a `beforeAll` page).

| # | Change | Tests | Boots removed | Worker time saved (per-change run) |
|---|---|---|---|---|
| C1 | `tabs`: the four read-only dock tests (floating bar, dot, hub push, no banner) share one seeded page; `home` hero-contrast and `library` "New Puzzle reaches the picker" join it | 6 → 1 group | 5 | ~26s |
| C2 | `library` "saved session becomes a card" → `persistence` test 1, with the `placed / total` and `cols × rows` assertions moved | 2 → 1 | 1 | ~6s |
| C3 | `dynamic-type`: three tests, one boot | 3 → 1 | 2 | ~5s |
| C4 | `comfort`: the three pause-sheet tests, one boot | 3 → 1 | 2 | ~7s |
| C5 | `hints`: the Classic pill assertion moves into "a tap targets…" | 2 → 1 | 1 | ~7s |
| C6 | `pause-sheet`: five non-destructive tests share a boot; the two restart tests become one | 7 → 2 | 5 | ~24s |
| C7 | `daily`: "hub on a first visit" and "skips the picker" fold into the streak test | 3 → 1 | 2 | ~6s |
| C8 | `tray`: five read-only lens tests → two | 5 → 2 | 3 | ~14s |
| C9 | `tray-3b` select mode: four simple tests (badge, stray tap, Escape, refused below two) → one | 4 → 1 | 3 | ~14s |
| | **Total** | 124 → ~95 | 24 | **~109s of 608s → ~27–35s of 179s wall** |

Estimated from the per-test times in §3.1. **Not measured**, because measuring it means
implementing it.

**Risk.** In a merged test the first failing step hides the rest. `test.step` keeps the report
readable but does not un-hide them. C6 and C9 carry the most of this risk, because their steps
change UI state (toggles, selection) and a missed reset becomes a false failure in a later step.
C2, C3, C5 and C7 are close to free.

## 6. Code redundancy (Part B)

### B1 — dead code

`find_dead_code` and `get_dead_code_v2` are not usable on this repo as indexed: the index is dated
2026-10-25 (before slice 4), includes three stale worktrees and `TesseraV3Figma/`, and detects no
entry point, so it flags every class method (`Board.constructor`, `PlayRuntime.constructor`) as
dead. I did not re-index, because the index is shared and uses git identity. Instead a script
counted word-boundary uses of every `export` in `src/` across `src/`, `test/` and `scripts/`, and
each hit was confirmed with `check_references` and `grep`.

**Dead — no reference anywhere outside the definition:**

| Symbol | File | Note |
|---|---|---|
| `reversePoint` | `src/core/geom.ts:53` | |
| `cutAll` | `src/cut/cutter.ts:134` | Non-streaming cut; superseded by the worker's streamed path |
| `CutResult` | `src/cut/types.ts:89` | `cutAll`'s return type |
| `loadSnapshot` | `src/persist/library.ts:74` | |
| `PieceCount` | `src/play/setup.ts` | Type only |
| `PROGRESS_BLOOM_SPILL_PIECE_WIDTHS` | `src/render/light.ts:31` | A design-doc number with no consumer — check §07 before deleting; it may be an unbuilt feature rather than a leftover |
| `isColourBin` | `src/tray/lenses.ts:151` | |

**Used only by tests:**

| Symbol | File | Note |
|---|---|---|
| `snapCluster` | `src/board/snap.ts:310` | 13 uses in `snap.test.ts`, none in `src/`. `PlaySession.release` composes `resolveSnap` + `applySnap` itself. The cascade and rotation tests therefore exercise a wrapper production never calls. **Not a deletion candidate** until those tests are pointed at the production composition. This is the most interesting finding in Part B. |
| `dailyDateKeyOf` | `src/daily/daily.ts:63` | |
| `isCleanRun` | `src/play/hints.ts:70` | |
| `lensEnabled` | `src/tray/lenses.ts:146` | |

**Leftovers checked and clean:** `Home.tsx` and `PhotoCrop.tsx` are gone from `src/` (the index
still shows them only in stale worktrees). `isHidden` survives only as the workset test's
`expect('isHidden' in store).toBe(false)`. `dev.html` is mentioned in one comment in `main.tsx`.
The `isNative` branches in `main.tsx` and `Today.tsx` are live on iOS and are not listed.

### B2 — duplicated UI markup

33 hand-written `<button>` elements across 18 files outside `src/ui/kit/`; 9 files import the kit.
Six hand-written `aria-pressed` toggles remain: `PhotoPicker` (Curated/Upload, a `Segmented`),
`PuzzleSetup:189` (piece count), `FirstRun:65` (Comfort, a `Toggle`), `LensChips` ×2, `PieceChip`.
The last three are tray chrome with their own touch handling and should not move to the kit.

**Recommendation: do nothing here.** The modernization session rewrites these screens. Swapping
markup now is work that session will redo, and "don't change design" rules it out of this one.

### B3 — `src/ui/App.tsx` (1,583 lines, one component from line 219)

Importer: `src/main.tsx` only. Every seam below is internal to the file, so the blast radius is
`App.tsx` plus the new file, and the browser suite is the check.

| Seam | Lines | New file | Invariant risk |
|---|---|---|---|
| Upload decode: `probeImageSize`, `decodeUpload`, `HEIC_MESSAGE` | 92–160 | `src/play/upload.ts` | None. No React, no board. The safest extraction and the only one worth doing before the redesign. |
| Completion: `buildCardMeta`, `commitCompletion`, `clearCard`, `handleDone`, `handleNewPuzzle` | 831–955 | `src/ui/useCompletion.ts` | **Order-sensitive**: completion is written before the library entry is deleted. Guarded by `completion` › "leaves the library and joins the completions". |
| Tab shell render (Today / Puzzles / Collection / hub) | ~1203–1350 | `src/ui/Shell.tsx` | Low. Play already renders outside the shell. |
| Play screen render | ~1350–1583 | `src/ui/PlayScreen.tsx` | **The one that can break "the board never re-renders through React."** The refs (`boardRef`, `trayRef`, `overTray`, `overShelf`) and the summary subscription must move together. `invariants.spec.ts` is the check. |

### B4 — `src/play/runtime.ts` (1,150 lines)

Importers: `App.tsx`, and `src/dev/e2e.ts` (type-only). `build()` (774–910) and `onPlayEvent`
(911–991) are the mass.

| Seam | New file | Invariant risk |
|---|---|---|
| `onPlayEvent` fan-out to audio, light, haptics, save | `src/play/feedback.ts` — `(event, sinks) => void`, DOM-free, so it lands on the tested side of the line | Medium. It is the one place events fan out; it must stay one place. A pure dispatcher makes "haptics is an amplifier, never the carrier" unit-testable for the first time. |
| Group-chip methods: `groupChipAt`, `renameGroup`, `groupLabel`, `measureChipText` | fold into `src/render/group-chip.ts` | Low |
| Hint accrual timer: `scheduleHintAccrual`, `clearHintAccrual` | `src/play/hints.ts` | Low |
| `e2ePlace`, `e2eLoosePoints` | leave | They need private state; moving them widens the public surface. |

**Recommendation for B3 and B4: defer all but `upload.ts` to the modernization session**, which
will be inside both files anyway and can cut along whatever its new screens need. Splitting now and
re-splitting then is double work with invariant risk both times.

### B5 — duplicated logic

- **Save paths: one.** `persist/daily.ts` stores only the streak row. A daily session saves through
  `saveLibraryEntry` like every other puzzle. No second save path exists.
- **`persist/` modules:** each is a thin wrapper over `db.ts`'s four `idb*` helpers. No duplication.
- **`src/` vs `scripts/`:** `check-bundle-budget.mjs` and `check-pwa-build.mjs` read `dist/` and
  share no logic with `src/`. `build-curated-manifest.ts` imports from `src/` through
  `ts-alias-loader.mjs` rather than re-implementing.
- **Test helpers, three copies of one thing:** "delete the database, reload, reach the picker" is
  written out in `puzzle-setup` (`toSetupScreen`), `daily` (`freshVisit`), `first-run`
  (`openFreshProfile`) and inline in `collection-wall`. And "seed one in-progress puzzle" (open,
  place, sleep 1200, reload) appears in `home`, `tabs`, `library` ×2, `persistence` ×2, `comfort`,
  `daily` ×2 and `photo-picker`. Two helpers in `board-page.ts` (`freshProfile`, `seedHistory`)
  would replace about 120 lines. No time saved; C1 would use `seedHistory` anyway.

### B6 — repo hygiene (listed, nothing deleted)

- **Worktrees (8):** `.claude/worktrees/{fix-tray-review-bugs, native-ios-capacitor-shell,
  wizardly-zhukovsky-459773, youthful-swartz-a61608, test-review-c691ac}` and
  `.worktrees/{step-5a-photo-picker-crop, step-6-daily-and-streak}`, plus the main checkout.
- **Branches merged into `main` (18):** `fix/ci-red-dynamic-type-overflow`, `fix/tray-review-bugs`,
  `home-screen`, `step-1-cutter-renderer`, `step-2-drag-snap-spring-audio`,
  `step-3a-tray-and-lenses`, `step-3b-shelf-multiselect-worksets`, `step-4-hints-and-light`,
  `step-5a-photo-picker-crop`, `step-5b-puzzle-setup`, `step-9-pwa`, `v2-slice-2`,
  `v2-slice-4-native`, `v2-spec`, `native/ios-capacitor-shell`, `step-6-daily-and-streak`,
  `claude/wizardly-zhukovsky-459773`, `claude/youthful-swartz-a61608`. None are unmerged.
- **`dist/` and `test-results/` are ignored** (`.gitignore`). The main checkout's `test-results/` is
  230 MB of old traces.
- **`.claude/worktrees/` is not in `.gitignore`** (`.worktrees/` is).
- **`TesseraV3Figma/`** and two `2026-08-23-tray-review-bugs-*` docs sit untracked in the main
  checkout.
- **`handoff.md` stops at slice 2** (§14, 2026-10-25). Slice 4 has no section.
- **The jCodemunch index** is three weeks stale and includes the stale worktrees.

## 7. Ranking

By minutes saved per week against risk, at 30 per-change runs and 5 pre-PR runs:

1. **G1 smoke tier** — ~65 min/week, medium risk, one line in `package.json` and 14 tags.
2. **G2 `test:browser:one`** — ~10 min/week, no risk.
3. **G3 CI shards + `--fail-on-flaky-tests`** — ~10 min/week of waiting, low risk.
4. **C2, C3, C5, C7** (the safe consolidations) — ~6s per pre-PR run, low risk.
5. **D1–D3** — ~4s per pre-PR run, low risk, mutation-proven.
6. **C1, C4, C6, C8, C9** — ~24s per pre-PR run, low–medium risk.
7. **B1 dead exports**, **B3 `upload.ts`**, **U1 grid fixture**, **B5 test helpers** — no time, low risk, tidier.
8. **Not recommended:** G4, G5, G6. **Deferred to the modernization session:** B2, B3 (rest), B4.

If G1 is taken, items 4–6 matter much less: they shorten a run that happens five times a week
instead of thirty.

## 8. Follow-ups outside this review

- The load-sensitive `first-run` test (§1).
- No real IndexedDB upgrade test (§4, D3).
- No browser drag-to-snap test (§5, G1b).
- `snapCluster` is tested but never called by production (§6, B1).
- `CLAUDE.md` says ~125 tests and "under 3 minutes"; measured 124 and 179s. Its "run on every
  change" wording needs the owner's edit if G1 is taken.

## 9. Method notes

- Per-test times: Playwright `--reporter=json`, last result per test. Unit: `vitest --reporter=json`.
- jCodemunch was used for `resolve_repo`, `get_dead_code_v2`, `find_dead_code` and
  `check_references`. `plan_turn` and the symbol tools were not used for the test files, because the
  index predates slice 4 and the specs had to be read as they are on `main` today.
- Slice 3 (`/privacy`, telemetry, a Settings toggle, Send feedback) is still pending. The only test
  it leans on is `tabs` › "the gear opens Settings", which is kept on its own boot.
- Not run: `npm run build`, `check-bundle-budget`, `check-pwa-build`, `typecheck`. Nothing was
  changed that they would see.

## 10. Results after implementation (G1, G2, G7, D1–D3)

| Gate | Before | After | Load (start → end) |
|---|---|---|---|
| `npm test` | 675 passed, 5.7s | 675 passed (unchanged) | — |
| Per-change: `test:browser` → **`test:browser:smoke`** | 179s, 115 tests | **58.5s / 45.5s**, 14 passed, 0 failed (two runs) | 7.18 → 12.60 → 14.13 |
| Pre-PR: `test:browser` (3 workers, D1–D3 removed) | 179s, 115 tests | 249s, 112 passed, 6 skipped, 0 failed | 14.13 → **41.08** — contended; the quiet-machine figure is G7's 157s |

Per-change speed-up: **179s → ~45–58s, 3.1–4.0×.** Every gate is now under five minutes, even the
contended pre-PR run.

`tabs.spec.ts` › "the tab bar is absent in setup and on the board" gained one assertion (Continue
visible after Back) so D2's mutation fails in 5s rather than at the 90s test timeout.
