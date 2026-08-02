/**
 * Board state — three machines' worth of nouns, minus the machines (§05).
 *
 * The model in one line: **a piece never owns a world position.** It owns an
 * offset inside its cluster's frame, and the cluster owns (x, y, rot). Dragging
 * a twenty-piece island therefore writes three numbers per frame rather than
 * twenty, which is what the §03 budget — "sustained 60fps while dragging a
 * 20-piece island" — actually asks for.
 *
 * **Cluster 0 is the board itself**: anchored, never rotated, origin at the
 * world origin. So a piece's offset inside cluster 0 is exactly its target
 * offset from the cut, and "merging with cluster 0" is literally "your local
 * offset became your target". That is why `placed` is not a flag anywhere in
 * this file — it is cluster membership, and completion is
 * `cluster0.pieceIds.length === N` and nothing else.
 */

import type { Point } from '@/core/geom';
import { rotateVector } from '@/core/geom';
import type { NeighbourLink, PieceId } from '@/cut/types';

/** The board. The only anchored cluster, and the only one with absolute coordinates. */
export const BOARD_CLUSTER = 0;

export type ClusterKind = 'loose' | 'island' | 'board';

/** What the board needs from the cut. A structural subset of `CutPiece`. */
export interface BoardInput {
  id: PieceId;
  /** Where this piece's bitmap origin belongs on the board, in world units. */
  targetX: number;
  targetY: number;
  w: number;
  h: number;
  neighbours: readonly (NeighbourLink | null)[];
}

export interface BoardPiece extends BoardInput {
  clusterId: number;
  /** Offset from the cluster origin, in the cluster's own unrotated frame. */
  localX: number;
  localY: number;
}

export interface Cluster {
  id: number;
  pieceIds: PieceId[];
  /** Cluster origin in world units. */
  x: number;
  y: number;
  /** Radians. Always 0 for cluster 0 (§05: the board is unrotatable). */
  rot: number;
  kind: ClusterKind;
  anchored: boolean;
  /** Islands carry a mono label chip in the tray at step 3. */
  label?: string;
  collapsed?: boolean;
}

export class Board {
  readonly pieces: BoardPiece[];
  readonly clusters = new Map<number, Cluster>();
  private nextClusterId: number;

  constructor(input: readonly BoardInput[]) {
    this.clusters.set(BOARD_CLUSTER, {
      id: BOARD_CLUSTER,
      pieceIds: [],
      x: 0,
      y: 0,
      rot: 0,
      kind: 'board',
      anchored: true,
    });

    this.pieces = input.map((source) => ({ ...source, clusterId: 0, localX: 0, localY: 0 }));

    // Cluster ids start above cluster 0, so id 0 can never be handed out to a
    // loose piece and accidentally read as "placed".
    this.nextClusterId = 1;
    for (const piece of this.pieces) {
      const id = this.nextClusterId++;
      piece.clusterId = id;
      // A cluster of one has its origin *at* the piece, so moving the cluster
      // and moving the piece are the same operation.
      piece.localX = 0;
      piece.localY = 0;
      this.clusters.set(id, {
        id,
        pieceIds: [piece.id],
        x: piece.targetX,
        y: piece.targetY,
        rot: 0,
        kind: 'loose',
        anchored: false,
      });
    }
  }

  get pieceCount(): number {
    return this.pieces.length;
  }

  /** Placed means in cluster 0. There is no other definition in this codebase. */
  get placedCount(): number {
    return this.cluster(BOARD_CLUSTER).pieceIds.length;
  }

  get isComplete(): boolean {
    return this.placedCount === this.pieces.length;
  }

  piece(id: PieceId): BoardPiece {
    const piece = this.pieces[id];
    if (!piece) throw new Error(`Board: no piece ${id}`);
    return piece;
  }

  cluster(id: number): Cluster {
    const cluster = this.clusters.get(id);
    if (!cluster) throw new Error(`Board: no cluster ${id}`);
    return cluster;
  }

  clusterIdOf(pieceId: PieceId): number {
    return this.piece(pieceId).clusterId;
  }

  clusterOf(pieceId: PieceId): Cluster {
    return this.cluster(this.clusterIdOf(pieceId));
  }

  isPlaced(pieceId: PieceId): boolean {
    return this.clusterIdOf(pieceId) === BOARD_CLUSTER;
  }

  /** A piece's bitmap origin in world units. The only projection in the model. */
  worldOf(pieceId: PieceId): Point {
    const piece = this.piece(pieceId);
    const cluster = this.cluster(piece.clusterId);
    if (cluster.rot === 0) {
      return { x: cluster.x + piece.localX, y: cluster.y + piece.localY };
    }
    const offset = rotateVector({ x: piece.localX, y: piece.localY }, cluster.rot);
    return { x: cluster.x + offset.x, y: cluster.y + offset.y };
  }

