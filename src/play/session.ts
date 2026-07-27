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
import type { MatFinish, Scene, SceneGroup, ScenePiece } from '@/render/scene';
import { WORKSET_DROP_TOLERANCE, WorksetStore, escapedBounds, worksetBounds } from './workset';

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

/**
 * Where a piece is (§06).
 *
 * `placed` is cluster 0 and nothing else — the board owns that and this file
 * does not second-guess it. The tray/mat distinction is the one thing the board
 * has no opinion about: to the union-find a tray piece is an ordinary loose
 * cluster of one, which is exactly why adding the tray needed no change to
 * `board.ts` at all.
 */
export type PieceLocation = 'tray' | 'mat' | 'placed';

export type PlayEvent =
  | { type: 'grab'; clusterId: number }
  | { type: 'snap'; placed: boolean; mergedSize: number; mergedClusters: number }
  | { type: 'miss' }
  | { type: 'edgeFrame' }
  | { type: 'complete' }
  /** A piece left the tray for the mat. */
  | { type: 'deploy'; pieceId: PieceId; clusterId: number }
  /** …and went back. `pinned` when it landed on the shelf rather than the grid. */
  | { type: 'return'; pieceId: PieceId; pinned: boolean }
  /** Membership or collapse changed; the chrome needs a repaint. */
  | { type: 'worksetChanged' };

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
  /**
   * Start every piece in the tray (§06). Defaults true — the tray is home.
   *
   * The dev harness sets it false: steps 1–2 scatter across the mat because
   * judging the snap needs pieces to be *on* something, and that harness
   * predates the tray by two steps.
   */
  startInTray?: boolean;
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
  /**
   * Pieces in the tray rather than on the mat.
   *
   * A tray piece's cluster still sits at `targetX/targetY` — its *solved*
   * position — because nothing has moved it yet. That is harmless while the
   * tray is honoured everywhere and catastrophic the moment it is not: one leak
   * into `scene().loose` and the piece draws itself into its own slot, so the
   * puzzle appears to solve itself. `rebuild`, `scene`, and `contentBounds` all
   * consult this set, and a test asserts a full tray renders nothing.
   *
   * Two predicates gate the mat: `inTray` and `worksets.isHidden`. Both are
   * consulted in `rebuild`, `scene`, and `contentBounds`, and honouring one
   * without the other is how the board comes to disagree with itself.
   */
  private readonly inTray = new Set<PieceId>();

  /**
   * §06's pull-out groups. Deliberately *not* clusters — see `workset.ts`.
   *
   * `board.ts` and `snap.ts` know nothing about this. It is consulted here, in
   * `scene()` and `rebuild()`, and nowhere else in the model.
   */
  readonly worksets = new WorksetStore();

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
      if (options.startInTray !== false) this.inTray.add(piece.id);
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
      // A tray piece's cluster is parked on its own slot, so it would widen
      // nothing — but it would also make a *full* tray read as "the board is the
      // content", which is right by accident rather than by decision.
      if (this.inTray.has(piece.id)) continue;
      if (this.worksets.isHidden(piece.id)) continue;
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
      // Tray pieces likewise — they are not on the mat to be touched.
      if (this.inTray.has(piece.id)) continue;
      // A collapsed group's members are not drawn, so they must not be pickable
      // either — index one without drawing it and the player grabs thin air.
      if (this.worksets.isHidden(piece.id)) continue;
      targets.push(this.hitPiece(piece.id));
    }
    this.index.rebuild(targets);
  }

  pickCluster(world: Point): number | null {
    const hit = this.index.pick(world);
    return hit ? this.board.clusterIdOf(hit.id) : null;
  }

  // -------------------------------------------------------------------------
  // The tray boundary (§06). The tray is home; the mat is where you work.

  locationOf(pieceId: PieceId): PieceLocation {
    if (this.board.isPlaced(pieceId)) return 'placed';
    return this.inTray.has(pieceId) ? 'tray' : 'mat';
  }

  get trayCount(): number {
    return this.inTray.size;
  }

  /**
   * Take a piece out of the tray and put it on the mat, centred on `world`.
   *
   * Returns the cluster id so the caller can hand the live pointer straight to
   * the board's drag — the whole gesture is one continuous movement of the
   * finger and must not have a seam in it. Returns null if the piece is not in
   * the tray, which is the honest answer to a double-fired pointer event.
   */
  deploy(pieceId: PieceId, world: Point): number | null {
    if (!this.inTray.delete(pieceId)) return null;

    const clusterId = this.board.clusterIdOf(pieceId);
    const piece = this.board.piece(pieceId);
    this.board.moveCluster(clusterId, world.x - piece.w / 2, world.y - piece.h / 2);
    this.rebuild();

    this.emit({ type: 'deploy', pieceId, clusterId });
    return clusterId;
  }

  /**
   * Deploy several pieces at once, each onto its own origin.
   *
   * Returns the ids that actually left the tray — a piece already on the mat is
   * skipped rather than moved, which keeps a double-fired pull-out harmless.
   */
  deployMany(pieceIds: readonly PieceId[], origins: readonly Point[]): PieceId[] {
    const taken: PieceId[] = [];

    pieceIds.forEach((pieceId, index) => {
      const origin = origins[index];
      if (!origin) return;
      if (!this.inTray.delete(pieceId)) return;

      const clusterId = this.board.clusterIdOf(pieceId);
      this.board.moveCluster(clusterId, origin.x, origin.y);
      taken.push(pieceId);
      this.emit({ type: 'deploy', pieceId, clusterId });
    });

    if (taken.length > 0) this.rebuild();
    return taken;
  }

  /**
   * §06's pull-out: deploy the selection and group it under one label.
   *
   * Returns the workset id, or -1 when fewer than two pieces made it out. It
   * **never merges** — the pieces are laid out in a grid, so their relative
   * offsets are wrong by construction and a union-find merge would hand
   * `resolveSnap` geometry that quietly resolves against nothing real.
   */
  pullOut(pieceIds: readonly PieceId[], origins: readonly Point[]): number {
    const taken = this.deployMany(pieceIds, origins);
    const id = this.worksets.create(taken);
    if (id !== -1) this.emit({ type: 'worksetChanged' });
    return id;
  }

  setWorksetCollapsed(worksetId: number, collapsed: boolean): void {
    this.worksets.setCollapsed(worksetId, collapsed);
    this.rebuild();
    this.emit({ type: 'worksetChanged' });
  }

  /** A piece's world box — what the group outline is built from. */
  boxOf(pieceId: PieceId): Rect | null {
    if (this.inTray.has(pieceId)) return null;
    const origin = this.board.worldOf(pieceId);
    const piece = this.board.piece(pieceId);
    return { x: origin.x, y: origin.y, w: piece.w, h: piece.h };
  }

  groupBounds(worksetId: number): Rect | null {
    const group = this.worksets.get(worksetId);
    if (!group) return null;
    return worksetBounds(group.pieceIds, (id) => this.boxOf(id));
  }

  /**
   * Drag a whole group by its label chip.
   *
   * A loop over members and nothing else, because a Workset stores no position
   * of its own. There is no group frame to keep in step.
   */
  moveWorksetBy(worksetId: number, dx: number, dy: number): void {
    const group = this.worksets.get(worksetId);
    if (!group) return;

    const moved = new Set<number>();
    for (const pieceId of group.pieceIds) {
      const clusterId = this.board.clusterIdOf(pieceId);
      if (moved.has(clusterId)) continue;
      moved.add(clusterId);
      this.board.moveClusterBy(clusterId, dx, dy);
      this.syncCluster(clusterId);
    }
  }

  /**
   * Put a single piece back in the tray.
   *
   * Only ever a cluster of one. An island dropped on the tray is refused and
   * stays exactly where it was dropped (§05) — the tray is a list of pieces, and
   * §06 is explicit that islands live on the mat, not in it.
   */
  returnToTray(clusterId: number, pin = false): boolean {
    if (clusterId === BOARD_CLUSTER) return false;
    const cluster = this.board.cluster(clusterId);
    if (cluster.pieceIds.length !== 1) return false;

    const pieceId = cluster.pieceIds[0]!;
    if (this.held === clusterId) this.held = null;
    this.cancelSettlesFor(clusterId);
    this.inTray.add(pieceId);
    // Back in the tray is out of the group. One of the three exits in §06.
    this.worksets.remove(pieceId);
    this.rebuild();

    this.emit({ type: 'return', pieceId, pinned: pin });
    return true;
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

      // §06's third exit: released clear of its group's box, the piece leaves it.
      // World-space, so zooming in has not changed what counts as leaving.
      for (const pieceId of pieceIds) {
        const group = this.worksets.worksetOf(pieceId);
        if (!group) continue;
        const others = group.pieceIds.filter((id) => id !== pieceId);
        const bounds = worksetBounds(others, (id) => this.boxOf(id));
        const box = this.boxOf(pieceId);
        if (!bounds || !box) continue;
        if (escapedBounds(box, bounds, WORKSET_DROP_TOLERANCE)) {
          this.worksets.remove(pieceId);
          this.emit({ type: 'worksetChanged' });
        }
      }

      this.emit({ type: 'miss' });
      return;
    }

    const result = applySnap(this.board, clusterId, candidate, this.snapOptions());

    // Where that frame ended up. Read back from a piece rather than re-derived,
    // so the spring lands on whatever the union-find actually decided.
    const survivor = this.board.cluster(result.survivorId);

    // Merged is out of the group (§06) — the whole survivor, not just the
    // dragged side. The stationary piece a drag lands on is every bit as
    // merged as the piece that moved, and `pieceIds` (captured pre-merge)
    // only ever names the dragged cluster. Done here rather than in
    // `board.ts`, which must stay unaware that Worksets exist at all.
    for (const pieceId of survivor.pieceIds) this.worksets.remove(pieceId);
    this.emit({ type: 'worksetChanged' });

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

    const groups: SceneGroup[] = [];
    for (const group of this.worksets.all()) {
      const bounds = worksetBounds(group.pieceIds, (id) => this.boxOf(id));
      if (!bounds) continue;
      groups.push({
        id: group.id,
        label: group.label,
        collapsed: group.collapsed,
        // A collapsed group has no drawn members, so its box is the chip's
        // anchor and nothing more — the outline shrinks to the label.
        bounds: group.collapsed ? { ...bounds, w: 0, h: 0 } : bounds,
        kind: 'workset',
      });
    }

    const posed = this.settlingPoses();

    for (const piece of this.board.pieces) {
      // The tray is not the mat. A piece here would draw itself sitting in its
      // own slot, and the board would look solved before it was touched.
      if (this.inTray.has(piece.id)) continue;
      // Collapsed to the chip, to reclaim mat space (§05).
      if (this.worksets.isHidden(piece.id)) continue;

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
      groups,
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
      // Tray pieces are parked on their own slots and would otherwise be the
      // best neighbour on the board. See `SnapOptions.eligible`.
      eligible: this.onMat,
    };
  }

  /** Bound once: it is handed to snap resolution on every release. */
  private readonly onMat = (clusterId: number): boolean => {
    if (clusterId === BOARD_CLUSTER) return true;
    const cluster = this.board.clusters.get(clusterId);
    if (!cluster) return false;
    return !cluster.pieceIds.some((id) => this.inTray.has(id));
  };

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
      if (this.board.isPlaced(id) || this.inTray.has(id)) continue;
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
