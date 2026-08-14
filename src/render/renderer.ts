/**
 * The board renderer — Canvas 2D, five-layer stack (design doc §03).
 *
 * The public surface is deliberately one method, `draw(scene, camera)`, with a
 * plain-data scene. That is the seam a WebGL backend slots into the day
 * 1000-piece boards ship; until then a per-frame `drawImage` loop over
 * pre-rendered piece bitmaps is both cheaper and less risky at the 250-piece
 * ceiling.
 *
 * Layers and their redraw rates:
 *   mat      on resize            finish texture and vignette
 *   static   on placement         placed pieces plus the baked bloom mask
 *   dynamic  60fps while active   loose pieces, islands, the held cluster
 *   overlay  60fps while active   X-Ray dimming, drag shadow, selection rings
 *
 * Chrome is the fifth layer and is not here at all — it is React DOM, never
 * inside the canvas.
 */

import type { Rect, Size } from '@/core/geom';
import { toPath2D } from '@/core/geom';
import type { Camera } from './camera';
import { visibleWorldBounds, worldToScreen } from './camera';
import { FrameScheduler } from './frame-scheduler';
import type { LayerName } from './frame-scheduler';
import { GROUP_CHIP, groupChipRect, groupChipText } from './group-chip';
import {
  COMPLETION_HOLD_MS,
  COMPLETION_RAMP_MS,
  EDGE_FRAME_TRACE_MS,
  HINT_GLOW_DECAY_END_MS,
  MERGE_SEAM_DURATION_MS,
  completionIntensity,
  edgeFrameProgress,
  hintGlowIntensity,
  mergeSeamIntensity,
  progressBloomIntensity,
} from './light';
import { drawMat } from './mat';
import type { Scene, ScenePiece } from './scene';
import { emptyScene } from './scene';

/** §07's outline holds roughly as long as the glow it accompanies. */
const HINT_OUTLINE_HOLD_MS = HINT_GLOW_DECAY_END_MS;
/** Fallback accent, matching `ACCENT_FALLBACK` in `render/accent.ts` — used until `setAccent` is called. */
const DEFAULT_ACCENT = 'rgba(111, 168, 255, 0.9)';
/** World-space stroke weight for the edge-highlight assist, before the /zoom conversion. */
const EDGE_HIGHLIGHT_WIDTH = 2;

/** §C Track 3: one ghost-underlay slot, world units, with its own adaptive alpha. */
export interface GhostSlot {
  x: number;
  y: number;
  w: number;
  h: number;
  alpha: number;
}

export interface RendererStats {
  frames: number;
  /** Pieces drawn on the last dynamic pass, after culling. */
  lastDynamicCount: number;
  lastStaticCount: number;
  lastFrameMs: number;
}

export interface RendererOptions {
  container: HTMLElement;
  pixelRatio?: number;
}

interface Layer {
  name: LayerName;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

/** How far outside the viewport a piece is still drawn, in world units. */
const CULL_MARGIN = 1;

export class Renderer {
  private readonly layers: Layer[] = [];
  private readonly byName = new Map<LayerName, Layer>();
  private readonly scheduler: FrameScheduler;

  private viewport: Size = { w: 0, h: 0 };
  private pixelRatio: number;
  private scene: Scene = emptyScene();
  private camera: Camera = { x: 0, y: 0, zoom: 1 };

  /** Scratch canvas for the light system's downsample-and-blur pass (§07). */
  private readonly bloomCanvas = document.createElement('canvas');
  /** `performance.now()` timestamp `completePuzzle` was called, or null before completion. */
  private completionStartMs: number | null = null;
  /** Tier 1's localised region, world units, or null when no hint is active. */
  private hintGlowRect: Rect | null = null;
  private hintGlowStartMs: number | null = null;
  /** Tier 2's exact slot outline, world units, or null. */
  private hintOutlineRect: Rect | null = null;
  private hintOutlineStartMs: number | null = null;
  /** §13: the photo's own accent, written by `setAccent`. `DEFAULT_ACCENT` until then. */
  private accentColor = DEFAULT_ACCENT;
  /** §07's merge seam, world units, or null when no merge is animating. */
  private mergeSeamRect: Rect | null = null;
  private mergeSeamStartMs: number | null = null;
  /** §09's edge-frame trace, or null when it has not fired / has finished. */
  private edgeFrameStartMs: number | null = null;
  /** Step 5b's ghost-underlay assist: the source photo, drawn under placed pieces. */
  private ghostBitmap: ImageBitmap | null = null;
  private ghostOpacity = 0;
  /** §C Track 3's adaptive per-slot alpha, or null when the caller has none built. */
  private ghostSlots: readonly GhostSlot[] | null = null;
  /** Step 5b's edge-highlight assist, and its lazily built per-piece outline cache. */
  private edgeHighlightEnabled = false;
  private readonly edgePaths = new Map<number, Path2D>();