  /**
   * A piece's bitmap *centre* in world units — what the renderer draws about.
   *
   * A cluster turns about its origin; the renderer turns each bitmap about its
   * own centre. Both are correct, and they differ the moment rotation is
   * non-zero, so the conversion lives here rather than being re-derived at every
   * call site. The scene draws at `centreOf − half extent`.
   */
  centreOf(pieceId: PieceId): Point {
    const piece = this.piece(pieceId);
    const cluster = this.cluster(piece.clusterId);
    const half = { x: piece.w / 2, y: piece.h / 2 };
    if (cluster.rot === 0) {
      return { x: cluster.x + piece.localX + half.x, y: cluster.y + piece.localY + half.y };
    }
    const offset = rotateVector(
      { x: piece.localX + half.x, y: piece.localY + half.y },
      cluster.rot,
    );
    return { x: cluster.x + offset.x, y: cluster.y + offset.y };
  }

  moveCluster(clusterId: number, x: number, y: number): void {
    const cluster = this.assertMovable(clusterId);
    cluster.x = x;
    cluster.y = y;
  }

  moveClusterBy(clusterId: number, dx: number, dy: number): void {
    const cluster = this.assertMovable(clusterId);
    cluster.x += dx;
    cluster.y += dy;
  }

  /**
   * Rotate a cluster while holding one world point still.
   *
   * Always about a pivot, never about the cluster origin: the origin is an
   * arbitrary corner, so rotating about it swings the island out from under the
   * finger that is turning it.
   */
  rotateClusterAbout(clusterId: number, pivot: Point, angle: number): void {
    const cluster = this.assertMovable(clusterId);
    if (angle === 0) return;
    const offset = rotateVector({ x: cluster.x - pivot.x, y: cluster.y - pivot.y }, angle);
    cluster.x = pivot.x + offset.x;
    cluster.y = pivot.y + offset.y;
    cluster.rot += angle;
  }

  /**
   * Union-find merge. Returns the surviving cluster id.
   *
   * The two clusters must already be geometrically aligned — snap resolution
   * applies the correction, this only re-parents. Splitting it that way is what
   * lets the settle animate the correction over 90ms while the merge itself
   * stays instantaneous bookkeeping.
   *
   * Survivor rule: cluster 0 always, otherwise the larger, ties to the lower id
   * so a replayed session merges identically.
   */
  merge(a: number, b: number): number {
    if (a === b) return a;
    const survivor = this.cluster(this.survivorOf(a, b));
    const absorbed = this.cluster(survivor.id === a ? b : a);

    for (const pieceId of absorbed.pieceIds) {
      const piece = this.piece(pieceId);
      if (survivor.id === BOARD_CLUSTER) {
        // Landing on the board resolves to the exact slot. The static layer
        // bakes placed pieces, so a piece left a hundredth of a unit off would
        // bake that error in permanently.
        piece.localX = piece.targetX;
        piece.localY = piece.targetY;
      } else {
        const world = this.worldOf(pieceId);
        const local = rotateVector(
          { x: world.x - survivor.x, y: world.y - survivor.y },
          -survivor.rot,
        );
        piece.localX = local.x;
        piece.localY = local.y;
      }
      piece.clusterId = survivor.id;
      survivor.pieceIds.push(pieceId);
    }

    this.clusters.delete(absorbed.id);
    if (survivor.id !== BOARD_CLUSTER) {
      survivor.kind = survivor.pieceIds.length > 1 ? 'island' : 'loose';
    }
    return survivor.id;
  }

  /**
   * Placed pieces (§05's neighbours, not §05's absolute-position exception)
   * that a member of `clusterId` would actually connect to.
   *
   * X-Ray focus (§07/§09) dims every other placed piece while `clusterId` is
   * in hand, so the player can tell "line up with these" from "irrelevant
   * background." Graph-based, same as `resolveSnap` — it asks the same
   * question snap resolution does, just for display rather than a merge.
   */
  candidateSockets(clusterId: number): Set<PieceId> {
    const sockets = new Set<PieceId>();
    for (const pieceId of this.cluster(clusterId).pieceIds) {
      for (const link of this.piece(pieceId).neighbours) {
        if (link && this.isPlaced(link.id)) sockets.add(link.id);
      }
    }
    return sockets;
  }

  private survivorOf(a: number, b: number): number {
    if (a === BOARD_CLUSTER || b === BOARD_CLUSTER) return BOARD_CLUSTER;
    const sizeA = this.cluster(a).pieceIds.length;
    const sizeB = this.cluster(b).pieceIds.length;
    if (sizeA !== sizeB) return sizeA > sizeB ? a : b;
    return Math.min(a, b);
  }

  private assertMovable(clusterId: number): Cluster {
    const cluster = this.cluster(clusterId);
    if (cluster.anchored) {
      throw new Error(`Board: cluster ${clusterId} is anchored — the board does not move`);
    }
    return cluster;
  }
}

export function createBoard(input: readonly BoardInput[]): Board {
  return new Board(input);
}
