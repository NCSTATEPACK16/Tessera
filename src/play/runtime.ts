/**
 * The board runtime — everything under the chrome, wired together and pumped.
 *
 * This is the file React mounts and then leaves alone. **The board never
 * re-renders through React** (§03), so nothing in here is a component and
 * nothing in here holds React state; what crosses back is a handful of numbers
 * that change at human speed, pushed through `notify`.
 *
 * The frame loop is the one from the step-2 harness, unchanged in substance:
 * draw while a spring is running or a finger is down, and stop dead otherwise.
 * "On an idle board with no finger down the app draws nothing at all" is a
 * property of this loop, not of the renderer.
 */

import type { Point, Rect, Size } from '@/core/geom';
import { cutInWorker } from '@/cut/cut-client';
import type { CutPiece, PieceId } from '@/cut/types';
import type { SnapDifficulty } from '@/board/snap';
import { AudioEngine } from '@/audio/engine';
import { BoardControls } from '@/input/board-controls';
import type { HintTier, PuzzleMode } from '@/play/hints';
import { gridLayout } from '@/play/layout';
import { PlaySession } from '@/play/session';
import type { PlayEvent } from '@/play/session';
import type { AccentTokens } from '@/render/accent';
import { extractAccent, fallbackAccentTokens } from '@/render/accent';
import { TrayModel } from '@/tray/tray';
import {
  REGION_LENS_ZOOM,
  clampZoom,
  createCamera,
  fitCameraToBounds,
  fitScale,
  insetWorldRect,
  relativeZoom,
  screenToWorld,
  visibleWorldBounds,
  worldToScreen,
} from '@/render/camera';
import type { Camera } from '@/render/camera';
import { GROUP_CHIP, groupChipRect } from '@/render/group-chip';
import { Renderer } from '@/render/renderer';
import { emptyScene } from '@/render/scene';
import type { Scene, ScenePiece } from '@/render/scene';
import type { PuzzleAssists } from '@/play/setup';

/**
 * How long the camera must be still before the Region lens re-reads it.
 *
 * Not per frame, deliberately. Region membership feeds React, and recomputing it
 * during a pinch would re-render the tray on every frame of the gesture — the
 * exact thing keeping the board out of React was for.
 */
const REGION_SETTLE_MS = 160;

export interface RuntimeSummary {
  status: 'cutting' | 'playing' | 'failed';
  cut: { done: number; total: number; cols: number; rows: number };
  placed: number;
  total: number;
  regionUnlocked: boolean;
  /** Ticks when the visible region has settled somewhere new. */
  regionRevision: number;
  /** Ticks whenever a piece changed hands, so the tray re-reads itself. */
  trayRevision: number;
  /** §07: the loose mat piece a hint would act on, or null. Set by a tap. */
  hintTarget: PieceId | null;
  hintsUsed: number;
  /** §13: the fallback until the cut finishes and the real photo is extracted from. */
  accent: AccentTokens;
}

export interface PlayRuntimeOptions {
  container: HTMLElement;
  source: ImageBitmap;
  seed: number;
  targetCount: number;
  difficulty?: SnapDifficulty;
  rotation?: boolean;
  /** Step 5b's four assists, chosen on the setup screen. Every field defaults off. */
  assists?: PuzzleAssists;
  reducedMotion?: boolean;
  sound?: boolean;
  /** Viewport coordinates over the tray, so a drop there goes back into it. */
  isOverTray?: (client: Point) => boolean;
  /**
   * Viewport coordinates over the shelf (§06), so a drop there pins rather than
   * just returning. A predicate, like `isOverTray`, because only React knows
   * where its own elements are — the board's release path stays unaware a shelf
   * exists, and `board-controls.ts` gains nothing.
   */
  isOverShelf?: (client: Point) => boolean;
  /** The tray collapses to peek while a piece is out of it (§06). */
  onDragStateChange?: (dragging: boolean) => void;
  notify: (summary: RuntimeSummary) => void;
}

export class PlayRuntime {
  private readonly renderer: Renderer;
  private readonly audio = new AudioEngine();
  private readonly pieces = new Map<PieceId, CutPiece>();

