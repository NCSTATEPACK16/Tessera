# Plan 7 — First Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** The guided twelve — a curated 12-piece board, already scattered, that teaches the tray
and the hint by revealing them at the right moment rather than explaining them, and ends on the
real Puzzle Card.

**Architecture:** A pure state machine in `src/play/first-run.ts` owns every timing decision §16
specifies; `App.tsx` renders whatever beat it reports. The tray is genuinely not mounted before the
reveal beat — that is what "slides in on its own" means — so the coach must be able to gate the
tray's mount, which is why the beat lives above the tray rather than inside it.

**Tech Stack:** TypeScript, React 19, vitest (node env), Playwright.

**Depends on:** Plan 0 (the hero photograph — §16's whole thesis is *"a 12-piece board with a
beautiful photo is already the whole game"*), and Plan 8 (the card this ends on).

## Global Constraints

- **§16 is the spec.** Four beats, exact numbers: cold open, tray reveal at **4 placed**, hint
  rescue at **8 placed** after **20 seconds** with no placement firing **once**, completion.
- **Rotation never appears in the guided first puzzle.**
- **Skippable at all times, never modal.** A small "skip", always present.
- **Nothing is explained; the sound and the light explain it.**
- **The board never re-renders through React.**
- **DOM-free is the same word as tested.**
- **Touch target floor 44pt. Colour is never the only signal.**
- **`npm run test:browser` is a gate, not an optional extra.**
- Commands: `npm test` · `npm run typecheck` · `npm run build` · `npm run test:browser`

---

### Task 1: The coach state machine

**Files:**
- Create: `src/play/first-run.ts`
- Test: `test/play/first-run.test.ts`

**Interfaces:**
- Consumes: nothing. Deliberately — this file imports no DOM, no React, and no runtime, which is
  what makes it testable.
- Produces:
  - `FirstRunBeat = 'cold-open' | 'playing' | 'tray-reveal' | 'hint-rescue' | 'complete'`
  - `FirstRunInput { placed: number; total: number; msSinceLastPlacement: number; skipped: boolean }`
  - `FirstRunState` — opaque; created by `firstRunStart()`.
  - `firstRunStart(): FirstRunState`
  - `firstRunTick(state: FirstRunState, input: FirstRunInput): { state: FirstRunState; beat:
    FirstRunBeat; fireHint: boolean }` — `fireHint` is an **edge**, true on exactly one tick ever.
  - `FIRST_RUN_PIECES = 12`, `TRAY_REVEAL_AT = 4`, `HINT_RESCUE_AT = 8`, `HINT_IDLE_MS = 20_000`
  Task 3 consumes all of these.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import {
  FIRST_RUN_PIECES,
  HINT_IDLE_MS,
  HINT_RESCUE_AT,
  TRAY_REVEAL_AT,
  firstRunStart,
  firstRunTick,
  type FirstRunInput,
} from '@/play/first-run';

const input = (over: Partial<FirstRunInput> = {}): FirstRunInput => ({
  placed: 0,
  total: FIRST_RUN_PIECES,
  msSinceLastPlacement: 0,
  skipped: false,
  ...over,
});

describe('the numbers §16 specifies', () => {
  it('is twelve pieces', () => {
    expect(FIRST_RUN_PIECES).toBe(12);
  });
  it('reveals the tray at four and rescues at eight, after twenty seconds', () => {
    expect(TRAY_REVEAL_AT).toBe(4);
    expect(HINT_RESCUE_AT).toBe(8);
    expect(HINT_IDLE_MS).toBe(20_000);
  });
});

describe('the cold open', () => {
  it('opens on the one line of copy', () => {
    expect(firstRunTick(firstRunStart(), input()).beat).toBe('cold-open');
  });

  it('drops the copy on the first placement — nothing is explained', () => {
    let s = firstRunStart();
    const out = firstRunTick(s, input({ placed: 1 }));
    expect(out.beat).toBe('playing');
  });
});

describe('the tray reveal', () => {
  it('fires at exactly four placed', () => {
    let s = firstRunStart();
    expect(firstRunTick(s, input({ placed: 3 })).beat).toBe('playing');
    expect(firstRunTick(s, input({ placed: 4 })).beat).toBe('tray-reveal');
  });

  // The tray must not un-reveal. Once it is on screen, taking it away would
  // be a worse tutorial than never showing it.
  it('is latched — a later beat never takes the tray back', () => {
    let s = firstRunStart();
    let out = firstRunTick(s, input({ placed: 4 }));
    s = out.state;
    out = firstRunTick(s, input({ placed: 5 }));
    expect(out.beat).not.toBe('cold-open');
    expect(out.beat).toBe('playing');
  });
});

describe('the hint rescue', () => {
  it('does not fire before eight placed, however long the player stalls', () => {
    let s = firstRunStart();
    s = firstRunTick(s, input({ placed: 4 })).state;
    const out = firstRunTick(s, input({ placed: 7, msSinceLastPlacement: 60_000 }));
    expect(out.fireHint).toBe(false);
  });

  it('does not fire at eight until twenty seconds have passed', () => {
    let s = firstRunStart();
    s = firstRunTick(s, input({ placed: 4 })).state;
    const out = firstRunTick(s, input({ placed: 8, msSinceLastPlacement: 19_999 }));
    expect(out.fireHint).toBe(false);
  });

  it('fires at eight placed after twenty seconds', () => {
    let s = firstRunStart();
    s = firstRunTick(s, input({ placed: 4 })).state;
    const out = firstRunTick(s, input({ placed: 8, msSinceLastPlacement: HINT_IDLE_MS }));
    expect(out.fireHint).toBe(true);
    expect(out.beat).toBe('hint-rescue');
  });

  // §16: "fires tier 1 unprompted, once." An edge, not a level — a level
  // would re-fire on every frame of a stalled board.
  it('fires exactly once, ever', () => {
    let s = firstRunStart();
    s = firstRunTick(s, input({ placed: 4 })).state;
    let out = firstRunTick(s, input({ placed: 8, msSinceLastPlacement: HINT_IDLE_MS }));
    expect(out.fireHint).toBe(true);
    s = out.state;

    out = firstRunTick(s, input({ placed: 8, msSinceLastPlacement: HINT_IDLE_MS + 16 }));
    expect(out.fireHint).toBe(false);

    // Nor after a further stall later in the puzzle.
    out = firstRunTick(out.state, input({ placed: 10, msSinceLastPlacement: 90_000 }));
    expect(out.fireHint).toBe(false);
  });
});

describe('completion and skip', () => {
  it('completes when every piece is placed', () => {
    let s = firstRunStart();
    s = firstRunTick(s, input({ placed: 4 })).state;
    const out = firstRunTick(s, input({ placed: FIRST_RUN_PIECES }));
    expect(out.beat).toBe('complete');
  });

  it('skip ends it from any beat, and never fires a hint on the way out', () => {
    let s = firstRunStart();
    const out = firstRunTick(s, input({ placed: 8, msSinceLastPlacement: 60_000, skipped: true }));
    expect(out.beat).toBe('complete');
    expect(out.fireHint).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/play/first-run.test.ts`
Expected: FAIL — `@/play/first-run` does not exist.

- [ ] **Step 3: Write the machine**

```ts
/**
 * The guided twelve (§16).
 *
 * Every number §16 specifies lives here, in one pure file, because the
 * alternative — `useEffect` timers in `App.tsx` — has no unit-test surface at
 * all, and that is exactly how step 3b shipped two defects that reading the
 * code had missed.
 *
 * `fireHint` is an *edge*: true on exactly one tick, ever. A level would
 * re-fire on every frame of a stalled board, and §16 says "once."
 */

export const FIRST_RUN_PIECES = 12;
export const TRAY_REVEAL_AT = 4;
export const HINT_RESCUE_AT = 8;
export const HINT_IDLE_MS = 20_000;

export type FirstRunBeat = 'cold-open' | 'playing' | 'tray-reveal' | 'hint-rescue' | 'complete';

export interface FirstRunInput {
  placed: number;
  total: number;
  msSinceLastPlacement: number;
  skipped: boolean;
}

export interface FirstRunState {
  /** Latched: the tray never un-reveals. */
  trayRevealed: boolean;
  /** Latched: §16's "once". */
  hintFired: boolean;
}

export function firstRunStart(): FirstRunState {
  return { trayRevealed: false, hintFired: false };
}

export function firstRunTick(
  state: FirstRunState,
  input: FirstRunInput,
): { state: FirstRunState; beat: FirstRunBeat; fireHint: boolean } {
  if (input.skipped || input.placed >= input.total) {
    return { state, beat: 'complete', fireHint: false };
  }

  const revealing = !state.trayRevealed && input.placed >= TRAY_REVEAL_AT;
  const trayRevealed = state.trayRevealed || revealing;

  const rescuing =
    !state.hintFired &&
    input.placed >= HINT_RESCUE_AT &&
    input.msSinceLastPlacement >= HINT_IDLE_MS;

  const next: FirstRunState = { trayRevealed, hintFired: state.hintFired || rescuing };

  if (rescuing) return { state: next, beat: 'hint-rescue', fireHint: true };
  if (revealing) return { state: next, beat: 'tray-reveal', fireHint: false };
  if (input.placed === 0) return { state: next, beat: 'cold-open', fireHint: false };
  return { state: next, beat: 'playing', fireHint: false };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/play/first-run.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/play/first-run.ts test/play/first-run.test.ts
git commit -m "Step 7: the first-run coach — §16's four beats, pure and tested"
```

---

### Task 2: The first-run flag and the entry condition

**Files:**
- Modify: `src/persist/daily.ts` → or create `src/persist/first-run.ts`
- Test: `test/browser/first-run.spec.ts`

**Interfaces:**
- Consumes: `STORE_DAILY`, `idbGet`, `idbPut` from `src/persist/db.ts`. **No schema bump** — the
  `daily` store is keyed (`keyPath: 'key'`) and already holds one row per concern, so a second row
  costs nothing and avoids a fourth version migration.
- Produces: `loadFirstRunDone(): Promise<boolean>`, `markFirstRunDone(): Promise<void>`.

- [ ] **Step 1: Write it**

```ts
/**
 * Has this player seen the guided twelve?
 *
 * A row in the existing `daily` store rather than a new one: the store is
 * keyed and already holds one row per concern, and a schema bump per boolean
 * is a migration risk for no gain. §14's "losing progress is unforgivable"
 * cuts against gratuitous version bumps.
 */
import { STORE_DAILY, idbGet, idbPut } from './db';

const FIRST_RUN_KEY = 'firstRunDone';

export async function loadFirstRunDone(): Promise<boolean> {
  try {
    const row = await idbGet<{ key: string; done: boolean }>(STORE_DAILY, FIRST_RUN_KEY);
    return row?.done ?? false;
  } catch {
    // An unreadable record must never trap a returning player in the tutorial.
    return true;
  }
}

export async function markFirstRunDone(): Promise<void> {
  await idbPut(STORE_DAILY, { key: FIRST_RUN_KEY, done: true });
}
```

Note the `catch` returning **`true`**, the opposite of `loadStreak`'s defensive default. A broken
read there means "new player, empty streak", which is harmless; here it would mean "replay the
tutorial", which traps a returning player in it forever.

- [ ] **Step 2: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/persist/first-run.ts
git commit -m "Step 7: the first-run flag — a row in the daily store, no schema bump"
```

---

### Task 3: The first-run screen

**Files:**
- Create: `src/ui/FirstRun.tsx`
- Modify: `src/ui/App.tsx`
- Test: `test/browser/first-run.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 and 2; `PlayRuntime.fireHint` from `src/play/runtime.ts`;
  `renderCuratedPhoto` and the hero id from Plan 0.
- Produces: `FirstRunOverlayProps { beat, onSkip }` and `FirstRunOverlay` — the copy and the skip
  control only. The board underneath is the ordinary `PlayRuntime`; **there is no separate
  tutorial engine**, which is the entire reason the guided twelve is worth playing.

- [ ] **Step 1: Write the failing browser test**

```ts
import { expect, test } from '@playwright/test';
import { BoardPage } from './board-page';

test('a brand-new player lands on the guided twelve, not the picker', async ({ page }) => {
  const board = new BoardPage(page);
  await board.openFresh();          // clears IndexedDB once, before first load
  await expect(page.getByText('Drag a piece where you think it goes.')).toBeVisible();
  // §16: "No account, no menu, no mode picker."
  await expect(page.getByRole('button', { name: /Pick a photo/i })).toHaveCount(0);
  await expect(board.remaining()).toHaveText('12');
});

test('the tray is not on screen before four pieces are placed', async ({ page }) => {
  const board = new BoardPage(page);
  await board.openFresh();
  // The tray is *absent*, not merely collapsed — "slides in on its own".
  await expect(page.getByTestId('tray')).toHaveCount(0);

  for (let i = 0; i < 4; i++) await board.placeViaHint();

  await expect(page.getByTestId('tray')).toBeVisible();
  await expect(page.getByText('Pieces live here. Filter them.')).toBeVisible();
});

test('skip is always reachable and never modal', async ({ page }) => {
  const board = new BoardPage(page);
  await board.openFresh();
  const skip = page.getByRole('button', { name: 'Skip' });
  await expect(skip).toBeVisible();
  // Never modal: the board underneath still takes a drag.
  await board.placeViaHint();
  await expect(skip).toBeVisible();

  await skip.click();
  await expect(page.getByRole('heading', { name: /Pick a photo/i })).toBeVisible();
});

test('a skipped tutorial writes no completion — the wall stays earned', async ({ page }) => {
  const board = new BoardPage(page);
  await board.openFresh();
  await board.placeViaHint();
  await page.getByRole('button', { name: 'Skip' }).click();

  const completions = await page.evaluate(
    () =>
      new Promise<number>((res) => {
        const r = indexedDB.open('tessera');
        r.onsuccess = () => {
          const tx = r.result.transaction('completions', 'readonly');
          const all = tx.objectStore('completions').getAll();
          all.onsuccess = () => res(all.result.length);
        };
      }),
  );
  expect(completions).toBe(0);
});

test('a returning player is never taught again', async ({ page }) => {
  const board = new BoardPage(page);
  await board.openFresh();
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.reload();
  await expect(page.getByText('Drag a piece where you think it goes.')).toHaveCount(0);
});
```

`openFresh` and `placeViaHint` already exist on `BoardPage` — `placeViaHint` from step 6, and
`openFresh` from **Plan 8 Task 4**, which runs before this plan. Do not add a second copy. If
`openFresh` is somehow absent, add it there rather than here, and delete the database once via
`page.evaluate` against the already-loaded page — never `page.addInitScript`, which re-fires on
every navigation including the test's own `reload()` and would silently wipe the state the
assertion depends on (`handoff.md` §1g).

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:browser -- test/browser/first-run.spec.ts`
Expected: FAIL — a fresh player lands on the picker.

- [ ] **Step 3: Write the overlay**

`FirstRunOverlay` renders one line of copy per beat and a persistent skip. Copy is §16's, verbatim
and complete — do not paraphrase:

| Beat | Copy |
|---|---|
| `cold-open` | `Drag a piece where you think it goes.` |
| `playing` | *(none)* |
| `tray-reveal` | `Pieces live here. Filter them.` |
| `hint-rescue` | *(none — the hint fires; nothing is explained)* |

The skip control is `pointer-events: auto` on an otherwise pass-through overlay, so the board keeps
taking drags underneath it. **Never a backdrop, never a dialog role.**

On `tray-reveal`, pulse the lens chips once — a single `--dur-base` (200ms) opacity beat on
`LensChips`, skipped entirely under `prefers-reduced-motion`.

- [ ] **Step 4: Wire `App.tsx`**

Add `'first-run'` to the `Screen` union (`src/ui/App.tsx:163`). The mount read at `:285-290`
currently decides library-or-setup; it gains a third branch:

```ts
useEffect(() => {
  void (async () => {
    const [entries, completions, done] = await Promise.all([
      listLibrary(),
      completionCount(),
      loadFirstRunDone(),
    ]);
    setLibraryEntries(entries);
    // Three conditions, not one. Each alone is wrong: a player who finished
    // the tutorial and then deleted everything must not be taught again.
    if (entries.length === 0 && completions === 0 && !done) setScreen('first-run');
    else setScreen(entries.length > 0 ? 'library' : 'setup');
  })();
}, []);
```

Config, in the shape of step 6's `DAILY_CONFIG` at `:140-145`:

```ts
/**
 * §16: no mode picker, and "rotation never appears in the guided first
 * puzzle." Twelve passes straight through — `PuzzleConfig.targetCount` is a
 * plain number, so PIECE_COUNT_LADDER is *not* widened and 12 never becomes
 * an offerable count on the setup screen.
 */
const FIRST_RUN_CONFIG = {
  targetCount: FIRST_RUN_PIECES,
  mode: 'zen',            // no hint economy to run out of mid-rescue
  rotation: false,
  difficulty: 'generous', // §16 wants the first snap to land
  assists: DEFAULT_PUZZLE_CONFIG.assists,
} as const;
```

Drive the coach from the existing `summary` subscription — `summary.placed` is already published
and already the signal the chrome reads. Track `msSinceLastPlacement` from a ref updated when
`summary.placed` changes, and tick the machine on a **1s interval**, not per frame: the only
time-based threshold is 20 seconds, and a per-frame tick would violate *"an idle board draws
nothing"* for no benefit.

On `fireHint`, call `runtime.current?.fireHint(1)`. Gate the tray's render on
`beat !== 'cold-open' && beat !== 'playing' || trayRevealed` — or more simply, hold `trayRevealed`
in React state set once on the `tray-reveal` beat and render the tray on it.

Skip: `markFirstRunDone()`, then `setScreen('setup')`. **Write no completion.**

- [ ] **Step 5: Run every gate**

```bash
npm test && npm run typecheck && npm run build && npm run test:browser
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Step 7: the guided twelve — cold open, tray reveal, hint rescue, skip"
```

---

### Task 4: The completion handoff

**Files:**
- Modify: `src/ui/CompletionCard.tsx`, `src/ui/App.tsx`
- Test: `test/browser/first-run.spec.ts`

**Interfaces:**
- Consumes: `CompletionCard` from Plan 8 Task 4.
- Produces: `CompletionCardProps` gains `firstRun?: { onOwnPhoto: () => void; onDaily: () => void }`.

- [ ] **Step 1: Write the failing test**

```ts
test('finishing the twelve earns a real completion and offers the two next steps', async ({
  page,
}) => {
  const board = new BoardPage(page);
  await board.openFresh();
  for (let i = 0; i < 12; i++) await board.placeViaHint();

  await expect(page.getByRole('img', { name: 'Puzzle card' })).toBeVisible();
  // §16: "Now use your own photo" primary, "Today's puzzle" secondary.
  await expect(page.getByRole('button', { name: 'Now use your own photo' })).toBeVisible();
  await expect(page.getByRole('button', { name: "Today's puzzle" })).toBeVisible();

  // §16: "it counts as a real completion on the collection wall."
  const completions = await page.evaluate(
    () =>
      new Promise<number>((res) => {
        const r = indexedDB.open('tessera');
        r.onsuccess = () => {
          const tx = r.result.transaction('completions', 'readonly');
          const all = tx.objectStore('completions').getAll();
          all.onsuccess = () => res(all.result.length);
        };
      }),
  );
  expect(completions).toBe(1);
});
```

`placeViaHint` twelve times requires twelve free hints — `FIRST_RUN_CONFIG.mode = 'zen'` makes
every tier free, the same reason `completion.spec.ts` picks Zen (`handoff.md` §1g).

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:browser -- test/browser/first-run.spec.ts`
Expected: FAIL — the card shows the ordinary actions.

- [ ] **Step 3: Add the variant**

In `CompletionCard`, when `firstRun` is present, replace again-harder / new-puzzle with **"Now use
your own photo"** as primary (filled accent) and **"Today's puzzle"** as secondary (hairline), per
§13's Button variants. Keep share and save.

In `App.tsx`, mark `markFirstRunDone()` and write the completion through the **same
`saveCompletion` path every other puzzle uses** — §16 is explicit that this is a real completion,
and a second write path would be the exact mistake `CLAUDE.md` warns about for the daily.

- [ ] **Step 4: Run every gate and commit**

```bash
npm test && npm run typecheck && npm run build && npm run test:browser
git add -A
git commit -m "Step 7: the completion handoff — own photo, or today's puzzle"
```

---

### Task 5: Bookkeeping

**Files:** `PLAN.md`, `CLAUDE.md`, `handoff.md`

- [ ] **Step 1: Tick `PLAN.md`'s Step 7** — all seven boxes, annotated.

- [ ] **Step 2: `CLAUDE.md`**

Add `first-run.ts` and `FirstRun.tsx` to the layout tree, and one invariant:

```markdown
- **The guided twelve is an ordinary puzzle with an overlay.** There is no tutorial engine — the
  same `PlayRuntime`, the same snap, the same audio. The coach in `first-run.ts` decides *when* the
  tray mounts and *when* a hint fires, and nothing else. A second play path for the first run would
  mean the tutorial teaches a game the player is not about to play.
- **A skipped first run writes no completion.** §16's "counts as a real completion" is about
  finishing it. The wall is a possession, and an unearned first tile devalues every tile after it.
```

- [ ] **Step 3: Handoff section**, in `handoff.md` §1g's shape — what landed, the judgment calls
      (Zen for the guided twelve so the rescue cannot run out of hints; `generous` tolerance so the
      first snap lands; the 1s coach tick), and the real-hardware gate: **whether sixty seconds on
      the guided twelve actually feels like the best sixty seconds in the product**, which is the
      only question that matters here and the only one Chromium cannot answer.

- [ ] **Step 4: Commit**

```bash
git add PLAN.md CLAUDE.md handoff.md
git commit -m "Step 7: handoff notes, PLAN ticks, and the two new invariants"
```

---

## Definition of done

- [ ] `npm test`, `npm run typecheck`, `npm run build` clean.
- [ ] `npm run test:browser` green on dock and phone.
- [ ] A fresh profile lands on the twelve; a returning one never does.
- [ ] The tray is **absent** before four placed, not merely collapsed.
- [ ] The hint fires once and only once, verified by stalling twice.
- [ ] Skip writes no completion; finishing writes exactly one.
- [ ] Rotation never appears.
- [ ] Judged on real hardware, and this is the gate that matters: does the guided twelve feel like
      a puzzle worth finishing, or like a tutorial?
