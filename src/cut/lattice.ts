/**
 * Step 2 of the cut — jitter the lattice (design doc §04).
 *
 * "This one step is the difference between a puzzle that looks machine-stamped
 * and one that looks cut — with a perfect lattice, every piece is
 * interchangeable at a glance and the search stops being fun."
 */

import type { Point } from '@/core/geom';
import { rngFor } from '@/core/rng';
import type { Grid } from './grid';

/** Maximum interior vertex displacement, as a fraction of piece size. */
export const JITTER_FRACTION = 0.12;

export interface Lattice {
  cols: number;
  rows: number;
  /** (cols+1) × (rows+1) vertices in image space, row-major. */
  vertices: Point[];
}

export function vertexIndex(lattice: Lattice, col: number, row: number): number {
  return row * (lattice.cols + 1) + col;
}

export function vertexAt(lattice: Lattice, col: number, row: number): Point {
  const v = lattice.vertices[vertexIndex(lattice, col, row)];
  if (!v) throw new Error(`lattice: no vertex at ${col},${row}`);
  return v;
}

/**
 * Build the jittered vertex lattice in image space.
 *
 * Border vertices stay pinned so the outer frame is a clean rectangle — the
 * assembled puzzle must be a true rectangle, and edge pieces must have genuinely
 * straight outer sides for the Edges lens to mean anything.
 */
export function buildLattice(grid: Grid, seed: number): Lattice {
  const { cols, rows, cellW, cellH } = grid;
  const vertices: Point[] = new Array((cols + 1) * (rows + 1));

  const maxDx = JITTER_FRACTION * cellW;
  const maxDy = JITTER_FRACTION * cellH;

  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) {
      const i = row * (cols + 1) + col;
      const baseX = col * cellW;
      const baseY = row * cellH;

      const onBorder = col === 0 || row === 0 || col === cols || row === rows;
      if (onBorder) {
        vertices[i] = { x: baseX, y: baseY };
        continue;
      }

      // Stream identity is the vertex's grid position, not its array index, so
      // the jitter of a given vertex is stable even if the lattice is ever
      // walked in a different order.
      const rng = rngFor(seed, 'lattice', `${col},${row}`);
      vertices[i] = {
        x: baseX + rng.jitter(maxDx),
        y: baseY + rng.jitter(maxDy),
      };
    }
  }

  return { cols, rows, vertices: vertices as Point[] };
}
