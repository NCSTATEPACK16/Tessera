/**
 * Snap resolution (§05).
 *
 * "Snapping never asks 'am I near my correct absolute position.' It asks 'am I
 * near where a graph-neighbour says I should be.'" The test that proves the
 * codebase actually believes that is `island to island` below: two loose
 * clusters snapping to each other while cluster 0 is still empty, through the
 * same code path that places a piece on the board.
 *
 * The other load-bearing one is `leaves a missed drop exactly where it landed`.
 * Bounce-back is the single most infuriating pattern in this category, and the
 * cheapest way to reintroduce it is a well-meaning "return to origin" fallback.
 */

import { describe, expect, it } from 'vitest';
import { BOARD_CLUSTER, createBoard } from '@/board/board';
import type { Board, BoardInput } from '@/board/board';
import {
  ROTATION_TOLERANCE,
  SNAP_TOLERANCE,
  applySnap,
  resolveSnap,
  snapCluster,
} from '@/board/snap';
import { buildNeighbourGraph, pieceIdAt } from '@/cut/graph';
import type { Rect } from '@/core/geom';

const COLS = 4;
const ROWS = 3;
const SCALE = 100;

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

/**
 * A freshly cut board with every piece scattered far out on the mat.
 *
 * A board fresh from `createBoard` sits solved-but-unmerged, so every piece is
 * adjacent to every neighbour and one snap would cascade across the whole
 * puzzle. Scattering first means a test only ever sees adjacency it set up.
 */
function board(): Board {
  const b = createBoard(input());
  for (const piece of b.pieces) b.moveCluster(b.clusterIdOf(piece.id), 100 + piece.id * 4, 100);
  return b;
}

/** Put a piece on the board proper, as though it had already been placed. */
function place(b: Board, pieceId: number): void {
  b.merge(b.clusterIdOf(pieceId), BOARD_CLUSTER);
}

/** Join pieces into one correctly aligned island, its first piece at (x, y). */
function island(b: Board, ids: readonly number[], x: number, y: number): number {
  const first = b.piece(ids[0]!);
  let cluster = b.clusterIdOf(ids[0]!);
  b.moveCluster(cluster, x, y);
  for (const other of ids.slice(1)) {
    const piece = b.piece(other);
    b.moveCluster(
      b.clusterIdOf(other),
      x + (piece.targetX - first.targetX),
      y + (piece.targetY - first.targetY),
    );
    cluster = b.merge(cluster, b.clusterIdOf(other));
  }
  return cluster;
}

/** Drop a loose piece at an offset from where it belongs. */
function dropNear(b: Board, pieceId: number, dx: number, dy: number): number {
  const cluster = b.clusterIdOf(pieceId);
  const piece = b.piece(pieceId);
  b.moveCluster(cluster, piece.targetX + dx, piece.targetY + dy);
  return cluster;
}

describe('tolerances', () => {
  it('states the three world-space tolerances from §05', () => {
    expect(SNAP_TOLERANCE.precise).toBeCloseTo(0.18, 10);
    expect(SNAP_TOLERANCE.standard).toBeCloseTo(0.28, 10);
    expect(SNAP_TOLERANCE.generous).toBeCloseTo(0.4, 10);
    expect(ROTATION_TOLERANCE).toBeCloseTo((12 * Math.PI) / 180, 10);
  });

  it('accepts inside the tolerance and rejects outside it', () => {
    const b = board();
    place(b, id(0, 0));

    const near = dropNear(b, id(1, 0), 0.2, 0);
    expect(resolveSnap(b, near, { tolerance: SNAP_TOLERANCE.standard })).not.toBeNull();

    const far = dropNear(b, id(2, 0), 0.5, 0);
    expect(resolveSnap(b, far, { tolerance: SNAP_TOLERANCE.standard })).toBeNull();
  });

  it('is the difficulty dial the three settings actually turn', () => {
    const b = board();
    place(b, id(0, 0));
    const cluster = dropNear(b, id(1, 0), 0.3, 0);

    expect(resolveSnap(b, cluster, { tolerance: SNAP_TOLERANCE.precise })).toBeNull();
    expect(resolveSnap(b, cluster, { tolerance: SNAP_TOLERANCE.generous })).not.toBeNull();
  });
});

