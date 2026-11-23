# Modernize phase b — Today — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Today becomes the spec's §4 screen — a photo hero with four states and one primary in the daily's own accent, a "Keep going" rail of lit-over-unlit thumbnails, streak and collection cards, inline offline/install rows — inside a `Shell` extracted from `App.tsx`.

**Architecture:** Every decision on Today (hero state, its primary, the streak line, the collection sums, a puzzle's name, the daily's accent) is a pure function in `src/play/today.ts` / `src/render/accent.ts`, tested in node. `Today.tsx` and its cards only draw. Thumbnails become board-framed composites drawn by the renderer at save time (photo unlit underneath, placed pieces lit, progress bloom), so the library entry *is* the hero's in-progress image — no daily-specific path.

**Tech Stack:** React 19, Tailwind v4, Canvas 2D, IndexedDB, Vitest (node), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-modernize-design.md` §2, §3 (pairing B), §4, §9 C3, §11 row b, §12.

## Global Constraints

- Hero: 370 × 380 on a 402pt phone (16px gutters), radius 22 (`--radius-lg`), photo full-bleed; copy on the measured scrim (`heroScrimBackground()`, `pt-7`). `--ink-muted` never on the hero.
- Hero states, copy verbatim: not played — eyebrow `Daily · {N} pieces`, title photo name serif 40, line "{h} hints included · new puzzle in {9h 41m}", **Start** (accent fill). In progress — same eyebrow/title, "{placed} of {total} placed", **Keep going** + ring + %. Done — eyebrow `Daily · done`, "{N} pieces in {24:18}{ · clean run}", **See your card** (outline) + "Done today" badge with ✓. First visit / offline — as not played; offline row inline below the hero.
- In progress opens library entry `daily-YYYY-MM-DD` (`handleStartDaily`); Done opens the card rebuilt from `completions`. No daily-specific save path; a finished daily is never in the library.
- Thumbnails (rail and in-progress hero): photo `brightness(.2) saturate(.5)` + placed pieces lit + progress bloom (C3). Rail 200 × 150 (iPad landscape 200 × 132), name serif `text-4` (20), meta `{pct}% · {N} pieces` with a ring.
- Streak card: numeral serif 40, "day streak", one line, seven pips with weekday letters; freeze = dashed pip + snowflake, today = ring. Zero: "0" + "Start one today". Shape carries meaning, never colour alone.
- Collection card: 2 × 4 mosaic of the 8 newest completions, "{N} finished", "{N} pieces placed" summed from completions; empty: 8 outlined slots + "Finished puzzles hang here."
- First visit (no in-progress puzzles): no rail; invitation card "Any photo works. Start with one you like looking at." + **New puzzle** (default variant — one primary per screen).
- Install row last, web only (`!isNative`). Accent: curated `dominant` → `clampToAccentRange` → `ensureContrast` vs `--mat-raised`, AA.
- iPad landscape (≥ 1024 wide): hero 640 × 392 left, streak + collection stacked right, rail full width below; tab bar a floating pill bottom-centre.
- Pairing B: body 16 on Today; static numbers Inter Tight `tabular-nums` (`.meta`); mono only in eyebrows/badges.
- Never: board through React; infinite animation; `localStorage`; a second daily save path; a completed puzzle in the library; a control with nothing behind it; CDN fonts.

## Review Focus

1. **A daily finished on another day, or a done-today with no completion row** (completions failed to load) — the hero still shows Done + badge; "See your card" is absent rather than a dead button. Test in Task 1 (`heroModel` with `record: null`).
2. **An old snapshot with no `photoId`** restores and names itself (daily → its date's photo; else "Your photo"). Test in Task 2.
3. **A board zoomed in or panned away at save time** — the thumbnail must still show the whole board, not the camera's view. Test in Task 3 (thumbnail aspect = board aspect, captured after a pan).
4. **Midnight while Today is open** — `today` is frozen at mount (existing behaviour); out of scope, noted, not changed.
5. **Dynamic Type 200% on the hero** — title/line wrap inside the scrim, the button stays on the solid part. `dynamic-type.spec` covers Today; re-run in Task 6.

---

### Task 1: Today's decisions, pure

**Files:**
- Create: `src/play/today.ts`, `test/play/today.test.ts`
- Modify: `src/render/accent.ts`, `test/render/accent.test.ts`

**Interfaces — Produces:**
- `accentFromDominant(dominant: readonly string[]): string` — hex; picks the highest-OKLab-chroma entry (manifest order is bin order, not size — my call), clamps, `ensureContrast(…, MAT_RAISED_RGB, WCAG_MIN_CONTRAST)`; empty/invalid → `ACCENT_FALLBACK`.
- `type HeroState = 'unplayed' | 'progress' | 'done'`
- `heroModel(input: { doneToday: boolean; progress: { placed: number; total: number } | null; record: CompletionRecord | null; pieceCount: number; hintsIncluded: number; resetsInMs: number }): { state: HeroState; eyebrow: string; line: string; action: { label: 'Start' | 'Keep going' | 'See your card'; variant: 'primary' | 'ghost' } | null; percent: number | null }`
- `streakModel(tone: StreakTone, streak: number, freezes: number): { numeral: number; line: string }` — alive: "Played today." / "Played today. {n} freeze(s) saved."; at-risk: "Today keeps it going."; broken/none: numeral 0, "Start one today".
- `collectionSummary(records: readonly CompletionRecord[]): { finished: number; piecesPlaced: number; recent: readonly CompletionRecord[] }` — recent ≤ 8, input order (store is newest first).
- `puzzleTitle(puzzleId: string, photoId: string | null | undefined): string` — curated name; daily without photoId → `dailyFor(dailyDateKeyOf(id)).photoId`'s name; else "Your photo".
- `formatResetsIn(ms)` moves here from `Today.tsx`.

- [ ] **Step 1: Failing tests** — `accent.test.ts`: every `CURATED_PHOTOS` entry's `accentFromDominant` clears 4.5:1 against `MAT_RAISED_RGB` *and* `--mat-void` text on it (`[11,13,16]`) clears 4.5:1; `[]` → `ACCENT_FALLBACK`; same input → same output. `today.test.ts`: `heroModel` — unplayed → Start/primary, line `3 hints included · new puzzle in 9h 41m` (resetsInMs 9h41m); progress {76,200} → Keep going/primary, line `76 of 200 placed`, percent 38; done with record {200 pieces, 1_458_000ms, clean} → See your card/ghost, eyebrow `Daily · done`, line `200 pieces in 24:18 · clean run`; done with `record: null` → action null, eyebrow `Daily · done`; done beats progress. `streakModel` four tones incl. `freezes: 1` copy. `collectionSummary` of 10 records → recent 8, sums `pieceCount`. `puzzleTitle` curated id, daily id with null photoId, upload → "Your photo".
- [ ] **Step 2: Run** `npx vitest run test/play/today.test.ts test/render/accent.test.ts` — FAIL (missing exports).
- [ ] **Step 3: Implement**; `formatElapsed` from `@/play/card` for the done line.
- [ ] **Step 4: Run** — PASS; `npm run typecheck`.
- [ ] **Step 5: Commit** — `Today: its decisions as pure functions, and the daily's accent from the manifest`

