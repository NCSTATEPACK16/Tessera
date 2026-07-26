/**
 * Assemble a piece outline from its four edges.
 *
 * Each side is fetched from the registry in the direction this piece walks it —
 * clockwise from the top-left corner. Two of the four are traversed against
 * their canonical direction and come back exactly reversed, which is precisely
 * how a piece's tab becomes its neighbour's socket.
 */

import type { CubicPath } from '@/core/geom';
import { joinPaths } from '@/core/geom';
import type { EdgeRegistry } from './edges';
import { horizontalEdgeId, verticalEdgeId } from './edges';

export interface PieceSides {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

/** The four canonical edge ids bounding the cell at (col, row). */
export function pieceSides(col: number, row: number): PieceSides {
  return {
    top: horizontalEdgeId(col, row),
    right: verticalEdgeId(col + 1, row),
    bottom: horizontalEdgeId(col, row + 1),
    left: verticalEdgeId(col, row),
  };
}

/**
 * Build the closed outline of one piece, in image space.
 *
 * Walk order is TL → TR → BR → BL → TL. Top and right run with their canonical
 * direction; bottom and left run against it.
 */
export function buildPiecePath(edges: EdgeRegistry, col: number, row: number): CubicPath {
  const sides = pieceSides(col, row);
  return joinPaths([
    edges.directed(sides.top, true),
    edges.directed(sides.right, true),
    edges.directed(sides.bottom, false),
    edges.directed(sides.left, false),
  ]);
}
