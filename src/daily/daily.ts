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
