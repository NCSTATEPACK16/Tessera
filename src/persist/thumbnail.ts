/**
 * Library-card thumbnails: the actual current board, not the source photo
 * (`PLAN.md`'s explicit requirement), downsampled small at save time so a
 * library read is a blob read — no re-cutting, no re-rendering.
 */

const THUMBNAIL_WIDTH = 320;

export async function captureThumbnail(
  source: HTMLCanvasElement | OffscreenCanvas,
): Promise<Blob> {
  const scale = THUMBNAIL_WIDTH / source.width;
  const width = THUMBNAIL_WIDTH;
  const height = Math.max(1, Math.round(source.height * scale));

  const target = new OffscreenCanvas(width, height);
  const ctx = target.getContext('2d');
  if (!ctx) throw new Error('captureThumbnail: 2d context unavailable');
  ctx.drawImage(source, 0, 0, width, height);

  // JPEG, not PNG: this is a photographic thumbnail, not a chip with hard
  // edges, and 0.8 keeps a 250-piece board's card well under a few dozen KB.
  return target.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
}
