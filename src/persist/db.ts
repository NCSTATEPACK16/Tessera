/**
 * A thin, hand-rolled promisified layer over IndexedDB.
 *
 * No dependency added — this is ~50 lines and the codebase's existing
 * preference is small hand-written modules (`rng.ts`, `geom.ts`) over pulling
 * in a library for something this narrow. Every store this app needs
 * (sessions, photos, thumbnails) is created here in one place so there is
 * only ever one `onupgradeneeded` to keep in sync with the store list.
 */

const DB_NAME = 'tessera';
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

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: 'puzzleId' });
      }
      if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
        db.createObjectStore(STORE_PHOTOS, { keyPath: 'puzzleId' });
      }
      if (!db.objectStoreNames.contains(STORE_THUMBNAILS)) {
        db.createObjectStore(STORE_THUMBNAILS, { keyPath: 'puzzleId' });
      }
      if (!db.objectStoreNames.contains(STORE_DAILY)) {
        db.createObjectStore(STORE_DAILY, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

export async function idbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const request = tx.objectStore(store).get(key);
    let result: T | undefined;
    request.onsuccess = () => {
      result = request.result as T | undefined;
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbPut<T>(store: string, value: T, key?: IDBValidKey): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGetAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const request = tx.objectStore(store).getAll();
    let result: T[] = [];
    request.onsuccess = () => {
      result = request.result as T[];
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}
