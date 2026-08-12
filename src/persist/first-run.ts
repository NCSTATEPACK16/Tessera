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
