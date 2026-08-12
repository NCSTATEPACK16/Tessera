/**
 * Has this player seen the guided twelve?
 *
 * A row in the existing `daily` store rather than a new one: the store is
 * keyed and already holds one row per concern, and a schema bump per boolean
 * is a migration risk for no gain. §14's "losing progress is unforgivable"
 * cuts against gratuitous version bumps.
 *
 * IndexedDB is the source of truth. `hasSeenFirstRunSync` mirrors it into a
 * `localStorage` boolean purely as a synchronous pre-hydration cache, so the
 * app's first render already knows whether to even attempt the guided
 * twelve instead of waiting on an IndexedDB round trip — CLAUDE.md's
 * explicit, narrow carve-out to "no localStorage for session state", named
 * because this is UI routing, not session state. Fails open in both
 * directions: a missing or unreadable cache entry means "not done yet",
 * which only ever costs a returning player one unnecessary IndexedDB read
 * before the async `loadFirstRunDone` corrects it — it can never trap them
 * in the tutorial the way the IndexedDB read's own failure mode would.
 */
import { STORE_DAILY, idbGet, idbPut } from './db';

const FIRST_RUN_KEY = 'firstRunDone';
const FIRST_RUN_LOCALSTORAGE_KEY = 'tessera:firstRunSeen';

export function hasSeenFirstRunSync(): boolean {
  try {
    return localStorage.getItem(FIRST_RUN_LOCALSTORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

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
  try {
    localStorage.setItem(FIRST_RUN_LOCALSTORAGE_KEY, 'true');
  } catch {
    // Private browsing / storage disabled: IndexedDB below is still the
    // source of truth, so losing the cache costs one avoidable read next
    // launch, never a trapped or repeated tutorial.
  }
  await idbPut(STORE_DAILY, { key: FIRST_RUN_KEY, done: true });
}
