# Modernize phase c — Play chrome and tray — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The play screen becomes spec §5. It gets:
- a quiet top bar with the puzzle's name and a progress line;
- a 52pt hint with a numeral badge;
- a board framed above the sheet;
- a one-row tray header with a reference thumbnail, and pill lenses;
- frameless chips, a recessed shelf, and a selection bar with Pin.

Sheet and hand-off motion follow §5's numbers. The play JSX is extracted from `App.tsx` into `PlayScreen.tsx`.

**Architecture:** Every number with a decision in it is a pure function, tested in node:
- sheet physics: `src/ui/sheet-motion.ts`;
- fit-into-a-rect and the eased fit: `src/render/camera.ts`;
- the top bar's lines: `src/play/top-bar.ts`;
- the hand-off lift and the return-home path: `src/play/handoff.ts`.

Components only draw. The sheet's per-frame height is written to `element.style`, never React state. React re-renders only on a detent change, so a sheet drag cannot churn the tray.

**Tech Stack:** React 19, Tailwind v4, Canvas 2D, Vitest (node), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-modernize-design.md` §2, §5 (incl. Motion table), §9 C1 and C4 (approved 2026-11-21), §11 row c, §13 last bullet. Comps: `docs/superpowers/specs/assets/2026-11-15-modernize/tray-phones.webp`, `tray-ipad.webp`.

## Global Constraints

- **Top bar:**
  - Puzzle name: serif `text-4` (20).
  - `n / N` in mono below it.
  - Fit and Pause: 44pt ghost icon buttons. Keep the accessible names `Fit` and `Pause`.
  - A 3px progress line in `--accent` under the bar: width transition 320ms `--ease-standard`, driven by a CSS transition on one property, never per frame.
- **Hint:** 52pt round, `Icon.Lightbulb`, numeral badge (none in Zen, where the count is `null`).
  - On spend: a 200ms 1 → 1.15 → 1 scale on the badge, once.
  - No idle animation.
  - The tier hold behaviour is unchanged.
- **Board framing:**
  - Fit and the opening view frame into the *visible* rect: the board container minus the top bar's bottom edge, minus the sheet height on a phone.
  - On a detent change, refit with an eased 320ms fit. Never per frame during a sheet drag.
- **Tray header, one row:**
  - Eyebrow `TRAY · {N} LOOSE` on the left.
  - A 44pt reference thumbnail button on the right. It replaces the "Reference photo · Show/Hide" row; tap toggles the reference panel as today.
- **Lenses:**
  - 36pt-tall pills with mono counts.
  - Active lens: `--color-accent-tray` fill at 22% plus a 1px accent ring.
  - Colour bins keep swatch **and** numeral.
  - Region enables above 1.5× as now.
  - The dock wraps the lens row instead of scrolling.
- **Chips:**
  - No cell frame: the silhouette on the felt, with one shared soft shadow.
  - The edge bracket glyph stays.
  - Selected: 2px accent ring plus the order numeral badge.
  - Press: CSS `scale(1.06)` over 120ms on `:active`, never React state.
- **Shelf:** a recessed well (`--mat-deep`, inset shadow) labelled with a pin glyph and "Pinned".
- **Selection bar:** "{n} selected", **Pin**, **Pull out** (accent primary), **Cancel**.
- **iPad dock:** 340pt.
- **Motion:** exactly the numbers in spec §5's Motion table. The tab-switch and push rows are phase e, not here.
- **Never:**
  - board or tray re-rendered per frame through React;
  - an infinite animation;
  - a hard number from CLAUDE.md changed;
  - a control with nothing behind it;
  - colour as the only signal;
  - CDN fonts;
  - `localStorage`.

## Rulings (executor's, recorded for the owner)

1. **R1:** The zoom clamp's 1× stays "the board filling the board container". Only *where* fit frames changes. This leaves CLAUDE.md's zoom hard number untouched. A fit into the smaller visible rect may land below 1×, clamped at 0.5× as before.
2. **R2:** A detent change refits only if the camera is still where the last fit put it. Any pan, zoom or double-tap clears that. Throwing away a player's zoom because they opened the tray would be the camera fighting them (camera-controls' own comment).
3. **R3:** The order badge stays top-right, as in the comp. The edge bracket owns top-left, and the spec's "top-left" text would collide with it.
4. **R4:** The chip shadow is drawn with `shadowBlur` into the chip's own canvas, once per mount. It is not baked into a cut-time atlas. Piece bitmaps are not re-rasterised (hard number).
5. **R5:** Pin pins every selected loose piece through the tray's existing `pin`, then leaves select mode. It is persisted like a drop-to-shelf.
6. **R6:** The lens change is a 120ms fade-in of the new grid. It is not a two-layer cross-fade: a virtualised grid has no old layer worth keeping. The canonical order never reflows.

## Review Focus

1. **The player has zoomed in and opens the sheet to half.** Their camera stays put (R2). Test in Task 5.
2. **A drop on the tray at reduced motion.** The piece is in the tray on the release tick, the chip shows with no animation, and nothing keeps scheduling frames. Test in Task 9.
3. **A sheet flick released past full, or below peek, at high velocity.** It lands on a detent and never overshoots. Test in Task 6 (`settleSheet` never exceeds the target).
4. **A 402pt phone at 200% type.** The top bar's name truncates; Fit and Pause stay 44pt and on-screen. Test in Task 3.
5. **Select mode with one piece selected.** Pin works (one piece) and Pull out stays disabled below two. Test in Task 8.

---

### Task 1: extract `PlayScreen`

**Files:**
- Create: `src/ui/PlayScreen.tsx`
- Modify: `src/ui/App.tsx` (the play `return` block, ~1420–1610)

**Interfaces — Produces:** `PlayScreen(props: PlayScreenProps)`. It takes:
- everything the block reads today, passed as props (summary, playConfig, refs, handlers, `docked`, `chrome`, `trayHeight`, card state);
- `children` for nothing.

It renders the board container, the card or the top bar, the hint, the rename form, the first-run overlay, the tray or sheet, and the pause sheet. State and effects stay in `App`.

- [ ] **Step 1:** Move the JSX verbatim. Props are named after the `App` locals they replace.
- [ ] **Step 2:** `npm run typecheck`; `npm run test:browser:smoke` — PASS, unchanged.
- [ ] **Step 3: Commit** — `PlayScreen: the play JSX out of App, no behaviour change`

---

### Task 2: a piece dragged by hand onto its slot

**Files:**
- Modify: `src/play/runtime.ts` (add `e2eSlotPoint`), `src/dev/e2e.ts` (hook `slotPoint`), `test/browser/board-page.ts` (`slotPoint(id)`)
- Test: `test/browser/drag-to-slot.spec.ts`

**Interfaces — Produces:**
- `PlayRuntime.e2eSlotPoint(id: PieceId): { x: number; y: number } | null`: the client coords of the centre of a piece's solved slot, via the camera.
- `__tessera.slotPoint(id)`.
- `BoardPage.slotPoint(id)`.

- [ ] **Step 1: Failing test** `a loose piece dragged by hand onto its own slot is placed` (`@smoke`), on dock and `@phone`:
  1. `BoardPage.open(page, { pieceCount: 50, mode: 'Zen' })`, then `autoPlace(10)` so neighbours exist.
  2. Take a loose piece from `loosePoints()` and its `slotPoint(id)`.
  3. `mouse.down`, then `mouse.move` in 12 steps to the slot, then `mouse.up`.
  4. `expect((await board.placed()).placed).toBe(before + 1)`.
- [ ] **Step 2: Run** `npm run test:browser:one -- drag-to-slot.spec.ts` — FAIL (`slotPoint` missing).
- [ ] **Step 3: Implement** the hook from the board's solved origin (`session.board.homeOf(id)` or its equivalent) plus half the piece size, through `worldToScreen`, plus the canvas rect.
- [ ] **Step 4: Run** — PASS on both projects. If the phone drop lands under the sheet, the test uses `matPoint`'s guard. Never retry it.
- [ ] **Step 5: Commit** — `Browser suite: a piece dragged by hand onto its slot (the 2026-11-15 gap)`

---

### Task 3: the top bar

**Files:**
- Create: `src/play/top-bar.ts`, `test/play/top-bar.test.ts`
- Modify: `src/ui/TopBar.tsx`, `src/ui/PlayScreen.tsx`, `src/ui/kit/Icon.tsx` (`Fit`: four corner brackets, 1.75 stroke)
- Test: `test/browser/play-chrome.spec.ts` (new)

**Interfaces — Produces:**
- `topBarModel(input: { status: 'cutting' | 'playing' | 'complete' | 'failed'; placed: number; total: number; cut: { done: number; total: number } }): { count: string; progress: number }`.
  - `count`:
    - playing or complete: `"35 / 104"`;
    - cutting: `"Cutting 12 of 104"`, or `"Cutting"` while the total is 0;
    - failed: `"The cut failed"`.
  - `progress` is in 0–1, and is 0 while cutting.
- `TopBarProps` adds `title: string`.
- `PlayScreen` passes `puzzleTitle(playConfig.puzzleId, playConfig.photoId)`.

- [ ] **Step 1: Failing tests.**
  - Unit: the four `count` strings above, and `progress` is `35/104` when playing.
  - Browser (`play-chrome.spec.ts`):
    - the header has a heading with the curated photo's name (not "Your photo");
    - `getByText(/^\d+ \/ \d+$/)` is visible;
    - `getByRole('progressbar', { name: 'Progress' })`'s inner line width ratio ≈ `placed/total` after `autoPlace(5)`, within 2%;
    - at a 32px root on `@phone`, the Fit and Pause boxes are ≥ 44 wide and inside the viewport.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
  - Layout: name (`font-display text-4 truncate`) over the `count` (`font-data text-1`). Ghost icon buttons `Icon.Fit` and `Icon.Pause`, keeping `aria-label` `Fit` and `Pause`.
  - The line is a 3px track (`--edge-hair`) holding a `--accent` bar. It uses `role="progressbar" aria-label="Progress" aria-valuenow`, and is styled `width: {progress*100}%` with `transition: width var(--duration-slow) var(--ease-standard)`.
  - Drop the ring and the `cols × rows` line: the comp has neither.
- [ ] **Step 4: Run** unit, the spec, and `test:browser:smoke` — PASS. Update any selector that read `cols × rows`.
- [ ] **Step 5: Commit** — `Top bar: the puzzle's name, n / N, icon Fit and Pause, and a progress line`