  session: PlaySession | null = null;
  tray: TrayModel | null = null;
  private controls: BoardControls | null = null;

  private camera: Camera = createCamera();
  private boardW = 0;
  private boardH = 0;
  private pathScale = 1;

  /** Drawn while the cut is still running, before the session can exist (§04). */
  private materialising: ScenePiece[] = [];

  private pumping = false;
  private lastFrameMs = 0;
  private regionTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  /**
   * How much of the canvas the chrome is sitting on top of, in CSS pixels.
   *
   * The docked tray is a flex sibling and takes its width out of the canvas, so
   * it contributes nothing here. The iPhone sheet is a fixed overlay *across* the
   * canvas, so it contributes its height — and getting this wrong deals every
   * pulled-out piece behind the sheet, where a drop returns it to the tray.
   */
  private insets = { left: 0, right: 0, top: 0, bottom: 0 };

  /**
   * A 2D context kept only to measure text.
   *
   * Built once and never drawn to. `groupChipRect` takes an injected measurer so
   * it stays pure and testable; this is what the runtime injects, and the
   * renderer injects its own live context instead.
   */
  private measurer: CanvasRenderingContext2D | null = null;

  private readonly summary: RuntimeSummary = {
    status: 'cutting',
    cut: { done: 0, total: 0, cols: 0, rows: 0 },
    placed: 0,
    total: 0,
    regionUnlocked: false,
    regionRevision: 0,
    trayRevision: 0,
    hintTarget: null,
    hintsUsed: 0,
    accent: fallbackAccentTokens(),
  };

  /** §07: the loose mat piece the last tap selected, or null. */
  private hintTarget: PieceId | null = null;
  /**
   * No mode-select screen exists yet (step 5), so there is nowhere for a
   * player to reach Zen or Daily from. Hardcoded rather than plumbed through
   * `PlayRuntimeOptions` on a guess at that screen's shape — `hints.ts`
   * already takes `mode` as a parameter, so this is the one line that moves
   * when step 5 adds real mode selection.
   */
  private readonly mode: PuzzleMode = 'classic';

  constructor(private readonly options: PlayRuntimeOptions) {
    this.renderer = new Renderer({ container: options.container });
  }

  // -------------------------------------------------------------------------

  async start(): Promise<void> {
    try {
      const result = await cutInWorker({
        source: this.options.source,
        seed: this.options.seed,
        targetCount: this.options.targetCount,
        handlers: {
          onGrid: (grid) => {
            this.boardW = grid.boardW;
            this.boardH = grid.boardH;
            this.pathScale = grid.scale;
            // The real computed number, never the target (§04).
            this.patch({ cut: { done: 0, total: grid.count, cols: grid.cols, rows: grid.rows } });
            this.frameContent();
            this.render();
          },
          onPieces: (batch, done, total) => {
            this.materialise(batch);
            this.patch({ cut: { ...this.summary.cut, done, total } });
            this.render();
          },
          onError: (message) => console.error('[cut]', message),
        },
      });

      if (this.destroyed) return;
      this.build(result.pieces);
    } catch (error) {
      console.error(error);
      this.patch({ status: 'failed' });
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.regionTimer !== null) clearTimeout(this.regionTimer);
    this.controls?.destroy();
    this.renderer.destroy();
    this.audio.suspend();
  }

  /** §08: unlock on the first deliberate tap, never before. */
  unlockAudio(): void {
    void this.audio.unlock();
  }

  /** §05: `interrupted` is a first-class state, not an error path. */
  interrupt(): void {
    this.controls?.interrupt();
    this.audio.suspend();
  }

  resize(): void {
    this.renderer.resize();
    this.render();
    this.scheduleRegion();
  }

  fit(): void {
    this.controls?.camera.fit();
    this.render();
    this.scheduleRegion();
  }

  bitmapOf(pieceId: PieceId): ImageBitmap | null {
    return this.pieces.get(pieceId)?.bitmap ?? null;
  }