  readonly stats: RendererStats = {
    frames: 0,
    lastDynamicCount: 0,
    lastStaticCount: 0,
    lastFrameMs: 0,
  };

  constructor(private readonly options: RendererOptions) {
    this.pixelRatio = options.pixelRatio ?? Math.min(globalThis.devicePixelRatio || 1, 2);

    for (const name of ['mat', 'static', 'dynamic', 'overlay'] as const) {
      const canvas = document.createElement('canvas');
      canvas.dataset['layer'] = name;
      Object.assign(canvas.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        // Or Safari steals pinch and pan from us (§ Phase 0 risks).
        touchAction: 'none',
      } satisfies Partial<CSSStyleDeclaration>);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error(`Renderer: no 2d context for layer "${name}"`);

      const layer: Layer = { name, canvas, ctx };
      this.layers.push(layer);
      this.byName.set(name, layer);
      options.container.appendChild(canvas);
    }

    this.scheduler = new FrameScheduler({
      onFrame: (dirty) => this.paint(dirty),
    });

    this.resize();
  }

  /**
   * The whole public surface. Swaps in the new scene and camera and marks what
   * changed — it does not draw synchronously, because drawing is the
   * scheduler's decision.
   */
  draw(scene: Scene, camera: Camera): void {
    const cameraMoved =
      camera.x !== this.camera.x || camera.y !== this.camera.y || camera.zoom !== this.camera.zoom;
    const boardChanged = scene.boardW !== this.scene.boardW || scene.boardH !== this.scene.boardH;
    const placedChanged = scene.placed !== this.scene.placed || scene.completion !== this.scene.completion;
    const finishChanged = scene.finish !== this.scene.finish;

    this.scene = scene;
    this.camera = { ...camera };

    if (finishChanged) this.scheduler.invalidate('mat');
    // A camera move changes where the placed pieces sit on screen, so the static
    // layer is not exempt from it — it is exempt only from *time*.
    if (placedChanged || cameraMoved || boardChanged) this.scheduler.invalidate('static');
    this.scheduler.invalidate('dynamic', 'overlay');
  }

  /** Hold the frame loop open — a drag, a spring, a breathing hint glow. */
  startAnimating(source: string): void {
    this.scheduler.startAnimating(source);
  }

  stopAnimating(source: string): void {
    this.scheduler.stopAnimating(source);
  }

  /**
   * §07's completion payoff. Call once, from `PlayEvent.complete` — the ramp,
   * hold, and settle all run from this single timestamp. The overlay layer
   * keeps the frame loop open until it settles, then lets it go idle again;
   * the settled glow stays on screen because canvas layers hold their last
   * drawn pixels, the same way the idle-board invariant already relies on.
   */
  completePuzzle(nowMs: number = performance.now()): void {
    this.completionStartMs = nowMs;
    this.scheduler.startAnimating('completion');
    this.scheduler.invalidate('overlay');
  }

  /** §07 Tier 1: a localised region breathes, feathered so no exact slot is legible. */
  fireHintGlow(worldRect: Rect, nowMs: number = performance.now()): void {
    this.hintGlowRect = worldRect;
    this.hintGlowStartMs = nowMs;
    this.scheduler.startAnimating('hint-glow');
    this.scheduler.invalidate('overlay');
  }