describe('resolveSnap', () => {
  it('finds the neighbour a dropped piece belongs against', () => {
    const b = board();
    place(b, id(0, 0));
    const cluster = dropNear(b, id(1, 0), 0.1, 0.05);

    const candidate = resolveSnap(b, cluster)!;
    expect(candidate.pieceId).toBe(id(1, 0));
    expect(candidate.neighbourId).toBe(id(0, 0));
    expect(candidate.targetClusterId).toBe(BOARD_CLUSTER);
    expect(candidate.distance).toBeCloseTo(Math.hypot(0.1, 0.05), 10);
  });

  it('ignores neighbours already inside the dragged cluster', () => {
    // Two joined pieces dropped in empty space have a graph link between them,
    // and it must not resolve as a snap to themselves.
    const b = board();
    const a = b.clusterIdOf(id(0, 0));
    b.merge(a, b.clusterIdOf(id(1, 0)));
    b.moveCluster(a, 9, 9);
    expect(resolveSnap(b, a)).toBeNull();
  });

  it('takes the lowest error when two neighbours are both in range', () => {
    const b = board();
    // Two loose neighbours: the one above is lined up, the one to the left is not.
    b.moveCluster(b.clusterIdOf(id(0, 1)), 0, 1);
    b.moveCluster(b.clusterIdOf(id(1, 0)), 1.1, 0);
    const cluster = dropNear(b, id(1, 1), 0.1, 0);

    const candidate = resolveSnap(b, cluster, { tolerance: SNAP_TOLERANCE.generous })!;
    expect(candidate.neighbourId).toBe(id(1, 0));
    expect(candidate.distance).toBeCloseTo(0, 10);
  });

  it('breaks a tie toward the cluster with more pieces', () => {
    const b = board();
    // An island of two on the left, a lone piece on the right, equidistant.
    const pair = island(b, [id(0, 0), id(0, 1)], 0, 0);
    b.moveCluster(b.clusterIdOf(id(2, 0)), 2, 0);

    const dragged = dropNear(b, id(1, 0), 0.1, 0);
    const candidate = resolveSnap(b, dragged, { tolerance: SNAP_TOLERANCE.generous })!;
    expect(candidate.targetClusterId).toBe(pair);
  });

  it('breaks a remaining tie toward the board, so an ambiguous drop prefers it', () => {
    const b = board();
    place(b, id(0, 0));
    const lone = b.clusterIdOf(id(2, 0));
    b.moveCluster(lone, 2, 0);

    // Exactly between a one-piece board and a one-piece island.
    const dragged = dropNear(b, id(1, 0), 0, 0);
    const candidate = resolveSnap(b, dragged, { tolerance: SNAP_TOLERANCE.generous })!;
    expect(candidate.targetClusterId).toBe(BOARD_CLUSTER);
  });

  it('finds nothing on an empty mat', () => {
    const b = board();
    const cluster = b.clusterIdOf(id(2, 2));
    b.moveCluster(cluster, 20, 20);
    expect(resolveSnap(b, cluster)).toBeNull();
  });
});

describe('applySnap', () => {
  it('places a piece on its exact target when it joins the board', () => {
    const b = board();
    place(b, id(0, 0));
    const cluster = dropNear(b, id(1, 0), 0.12, -0.07);

    const result = snapCluster(b, cluster)!;

    expect(result.placed).toBe(true);
    expect(b.isPlaced(id(1, 0))).toBe(true);
    expect(b.worldOf(id(1, 0))).toEqual({ x: 1, y: 0 });
  });

  it('moves a dragged island rigidly — relative offsets survive the correction', () => {
    const b = board();
    place(b, id(0, 0));

    const dragged = island(b, [id(1, 0), id(1, 1)], 1.15, 0.1);

    const before = {
      x: b.worldOf(id(1, 1)).x - b.worldOf(id(1, 0)).x,
      y: b.worldOf(id(1, 1)).y - b.worldOf(id(1, 0)).y,
    };
    snapCluster(b, dragged);
    const after = {
      x: b.worldOf(id(1, 1)).x - b.worldOf(id(1, 0)).x,
      y: b.worldOf(id(1, 1)).y - b.worldOf(id(1, 0)).y,
    };

    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
    expect(b.placedCount).toBe(3);
  });

  it('leaves a missed drop exactly where it landed — no bounce-back, ever', () => {
    const b = board();
    place(b, id(0, 0));
    const cluster = dropNear(b, id(1, 0), 0.9, 0.4);
    const where = { ...b.cluster(cluster) };

    expect(snapCluster(b, cluster)).toBeNull();

    expect(b.cluster(cluster).x).toBe(where.x);
    expect(b.cluster(cluster).y).toBe(where.y);
    expect(b.clusterIdOf(id(1, 0))).toBe(cluster);
  });

  it('reports the merged size, which is what voices the group-merge chord', () => {
    const b = board();
    place(b, id(0, 0));
    place(b, id(1, 1));
    const cluster = dropNear(b, id(1, 0), 0.05, 0);

    const result = snapCluster(b, cluster)!;
    expect(result.survivorId).toBe(BOARD_CLUSTER);
    expect(result.mergedSize).toBe(3);
  });
});