  /** The visible world rectangle, or null while the Region lens is locked (§06). */
  visibleRegion(): Rect | null {
    if (this.boardW <= 0) return null;
    const fit = fitScale(this.viewport, this.boardW, this.boardH);
    if (relativeZoom(this.camera.zoom, fit) < REGION_LENS_ZOOM) return null;
    return visibleWorldBounds(this.camera, this.viewport);
  }

  /**
   * Take a piece out of the tray and hand the live pointer to the board.
   *
   * The seam between DOM and canvas is here, and the whole of §06's drag-out
   * depends on it being invisible: deploy on the same event the tray promoted
   * on, adopt the same pointer, and from the next move onward it is an ordinary
   * board drag with the same spring and the same audio at the end of it.
   */
  pullFromTray(pieceId: PieceId, event: PointerEvent): boolean {
    const session = this.session;
    const controls = this.controls;
    if (!session || !controls) return false;

    const rect = this.options.container.getBoundingClientRect();
    const world = screenToWorld(this.camera, this.viewport, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });

    const clusterId = session.deploy(pieceId, world);
    if (clusterId === null) return false;

    if (!controls.adoptPointer(event, clusterId)) {
      // Camera won the arbitration. The piece stays on the mat where it was
      // taken out — never snapped back, never left half in the tray.
      this.bumpTray();
      this.wake();
      return false;
    }

