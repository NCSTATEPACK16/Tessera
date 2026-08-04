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
