# v2 Slice 2 — Web v2 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the v2 layout and flow on the web build: three tabs, a three-step funnel, a hint count, a 35% default tray, landscape-only iPad dock with a side setting, and an inline offline/install banner.

**Architecture:** `App.tsx` already early-returns one tree per `screen`, and play is its own tree, so the tab shell wraps only the non-play returns (`home`, `daily`, `library`, `wall`) and never touches `PlayRuntime`. Every new decision goes in a DOM-free module with a vitest test (`src/play/hints.ts`, `src/ui/sheet-detents.ts`, `src/persist/prefs.ts`). The components that use them stay thin.

**Tech Stack:** React 19, zustand, Tailwind, vitest (node), Playwright (pinned).

**Spec:** `docs/superpowers/specs/2026-10-18-v2-redesign-design.md` (§3–§5, §9 Slice 2)

## Global Constraints

- The board never re-renders through React. `hintsLeft` changes only on spend and at accrual boundaries, never per frame.
- No `localStorage` for anything new. Preferences go in IndexedDB through `STORE_DAILY` key/value rows, the same way `first-run.ts` stores its flag.
- Touch targets have a 44pt floor everywhere, and the tab bar is 49pt plus `env(safe-area-inset-bottom)`.
- The default sheet detent is **35%** of the viewport. The detents are peek 96px, default 0.35, half 0.5 and full 0.88.
- `DOCK_QUERY` = `(orientation: landscape) and (min-width: 1024px)`.
- The tab bar is hidden in setup, play, first-run and on the completion card.
- Copy is plain and warm, never cute, with no exclamation marks.
- `npm run test:browser` is the gate at the end of every task that changes UI.

## Review Focus

- **A skipped tutorial reappearing on Home.** Skip, then reload: Home shows no Continue card and the library is empty (Task 1).
- **A Zen or daily-mode hint label.** Zen shows plain `Hint` with no number. A daily uses Classic's allowance (Task 2).
- **Rotating an iPad mid-puzzle.** Going from landscape to portrait swaps the dock for the sheet without losing the board or the lens (Task 4).
- **Picking an upload that fails to decode.** The player stays on step 1 with the error, and the funnel never advances (Task 5).
- **The banner appearing while the player is in setup.** It renders on Today only, never over a call to action (Task 6).

---

### Task 1: B6 — skipping the first run leaves nothing in the library

**Files:**
- Modify: `src/ui/App.tsx` (`handleFirstRunSkip`, ~line 493)
- Test: `test/browser/first-run.spec.ts`

- [ ] **Step 1: Write the failing test.** Add `test('skip leaves no library entry behind')` to the first-run spec. On a fresh profile, click `Skip`, run `page.reload()`, then start a puzzle through `BoardPage`-style steps. Reload again and assert that `page.getByText('0 / 12')` has count 0. Then read the `sessions` store with `page.evaluate`, open `indexedDB` and assert no key equals `'first-run'`.
- [ ] **Step 2:** Run `npx playwright test first-run.spec.ts -g "no library entry"`. The expected result is FAIL, because the `first-run` row exists.
- [ ] **Step 3:** In `handleFirstRunSkip`, after `saveInFlight.current` settles, call `deleteLibraryEntry(FIRST_RUN_PUZZLE_ID)` before `listLibrary()`. The order is save, then delete, so a late debounced save can't recreate the row.
- [ ] **Step 4:** Run the test again. The expected result is PASS. Then run `npm test`.
- [ ] **Step 5:** Commit with the message `Fix B6: a skipped first run no longer persists as a library entry`.

### Task 2: Hint count

**Files:**
- Modify: `src/play/hints.ts`, `src/play/runtime.ts` (`RuntimeSummary`, constructor/start, `destroy`, the hint-fire `patch` at ~620), `src/ui/store.ts` (mirror field), `src/ui/HintButton.tsx`, `src/ui/App.tsx` (pass prop)
- Test: `test/play/hints.test.ts`, `test/browser/hints.spec.ts`

