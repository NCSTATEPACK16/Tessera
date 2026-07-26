/**
 * The play session — board, snap, settle and scene, wired together.
 *
 * One decision governs the whole file: **the model is truth and the settle is
 * presentation.** A cluster that snaps merges into the board on the same tick as
 * the release; what animates over the following ~120ms is where the renderer
 * *draws* those pieces, springing from where they were dropped to where they now
 * are. The alternative — merge when the animation finishes — lets a dropped
 * frame or a backgrounded tab leave the board disagreeing with itself, and
 * `interrupted` is a first-class state (§05), so that is a promise of a bug
 * rather than a risk of one.
 *
 * It also means the two hard invariants stay trivially true: every placement
 * goes through the union-find, and completion is cluster 0's size, checked the
 * instant it changes rather than 120ms later.
 */

import type { CubicPath, Point, Rect } from '@/core/geom';
import { rotateVector } from '@/core/geom';
import type { NeighbourLink, PieceId } from '@/cut/types';
import { BOARD_CLUSTER, createBoard } from '@/board/board';
import type { Board } from '@/board/board';
import { HitIndex, polygonFromPath } from '@/board/hit-test';
import type { HitPiece } from '@/board/hit-test';
import { SNAP_TOLERANCE, applySnap, resolveSnap } from '@/board/snap';
import type { SnapDifficulty } from '@/board/snap';
import { createSettle } from '@/board/settle';
import type { Pose, Settle } from '@/board/settle';
import type { MatFinish, Scene, ScenePiece } from '@/render/scene';

/** §05: the held cluster rides 8pt above the finger, never under it. */
export const LIFT_PX = 8;
/** §05: and 1.06 larger, so the hand reads as being above the mat. */
export const LIFT_SCALE = 1.06;

/** What the session needs from the cut. A structural subset of `CutPiece`. */
export interface SessionPiece {
  id: PieceId;
  targetX: number;
  targetY: number;
  worldW: number;
  worldH: number;
  neighbours: readonly (NeighbourLink | null)[];
  path: CubicPath;
  isEdge: boolean;
  bitmap: ImageBitmap;
}

export type PlayEvent =
  | { type: 'grab'; clusterId: number }
  | { type: 'snap'; placed: boolean; mergedSize: number; mergedClusters: number }
  | { type: 'miss' }
  | { type: 'edgeFrame' }
  | { type: 'complete' };

export interface PlaySessionOptions {
  pieces: readonly SessionPiece[];
  boardW: number;
  boardH: number;
  /**
   * Image pixels per world unit — `CutGeometry.scale`, the units `piece.path`
   * is expressed in. Checked against the pieces at construction, because
   * getting it wrong is silent and total.
   */
  pathScale: number;
  finish?: MatFinish;
  difficulty?: SnapDifficulty;
  /** The Rotation modifier. Defaults OFF (§01). */
  rotation?: boolean;
  reducedMotion?: boolean;
  onEvent?: (event: PlayEvent) => void;
}

export interface PlaySummary {
  placed: number;
  total: number;
  /** 0–1. Drives the progress bloom (§07) and the HUD. */
  completion: number;
}

/**
 * A cluster mid-settle.
 *
 * Held as a frame plus per-piece offsets rather than per-piece springs, because
 * the correction is rigid: one spring moves twenty pieces, which is the same
 * reason clusters own their transform in the first place.
 */
interface Settling {
  pieceIds: PieceId[];
  /** Offsets within the settling frame, parallel to `pieceIds`. */
  local: Point[];
  settle: Settle;
}

export class PlaySession {
  readonly board: Board;
  private readonly source = new Map<PieceId, SessionPiece>();
  private readonly polygons = new Map<PieceId, number[]>();
  private readonly index = new HitIndex();
  private readonly pickOrder = new Map<number, number>();
  private readonly settling: Settling[] = [];
  private readonly moving = new Set<PieceId>();

  private held: number | null = null;
  private pickSequence = 1;
  private edgeFrameAnnounced = false;
  private completionAnnounced = false;

