# Home Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, no subagents) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `'home'` landing screen that sits in front of `Library` for any profile with history, per the reviewed design spec.

**Architecture:** One new presentational component (`src/ui/Home.tsx`) taking only props `App.tsx` already computes for `Library`/`DailyHub`. `App.tsx` gains a `Screen` member, changes its mount-effect routing decision, adds a `pickerInitialSource` ref (same pattern as the existing `originScreen`/`beforeWall` refs) to carry the Browse/Upload choice into `PhotoPicker`, and gains a `Home` render branch. `PhotoPicker` gains one optional prop. `Library` gains a back-to-Home tap target.

**Tech Stack:** React (TSX), Vitest, Playwright (`test/browser`), existing Tessera token classes (`theme.css`).

**Spec:** `docs/superpowers/specs/2026-08-22-home-screen-design.md`

## Global Constraints

- No prop on `Home` is new *data* — everything comes from state `App.tsx` already loads for `Library`'s/`DailyHub`'s own props.
- Home never appears before a profile has history (Decision 2): `entries.length === 0 && completions === 0 && !firstRunDone` still goes straight to the guided twelve; otherwise `hasHistory = entries.length > 0 || completions > 0` decides `'home'` vs `'setup'`.
- No persistent tab bar; Home is one stack frame, reached via `setScreen('home')` like every other screen (Decision 3).
- The "Continue" card appears only when exactly one puzzle is in progress — zero or ≥2 in-progress puzzles omit it (Decision 5).
- Streak and Collection teasers each fall back to a quiet empty-state card rather than an apologetic empty shelf, matching `Library.tsx`'s own convention (Decision 6).
- `CLAUDE.md`: `localDateKey` is the only place a local `Date` is read for date-*key* purposes — the new `resetsInMs` countdown is a decorative, non-key value and is read once per mount alongside `today`, not on every render.

---

## Task 1: `msUntilNextLocalMidnight` in `src/daily/dates.ts`

**Files:**
- Modify: `src/daily/dates.ts`
- Test: `test/daily/dates.test.ts`

**Interfaces:**
- Produces: `msUntilNextLocalMidnight(now: Date): number` — pure function of its argument, exported alongside `localDateKey`.

- [ ] **Step 1: Read the file**

Read `src/daily/dates.ts` in full (needed before any edit).

- [ ] **Step 2: Write the failing test**

