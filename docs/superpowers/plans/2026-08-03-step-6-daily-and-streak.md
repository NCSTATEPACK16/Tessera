# Step 6 — Daily and Streak Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local-only daily puzzle — the same photo, piece count, and seed for everyone, from the
date alone — with a hub screen carrying a forgiving streak (freezes, one repair a month) and a month
calendar of completions.

**Architecture:** The daily is an ordinary puzzle with a deterministic `puzzleId` of
`daily-YYYY-MM-DD`, so every piece of step 5c's persistence (autosave, `Board.restore`, thumbnails,
photo blobs, the library) applies to it unchanged. The only genuinely new durable state is one
streak record in a new IndexedDB store. All date, selection, and streak logic is pure and lives in
`src/daily/`, which is DOM-free and therefore fully unit-tested; the three new React components and
the `App.tsx` wiring are the thin, judged-by-hand layer this codebase already draws that line at.

**Tech Stack:** TypeScript, React 19, Vite, Tailwind v4 (via `theme.css` tokens), Zustand (untouched
here), raw IndexedDB via the existing `src/persist/db.ts`, vitest, Playwright.

**Design spec:** `docs/superpowers/specs/2026-08-03-step-6-daily-and-streak-design.md`. Read it
before Task 1 — it records *why* each constant and boundary is what it is.

## Global Constraints

Every task's requirements implicitly include all of these.

- **Colour is never the only signal** (`CLAUDE.md`). Every pip and calendar cell carries a glyph and
  a full-sentence `aria-label` as well as a fill.
- **44pt touch target floor, everywhere** (`CLAUDE.md` hard numbers). Calendar cells are the risk.
- **No `localStorage` for session state — IndexedDB only** (`CLAUDE.md`).
- **Per-concern PRNG streams via `rngFor(seed, kind, id)`** — never a shared stream (`CLAUDE.md`).
- **The board never re-renders through React.** Nothing in this step touches `PlayRuntime`'s frame
  loop, the renderer, or the tray. If a task finds itself editing `src/render/` or `src/board/`,
  something has gone wrong.
- **There is no lose state anywhere in this app** (`CLAUDE.md`). Applies to copy: a broken streak is
  never scolded, and no player data is ever deleted to tidy up.
- **The real computed number, never the target** — the same convention `TopBar` and `Library` hold to
  when showing `cols × rows`.
- **`vitest` owns `*.test.ts`, Playwright owns `*.spec.ts`**, and neither ever collects the other's
  files. New unit tests go in `test/daily/`, the new browser spec in `test/browser/`.
- **Imports use the `@/` alias** for `src/` (e.g. `@/daily/dates`), matching every existing module.
- Commands: `npm test` (vitest), `npm run test:browser` (Playwright), `npm run typecheck`,
  `npm run build`.

---

### Task 1: Date keys and calendar arithmetic

A `DateKey` is a local calendar day as `'YYYY-MM-DD'`. Every other module in this step speaks only in
date keys, never in `Date` objects, so there is exactly one place that can get a timezone wrong.

**Files:**
- Create: `src/daily/dates.ts`
- Test: `test/daily/dates.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type DateKey = string`
  - `localDateKey(date: Date): DateKey`
  - `parseDateKey(key: DateKey): { year: number; month: number; day: number }`
  - `daysSinceEpoch(key: DateKey): number`
  - `fromDaysSinceEpoch(days: number): DateKey`
  - `addDays(key: DateKey, delta: number): DateKey`
  - `daysBetween(from: DateKey, to: DateKey): number`
  - `weekdayOf(key: DateKey): number` — `0` = Sunday
  - `monthKeyOf(key: DateKey): string` — `'YYYY-MM'`
  - `daysInMonth(monthKey: string): number`
  - `compareDateKeys(a: DateKey, b: DateKey): number`

- [ ] **Step 1: Write the failing test**

Create `test/daily/dates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  addDays,
  compareDateKeys,
  daysBetween,
  daysInMonth,
  daysSinceEpoch,
  fromDaysSinceEpoch,
  localDateKey,
  monthKeyOf,
  parseDateKey,
  weekdayOf,
} from '@/daily/dates';

describe('localDateKey', () => {
  it('reads the local calendar day, not the UTC one', () => {
    // The failure this guards: `toISOString().slice(0, 10)` on a Date whose
    // local day is the 3rd but whose UTC day is already the 4th. A player at
    // UTC-5 at 21:00 would get tomorrow's daily three hours early, and the
    // streak would credit the wrong day.
    const date = new Date(2026, 7, 3, 21, 30, 0); // 3 Aug 2026, 21:30 local
    expect(localDateKey(date)).toBe('2026-08-03');
  });

  it('zero-pads month and day', () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('parseDateKey', () => {
  it('splits a key into numbers', () => {
    expect(parseDateKey('2026-08-03')).toEqual({ year: 2026, month: 8, day: 3 });
  });

  it('rejects anything that is not a date key', () => {
    expect(() => parseDateKey('2026-8-3')).toThrow();
    expect(() => parseDateKey('not a date')).toThrow();
  });
});

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31');
  });

  it('crosses a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('round-trips over a long span', () => {
    let key = '2026-01-01';
    for (let i = 0; i < 500; i++) key = addDays(key, 1);
    for (let i = 0; i < 500; i++) key = addDays(key, -1);
    expect(key).toBe('2026-01-01');
  });
});

describe('daysSinceEpoch / fromDaysSinceEpoch', () => {
  it('is zero at the epoch and round-trips', () => {
    expect(daysSinceEpoch('1970-01-01')).toBe(0);
    expect(fromDaysSinceEpoch(0)).toBe('1970-01-01');
    expect(fromDaysSinceEpoch(daysSinceEpoch('2026-08-03'))).toBe('2026-08-03');
  });
});

describe('daysBetween', () => {
  it('counts forward and backward', () => {
    expect(daysBetween('2026-08-01', '2026-08-04')).toBe(3);
    expect(daysBetween('2026-08-04', '2026-08-01')).toBe(-3);
    expect(daysBetween('2026-08-04', '2026-08-04')).toBe(0);
  });
});

describe('weekdayOf', () => {
  it('returns 0 for Sunday', () => {
    // 2 August 2026 is a Sunday.
    expect(weekdayOf('2026-08-02')).toBe(0);
    expect(weekdayOf('2026-08-03')).toBe(1);
    expect(weekdayOf('2026-08-08')).toBe(6);
  });
});

describe('monthKeyOf / daysInMonth', () => {
  it('extracts the month key', () => {
    expect(monthKeyOf('2026-08-03')).toBe('2026-08');
  });

  it('counts days in a month, leap years included', () => {
    expect(daysInMonth('2026-08')).toBe(31);
    expect(daysInMonth('2026-09')).toBe(30);
    expect(daysInMonth('2027-02')).toBe(28);
    expect(daysInMonth('2028-02')).toBe(29);
  });
});

describe('compareDateKeys', () => {
  it('orders chronologically', () => {
    expect(compareDateKeys('2026-08-03', '2026-08-04')).toBeLessThan(0);
    expect(compareDateKeys('2026-09-01', '2026-08-31')).toBeGreaterThan(0);
    expect(compareDateKeys('2026-08-03', '2026-08-03')).toBe(0);
  });

  it('agrees with a plain lexicographic sort', () => {
    const keys = ['2026-10-01', '2026-09-30', '2027-01-01', '2026-01-05'];
    const byCompare = [...keys].sort(compareDateKeys);
    const byString = [...keys].sort();
    expect(byCompare).toEqual(byString);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/daily/dates.test.ts`
Expected: FAIL — `Failed to resolve import "@/daily/dates"`.

- [ ] **Step 3: Write the implementation**

Create `src/daily/dates.ts`:

```ts
/**
 * Calendar-day arithmetic for the daily (step 6).
 *
 * Everything above this module speaks in `DateKey` strings — `'YYYY-MM-DD'` —
 * and never in `Date` objects, so there is exactly one place in the codebase
 * that can get a timezone wrong.
 *
 * Two rules make that place small:
 *
 *   1. **`localDateKey` is the only function that reads a `Date`'s local
 *      fields.** `PLAN.md` §6 says the daily resets at 00:00 *local*, and the
 *      usual shortcut (`toISOString().slice(0, 10)`) is UTC — for a player at
 *      UTC-5 that flips the daily over at 19:00.
 *   2. **All arithmetic is done in UTC**, on whole days since the epoch. A
 *      local-time `setDate(+1)` lands on the same wall-clock hour, which on a
 *      DST boundary is either 23 or 25 hours later, and rounding that to days
 *      is how a streak silently skips a Sunday in March.
 *
 * Keys are zero-padded, so lexicographic order *is* chronological order and
 * `compareDateKeys` is a plain string compare. Several call sites lean on
 * that — `state.completed.sort()` with no comparator is correct.
 */

export type DateKey = string;

const MS_PER_DAY = 86_400_000;
const KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** The local calendar day a `Date` falls on. The only local-time read here. */
export function localDateKey(date: Date): DateKey {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseDateKey(key: DateKey): { year: number; month: number; day: number } {
  const match = KEY_PATTERN.exec(key);
  if (!match) throw new Error(`parseDateKey: not a date key: "${key}"`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function daysSinceEpoch(key: DateKey): number {
  const { year, month, day } = parseDateKey(key);
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

export function fromDaysSinceEpoch(days: number): DateKey {
  const date = new Date(days * MS_PER_DAY);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function addDays(key: DateKey, delta: number): DateKey {
  return fromDaysSinceEpoch(daysSinceEpoch(key) + delta);
}

export function daysBetween(from: DateKey, to: DateKey): number {
  return daysSinceEpoch(to) - daysSinceEpoch(from);
}

/** 0 = Sunday, matching `Date.prototype.getUTCDay` and the calendar header. */
export function weekdayOf(key: DateKey): number {
  return new Date(daysSinceEpoch(key) * MS_PER_DAY).getUTCDay();
}

export function monthKeyOf(key: DateKey): string {
  return key.slice(0, 7);
}

export function daysInMonth(monthKey: string): number {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  // Day 0 of the *next* month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function compareDateKeys(a: DateKey, b: DateKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/daily/dates.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add src/daily/dates.ts test/daily/dates.test.ts
git commit -m "Step 6: date-key arithmetic — local days, UTC maths"
```

---

### Task 2: The deterministic daily puzzle

Date in, puzzle out. No table, no server, no stored rota — which is why a missing day is not
representable.

**Files:**
- Create: `src/daily/daily.ts`
- Test: `test/daily/daily.test.ts`

**Interfaces:**
- Consumes: `DateKey`, `addDays`, `daysSinceEpoch`, `weekdayOf` from `@/daily/dates` (Task 1);
  `CURATED_PHOTOS` from `@/play/curated`; `rngFor`, `seedFromPuzzleId` from `@/core/rng`.
- Produces:
  - `interface DailyPuzzle { dateKey: DateKey; puzzleId: string; seed: number; photoId: string; targetCount: number }`
  - `dailyFor(dateKey: DateKey): DailyPuzzle`
  - `dailyPuzzleId(dateKey: DateKey): string`
  - `isDailyPuzzleId(puzzleId: string): boolean`
  - `dailyDateKeyOf(puzzleId: string): DateKey | null`
  - `dailyPhotoIndex(dateKey: DateKey): number`
  - `DAILY_COUNT_BY_WEEKDAY: readonly number[]`
  - `PHOTO_STEP: number`

