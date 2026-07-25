/**
 * Main-thread front door to the cutter worker.
 *
 * Hands back the grid as soon as it is known — so the real piece count can be
 * shown before any pixel work — then streams pieces as they arrive.
 */

import type { CutGeometry, CutMessage, CutPiece, NeighbourLink } from './types';

export interface CutHandlers {
  onGrid?: (grid: { cols: number; rows: number; count: number; boardW: number; boardH: number }) => void;
  onPieces?: (pieces: CutPiece[], done: number, total: number) => void;
  onError?: (message: string) => void;
}

export interface CutClientOptions {
  source: ImageBitmap;
  seed: number;
  targetCount: number;
  cutStyle?: string;
  handlers?: CutHandlers;
}

export interface CutClientResult {
  geometry: Pick<CutGeometry, 'cols' | 'rows' | 'count' | 'boardW' | 'boardH'>;
  pieces: CutPiece[];
  /** Milliseconds from post to done. §04 budgets under 1.2s on an iPhone 12. */
  elapsedMs: number;
}

/**
 * Piece bitmaps are rasterised once at this ratio and never re-rasterised while
 * zooming (§03). Capped at 2 because beyond that the memory cost is real and
 * the visible gain is not.
 */
export function cutPixelRatio(): number {
  return Math.min(globalThis.devicePixelRatio || 1, 2);
}

export function cutInWorker(options: CutClientOptions): Promise<CutClientResult> {
  const { source, seed, targetCount, cutStyle = 'classic', handlers = {} } = options;

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./cutter.worker.ts', import.meta.url), { type: 'module' });
    const startedAt = performance.now();

    const pieces: CutPiece[] = [];
    let grid: CutClientResult['geometry'] | null = null;
    let graph: (NeighbourLink | null)[][] | null = null;

    const finish = (fn: () => void): void => {
      worker.terminate();
      fn();
    };

    worker.onmessage = (event: MessageEvent<CutMessage>) => {
      const message = event.data;

      switch (message.type) {
        case 'grid':
          grid = {
            cols: message.cols,
            rows: message.rows,
            count: message.count,
            boardW: message.boardW,
            boardH: message.boardH,
          };
          handlers.onGrid?.(grid);
          break;

        case 'pieces':
          pieces.push(...message.pieces);
          handlers.onPieces?.(message.pieces, message.done, message.total);
          break;

        case 'graph':
          graph = message.graph;
          break;

        case 'done': {
          if (!grid) {
            finish(() => reject(new Error('cutter finished without emitting a grid')));
            return;
          }
          if (graph) {
            for (const piece of pieces) {
              piece.neighbours = graph[piece.id] ?? [null, null, null, null];
            }
          }
          pieces.sort((a, b) => a.id - b.id);
          const result: CutClientResult = {
            geometry: grid,
            pieces,
            elapsedMs: performance.now() - startedAt,
          };
          finish(() => resolve(result));
          break;
        }

        case 'error':
          handlers.onError?.(message.message);
          finish(() => reject(new Error(message.message)));
          break;
      }
    };

    worker.onerror = (event) => {
      finish(() => reject(new Error(event.message || 'cutter worker failed')));
    };

    worker.postMessage(
      { source, seed, targetCount, cutStyle, pixelRatio: cutPixelRatio() },
      [source],
    );
  });
}