    this.tray?.touch(pieceId);
    // Pin is a tray-only attribute and is cleared on deploy (spec §3). A piece
    // dragged to the mat is simply on the mat, and returning it does not
    // restore the pin — one less piece of state to keep coherent.
    this.tray?.unpin(pieceId);
    this.options.onDragStateChange?.(true);
    this.bumpTray();
    this.wake();
    return true;
  }

  /** Pan the camera to a piece the Recent lens found on the mat (§06). */
  locate(pieceId: PieceId): void {
    const session = this.session;
    if (!session || session.locationOf(pieceId) !== 'mat') return;

    const origin = session.board.worldOf(pieceId);
    const piece = session.board.piece(pieceId);
    this.camera = { ...this.camera, x: origin.x + piece.w / 2, y: origin.y + piece.h / 2 };
    this.render();
    this.scheduleRegion();
  }

  setTrayInsets(insets: { left: number; right: number; top: number; bottom: number }): void {
    this.insets = insets;
  }

  /**
   * §07: a press on the board that lifted without becoming a drag. Only a
   * lone loose piece is a valid hint target — an island or a placed piece
   * (which `pickCluster` should never hand back, since the board is anchored)
   * is not "a loose piece" in the sense the hint button means it.
   */
  private onBoardTap(clusterId: number): void {
    const session = this.session;
    if (!session) return;

    const cluster = session.board.cluster(clusterId);
    if (cluster.pieceIds.length !== 1) return;
    const pieceId = cluster.pieceIds[0]!;
    if (session.board.isPlaced(pieceId)) return;

    this.hintTarget = pieceId;
    this.patch({ hintTarget: pieceId });
  }

  /**
   * Fire a hint at `tier` for the last-tapped piece. False (spending nothing)
   * if there is no target or the economy can't afford it — the hint button
   * decides what that looks like.
   */
  fireHint(tier: HintTier): boolean {
    const session = this.session;
    if (!session || this.hintTarget === null) return false;

    const pieceId = this.hintTarget;
    const piece = this.pieces.get(pieceId);
    // The target may have been placed by an ordinary drag since it was
    // tapped — stale rather than wrong, so refuse quietly rather than firing
    // a hint at a piece that no longer needs one.
    if (!piece || session.board.isPlaced(pieceId)) {
      this.hintTarget = null;
      this.patch({ hintTarget: null });
      return false;
    }

    const now = performance.now();
    const ok = session.useHint(pieceId, tier, this.mode, now);
    if (!ok) return false;

    if (tier === 1) {
      // §07: "3×3-piece region", approximated as a square centred on the
      // piece rather than snapped to the true grid — the feather already
      // makes an exact slot illegible, so the region's precise edges are not
      // load-bearing the way the outline's are.
      const cx = piece.targetX + piece.worldW / 2;
      const cy = piece.targetY + piece.worldH / 2;
      this.renderer.fireHintGlow(
        { x: cx - 1.5 * piece.worldW, y: cy - 1.5 * piece.worldH, w: 3 * piece.worldW, h: 3 * piece.worldH },
        now,
      );
    } else if (tier === 2) {
      this.renderer.fireHintOutline(
        { x: piece.targetX, y: piece.targetY, w: piece.worldW, h: piece.worldH },
        now,
      );
    } else {
      // Tier 3 placed it — it is no longer a loose piece to target.
      this.hintTarget = null;
    }

    this.patch({ hintTarget: this.hintTarget, hintsUsed: session.summary.hintsUsed });
    this.wake();
    return true;
  }

  /** The part of the mat the player can actually see and reach, in world units. */
  safeWorldRect(): Rect {
    return insetWorldRect(this.camera, this.viewport, this.insets);
  }

  /**
   * §06's pull-out. Lays the selection out on the safe rect and groups it.
   *
   * Not a drag: this is a button press, so no pointer is adopted and nothing is
   * handed to `BoardControls`. The pieces simply arrive, already workable.
   */
  pullOut(pieceIds: readonly PieceId[]): number {
    const session = this.session;
    if (!session || pieceIds.length < 2) return -1;

    const first = pieceIds[0]!;
    const piece = session.board.piece(first);
    const origins = gridLayout(pieceIds.length, piece.w, piece.h, this.safeWorldRect());

    const id = session.pullOut(pieceIds, origins);
    for (const pieceId of pieceIds) {
      this.tray?.touch(pieceId);
      // Pin is a tray-only attribute and is cleared on deploy (spec §3). A piece
      // dragged to the mat is simply on the mat, and returning it does not
      // restore the pin — one less piece of state to keep coherent.
      this.tray?.unpin(pieceId);
    }
    this.bumpTray();
    this.wake();
    return id;
  }

  /**
   * The group chip under a screen point, or null.
   *
   * The first non-piece hit target in the app. Geometry comes from
   * `groupChipRect`, the same function the renderer draws with — canvas retains
   * no scene graph to ask, so a shared function is what keeps the tap target and
   * the drawn chip from drifting apart.
   *
   * A DOM chip would avoid the question entirely and re-render the tray sixty
   * times a second during a drag, which is precisely what keeping the board out
   * of React was for.
   */
  groupChipAt(screen: Point): number | null {
    const session = this.session;
    if (!session) return null;

    for (const group of session.scene().groups) {
      const at = worldToScreen(this.camera, this.viewport, {
        x: group.bounds.x,
        y: group.bounds.y,
      });
      const rect = groupChipRect(group.label, group.collapsed, at, (t) =>
        this.measureChipText(t),
      );
      if (
        screen.x >= rect.x &&
        screen.x <= rect.x + rect.w &&
        screen.y >= rect.y &&
        screen.y <= rect.y + rect.h
      ) {
        return group.id;
      }
    }
    return null;
  }

  toggleGroupCollapsed(id: number): void {
    const session = this.session;
    const group = session?.worksets.get(id);
    if (!session || !group) return;
    session.setWorksetCollapsed(id, !group.collapsed);
    this.bumpTray();
    this.wake();
  }

  /** Tap-to-rename (§06). A relabel, not a structural change — no tray bump. */
  renameGroup(id: number, label: string): void {
    this.session?.worksets.rename(id, label);
    this.wake();
  }

  groupLabel(id: number): string | null {
    return this.session?.worksets.get(id)?.label ?? null;
  }

  // -------------------------------------------------------------------------

  private get viewport(): Size {
    return this.renderer.size;
  }

  private measureChipText(text: string): number {
    if (!this.measurer) {
      const ctx = document.createElement('canvas').getContext('2d');
      if (!ctx) return text.length * 7;
      ctx.font = GROUP_CHIP.font;
      this.measurer = ctx;
    }
    return this.measurer.measureText(text).width;
  }

  private build(cut: CutPiece[]): void {
    for (const piece of cut) this.pieces.set(piece.id, piece);

    const session = new PlaySession({
      pieces: cut,
      boardW: this.boardW,
      boardH: this.boardH,
      pathScale: this.pathScale,
      ...(this.options.difficulty ? { difficulty: this.options.difficulty } : {}),
      ...(this.options.rotation !== undefined ? { rotation: this.options.rotation } : {}),
      ...(this.options.reducedMotion !== undefined
        ? { reducedMotion: this.options.reducedMotion }
        : {}),
      onEvent: (event) => this.onPlayEvent(event),
    });

    this.session = session;
    this.tray = new TrayModel({
      pieces: cut,
      seed: this.options.seed,
      locationOf: (id) => session.locationOf(id),
    });

    const assists = this.options.assists;

    this.controls = new BoardControls({
      element: this.options.container,
      session,
      getViewport: () => this.viewport,
      getCamera: () => this.camera,
      setCamera: (next) => {
        this.camera = next;
        this.render();
        this.scheduleRegion();
      },
      getBoard: () => ({ w: this.boardW, h: this.boardH }),
      minRelativeZoom: assists?.largePieceMode ? REGION_LENS_ZOOM : undefined,
      onChange: () => this.wake(),
      interceptRelease: ({ clusterId, client }) => {
        this.options.onDragStateChange?.(false);
        if (!this.options.isOverTray?.(client)) return false;
        // Aimed at the tray, so it goes back in. This is not bounce-back — the
        // player chose a destination and the piece went there.
        // Pinning is that same test, one region smaller (§06). The board's
        // release path stays unaware a shelf exists; `board-controls.ts` gains
        // nothing.
        const pin = this.options.isOverShelf?.(client) ?? false;
        const returned = session.returnToTray(clusterId, pin);
        if (returned) this.bumpTray();
        return returned;
      },
      onTap: (clusterId) => this.onBoardTap(clusterId),
    });

    this.materialising = [];
    // Never lets extraction block the start of play (§13): `extractAccent`
    // itself cannot throw, but this stays outside `try`-free code paths on
    // purpose — a broken accent is a wrong colour, never a blocked puzzle.
    const accent = extractAccent(cut, this.options.seed);
    this.renderer.setAccent(accent.accent);
    this.renderer.setGhostUnderlay(
      assists && assists.ghostOpacity > 0 ? this.options.source : null,
      assists?.ghostOpacity ?? 0,
    );
    this.renderer.setEdgeHighlight(assists?.edgeHighlight ?? false);
    this.patch({ status: 'playing', placed: 0, total: session.summary.total, accent });
    this.frameContent();
    this.render();
    this.scheduleRegion();
  }

  private onPlayEvent(event: PlayEvent): void {
    const now = performance.now();

    if (this.options.sound !== false) {
      switch (event.type) {
        case 'grab':
          void this.audio.play('pickup', { nowMs: now });
          break;
        case 'snap':
          // A merge that pulled in more than the piece itself is a chord, not a
          // note, voiced by how much just joined (§08).
          this.audio.play(event.mergedClusters > 1 ? 'groupMerge' : 'snap', {
            clusterSize: event.mergedSize,
            nowMs: now,
          });
          break;
        case 'miss':
          this.audio.play('invalidDrop', { nowMs: now });
          break;
        case 'edgeFrame':
          this.audio.play('edgeFrame', { nowMs: now });
          break;
        case 'complete':
          this.audio.play('completion', { nowMs: now });
          break;
        case 'hint':
          this.audio.play('hint', { nowMs: now });
          break;
        case 'deploy':
        case 'return':
          // Silent. Moving a piece between the tray and the mat is navigation,
          // and §08's ladder is reserved for contact with the puzzle itself.
          break;
      }
    }

    // Not gated on `sound`: the light payoff is a separate channel from audio,
    // and muting one has no reason to mute the other (§07/§08 are independent).
    if (event.type === 'complete') this.renderer.completePuzzle(now);
    if (event.type === 'snap' && event.seam) this.renderer.fireMergeSeam(event.seam, now);
    if (event.type === 'edgeFrame') this.renderer.fireEdgeFrame(now);

    if (event.type === 'snap' && event.placed) {
      for (const piece of this.session!.board.cluster(0).pieceIds) this.tray?.place(piece);
    }
    // Applied from the event rather than at each `returnToTray` call site: the
    // event is the one place every return path converges, present and future,
    // so a caller added later cannot forget to pin (§06).
    if (event.type === 'return' && event.pinned) this.tray?.pin(event.pieceId);
    if (event.type === 'snap' || event.type === 'deploy' || event.type === 'return') {
      this.bumpTray();
    }
    if (this.session) {
      const { placed, total, hintsUsed } = this.session.summary;
      this.patch({ placed, total, hintsUsed });
    }
  }

  private materialise(batch: CutPiece[]): void {
    // §04 asks for pieces materialising onto the mat as they arrive from the
    // worker. With the tray as home (§06) they land in a loose band beneath the
    // board rather than scattered over it, so the first thing the player sees is
    // the board they are about to fill rather than a mess on top of it.
    const perRow = Math.max(1, Math.ceil(Math.sqrt(batch.length * 4)));
    for (const [i, piece] of batch.entries()) {
      const index = this.materialising.length;
      this.materialising.push({
        id: piece.id,
        x: (index % perRow) * 0.24,
        y: this.boardH + 0.6 + Math.floor(index / perRow) * 0.24,
        w: piece.worldW,
        h: piece.worldH,
        rot: 0,
        bitmap: piece.bitmap,
        path: piece.path,
        pathScale: this.pathScale,
      });
      void i;
    }
  }

  private frameContent(): void {
    if (this.boardW <= 0 || this.boardH <= 0) return;
    const bounds = this.session
      ? this.session.contentBounds()
      : { x: 0, y: 0, w: this.boardW, h: this.boardH };
    const framed = fitCameraToBounds(this.viewport, bounds);
    this.camera = {
      ...framed,
      zoom: clampZoom(
        framed.zoom,
        fitScale(this.viewport, this.boardW, this.boardH),
        this.options.assists?.largePieceMode ? REGION_LENS_ZOOM : undefined,
      ),
    };
  }

  private render(): void {
    const scene: Scene = this.session
      ? this.session.scene()
      : {
          ...emptyScene(),
          boardW: this.boardW,
          boardH: this.boardH,
          loose: [...this.materialising],
        };
    this.renderer.draw(scene, this.camera);
  }

  private wake(): void {
    if (this.pumping || this.destroyed) return;
    this.pumping = true;
    this.lastFrameMs = 0;
    this.renderer.startAnimating('play');
    requestAnimationFrame(this.pump);
  }

  private readonly pump = (now: number): void => {
    if (this.destroyed) return;

    const dt = this.lastFrameMs === 0 ? 1000 / 60 : now - this.lastFrameMs;
    this.lastFrameMs = now;

    this.controls?.tick(now);
    this.audio.tick(now);
    const stillMoving = this.session?.advance(dt) ?? false;
    // `pressing` counts as busy, or the 120ms long-press timer never gets a tick
    // to fire on — a finger held still would be a finger nothing is listening to.
    const phase = this.controls?.machine.phase;
    const handDown = phase === 'dragging' || phase === 'pressing';

    this.render();

    if (stillMoving || handDown) {
      requestAnimationFrame(this.pump);
    } else {
      this.pumping = false;
      this.lastFrameMs = 0;
      this.renderer.stopAnimating('play');
    }
  };

  /**
   * Re-read the Region lens once the camera has been still for a moment.
   *
   * Debounced rather than per-frame: this call crosses into React, and a pinch
   * that published on every frame would re-render the tray sixty times a second.
   */
  private scheduleRegion(): void {
    if (this.regionTimer !== null) clearTimeout(this.regionTimer);
    this.regionTimer = setTimeout(() => {
      this.regionTimer = null;
      if (this.destroyed) return;

      const region = this.visibleRegion();
      const unlocked = region !== null;
      this.patch({
        regionUnlocked: unlocked,
        regionRevision: this.summary.regionRevision + 1,
      });
    }, REGION_SETTLE_MS);
  }

  private bumpTray(): void {
    this.patch({ trayRevision: this.summary.trayRevision + 1 });
  }

  private patch(next: Partial<RuntimeSummary>): void {
    Object.assign(this.summary, next);
    this.options.notify({ ...this.summary, cut: { ...this.summary.cut } });
  }
}