**Interfaces:**
- Produces `hintsLeft(hintsUsed: number, elapsedMs: number, mode: PuzzleMode): number | null`. It returns `null` for Zen, meaning unlimited.
- Produces `msUntilNextHint(elapsedMs: number, mode: PuzzleMode): number | null`. It returns `null` for Zen.
- Produces `RuntimeSummary.hintsLeft: number | null`.
- Produces `HintButtonProps.count: number | null`.

- [ ] **Step 1: Write the failing tests.**
  - `hintsLeft(0, 0, 'classic') === 3`.
  - `hintsLeft(2, 0, 'classic') === 1`.
  - `hintsLeft(3, HINT_REFILL_INTERVAL_MS, 'classic') === 1`.
  - `hintsLeft(5, 0, 'classic') === 0`, never negative.
  - `hintsLeft(0, 0, 'zen') === null`.
  - `msUntilNextHint(0, 'classic') === HINT_REFILL_INTERVAL_MS`.
  - `msUntilNextHint(HINT_REFILL_INTERVAL_MS - 1, 'classic') === 1`.
  - `msUntilNextHint(x, 'zen') === null`.
- [ ] **Step 2:** Run `npx vitest run test/play/hints.test.ts`. The expected result is FAIL.
- [ ] **Step 3:** Implement both functions in `hints.ts`.
- [ ] **Step 4:** In `runtime.ts`, add `hintsLeft` to `RuntimeSummary`, with an initial value from `hintsLeft(0, 0, mode)`. Every `patch` that sets `hintsUsed` also sets `hintsLeft`. Add a private `hintTimer: number | null` and a `scheduleHintAccrual()`. It clears the old timer, reads `msUntilNextHint(session.elapsedMs(performance.now()), mode)`, and when that isn't null sets a `setTimeout` that patches `hintsLeft` and reschedules. Call it when play starts or is restored. Clear it in `destroy()` and on `complete`.
- [ ] **Step 5:** `HintButton` gets a `count` prop.
  - When `count` is a number, the label is `Hint · {count}` and the aria-label is `Hint, {count} left`.
  - When `count` is `null`, the label and aria-label stay exactly `Hint`. This keeps `first-run.spec.ts:108` true, because the first run is Zen.
  - At count 0 the button is dimmed (`opacity-60`) but stays enabled, because tier 1 is always free.
  - `App.tsx` passes `summary.hintsLeft`.
- [ ] **Step 6:** Add a browser test to `hints.spec.ts`: a Classic puzzle shows `Hint · 3`, and a Zen puzzle opened with `BoardPage.open(page, { mode: 'Zen' })` shows a button whose text is exactly `Hint`. Run `npm test` and `npx playwright test hints.spec.ts invariants.spec.ts`. The expected result is PASS.
- [ ] **Step 7:** Commit with the message `Hint pill shows what is left; refreshed on spend and at accrual, never per frame`.

### Task 3: Sheet detents — 35% default

**Files:**
- Create: `src/ui/sheet-detents.ts`
- Modify: `src/ui/Sheet.tsx` (move `heightOf`/`nearest` out), `src/ui/store.ts` (`SheetDetent`, default)
- Test: `test/ui/sheet-detents.test.ts` (new folder), `test/browser/tray.spec.ts`

**Interfaces:**
- Produces `type SheetDetent = 'peek' | 'default' | 'half' | 'full'`. It moves to `sheet-detents.ts`, and `store.ts` re-exports it.
- Produces `heightOf(detent: SheetDetent, viewport: number, growPeek: boolean, pinnedPx: number | null): number`.
- Produces `nearestDetent(target: number, viewport: number, growPeek: boolean, pinnedPx: number | null): SheetDetent`.