Add to `test/daily/dates.test.ts` (create the block if the file doesn't yet cover this function):

```ts
import { msUntilNextLocalMidnight } from '@/daily/dates';

describe('msUntilNextLocalMidnight', () => {
  it('returns the exact gap to the next local midnight', () => {
    const now = new Date(2026, 7, 22, 23, 0, 0, 0); // Aug 22 2026, 23:00 local
    expect(msUntilNextLocalMidnight(now)).toBe(60 * 60 * 1000);
  });

  it('returns just under 24h right after local midnight', () => {
    const now = new Date(2026, 7, 22, 0, 0, 0, 1);
    expect(msUntilNextLocalMidnight(now)).toBe(24 * 60 * 60 * 1000 - 1);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npm test -- test/daily/dates.test.ts`
Expected: FAIL — `msUntilNextLocalMidnight` is not exported.

- [ ] **Step 4: Implement**

Add to `src/daily/dates.ts`, near `localDateKey`:

```ts
/**
 * Decorative countdown only (Home's daily-reset copy), never a date *key* —
 * `localDateKey` stays the only place a local Date is read for that.
 */
export function msUntilNextLocalMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return next.getTime() - now.getTime();
}
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `npm test -- test/daily/dates.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/daily/dates.ts test/daily/dates.test.ts
git commit -m "Add msUntilNextLocalMidnight for Home's daily-reset countdown"
```

---

## Task 2: `PhotoPicker` gains `initialSource`

**Files:**
- Modify: `src/ui/PhotoPicker.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PhotoPickerProps.initialSource?: Source` (`Source = 'curated' | 'upload'`, already defined in this file). Read by `App.tsx` (Task 4).

- [ ] **Step 1: Read the file**

Read `src/ui/PhotoPicker.tsx` in full. Locate the internal `useState<Source>(...)` toggle (the curated/upload switch the spec references at `src/ui/PhotoPicker.tsx` L45).

- [ ] **Step 2: Add the prop and wire its default**

In `PhotoPickerProps` (currently lines 23–43), add:

```ts
  /** Carries a caller's Browse/Upload choice into the toggle. Defaults to 'curated'. */
  initialSource?: Source;
```

Change the toggle's initializer from its current fixed default to seed from the new prop:

```ts
const [source, setSource] = useState<Source>(initialSource ?? 'curated');
```

(Use the toggle state variable's actual name as found in Step 1 — it may not be literally `source`/`setSource`; match what's there.) Add `initialSource` to the function's destructured props list.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean (no callers pass `initialSource` yet, so this is purely additive).

- [ ] **Step 4: Commit**

```bash
git add src/ui/PhotoPicker.tsx
git commit -m "PhotoPicker: accept an initialSource prop for the Browse/Upload split"
```

---

## Task 3: `Home` component

**Files:**
- Create: `src/ui/Home.tsx`

**Interfaces:**
- Consumes: `StreakFlame` (`src/ui/StreakFlame.tsx`, props `{streak, freezes, tone, pips, compact?}`), `StreakTone` and `DayCell` types (`src/daily/streak.ts`), `CompletionRecord` (`src/persist/completions.ts`), `LibraryEntry` (`src/persist/library.ts`), `curatedPhotoUrl` (`src/play/curated.ts`).
- Produces: `HomeProps` and the `Home` component, consumed by `App.tsx` (Task 4).

- [ ] **Step 1: Write `src/ui/Home.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { StreakTone } from './StreakFlame';
import StreakFlame from './StreakFlame';
import type { DayCell } from '@/daily/streak';
import type { CompletionRecord } from '@/persist/completions';
import type { LibraryEntry } from '@/persist/library';
import { curatedPhotoUrl } from '@/play/curated';

export interface HomeProps {
  dailyPreview: {
    title: string;
    photoUrl: string;
    pieceCount: number;
    resetsInMs: number;
    hintsIncluded: number;
  };
  continuing: LibraryEntry | null;
  libraryCount: number;
  streak: number;
  streakTone: StreakTone;
  weekPips: readonly DayCell[];
  completions: readonly CompletionRecord[];
  onDaily: () => void;
  onContinue: (puzzleId: string) => void;
  onLibrary: () => void;
  onBrowsePhotos: () => void;
  onUploadYours: () => void;
  onCollection: () => void;
}

function formatResetsIn(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function CompletionTile({ entry }: { entry: CompletionRecord }): React.ReactElement {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(entry.thumbnailBlob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [entry.thumbnailBlob]);
  return (
    <div className="aspect-square overflow-hidden rounded-[var(--radius-sm)] bg-[var(--mat-void)]">
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
    </div>
  );
}

export default function Home({
  dailyPreview,
  continuing,
  libraryCount,
  streak,
  streakTone,
  weekPips,
  completions,
  onDaily,
  onContinue,
  onLibrary,
  onBrowsePhotos,
  onUploadYours,
  onCollection,
}: HomeProps): React.ReactElement {
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <div className="font-[var(--font-display)] text-5 text-[var(--ink-primary)]">Tessera</div>

      <button
        type="button"
        aria-label={`Play today's puzzle: ${dailyPreview.title}`}
        onClick={onDaily}
        className="relative flex aspect-[16/9] w-full items-end overflow-hidden rounded-[var(--radius-md)] border border-[var(--edge-hair)] bg-[var(--mat-void)] text-left"
      >
        <img
          src={dailyPreview.photoUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="relative flex w-full flex-col gap-1 bg-gradient-to-t from-black/60 to-transparent p-4 text-[var(--mat-void)]">
          <div className="text-2">{dailyPreview.title}</div>
          <div className="font-[var(--font-data)] text-1 tabular-nums opacity-80">
            {dailyPreview.pieceCount} pieces · {dailyPreview.hintsIncluded} hints included ·
            resets in {formatResetsIn(dailyPreview.resetsInMs)}
          </div>
        </div>
      </button>

      {continuing && (
        <button
          type="button"
          aria-label={`Continue puzzle`}
          onClick={() => onContinue(continuing.puzzleId)}
          className="touch-target flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--edge-hair)] px-4 text-2 text-[var(--ink-primary)]"
        >
          <span>Continue your puzzle</span>
          <span className="font-[var(--font-data)] tabular-nums text-[var(--ink-muted)]">
            {continuing.snapshot.placed} / {continuing.snapshot.total}
          </span>
        </button>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          aria-label="Browse Photos"
          onClick={onBrowsePhotos}
          className="touch-target flex-1 rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-2 text-[var(--mat-void)]"
        >
          Browse Photos
        </button>
        <button
          type="button"
          aria-label="Upload Yours"
          onClick={onUploadYours}
          className="touch-target flex-1 rounded-[var(--radius-md)] border border-[var(--edge-hair)] px-4 text-2 text-[var(--ink-primary)]"
        >
          Upload Yours
        </button>
      </div>

      {libraryCount > 0 && (
        <button
          type="button"
          aria-label={`Your Puzzles (${libraryCount})`}
          onClick={onLibrary}
          className="touch-target self-start text-2 text-[var(--accent)]"
        >
          Your Puzzles ({libraryCount})
        </button>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="min-w-[200px] flex-1 rounded-[var(--radius-md)] border border-[var(--edge-hair)] p-3">
          {streakTone === 'none' ? (
            <div className="text-2 text-[var(--ink-muted)]">
              Play the daily to start a streak.
            </div>
          ) : (
            <StreakFlame streak={streak} freezes={0} tone={streakTone} pips={weekPips} compact />
          )}
        </div>

        <button
          type="button"
          aria-label="Collection"
          onClick={onCollection}
          className="min-w-[200px] flex-1 rounded-[var(--radius-md)] border border-[var(--edge-hair)] p-3 text-left"
        >
          {completions.length === 0 ? (
            <div className="text-2 text-[var(--ink-muted)]">
              Your collection starts here. Finish a puzzle to light the first tile.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-3 gap-2">
                {completions.slice(0, 3).map((entry) => (
                  <CompletionTile key={entry.completedAt} entry={entry} />
                ))}
              </div>
              <div className="text-1 text-[var(--ink-muted)]">{completions.length} completed</div>
            </div>
          )}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean. `Home.tsx` has no other caller yet, so this file must typecheck standalone; it will not be exercised until Task 4 wires it in.

- [ ] **Step 3: Commit**

```bash
git add src/ui/Home.tsx
git commit -m "Add the Home component (design spec 2026-08-22)"
```

---

## Task 4: Wire `Home` into `App.tsx`

**Files:**
- Modify: `src/ui/App.tsx`

**Interfaces:**
- Consumes: `Home`/`HomeProps` (Task 3), `PhotoPickerProps.initialSource` (Task 2), `msUntilNextLocalMidnight` (Task 1), `curatedPhotoById` (`src/play/curated.ts`, already used by `DailyHub.tsx` for the same title lookup), `HINT_BASE` (`src/play/hints.ts`).
- Produces: `Screen` now includes `'home'`; new `pickerInitialSource` ref; Home reachable via `setScreen('home')` from the mount effect and from `Library`'s new back link (Task 5).

- [ ] **Step 1: Read the file**

Read `src/ui/App.tsx` in full (already reviewed in sections this session; a full read is required before editing per the harness rule and to get exact current byte-for-byte context for each edit below).

- [ ] **Step 2: Extend the `Screen` type**

Find (L236):

```ts
  type Screen = 'checking' | 'daily' | 'library' | 'setup' | 'playing' | 'first-run' | 'wall';
```

Replace with:

```ts
  type Screen =
    | 'checking'
    | 'home'
    | 'daily'
    | 'library'
    | 'setup'
    | 'playing'
    | 'first-run'
    | 'wall';
```

- [ ] **Step 3: Add the `pickerInitialSource` ref**

Find the `originScreen` ref declaration (L262):

```ts
  const originScreen = useRef<'daily' | 'library' | 'setup'>('setup');
```

Add immediately after it:

```ts
  /** Home's Browse/Upload choice, read once by `<PhotoPicker>` on the next setup entry. */
  const pickerInitialSource = useRef<'curated' | 'upload'>('curated');
```

- [ ] **Step 4: Change the mount-effect routing decision**

Find (around L426–427, inside the mount `useEffect`):

```ts
      setScreen(entries.length > 0 ? 'library' : 'setup');
    })();
  }, []);
```

Replace with:

```ts
      // Decision 2 of the Home spec: history means at least one in-progress
      // puzzle or one completion, and a profile with history always lands on
      // Home rather than Library — Library is still one tap away.
      const hasHistory = entries.length > 0 || completions > 0;
      if (hasHistory) setCompletions(await listCompletions());
      setScreen(hasHistory ? 'home' : 'setup');
    })();
  }, []);
```

(`completions` here is the local `const` from the destructured `Promise.all` above it — a plain number — which is why it can be compared with `> 0` and does not conflict with calling the `setCompletions` state setter.)

- [ ] **Step 5: Add the Home render branch**

Find the exact block (confirmed present at the top of the screen-render `if` chain, immediately after `streakTone` is computed and before the `'daily'` branch):

```ts
  if (screen === 'daily') {
    const todaysEntry = libraryEntries.find((entry) => entry.puzzleId === daily.puzzleId);
    return (
      <DailyHub
```

Replace with:

```ts
  if (screen === 'home') {
    const shelved = libraryEntries.filter((entry) => entry.puzzleId !== dailyPuzzleId(today));
    const photoTitle = curatedPhotoById(daily.photoId)?.name ?? 'Today’s photo';
    return (
      <Home
        dailyPreview={{
          title: photoTitle,
          photoUrl: curatedPhotoUrl(daily.photoId) ?? '',
          pieceCount: daily.targetCount,
          resetsInMs: msUntilNextLocalMidnight(new Date()),
          hintsIncluded: HINT_BASE,
        }}
        continuing={shelved.length === 1 ? shelved[0]! : null}
        libraryCount={shelved.length}
        streak={streakCount}
        streakTone={streakTone}
        weekPips={weekPips(streak, today)}
        completions={completions}
        onDaily={() => setScreen('daily')}
        onContinue={(puzzleId) => {
          void handleOpenLibraryEntry(puzzleId);
        }}
        onLibrary={() => setScreen('library')}
        onBrowsePhotos={() => {
          pickerInitialSource.current = 'curated';
          originScreen.current = 'setup';
          setSetupPhase({ kind: 'picker', error: null });
          setScreen('setup');
        }}
        onUploadYours={() => {
          pickerInitialSource.current = 'upload';
          originScreen.current = 'setup';
          setSetupPhase({ kind: 'picker', error: null });
          setScreen('setup');
        }}
        onCollection={() => {
          void openCollection();
        }}
      />
    );
  }

  if (screen === 'daily') {
    const todaysEntry = libraryEntries.find((entry) => entry.puzzleId === daily.puzzleId);
    return (
      <DailyHub
```

Note: `completions` in this render scope is the top-level React state (`readonly CompletionRecord[]`), not the mount-effect's local shadow from Step 4 — those are two different scopes, so no collision.

- [ ] **Step 6: Reset `pickerInitialSource` at every other setup entry**

`DailyHub`'s `onNewPuzzle` and `Library`'s `onNewPuzzle` (both currently `{ originScreen.current = 'setup'; setSetupPhase(...); setScreen('setup'); }`) must not carry a stale `'upload'` from an earlier abandoned Home visit. In both inline handlers, add `pickerInitialSource.current = 'curated';` as the first line, alongside the existing `originScreen.current = 'setup';`.

- [ ] **Step 7: Pass `initialSource` to `<PhotoPicker>`**

Find the `<PhotoPicker ... />` render (inside `if (!playConfig) { if (setupPhase.kind === 'picker') { return ( <PhotoPicker ...`). Add the prop:

```tsx
        <PhotoPicker
          onPhotoChosen={handlePhotoChosen}
          error={setupPhase.error}
          busy={setupPhase.busy ?? false}
          initialSource={pickerInitialSource.current}
          onDaily={() => setScreen('daily')}
          onCollection={() => {
            void openCollection();
          }}
        />
```

- [ ] **Step 8: Add the two new imports**

Add near `App.tsx`'s other component/util imports:

```ts
import Home from './Home';
import { msUntilNextLocalMidnight } from '@/daily/dates';
import { HINT_BASE } from '@/play/hints';
```

(`curatedPhotoById`, `curatedPhotoUrl`, `dailyPuzzleId`, `weekPips`, `listCompletions` are already imported — confirm each is present rather than re-adding a duplicate import.)

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 10: Run the full unit suite**

Run: `npm test`
Expected: no regressions (Home has no unit tests of its own per the spec's Testing section — the branching is a handful of prop-driven conditionals, not embedded logic worth extracting).

- [ ] **Step 11: Commit**

```bash
git add src/ui/App.tsx
git commit -m "Route a profile with history through Home before Library"
```

---

## Task 5: `Library` gains a back-to-Home link

**Files:**
- Modify: `src/ui/Library.tsx`
- Modify: `src/ui/App.tsx`

**Interfaces:**
- Consumes: none new.
- Produces: `LibraryProps.onHome?: () => void`.

- [ ] **Step 1: Read `src/ui/Library.tsx`**

- [ ] **Step 2: Add the prop and header button**

In `LibraryProps` (currently L19–29) add:

```ts
  onHome?: () => void;
```

In `Library`'s destructured params, add `onHome`. In the header's button row (the `<div className="flex gap-2">` that currently renders the Collection/Daily/New Puzzle buttons), add as the first button, matching the existing Collection button's exact styling:

```tsx
{onHome && (
  <button
    type="button"
    aria-label="Home"
    onClick={onHome}
    className="touch-target rounded-[var(--radius-md)] border border-[var(--edge-hair)] px-3 text-2 text-[var(--ink-primary)]"
  >
    Home
  </button>
)}
```

- [ ] **Step 3: Wire it in `App.tsx`**

Read `src/ui/App.tsx`'s `<Library ... />` render (the `if (screen === 'library')` branch). Add:

```tsx
        onHome={() => setScreen('home')}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/Library.tsx src/ui/App.tsx
git commit -m "Library: add a back-to-Home link"
```

---

## Task 6: Browser coverage — `test/browser/home.spec.ts`

**Files:**
- Create: `test/browser/home.spec.ts`
- Reference: `test/browser/board-page.ts` (the `BoardPage` harness — `reachPicker()`, `remaining()`, `matPoint()`).

**Interfaces:**
- Consumes: whatever `BoardPage` already exports for opening a fresh profile and for seeding a populated library — check `test/browser/board-page.ts` and one existing spec (e.g. `test/browser/library.spec.ts`) for the established pattern of getting a profile into "one in-progress puzzle" state before asserting on it, and reuse that pattern rather than inventing a new one.

- [ ] **Step 1: Read `test/browser/board-page.ts` and `test/browser/library.spec.ts`**

Confirm how an existing spec gets a fresh profile to a populated-library state (likely: open the app, skip/finish first-run, start a puzzle via the picker, place a piece or two, leave without finishing — landing an entry in `libraryEntries`).

- [ ] **Step 2: Write the spec**

```ts
import { test, expect } from '@playwright/test';
import { BoardPage } from './board-page';

test.describe('Home', () => {
  test('a fresh profile with zero history skips Home', async ({ page }) => {
    const board = new BoardPage(page);
    await board.open(); // fresh profile — reachPicker()'s own race handles first-run
    // Assert the picker (or first-run) is showing, not the Home screen's
    // "Browse Photos"/"Upload Yours" buttons.
    await expect(page.getByRole('button', { name: 'Browse Photos' })).toHaveCount(0);
  });

  test('a profile with one in-progress puzzle lands on Home and shows Continue', async ({
    page,
  }) => {
    const board = new BoardPage(page);
    // Reuse whatever helper Step 1 found for seeding one library entry, then
    // reload so the mount effect re-runs against that seeded state.
    // ... (fill in using the confirmed helper from Step 1)
    await page.reload();
    await expect(page.getByRole('button', { name: /Continue your puzzle/i })).toBeVisible();
  });

  test('Browse Photos and Upload Yours each reach the picker with the right source', async ({
    page,
  }) => {
    // Seed one library entry (same helper as above), reload onto Home.
    // ...
    await page.getByRole('button', { name: 'Upload Yours' }).click();
    // Assert the picker's upload affordance (file input / upload panel) is
    // the active one — match whatever selector photo-picker.spec.ts already
    // uses to distinguish the two source states.
  });

  test('the Your Puzzles link reaches Library, and Library’s Home link returns', async ({
    page,
  }) => {
    // Seed one library entry, reload onto Home.
    // ...
    await page.getByRole('button', { name: /Your Puzzles/ }).click();
    await expect(page.getByText('Your Puzzles')).toBeVisible();
    await page.getByRole('button', { name: 'Home' }).click();
    await expect(page.getByRole('button', { name: 'Browse Photos' })).toBeVisible();
  });
});
```

Fill in the seeding steps using the exact helper confirmed in Step 1 rather than guessing selectors — this is the one part of this task that depends on reading the existing test harness first.

- [ ] **Step 3: Run it**

Run: `npx playwright test test/browser/home.spec.ts`
Expected: PASS on both `dock` and `phone` projects, after filling in Step 2's seeding logic.

- [ ] **Step 4: Commit**

```bash
git add test/browser/home.spec.ts
git commit -m "Add browser coverage for the Home screen"
```

---

## Task 7: Audit existing browser specs for the new Home hop

**Files:**
- Modify (as needed): any of `test/browser/daily.spec.ts`, `test/browser/library.spec.ts`, `test/browser/photo-picker.spec.ts`, `test/browser/collection-wall.spec.ts`, `test/browser/first-run.spec.ts`, `test/browser/hints.spec.ts`, `test/browser/board-page.ts`.

**Interfaces:** none new — this task only patches call sites, it does not introduce any.

- [ ] **Step 1: Confirm which specs open with pre-populated state**

Per the design spec's own risk note: `reachPicker()` and any spec built purely on a fresh, zero-entry profile (fresh install → first-run skip → picker) are unaffected, because that profile never has history and so never sees `'home'`. Only a spec that seeds a library entry or a completion *before* reloading/asserting is at risk. Search each file listed above for a reload or fresh-open that happens *after* library/completion state has been seeded, using:

```
mcp__jcodemunch__search_text query="reload" file_pattern="test/browser/*.spec.ts" context_lines=15
```

and read the surrounding test body for each hit to judge whether it follows a seed step.

- [ ] **Step 2: Patch each affected test**

For each spec found in Step 1 that now lands on `'home'` where it previously expected `'library'`, add one click through Home's "Your Puzzles" link (or `onHome`-equivalent) immediately after the reload, before the test's existing assertions resume. Do not change any assertion's substance — only insert the one extra navigation step the new screen requires.

- [ ] **Step 3: Run the full browser suite**

Run: `npm run test:browser`
Expected: all previously-passing specs still pass; no new failures.

- [ ] **Step 4: Commit**

```bash
git add test/browser/
git commit -m "Audit browser specs for the new Home hop"
```

(Skip this commit if Step 1 finds no affected spec — state that finding instead.)

---

## Task 8: Full gate and bookkeeping

**Files:**
- Modify: `handoff.md` (repo root, committed)
- Modify: `PLAN.md` (gitignored, local) — only if it has a relevant checkbox; the Home screen is new scope beyond the original step ordering, so this may be a no-op.

- [ ] **Step 1: Run every gate**

```bash
npm test
npm run typecheck
npm run build
npm run test:browser
```

Expected: all clean, both `dock` and `phone` projects for the browser suite.

- [ ] **Step 2: Append a handoff.md section**

Add a new dated section at the end of `handoff.md` recording: what landed (Home screen, `PhotoPicker.initialSource`, `Library`'s back link, `msUntilNextLocalMidnight`), the exact gate counts from Step 1, and explicitly flag that the real-hardware pass for this screen has not been run (same standing gap as every other screen in this file).

- [ ] **Step 3: Commit**

```bash
git add handoff.md
git commit -m "Handoff: the Home screen lands"
```

- [ ] **Step 4: Push**

```bash
git push origin main
```

(Confirm with the user before pushing if any doubt remains about the branch state at that point.)
