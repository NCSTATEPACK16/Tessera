/**
 * The cutter — turns a photo into pieces plus a graph (design doc §04).
 *
 * Written as a generator so it can emit pieces progressively. "Show pieces
 * materialising onto the mat as they arrive from the worker; it turns loading
 * into the first moment of delight."
 *
 * Runs identically on the worker thread and the main thread. Production always
 * uses the worker — §03 makes that non-negotiable — but keeping the orchestrator
 * thread-agnostic means tests and the dev harness can drive it directly.
 */

import type { Rect } from '@/core/geom';
import { buildPiecePath } from './piece-path';
import { buildNeighbourGraph, countBoundarySides, pieceIdAt } from './graph';
import { chooseGrid } from './grid';
import { buildLattice } from './lattice';
import { EdgeRegistry } from './edges';
import { resolveCutStyle } from './edge';
import { rasterisePiece } from './raster';
import type { CutGeometry, CutPiece } from './types';

/** How many pieces to batch into one progress emission. */
export const EMIT_BATCH = 16;

export interface CutOptions {
  source: ImageBitmap;
  seed: number;
  targetCount: number;
  cutStyle: string;
  pixelRatio: number;
}

export type CutEvent =
  | { type: 'grid'; geometry: CutGeometry }
  | { type: 'pieces'; pieces: CutPiece[]; done: number; total: number };

/**
 * Cut the image, yielding the grid first and then batches of finished pieces.
 *
 * Order matters for perceived speed: the grid comes out immediately so the
 * setup screen can show the real piece count before any pixel work starts.
 */
export function* cut(options: CutOptions): Generator<CutEvent, CutGeometry, void> {
  const { source, seed, targetCount, cutStyle, pixelRatio } = options;

  const grid = chooseGrid({
    imageWidth: source.width,
    imageHeight: source.height,
    targetCount,
  });

  // World unit = one piece width, applied uniformly to both axes so the board
  // keeps the photo's aspect ratio.
  const scale = grid.cellW;
  const geometry: CutGeometry = {
    cols: grid.cols,
    rows: grid.rows,
    count: grid.count,
    scale,
    boardW: source.width / scale,
    boardH: source.height / scale,
    bounds: [],
  };

  yield { type: 'grid', geometry };

  const lattice = buildLattice(grid, seed);
  const edges = new EdgeRegistry(lattice, seed, resolveCutStyle(cutStyle));

  const total = grid.count;
  const bounds: Rect[] = new Array(total);
  const partial: Omit<CutPiece, 'neighbours'>[] = new Array(total);

  let batch: number[] = [];
  let done = 0;

  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const id = pieceIdAt(grid.cols, col, row);

      const path = buildPiecePath(edges, col, row);
      const raster = rasterisePiece(source, path, pixelRatio);

      bounds[id] = raster.bounds;

      const boundarySides = countBoundarySides(grid.cols, grid.rows, col, row);
      partial[id] = {
        id,
        col,
        row,
        targetX: raster.bounds.x / scale,
        targetY: raster.bounds.y / scale,
        worldW: raster.bounds.w / scale,
        worldH: raster.bounds.h / scale,
        isEdge: boundarySides > 0,
        isCorner: boundarySides > 1,
        path: raster.localPath,
        bitmap: raster.bitmap,
        meanColor: raster.meanColor,
        colorVariance: raster.colorVariance,
      };

      batch.push(id);
      done++;

      // The graph needs every piece's bounds, so links are attached at the end.
      // Emitting a piece before its links exist is fine: nothing can be dragged
      // until the cut completes, and the mat only needs bitmaps to draw.
      if (batch.length >= EMIT_BATCH || done === total) {
        yield {
          type: 'pieces',
          pieces: batch.map((pieceId) => ({
            ...(partial[pieceId] as Omit<CutPiece, 'neighbours'>),
            neighbours: [null, null, null, null],
          })),
          done,
          total,
        };
        batch = [];
      }
    }
  }

  geometry.bounds = bounds as Rect[];
  return geometry;
}

/**
 * Run the whole cut and return the finished result, graph attached.
 *
 * The convenience path, for tests and for callers that have no use for progress.
 */
export function cutAll(options: CutOptions): {
  geometry: CutGeometry;
  pieces: CutPiece[];
} {
  const pieces: CutPiece[] = [];
  const iter = cut(options);

  let step = iter.next();
  while (!step.done) {
    if (step.value.type === 'pieces') pieces.push(...step.value.pieces);
    step = iter.next();
  }
  const geometry = step.value;

  const graph = buildNeighbourGraph({
    cols: geometry.cols,
    rows: geometry.rows,
    bounds: geometry.bounds,
    scale: geometry.scale,
  });

  for (const piece of pieces) {
    piece.neighbours = graph[piece.id] ?? [null, null, null, null];
  }
  pieces.sort((a, b) => a.id - b.id);

  return { geometry, pieces };
}