  /**
   * §07 Tier 2: the exact slot outlined at 1px in accent.
   *
   * The magnetised 6px lean toward it is not built here — it would act on the
   * held/selected piece's drawn position, and nothing in this pass currently
   * knows which piece that is versus just where the outline goes. Flagged
   * rather than faked.
   */
  fireHintOutline(worldRect: Rect, nowMs: number = performance.now()): void {
    this.hintOutlineRect = worldRect;
    this.hintOutlineStartMs = nowMs;
    this.scheduler.startAnimating('hint-outline');
    this.scheduler.invalidate('overlay');
  }

  /** §13: the extracted photo accent. Used by the edge-frame trace and the hint outline. */
  setAccent(color: string): void {
    this.accentColor = color;
  }

  /**
   * Step 5c: the static layer's canvas, for the library thumbnail.
   *
   * The static layer specifically, because that is where placed pieces are
   * baked — a thumbnail of the board is a thumbnail of what has been solved,
   * which is exactly what a library card wants to show.
   */
  getStaticCanvas(): HTMLCanvasElement {
    const layer = this.byName.get('static');
    if (!layer) throw new Error('Renderer: no static layer');
    return layer.canvas;
  }

  /**
   * Step 5b's ghost-underlay assist: a dimmed copy of the source photo, drawn
   * inside `paintStatic` under the placed pieces so it pans and zooms with the
   * board. Pass `null` (or opacity 0) to turn it off.
   *
   * `slots` (§C Track 3) is the adaptive per-piece alpha built from
   * `CutPiece.meanColor` — when present, `paintStatic` draws each slot
   * separately instead of the whole board in one pass. Omitting it keeps the
   * pre-Track-3 single-draw behaviour, so a two-argument call stays valid.
   */
  setGhostUnderlay(
    bitmap: ImageBitmap | null,
    opacity: number,
    slots: readonly GhostSlot[] | null = null,
  ): void {
    this.ghostBitmap = bitmap;
    this.ghostOpacity = opacity;
    this.ghostSlots = slots;
  }

  /** Step 5b's edge-highlight assist: stroke every piece's cut silhouette. */
  setEdgeHighlight(enabled: boolean): void {
    this.edgeHighlightEnabled = enabled;
  }

  /** §07: the newly joined seam, light-bleeding outward. Call from `PlayEvent.snap`. */
  fireMergeSeam(worldRect: Rect, nowMs: number = performance.now()): void {
    this.mergeSeamRect = worldRect;
    this.mergeSeamStartMs = nowMs;
    this.scheduler.startAnimating('merge-seam');
    this.scheduler.invalidate('overlay');
  }

  /** §09: the border traces once, clockwise from the top-left. Call from `PlayEvent.edgeFrame`. */
  fireEdgeFrame(nowMs: number = performance.now()): void {
    this.edgeFrameStartMs = nowMs;
    this.scheduler.startAnimating('edge-frame');
    this.scheduler.invalidate('overlay');
  }

  /** False on an idle board. Asserted in tests. */
  get isScheduled(): boolean {
    return this.scheduler.isScheduled;
  }

  get size(): Size {
    return { ...this.viewport };
  }

  resize(): void {
    const rect = this.options.container.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    if (w === this.viewport.w && h === this.viewport.h) return;

    this.viewport = { w, h };
    for (const layer of this.layers) {
      layer.canvas.width = Math.floor(w * this.pixelRatio);
      layer.canvas.height = Math.floor(h * this.pixelRatio);
    }
    this.scheduler.invalidateAll();
  }

  destroy(): void {
    this.scheduler.stop();
    for (const layer of this.layers) layer.canvas.remove();
    this.layers.length = 0;
    this.byName.clear();
  }

  // -------------------------------------------------------------------------

  private paint(dirty: ReadonlySet<LayerName>): void {
    const started = performance.now();

    if (dirty.has('mat')) this.paintMat();
    if (dirty.has('static')) this.paintStatic();
    if (dirty.has('dynamic')) this.paintDynamic();
    if (dirty.has('overlay')) this.paintOverlay();

    this.stats.frames = this.scheduler.frameCount;
    this.stats.lastFrameMs = performance.now() - started;
  }

