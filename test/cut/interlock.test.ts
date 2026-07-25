/**
 * Interlock — the property the whole cut rests on.
 *
 * "Each interior edge between two vertices is generated once and shared by the
 * two pieces that meet on it — one gets it as drawn, the other as its exact
 * reverse. This is what guarantees pieces physically interlock rather than
 * merely appearing to." (§04)
 *
 * If this file passes, a tab is exactly its neighbour's socket. If it fails,
 * every piece has a hairline gap or overlap that no amount of snap tuning fixes.
 */

import { describe, expect, it } from 'vitest';
import { samplePath, reverseCubicPath } from '@/core/geom';
import { chooseGrid } from '@/cut/grid';
import { buildLattice, JITTER_FRACTION, vertexAt } from '@/cut/lattice';
import { EdgeRegistry, horizontalEdgeId, verticalEdgeId } from '@/cut/edges';
import { classicEdgeStyle } from '@/cut/edge';
import { buildPiecePath, pieceSides } from '@/cut/piece-path';

const SEED = 20260725;

function fixture(targetCount = 100) {
  const grid = chooseGrid({ imageWidth: 3000, imageHeight: 2000, targetCount });
  const lattice = buildLattice(grid, SEED);
  const edges = new EdgeRegistry(lattice, SEED, classicEdgeStyle);
  return { grid, lattice, edges };
}

describe('edge reversal', () => {
  it('reverses a path exactly — sampled points coincide', () => {
    const { edges, grid } = fixture();
    const id = horizontalEdgeId(Math.floor(grid.cols / 2), Math.floor(grid.rows / 2));

    const forward = edges.directed(id, true);
    const backward = edges.directed(id, false);

    const a = samplePath(forward, 24);
    const b = samplePath(backward, 24).reverse();

    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.x).toBeCloseTo(b[i]!.x, 10);
      expect(a[i]!.y).toBeCloseTo(b[i]!.y, 10);
    }
  });

  it('round-trips: reversing twice returns the original', () => {
    const { edges, grid } = fixture();
    const id = verticalEdgeId(Math.floor(grid.cols / 2), Math.floor(grid.rows / 2));
    const original = edges.canonical(id);
    const round = reverseCubicPath(reverseCubicPath(original));
    expect(round).toEqual(original);
  });
});

describe('shared edges', () => {
  it('gives both adjacent pieces the identical curve', () => {
    const { grid, edges } = fixture();

    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        // Right neighbour shares this piece's right edge as its left edge.
        if (col < grid.cols - 1) {
          const mine = pieceSides(col, row).right;
          const theirs = pieceSides(col + 1, row).left;
          expect(mine).toBe(theirs);
          expect(edges.canonical(mine)).toEqual(edges.canonical(theirs));
        }
        // Lower neighbour shares this piece's bottom edge as its top edge.
        if (row < grid.rows - 1) {
          const mine = pieceSides(col, row).bottom;
          const theirs = pieceSides(col, row + 1).top;
          expect(mine).toBe(theirs);
          expect(edges.canonical(mine)).toEqual(edges.canonical(theirs));
        }
      }
    }
  });

  it('is unaffected by the order edges are requested in', () => {
    const { lattice } = fixture();

    const forwards = new EdgeRegistry(lattice, SEED, classicEdgeStyle);
    const backwards = new EdgeRegistry(lattice, SEED, classicEdgeStyle);

    const ids = [
      horizontalEdgeId(2, 3),
      verticalEdgeId(4, 1),
      horizontalEdgeId(7, 5),
      verticalEdgeId(1, 6),
    ];

    const a = ids.map((id) => forwards.canonical(id));
    const b = [...ids].reverse().map((id) => backwards.canonical(id));
    b.reverse();

    expect(a).toEqual(b);
  });
});

describe('piece outlines', () => {
  it('closes — the last point returns to the first', () => {
    const { grid, edges } = fixture();
    for (const [col, row] of [
      [0, 0],
      [3, 2],
      [grid.cols - 1, grid.rows - 1],
    ] as const) {
      const path = buildPiecePath(edges, col, row);
      const pts = samplePath(path, 8);
      const first = pts[0]!;
      const last = pts[pts.length - 1]!;
      expect(last.x).toBeCloseTo(first.x, 8);
      expect(last.y).toBeCloseTo(first.y, 8);
    }
  });

  it('shares its boundary exactly with each neighbour', () => {
    const { grid, edges } = fixture();
    const col = 4;
    const row = 3;

    const mine = samplePath(edges.directed(pieceSides(col, row).right, true), 32);
    // The right neighbour walks that same edge as its left side, reversed.
    const theirs = samplePath(edges.directed(pieceSides(col + 1, row).left, false), 32).reverse();

    for (let i = 0; i < mine.length; i++) {
      expect(mine[i]!.x).toBeCloseTo(theirs[i]!.x, 10);
      expect(mine[i]!.y).toBeCloseTo(theirs[i]!.y, 10);
    }
  });

  it('starts every piece at its top-left lattice vertex', () => {
    const { grid, lattice, edges } = fixture();
    for (let row = 0; row < grid.rows; row += 3) {
      for (let col = 0; col < grid.cols; col += 3) {
        const path = buildPiecePath(edges, col, row);
        const tl = vertexAt(lattice, col, row);
        expect(path.start.x).toBeCloseTo(tl.x, 10);
        expect(path.start.y).toBeCloseTo(tl.y, 10);
      }
    }
  });
});

