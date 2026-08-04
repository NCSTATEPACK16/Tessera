/**
 * The source photo, stored once per puzzle and never rewritten — the
 * canonical durable copy every other consumer (restore, the pause sheet's
 * reference image, "again, harder") decodes a fresh working `ImageBitmap`
 * from on demand.
 *
 * Fresh every call, deliberately: handing an `ImageBitmap` to `cutInWorker`
 * transfers and therefore detaches it, so a long-lived shared copy would go
 * blank under its second consumer with nothing on screen to explain it.
 */

import { idbDelete, idbGet, idbPut, STORE_PHOTOS } from './db';

interface PhotoRecord {
  puzzleId: string;
  blob: Blob;
}

export async function savePhoto(puzzleId: string, blob: Blob): Promise<void> {
  await idbPut<PhotoRecord>(STORE_PHOTOS, { puzzleId, blob });
}

export async function loadPhoto(puzzleId: string): Promise<ImageBitmap> {
  const record = await idbGet<PhotoRecord>(STORE_PHOTOS, puzzleId);
  // Loud, not blank: a missing photo for an in-progress puzzle is a data
  // integrity bug, and silently returning an empty board would hide it.
  if (!record) throw new Error(`No stored photo for puzzle ${puzzleId}`);
  return createImageBitmap(record.blob);
}

export async function deletePhoto(puzzleId: string): Promise<void> {
  await idbDelete(STORE_PHOTOS, puzzleId);
}
