/**
 * Library-card thumbnails: the actual current board, not the source photo
 * (`PLAN.md`'s explicit requirement), downsampled small at save time so a
 * library read is a blob read — no re-cutting, no re-rendering.
 */

const THUMBNAIL_WIDTH = 320;

/**
 * Encoded synchronously, on purpose — `toDataURL`, never `convertToBlob` or
 * `toBlob`.
 *
 * Every autosave awaits this before it writes anything. Chromium schedules an
 * async canvas encode as an idle task, and on a page producing no frames there
 * is no idle period to run it in, so it waits out a ~1s fallback timeout
 * instead. An idle board produces no frames by design ("idle draws nothing"),
 * so the async encode turned the 800ms debounce into ~1.8s, and a reload or a
 * closed tab inside that window lost the save outright. A 320px JPEG encodes
 * in a millisecond or two; there is nothing worth deferring.
 */
export async function captureThumbnail(
  source: HTMLCanvasElement | OffscreenCanvas,
): Promise<Blob> {
  const scale = THUMBNAIL_WIDTH / source.width;
  const width = THUMBNAIL_WIDTH;
  const height = Math.max(1, Math.round(source.height * scale));

  const target = document.createElement('canvas');
  target.width = width;
  target.height = height;
  const ctx = target.getContext('2d');
  if (!ctx) throw new Error('captureThumbnail: 2d context unavailable');
  ctx.drawImage(source, 0, 0, width, height);

  // JPEG, not PNG: this is a photographic thumbnail, not a chip with hard
  // edges, and 0.8 keeps a 250-piece board's card well under a few dozen KB.
  return dataUrlToBlob(target.toDataURL('image/jpeg', 0.8));
}

/** A base64 `data:` URL to the `Blob` it encodes. Synchronous, DOM-free. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const type = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? 'application/octet-stream';
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}