---

### Task 2: a snapshot names its photo

**Files:** Modify `src/persist/snapshot.ts` (`photoId?: string | null` — optional so old saves load), `src/play/runtime.ts` (option `photoId?: string | null`, written by `snapshot()`), `src/ui/App.tsx` (pass `playConfig.photoId`; `handleOpenLibraryEntry` restores `entry.snapshot.photoId ?? null`, which also fixes a resumed curated puzzle's card reading "Your photo"). Test: `test/persist/snapshot.test.ts` (or the file that round-trips snapshots).

- [ ] **Step 1: Failing test** — a snapshot built with `photoId: 'banff-sunrise-lake'` round-trips it; one without the field still restores, and `puzzleTitle` of it (daily id) is the date's photo name.
- [ ] **Step 2–4:** run (FAIL) → implement → run (PASS), typecheck.
- [ ] **Step 5: Commit** — `Snapshot carries the curated photo id, so a resumed puzzle keeps its name`

---

### Task 3: board-framed thumbnails with the photo unlit underneath (C3)

**Files:** Modify `src/render/renderer.ts`, `src/play/runtime.ts`, `src/persist/thumbnail.ts`, `src/ui/App.tsx` (autosave). Test: `test/browser/library.spec.ts` (new test).

**Interfaces — Produces:**
- `Renderer.boardThumbnail(width: number, underlay: ImageBitmap | null): HTMLCanvasElement | null` — canvas `width × round(width·boardH/boardW)`; `--mat-deep` fill; underlay drawn then darkened *without* `ctx.filter` (Safari < 18): `saturation` composite with grey at α 0.5, then black at α 0.8 = brightness 0.2; placed pieces drawn at board framing with no camera culling (extract the per-piece draw from `drawPieces` into `drawPiece`); progress bloom via the existing `drawBloom` with `progressBloomIntensity(scene.completion)`. Null before the board exists.
- `PlayRuntime.thumbnailCanvas(): HTMLCanvasElement | OffscreenCanvas` — the board thumbnail, falling back to the static layer. The underlay is a `THUMBNAIL_WIDTH`-wide copy of the source taken in `start()` before the transfer (same `copySource` reason), always, kept apart from the ghost's full-size copy; closed in `destroy()`.
- `THUMBNAIL_WIDTH` 320 → **480** (exported): the hero shows this image at 370pt. If `captureThumbnail` + compose exceeds ~4ms on desktop Chromium (measure in step 3), stay at 320 and say so in the PR.
- `onSave` callers capture `rt.thumbnailCanvas()`; completions and the card keep `boardCanvas()` untouched (the card invariant).

- [ ] **Step 1: Failing browser test** in `library.spec.ts`, `'an early board's thumbnail shows the photo, framed to the board'`: open a 50-piece board, pan the camera with a mouse drag on empty mat, `autoPlace(1)`, wait for the save, read the `thumbnails` row via `indexedDB` in `page.evaluate`, decode with `createImageBitmap`: aspect within 2% of `cols/rows` from the snapshot, and luminance standard deviation over the image > 6 (a flat dark rectangle is ~0).
- [ ] **Step 2: Run** `npm run test:browser:one -- library.spec.ts` — FAIL (aspect is the viewport's).
- [ ] **Step 3: Implement**; log `performance.now()` around capture once to pick 480 vs 320, then remove the log.
- [ ] **Step 4: Run** the spec + `npm run test:browser:smoke` (save/restore and the `@timing` idle test must stay green — the thumbnail draws off-screen and schedules nothing).
- [ ] **Step 5: Commit** — `Thumbnails: the board, framed, with the photo unlit under your progress (C3)`

---

### Task 4: `Shell.tsx`, the floating tab bar, the daily's accent

**Files:** Create `src/ui/Shell.tsx`; modify `src/ui/App.tsx`, `src/ui/TabBar.tsx`.

**Interfaces — Produces:** `Shell({ activeTab, todayBadge, onSelectTab, accent, settings: { open, onClose, traySide, onTraySide }, children })` — the `<main>` scroller (safe-area top), `TabBar`, `SettingsSheet`; sets `--accent` and `--color-accent` on its root from `accent` (scoped, so the play screen's extracted accent is untouched). At `md` the bar floats bottom-centre as a pill (`fixed bottom-[max(16px,env(safe-area-inset-bottom))]`), and `main` gets bottom padding to clear it.

App also: loads `listCompletions()` at boot whenever history exists (already does) **and** refreshes `completions` after `commitCompletion`, so Today's cards and Done read fresh rows.

- [ ] **Step 1:** Move the tab shell block out of `App.tsx` unchanged in behaviour; pass `accentFromDominant(curatedPhotoById(daily.photoId)?.dominant ?? [])`.
- [ ] **Step 2: Run** `npm test`, typecheck, `npm run test:browser:one -- tabs.spec.ts` — PASS (tabs unchanged in function).
- [ ] **Step 3: Commit** — `Shell: the tab shell out of App, a floating bar on iPad, Today in the daily's accent`

---

### Task 5: Today, redesigned

**Files:** Rewrite `src/ui/Today.tsx`; create `src/ui/TodayCards.tsx` (`StreakCard`, `CollectionCard`, `WeekPips`), `src/ui/ReopenedCard.tsx` (the wall's rebuild-a-card-from-a-record overlay, extracted from `CollectionWall` and used by both); `src/ui/kit/Icon.tsx` (+`Check`, `Snowflake`, `Offline`); `src/ui/useOnline.ts` (`navigator.onLine` + `online`/`offline` events); `src/ui/App.tsx` wiring; `src/ui/StreakFlame.tsx` (export `PIP_LABEL`). Tests: create `test/browser/today.spec.ts`; update `daily.spec.ts`, `tabs.spec.ts`, `home.spec.ts`, `tray.spec.ts:218` selectors.

**Wiring:** hero action — Start and Keep going → `handleStartDaily` (resumes `daily-YYYY-MM-DD` when saved); See your card → `ReopenedCard` for `completions.find(r => r.puzzleId === daily.puzzleId)`. Hero image: progress → the daily's library thumbnail; else `curatedPhotoUrl`. Streak card (button, `aria-label="Daily streak: {n} days — open the daily"`) → the hub; collection card → Collection tab; "All puzzles" → Puzzles tab; rail card `aria-label="Continue your puzzle: {title}"` → `handleOpenLibraryEntry`; trailing rail tile and invitation card → `startNewPuzzle` (`aria-label="New puzzle"`, one per screen). Header: wordmark, date (`Sat 21 Nov`, `.meta`), settings.

- [ ] **Step 1: Failing spec** `today.spec.ts`, one test per state, each asserting the hero's one action by role and name and the others absent:
  - not played (seed one in-progress Zen puzzle, reload): `Start today's puzzle` visible; rail shows `Continue your puzzle:`; no `Keep going`.
  - in progress (Start, `autoPlace(3)`, Pause → Leave, back to Today): `Keep going` + progressbar; `/\d+ of \d+ placed/`; clicking it lands on the board with the same `placed`.
  - done (finish the daily via `autoPlaceAllBut(1)` + one gesture, Done, Today tab): `See your card` + text `Done today`; tab dot gone; clicking it shows `img[name=Puzzle card]`.
  - first visit (finish the guided twelve, reload): invitation copy + `New puzzle`; no rail; `0` + `Start one today`; empty mosaic copy `Finished puzzles hang here.` absent (one completion exists) — `1 finished`.
  - offline (`context.setOffline(true)` after boot): the offline row is visible and the Start button is still in the hero and clickable (not covered).
- [ ] **Step 2: Run** `npm run test:browser:one -- today.spec.ts` — FAIL.
- [ ] **Step 3: Implement** the screen per Global Constraints; update the old specs' selectors (hub via the streak card).
- [ ] **Step 4: Run** `today.spec.ts`, `daily.spec.ts`, `tabs.spec.ts`, `home.spec.ts`, `collection-wall.spec.ts`, then smoke — PASS. `npm test` (type-roles must stay green: no mono outside the allowlist).
- [ ] **Step 5: Commit** — `Today: the photo hero with four states, the Keep going rail, streak and collection cards`

---

### Task 6: iPad layout and the look

**Files:** `src/ui/Today.tsx` (`lg:` grid: `grid-cols-[640px_1fr]`, hero `lg:h-[392px]`, rail thumbs `lg:h-[132px]`).

- [ ] **Step 1:** Screenshots (scratchpad `zz-shots.spec.ts`, deleted after) of Today at 402 × 874 in each state, and at 1180 × 820; compare with `today-phones.webp` / `today-ipad.webp`. Fix what one look shows, look once more.
- [ ] **Step 2: Run** `npm run test:browser:one -- dynamic-type.spec.ts` — PASS.
- [ ] **Step 3: Commit** — `Today: iPad landscape — hero left, cards right, rail below`

---

### Task 7: gates and PR

- [ ] `npm run build` + `node scripts/check-bundle-budget.mjs`; `npm run test:browser`; `npm run test:browser:full`.
- [ ] Fresh whole-branch review (opus), fix pass.
- [ ] Push `claude/modernize-b`, open "Modernize b: Today — photo hero, Keep going rail, streak and collection cards" against `main`. Owner check (spec §11): the hero on a pale, a dark and a saturated daily; scrim legibility outdoors.