- [ ] **Step 1: Write the failing test**

Create `test/daily/daily.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  DAILY_COUNT_BY_WEEKDAY,
  PHOTO_STEP,
  dailyDateKeyOf,
  dailyFor,
  dailyPhotoIndex,
  dailyPuzzleId,
  isDailyPuzzleId,
} from '@/daily/daily';
import { addDays } from '@/daily/dates';
import { CURATED_PHOTOS } from '@/play/curated';
import { PIECE_COUNT_LADDER } from '@/play/setup';
import { seedFromPuzzleId } from '@/core/rng';

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

describe('daily ids', () => {
  it('round-trips a date key through a puzzle id', () => {
    const id = dailyPuzzleId('2026-08-03');
    expect(id).toBe('daily-2026-08-03');
    expect(isDailyPuzzleId(id)).toBe(true);
    expect(dailyDateKeyOf(id)).toBe('2026-08-03');
  });

  it('does not claim an ordinary puzzle id', () => {
    const uuid = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    expect(isDailyPuzzleId(uuid)).toBe(false);
    expect(dailyDateKeyOf(uuid)).toBeNull();
  });
});

describe('dailyFor', () => {
  it('is a pure function of the date — everyone gets the same puzzle', () => {
    const a = dailyFor('2026-08-03');
    const b = dailyFor('2026-08-03');
    expect(a).toEqual(b);
  });

  it('derives the seed from the puzzle id, the one seeding scheme', () => {
    const daily = dailyFor('2026-08-03');
    expect(daily.seed).toBe(seedFromPuzzleId('daily-2026-08-03'));
  });

  it('always picks a real curated photo', () => {
    const ids = new Set(CURATED_PHOTOS.map((photo) => photo.id));
    let key = '2026-01-01';
    for (let i = 0; i < 400; i++) {
      expect(ids.has(dailyFor(key).photoId)).toBe(true);
      key = addDays(key, 1);
    }
  });

  it('always picks a count on the MVP ladder', () => {
    const ladder = new Set<number>(PIECE_COUNT_LADDER);
    for (const count of DAILY_COUNT_BY_WEEKDAY) expect(ladder.has(count)).toBe(true);
  });

  it('gives the weekend a heavier board than midweek', () => {
    // 2026-08-02 is a Sunday, 2026-08-04 a Tuesday, 2026-08-08 a Saturday.
    expect(dailyFor('2026-08-08').targetCount).toBeGreaterThan(dailyFor('2026-08-04').targetCount);
  });
});

describe('photo rotation', () => {
  it('uses a step coprime with the photo count', () => {
    // The whole no-repeat argument rests on this. If the curated set grows and
    // the step stops being coprime, consecutive days start colliding and this
    // test is what says so.
    expect(gcd(PHOTO_STEP, CURATED_PHOTOS.length)).toBe(1);
  });

  it('never repeats a photo on consecutive days', () => {
    let key = '2026-01-01';
    let previous = dailyPhotoIndex(key);
    for (let i = 0; i < 400; i++) {
      key = addDays(key, 1);
      const index = dailyPhotoIndex(key);
      expect(index, `repeat on ${key}`).not.toBe(previous);
      previous = index;
    }
  });

  it('uses every photo over a long enough run', () => {
    const seen = new Set<number>();
    let key = '2026-01-01';
    for (let i = 0; i < 400; i++) {
      seen.add(dailyPhotoIndex(key));
      key = addDays(key, 1);
    }
    expect(seen.size).toBe(CURATED_PHOTOS.length);
  });

  it('stays in range', () => {
    let key = '2026-01-01';
    for (let i = 0; i < 400; i++) {
      const index = dailyPhotoIndex(key);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(CURATED_PHOTOS.length);
      key = addDays(key, 1);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/daily/daily.test.ts`
Expected: FAIL — `Failed to resolve import "@/daily/daily"`.

- [ ] **Step 3: Write the implementation**

Create `src/daily/daily.ts`:

```ts
/**
 * The daily puzzle (step 6) — a closed-form function of the date.
 *
 * `PLAN.md` asks for daily puzzles "pre-seeded months ahead" and adds that "a
 * missing day must never break the hub". That requirement came with the
 * assumption of a server table; a pure function of the date satisfies it more
 * strongly, because a missing day is not representable. There is nothing to
 * seed and nothing to run out of.
 *
 * The daily is otherwise an *ordinary puzzle* with a deterministic id, which
 * is what lets all of step 5c's persistence — autosave, `Board.restore`,
 * thumbnails, photo blobs, the library — apply to it with no new code.
 */

import { rngFor, seedFromPuzzleId } from '@/core/rng';
import { CURATED_PHOTOS } from '@/play/curated';
import { addDays, daysSinceEpoch, weekdayOf } from './dates';
import type { DateKey } from './dates';

/**
 * Fixed, not per-user: §06 of `PLAN.md` wants the same `(imageId, pieceCount,
 * seed)` for everyone. Its own `rngFor` stream, per `CLAUDE.md`'s per-concern
 * PRNG invariant — sharing the cut's stream would make the photo rota depend
 * on cut iteration order.
 */
const DAILY_STREAM_SEED = 0x7e55e7a;

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * The stride through the photo list, largest value under `N` that is coprime
 * with it. Coprimality is what guarantees two consecutive days inside one
 * cycle can never land on the same photo, and computing it rather than
 * hardcoding `5` means the guarantee survives the curated set growing to
 * fifty real photographs.
 */
function coprimeStep(n: number): number {
  for (let step = n - 1; step > 1; step--) if (gcd(step, n) === 1) return step;
  return 1;
}

export const PHOTO_STEP = coprimeStep(CURATED_PHOTOS.length);

/**
 * Sunday..Saturday. Light midweek, heavier at the weekend, so the week has a
 * shape. **A judgment call** — no design document specifies daily counts —
 * but every value is on `PIECE_COUNT_LADDER`.
 */
export const DAILY_COUNT_BY_WEEKDAY: readonly number[] = [150, 100, 100, 150, 150, 200, 200];

const DAILY_PUZZLE_PREFIX = 'daily-';

export function dailyPuzzleId(dateKey: DateKey): string {
  return `${DAILY_PUZZLE_PREFIX}${dateKey}`;
}

export function isDailyPuzzleId(puzzleId: string): boolean {
  return puzzleId.startsWith(DAILY_PUZZLE_PREFIX);
}

export function dailyDateKeyOf(puzzleId: string): DateKey | null {
  return isDailyPuzzleId(puzzleId) ? puzzleId.slice(DAILY_PUZZLE_PREFIX.length) : null;
}

/**
 * A seeded rotation per cycle of the list, so the rota is not a visible
 * fixed rota, plus a coprime stride within the cycle.
 */
function rawPhotoIndex(dateKey: DateKey): number {
  const n = CURATED_PHOTOS.length;
  const day = daysSinceEpoch(dateKey);
  const cycle = Math.floor(day / n);
  const rotation = Math.floor(rngFor(DAILY_STREAM_SEED, 'dailyPhotoCycle', cycle).next() * n);
  return (((day * PHOTO_STEP + rotation) % n) + n) % n;
}

/**
 * Only a cycle boundary can repeat, because that is the one place the
 * rotation changes; one lookback fixes it. The lookback terminates rather
 * than recursing: two consecutive days can never *both* be cycle boundaries
 * when `n >= 2`, so at most one of the pair was itself bumped.
 */
export function dailyPhotoIndex(dateKey: DateKey): number {
  const n = CURATED_PHOTOS.length;
  const raw = rawPhotoIndex(dateKey);
  return raw === rawPhotoIndex(addDays(dateKey, -1)) ? (raw + 1) % n : raw;
}

export interface DailyPuzzle {
  dateKey: DateKey;
  /** `daily-YYYY-MM-DD` — stable, so 5c's stores key on it naturally. */
  puzzleId: string;
  seed: number;
  photoId: string;
  targetCount: number;
}

export function dailyFor(dateKey: DateKey): DailyPuzzle {
  const puzzleId = dailyPuzzleId(dateKey);
  return {
    dateKey,
    puzzleId,
    seed: seedFromPuzzleId(puzzleId),
    photoId: CURATED_PHOTOS[dailyPhotoIndex(dateKey)]!.id,
    targetCount: DAILY_COUNT_BY_WEEKDAY[weekdayOf(dateKey)]!,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/daily/daily.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add src/daily/daily.ts test/daily/daily.test.ts
git commit -m "Step 6: the daily puzzle, closed-form from the date"
```

---

### Task 3: The streak model

The whole of the streak's behaviour, pure and unit-tested: what a streak is worth, when a freeze is
earned, when one is spent, and what a repair can reach.

**Files:**
- Create: `src/daily/streak.ts`
- Test: `test/daily/streak.test.ts`

**Interfaces:**
- Consumes: `DateKey`, `addDays`, `compareDateKeys`, `daysBetween`, `daysInMonth`, `monthKeyOf`,
  `weekdayOf` from `@/daily/dates` (Task 1).
- Produces:
  - `interface StreakState { version: 1; completed: DateKey[]; frozen: DateKey[]; freezes: number; lastRepairMonth: string | null; settledThrough: DateKey | null }`
  - `emptyStreak(): StreakState`
  - `streakLength(state: StreakState, today: DateKey): number`
  - `settle(state: StreakState, today: DateKey): { state: StreakState; broke: boolean; freezesSpent: number }`
  - `recordCompletion(state: StreakState, dateKey: DateKey): { state: StreakState; streak: number; freezeEarned: boolean; alreadyDone: boolean }`
  - `canRepair(state: StreakState, today: DateKey): boolean`
  - `repair(state: StreakState, today: DateKey): StreakState`
  - `isDone(state: StreakState, dateKey: DateKey): boolean`
  - `type DayStatus = 'completed' | 'frozen' | 'missed' | 'today' | 'future' | 'inactive'`
  - `interface DayCell { dateKey: DateKey; status: DayStatus }`
  - `weekPips(state: StreakState, today: DateKey): DayCell[]` — seven cells, oldest first
  - `interface MonthGrid { monthKey: string; leadingBlanks: number; days: DayCell[] }`
  - `monthGrid(state: StreakState, monthKey: string, today: DateKey): MonthGrid`
  - `FREEZE_EVERY`, `MAX_FREEZES`, `REPAIR_MAX_GAP_DAYS`

- [ ] **Step 1: Write the failing test**