  private layerContext(name: LayerName): CanvasRenderingContext2D {
    const layer = this.byName.get(name);
    if (!layer) throw new Error(`Renderer: unknown layer "${name}"`);
    const { ctx } = layer;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    return ctx;
  }

  private paintMat(): void {
    const ctx = this.layerContext('mat');
    drawMat(ctx, this.viewport.w, this.viewport.h, this.scene.finish);
  }

  private paintStatic(): void {
    const ctx = this.layerContext('static');
    ctx.clearRect(0, 0, this.viewport.w, this.viewport.h);
    this.applyCamera(ctx);
    if (this.ghostBitmap && this.ghostOpacity > 0) {
      ctx.save();
      if (this.ghostSlots && this.ghostSlots.length > 0) {
        // Per-slot alpha (§C Track 3): source rect in the bitmap's own pixel
        // space, dest rect in world units — same px-per-world-unit ratio
        // `pathScale` already names for piece outlines, computed once here
        // since the ghost bitmap's natural size and the board's world size
        // are both constant for the puzzle's lifetime.
        const pxPerUnit = this.ghostBitmap.width / this.scene.boardW;
        for (const slot of this.ghostSlots) {
          if (slot.alpha <= 0) continue;
          ctx.globalAlpha = slot.alpha;
          ctx.drawImage(
            this.ghostBitmap,
            slot.x * pxPerUnit,
            slot.y * pxPerUnit,
            slot.w * pxPerUnit,
            slot.h * pxPerUnit,
            slot.x,
            slot.y,
            slot.w,
            slot.h,
          );
        }
      } else {
        ctx.globalAlpha = this.ghostOpacity;
        ctx.drawImage(this.ghostBitmap, 0, 0, this.scene.boardW, this.scene.boardH);
      }
      ctx.restore();
    }
    this.drawBoardOutline(ctx);
    this.stats.lastStaticCount = this.drawPieces(ctx, this.scene.placed);

    // Progress bloom (§07): the same layer's own pixels, downsampled, blurred,
    // and drawn back over themselves additively — the assembled photo lights
    // itself, brighter the more of it exists. Screen space, so reset past the
    // camera transform first.
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.drawBloom(ctx, ctx.canvas, progressBloomIntensity(this.scene.completion), 4);
  }

  private paintDynamic(): void {
    const ctx = this.layerContext('dynamic');
    ctx.clearRect(0, 0, this.viewport.w, this.viewport.h);
    ctx.save();
    this.applyCamera(ctx);
    this.drawGroupOutlines(ctx);
    this.stats.lastDynamicCount = this.drawPieces(ctx, this.scene.loose);
    ctx.restore();
    // Camera unwound; the device-pixel transform is back. Screen space from here.
    this.drawGroupChips(ctx);
  }

  /**
   * §07's completion payoff: the same bloom pass as progress bloom, sourced
   * from the static layer, but global and animated rather than growing with
   * placement. Retires its own animator once settled, so the idle-board
   * invariant holds after the puzzle finishes.
   */
  private paintCompletion(ctx: CanvasRenderingContext2D): void {
    if (this.completionStartMs === null) return;

    const elapsed = performance.now() - this.completionStartMs;
    const staticCanvas = this.byName.get('static')?.canvas;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    if (staticCanvas) this.drawBloom(ctx, staticCanvas, completionIntensity(elapsed), 12);

    if (elapsed >= COMPLETION_RAMP_MS + COMPLETION_HOLD_MS) {
      this.scheduler.stopAnimating('completion');
    }
  }