describe('the board frame', () => {
  // Cluster 0 is "the only cluster with absolute coordinates" (§05), and an
  // empty one has no member to ask — so the very first piece of every puzzle
  // would be unplaceable if the frame were not itself a reference. This is the
  // *only* place an absolute position is ever consulted: piece-to-piece
  // resolution stays purely graph-based, which is what keeps islands working
  // anywhere on the mat.
  it('accepts the first piece of the puzzle, with the board still empty', () => {
    const b = board();
    const cluster = dropNear(b, id(2, 1), 0.1, 0.05);

    const candidate = resolveSnap(b, cluster)!;
    expect(candidate.targetClusterId).toBe(BOARD_CLUSTER);
    expect(candidate.neighbourId).toBeNull();

    snapCluster(b, cluster);
    expect(b.isPlaced(id(2, 1))).toBe(true);
    expect(b.worldOf(id(2, 1))).toEqual({ x: 2, y: 1 });
  });

  it('refuses a piece dropped away from its own slot', () => {
    const b = board();
    const cluster = dropNear(b, id(2, 1), 0.6, 0);
    expect(resolveSnap(b, cluster)).toBeNull();
  });

  it('refuses a piece sitting on somebody else’s slot', () => {
    // Near the board, but the wrong part of it. The frame is not a magnet.
    const b = board();
    const piece = b.piece(id(2, 1));
    b.moveCluster(b.clusterIdOf(id(2, 1)), piece.targetX - 1, piece.targetY);
    expect(resolveSnap(b, b.clusterIdOf(id(2, 1)))).toBeNull();
  });

  it('places a whole island by its frame position', () => {
    const b = board();
    const pair = island(b, [id(1, 0), id(1, 1)], 1.08, 0.06);
    snapCluster(b, pair);

    expect(b.placedCount).toBe(2);
    expect(b.worldOf(id(1, 1))).toEqual({ x: 1, y: 1 });
  });

  it('can be switched off, which is what a frameless mat would need', () => {
    const b = board();
    const cluster = dropNear(b, id(2, 1), 0.1, 0);
    expect(resolveSnap(b, cluster, { boardFrame: false })).toBeNull();
  });
});

describe('island to island — the property that makes free-floating work', () => {
  it('snaps two loose clusters with cluster 0 still empty', () => {
    const b = board();
    const left = b.clusterIdOf(id(1, 1));
    const right = b.clusterIdOf(id(2, 1));
    // Nowhere near the board, deliberately: the board is not consulted.
    b.moveCluster(left, 14, 9);
    b.moveCluster(right, 15.1, 9.05);

    const result = snapCluster(b, right)!;

    expect(b.placedCount).toBe(0);
    expect(b.clusterIdOf(id(2, 1))).toBe(left);
    expect(result.placed).toBe(false);
    // The two pieces now sit exactly one piece width apart, off the board.
    expect(b.worldOf(id(2, 1)).x - b.worldOf(id(1, 1)).x).toBeCloseTo(1, 10);
    expect(b.worldOf(id(2, 1)).y - b.worldOf(id(1, 1)).y).toBeCloseTo(0, 10);
  });

  it('keeps the island where the player left it rather than pulling it to the board', () => {
    const b = board();
    const left = b.clusterIdOf(id(1, 1));
    const right = b.clusterIdOf(id(2, 1));
    b.moveCluster(left, 14, 9);
    b.moveCluster(right, 15.1, 9.05);

    snapCluster(b, right);

    // The larger side of a merge is the frame that survives, so the piece the
    // player was not touching does not move at all.
    expect(b.worldOf(id(1, 1))).toEqual({ x: 14, y: 9 });
  });
});

