/**
 * The collection wall's data (step 8).
 *
 * §15: "a growing mosaic of everything you have finished is a possession, and
 * people do not abandon possessions." Before this store, `handleDone` deleted
 * the library entry and a finished puzzle left no trace at all.
 *
 * Deliberately a *separate* store rather than a status flag on the library
 * entry: "in progress" and "finished" stay distinct concepts, and a completed
 * 250-piece snapshot plus its full-size source blob does not stay resident
 * forever. §17 names iOS Safari storage eviction as a standing risk, and the
 * cheapest way to protect in-progress boards is to not hoard finished ones.
 */

import { STORE_COMPLETIONS, idbGetAll, idbPut } from './db';
import type { PuzzleMode } from '@/play/setup';

export interface CompletionRecord {
  puzzleId: string;
  /** The curated photo's id, or null for an upload. */
  photoId: string | null;
  /** The final board — `captureThumbnail`'s output, never the source photo. */
  thumbnailBlob: Blob;
  elapsedMs: number;
  pieceCount: number;
  mode: PuzzleMode;
  cleanRun: boolean;
  /** Epoch ms. Orders the wall, newest first. */
  completedAt: number;
  /**
   * Denormalised at write time so the wall never re-reads the manifest — and
   * so a photo later removed from the library keeps its attribution on the
   * cards that already earned it.
   */
  attribution: string | null;
}

export async function saveCompletion(record: CompletionRecord): Promise<void> {
  await idbPut<CompletionRecord>(STORE_COMPLETIONS, record);
}

/** Newest first. */
export async function listCompletions(): Promise<CompletionRecord[]> {
  const all = await idbGetAll<CompletionRecord>(STORE_COMPLETIONS);
  return all.sort((a, b) => b.completedAt - a.completedAt);
}

/** Plan 9's install prompt fires after the second completion (§17). */
export async function completionCount(): Promise<number> {
  return (await idbGetAll<CompletionRecord>(STORE_COMPLETIONS)).length;
}