  constructor(private readonly options: PlaySessionOptions) {
    this.board = createBoard(
      options.pieces.map((piece) => ({
        id: piece.id,
        targetX: piece.targetX,
        targetY: piece.targetY,
        w: piece.worldW,
        h: piece.worldH,
        neighbours: piece.neighbours,
      })),
    );

    for (const piece of options.pieces) {
      this.source.set(piece.id, piece);
      this.polygons.set(piece.id, polygonFromPath(piece.path, options.pathScale));
    }
    this.assertPathScale();
    this.rebuild();
  }

  /**
   * Check the outline actually describes the piece it belongs to.
   *
   * The outline arrives in image pixels and the world is measured in piece
   * widths, so one number carries between them through three files. Get it
   * wrong — pass the device pixel ratio, say — and every polygon comes out tens
   * of times too large and sitting off the corner of its piece. The only symptom
   * is that nothing on the board can be picked up, with no error raised
   * anywhere, no visual difference, and every unit test still passing because
   * fixtures are self-consistent. Breaking that silence is worth eight lines.
   *
   * One piece is enough: they all share the scale.
   */
  private assertPathScale(): void {
    const piece = this.options.pieces[0];
    if (!piece) return;

    const poly = this.polygons.get(piece.id)!;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < poly.length; i += 2) {
      minX = Math.min(minX, poly[i]!);
      maxX = Math.max(maxX, poly[i]!);
    }