Create `test/daily/streak.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  FREEZE_EVERY,
  MAX_FREEZES,
  REPAIR_MAX_GAP_DAYS,
  canRepair,
  emptyStreak,
  isDone,
  monthGrid,
  recordCompletion,
  repair,
  settle,
  streakLength,
  weekPips,
} from '@/daily/streak';
import type { StreakState } from '@/daily/streak';
import { addDays } from '@/daily/dates';

/** Play `days` consecutive dailies ending on `lastDay`. */
function playRun(lastDay: string, days: number): StreakState {
  let state = emptyStreak();
  for (let i = days - 1; i >= 0; i--) {
    state = recordCompletion(state, addDays(lastDay, -i)).state;
  }
  return state;
}

describe('streakLength', () => {
  it('is zero on a fresh state', () => {
    expect(streakLength(emptyStreak(), '2026-08-03')).toBe(0);
  });

  it('counts consecutive completed days ending today', () => {
    expect(streakLength(playRun('2026-08-03', 4), '2026-08-03')).toBe(4);
  });

  it('an unplayed today is at risk, not broken', () => {
    // Played through yesterday, nothing today: the streak still stands.
    const state = playRun('2026-08-02', 4);
    expect(streakLength(state, '2026-08-03')).toBe(4);
  });

  it('is zero once a day has been missed outright', () => {
    const state = playRun('2026-08-01', 4);
    expect(streakLength(state, '2026-08-03')).toBe(0);
  });

  it('counts a frozen day as covered', () => {
    const played = playRun('2026-08-02', FREEZE_EVERY);
    // Skip the 3rd; open the app on the 4th and the freeze covers it.
    const settled = settle(played, '2026-08-04').state;
    expect(streakLength(settled, '2026-08-04')).toBe(FREEZE_EVERY + 1);
  });
});

describe('recordCompletion', () => {
  it('earns exactly one freeze at a seven-day streak', () => {
    let state = emptyStreak();
    const earned: boolean[] = [];
    for (let i = FREEZE_EVERY - 1; i >= 0; i--) {
      const result = recordCompletion(state, addDays('2026-08-07', -i));
      state = result.state;
      earned.push(result.freezeEarned);
    }
    expect(earned.filter(Boolean)).toHaveLength(1);
    expect(earned[FREEZE_EVERY - 1]).toBe(true);
    expect(state.freezes).toBe(1);
  });

  it('caps the freeze bank', () => {
    const state = playRun('2026-12-31', FREEZE_EVERY * (MAX_FREEZES + 2));
    expect(state.freezes).toBe(MAX_FREEZES);
  });

  it('is idempotent — completing the same day twice changes nothing', () => {
    const first = recordCompletion(emptyStreak(), '2026-08-03');
    const second = recordCompletion(first.state, '2026-08-03');
    expect(second.alreadyDone).toBe(true);
    expect(second.state.completed).toEqual(first.state.completed);
    expect(second.state.freezes).toBe(first.state.freezes);
  });

  it('reports the streak it just produced', () => {
    const state = playRun('2026-08-02', 3);
    expect(recordCompletion(state, '2026-08-03').streak).toBe(4);
  });
});

describe('settle', () => {
  it('spends a banked freeze on a missed day', () => {
    const played = playRun('2026-08-07', FREEZE_EVERY); // one freeze banked
    const result = settle(played, '2026-08-09'); // the 8th was missed
    expect(result.freezesSpent).toBe(1);
    expect(result.broke).toBe(false);
    expect(result.state.freezes).toBe(0);
    expect(result.state.frozen).toContain('2026-08-08');
    expect(streakLength(result.state, '2026-08-09')).toBe(FREEZE_EVERY + 1);
  });

  it('spends only one freeze no matter how many times it runs in a day', () => {
    // The load-bearing case. The failure is silent and slow: a player who
    // opens the app three times on one day would quietly lose their whole
    // freeze bank, with nothing on screen ever saying so.
    const played = playRun('2026-08-14', FREEZE_EVERY * 2); // two freezes banked
    let state = settle(played, '2026-08-16').state; // the 15th was missed
    const afterFirst = state.freezes;
    state = settle(state, '2026-08-16').state;
    state = settle(state, '2026-08-16').state;
    expect(state.freezes).toBe(afterFirst);
    expect(state.frozen.filter((day) => day === '2026-08-15')).toHaveLength(1);
  });

  it('breaks the streak once the bank is empty', () => {
    const played = playRun('2026-08-03', 3); // no freeze earned yet
    const result = settle(played, '2026-08-05'); // the 4th missed, nothing to spend
    expect(result.broke).toBe(true);
    expect(result.freezesSpent).toBe(0);
    expect(streakLength(result.state, '2026-08-05')).toBe(0);
  });

  it('never spends a freeze on a streak that is already broken', () => {
    const played = playRun('2026-08-03', FREEZE_EVERY + 3); // freeze banked
    // Away for a fortnight — the first gap day eats the freeze and the streak
    // breaks. Coming back later must not burn anything further.
    const broken = settle(played, '2026-08-20');
    expect(broken.broke).toBe(true);
    const before = broken.state.freezes;
    const again = settle(broken.state, '2026-08-25');
    expect(again.freezesSpent).toBe(0);
    expect(again.state.freezes).toBe(before);
  });

  it('never settles today itself — today is still playable', () => {
    const played = playRun('2026-08-07', FREEZE_EVERY);
    const result = settle(played, '2026-08-08'); // today unplayed
    expect(result.freezesSpent).toBe(0);
    expect(result.state.frozen).not.toContain('2026-08-08');
  });

  it('does nothing at all on a state with no completions', () => {
    const result = settle(emptyStreak(), '2026-08-03');
    expect(result.freezesSpent).toBe(0);
    expect(result.broke).toBe(false);
    expect(result.state.completed).toEqual([]);
  });
});

describe('repair', () => {
  it('is offered only when the streak is actually broken', () => {
    const alive = playRun('2026-08-03', 4);
    expect(canRepair(alive, '2026-08-04')).toBe(false); // at risk, not broken
    const broken = settle(playRun('2026-08-01', 4), '2026-08-04').state;
    expect(canRepair(broken, '2026-08-04')).toBe(true);
  });

  it('restores the streak across the gap', () => {
    const broken = settle(playRun('2026-08-01', 4), '2026-08-04').state;
    const repaired = repair(broken, '2026-08-04');
    expect(streakLength(repaired, '2026-08-04')).toBe(6); // 4 played + 2 repaired
  });

  it('is available once a calendar month, and not twice', () => {
    const broken = settle(playRun('2026-08-01', 4), '2026-08-04').state;
    const repaired = repair(broken, '2026-08-04');
    expect(canRepair(repaired, '2026-08-04')).toBe(false);

    // Break it again inside the same month.
    const brokenAgain = settle(repaired, '2026-08-20').state;
    expect(canRepair(brokenAgain, '2026-08-20')).toBe(false);
    // A new month opens the offer again.
    expect(canRepair(brokenAgain, '2026-09-02')).toBe(true);
  });

  it('will not resurrect a streak from an absence longer than the cap', () => {
    const gone = playRun('2026-08-01', 10);
    const later = addDays('2026-08-01', REPAIR_MAX_GAP_DAYS + 2);
    expect(canRepair(settle(gone, later).state, later)).toBe(false);
  });

  it('is never offered to a player who has never completed a daily', () => {
    expect(canRepair(emptyStreak(), '2026-08-03')).toBe(false);
  });

  it('returns the state unchanged when it is not offered', () => {
    const alive = playRun('2026-08-03', 4);
    expect(repair(alive, '2026-08-04')).toEqual(alive);
  });
});

describe('isDone', () => {
  it('answers only for a genuinely completed day', () => {
    const state = settle(playRun('2026-08-07', FREEZE_EVERY), '2026-08-09').state;
    expect(isDone(state, '2026-08-07')).toBe(true);
    expect(isDone(state, '2026-08-08')).toBe(false); // frozen is not played
    expect(isDone(state, '2026-08-09')).toBe(false);
  });
});

describe('weekPips', () => {
  it('is seven days ending today, oldest first', () => {
    const pips = weekPips(playRun('2026-08-03', 3), '2026-08-03');
    expect(pips).toHaveLength(7);
    expect(pips[0]!.dateKey).toBe('2026-07-28');
    expect(pips[6]!.dateKey).toBe('2026-08-03');
  });

  it('labels each day by what actually happened', () => {
    const played = settle(playRun('2026-08-07', FREEZE_EVERY), '2026-08-09').state;
    const byDay = new Map(weekPips(played, '2026-08-09').map((cell) => [cell.dateKey, cell.status]));
    expect(byDay.get('2026-08-07')).toBe('completed');
    expect(byDay.get('2026-08-08')).toBe('frozen');
    expect(byDay.get('2026-08-09')).toBe('today');
  });

  it('never calls a day before the player started "missed"', () => {
    const pips = weekPips(playRun('2026-08-03', 1), '2026-08-03');
    expect(pips[0]!.status).toBe('inactive');
  });
});

describe('monthGrid', () => {
  it('aligns the first day to its weekday and covers the whole month', () => {
    const grid = monthGrid(emptyStreak(), '2026-08', '2026-08-03');
    expect(grid.days).toHaveLength(31);
    // 1 August 2026 is a Saturday — six blanks before it.
    expect(grid.leadingBlanks).toBe(6);
    expect(grid.days[0]!.dateKey).toBe('2026-08-01');
    expect(grid.days[30]!.dateKey).toBe('2026-08-31');
  });

  it('marks days after today as future, never missed', () => {
    const grid = monthGrid(playRun('2026-08-03', 3), '2026-08', '2026-08-03');
    const byDay = new Map(grid.days.map((cell) => [cell.dateKey, cell.status]));
    expect(byDay.get('2026-08-02')).toBe('completed');
    expect(byDay.get('2026-08-03')).toBe('completed');
    expect(byDay.get('2026-08-04')).toBe('future');
    expect(byDay.get('2026-08-31')).toBe('future');
  });

  it('handles a leap February', () => {
    expect(monthGrid(emptyStreak(), '2028-02', '2028-02-10').days).toHaveLength(29);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/daily/streak.test.ts`
Expected: FAIL — `Failed to resolve import "@/daily/streak"`.

- [ ] **Step 3: Write the implementation**

Create `src/daily/streak.ts`:

