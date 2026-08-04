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
