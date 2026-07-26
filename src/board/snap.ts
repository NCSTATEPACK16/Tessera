/**
 * Snap resolution (§05).
 *
 * The whole design in one sentence: **snapping never asks "am I near my correct
 * absolute position", it asks "am I near where a graph-neighbour says I should
 * be".** That single choice is why a free-floating island snaps to another
 * island by exactly the code path that places a piece on the board frame, with
 * no special case anywhere — the board is just the cluster whose neighbours
 * happen to be anchored.
 *
 * Resolution runs on release and must be sub-millisecond: it is a graph lookup
 * over the dragged cluster's boundary links, not a search over the board.
 *
 * The other half of the spec is what happens when nothing wins: **nothing.**
 * The cluster stays exactly where it was dropped. No bounce-back, no penalty —
 * bounce-back discards the player's spatial intent, which is the most
 * infuriating pattern in this category and the easiest to reintroduce by
 * accident with a well-meaning "return to origin" fallback. There is no such
 * fallback in this file, and there must never be one.
 */

import { normaliseAngle, rotateVector } from '@/core/geom';
import type { Point } from '@/core/geom';
import type { PieceId } from '@/cut/types';
import { BOARD_CLUSTER } from './board';
import type { Board } from './board';

/**
 * Tolerance in world units — and world units are piece widths, so these are
 * literally the "× piece size" figures from §05. Being world-space is what
 * keeps zoom from changing difficulty.
 */
export const SNAP_TOLERANCE = {
  precise: 0.18,
  standard: 0.28,
  generous: 0.4,
} as const;

export type SnapDifficulty = keyof typeof SNAP_TOLERANCE;

/** §05: 12° in Rotation mode. */
export const ROTATION_TOLERANCE = (12 * Math.PI) / 180;

/**
 * How much a radian of misalignment is worth in world units when ranking
 * candidates. Half a piece width per radian ≈ the displacement a rotation error
 * actually produces at the far corner of a piece, which is what the player sees.
 */
const ROTATION_ERROR_WEIGHT = 0.5;

/** Two candidates within this are a tie, and the tie-break rules decide. */
const TIE_EPSILON = 1e-9;

export interface SnapCandidate {
  /** The piece in the dragged cluster that resolved. */
  pieceId: PieceId;
  /**
   * Its graph neighbour, outside the dragged cluster — or null when the piece
   * resolved against the board frame itself. See `boardFrame` below.
   */
  neighbourId: PieceId | null;
  /** The cluster to merge into. */
  targetClusterId: number;
  /** Translation to apply to the dragged cluster, after any rotation. */
  dx: number;
  dy: number;
  /** Rotation to apply, about the resolved piece's origin. 0 unless Rotation mode. */
  drot: number;
  /** Positional error at the moment of release, world units. */
  distance: number;
  /** Positional plus weighted rotational error. What ranks candidates. */
  error: number;
}

export interface SnapResult {
  candidate: SnapCandidate;
  /** The cluster everything ended up in. */
  survivorId: number;
  /** True when that cluster is the board — i.e. the pieces are placed. */
  placed: boolean;
  /** Size of the survivor after merging. Voices the group-merge chord (§08). */
  mergedSize: number;
  /** How many clusters were absorbed, the primary one included. */
  mergedClusters: number;
}

export interface SnapOptions {
  /** World units. Defaults to Standard. */
  tolerance?: number;
  /** Radians. Only consulted when `rotation` is on. */
  rotationTolerance?: number;
  /** The Rotation modifier. Defaults OFF (§01). */
  rotation?: boolean;
  /** Restrict resolution to one target cluster. Used by the merge cascade. */
  targetClusterId?: number;
  /**
   * Whether a piece may resolve against its own slot on the board frame.
   * Defaults on, and it is the *only* absolute-position test in this file.
   *
   * It exists because cluster 0 starts empty: with nothing in it there is no
   * member to ask, and the first piece of every puzzle would be unplaceable.
   * §05 calls cluster 0 "the only cluster with absolute coordinates", and this
   * is what that sentence buys. Piece-to-piece resolution below stays purely
   * graph-based, which is what keeps islands working identically anywhere on
   * the mat — the two are deliberately not the same code path.
   */
  boardFrame?: boolean;
}

