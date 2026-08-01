/**
 * Board state — clusters, union-find, and cluster 0 (§05).
 *
 * The invariant every test here defends: **merging with cluster 0 is what
 * "placed" means**, and completion is `cluster0.pieceIds.length === N` and
 * nothing else. No parallel `placed` flag, no second source of truth to drift.
 */

import { describe, expect, it } from 'vitest';
import { BOARD_CLUSTER, createBoard } from '@/board/board';
import type { BoardInput } from '@/board/board';
import { buildNeighbourGraph, pieceIdAt } from '@/cut/graph';
import type { Rect } from '@/core/geom';

const COLS = 3;
const ROWS = 2;
const SCALE = 100;

/** A regular 3×2 board: six unit pieces, correct adjacency, no jitter. */
function input(): BoardInput[] {
  const bounds: Rect[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      bounds[pieceIdAt(COLS, col, row)] = { x: col * SCALE, y: row * SCALE, w: SCALE, h: SCALE };
    }
  }
  const graph = buildNeighbourGraph({ cols: COLS, rows: ROWS, bounds, scale: SCALE });

  return bounds.map((b, id) => ({
    id,
    targetX: b.x / SCALE,
    targetY: b.y / SCALE,
    w: 1,
    h: 1,
    neighbours: graph[id]!,
  }));
}

const id = (col: number, row: number): number => pieceIdAt(COLS, col, row);

describe('createBoard', () => {
  it('gives every piece its own cluster of one', () => {
    const board = createBoard(input());
    expect(board.pieceCount).toBe(COLS * ROWS);
    const clusterIds = new Set(board.pieces.map((p) => p.clusterId));
    expect(clusterIds.size).toBe(COLS * ROWS);
    for (const cluster of board.clusters.values()) {
      if (cluster.id !== BOARD_CLUSTER) expect(cluster.pieceIds).toHaveLength(1);
    }
  });

  it('starts with an empty, anchored cluster 0 — the board is a cluster like any other', () => {
    const board = createBoard(input());
    const zero = board.cluster(BOARD_CLUSTER);
    expect(zero.pieceIds).toHaveLength(0);
    expect(zero.anchored).toBe(true);
    expect(zero.kind).toBe('board');
    expect(board.placedCount).toBe(0);
    expect(board.isComplete).toBe(false);
  });

  it('never puts a piece in cluster 0 by accident', () => {
    const board = createBoard(input());
    for (const piece of board.pieces) expect(piece.clusterId).not.toBe(BOARD_CLUSTER);
  });
});

