/**
 * Step 5 of the cut — emit the graph (design doc §04).
 *
 * The adjacency graph is the cut's real output. Every neighbour link carries
 * the exact offset between the two pieces' origins when correctly placed, in
 * world units, so snap resolution is a graph lookup rather than a search.
 */

import type { Rect } from '@/core/geom';
import type { NeighbourLink } from './types';
import { BOTTOM, LEFT, RIGHT, TOP } from './types';

export interface GraphInput {
  cols: number;
  rows: number;
  /** Bitmap bounds in image space, indexed by piece id. */
  bounds: Rect[];
  /** Image pixels per world unit. */
  scale: number;
}

export function pieceIdAt(cols: number, col: number, row: number): number {
  return row * cols + col;
}

/**
 * Build every piece's neighbour links.
 *
 * Offsets are derived from the bitmap bounds rather than the cell grid, because
 * the bitmap origin is what the renderer positions and therefore what snap must
 * agree with. Deriving both from one source is what keeps the graph symmetric.
 */
export function buildNeighbourGraph({
  cols,
  rows,
  bounds,
  scale,
}: GraphInput): (NeighbourLink | null)[][] {
  const out: (NeighbourLink | null)[][] = [];

  const linkTo = (fromId: number, toId: number): NeighbourLink => {
    const a = bounds[fromId];
    const b = bounds[toId];
    if (!a || !b) throw new Error(`buildNeighbourGraph: missing bounds for ${fromId}/${toId}`);
    return {
      id: toId,
      dx: (b.x - a.x) / scale,
      dy: (b.y - a.y) / scale,
    };
  };

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const id = pieceIdAt(cols, col, row);
      const links: (NeighbourLink | null)[] = [null, null, null, null];

      if (row > 0) links[TOP] = linkTo(id, pieceIdAt(cols, col, row - 1));
      if (col < cols - 1) links[RIGHT] = linkTo(id, pieceIdAt(cols, col + 1, row));
      if (row < rows - 1) links[BOTTOM] = linkTo(id, pieceIdAt(cols, col, row + 1));
      if (col > 0) links[LEFT] = linkTo(id, pieceIdAt(cols, col - 1, row));

      out[id] = links;
    }
  }

  return out;
}

export function countBoundarySides(cols: number, rows: number, col: number, row: number): number {
  let n = 0;
  if (row === 0) n++;
  if (row === rows - 1) n++;
  if (col === 0) n++;
  if (col === cols - 1) n++;
  return n;
}