/**
 * Find the best snap for a just-released cluster, or null.
 *
 * Pure — it does not move anything. The caller applies the correction, usually
 * by handing it to the settle so it springs into place over ~90ms.
 */
export function resolveSnap(
  board: Board,
  clusterId: number,
  options: SnapOptions = {},
): SnapCandidate | null {
  const tolerance = options.tolerance ?? SNAP_TOLERANCE.standard;
  const rotationTolerance = options.rotationTolerance ?? ROTATION_TOLERANCE;
  const rotation = options.rotation ?? false;

  const dragged = board.cluster(clusterId);
  const boardFrame =
    (options.boardFrame ?? true) &&
    clusterId !== BOARD_CLUSTER &&
    (options.targetClusterId === undefined || options.targetClusterId === BOARD_CLUSTER);

  let best: SnapCandidate | null = null;
  let bestSize = 0;

  const consider = (candidate: SnapCandidate, size: number): void => {
    if (best === null || wins(candidate, size, best, bestSize)) {
      best = candidate;
      bestSize = size;
    }
  };

  for (const pieceId of dragged.pieceIds) {
    const piece = board.piece(pieceId);
    const origin = board.worldOf(pieceId);

    if (boardFrame) {
      // The board frame is unrotated by definition, so squaring up to it is
      // simply undoing the cluster's own angle.
      const drot = rotation ? normaliseAngle(-dragged.rot) : 0;
      const distance = Math.hypot(piece.targetX - origin.x, piece.targetY - origin.y);
      if (Math.abs(drot) <= rotationTolerance && distance <= tolerance) {
        consider(
          {
            pieceId,
            neighbourId: null,
            targetClusterId: BOARD_CLUSTER,
            dx: piece.targetX - origin.x,
            dy: piece.targetY - origin.y,
            drot,
            distance,
            error: distance + Math.abs(drot) * ROTATION_ERROR_WEIGHT,
          },
          board.cluster(BOARD_CLUSTER).pieceIds.length,
        );
      }
    }

    for (const link of piece.neighbours) {
      if (!link) continue;

      const neighbourCluster = board.clusterIdOf(link.id);
      // A link inside the dragged cluster is the cluster's own seam, already merged.
      if (neighbourCluster === clusterId) continue;
      if (options.targetClusterId !== undefined && neighbourCluster !== options.targetClusterId) {
        continue;
      }

      const target = board.cluster(neighbourCluster);
      const drot = rotation ? normaliseAngle(target.rot - dragged.rot) : 0;
      if (Math.abs(drot) > rotationTolerance) continue;

      // Where the neighbour should be, given where this piece is and how the
      // dragged cluster is currently turned.
      const expected = offsetBy(origin, link, dragged.rot);
      const actual = board.worldOf(link.id);
      const distance = Math.hypot(actual.x - expected.x, actual.y - expected.y);
      if (distance > tolerance) continue;

      const error = distance + Math.abs(drot) * ROTATION_ERROR_WEIGHT;

      // The correction is computed at the *target's* angle, because the cluster
      // will have been squared up to it before the translation is applied. The
      // rotation pivots on this piece's origin, which is what leaves it fixed.
      const settled = offsetBy(origin, link, target.rot);
      const candidate: SnapCandidate = {
        pieceId,
        neighbourId: link.id,
        targetClusterId: neighbourCluster,
        dx: actual.x - settled.x,
        dy: actual.y - settled.y,
        drot,
        distance,
        error,
      };

      consider(candidate, target.pieceIds.length);
    }
  }

  return best;
}

/**
 * Rank two candidates: lowest error, then the cluster with more pieces, then the
 * board — so an ambiguous drop near the board prefers the board (§05). The final
 * fall-back to the lower id is not in the spec; it is there so a replayed
 * session resolves identically rather than by iteration order.
 */