  /**
   * The light system's one primitive (§07): downsample `source`, blur it, and
   * draw it back onto `ctx` with additive blending at `intensity`. Every job —
   * progress bloom, hint glow, merge seam, completion — is this same pass fed
   * a different source, intensity, and blur radius.
   */
  private drawBloom(
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource & { width: number; height: number },
    intensity: number,
    blurPx: number,
    /** CSS-px rect on `ctx` to draw into. Defaults to the full viewport. */
    dest?: Rect,
  ): void {
    if (intensity <= 0) return;
    const target = dest ?? { x: 0, y: 0, w: this.viewport.w, h: this.viewport.h };
    if (target.w <= 0 || target.h <= 0) return;

    // Local passes (hint glow, hint outline's glow) are already small in
    // screen space, so downsampling them as aggressively as a full-viewport
    // pass would blur past recognisable. Scale the factor to the crop.
    const DOWNSAMPLE = dest ? 0.6 : 0.2;
    const w = Math.max(1, Math.floor(target.w * DOWNSAMPLE));
    const h = Math.max(1, Math.floor(target.h * DOWNSAMPLE));
    if (this.bloomCanvas.width !== w) this.bloomCanvas.width = w;
    if (this.bloomCanvas.height !== h) this.bloomCanvas.height = h;
    const bctx = this.bloomCanvas.getContext('2d');
    if (!bctx) return;

    bctx.clearRect(0, 0, w, h);
    // Source-space rect mirrors `target`, mapped 1:1 in CSS px — both `source`
    // (a layer canvas) and `ctx` share this renderer's pixel ratio, so no
    // separate device-pixel conversion is needed here.
    bctx.drawImage(source, target.x, target.y, target.w, target.h, 0, 0, w, h);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = intensity;
    ctx.filter = `blur(${blurPx}px)`;
    ctx.drawImage(this.bloomCanvas, 0, 0, w, h, target.x, target.y, target.w, target.h);
    ctx.restore();
  }

  /** §07 Tier 1: a localised, feathered breathing glow around a target region. */
  private paintHintGlow(ctx: CanvasRenderingContext2D): void {
    if (this.hintGlowRect === null || this.hintGlowStartMs === null) return;

    const elapsed = performance.now() - this.hintGlowStartMs;
    const staticCanvas = this.byName.get('static')?.canvas;
    if (staticCanvas) {
      const screen = this.screenRectFeathered(this.hintGlowRect, 1.5);
      this.drawBloom(ctx, staticCanvas, hintGlowIntensity(elapsed), 6, screen);
    }

    if (elapsed >= HINT_GLOW_DECAY_END_MS) {
      this.hintGlowRect = null;
      this.hintGlowStartMs = null;
      this.scheduler.stopAnimating('hint-glow');
    }
  }

  /** §07 Tier 2: the exact slot, 1px in accent. */
  private paintHintOutline(ctx: CanvasRenderingContext2D): void {
    if (this.hintOutlineRect === null || this.hintOutlineStartMs === null) return;

    const elapsed = performance.now() - this.hintOutlineStartMs;
    if (elapsed < HINT_OUTLINE_HOLD_MS) {
      const topLeft = worldToScreen(this.camera, this.viewport, this.hintOutlineRect);
      const w = this.hintOutlineRect.w * this.camera.zoom;
      const h = this.hintOutlineRect.h * this.camera.zoom;
      ctx.save();
      ctx.strokeStyle = this.accentColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(topLeft.x, topLeft.y, w, h);
      ctx.restore();
    } else {
      this.hintOutlineRect = null;
      this.hintOutlineStartMs = null;
      this.scheduler.stopAnimating('hint-outline');
    }
  }

  /** A world rect's screen-space bounds, padded by `pieceWidths` of its own width. */
  private screenRectFeathered(worldRect: Rect, pieceWidths: number): Rect {
    const pad = worldRect.w * pieceWidths;
    const topLeft = worldToScreen(this.camera, this.viewport, {
      x: worldRect.x - pad,
      y: worldRect.y - pad,
    });
    const bottomRight = worldToScreen(this.camera, this.viewport, {
      x: worldRect.x + worldRect.w + pad,
      y: worldRect.y + worldRect.h + pad,
    });
    return {
      x: topLeft.x,
      y: topLeft.y,
      w: bottomRight.x - topLeft.x,
      h: bottomRight.y - topLeft.y,
    };
  }

