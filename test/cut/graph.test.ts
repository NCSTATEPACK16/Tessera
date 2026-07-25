/**
 * The adjacency graph — "the output that actually matters" (§04, step 5).
 *
 * Snap resolution asks a graph neighbour where it should be, never the board.
 * If the graph is asymmetric, an island snapped together one way will refuse to
 * snap the other, and the bug will look like a snap-tolerance problem.
 */

import { describe, expect, it } from 'vitest';
import type { Rect } from '@/core/geom';
import { buildNeighbourGraph, countBoundarySides, pieceIdAt } from '@/cut/graph';
import { BOTTOM, LEFT, RIGHT, TOP } from '@/cut/types';

const COLS = 6;
const ROWS = 4;
const SCALE = 100;

/** A regular set of bounds; the graph's correctness must not depend on jitter. */
function bounds(): Rect[] {
  const out: Rect[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      out[pieceIdAt(COLS, col, row)] = { x: col * SCALE, y: row * SCALE, w: SCALE, h: SCALE };
    }
  }
  return out;
}

const graph = buildNeighbourGraph({ cols: COLS, rows: ROWS, bounds: bounds(), scale: SCALE });

describe('buildNeighbourGraph', () => {
  it('gives every piece exactly four slots', () => {
    expect(graph.length).toBe(COLS * ROWS);
    for (const links of graph) expect(links.length).toBe(4);
  });

  it('nulls the slots that meet the frame', () => {
    const topLeft = graph[pieceIdAt(COLS, 0, 0)]!;
    expect(topLeft[TOP]).toBeNull();
    expect(topLeft[LEFT]).toBeNull();
    expect(topLeft[RIGHT]).not.toBeNull();
    expect(topLeft[BOTTOM]).not.toBeNull();

    const bottomRight = graph[pieceIdAt(COLS, COLS - 1, ROWS - 1)]!;
    expect(bottomRight[BOTTOM]).toBeNull();
    expect(bottomRight[RIGHT]).toBeNull();
  });

  it('is symmetric — if A knows B, B knows A', () => {
    for (let id = 0; id < graph.length; id++) {
      for (const link of graph[id]!) {
        if (!link) continue;
        const back = graph[link.id]!.find((l) => l?.id === id);
        expect(back, `piece ${link.id} should link back to ${id}`).toBeTruthy();
      }
    }
  });

  it('negates offsets across a link — the property snap symmetry rests on', () => {
    for (let id = 0; id < graph.length; id++) {
      for (const link of graph[id]!) {
        if (!link) continue;
        const back = graph[link.id]!.find((l) => l?.id === id)!;
        expect(back.dx).toBeCloseTo(-link.dx, 10);
        expect(back.dy).toBeCloseTo(-link.dy, 10);
      }
    }
  });

  it('expresses offsets in world units', () => {
    const middle = graph[pieceIdAt(COLS, 2, 2)]!;
    // One piece width to the right, in world units where 1 = one piece width.
    expect(middle[RIGHT]!.dx).toBeCloseTo(1, 10);
    expect(middle[RIGHT]!.dy).toBeCloseTo(0, 10);
    expect(middle[BOTTOM]!.dx).toBeCloseTo(0, 10);
    expect(middle[BOTTOM]!.dy).toBeCloseTo(1, 10);
    expect(middle[LEFT]!.dx).toBeCloseTo(-1, 10);
    expect(middle[TOP]!.dy).toBeCloseTo(-1, 10);
  });

  it('points each slot at the correct grid position', () => {
    const id = pieceIdAt(COLS, 3, 2);
    const links = graph[id]!;
    expect(links[TOP]!.id).toBe(pieceIdAt(COLS, 3, 1));
    expect(links[RIGHT]!.id).toBe(pieceIdAt(COLS, 4, 2));
    expect(links[BOTTOM]!.id).toBe(pieceIdAt(COLS, 3, 3));
    expect(links[LEFT]!.id).toBe(pieceIdAt(COLS, 2, 2));
  });

  it('makes the board reachable from any piece — one puzzle, not two', () => {
    const seen = new Set<number>([0]);
    const queue = [0];
    while (queue.length > 0) {
      const id = queue.pop()!;
      for (const link of graph[id]!) {
        if (link && !seen.has(link.id)) {
          seen.add(link.id);
          queue.push(link.id);
        }
      }
    }
    expect(seen.size).toBe(COLS * ROWS);
  });
});

describe('countBoundarySides', () => {
  it('identifies corners, edges, and interior pieces', () => {
    // Corners have two boundary sides, and drive the Corners lens.
    expect(countBoundarySides(COLS, ROWS, 0, 0)).toBe(2);
    expect(countBoundarySides(COLS, ROWS, COLS - 1, ROWS - 1)).toBe(2);
    // Edges have one.
    expect(countBoundarySides(COLS, ROWS, 2, 0)).toBe(1);
    expect(countBoundarySides(COLS, ROWS, 0, 2)).toBe(1);
    // Interior pieces have none.
    expect(countBoundarySides(COLS, ROWS, 2, 2)).toBe(0);
  });

  it('counts the expected number of edge and corner pieces on the board', () => {
    let edges = 0;
    let corners = 0;
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const n = countBoundarySides(COLS, ROWS, col, row);
        if (n > 0) edges++;
        if (n > 1) corners++;
      }
    }
    expect(corners).toBe(4);
    expect(edges).toBe(COLS * ROWS - (COLS - 2) * (ROWS - 2));
  });
});
