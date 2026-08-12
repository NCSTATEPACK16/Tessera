/**
 * The HEIC worker.
 *
 * A transport shell only, the same split as `src/cut/cutter.worker.ts`: every
 * decision lives in `heic.ts` (pure, tested), and this file exists so libheif
 * never touches the main thread.
 *
 * ## Why the import is dynamic
 *
 * `heic-to` bundles libheif as ~3 MB of WASM. A static import would put it in
 * this worker's chunk, which Vite would then fetch when the worker is
 * constructed. The dynamic import defers it to the moment a HEIC actually
 * arrives, so the curated path and every JPEG upload pay nothing at all.
 *
 * ## Why no orientation option is passed
 *
 * The classic HEIC bug is double rotation: HEIC can carry rotation in the
 * container's `irot` box *and* in the EXIF `Orientation` tag, and applying
 * both cancels or doubles it. It cannot happen here, for a reason worth
 * stating rather than leaving as an absence:
 *
 * libheif applies `irot` while decoding, and `heic-to` documents that EXIF is
 * dropped entirely on conversion. So the output carries exactly one rotation,
 * already applied, and no tag that anything downstream could apply a second
 * time. Passing `imageOrientation` here would be the bug, not the fix.
 */

import { downscaleTarget } from './photo';
import type { HeicRequest, HeicResponse } from './heic-client';

const post = (message: HeicResponse, transfer?: Transferable[]): void => {
  if (transfer && transfer.length > 0) {
    self.postMessage(message, transfer);
  } else {
    self.postMessage(message);
  }
};

self.onmessage = async (message: MessageEvent<HeicRequest>) => {
  const { blob } = message.data;

  let full: ImageBitmap | null = null;
  try {
    const { heicTo } = await import('heic-to/next');
    full = await heicTo({ blob, type: 'bitmap' });

    // The downscale is `photo.ts`'s, not a second one — CLAUDE.md's 2560px
    // long-edge cap is enforced in exactly one place for every source, HEIC or
    // not. Doing it here rather than on the main thread keeps the full-size
    // allocation off it entirely; a 12 MP decode is the largest surface in
    // this whole flow.
    const target = downscaleTarget(full.width, full.height);
    const bitmap =
      target.width === full.width && target.height === full.height
        ? full
        : await createImageBitmap(full, {
            resizeWidth: target.width,
            resizeHeight: target.height,
            resizeQuality: 'high',
          });

    if (bitmap !== full) {
      full.close();
      full = null;
    }

    // Transferred, not copied, for the same reason the cutter transfers piece
    // bitmaps: copying the pixels back would undo the point of decoding here.
    post({ type: 'done', bitmap }, [bitmap]);
  } catch (error) {
    full?.close();
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