---

### Task 4: the 52pt hint

**Files:**
- Modify: `src/ui/HintButton.tsx`, `src/ui/theme.css` (`@keyframes badge-bump`), `test/browser/hints.spec.ts` (the `'Hint · 3'` text selector becomes the badge)

**Interfaces:** props unchanged. The `aria-label` is unchanged (`Hint, 3 left …`).

- [ ] **Step 1: Failing test** in `hints.spec.ts`, `the hint is a 52pt lightbulb with its count as a badge`:
  - the button's box is 52×52 (±1);
  - its badge text is `3`;
  - after one Tier 2 spend the badge reads `2` and has `getAnimations().length === 1`, then 0 after 300ms. One-shot, never infinite.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
  - A 52px round ghost button with `Icon.Lightbulb` at size 22.
  - The badge is an absolute 18px accent circle at the top-right with a mono numeral, `key={count}` so a change remounts it.
  - Styled `animation: badge-bump var(--duration-base) var(--ease-standard)`; keyframes 1 → 1.15 → 1.
  - No badge when `count === null`. At `count === 0` the button dims to 0.6 as now.
  - Under `prefers-reduced-motion`, `animation: none`.
- [ ] **Step 4: Run** `hints.spec.ts` plus smoke — PASS.
- [ ] **Step 5: Commit** — `Hint: a 52pt lightbulb with a numeral badge that bumps once on spend (C4)`