describe('cluster transforms', () => {
  it('places a lone piece exactly at its cluster origin', () => {
    const board = createBoard(input());
    board.moveCluster(board.clusterIdOf(3), 4, 5);
    expect(board.worldOf(3)).toEqual({ x: 4, y: 5 });
  });

  it('moves every member of a cluster rigidly', () => {
    const board = createBoard(input());
    const a = id(0, 0);
    const b = id(1, 0);
    board.moveCluster(board.clusterIdOf(a), 0, 0);
    board.moveCluster(board.clusterIdOf(b), 1, 0);
    board.merge(board.clusterIdOf(a), board.clusterIdOf(b));

    const before = board.worldOf(b);
    board.moveCluster(board.clusterIdOf(a), 10, 20);
    const after = board.worldOf(b);

    expect(after.x).toBeCloseTo(before.x + 10, 10);
    expect(after.y).toBeCloseTo(before.y + 20, 10);
  });

  it('rotates about a pivot without moving the pivot', () => {
    // Rotating an island about its origin would swing it off under the finger.
    const board = createBoard(input());
    const cluster = board.clusterIdOf(0);
    board.moveCluster(cluster, 3, 3);

    // The piece is 1×1 at (3,3), so its centre is the pivot.
    const pivot = { x: 3.5, y: 3.5 };
    board.rotateClusterAbout(cluster, pivot, Math.PI / 2);

    const centre = board.centreOf(0);
    expect(centre.x).toBeCloseTo(pivot.x, 10);
    expect(centre.y).toBeCloseTo(pivot.y, 10);
    expect(board.cluster(cluster).rot).toBeCloseTo(Math.PI / 2, 10);
  });

  it('agrees with worldOf about where a piece is when nothing is rotated', () => {
    // Two accessors exist because a rotated cluster turns about its origin while
    // the renderer turns each bitmap about its own centre. Conflating them puts
    // pieces half a piece-width from where they are drawn, at rotation only.
    const board = createBoard(input());
    board.moveCluster(board.clusterIdOf(4), 2, 6);
    const origin = board.worldOf(4);
    const centre = board.centreOf(4);
    expect(centre.x).toBeCloseTo(origin.x + 0.5, 10);
    expect(centre.y).toBeCloseTo(origin.y + 0.5, 10);
  });

  it('carries rotation into member world positions', () => {
    const board = createBoard(input());
    const a = id(0, 0);
    const b = id(1, 0);
    board.moveCluster(board.clusterIdOf(a), 0, 0);
    board.moveCluster(board.clusterIdOf(b), 1, 0);
    board.merge(board.clusterIdOf(a), board.clusterIdOf(b));

    // b sits one unit right of a. A quarter turn puts it one unit below.
    board.rotateClusterAbout(board.clusterIdOf(a), board.worldOf(a), Math.PI / 2);
    const world = board.worldOf(b);
    expect(world.x).toBeCloseTo(0, 10);
    expect(world.y).toBeCloseTo(1, 10);
  });
});