```ts
/**
 * The streak (step 6) — pure, and deliberately forgiving.
 *
 * §15 names a broken streak the #1 churn event and the design doc's Streak
 * flame component says the flame "never scolds". Both are behaviour, not
 * copy: the model is built so that the common ways a real person misses a day
 * mostly do not cost them the streak.
 *
 * A day counts if it is **completed** or **frozen**. Freezes are earned one
 * per seven-day streak and spent automatically, oldest gap first, by
 * `settle`. A manual repair is available once a calendar month and reaches
 * back at most `REPAIR_MAX_GAP_DAYS`.
 *
 * `settledThrough` is the field that makes this safe to call on every app
 * open: it records the last day `settle` actually walked to — *yesterday*,
 * never today, because today is still playable. Without it, opening the app
 * three times on one day would spend three freezes on the same gap, and
 * nothing on screen would ever say so.
 */

import { addDays, compareDateKeys, daysBetween, daysInMonth, monthKeyOf, weekdayOf } from './dates';
import type { DateKey } from './dates';

/** `PLAN.md` §6: one freeze earned per 7-day streak. */
export const FREEZE_EVERY = 7;
/**
 * A cap, so a long streak cannot become unbreakable. **A judgment call** — no
 * document specifies one; the design doc's own wireframe shows "2 freezes".
 */
export const MAX_FREEZES = 3;
/**
 * How far back one manual repair reaches. **A judgment call**: "generous on
 * purpose" is the instruction, but without a cap a single tap would resurrect
 * a streak after a three-month absence, which is a different thing from
 * forgiving a missed Tuesday.
 */
export const REPAIR_MAX_GAP_DAYS = 7;

export interface StreakState {
  version: 1;
  /** Days genuinely played, ascending and unique. */
  completed: DateKey[];
  /** Days a freeze or a repair covered, ascending and unique. */
  frozen: DateKey[];
  /** Banked, unspent freezes. */
  freezes: number;
  /** `'YYYY-MM'` of the last manual repair, or null. */
  lastRepairMonth: string | null;
  /** The last day `settle` walked to. Never today. */
  settledThrough: DateKey | null;
}

export function emptyStreak(): StreakState {
  return {
    version: 1,
    completed: [],
    frozen: [],
    freezes: 0,
    lastRepairMonth: null,
    settledThrough: null,
  };
}

function coverage(state: StreakState): Set<DateKey> {
  return new Set([...state.completed, ...state.frozen]);
}

function lastCompleted(state: StreakState): DateKey | null {
  return state.completed.length > 0 ? state.completed[state.completed.length - 1]! : null;
}

export function isDone(state: StreakState, dateKey: DateKey): boolean {
  return state.completed.includes(dateKey);
}

/**
 * Counts back from today if today is covered, otherwise from yesterday. **An
 * unplayed today does not break the streak** — that is the at-risk state, and
 * treating it as broken would scold a player at 09:00 for not having played
 * yet.
 */
export function streakLength(state: StreakState, today: DateKey): number {
  const covered = coverage(state);
  let day = covered.has(today) ? today : addDays(today, -1);
  let length = 0;
  while (covered.has(day)) {
    length++;
    day = addDays(day, -1);
  }
  return length;
}

export interface SettleResult {
  state: StreakState;
  /** True when this walk found a gap it could not cover. */
  broke: boolean;
  freezesSpent: number;
}

/**
 * Bring the record up to yesterday, spending freezes on gaps. Idempotent
 * within a day.
 */
export function settle(state: StreakState, today: DateKey): SettleResult {
  const settledThrough = addDays(today, -1);
  const last = lastCompleted(state);
  if (last === null) return { state: { ...state, settledThrough }, broke: false, freezesSpent: 0 };

  const previous = state.settledThrough;
  const start = previous !== null && compareDateKeys(previous, last) > 0 ? previous : last;

  const covered = coverage(state);
  // An uncovered start day means the break already happened on a previous
  // walk. A freeze spent past that point buys a streak the player no longer
  // has, and they never get it back.
  if (!covered.has(start)) {
    return { state: { ...state, settledThrough }, broke: false, freezesSpent: 0 };
  }

  const frozen = [...state.frozen];
  let freezes = state.freezes;
  let freezesSpent = 0;
  let broke = false;

  for (let day = addDays(start, 1); compareDateKeys(day, today) < 0; day = addDays(day, 1)) {
    if (covered.has(day)) continue;
    if (freezes === 0) {
      broke = true;
      break;
    }
    freezes--;
    freezesSpent++;
    frozen.push(day);
    covered.add(day);
  }

  frozen.sort();
  return { state: { ...state, frozen, freezes, settledThrough }, broke, freezesSpent };
}

export interface CompletionResult {
  state: StreakState;
  /** The streak length this completion produced. */
  streak: number;
  freezeEarned: boolean;
  alreadyDone: boolean;
}

export function recordCompletion(state: StreakState, dateKey: DateKey): CompletionResult {
  if (state.completed.includes(dateKey)) {
    return { state, streak: streakLength(state, dateKey), freezeEarned: false, alreadyDone: true };
  }

  // Keys are zero-padded, so a bare sort is chronological.
  const completed = [...state.completed, dateKey].sort();
  const next: StreakState = { ...state, completed };
  const streak = streakLength(next, dateKey);
  const freezeEarned = streak > 0 && streak % FREEZE_EVERY === 0 && next.freezes < MAX_FREEZES;

  return {
    state: freezeEarned ? { ...next, freezes: next.freezes + 1 } : next,
    streak,
    freezeEarned,
    alreadyDone: false,
  };
}

export function canRepair(state: StreakState, today: DateKey): boolean {
  const last = lastCompleted(state);
  if (last === null) return false;
  if (streakLength(state, today) > 0) return false;
  if (state.lastRepairMonth === monthKeyOf(today)) return false;
  const gap = daysBetween(last, today) - 1;
  return gap > 0 && gap <= REPAIR_MAX_GAP_DAYS;
}

export function repair(state: StreakState, today: DateKey): StreakState {
  if (!canRepair(state, today)) return state;
  const last = lastCompleted(state)!;
  const covered = coverage(state);
  const frozen = [...state.frozen];
  for (let day = addDays(last, 1); compareDateKeys(day, today) < 0; day = addDays(day, 1)) {
    if (!covered.has(day)) frozen.push(day);
  }
  frozen.sort();
  return { ...state, frozen, lastRepairMonth: monthKeyOf(today) };
}

export type DayStatus = 'completed' | 'frozen' | 'missed' | 'today' | 'future' | 'inactive';

export interface DayCell {
  dateKey: DateKey;
  status: DayStatus;
}

/**
 * `'inactive'` rather than `'missed'` for anything before the player's first
 * daily: a calendar full of red for the months before someone joined is the
 * definition of scolding.
 */
function statusOf(
  state: StreakState,
  completed: Set<DateKey>,
  frozen: Set<DateKey>,
  dateKey: DateKey,
  today: DateKey,
): DayStatus {
  if (completed.has(dateKey)) return 'completed';
  if (frozen.has(dateKey)) return 'frozen';
  if (compareDateKeys(dateKey, today) > 0) return 'future';
  if (dateKey === today) return 'today';
  const first = state.completed[0];
  if (first === undefined || compareDateKeys(dateKey, first) < 0) return 'inactive';
  return 'missed';
}

/** The seven days ending today, oldest first. */
export function weekPips(state: StreakState, today: DateKey): DayCell[] {
  const completed = new Set(state.completed);
  const frozen = new Set(state.frozen);
  const cells: DayCell[] = [];
  for (let offset = 6; offset >= 0; offset--) {
    const dateKey = addDays(today, -offset);
    cells.push({ dateKey, status: statusOf(state, completed, frozen, dateKey, today) });
  }
  return cells;
}

export interface MonthGrid {
  monthKey: string;
  /** Empty cells before the 1st, so the grid aligns to weekday columns. */
  leadingBlanks: number;
  days: DayCell[];
}

export function monthGrid(state: StreakState, monthKey: string, today: DateKey): MonthGrid {
  const completed = new Set(state.completed);
  const frozen = new Set(state.frozen);
  const days: DayCell[] = [];
  const count = daysInMonth(monthKey);
  for (let day = 1; day <= count; day++) {
    const dateKey = `${monthKey}-${String(day).padStart(2, '0')}`;
    days.push({ dateKey, status: statusOf(state, completed, frozen, dateKey, today) });
  }
  return { monthKey, leadingBlanks: weekdayOf(`${monthKey}-01`), days };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/daily/streak.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Run the whole unit suite and the typechecker**

Run: `npm test && npm run typecheck`
Expected: everything green; no existing test touched by this task.

- [ ] **Step 6: Commit**

```bash
git add src/daily/streak.ts test/daily/streak.test.ts
git commit -m "Step 6: the streak model — freezes, repair, pips, month grid"
```

---

### Task 4: Persisting the streak

One record, one new object store, and a database version bump that must not lose an existing
player's in-progress puzzles.

**Files:**
- Modify: `src/persist/db.ts` (bump `DB_VERSION`, add `STORE_DAILY`)
- Create: `src/persist/daily.ts`

**Interfaces:**
- Consumes: `idbGet`, `idbPut` from `@/persist/db`; `emptyStreak`, `StreakState` from
  `@/daily/streak` (Task 3).
- Produces:
  - `STORE_DAILY: string` from `@/persist/db`
  - `loadStreak(): Promise<StreakState>`
  - `saveStreak(state: StreakState): Promise<void>`

There is no unit test in this task. `src/persist/` touches IndexedDB, which does not exist in
vitest's node environment — the same reason `library.ts`, `photos.ts`, and `snapshot.ts`'s storage
half have none. Task 11's browser spec is where this earns its keep, including an explicit assertion
that the version bump preserves existing session records.

- [ ] **Step 1: Bump the database version and add the store**

In `src/persist/db.ts`, change:

```ts
const DB_VERSION = 1;
export const STORE_SESSIONS = 'sessions';
export const STORE_PHOTOS = 'photos';
export const STORE_THUMBNAILS = 'thumbnails';
```

to:

```ts
// Bumped to 2 at step 6 for the `daily` store. The upgrade below guards every
// `createObjectStore` with a `contains` check, so a bump is purely additive —
// an existing player's sessions, photos and thumbnails survive it. Getting
// that wrong deletes every in-progress puzzle a real player has, which is why
// `daily.spec.ts` asserts it directly rather than trusting this comment.
const DB_VERSION = 2;
export const STORE_SESSIONS = 'sessions';
export const STORE_PHOTOS = 'photos';
export const STORE_THUMBNAILS = 'thumbnails';
export const STORE_DAILY = 'daily';
```

and inside `request.onupgradeneeded`, after the `STORE_THUMBNAILS` block, add:

```ts
      if (!db.objectStoreNames.contains(STORE_DAILY)) {
        db.createObjectStore(STORE_DAILY, { keyPath: 'key' });
      }
```

- [ ] **Step 2: Write the streak store**

Create `src/persist/daily.ts`:

```ts
/**
 * The streak record (step 6).
 *
 * One row, in its own store. It is deliberately *not* part of a session
 * snapshot: a streak outlives every individual puzzle, and a player who
 * finishes and deletes today's daily must not lose the streak with it.
 */

import { STORE_DAILY, idbGet, idbPut } from './db';
import { emptyStreak } from '@/daily/streak';
import type { StreakState } from '@/daily/streak';

const STREAK_KEY = 'streak';

interface StreakRecord {
  key: string;
  state: StreakState;
}

/** Never rejects into a broken hub: an absent or unreadable record is a new player. */
export async function loadStreak(): Promise<StreakState> {
  try {
    const record = await idbGet<StreakRecord>(STORE_DAILY, STREAK_KEY);
    return record?.state ?? emptyStreak();
  } catch {
    return emptyStreak();
  }
}

export async function saveStreak(state: StreakState): Promise<void> {
  await idbPut<StreakRecord>(STORE_DAILY, { key: STREAK_KEY, state });
}
```

- [ ] **Step 3: Verify it compiles and nothing regressed**

Run: `npm run typecheck && npm test`
Expected: clean typecheck, unit suite green.

- [ ] **Step 4: Commit**

```bash
git add src/persist/db.ts src/persist/daily.ts
git commit -m "Step 6: the streak store — IndexedDB v2, additive"
```

---

### Task 5: The streak flame

The design doc lists this as a component in its own right: "count, freeze pips, at-risk state (day
not yet played), broken with repair offer. Never scolds."

**Files:**
- Create: `src/ui/StreakFlame.tsx`

**Interfaces:**
- Consumes: `DayCell` from `@/daily/streak` (Task 3).
- Produces:
  - `type StreakTone = 'none' | 'alive' | 'at-risk' | 'broken'`
  - `interface StreakFlameProps { streak: number; freezes: number; tone: StreakTone; pips?: readonly DayCell[]; compact?: boolean }`
  - `StreakFlame(props: StreakFlameProps): React.ReactElement`
  - `streakMessage(tone: StreakTone, streak: number, canRepair: boolean): string`

`compact` is the header-button form used by `Library` and `PhotoPicker` — flame glyph plus number,
nothing else. The full form carries the display-serif number, the freeze pips, and the week row.

- [ ] **Step 1: Write the component**

Create `src/ui/StreakFlame.tsx`:

```tsx
/**
 * The streak flame (design doc §12's component list).
 *
 * "Never scolds" is behaviour, not decoration: there is no copy here for a
 * broken streak that blames the player, and the at-risk state is phrased as
 * an invitation. The repair *offer* lives in `DailyHub` next to its button —
 * this component only ever states what is true.
 *
 * Colour is never the only signal (`CLAUDE.md`): every pip carries a glyph and
 * a full-sentence label as well as a fill.
 */