    // The outline sits inside the bitmap, which is its bounds plus a little
    // bleed — so a factor of two either way is slack, and the mistakes this
    // catches are factors of fifty.
    const spread = maxX - minX;
    if (!Number.isFinite(spread) || spread < piece.worldW / 2 || spread > piece.worldW * 2) {
      throw new Error(
        `PlaySession: pathScale ${this.options.pathScale} makes piece ${piece.id} ` +
          `${spread.toFixed(2)} world units wide, but it is ${piece.worldW.toFixed(2)}. ` +
          `pathScale is image pixels per world unit (CutGeometry.scale), not the pixel ratio.`,
      );
    }
  }

  get animating(): boolean {
    return this.settling.length > 0;
  }

  get heldCluster(): number | null {
    return this.held;
  }

  get summary(): PlaySummary {
    const total = this.board.pieceCount;
    return {
      placed: this.board.placedCount,
      total,
      completion: total === 0 ? 0 : this.board.placedCount / total,
    };
  }

  /**
   * The world rectangle holding the board and everything on the mat.
   *
   * The opening view frames this rather than the board, because on a fresh board
   * every piece the player owns is *outside* it — fitting the board alone opens
   * on an empty frame with the pieces off-screen in every direction.
   */
  contentBounds(): Rect {
    let minX = 0;
    let minY = 0;
    let maxX = this.options.boardW;
    let maxY = this.options.boardH;

    for (const piece of this.board.pieces) {
      const origin = this.board.worldOf(piece.id);
      if (origin.x < minX) minX = origin.x;
      if (origin.y < minY) minY = origin.y;
      if (origin.x + piece.w > maxX) maxX = origin.x + piece.w;
      if (origin.y + piece.h > maxY) maxY = origin.y + piece.h;
    }

    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  /** Rebuild the hit index. Cheap enough to call on any structural change. */
  rebuild(): void {
    const targets: HitPiece[] = [];
    for (const piece of this.board.pieces) {
      // Placed pieces are deliberately absent: the board is anchored, so one
      // finger on it must fall through to a camera pan rather than a dead drag.
      if (this.board.isPlaced(piece.id)) continue;
      targets.push(this.hitPiece(piece.id));
    }
    this.index.rebuild(targets);
  }

  pickCluster(world: Point): number | null {
    const hit = this.index.pick(world);
    return hit ? this.board.clusterIdOf(hit.id) : null;
  }

  grab(clusterId: number): void {
    // A cluster caught mid-settle belongs to the hand now, not to the spring.
    this.cancelSettlesFor(clusterId);
    this.held = clusterId;
    this.pickOrder.set(clusterId, this.pickSequence++);
    this.syncCluster(clusterId);
    this.emit({ type: 'grab', clusterId });
  }

  dragBy(clusterId: number, dx: number, dy: number): void {
    this.board.moveClusterBy(clusterId, dx, dy);
    this.syncCluster(clusterId);
  }

  rotateBy(clusterId: number, pivot: Point, angle: number): void {
    if (!this.options.rotation) return;
    this.board.rotateClusterAbout(clusterId, pivot, angle);
    this.syncCluster(clusterId);
  }

  /**
   * Let go. Resolves the snap, merges, and hands the correction to a spring.
   *
   * `liftWorld` is the 8pt lift expressed in world units at the current zoom.
   * Folding it into the spring's starting pose is what makes the piece *drop*
   * onto the mat instead of teleporting down the moment the finger leaves.
   */
  release(clusterId: number, velocity: Point, liftWorld = 0): void {
    if (this.held === clusterId) this.held = null;

    const cluster = this.board.cluster(clusterId);
    const from: Pose = { x: cluster.x, y: cluster.y - liftWorld, rot: cluster.rot };
    const pieceIds = [...cluster.pieceIds];
    const local = pieceIds.map((id) => {
      const piece = this.board.piece(id);
      return { x: piece.localX, y: piece.localY };
    });

    const candidate = resolveSnap(this.board, clusterId, this.snapOptions());
    if (!candidate) {
      // Nothing wins: the cluster stays exactly where it was dropped. No
      // bounce-back, no penalty — only the 8pt it was being held above the mat.
      //
      // Deliberately without the throw velocity: inheriting it would make a
      // flicked miss skid visibly past the point of release, which is the same
      // insult as bounce-back wearing a different hat. It falls, and that is all.
      if (liftWorld > 0) {
        this.startSettle(pieceIds, local, from, { ...from, y: cluster.y }, { x: 0, y: 0 });
      }
      this.syncCluster(clusterId);
      this.emit({ type: 'miss' });
      return;
    }

    const result = applySnap(this.board, clusterId, candidate, this.snapOptions());

    // Where that frame ended up. Read back from a piece rather than re-derived,
    // so the spring lands on whatever the union-find actually decided.
    const survivor = this.board.cluster(result.survivorId);
    const anchor = this.board.worldOf(pieceIds[0]!);
    const offset = rotateVector(local[0]!, survivor.rot);
    const to: Pose = { x: anchor.x - offset.x, y: anchor.y - offset.y, rot: survivor.rot };

    this.startSettle(pieceIds, local, from, to, velocity);
    this.rebuild();

    this.emit({
      type: 'snap',
      placed: result.placed,
      mergedSize: result.mergedSize,
      mergedClusters: result.mergedClusters,
    });
    this.announceMilestones();
  }

  /** Step every settle. Returns whether anything is still moving. */
  advance(dtMs: number): boolean {
    for (let i = this.settling.length - 1; i >= 0; i--) {
      const entry = this.settling[i]!;
      entry.settle.advance(dtMs);
      if (entry.settle.done) {
        for (const id of entry.pieceIds) this.moving.delete(id);
        this.settling.splice(i, 1);
      }
    }
    return this.animating;
  }

  /** Drop everything on the floor — backgrounding, low memory (§05). */
  interrupt(): void {
    this.held = null;
    for (const entry of this.settling) {
      for (const id of entry.pieceIds) this.moving.delete(id);
    }
    this.settling.length = 0;
  }

  scene(): Scene {
    const placed: ScenePiece[] = [];
    const loose: ScenePiece[] = [];
    const held: ScenePiece[] = [];

    const posed = this.settlingPoses();

    for (const piece of this.board.pieces) {
      const scenePiece = posed.get(piece.id) ?? this.scenePiece(piece.id);
      if (this.held !== null && this.board.clusterIdOf(piece.id) === this.held) {
        held.push(scenePiece);
      } else if (this.board.isPlaced(piece.id) && !this.moving.has(piece.id)) {
        // Settling pieces stay on the dynamic layer until they stop, or the
        // static layer would have to recomposite every frame of the spring.
        placed.push(scenePiece);
      } else {
        loose.push(scenePiece);
      }
    }

    return {
      finish: this.options.finish ?? 'felt',
      boardW: this.options.boardW,
      boardH: this.options.boardH,
      placed,
      loose,
      held,
      heldLift: { offsetPx: LIFT_PX, scale: LIFT_SCALE },
      completion: this.summary.completion,
    };
  }

  // -------------------------------------------------------------------------

  private snapOptions() {
    return {
      tolerance: SNAP_TOLERANCE[this.options.difficulty ?? 'standard'],
      rotation: this.options.rotation ?? false,
    };
  }

  private startSettle(
    pieceIds: PieceId[],
    local: Point[],
    from: Pose,
    to: Pose,
    velocity: Point,
  ): void {
    if (from.x === to.x && from.y === to.y && from.rot === to.rot) return;

    for (const id of pieceIds) this.moving.add(id);
    this.settling.push({
      pieceIds,
      local,
      settle: createSettle({
        from,
        to,
        velocity: { x: velocity.x, y: velocity.y, rot: 0 },
        ...(this.options.reducedMotion ? { reducedMotion: true } : {}),
      }),
    });
  }

  private cancelSettlesFor(clusterId: number): void {
    const pieces = new Set(this.board.cluster(clusterId).pieceIds);
    for (let i = this.settling.length - 1; i >= 0; i--) {
      const entry = this.settling[i]!;
      if (!entry.pieceIds.some((id) => pieces.has(id))) continue;
      for (const id of entry.pieceIds) this.moving.delete(id);
      this.settling.splice(i, 1);
    }
  }

  /** Draw poses for everything mid-spring, keyed by piece. */
  private settlingPoses(): Map<PieceId, ScenePiece> {
    const out = new Map<PieceId, ScenePiece>();
    for (const entry of this.settling) {
      const pose = entry.settle.sample;
      for (const [index, id] of entry.pieceIds.entries()) {
        const offset = rotateVector(entry.local[index]!, pose.rot);
        out.set(id, this.scenePieceAt(id, pose.x + offset.x, pose.y + offset.y, pose.rot));
      }
    }
    return out;
  }

  private scenePiece(pieceId: PieceId): ScenePiece {
    const origin = this.board.worldOf(pieceId);
    return this.scenePieceAt(pieceId, origin.x, origin.y, this.board.clusterOf(pieceId).rot);
  }

  /**
   * A drawable at an explicit origin.
   *
   * The renderer rotates each bitmap about its own centre, while a cluster turns
   * about its origin — so the centre is computed here, once, rather than being
   * re-derived by every caller and getting it subtly wrong at rotation only.
   */
  private scenePieceAt(pieceId: PieceId, x: number, y: number, rot: number): ScenePiece {
    const piece = this.board.piece(pieceId);
    const source = this.source.get(pieceId)!;
    const half = { x: piece.w / 2, y: piece.h / 2 };
    const centre = rot === 0 ? { x: x + half.x, y: y + half.y } : addRotated({ x, y }, half, rot);

    return {
      id: pieceId,
      x: centre.x - half.x,
      y: centre.y - half.y,
      w: piece.w,
      h: piece.h,
      rot,
      bitmap: source.bitmap,
      path: source.path,
      pathScale: this.options.pathScale,
    };
  }

  private hitPiece(pieceId: PieceId): HitPiece {
    const drawn = this.scenePiece(pieceId);
    return {
      id: pieceId,
      x: drawn.x,
      y: drawn.y,
      w: drawn.w,
      h: drawn.h,
      rot: drawn.rot,
      poly: this.polygons.get(pieceId)!,
      pick: this.pickOrder.get(this.board.clusterIdOf(pieceId)) ?? 0,
    };
  }

  private syncCluster(clusterId: number): void {
    if (!this.board.clusters.has(clusterId)) return;
    for (const id of this.board.cluster(clusterId).pieceIds) {
      if (this.board.isPlaced(id)) continue;
      this.index.update(this.hitPiece(id));
    }
  }

  private announceMilestones(): void {
    if (!this.edgeFrameAnnounced && this.edgeFrameComplete()) {
      this.edgeFrameAnnounced = true;
      this.emit({ type: 'edgeFrame' });
    }
    if (!this.completionAnnounced && this.board.isComplete) {
      this.completionAnnounced = true;
      this.emit({ type: 'complete' });
    }
  }

  private edgeFrameComplete(): boolean {
    for (const piece of this.options.pieces) {
      if (piece.isEdge && this.board.clusterIdOf(piece.id) !== BOARD_CLUSTER) return false;
    }
    return true;
  }

  private emit(event: PlayEvent): void {
    this.options.onEvent?.(event);
  }
}

function addRotated(origin: Point, offset: Point, rot: number): Point {
  const turned = rotateVector(offset, rot);
  return { x: origin.x + turned.x, y: origin.y + turned.y };
}