- [ ] **Step 1: Write the failing tests.**
  - `heightOf('default', 844, false, null) === 295`, which is `Math.round(844 * 0.35)`.
  - `heightOf('half', 844, …) === 422`.
  - `heightOf('full', 844, …) === 743`.
  - `heightOf('peek', 844, true, 140) === 140`.
  - `nearestDetent(300, 844, false, null) === 'default'`.
  - `nearestDetent(380, 844, false, null) === 'half'`.
  - `nearestDetent(100, 844, false, null) === 'peek'`.
- [ ] **Step 2:** Run `npx vitest run test/ui/sheet-detents.test.ts`. The expected result is FAIL. Check that vitest's `include` covers `test/ui/**`, and add it if not.
- [ ] **Step 3:** Implement the module, have `Sheet.tsx` import it, and set the store default to `'default'`. `collapseForDrag` and `restoreAfterDrag` already round-trip any detent and need no change.
- [ ] **Step 4:** Add a browser test to `tray.spec.ts`, phone project only. After `BoardPage.open`, the `[aria-label="Pieces"]` section's height is within ±4px of `round(viewport.height * 0.35)` plus the bottom inset.
- [ ] **Step 5:** Run `npm test` and `npx playwright test tray.spec.ts tray-3b.spec.ts drag-out.spec.ts --project=phone`. The expected result is PASS. `tray-3b`'s full-detent cases must still pass.
- [ ] **Step 6:** Commit with the message `Tray opens at 35%: a fourth detent, so the board gets ~59% of a phone`.

### Task 4: iPad dock — landscape only, either side

**Files:**
- Create: `src/persist/prefs.ts`
- Modify: `src/ui/useMediaQuery.ts` (`DOCK_QUERY`), `src/ui/store.ts` (`traySide`, `setTraySide`), `src/ui/App.tsx` (load the pref on mount, order the flex row), `src/ui/Tray.tsx` (inner-edge resize handle and safe-area padding follow the side), `src/ui/HintButton.tsx` (`side` prop puts it in the opposite corner)
- Test: `test/persist/prefs.test.ts` if `test/persist` has an IndexedDB shim. Otherwise the behaviour is covered in the browser test only. `test/browser/tray.spec.ts`

**Interfaces:**
- Produces `type TraySide = 'left' | 'right'`.
- Produces `loadTraySide(): Promise<TraySide>`, which defaults to `'right'` when the row is missing or unreadable.
- Produces `saveTraySide(side: TraySide): Promise<void>`. The row is `{ key: 'traySide', side }` in `STORE_DAILY`.

- [ ] **Step 1: Write the failing browser tests.**
  - At 820×1180 (`page.setViewportSize`), the tray is the bottom sheet: the section's bottom equals the viewport bottom and its width is greater than 90% of the viewport.
  - At 1180×820 the tray is docked, with width between 300 and 380 and its right edge at the viewport's right edge.
  - Rotating from 1180×820 to 820×1180 mid-puzzle keeps `remaining()` unchanged and the active lens unchanged.
- [ ] **Step 2:** Run the new tests. The expected result is that the portrait case FAILS, because it's docked today.
- [ ] **Step 3:** Change `DOCK_QUERY`, then implement `prefs.ts` and the store field. When `traySide === 'left'`, `App.tsx` renders the tray before the board in the flex row. The tray's resize handle moves to its right edge, its padding uses `env(safe-area-inset-left)`, and `HintButton` sits bottom-left.
- [ ] **Step 4:** The setting lives in the Settings sheet (Task 6). Until then, cover it with a browser test that sets the pref through `page.evaluate` against IndexedDB, reloads, and asserts the dock's left edge is 0 and the Hint button's left edge is less than 100.
- [ ] **Step 5:** Run `npm test` and `npx playwright test tray.spec.ts`. The expected result is PASS on both projects.
- [ ] **Step 6:** Commit with the message `Dock the tray only in landscape iPad; let the player choose its side`.

### Task 5: Three-step funnel — tap advances, crop lives in setup

