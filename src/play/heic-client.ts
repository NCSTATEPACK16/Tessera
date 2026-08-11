/**
 * Main-thread front door to the HEIC worker — the same shape as
 * `src/cut/cut-client.ts`, and thin for the same reason: it touches `Worker`
 * and `Blob`, so it is judged by hand and by the browser suite rather than by
 * vitest. Everything with a decision in it lives in `heic.ts`.
 */

export interface HeicRequest {
  blob: Blob;
}

export type HeicResponse =
  | { type: 'done'; bitmap: ImageBitmap }
  | { type: 'error'; message: string };

/**
 * Reads the first bytes of `file` for `sniffHeicBrand`.
 *
 * Returns an empty array rather than throwing when the read fails — an
 * unreadable head is "no evidence", and `looksLikeHeic` falls back to the name
 * and MIME type on exactly that signal.
 */
export async function readHead(file: Blob, byteCount: number): Promise<Uint8Array> {
  try {
    return new Uint8Array(await file.slice(0, byteCount).arrayBuffer());
  } catch {
    return new Uint8Array(0);
  }
}

/**
 * Decodes a HEIC blob to an orientation-correct, downscaled `ImageBitmap`.
 *
 * Rejects if libheif cannot read the file; `App.tsx` turns that into the
 * player-facing HEIC message. The worker is terminated on both paths — one
 * worker per upload, never pooled, because a HEIC upload is a rare and
 * deliberate act and a pooled worker would hold ~3 MB of WASM resident for the
 * whole session.
 */
export function decodeHeicInWorker(blob: Blob): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./heic.worker.ts', import.meta.url), { type: 'module' });

    const finish = (fn: () => void): void => {
      worker.terminate();
      fn();
    };

    worker.onmessage = (message: MessageEvent<HeicResponse>) => {
      const response = message.data;
      if (response.type === 'done') {
        finish(() => resolve(response.bitmap));
      } else {
        finish(() => reject(new Error(response.message)));
      }
    };

    worker.onerror = (event) => {
      finish(() => reject(new Error(event.message || 'The HEIC decoder failed to start.')));
    };

    worker.postMessage({ blob } satisfies HeicRequest);
  });
}
