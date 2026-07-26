/**
 * The edge registry — generates each interior edge exactly once, from a stream
 * derived purely from `(seed, edgeId)`.
 *
 * Edge identity is canonical and direction-free: the edge between two cells
 * resolves to the same id no matter which of the two pieces asks for it. That,
 * plus per-edge PRNG streams, is what makes interlock a property of the data
 * rather than something the piece loop has to be careful about.
 */

import type { CubicPath } from '@/core/geom';
import { reverseCubicPath } from '@/core/geom';
import { rngFor } from '@/core/rng';
import type { EdgeStyle, Polarity } from './edge';
import { straightEdge } from './edge';
import type { Lattice } from './lattice';
import { vertexAt } from './lattice';

export type EdgeId = string;

/** Canonical id of the horizontal edge from vertex (col,row) to (col+1,row). */
export function horizontalEdgeId(col: number, row: number): EdgeId {
  return `h:${col},${row}`;
}

/** Canonical id of the vertical edge from vertex (col,row) to (col,row+1). */
export function verticalEdgeId(col: number, row: number): EdgeId {
  return `v:${col},${row}`;
}

export class EdgeRegistry {
  private readonly cache = new Map<EdgeId, CubicPath>();

  constructor(
    private readonly lattice: Lattice,
    private readonly seed: number,
    private readonly style: EdgeStyle,
  ) {}

  /**
   * The edge in its canonical direction: +x for horizontal, +y for vertical.
   *
   * Memoised, but memoisation is an optimisation only — the generator is a pure
   * function of `(seed, edgeId)`, so clearing the cache changes nothing.
   */
  canonical(id: EdgeId): CubicPath {
    const cached = this.cache.get(id);
    if (cached) return cached;

    const path = this.generate(id);
    this.cache.set(id, path);
    return path;
  }

  /** The edge as traversed in the given direction. */
  directed(id: EdgeId, forward: boolean): CubicPath {
    const path = this.canonical(id);
    return forward ? path : reverseCubicPath(path);
  }

  private generate(id: EdgeId): CubicPath {
    const parsed = parseEdgeId(id);
    const { cols, rows } = this.lattice;

    const a =
      parsed.axis === 'h'
        ? vertexAt(this.lattice, parsed.col, parsed.row)
        : vertexAt(this.lattice, parsed.col, parsed.row);
    const b =
      parsed.axis === 'h'
        ? vertexAt(this.lattice, parsed.col + 1, parsed.row)
        : vertexAt(this.lattice, parsed.col, parsed.row + 1);

    const isBoundary =
      parsed.axis === 'h'
        ? parsed.row === 0 || parsed.row === rows
        : parsed.col === 0 || parsed.col === cols;

    if (isBoundary) return straightEdge(a, b);

    const rng = rngFor(this.seed, 'edge', id);
    // Drawn first so polarity is stable regardless of what the style does with
    // its stream afterwards.
    const polarity: Polarity = rng.bool() ? 1 : -1;
    return this.style.edgePath(a, b, polarity, rng);
  }
}

interface ParsedEdgeId {
  axis: 'h' | 'v';
  col: number;
  row: number;
}

export function parseEdgeId(id: EdgeId): ParsedEdgeId {
  const match = /^([hv]):(\d+),(\d+)$/.exec(id);
  if (!match) throw new Error(`malformed edge id "${id}"`);
  return {
    axis: match[1] as 'h' | 'v',
    col: Number(match[2]),
    row: Number(match[3]),
  };
}
