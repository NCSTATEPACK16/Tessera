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