  /**
   * §07: the newly joined seam, light-bleeding outward — the same
   * `drawBloom` primitive as the other three jobs, sourced from the static
   * layer and cropped tight to the seam rather than feathered wide, because
   * this one is meant to read as a line, not a region.
   */
  private paintMergeSeam(ctx: CanvasRenderingContext2D): void {
    if (this.mergeSeamRect === null || this.mergeSeamStartMs === null) return;

    const elapsed = performance.now() - this.mergeSeamStartMs;
    const staticCanvas = this.byName.get('static')?.canvas;
    if (staticCanvas) {
      const screen = this.screenRectFeathered(this.mergeSeamRect, 0.15);
      this.drawBloom(ctx, staticCanvas, mergeSeamIntensity(elapsed), 3, screen);
    }

    if (elapsed >= MERGE_SEAM_DURATION_MS) {
      this.mergeSeamRect = null;
      this.mergeSeamStartMs = null;
      this.scheduler.stopAnimating('merge-seam');
    }
  }

  /**
   * §09: the border traces once in accent light, clockwise from the
   * top-left. A single dash whose length grows from 0 to the perimeter reads
   * as the line drawing itself, rather than a full stroke fading in.
   */
  private paintEdgeFrame(ctx: CanvasRenderingContext2D): void {
    if (this.edgeFrameStartMs === null) return;

    const elapsed = performance.now() - this.edgeFrameStartMs;
    const { boardW, boardH } = this.scene;
    const progress = edgeFrameProgress(elapsed);
    if (boardW > 0 && boardH > 0 && progress > 0) {
      const topLeft = worldToScreen(this.camera, this.viewport, { x: 0, y: 0 });
      const w = boardW * this.camera.zoom;
      const h = boardH * this.camera.zoom;
      const perimeter = 2 * (w + h);

      ctx.save();
      ctx.strokeStyle = this.accentColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([perimeter * progress, perimeter]);
      ctx.lineDashOffset = 0;
      ctx.strokeRect(topLeft.x, topLeft.y, w, h);
      ctx.restore();
    }

    if (elapsed >= EDGE_FRAME_TRACE_MS) {
      this.edgeFrameStartMs = null;
      this.scheduler.stopAnimating('edge-frame');
    }
  }

  private paintOverlay(): void {
    const ctx = this.layerContext('overlay');
    ctx.clearRect(0, 0, this.viewport.w, this.viewport.h);
    this.paintCompletion(ctx);
    this.paintHintGlow(ctx);
    this.paintHintOutline(ctx);
    this.paintMergeSeam(ctx);
    this.paintEdgeFrame(ctx);
    if (this.scene.held.length === 0) return;

    this.applyCamera(ctx);

    // The lift (§05): 8pt above the finger, never under it, and 1.06 larger.
    // Both are screen-space quantities converted here, so the piece in hand
    // reads the same at every zoom.
    const { offsetPx, scale } = this.scene.heldLift;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 18 / this.camera.zoom;
    ctx.shadowOffsetY = 6 / this.camera.zoom;
    ctx.translate(0, -offsetPx / this.camera.zoom);
    this.drawPieces(ctx, this.scene.held, scale);
    ctx.restore();
  }

