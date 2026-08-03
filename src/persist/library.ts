/**
 * The library — in-progress puzzles. Joins the sessions and thumbnails
 * stores by `puzzleId` client-side, rather than a cross-store transaction:
 * a thumbnail write failing after a snapshot write succeeded is cosmetic,
 * not a correctness problem, given autosave retries both every 800ms.
 */

import {
  idbDelete,
  idbGet,
  idbGetAll,
  idbPut,
  STORE_SESSIONS,
  STORE_THUMBNAILS,
} from './db';
import { deletePhoto } from './photos';
import type { SessionSnapshot } from './snapshot';

export interface LibraryEntry {
  puzzleId: string;
  snapshot: SessionSnapshot;
  thumbnailBlob: Blob;
  updatedAt: number;
}

interface ThumbnailRecord {
  puzzleId: string;
  blob: Blob;
}

export async function listLibrary(): Promise<LibraryEntry[]> {
  const [sessions, thumbnails] = await Promise.all([
    idbGetAll<SessionSnapshot>(STORE_SESSIONS),
    idbGetAll<ThumbnailRecord>(STORE_THUMBNAILS),
  ]);
  const thumbById = new Map(thumbnails.map((t) => [t.puzzleId, t.blob]));

  const entries: LibraryEntry[] = [];
  for (const snapshot of sessions) {
    const thumbnailBlob = thumbById.get(snapshot.puzzleId);
    // Skip rather than throw: this is exactly the partial-write case the
    // two-put write above deliberately tolerates.
    if (!thumbnailBlob) continue;
    entries.push({
      puzzleId: snapshot.puzzleId,
      snapshot,
      thumbnailBlob,
      updatedAt: snapshot.updatedAt,
    });
  }
  entries.sort((a, b) => b.updatedAt - a.updatedAt);
  return entries;
}

export async function saveLibraryEntry(entry: LibraryEntry): Promise<void> {
  await Promise.all([
    idbPut<SessionSnapshot>(STORE_SESSIONS, entry.snapshot),
    idbPut<ThumbnailRecord>(STORE_THUMBNAILS, {
      puzzleId: entry.puzzleId,
      blob: entry.thumbnailBlob,
    }),
  ]);
}

/** A deleted library entry has no reason to keep its source photo around. */
export async function deleteLibraryEntry(puzzleId: string): Promise<void> {
  await Promise.all([
    idbDelete(STORE_SESSIONS, puzzleId),
    idbDelete(STORE_THUMBNAILS, puzzleId),
    deletePhoto(puzzleId),
  ]);
}

export async function loadSnapshot(puzzleId: string): Promise<SessionSnapshot | undefined> {
  return idbGet<SessionSnapshot>(STORE_SESSIONS, puzzleId);
}