import type { DayCell, DayStatus } from '@/daily/streak';

export type StreakTone = 'none' | 'alive' | 'at-risk' | 'broken';

export interface StreakFlameProps {
  streak: number;
  freezes: number;
  tone: StreakTone;
  /** The seven days ending today. Omitted in the compact header form. */
  pips?: readonly DayCell[];
  compact?: boolean;
}

/** One line, stating what is true. Never an admonishment. */
export function streakMessage(tone: StreakTone, streak: number, canRepair: boolean): string {
  if (tone === 'none') return 'Start a streak.';
  if (tone === 'alive') return `${streak} day${streak === 1 ? '' : 's'} in a row.`;
  if (tone === 'at-risk') return 'Play today’s to keep it going.';
  return canRepair
    ? `Your ${streak} day streak ended. Repair it?`
    : 'A new streak starts today.';
}

const PIP_GLYPH: Record<DayStatus, string> = {
  completed: '●',
  frozen: '◇',
  missed: '·',
  today: '○',
  future: '·',
  inactive: '·',
};

const PIP_LABEL: Record<DayStatus, string> = {
  completed: 'completed',
  frozen: 'covered by a freeze',
  missed: 'not played',
  today: 'today, not played yet',
  future: 'still to come',
  inactive: 'before you started',
};

function pipClass(status: DayStatus): string {
  switch (status) {
    case 'completed':
      return 'bg-[var(--accent)] text-[var(--mat-void)]';
    case 'frozen':
      return 'border border-[var(--accent)] text-[var(--accent)]';
    case 'today':
      return 'border border-[var(--ink-primary)] text-[var(--ink-primary)]';
    default:
      return 'border border-[var(--edge-hair)] text-[var(--ink-muted)]';
  }
}