**Files:**
- Create: `src/ui/CropCanvas.tsx`. It's extracted from `PhotoCrop.tsx`: frame, pan, pinch/zoom, aspect, rotate and the grid overlay, as a controlled component.
- Delete: `src/ui/PhotoCrop.tsx` after extraction. `rasterizeCrop` moves to `CropCanvas.tsx` or stays exported from a small `src/ui/crop.ts`.
- Modify: `src/ui/PhotoPicker.tsx`, `src/ui/PuzzleSetup.tsx`, `src/ui/App.tsx` (`SetupPhase` loses `'cropping'`, and `handleCropConfirm` folds into `handleSetupConfirm`), `test/browser/board-page.ts`, and every spec listed in Step 6.

**Interfaces:**
- Produces `interface CropState { aspect: number | 'original'; rotateSteps: RotateSteps; zoom: number; pan: { x: number; y: number } }`.
- Produces `CropCanvas({ source, state, onChange, gridCount }: { source: ImageBitmap; state: CropState; onChange(next: CropState): void; gridCount: number })`. The grid overlay draws `gridCount` pieces, replacing `PREVIEW_TARGET_COUNT`.
- Produces `finishCrop(source: ImageBitmap, state: CropState): ImageBitmap`. It wraps the existing `rect` maths, `downscaleTarget` and `rasterizeCrop`.
- `PuzzleSetupProps` becomes `{ source: ImageBitmap; onConfirm(r: { source: ImageBitmap; seed: number; puzzleId: string; config: PuzzleConfig }): void; onBack(): void }`. The puzzle id is minted in setup's Start with `crypto.randomUUID()`, so the browser suite's stub still applies.
- `SetupPhase['configuring']` becomes `{ kind: 'configuring'; source: ImageBitmap; photoId: string | null }`. Here `source` is the *uncropped* bitmap. It's closed on Back and on Start, after `finishCrop`.

- [ ] **Step 1: Write the failing browser test.** In `photo-picker.spec.ts`, `test('three taps from Today to the board')` does the following:
  - Start from a profile with history, which `home.spec.ts` already shows how to seed.
  - Tap `New puzzle`, then the first curated tile (`getByRole('button', { name: /Mountain Lake/ })`), then `Start cutting`.
  - Assert `BoardPage.waitForCut()` resolves.
  - Count the clicks: exactly 3.
- [ ] **Step 2:** Run it. The expected result is FAIL.
- [ ] **Step 3:** Change `PhotoPicker` so a tile press calls `onPhotoChosen` directly. Remove the selected state and the "Choose this photo" button. Remove the header's Collection and Today buttons and add a Back button that calls `onBack`, which fixes B5. The source toggle keeps its two options.
- [ ] **Step 4:** Extract `CropCanvas` and `finishCrop`, then rebuild `PuzzleSetup` per spec §4 step 2:
  - The crop canvas is about 48% of the height.
  - Below it come the count ladder and Mode.
  - A `More options` disclosure, closed by default, holds Rotation, Aspect and the assists.
  - A sticky `Start cutting` button sits at the bottom, with `padding-bottom: max(16px, env(safe-area-inset-bottom))`, which fixes B4.
  - On iPad (≥ 768) the canvas goes left and the controls right.
- [ ] **Step 5:** In `App.tsx`, `handlePhotoChosen` goes straight to `configuring`. `handleSetupConfirm` takes the new result shape and closes the uncropped source.
- [ ] **Step 6:** In `board-page.ts`, replace the Choose/Use clicks with one `chooseFirstCuratedPhoto(page)` helper and export it. Then sweep `first-run`, `comfort`, `completion`, `persistence`, `daily`, `puzzle-setup`, `reference-panel`, `home`, `library`, `collection-wall` and `photo-picker` specs onto the helper. `puzzle-setup.spec.ts` assertions about assists must open `More options` first.
- [ ] **Step 7:** Run `npm test`, `npm run typecheck` and `npm run test:browser`. The expected result is all green.
- [ ] **Step 8:** Commit with the message `Three-step funnel: a tapped photo advances, and crop lives inside setup`.