function wins(
  candidate: SnapCandidate,
  size: number,
  best: SnapCandidate,
  bestSize: number,
): boolean {
  const delta = candidate.error - best.error;
  if (Math.abs(delta) > TIE_EPSILON) return delta < 0;
  if (size !== bestSize) return size > bestSize;
  // A real neighbour beats the board frame on a tie. The frame exists only to
  // bootstrap an empty cluster 0; wherever a piece can resolve against another
  // piece, that is the mechanism the whole model is built on.
  if ((candidate.neighbourId === null) !== (best.neighbourId === null)) {
    return best.neighbourId === null;
  }
  if ((candidate.targetClusterId === BOARD_CLUSTER) !== (best.targetClusterId === BOARD_CLUSTER)) {
    return candidate.targetClusterId === BOARD_CLUSTER;
  }
  return candidate.targetClusterId < best.targetClusterId;
}

function offsetBy(origin: Point, link: { dx: number; dy: number }, rot: number): Point {
  const offset = rotateVector({ x: link.dx, y: link.dy }, rot);
  return { x: origin.x + offset.x, y: origin.y + offset.y };
}

/**
 * Apply a resolved candidate: square up, translate, merge, then cascade.
 *
 * The cascade is not decoration. Drop a piece into a hole with neighbours on
 * three sides and only one of them resolved as the winner; without the cascade
 * the other two seams look joined and are not, and the player finds out much
 * later when the island refuses to drag as one.
 */
export function applySnap(
  board: Board,
  clusterId: number,
  candidate: SnapCandidate,
  options: SnapOptions = {},
): SnapResult {
  if (!board.clusters.has(clusterId)) {
    throw new Error(`applySnap: cluster ${clusterId} no longer exists — stale candidate`);
  }
  if (board.clusterIdOf(candidate.pieceId) !== clusterId) {
    throw new Error(`applySnap: piece ${candidate.pieceId} has left cluster ${clusterId}`);
  }

  align(board, clusterId, candidate);
  let survivorId = board.merge(clusterId, candidate.targetClusterId);
  let mergedClusters = 1;

  // Everything else the merge brought into range, most-aligned first.
  for (;;) {
    const next = cascadeCandidate(board, survivorId, options);
    if (!next) break;
    // The board never moves, and merging into it resolves every member onto its
    // exact slot anyway, so an anchored cluster is absorbed as it stands.
    if (!board.cluster(next.clusterId).anchored) {
      align(board, next.clusterId, next.candidate);
    }
    survivorId = board.merge(next.clusterId, survivorId);
    mergedClusters++;
  }

  const survivor = board.cluster(survivorId);
  return {
    candidate,
    survivorId,
    placed: survivorId === BOARD_CLUSTER,
    mergedSize: survivor.pieceIds.length,
    mergedClusters,
  };
}

/** Resolve and apply in one call. Null means the drop missed and nothing moved. */
export function snapCluster(
  board: Board,
  clusterId: number,
  options: SnapOptions = {},
): SnapResult | null {
  const candidate = resolveSnap(board, clusterId, options);
  if (!candidate) return null;
  return applySnap(board, clusterId, candidate, options);
}

/** The rigid correction: square up about the contact piece, then translate. */
function align(board: Board, clusterId: number, candidate: SnapCandidate): void {
  if (candidate.drot !== 0) {
    board.rotateClusterAbout(clusterId, board.worldOf(candidate.pieceId), candidate.drot);
  }
  if (candidate.dx !== 0 || candidate.dy !== 0) {
    board.moveClusterBy(clusterId, candidate.dx, candidate.dy);
  }
}

interface Cascade {
  clusterId: number;
  candidate: SnapCandidate;
}

/**
 * The best remaining cluster that lines up with the survivor.
 *
 * Resolution runs with the *other* cluster as the dragged one, so the survivor
 * never moves — the piece the player just placed stays exactly where it landed
 * while its new neighbours come to it.
 */
function cascadeCandidate(
  board: Board,
  survivorId: number,
  options: SnapOptions,
): Cascade | null {
  const survivor = board.cluster(survivorId);
  const seen = new Set<number>();
  let best: Cascade | null = null;

  for (const pieceId of survivor.pieceIds) {
    for (const link of board.piece(pieceId).neighbours) {
      if (!link) continue;
      const other = board.clusterIdOf(link.id);
      if (other === survivorId || seen.has(other)) continue;
      seen.add(other);

      const candidate = resolveSnap(board, other, { ...options, targetClusterId: survivorId });
      if (candidate && (best === null || candidate.error < best.candidate.error)) {
        best = { clusterId: other, candidate };
      }
    }
  }

  return best;
}