export function StreakFlame({
  streak,
  freezes,
  tone,
  pips,
  compact = false,
}: StreakFlameProps): React.ReactElement {
  if (compact) {
    return (
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true">{tone === 'broken' || tone === 'none' ? '○' : '▲'}</span>
        <span className="font-[var(--font-data)] text-[14px] tabular-nums">{streak}</span>
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span
          className="font-[var(--font-display)] text-[40px] leading-none text-[var(--ink-primary)]"
          // §13: the display serif is for the streak number, and tabular so it
          // does not shift width as the count grows.
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {streak}
        </span>
        <span className="font-[var(--font-data)] text-[12px] text-[var(--ink-muted)]">
          day streak{freezes > 0 ? ` · ${freezes} freeze${freezes === 1 ? '' : 's'}` : ''}
        </span>
      </div>

      {pips && (
        <div className="flex gap-1" role="list" aria-label="This week">
          {pips.map((cell) => (
            <span
              key={cell.dateKey}
              role="listitem"
              aria-label={`${cell.dateKey}: ${PIP_LABEL[cell.status]}`}
              title={`${cell.dateKey}: ${PIP_LABEL[cell.status]}`}
              className={`flex h-[22px] w-[22px] items-center justify-center rounded-[var(--radius-sm)] text-[10px] leading-none ${pipClass(
                cell.status,
              )}`}
            >
              <span aria-hidden="true">{PIP_GLYPH[cell.status]}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/ui/StreakFlame.tsx
git commit -m "Step 6: the streak flame — count, freezes, week pips"
```

---

### Task 6: The month calendar

**Files:**
- Create: `src/ui/MonthCalendar.tsx`

**Interfaces:**
- Consumes: `MonthGrid`, `DayStatus` from `@/daily/streak` (Task 3); `parseDateKey` from
  `@/daily/dates` (Task 1).
- Produces:
  - `interface MonthCalendarProps { grid: MonthGrid; label: string }`
  - `MonthCalendar(props: MonthCalendarProps): React.ReactElement`

A real `<table>` with `<th scope="col">` weekday headers, not a `div` grid: a calendar read by a
screen reader without column semantics is a list of numbers.

- [ ] **Step 1: Write the component**

Create `src/ui/MonthCalendar.tsx`:

```tsx
/**
 * The month calendar of completions (design doc screen 11).
 *
 * A real table, because a calendar without column semantics is an unlabelled
 * list of numbers to a screen reader. Every cell states its own status in
 * words (`CLAUDE.md`: colour is never the only signal), and cells clear the
 * 44pt touch floor even though nothing here is tappable — a 20px grid is
 * unreadable on a phone whether or not you can press it.
 */

import { parseDateKey } from '@/daily/dates';
import type { DayStatus, MonthGrid } from '@/daily/streak';

export interface MonthCalendarProps {
  grid: MonthGrid;
  /** e.g. "August 2026". Formatted by the caller, which owns the locale. */
  label: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const STATUS_LABEL: Record<DayStatus, string> = {
  completed: 'completed',
  frozen: 'covered by a freeze',
  missed: 'not played',
  today: 'today',
  future: 'still to come',
  inactive: 'before you started',
};

const STATUS_GLYPH: Record<DayStatus, string> = {
  completed: '●',
  frozen: '◇',
  missed: '',
  today: '',
  future: '',
  inactive: '',
};

function cellClass(status: DayStatus): string {
  switch (status) {
    case 'completed':
      return 'bg-[var(--accent)]/20 text-[var(--accent)]';
    case 'frozen':
      return 'border border-[var(--accent)] text-[var(--accent)]';
    case 'today':
      return 'border border-[var(--ink-primary)] text-[var(--ink-primary)]';
    case 'missed':
      return 'text-[var(--ink-muted)]';
    default:
      return 'text-[var(--ink-muted)]/50';
  }
}

export function MonthCalendar({ grid, label }: MonthCalendarProps): React.ReactElement {
  const blanks = Array.from({ length: grid.leadingBlanks }, (_, i) => i);
  const cells = [...blanks.map(() => null), ...grid.days];
  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <table className="w-full border-separate border-spacing-1" aria-label={`Completions, ${label}`}>
      <caption className="pb-2 text-left font-[var(--font-data)] text-[12px] text-[var(--ink-muted)]">
        {label}
      </caption>
      <thead>
        <tr>
          {WEEKDAYS.map((day) => (
            <th
              key={day}
              scope="col"
              className="font-[var(--font-data)] text-[10px] font-normal text-[var(--ink-muted)]"
            >
              <span aria-hidden="true">{day[0]}</span>
              <span className="sr-only">{day}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week, index) => (
          <tr key={index}>
            {week.map((cell, column) =>
              cell === null ? (
                <td key={`blank-${column}`} />
              ) : (
                <td
                  key={cell.dateKey}
                  aria-label={`${cell.dateKey}: ${STATUS_LABEL[cell.status]}`}
                  className={`h-[44px] min-w-[44px] rounded-[var(--radius-sm)] text-center align-middle font-[var(--font-data)] text-[12px] tabular-nums ${cellClass(
                    cell.status,
                  )}`}
                >
                  <span aria-hidden="true">
                    {parseDateKey(cell.dateKey).day}
                    {STATUS_GLYPH[cell.status] && (
                      <span className="ml-0.5 text-[8px]">{STATUS_GLYPH[cell.status]}</span>
                    )}
                  </span>
                </td>
              ),
            )}
            {/* Pad the last week so the final row keeps its column widths. */}
            {week.length < 7 &&
              Array.from({ length: 7 - week.length }, (_, i) => <td key={`pad-${i}`} />)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/ui/MonthCalendar.tsx
git commit -m "Step 6: the month calendar of completions"
```

---

### Task 7: The Daily hub screen

**Files:**
- Create: `src/ui/DailyHub.tsx`

**Interfaces:**
- Consumes: `DailyPuzzle` from `@/daily/daily` (Task 2); `MonthGrid`, `DayCell` from
  `@/daily/streak` (Task 3); `StreakFlame`, `StreakTone`, `streakMessage` from `./StreakFlame`
  (Task 5); `MonthCalendar` from `./MonthCalendar` (Task 6); `renderCuratedPhoto`,
  `curatedPhotoById` from `@/play/curated`; `ProgressRing` from `./ProgressRing`.
- Produces:
  - `interface DailyHubProps { … }` (below)
  - `DailyHub(props: DailyHubProps): React.ReactElement`

Every state from the design doc's screen 11 is a prop combination, not internal state: **not started**
(`progress === null && !doneToday`), **in progress** (`progress !== null`), **done today**
(`doneToday`), **streak with freezes** (`freezes > 0`), **broken with repair offer** (`tone ===
'broken' && canRepair`), **month calendar** (always).

- [ ] **Step 1: Write the component**

Create `src/ui/DailyHub.tsx`:

```tsx
/**
 * The Daily hub (design doc screen 11; `PLAN.md` step 6).
 *
 * Every one of the doc's six states for this screen is a prop combination
 * rather than internal state, so there is one place — `App.tsx` — that decides
 * which one the player is in, and this file only draws it.
 *
 * The today card's preview is drawn straight from the curated photo, once,
 * into a small canvas. That is not the board thumbnail: an in-progress daily
 * *does* have a board thumbnail, and it is preferred when present, because
 * `PLAN.md` is explicit that a progress card shows the board and not the
 * source photo.
 *
 * No leaderboard tab. `PLAN.md` and the design doc both say v1 ships
 * streak-only, and the tab appears the day accounts exist.
 */

import { useEffect, useRef, useState } from 'react';
import { curatedPhotoById, renderCuratedPhoto } from '@/play/curated';
import type { DailyPuzzle } from '@/daily/daily';
import type { DayCell, MonthGrid } from '@/daily/streak';
import { MonthCalendar } from './MonthCalendar';
import { ProgressRing } from './ProgressRing';
import { StreakFlame, streakMessage } from './StreakFlame';
import type { StreakTone } from './StreakFlame';

export interface DailyHubProps {
  daily: DailyPuzzle;
  /** Human date for the card, e.g. "Monday, 3 August". Formatted by the caller. */
  dateLabel: string;
  monthLabel: string;
  streak: number;
  freezes: number;
  tone: StreakTone;
  pips: readonly DayCell[];
  grid: MonthGrid;
  /** Non-null when today's daily is saved and unfinished. */
  progress: { placed: number; total: number } | null;
  /** The saved board thumbnail for an in-progress daily. */
  progressThumbnail: Blob | null;
  doneToday: boolean;
  canRepair: boolean;
  onRepair: () => void;
  onStart: () => void;
  onLibrary: () => void;
  onNewPuzzle: () => void;
}

/** The curated photo for today, drawn once at card size. */
function DailyPreview({ photoId }: { photoId: string }): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let bitmap: ImageBitmap | null = null;
    void (async () => {
      const rendered = await renderCuratedPhoto(photoId);
      bitmap = rendered;
      const canvas = canvasRef.current;
      if (cancelled || !canvas) {
        rendered.close();
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // `object-fit: cover`, by hand: fill the card and crop the overflow.
      const scale = Math.max(canvas.width / rendered.width, canvas.height / rendered.height);
      const w = rendered.width * scale;
      const h = rendered.height * scale;
      ctx.drawImage(rendered, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    })();
    return () => {
      cancelled = true;
      bitmap?.close();
    };
  }, [photoId]);

  return <canvas ref={canvasRef} width={640} height={480} className="h-full w-full object-cover" />;
}

function ProgressThumbnail({ blob }: { blob: Blob }): React.ReactElement {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span />;
}

export function DailyHub({
  daily,
  dateLabel,
  monthLabel,
  streak,
  freezes,
  tone,
  pips,
  grid,
  progress,
  progressThumbnail,
  doneToday,
  canRepair,
  onRepair,
  onStart,
  onLibrary,
  onNewPuzzle,
}: DailyHubProps): React.ReactElement {
  const photoName = curatedPhotoById(daily.photoId)?.name ?? 'Today’s photo';
  const cta = doneToday ? 'Play it again' : progress ? 'Continue today’s' : 'Start today’s';

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="font-[var(--font-display)] text-[28px] text-[var(--ink-primary)]">
          Daily
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Your puzzles"
            onClick={onLibrary}
            className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--edge-hair)] px-3 text-[13px] text-[var(--ink-primary)]"
          >
            Your puzzles
          </button>
          <button
            type="button"
            aria-label="New puzzle"
            onClick={onNewPuzzle}
            className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--edge-hair)] px-3 text-[13px] text-[var(--ink-primary)]"
          >
            New puzzle
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        {/* Today's card */}
        <div className="flex min-w-[240px] flex-[1.3] flex-col gap-2">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--edge-hair)] bg-[var(--mat-void)]">
            {progressThumbnail ? (
              <ProgressThumbnail blob={progressThumbnail} />
            ) : (
              <DailyPreview photoId={daily.photoId} />
            )}
            {progress && (
              <div className="absolute right-2 top-2">
                <ProgressRing
                  completion={progress.total === 0 ? 0 : progress.placed / progress.total}
                  size={32}
                />
              </div>
            )}
            {doneToday && (
              <div className="absolute right-2 top-2 rounded-[var(--radius-sm)] bg-[var(--accent)] px-2 py-1 text-[11px] text-[var(--mat-void)]">
                ✓ Done today
              </div>
            )}
          </div>
          <div className="text-[14px] text-[var(--ink-primary)]">
            {dateLabel} · {photoName}
          </div>
          <div className="font-[var(--font-data)] text-[12px] tabular-nums text-[var(--ink-muted)]">
            {progress
              ? `${progress.placed} / ${progress.total} placed`
              : `${daily.targetCount} pieces`}
          </div>
        </div>

        {/* Streak */}
        <div className="flex min-w-[240px] flex-1 flex-col justify-between gap-3">
          <StreakFlame streak={streak} freezes={freezes} tone={tone} pips={pips} />
          <div className="text-[13px] text-[var(--ink-muted)]">
            {streakMessage(tone, streak, canRepair)}
          </div>
          {canRepair && (
            <button
              type="button"
              aria-label="Repair streak"
              onClick={onRepair}
              className="min-h-[44px] self-start rounded-[var(--radius-md)] border border-[var(--accent)] px-3 text-[13px] text-[var(--accent)]"
            >
              Repair streak
            </button>
          )}
          <button
            type="button"
            aria-label={cta}
            onClick={onStart}
            className="min-h-[44px] rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-[14px] text-[var(--mat-void)]"
          >
            {cta}
          </button>
        </div>
      </div>

      <MonthCalendar grid={grid} label={monthLabel} />
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/ui/DailyHub.tsx
git commit -m "Step 6: the Daily hub screen"
```

---

### Task 8: Reaching the hub from the library and the picker

Two small, additive prop changes, so a returning player and a first-run player can both get to the
daily. Both props are optional, so nothing already rendering these components breaks.

**Files:**
- Modify: `src/ui/Library.tsx`
- Modify: `src/ui/PhotoPicker.tsx`

**Interfaces:**
- Consumes: `StreakFlame`, `StreakTone` from `./StreakFlame` (Task 5).
- Produces:
  - `LibraryProps` gains `onDaily?: () => void`, `streak?: number`, `streakTone?: StreakTone`
  - `PhotoPickerProps` gains `onDaily?: () => void`

- [ ] **Step 1: Add the daily button to the library header**

In `src/ui/Library.tsx`, extend the imports:

```tsx
import { StreakFlame } from './StreakFlame';
import type { StreakTone } from './StreakFlame';
```

extend the props interface:

```tsx
export interface LibraryProps {
  entries: readonly LibraryEntry[];
  onOpen: (puzzleId: string) => void;
  onNewPuzzle: () => void;
  /** Step 6: the hub is a peer screen, reached from here. */
  onDaily?: () => void;
  streak?: number;
  streakTone?: StreakTone;
}
```

change the signature:

```tsx
export function Library({
  entries,
  onOpen,
  onNewPuzzle,
  onDaily,
  streak = 0,
  streakTone = 'none',
}: LibraryProps): React.ReactElement {
```

and inside the header row, immediately **before** the existing "New Puzzle" button, add:

```tsx
        {onDaily && (
          <button
            type="button"
            aria-label="Daily"
            onClick={onDaily}
            className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--edge-hair)] px-3 text-[13px] text-[var(--ink-primary)]"
          >
            <StreakFlame streak={streak} freezes={0} tone={streakTone} compact />
          </button>
        )}
```

The two buttons need a flex row around them if they are not already siblings in one; wrap them in
`<div className="flex gap-2">…</div>` inside the existing `justify-between` header.

- [ ] **Step 2: Add the daily link to the picker header**

In `src/ui/PhotoPicker.tsx`, extend the props interface:

```tsx
export interface PhotoPickerProps {
  onPhotoChosen: (choice: PhotoChoice) => void;
  /** Surfaced by `App.tsx` when a previously chosen upload failed to decode. */
  error?: string | null;
  /**
   * Step 6: a first-run player never sees the library, so this is their only
   * route to the daily.
   */
  onDaily?: () => void;
}
```

change the signature to `export function PhotoPicker({ onPhotoChosen, error, onDaily }: PhotoPickerProps)`,
and replace the header block:

```tsx
      <div>
        <div className="font-[var(--font-display)] text-[28px] text-[var(--ink-primary)]">
          New Puzzle
        </div>
        <div className="mt-1 font-[var(--font-data)] text-[12px] text-[var(--ink-muted)]">
          Step 1 of 2 — Pick a photo
        </div>
      </div>
```

with:

```tsx
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-[var(--font-display)] text-[28px] text-[var(--ink-primary)]">
            New Puzzle
          </div>
          <div className="mt-1 font-[var(--font-data)] text-[12px] text-[var(--ink-muted)]">
            Step 1 of 2 — Pick a photo
          </div>
        </div>
        {onDaily && (
          <button
            type="button"
            aria-label="Today’s puzzle"
            onClick={onDaily}
            className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--edge-hair)] px-3 text-[13px] text-[var(--ink-primary)]"
          >
            Today’s puzzle
          </button>
        )}
      </div>
```

- [ ] **Step 3: Verify nothing regressed**

Run: `npm run typecheck && npm test`
Expected: clean typecheck, unit suite green. Both new props are optional, so no existing call site
changes yet.

- [ ] **Step 4: Commit**

```bash
git add src/ui/Library.tsx src/ui/PhotoPicker.tsx
git commit -m "Step 6: routes into the Daily hub from library and picker"
```

---

### Task 9: Wiring the hub into the app

The screen, the streak load-and-settle, the daily start path that skips picker/crop/setup, and the
rule that today's daily is offered on the hub rather than twice.

**Files:**
- Modify: `src/ui/App.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–8.
- Produces: no new exported surface. `App`'s internal `Screen` union gains `'daily'`.

- [ ] **Step 1: Add the imports**

In `src/ui/App.tsx`, alongside the existing imports, add:

```tsx
import { dailyFor, dailyPuzzleId, isDailyPuzzleId } from '@/daily/daily';
import { localDateKey, monthKeyOf } from '@/daily/dates';
import {
  canRepair as canRepairStreak,
  emptyStreak,
  isDone,
  monthGrid,
  recordCompletion,
  repair as repairStreak,
  settle,
  streakLength,
  weekPips,
} from '@/daily/streak';
import type { StreakState } from '@/daily/streak';
import { loadStreak, saveStreak } from '@/persist/daily';
import { DailyHub } from './DailyHub';
import type { StreakTone } from './StreakFlame';
import { DEFAULT_PUZZLE_CONFIG } from '@/play/setup';
```

- [ ] **Step 2: Add the daily configuration constant**

Above `export function App()`, add:

```tsx
/**
 * The daily's fixed configuration. Everyone plays the same puzzle, so there is
 * no setup screen in the daily flow and nothing here is a player choice.
 * Classic (the hint economy is part of the shared challenge), rotation off
 * (`PLAN.md`: rotation must never be the default), standard tolerance, no
 * assists.
 */
const DAILY_CONFIG = {
  mode: 'classic',
  rotation: false,
  difficulty: DEFAULT_PUZZLE_CONFIG.difficulty,
  assists: DEFAULT_PUZZLE_CONFIG.assists,
} as const;
```

- [ ] **Step 3: Add the screen, the streak state, and the origin screen**

Change:

```tsx
  type Screen = 'checking' | 'library' | 'setup' | 'playing';
  const [screen, setScreen] = useState<Screen>('checking');
```

to:

```tsx
  type Screen = 'checking' | 'daily' | 'library' | 'setup' | 'playing';
  const [screen, setScreen] = useState<Screen>('checking');
  /**
   * Read once per mount. A session that survives local midnight keeps
   * yesterday's key until the next load, which is correct: the daily the
   * player is holding is the one they started.
   */
  const [today] = useState(() => localDateKey(new Date()));
  const [streak, setStreak] = useState<StreakState>(() => emptyStreak());
  /** Where "Done" and "Leave" go back to. */
  const originScreen = useRef<'daily' | 'library' | 'setup'>('setup');
  /** Guards the completion recording against re-firing on every render. */
  const recordedDaily = useRef<string | null>(null);
```

- [ ] **Step 4: Load and settle the streak on mount**

Immediately after the existing `useEffect` that calls `listLibrary()`, add:

```tsx
  // Settle on open, once: `settle` walks up to yesterday, spending banked
  // freezes on gaps, and is idempotent within a day. The write-back only
  // happens when it actually changed something, so a player who opens the app
  // ten times writes once.
  useEffect(() => {
    void (async () => {
      const loaded = await loadStreak();
      const settled = settle(loaded, today);
      setStreak(settled.state);
      if (settled.freezesSpent > 0 || settled.state.settledThrough !== loaded.settledThrough) {
        await saveStreak(settled.state);
      }
    })();
  }, [today]);
```

- [ ] **Step 5: Add the daily start path**

After `handleOpenLibraryEntry`, add:

```tsx
  // -- the daily -------------------------------------------------------------

  const daily = useMemo(() => dailyFor(today), [today]);

  /**
   * Straight from the hub onto a board: no picker, no crop, no setup screen.
   * Resumes an in-progress daily when one is saved, exactly as a library card
   * does, because a daily *is* a library entry — same stores, same
   * `Board.restore`, same snapshot.
   */
  const handleStartDaily = useCallback(async (): Promise<void> => {
    const existing = libraryEntries.find((entry) => entry.puzzleId === daily.puzzleId);
    originScreen.current = 'daily';

    if (existing) {
      await handleOpenLibraryEntry(daily.puzzleId);
      return;
    }

    const source = await renderCuratedPhoto(daily.photoId);
    setRestoreSnapshot(null);
    photoSavedRef.current = false;
    setLiveAssists(DAILY_CONFIG.assists);
    setLiveDifficulty(DAILY_CONFIG.difficulty);
    setPlayConfig({
      source,
      seed: daily.seed,
      puzzleId: daily.puzzleId,
      targetCount: daily.targetCount,
      mode: DAILY_CONFIG.mode,
      rotation: DAILY_CONFIG.rotation,
      difficulty: DAILY_CONFIG.difficulty,
      assists: DAILY_CONFIG.assists,
    });
    setScreen('playing');
  }, [daily, libraryEntries, handleOpenLibraryEntry]);

  const handleRepair = useCallback((): void => {
    const repaired = repairStreak(streak, today);
    setStreak(repaired);
    void saveStreak(repaired);
  }, [streak, today]);
```

Note `handleOpenLibraryEntry` already sets `originScreen`-independent state and `setScreen('playing')`;
setting `originScreen.current` before calling it is what routes "Done" back to the hub.

- [ ] **Step 6: Record a daily completion**

After the effect that keeps the chrome store in step with the runtime, add:

```tsx
  // The streak is credited at the moment of completion, not on "Done": a
  // player who finishes and then backgrounds the tab has still played today.
  // Guarded by a ref rather than by state so a re-render cannot double-count.
  useEffect(() => {
    if (summary.status !== 'complete') return;
    const puzzleId = playConfig?.puzzleId;
    if (!puzzleId || !isDailyPuzzleId(puzzleId)) return;
    if (recordedDaily.current === puzzleId) return;
    recordedDaily.current = puzzleId;

    const dateKey = puzzleId.slice('daily-'.length);
    const result = recordCompletion(streak, dateKey);
    if (result.alreadyDone) return;
    setStreak(result.state);
    void saveStreak(result.state);
  }, [summary.status, playConfig, streak]);
```

- [ ] **Step 7: Route "Done" and "Leave" back to where play started**

In `handleLeave`, change `setScreen('library')` to:

```tsx
    setScreen(originScreen.current === 'daily' ? 'daily' : 'library');
```

In `handleDone`, change:

```tsx
    setScreen(entries.length > 0 ? 'library' : 'setup');
```

to:

```tsx
    setScreen(
      originScreen.current === 'daily' ? 'daily' : entries.length > 0 ? 'library' : 'setup',
    );
```

In `handleSetupConfirm`, before `setScreen('playing')`, add `originScreen.current = 'setup';`.
In `handleOpenLibraryEntry`, before `setScreen('playing')`, add:

```tsx
      // A daily opened from a library card still belongs to the library.
      if (originScreen.current !== 'daily') originScreen.current = 'library';
```

- [ ] **Step 8: Render the hub, and keep today's daily off the library shelf**

Immediately after the `screen === 'checking'` early return, add:

```tsx
  const streakCount = streakLength(streak, today);
  const streakTone: StreakTone =
    streak.completed.length === 0
      ? 'none'
      : streakCount === 0
        ? 'broken'
        : isDone(streak, today)
          ? 'alive'
          : 'at-risk';

  if (screen === 'daily') {
    const todaysEntry = libraryEntries.find((entry) => entry.puzzleId === daily.puzzleId);
    return (
      <DailyHub
        daily={daily}
        dateLabel={new Date(`${today}T00:00:00`).toLocaleDateString(undefined, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
        monthLabel={new Date(`${today}T00:00:00`).toLocaleDateString(undefined, {
          month: 'long',
          year: 'numeric',
        })}
        streak={streakCount}
        freezes={streak.freezes}
        tone={streakTone}
        pips={weekPips(streak, today)}
        grid={monthGrid(streak, monthKeyOf(today), today)}
        progress={
          todaysEntry
            ? { placed: todaysEntry.snapshot.placed, total: todaysEntry.snapshot.total }
            : null
        }
        progressThumbnail={todaysEntry?.thumbnailBlob ?? null}
        doneToday={isDone(streak, today)}
        canRepair={canRepairStreak(streak, today)}
        onRepair={handleRepair}
        onStart={() => {
          void handleStartDaily();
        }}
        onLibrary={() => setScreen('library')}
        onNewPuzzle={() => {
          originScreen.current = 'setup';
          setSetupPhase({ kind: 'picker', error: null });
          setScreen('setup');
        }}
      />
    );
  }
```

Then, in the existing `screen === 'library'` branch, pass the new props and filter today's daily:

```tsx
  if (screen === 'library') {
    // Today's daily is offered on the hub, not here — one puzzle, one place to
    // start it. Yesterday's unfinished daily is no longer "today's" and shows
    // as an ordinary card, which is why nothing is ever deleted to achieve this.
    const shelved = libraryEntries.filter((entry) => entry.puzzleId !== dailyPuzzleId(today));
    return (
      <Library
        entries={shelved}
        streak={streakCount}
        streakTone={streakTone}
        onDaily={() => setScreen('daily')}
        onOpen={(puzzleId) => {
          void handleOpenLibraryEntry(puzzleId);
        }}
        onNewPuzzle={() => {
          originScreen.current = 'setup';
          setSetupPhase({ kind: 'picker', error: null });
          setScreen('setup');
        }}
      />
    );
  }
```

Finally, pass `onDaily` to the picker:

```tsx
      return (
        <PhotoPicker
          onPhotoChosen={handlePhotoChosen}
          error={setupPhase.error}
          onDaily={() => setScreen('daily')}
        />
      );
```

- [ ] **Step 9: Verify the whole existing suite still passes**

Run: `npm run typecheck && npm test && npm run build`
Expected: all clean. The entry flow is unchanged, so no existing browser spec should need editing —
Step 11 confirms that rather than assuming it.

- [ ] **Step 10: Commit**

```bash
git add src/ui/App.tsx
git commit -m "Step 6: wire the Daily hub, streak settle, and daily start into App"
```

---

### Task 10: The completion banner's daily variant

The design doc's screen 10 lists "Daily variant with streak increment" alongside the ordinary
completion actions. This is the whole of that, minus Step 8's card.

**Files:**
- Modify: `src/ui/CompletionBanner.tsx`
- Modify: `src/ui/App.tsx` (pass the new props)

**Interfaces:**
- Consumes: nothing new.
- Produces: `CompletionBannerProps` gains `daily?: { streak: number; freezeEarned: boolean }`.

- [ ] **Step 1: Add the variant to the banner**

In `src/ui/CompletionBanner.tsx`, change the props interface to:

```tsx
export interface CompletionBannerProps {
  canGoHarder: boolean;
  onAgainHarder: () => void;
  onDone: () => void;
  /**
   * Present only when the puzzle just finished was a daily (design doc screen
   * 10, "Daily variant with streak increment").
   */
  daily?: { streak: number; freezeEarned: boolean };
}
```

change the signature to `export function CompletionBanner({ canGoHarder, onAgainHarder, onDone, daily }: CompletionBannerProps)`,
and replace the message `<div>` with:

```tsx
      <div className="flex flex-col">
        <div className="text-[14px] text-[var(--ink-primary)]">
          {daily ? `Daily done · ${daily.streak} day streak` : 'Puzzle complete'}
        </div>
        {daily?.freezeEarned && (
          <div className="font-[var(--font-data)] text-[11px] text-[var(--ink-muted)]">
            Freeze earned — one missed day is covered.
          </div>
        )}
      </div>
```

- [ ] **Step 2: Pass the variant from App**

In `src/ui/App.tsx`, hold the last recorded result so the banner can read it. Change the completion
effect from Task 9 Step 6 to also store its result — add alongside the other state declarations:

```tsx
  const [dailyResult, setDailyResult] = useState<{ streak: number; freezeEarned: boolean } | null>(
    null,
  );
```

and inside that effect, after `setStreak(result.state)`, add:

```tsx
    setDailyResult({ streak: result.streak, freezeEarned: result.freezeEarned });
```

Also clear it when a new board mounts — in `handleStartDaily`, `handleSetupConfirm`,
`handleAgainHarder`, and `handleOpenLibraryEntry`, add `setDailyResult(null);` next to the existing
`setRestoreSnapshot(...)` call, and reset the guard in `handleAgainHarder` with
`recordedDaily.current = null;`.

Then in the render, change:

```tsx
          <CompletionBanner
            canGoHarder={nextHarderCount(playConfig.targetCount) !== null}
```

to:

```tsx
          <CompletionBanner
            canGoHarder={nextHarderCount(playConfig.targetCount) !== null}
            {...(isDailyPuzzleId(playConfig.puzzleId) && dailyResult ? { daily: dailyResult } : {})}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/ui/CompletionBanner.tsx src/ui/App.tsx
git commit -m "Step 6: the completion banner's daily variant — streak increment"
```

---

### Task 11: Browser coverage

`CLAUDE.md`: `npm run test:browser` is a gate, not an optional extra. Everything in this step that
only a real browser can answer lives here — IndexedDB, the version bump, the hub's routes, and the
streak actually incrementing end to end.

Deliberately **not** here: time travel. Stubbing "today" in the page would test a stub. Every
date-dependent branch — freezes, repair, month boundaries — is covered by `test/daily/streak.test.ts`
against explicit date keys, which is where this codebase puts logic with a decision in it.

**Files:**
- Create: `test/browser/daily.spec.ts`

**Interfaces:**
- Consumes: `BoardPage` from `./board-page`. **`BoardPage.open()` needs no change** — it clears the
  database before navigating, so the app still lands on the picker, and the entry flow is unchanged
  by this step. If `open()` turns out to need editing, stop and re-read Task 9 Step 8: the entry rule
  was supposed to be untouched.

- [ ] **Step 1: Write the spec**

Create `test/browser/daily.spec.ts`:

```ts
/**
 * The daily and the streak (step 6).
 *
 * Time travel is deliberately absent. Stubbing the page's clock would test the
 * stub; every date-dependent branch — freeze spend, repair, month boundaries —
 * is unit-tested in `test/daily/streak.test.ts` against explicit date keys.
 * What is left is what only a browser can answer: IndexedDB, the schema bump,
 * the routes into the hub, and the streak incrementing end to end.
 */

import { expect, test } from '@playwright/test';
import { BoardPage } from './board-page';

/** A clean database and the picker, which is where a first visit lands. */
async function freshVisit(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    indexedDB.deleteDatabase('tessera');
  });
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.getByRole('button', { name: 'Choose this photo' })).toBeVisible();
}

test('the hub is reachable from the picker on a first visit', async ({ page }) => {
  await freshVisit(page);
  await page.getByLabel('Today’s puzzle').click();

  // Every state of screen 11 that a brand-new player should see.
  await expect(page.getByLabel('Start today’s')).toBeVisible();
  await expect(page.getByText('Start a streak.')).toBeVisible();
  await expect(page.getByLabel(/^Completions, /)).toBeVisible();
  // v1 ships streak-only.
  await expect(page.getByText('Leaderboard')).toHaveCount(0);
});

test('the hub is reachable from the library, and today’s daily is not listed there', async ({
  page,
}) => {
  test.setTimeout(90_000);

  // A saved ordinary session, so the app lands on the library after a reload.
  const board = await BoardPage.open(page, { mode: 'Zen' });
  const [first] = await board.mountedIds();
  await board.placeViaHint(first!);
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'load' });

  await expect(page.getByLabel(/Open puzzle:/).first()).toBeVisible();
  const ordinaryCards = await page.getByLabel(/Open puzzle:/).count();

  await page.getByLabel('Daily').click();
  await expect(page.getByLabel('Start today’s')).toBeVisible();

  // Start the daily, leave it part-done, and come back to the library: the
  // daily must live on the hub, not be offered twice.
  await page.getByLabel('Start today’s').click();
  await board.waitForCut();
  await page.getByLabel('Pause').click();
  await page.getByLabel('Leave').click();

  // Leave routes back to where play started — the hub.
  await expect(page.getByLabel('Continue today’s')).toBeVisible();

  await page.getByLabel('Your puzzles').click();
  await expect(page.getByLabel(/Open puzzle:/)).toHaveCount(ordinaryCards);
});

test('starting the daily skips the picker, the crop, and the setup screen', async ({ page }) => {
  test.setTimeout(90_000);
  await freshVisit(page);
  await page.getByLabel('Today’s puzzle').click();
  await page.getByLabel('Start today’s').click();

  const board = new BoardPage(page);
  await board.waitForCut();

  await expect(page.getByRole('button', { name: 'Choose this photo' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start cutting' })).toHaveCount(0);
  await expect(page.locator('header')).toBeVisible();
});

test('the daily is the same board on every visit', async ({ page }) => {
  test.setTimeout(120_000);
  await freshVisit(page);
  await page.getByLabel('Today’s puzzle').click();
  await page.getByLabel('Start today’s').click();

  const board = new BoardPage(page);
  await board.waitForCut();
  const first = await board.placed();

  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'load' });
  // A session exists now, so the reload lands on the library; go via the hub.
  await page.getByLabel('Daily').click();
  await page.getByLabel('Continue today’s').click();
  await board.waitForCut();

  expect((await board.placed()).total).toBe(first.total);
});

/**
 * There is deliberately no "finishing the daily increments the streak" test
 * here. Solving a board from a spec needs Zen — `BoardPage.placeViaHint`
 * leans on Tier 3's auto-place being free, which is the only way a spec can
 * place a specific piece without the app growing a test-only hook — and the
 * daily is Classic by design, with three hints. `completion.spec.ts` gets away
 * with it only because it picks Zen at 50 pieces.
 *
 * So the increment is covered where it can be covered honestly:
 * `recordCompletion` and `streakLength` in `test/daily/streak.test.ts`, and the
 * wiring by inspection. Adding a solve hook to `PlayRuntime` to close this
 * would put a test-only path into production code, which this codebase has
 * declined to do twice already.
 */

test('upgrading the database to v2 keeps an existing session', async ({ page }) => {
  test.setTimeout(90_000);

  // Save a real session under the current schema.
  const board = await BoardPage.open(page, { mode: 'Zen' });
  const [first] = await board.mountedIds();
  await board.placeViaHint(first!);
  await page.waitForTimeout(1200);

  // Prove the `daily` store exists alongside the three from v1, and that the
  // session survived the bump. This is the assertion that stands between a
  // schema change and deleting every in-progress puzzle a real player has.
  const stores = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tessera');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const names = Array.from(db.objectStoreNames);
    const count = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction('sessions', 'readonly');
      const request = tx.objectStore('sessions').count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return { names, count };
  });

  expect(stores.names).toEqual(
    expect.arrayContaining(['sessions', 'photos', 'thumbnails', 'daily']),
  );
  expect(stores.count).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Confirm the deliberate coverage gap, and do not close it with a hook**

This was checked while writing the plan, not left to the implementer: there is **no solve path in the
codebase**. `grep -rn "solve" src test` returns only prose in comments; the step-2 harness's Solve
button went with `dev.html` at 5c. `completion.spec.ts` — the only spec that reaches
`status === 'complete'` — solves by looping `BoardPage.placeViaHint` at 50 pieces in **Zen**, which
works solely because Zen makes Tier 3's auto-place free.

The daily is Classic with three hints (Task 9's `DAILY_CONFIG`), so a spec cannot solve one. That is
why the completion test is absent above rather than written and skipped.

**Do not close this by adding a solve hook to `PlayRuntime` or publishing the instance on `window`.**
`BoardPage.placeViaHint`'s own doc comment records that this codebase has already declined that trade
once. Record the gap in Task 12's handoff section instead.

If you find yourself wanting the coverage badly enough to change the product, the change to argue for
is a Zen daily — and that is a product decision for the owner, not a testing one.

- [ ] **Step 3: Run the browser suite**

Run: `npm run test:browser`
Expected: every existing spec still passing at its established count, plus the new file. If any
pre-existing spec fails, the entry flow changed when it should not have — go back to Task 9 Step 8.

- [ ] **Step 4: Commit**

```bash
git add test/browser/daily.spec.ts
git commit -m "Step 6: browser coverage for the daily and the streak"
```

---

### Task 12: The gates, and the documentation that outlives the branch

**Files:**
- Modify: `PLAN.md` (tick Step 6's checklist, record what was scoped out)
- Modify: `CLAUDE.md` (layout table, invariants)
- Modify: `handoff.md` (a new section, in the style of §1a–§1f)

- [ ] **Step 1: Run every gate**

```bash
npm test
npm run typecheck
npm run build
npm run test:browser
```

Record the actual numbers. `CLAUDE.md` is explicit that a green `npm test` is not evidence the app
works, and `superpowers:verification-before-completion` applies: do not write "passing" into any
document without the output in front of you.

- [ ] **Step 2: Update `PLAN.md`'s Step 6**

Tick the daily hub, the deterministic `(imageId, pieceCount, seed)`, and the freeze/repair rules.
**Do not tick** the Edge Function line, the timezone-stored-server-side line, or the pre-seeding
line. Replace them with a short note:

```markdown
- [x] Daily hub: today's puzzle, streak with freeze pips, month calendar of completions.
      **No leaderboard tab in v1.**
- [x] Same `(imageId, pieceCount, seed)` for everyone; resets 00:00 **local**. *Local-only at step 6:
      the date is read from the device and the streak lives in IndexedDB. Storing the user's timezone
      and computing the streak server-side arrives with Supabase, not before.*
- [x] Freeze logic — one earned per 7-day streak, auto-spent on a missed day, one manual repair per
      month. *In `src/daily/streak.ts`, pure and unit-tested.* **Not** in an Edge Function: the
      client is the only thing that exists. With no accounts and no leaderboard there is nothing to
      cheat for, and the move server-side is a later step.
- [x] Daily puzzles are a closed form of the date rather than a pre-seeded table, so "a missing day
      must never break the hub" is not a property that can fail.
```

- [ ] **Step 3: Update `CLAUDE.md`**

Add to the layout tree, after the `play/` block:

```
  daily/    dates.ts                  local day keys, UTC arithmetic
            daily.ts                  date → (photo, count, seed), closed form
            streak.ts                 freezes, repair, pips, month grid
```

add `daily.ts` to the `persist/` listing if one exists there, add `DailyHub StreakFlame
MonthCalendar` to the `ui/` listing, and add two invariants to the Invariants section:

```markdown
- **The daily is an ordinary puzzle with a deterministic id** — `daily-YYYY-MM-DD`, seeded through
  `seedFromPuzzleId` like every other puzzle. That is what lets step 5c's autosave, `Board.restore`,
  thumbnails, and photo blobs all apply to it with no daily-specific persistence anywhere. If a
  second save path for dailies ever appears, something has been misunderstood.
- **`localDateKey` is the only place a local `Date` is read.** The daily resets at 00:00 *local*
  (`PLAN.md` §6), and the usual shortcut — `toISOString().slice(0, 10)` — is UTC, which flips the
  daily over at 19:00 for a player at UTC-5. All arithmetic on date keys is done in UTC on whole
  days, because a local `setDate(+1)` across a DST boundary is 23 or 25 hours and rounds wrong.
```

- [ ] **Step 4: Write the handoff section**

Add a section to `handoff.md` in the established style. It must record, at minimum:

- The gate numbers from Step 1, as measured.
- What was scoped out and why: Supabase, Edge Functions, accounts, server-side streak validation,
  pre-seeded daily tables.
- **The six-photo rota.** `CURATED_PHOTOS` is six procedurally-drawn scenes, so the daily repeats
  every six days. This is a content gap, not an architecture one — `CURATED_PHOTOS` growing fixes it
  with no code change — but it must not ship at six. Flag it next to §1e's existing note that the
  curated photos are not real photographs.
- **Local time is trivially cheatable** and deliberately unaddressed — with no accounts and no
  leaderboard there is nothing to cheat for.
- The three judgment calls with no document behind them: `MAX_FREEZES = 3`,
  `REPAIR_MAX_GAP_DAYS = 7`, and `DAILY_COUNT_BY_WEEKDAY`.
- **The deliberate coverage gap** (Task 11 Step 2): daily completion → streak increment is
  unit-covered in `test/daily/streak.test.ts` and wired by inspection, but has no browser coverage,
  because a Classic board cannot be solved from a spec without a test-only hook. The alternative was
  a Zen daily or a `PlayRuntime.solve`; both were declined.
- **`DAILY_CONFIG` hardcodes Classic**, so the daily cannot be played in Zen. Intentional — everyone
  plays the same puzzle — but no document says it, so it should not read as an oversight.
- **The real-hardware check**, as the standing open gate it has been since 5a. The specific question
  here is the month calendar's 44pt floor on a phone, which Chromium answers wrong.

- [ ] **Step 5: Commit**

```bash
git add PLAN.md CLAUDE.md handoff.md
git commit -m "Step 6: handoff notes, PLAN and CLAUDE updates"
```

---

## Self-review notes

Checked against the spec, section by section:

- **Deterministic daily** → Task 2. **Local midnight reset** → Task 1, and the invariant added in
  Task 12.
- **Hub screen, all six states from design doc screen 11** → Task 7 (each is a prop combination;
  Task 9 Step 8 is where each is computed).
- **Streak with freezes, auto-spend, one repair a month** → Task 3.
- **Persistence, DB v2** → Task 4, asserted in Task 11.
- **Entry routes from library and picker** → Task 8, wired in Task 9.
- **Today's daily on the hub, not duplicated in the library** → Task 9 Step 8, asserted in Task 11.
- **Daily completion increments the streak, banner says so** → Tasks 9 and 10.
- **No leaderboard tab** → asserted in Task 11's first test.
- **Colour never the only signal / 44pt floor** → Tasks 5 and 6, and the global constraints.

Two things a reviewer should push on rather than accept:

1. **One requirement ships without browser coverage.** "Daily completion increments the streak" is
   unit-covered (`recordCompletion`, `streakLength`) and wired by inspection, but no spec can solve a
   Classic board — verified while writing this plan, not assumed. Task 11 Step 2 states why, and why
   the two ways to close it (a `PlayRuntime.solve` hook, or a Zen daily) were both declined.
2. **`DAILY_CONFIG` hardcodes Classic.** A player who prefers Zen cannot play the daily in Zen. That
   is intentional — everyone plays the same puzzle — but no document states it, so it is a decision
   worth a sentence in `handoff.md` rather than a silent constant.
