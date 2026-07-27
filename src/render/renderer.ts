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

import type { Size } from '@/core/geom';
import type { Camera } from './camera';
import { visibleWorldBounds, worldToScreen } from './camera';
import { FrameScheduler } from './frame-scheduler';
import type { LayerName } from './frame-scheduler';
import { GROUP_CHIP, groupChipRect, groupChipText } from './group-chip';
import { drawMat } from './mat';
import type { Scene, ScenePiece } from './scene';
import { emptyScene } from './scene';

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
    this.drawBoardOutline(ctx);
    this.stats.lastStaticCount = this.drawPieces(ctx, this.scene.placed);
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

  private paintOverlay(): void {
    const ctx = this.layerContext('overlay');
    ctx.clearRect(0, 0, this.viewport.w, this.viewport.h);
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
      const pad = group.collapsed ? 0 : 0.25;
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
   * The mono label chip (§05), and the whole of a collapsed group.
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
      const text = groupChipText(group.label, group.collapsed);
      // The same function `PlayRuntime.groupChipAt` calls, so the tap target
      // cannot drift from the thing under the finger.
      const rect = groupChipRect(group.label, group.collapsed, at, (t) => ctx.measureText(t).width);

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
      drawn++;
    }
    return drawn;
  }
}