describe('merge', () => {
  it('absorbs the smaller cluster into the larger', () => {
    const board = createBoard(input());
    const a = board.clusterIdOf(id(0, 0));
    const b = board.clusterIdOf(id(1, 0));
    const c = board.clusterIdOf(id(2, 0));

    const two = board.merge(a, b);
    const three = board.merge(c, two);

    expect(three).toBe(two);
    expect(board.cluster(three).pieceIds).toHaveLength(3);
    expect(board.clusters.has(c)).toBe(false);
  });

  it('lets cluster 0 survive even when it is the smaller side', () => {
    // The board is the only anchored frame. If an island ever absorbed it, the
    // whole board would move under the player's hand.
    const board = createBoard(input());
    const a = board.clusterIdOf(id(0, 0));
    const b = board.clusterIdOf(id(1, 0));
    const island = board.merge(a, b);

    const survivor = board.merge(island, BOARD_CLUSTER);

    expect(survivor).toBe(BOARD_CLUSTER);
    expect(board.cluster(BOARD_CLUSTER).pieceIds).toHaveLength(2);
    expect(board.cluster(BOARD_CLUSTER).anchored).toBe(true);
  });

  it('breaks ties toward the lower id, so a replay merges identically', () => {
    const board = createBoard(input());
    const a = board.clusterIdOf(id(0, 0));
    const b = board.clusterIdOf(id(1, 0));
    expect(board.merge(b, a)).toBe(Math.min(a, b));
  });

  it('preserves the world position of everything it absorbs', () => {
    const board = createBoard(input());
    const a = board.clusterIdOf(id(0, 0));
    const b = board.clusterIdOf(id(1, 0));
    board.moveCluster(a, 2, 2);
    board.moveCluster(b, 7.25, -1.5);

    const beforeA = board.worldOf(id(0, 0));
    const beforeB = board.worldOf(id(1, 0));
    board.merge(a, b);

    expect(board.worldOf(id(0, 0))).toEqual(beforeA);
    expect(board.worldOf(id(1, 0)).x).toBeCloseTo(beforeB.x, 10);
    expect(board.worldOf(id(1, 0)).y).toBeCloseTo(beforeB.y, 10);
  });

  it('preserves world position when absorbing into a rotated cluster', () => {
    const board = createBoard(input());
    const a = board.clusterIdOf(id(0, 0));
    const b = board.clusterIdOf(id(1, 0));
    const c = board.clusterIdOf(id(2, 0));
    board.merge(a, b);
    board.rotateClusterAbout(a, { x: 0.5, y: 0.5 }, 0.9);
    board.moveCluster(c, 6, 6);

    const before = board.worldOf(id(2, 0));
    board.merge(a, c);
    const after = board.worldOf(id(2, 0));

    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it('is a no-op when both sides are already the same cluster', () => {
    const board = createBoard(input());
    const a = board.clusterIdOf(id(0, 0));
    expect(board.merge(a, a)).toBe(a);
    expect(board.cluster(a).pieceIds).toHaveLength(1);
  });
});

describe('placement', () => {
  it('counts placed pieces as cluster 0 membership and nothing else', () => {
    const board = createBoard(input());
    const a = board.clusterIdOf(id(0, 0));
    board.moveCluster(a, 0, 0);
    board.merge(a, BOARD_CLUSTER);

    expect(board.placedCount).toBe(1);
    expect(board.isPlaced(id(0, 0))).toBe(true);
    expect(board.isPlaced(id(1, 0))).toBe(false);
  });

  it('snaps a piece onto its exact target when it joins the board', () => {
    // The static layer bakes placed pieces. A piece left a hundredth of a unit
    // off its slot bakes that error in permanently.
    const board = createBoard(input());
    const piece = id(2, 1);
    const cluster = board.clusterIdOf(piece);
    board.moveCluster(cluster, 2.004, 0.997);
    board.merge(cluster, BOARD_CLUSTER);

    const world = board.worldOf(piece);
    expect(world.x).toBe(2);
    expect(world.y).toBe(1);
  });

  it('is complete only when every piece is in cluster 0', () => {
    const board = createBoard(input());
    for (const piece of [...board.pieces]) {
      expect(board.isComplete).toBe(false);
      board.merge(board.clusterIdOf(piece.id), BOARD_CLUSTER);
    }
    expect(board.placedCount).toBe(COLS * ROWS);
    expect(board.isComplete).toBe(true);
  });

  it('leaves no orphan clusters behind once complete', () => {
    const board = createBoard(input());
    for (const piece of [...board.pieces]) {
      board.merge(board.clusterIdOf(piece.id), BOARD_CLUSTER);
    }
    expect([...board.clusters.keys()]).toEqual([BOARD_CLUSTER]);
  });
});

describe('candidateSockets', () => {
  it('names placed neighbours of a held cluster, and nothing else placed', () => {
    // (0,0) and (0,1) are placed. (1,0) is a graph neighbour of (0,0) only —
    // X-Ray's candidate socket is the piece a drop would actually connect to.
    const board = createBoard(input());
    board.merge(board.clusterIdOf(id(0, 0)), BOARD_CLUSTER);
    board.merge(board.clusterIdOf(id(0, 1)), BOARD_CLUSTER);

    const held = board.clusterIdOf(id(1, 0));
    const sockets = board.candidateSockets(held);

    expect(sockets).toEqual(new Set([id(0, 0)]));
  });

  it('is empty when the held cluster borders no placed piece', () => {
    const board = createBoard(input());
    const held = board.clusterIdOf(id(2, 1));
    expect(board.candidateSockets(held)).toEqual(new Set());
  });

  it('gathers a socket per member when the held cluster is an island', () => {
    const board = createBoard(input());
    board.merge(board.clusterIdOf(id(0, 0)), BOARD_CLUSTER);
    board.merge(board.clusterIdOf(id(1, 1)), BOARD_CLUSTER);

    // (1,0) neighbours placed (0,0); (2,1) neighbours placed (1,1). Neither
    // neighbours the other, so merging them into one island still surfaces
    // both sockets.
    const island = board.merge(board.clusterIdOf(id(1, 0)), board.clusterIdOf(id(2, 1)));

    expect(board.candidateSockets(island)).toEqual(new Set([id(0, 0), id(1, 1)]));
  });
});
