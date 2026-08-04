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
