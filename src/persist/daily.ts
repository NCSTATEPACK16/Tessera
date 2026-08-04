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