### Task 6: Tab shell, Today, Settings sheet, inline banner

**Files:**
- Create: `src/ui/TabBar.tsx` and `src/ui/SettingsSheet.tsx`.
- Modify: `src/ui/Home.tsx` (becomes Today), `src/ui/Library.tsx`, `src/ui/CollectionWall.tsx`, `src/ui/DailyHub.tsx` (drop their own cross-navigation buttons in favour of tabs), `src/ui/App.tsx` (wrap the four non-play returns), `src/ui/PwaBanner.tsx` (inline variant, no `fixed`), `src/main.tsx` (stop mounting `PwaBanner` globally)
- Test: `test/browser/home.spec.ts` and a new `test/browser/tabs.spec.ts`

**Interfaces:**
- Produces `type Tab = 'today' | 'puzzles' | 'collection'`.
- Produces `TabBar({ active, onSelect, todayBadge }: { active: Tab; onSelect(tab: Tab): void; todayBadge: boolean })`.
- Produces `tabOf(screen: Screen): Tab | null`, which maps `home` and `daily` to `'today'`, `library` to `'puzzles'`, `wall` to `'collection'`, and everything else to `null`.
- Produces `SettingsSheet({ open, onClose, traySide, onTraySide })`. It has rows for Tray side (segmented Left/Right) and How to play (a static explainer). Slice 3 appends more rows.
- Produces `PwaBanner({ variant: 'inline' })`, rendered by Today only.

- [ ] **Step 1: Write the failing browser tests** in `tabs.spec.ts`.
  - With a seeded history, the tab bar shows three tabs named Today, Puzzles and Collection.
  - Each tab shows its screen.
  - The tab bar is absent on setup and on the board, checked with `getByRole('navigation', { name: 'Tabs' })` having count 0.
  - On the phone, the tab bar's bottom equals the viewport bottom. On the dock, it sits at the top.
  - The Today badge shows when the daily is unplayed.
  - In `home.spec.ts`, the offline banner, when present, never intersects any `button` in the main column. The test forces `offlineReady` through the existing `vite-plugin-pwa` hook if exposed. Otherwise it asserts that `[role=status].fixed` has count 0 on every screen.
- [ ] **Step 2:** Run them. The expected result is FAIL.
- [ ] **Step 3:** Implement the following:
  - **`TabBar`.** A `<nav aria-label="Tabs">` with icons and labels, 49pt plus the bottom inset. At ≥ 768 it's a floating top bar.
  - **Today.** The daily hero, then the Continue card (most recent in-progress, not just "exactly one"), then a primary `New puzzle` button, then the inline banner row. The gear opens `SettingsSheet`.
  - **Daily hub.** It's a push within Today, with a Back button to Today.
  - **Puzzles.** It gets a `+` button in the title bar, named "New puzzle".
  - **Collection.** It's the wall without its Back button.
  - **`SettingsSheet` Tray side.** It writes `saveTraySide` and the store.
  - **B7.** Raise the daily hero caption contrast with a scrim gradient.
- [ ] **Step 4:** Run `npm test`, `npm run typecheck` and `npm run test:browser`. The expected result is all green, including `invariants.spec.ts`.
- [ ] **Step 5:** Commit with the message `Three tabs — Today, Puzzles, Collection — and the banner moves inline on Today`.

### Task 7: Gate and hand-off

- [ ] **Step 1:** Run `npm test`, `npm run typecheck`, `npm run build` and `npm run test:browser`, all on a clean run. Record the counts.
- [ ] **Step 2:** Re-run the baseline capture script against `npm run dev` at the three viewports. Save the new screenshots as `docs/superpowers/specs/assets/v2-after/` JPEGs and compare them with the baseline for B1–B7.
- [ ] **Step 3:** Append a v2 slice 2 section to `handoff.md`, push the branch, and give the owner the `pull/new` URL, because the PAT can't open PRs.
