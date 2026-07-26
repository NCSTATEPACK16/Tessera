/**
 * The cutter worker.
 *
 * "Cutting happens in a Web Worker with OffscreenCanvas. The main thread never
 * blocks; the setup screen shows real progress." (design doc §03, non-negotiable)
 *
 * This file is a transport shell only — all cutting logic lives in `cutter.ts`
 * so it stays testable off-thread.
 */

import { cut } from './cutter';
import { buildNeighbourGraph } from './graph';
import type { CutMessage, CutRequest } from './types';

const post = (message: CutMessage, transfer?: Transferable[]): void => {
  if (transfer && transfer.length > 0) {
    self.postMessage(message, transfer);
  } else {
    self.postMessage(message);
  }
};

self.onmessage = (message: MessageEvent<CutRequest>) => {
  const request = message.data;

  try {
    const iter = cut({
      source: request.source,
      seed: request.seed,
      targetCount: request.targetCount,
      cutStyle: request.cutStyle,
      pixelRatio: request.pixelRatio,
    });

    let step = iter.next();
    while (!step.done) {
      const emitted = step.value;

      if (emitted.type === 'grid') {
        post({
          type: 'grid',
          cols: emitted.geometry.cols,
          rows: emitted.geometry.rows,
          count: emitted.geometry.count,
          boardW: emitted.geometry.boardW,
          boardH: emitted.geometry.boardH,
          scale: emitted.geometry.scale,
        });
      } else {
        // Bitmaps are transferred, not copied — copying 36 MB of pixels back
        // across the boundary would undo the point of cutting off-thread. The
        // worker's own references are neutered by the transfer, which is why
        // nothing here holds on to them.
        post({ type: 'pieces', pieces: emitted.pieces, done: emitted.done, total: emitted.total }, [
          ...emitted.pieces.map((p) => p.bitmap),
        ]);
      }

      step = iter.next();
    }

    const geometry = step.value;
    const graph = buildNeighbourGraph({
      cols: geometry.cols,
      rows: geometry.rows,
      bounds: geometry.bounds,
      scale: geometry.scale,
    });

    // The graph goes last because it needs every piece's bounds. It is a few KB
    // of plain numbers, so a structured clone is fine here.
    post({ type: 'graph', graph });
    post({ type: 'done' });

    // The decoded source is the single largest allocation in the process and is
    // dead the moment the last piece is cut. Releasing it here is what keeps a
    // 250-piece cut off the edge of an iPhone 11's memory ceiling (§17).
    request.source.close();
  } catch (error) {
    post({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