  /** Map world units onto the layer's pixels. */
  private applyCamera(ctx: CanvasRenderingContext2D): void {
    ctx.translate(this.viewport.w / 2, this.viewport.h / 2);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);
  }

  private drawBoardOutline(ctx: CanvasRenderingContext2D): void {
    const { boardW, boardH } = this.scene;
    if (boardW <= 0 || boardH <= 0) return;

    ctx.save();
    ctx.lineWidth = 1 / this.camera.zoom;
    ctx.strokeStyle = 'rgba(44,51,60,0.9)';
    ctx.strokeRect(0, 0, boardW, boardH);
    ctx.restore();
  }

  /**
   * The faint containing outline (§05).
   *
   * Under the pieces on purpose: it is a surface the group sits on, not a box
   * drawn around it. Line width is divided by zoom so it stays a hairline at
   * every scale, the same way the board outline does.
   */
  private drawGroupOutlines(ctx: CanvasRenderingContext2D): void {
    const groups = this.scene.groups;
    if (groups.length === 0) return;

    const zoom = this.camera.zoom;
    ctx.save();
    for (const group of groups) {
      const pad = 0.25;
      const { x, y, w, h } = group.bounds;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      ctx.roundRect(x - pad, y - pad, w + pad * 2, h + pad * 2, 0.2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * The mono label chip (§05).
   *
   * Drawn in *screen* space rather than world space: a label that scaled with
   * zoom would be unreadable at 0.5× and absurd at 4×, and it is a piece of
   * chrome about the group rather than a thing lying on the mat. It is also the
   * first non-piece hit target in the app — `PlayRuntime` tests these same rects.
   */
  private drawGroupChips(ctx: CanvasRenderingContext2D): void {
    const groups = this.scene.groups;
    if (groups.length === 0) return;

    ctx.save();
    ctx.font = GROUP_CHIP.font;
    ctx.textBaseline = 'middle';

    for (const group of groups) {
      const at = worldToScreen(this.camera, this.viewport, {
        x: group.bounds.x,
        y: group.bounds.y,
      });
      const text = groupChipText(group.label);
      // The same function `PlayRuntime.groupChipAt` calls, so the tap target
      // cannot drift from the thing under the finger.
      const rect = groupChipRect(group.label, at, (t) => ctx.measureText(t).width);

      ctx.fillStyle = 'rgba(20, 20, 22, 0.86)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y, rect.w, rect.h, GROUP_CHIP.radius);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
      ctx.fillText(text, rect.x + GROUP_CHIP.padX, rect.y + rect.h / 2);
    }
    ctx.restore();
  }

  /**
   * Draw a set of pieces, culled to the viewport.
   *
   * Culling is what keeps the dynamic layer "usually under twenty objects" even
   * when 250 pieces exist. The bitmap is scaled, never re-rasterised (§03).
   */
  private drawPieces(
    ctx: CanvasRenderingContext2D,
    pieces: readonly ScenePiece[],
    scale = 1,
  ): number {
    const view = visibleWorldBounds(this.camera, this.viewport);
    const minX = view.x - CULL_MARGIN;
    const minY = view.y - CULL_MARGIN;
    const maxX = view.x + view.w + CULL_MARGIN;
    const maxY = view.y + view.h + CULL_MARGIN;

    let drawn = 0;
    for (const piece of pieces) {
      if (
        piece.x > maxX ||
        piece.y > maxY ||
        piece.x + piece.w < minX ||
        piece.y + piece.h < minY
      ) {
        continue;
      }

      if (piece.rot === 0 && scale === 1) {
        ctx.drawImage(piece.bitmap, piece.x, piece.y, piece.w, piece.h);
      } else {
        // Rotation and the lift's scale both act about the piece's own centre,
        // which is the convention `PlaySession` computes positions against.
        const w = piece.w * scale;
        const h = piece.h * scale;
        ctx.save();
        ctx.translate(piece.x + piece.w / 2, piece.y + piece.h / 2);
        ctx.rotate(piece.rot);
        ctx.drawImage(piece.bitmap, -w / 2, -h / 2, w, h);
        ctx.restore();
      }

      // Step 5b's edge-highlight assist. The path is bitmap-local image pixels,
      // so it strokes under the same transform the bitmap was drawn with, then
      // 1/pathScale into world units — the same conversion `polygonFromPath`
      // does for hit-testing, which is why the stroke lands exactly on the cut.
      if (this.edgeHighlightEnabled) {
        let path2d = this.edgePaths.get(piece.id);
        if (!path2d) {
          path2d = toPath2D(piece.path);
          this.edgePaths.set(piece.id, path2d);
        }
        ctx.save();
        if (piece.rot === 0) {
          ctx.translate(piece.x, piece.y);
        } else {
          ctx.translate(piece.x + piece.w / 2, piece.y + piece.h / 2);
          ctx.rotate(piece.rot);
          ctx.translate(-piece.w / 2, -piece.h / 2);
        }
        ctx.scale(1 / piece.pathScale, 1 / piece.pathScale);
        ctx.lineWidth = (EDGE_HIGHLIGHT_WIDTH * piece.pathScale) / this.camera.zoom;
        ctx.strokeStyle = this.accentColor;
        ctx.stroke(path2d);
        ctx.restore();
      }
      drawn++;
    }
    return drawn;
  }
}