---

### Task 5: the board framed above the sheet

**Files:**
- Modify:
  - `src/render/camera.ts`, `src/render/camera-controls.ts`
  - `src/play/runtime.ts`: `setTrayInsets` gains `top`; add `refitIfAtFit(): void`
  - `src/ui/App.tsx` (`updateInsets`: `top` = the top bar's bottom edge relative to the board container)
- Test: `test/render/camera.test.ts`, `test/browser/play-chrome.spec.ts`

**Interfaces — Produces:**
- `fitCameraInRect(viewport: Size, visible: Rect /* screen px within viewport */, bounds: Rect, board: { w: number; h: number }, minRelativeZoom?: number): Camera`.
  - The zoom fits `bounds` into `visible.w × visible.h` (margin 0.9).
  - It is clamped with the *full-viewport* `fitScale` as 1× (R1).
  - The centre is offset so that `bounds`' centre lands on `visible`'s centre.
- `easeCamera(from: Camera, to: Camera, t: number /* 0..1 */): Camera`: the cubic-bezier `(0.32, 0.72, 0, 1)`. Zoom is interpolated in log space.
- `CameraControls.fit({ animate?: boolean })`:
  - eased over 320ms through the frame scheduler when `animate` is set;
  - instant under reduced motion;
  - it sets `atFit = true`, and any gesture sets it to false.
- `CameraControls.atFit: boolean`.

- [ ] **Step 1: Failing tests.**
  - Unit:
    - `fitCameraInRect` with `visible` the lower half empty puts the board centre at `visible`'s centre on screen (`worldToScreen`) and inside it;
    - its zoom never falls below 0.5 × the full-viewport fit;
    - `easeCamera` at t=0 and t=1 returns `from` and `to` exactly, and is monotone in x.
  - Browser (`@phone`), `the board sits above the sheet at its resting detent`: `frameRect().bottom <= sheet top` and `frameRect().top >= top bar bottom` after load and after `Fit`.
  - Browser, `opening the sheet refits only a camera still at its fit`:
    1. Set the half detent: the frame's bottom is still above the sheet.
    2. Zoom with the wheel, then set the full detent: `frameRect()` is unchanged (R2).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
  - Fit, the opening view (`fitCameraToBounds` callers) and double-tap all go through `fitCameraInRect` with the runtime's visible rect.
  - The tween is driven by the existing scheduler. It ends at t=1 and schedules nothing after, so the idle invariant holds.
  - `App` calls `runtime.refitIfAtFit()` when the sheet's detent changes, never from the drag.
- [ ] **Step 4: Run** unit, `play-chrome.spec.ts`, `first-run.spec.ts` (the 402 frame test), then smoke — PASS.
- [ ] **Step 5: Commit** — `Board framing: fit into the visible rect above the sheet, eased refit on a detent change`

---

### Task 6: sheet motion (C1)

**Files:**
- Create: `src/ui/sheet-motion.ts`, `test/ui/sheet-motion.test.ts`
- Modify: `src/ui/Sheet.tsx`, `test/browser/invariants.spec.ts`

**Interfaces — Produces:**
- `rubberBand(height: number, min: number, max: number, factor = 0.35): number`: identity inside `[min, max]`; past an edge, the edge plus excess × 0.35.
- `releaseTarget(height: number, velocityPxPerS: number /* + = growing */, detents: readonly number[] /* ascending */): number`.
  - The projection is `height + v × 0.18`; snap to the nearest detent.
  - If that skips more than one detent from the nearest-to-release, clamp to one step unless |v| > 1800.
- `settleSheet(state: { h: number; v: number }, target: number, dtS: number): { h: number; v: number; done: boolean }`.
  - Semi-implicit Euler with k 380, d 39, m 1.
  - `done` when |h − target| < 0.5 and |v| < 5; then `h = target`, `v = 0`.

Steps:

- [ ] **Step 1: Failing tests.**
  - `rubberBand(700, 100, 600)` = 635.
  - `releaseTarget(300, 0, [100, 350, 760])` = 350.
  - Velocity 1000 from 120 → 350 (one step).
  - Velocity 2500 from 120 → 760.
  - `settleSheet` from {h: 100, v: 3000} toward 350 never exceeds 350 + 0.5 in 2s of 1/120s steps, and is `done` within 1s.
  - From {h: 100, v: 0}: monotone.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
  - The handle's move writes `section.style.height` from a ref, rubber-banded, and tracks velocity from the last 100ms of moves.
  - Release picks `releaseTarget` and runs `settleSheet` on rAF until done, writing the style.
  - It calls `onDetent` once at release, so React re-renders once.
  - Reduced motion: no spring; 120ms `--ease-standard` CSS transition to the target.
  - `dragHeight` state is removed.
- [ ] **Step 4: Browser test** in `invariants.spec.ts`, `@phone @timing`: `a sheet drag does not churn the tray`.
  - Drag the handle 40 steps up, then release.
  - `trayMutations` < before + `RERENDER_BUDGET`, the same bound as the camera test.
  - Run `invariants.spec.ts` plus smoke — PASS.
- [ ] **Step 5: Commit** — `Sheet: rubber band, projected release, critically damped settle — off React (C1)`

---

### Task 7: the tray header and lenses

**Files:**
- Modify: `src/ui/Tray.tsx` (title node), `src/ui/ReferencePanel.tsx`, `src/ui/LensChips.tsx`, `test/browser/reference-panel.spec.ts`
- Test: `test/browser/play-chrome.spec.ts`

**Interfaces:**
- `ReferencePanel` loses its collapsed strip and renders only when `open`.
- New `ReferenceButton({ loadBitmap, open, onToggle })`:
  - a 44pt thumbnail button with `aria-label="Reference photo"` and `aria-pressed={open}`;
  - it draws the bitmap cover-fit into a 44px canvas on mount, falling back to `Icon.Image`;
  - it lives in the title row.
- `LensChipsProps` adds `wrap: boolean`: dock `true`, sheet `false`.

Steps:

- [ ] **Step 1: Failing tests** (browser).
  - The tray has the text `TRAY · {remaining} LOOSE` (eyebrow, mono).
  - The button `Reference photo` toggles the panel's thumbnail `Reference photo thumbnail` visible and hidden.
  - The lens `All` box is 36px tall (±1) and its count is mono.
  - The active lens has `aria-pressed="true"` plus a computed `box-shadow` or `outline` that is not `none`.
  - Dock: the lens row's `scrollWidth <= clientWidth` (it wraps).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
  - The dock's default width is 340. Check `Tray.tsx`'s width constant; the resize handle keeps working.
  - The eyebrow is `.eyebrow`: `Tray · {n} loose`, uppercased by the class.
  - Pills: `rounded-full h-[36px] px-3`. Active: `bg-[color-mix(in_srgb,var(--color-accent-tray)_22%,transparent)] ring-1 ring-[var(--accent)]`. Inactive: `bg-[var(--mat-felt)]`.
  - Counts: `font-data opacity-70`. Bins keep the swatch plus the numeral.
  - Update the `reference-panel.spec.ts` selectors ("Show reference photo" → `Reference photo`).
- [ ] **Step 4: Run** `play-chrome.spec.ts`, `reference-panel.spec.ts`, `tray.spec.ts` and smoke — PASS.
- [ ] **Step 5: Commit** — `Tray: one header row with a reference thumbnail, pill lenses that wrap in the dock`

---

### Task 8: chips, shelf, selection bar

**Files:**
- Modify: `src/ui/PieceChip.tsx`, `src/ui/Shelf.tsx`, `src/ui/SelectionBar.tsx`, `src/ui/Tray.tsx` and `App.tsx` (`onPinSelected`), `src/play/runtime.ts` (`pinPieces(ids: readonly PieceId[]): number`), `src/ui/kit/Icon.tsx` (`Pin`), `src/ui/theme.css` (`.chip:active` scale)
- Test: `test/browser/tray-3b.spec.ts` (Pin), `test/browser/play-chrome.spec.ts`

**Interfaces — Produces:**
- `PlayRuntime.pinPieces(ids)`: pins each id that is in the tray through the session's tray `pin`, bumps the tray, and returns the count pinned. It goes through the same persistence path as a drop-to-shelf.
- `SelectionBarProps` adds `onPin: () => void`.

Steps:

- [ ] **Step 1: Failing tests.**
  - `tray-3b.spec.ts`: `Pin in the selection bar pins every selected piece`.
    1. Select 3, tap `Pin`.
    2. The shelf holds 3 chips and select mode has ended.
    3. After a reload they are still pinned.
  - With 1 selected, `Pin` works and `Pull out` is disabled.
  - `play-chrome.spec.ts`:
    - a chip's computed `border-top-width` is `0px`;
    - a selected chip shows its numeral and has a non-`none` `box-shadow` ring;
    - while `:active` is held (via `mouse.down`), the computed `transform` scale ≈ 1.06 after 150ms.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
  - **Chip:**
    - No border and no `bg`.
    - The canvas draws with `shadowColor rgb(0 0 0 / 0.45)`, `shadowBlur 6 × ratio`, `shadowOffsetY 2 × ratio` (R4).
    - Selected: `ring-2 ring-[var(--accent)] rounded-[10px]`.
    - `.chip:active { transform: scale(1.06) }` with `transition: transform var(--duration-fast) var(--ease-standard)`.
    - The badge and notch glyphs stay (R3).
  - **Shelf:**
    - `bg-[var(--mat-deep)] shadow-[inset_0_2px_6px_rgb(0_0_0/0.45)] rounded-[var(--radius-md)]`.
    - A leading `Icon.Pin` plus "Pinned" (`text-1 text-[var(--ink-secondary)]`).
  - **Selection bar:**
    - `{n} selected` (`.meta`), `Pin` (outline), `Pull out` (`Button` primary; the count leaves the label), `Cancel` (ghost).
    - Pill buttons from `kit/Button`.
- [ ] **Step 4: Run** `tray-3b.spec.ts`, `tray.spec.ts`, `play-chrome.spec.ts`, `invariants.spec.ts` and smoke — PASS.
- [ ] **Step 5: Commit** — `Tray: frameless chips with a shared shadow, a recessed shelf, and Pin in the selection bar`

---

### Task 9: hand-off, going home, lens fade

**Files:**
- Create: `src/play/handoff.ts`, `test/play/handoff.test.ts`
- Modify: `src/play/session.ts` or `src/render/scene.ts` (`heldLift.scale` becomes time-based after a tray adoption), `src/play/runtime.ts` (homing list; `isOverTray` already gives the drop), `src/render/renderer.ts` (draw homing ghosts on the dynamic layer), `src/ui/PieceGrid.tsx` (`arriving` id → `animation: chip-in 120ms 200ms both`), `src/ui/Tray.tsx` (grid wrapper `key={lens}` with a 120ms fade-in), `src/ui/theme.css`

**Interfaces — Produces:**
- `handoffLiftScale(elapsedMs: number, startScale: number, liftScale: number): number`:
  - `startScale` at 0;
  - `liftScale` at ≥ 140;
  - eased in between with the `--ease-standard` curve.
- `homingRect(from: Rect, to: Rect, elapsedMs: number): Rect | null`:
  - screen rects, eased over 200ms;
  - `null` at ≥ 200.
- The runtime's `onTrayChange` payload gains `arriving: PieceId | null`.

Steps:

- [ ] **Step 1: Failing tests.**
  - Unit:
    - `handoffLiftScale(0, 0.4, 1.06)` = 0.4;
    - `(140, …)` = 1.06;
    - monotone;
    - `homingRect` endpoints, and `null` at 200.
  - Browser (`play-chrome.spec.ts`):
    - Drag a piece onto the tray: `remaining()` increments on the release tick (model truth). The returned chip has one running animation. After 400ms `__tessera.idle()` is true.
    - With `page.emulateMedia({ reducedMotion: 'reduce' })`: the same drop, and the chip has no animation (Review Focus 2).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
  - **Drag-out:**
    - The start scale is chip px / piece screen px at adoption.
    - The lift's `offsetPx` stays 8 throughout.
    - Comfort mode targets `COMFORT_LIFT_SCALE`.
  - **Return:**
    - The model moves the piece to the tray on the release tick, unchanged.
    - The runtime pushes `{bitmap, from: the piece's screen rect, to: the tray's rect centre at chip size, t0}`, and the renderer draws it until `null`.
    - Under reduced motion it is skipped, and so is `arriving`.
  - **Lens fade:** `@keyframes fade-in` 120ms.
- [ ] **Step 4: Run** unit, `play-chrome.spec.ts`, `drag-out.spec.ts`, `invariants.spec.ts` and smoke — PASS.
- [ ] **Step 5: Commit** — `Motion: the lift grows from chip size, a returned piece goes home, lenses fade`

---

### Task 10: gates

- [ ] `npm run typecheck`
- [ ] `npx vitest run`
- [ ] `npm run test:browser`, then `npm run test:browser:full`. All green; on this 8 GB Mac that means 2 workers, from the config.
- [ ] Look at the dock (1280×900) and `@phone` (402) screenshots of the play screen, at the default detent and in select mode, against `tray-phones.webp` and `tray-ipad.webp`. Fix what one look shows.
- [ ] Then a fresh whole-branch review on the most capable model, and one fix pass.
- [ ] Owner checks on hardware (spec §11 row c):
  - sheet flick feel on the iPad and iPhone;
  - drag-out from the tray and drop back;
  - 250 pieces at 60fps dragging a 20-piece island.