describe('the frame', () => {
  it('leaves border vertices unjittered, so the outer frame is a clean rectangle', () => {
    const { grid, lattice } = fixture();

    for (let col = 0; col <= grid.cols; col++) {
      expect(vertexAt(lattice, col, 0).y).toBe(0);
      expect(vertexAt(lattice, col, grid.rows).y).toBeCloseTo(2000, 10);
    }
    for (let row = 0; row <= grid.rows; row++) {
      expect(vertexAt(lattice, 0, row).x).toBe(0);
      expect(vertexAt(lattice, grid.cols, row).x).toBeCloseTo(3000, 10);
    }
  });

  it('draws boundary edges perfectly straight', () => {
    const { grid, edges } = fixture();

    const top = samplePath(edges.canonical(horizontalEdgeId(3, 0)), 16);
    for (const p of top) expect(p.y).toBeCloseTo(0, 10);

    const left = samplePath(edges.canonical(verticalEdgeId(0, 2)), 16);
    for (const p of left) expect(p.x).toBeCloseTo(0, 10);

    const bottom = samplePath(edges.canonical(horizontalEdgeId(3, grid.rows)), 16);
    for (const p of bottom) expect(p.y).toBeCloseTo(2000, 10);

    const right = samplePath(edges.canonical(verticalEdgeId(grid.cols, 2)), 16);
    for (const p of right) expect(p.x).toBeCloseTo(3000, 10);
  });
});

describe('lattice jitter', () => {
  it('displaces interior vertices, but never past the specified fraction', () => {
    const { grid, lattice } = fixture();

    let moved = 0;
    for (let row = 1; row < grid.rows; row++) {
      for (let col = 1; col < grid.cols; col++) {
        const v = vertexAt(lattice, col, row);
        const dx = v.x - col * grid.cellW;
        const dy = v.y - row * grid.cellH;

        expect(Math.abs(dx)).toBeLessThanOrEqual(JITTER_FRACTION * grid.cellW + 1e-9);
        expect(Math.abs(dy)).toBeLessThanOrEqual(JITTER_FRACTION * grid.cellH + 1e-9);

        if (Math.hypot(dx, dy) > grid.cellW * 0.005) moved++;
      }
    }

    // The whole point of the step: pieces must not be interchangeable at a glance.
    const interior = (grid.cols - 1) * (grid.rows - 1);
    expect(moved / interior).toBeGreaterThan(0.9);
  });
});

describe('determinism', () => {
  it('produces byte-identical geometry for the same seed', () => {
    const a = fixture();
    const b = fixture();
    expect(buildPiecePath(a.edges, 5, 4)).toEqual(buildPiecePath(b.edges, 5, 4));
    expect(a.lattice.vertices).toEqual(b.lattice.vertices);
  });

  it('produces different geometry for a different seed', () => {
    const grid = chooseGrid({ imageWidth: 3000, imageHeight: 2000, targetCount: 100 });

    const one = new EdgeRegistry(buildLattice(grid, 1), 1, classicEdgeStyle);
    const two = new EdgeRegistry(buildLattice(grid, 2), 2, classicEdgeStyle);

    expect(buildPiecePath(one, 5, 4)).not.toEqual(buildPiecePath(two, 5, 4));
  });
});

describe('classic tab shape', () => {
  it('protrudes roughly the specified fraction of edge length, on one side', () => {
    const { edges, grid } = fixture();

    let checked = 0;
    for (let row = 1; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        const path = edges.canonical(horizontalEdgeId(col, row));
        const pts = samplePath(path, 24);

        const a = pts[0]!;
        const b = pts[pts.length - 1]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y);

        // Signed perpendicular offset of each sample from the chord.
        const nx = -(b.y - a.y) / len;
        const ny = (b.x - a.x) / len;
        let maxPositive = 0;
        let maxNegative = 0;
        for (const p of pts) {
          const d = (p.x - a.x) * nx + (p.y - a.y) * ny;
          if (d > maxPositive) maxPositive = d;
          if (d < maxNegative) maxNegative = d;
        }

        const protrusion = Math.max(maxPositive, -maxNegative) / len;
        // Nominal 0.22 with ±10% jitter, plus Bézier overshoot from the flare
        // control points that shape the undercut.
        expect(protrusion).toBeGreaterThan(0.15);
        expect(protrusion).toBeLessThan(0.34);

        // The knob goes one way only; the other side shows just the shoulder dip.
        const opposite = Math.min(maxPositive, -maxNegative) / len;
        expect(opposite).toBeLessThan(0.05);

        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('mixes polarity across the board, so the cut does not read as striped', () => {
    const { edges, grid } = fixture();

    let up = 0;
    let down = 0;
    for (let row = 1; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        const pts = samplePath(edges.canonical(horizontalEdgeId(col, row)), 12);
        const a = pts[0]!;
        const b = pts[pts.length - 1]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const nx = -(b.y - a.y) / len;
        const ny = (b.x - a.x) / len;

        let extreme = 0;
        for (const p of pts) {
          const d = (p.x - a.x) * nx + (p.y - a.y) * ny;
          if (Math.abs(d) > Math.abs(extreme)) extreme = d;
        }
        if (extreme > 0) up++;
        else down++;
      }
    }

    const ratio = up / (up + down);
    expect(ratio).toBeGreaterThan(0.35);
    expect(ratio).toBeLessThan(0.65);
  });
});