describe('cascade', () => {
  it('absorbs every neighbour that lines up, not just the winning one', () => {
    // Dropping a piece into a gap between the board and a loose neighbour must
    // join both, or the board keeps a seam that looks placed but is not.
    const b = board();
    place(b, id(0, 0));
    b.moveCluster(b.clusterIdOf(id(1, 1)), 1, 1);
    const cluster = dropNear(b, id(1, 0), 0.05, 0.05);

    snapCluster(b, cluster);

    expect(b.isPlaced(id(1, 0))).toBe(true);
    expect(b.isPlaced(id(1, 1))).toBe(true);
    expect(b.placedCount).toBe(3);
  });

  it('pulls in a third island that the merge brought into range', () => {
    const b = board();
    const a = b.clusterIdOf(id(0, 0));
    const c = b.clusterIdOf(id(2, 0));
    b.moveCluster(a, 10, 10);
    b.moveCluster(c, 12.05, 10.02);

    const middle = b.clusterIdOf(id(1, 0));
    b.moveCluster(middle, 11.06, 10.03);

    const result = snapCluster(b, middle)!;

    expect(result.mergedSize).toBe(3);
    expect(b.clusterIdOf(id(0, 0))).toBe(b.clusterIdOf(id(2, 0)));
  });
});

describe('rotation', () => {
  it('rejects a cluster turned further than 12° even when it is positioned perfectly', () => {
    const b = board();
    place(b, id(0, 0));
    const cluster = dropNear(b, id(1, 0), 0, 0);
    b.rotateClusterAbout(cluster, b.worldOf(id(1, 0)), (20 * Math.PI) / 180);

    expect(resolveSnap(b, cluster, { rotation: true })).toBeNull();
  });

  it('takes a cluster within 12° and squares it up', () => {
    const b = board();
    place(b, id(0, 0));
    const cluster = dropNear(b, id(1, 0), 0, 0);
    b.rotateClusterAbout(cluster, b.worldOf(id(1, 0)), (5 * Math.PI) / 180);

    const result = snapCluster(b, cluster, { rotation: true })!;

    expect(result.placed).toBe(true);
    expect(b.worldOf(id(1, 0))).toEqual({ x: 1, y: 0 });
    expect(b.cluster(BOARD_CLUSTER).rot).toBe(0);
  });

  it('squares up a whole island, not just the contact piece', () => {
    const b = board();
    place(b, id(0, 0));
    const pair = island(b, [id(1, 0), id(1, 1)], 1, 0);
    b.rotateClusterAbout(pair, b.worldOf(id(1, 0)), (4 * Math.PI) / 180);

    snapCluster(b, pair, { rotation: true });

    expect(b.isPlaced(id(1, 1))).toBe(true);
    expect(b.worldOf(id(1, 1))).toEqual({ x: 1, y: 1 });
  });

  it('ignores cluster rotation entirely when the modifier is off', () => {
    // Rotation defaults OFF (§01), and with it off no cluster is ever turned, so
    // resolution must not spend anything on angles.
    const b = board();
    place(b, id(0, 0));
    const cluster = dropNear(b, id(1, 0), 0.1, 0);
    const candidate = resolveSnap(b, cluster, { rotation: false })!;
    expect(candidate.drot).toBe(0);
  });
});

describe('applySnap with a stale candidate', () => {
  it('refuses a candidate whose cluster has already been absorbed', () => {
    // The settle accepts input while it runs, so a candidate can outlive its
    // cluster. Failing loudly here beats corrupting the union-find.
    const b = board();
    place(b, id(0, 0));
    const cluster = dropNear(b, id(1, 0), 0.05, 0);
    const candidate = resolveSnap(b, cluster)!;
    applySnap(b, cluster, candidate);

    expect(() => applySnap(b, cluster, candidate)).toThrow();
  });
});
