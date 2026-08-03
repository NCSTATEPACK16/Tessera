/**
 * Camera gestures — pinch zoom, drag pan, wheel, double-tap to fit.
 *
 * Camera only. The pointer machine that decides whether a touch is a camera
 * gesture or a piece drag arrives at step 2; until then every pointer is a
 * camera pointer, which is exactly what step 1 needs to inspect the cut.
 *
 * Gesture arbitration when it does arrive (§05): two fingers always means
 * camera, one finger on a piece means drag, one finger on empty mat means pan.
 */

import type { Point, Rect, Size } from '@/core/geom';
import type { Camera } from './camera';
import { clampZoom, fitCamera, fitCameraToBounds, fitScale, MIN_ZOOM, zoomAbout } from './camera';

export interface CameraControlsOptions {
  element: HTMLElement;
  getViewport: () => Size;
  getCamera: () => Camera;
  setCamera: (camera: Camera) => void;
  /** Board extent. The reference 1× is measured against. */
  getBoard: () => { w: number; h: number };
  /**
   * What double-tap-to-fit should frame, when that is more than the board —
   * the board plus everything scattered around it. Falls back to the board.
   */
  getFitBounds?: () => Rect;
  /**
   * Raise the zoom floor above the default 0.5× — large-piece mode passes
   * `REGION_LENS_ZOOM`. Defaults to `MIN_ZOOM`.
   */
  minRelativeZoom?: number | undefined;
  /**
   * Listen to the element directly. Set false when something upstream — the
   * pointer machine — owns arbitration and forwards only the camera gestures.
   * The events must still all be forwarded, or a pinch that begins mid-drag
   * starts from a baseline of one finger and the board jumps.
   */
  attach?: boolean;
}

const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP = 24;

export class CameraControls {
  private readonly pointers = new Map<number, Point>();
  private lastCentroid: Point | null = null;
  private lastSpread = 0;
  private lastTapAt = 0;
  private lastTapPoint: Point = { x: 0, y: 0 };

  private readonly attached: boolean;
  private readonly minRelativeZoom: number;

  constructor(private readonly options: CameraControlsOptions) {
    this.minRelativeZoom = options.minRelativeZoom ?? MIN_ZOOM;
    this.attached = options.attach ?? true;
    if (!this.attached) return;

    const el = options.element;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
  }

  destroy(): void {
    if (this.attached) {
      const el = this.options.element;
      el.removeEventListener('pointerdown', this.onPointerDown);
      el.removeEventListener('pointermove', this.onPointerMove);
      el.removeEventListener('pointerup', this.onPointerUp);
      el.removeEventListener('pointercancel', this.onPointerUp);
      el.removeEventListener('wheel', this.onWheel);
    }
    this.pointers.clear();
  }

  /** Forwarding entry points, for when arbitration lives upstream. */
  readonly feedDown = (event: PointerEvent): void => this.onPointerDown(event);
  readonly feedMove = (event: PointerEvent): void => this.onPointerMove(event);
  readonly feedUp = (event: PointerEvent): void => this.onPointerUp(event);
  readonly feedWheel = (event: WheelEvent): void => this.onWheel(event);

  /**
   * Frame everything, clamped to the zoom range.
   *
   * The clamp matters: a very wide scatter would otherwise fit at a zoom the
   * player is not allowed to return to once they have zoomed in, which reads as
   * the camera fighting them.
   */
  fit(): void {
    const viewport = this.options.getViewport();
    const bounds = this.options.getFitBounds?.();
    if (!bounds || bounds.w <= 0 || bounds.h <= 0) {
      const board = this.options.getBoard();
      this.options.setCamera(fitCamera(viewport, board.w, board.h));
      return;
    }

    const framed = fitCameraToBounds(viewport, bounds);
    this.options.setCamera({
      ...framed,
      zoom: clampZoom(framed.zoom, this.fitScale(), this.minRelativeZoom),
    });
  }

  /** Pixels per world unit at 1×. The reference every clamp here measures against. */
  private fitScale(): number {
    const board = this.options.getBoard();
    return fitScale(this.options.getViewport(), board.w, board.h);
  }

  private local(event: PointerEvent): Point {
    const rect = this.options.element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.options.element.setPointerCapture(event.pointerId);
    const p = this.local(event);
    this.pointers.set(event.pointerId, p);
    this.syncGestureBaseline();

    const now = performance.now();
    if (
      now - this.lastTapAt < DOUBLE_TAP_MS &&
      Math.hypot(p.x - this.lastTapPoint.x, p.y - this.lastTapPoint.y) < DOUBLE_TAP_SLOP
    ) {
      this.fit();
      this.lastTapAt = 0;
      return;
    }
    this.lastTapAt = now;
    this.lastTapPoint = p;
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.set(event.pointerId, this.local(event));

    const centroid = this.centroid();
    const spread = this.spread();
    if (!centroid || !this.lastCentroid) return;

    const camera = this.options.getCamera();
    const viewport = this.options.getViewport();

    // Pan: move the world under the fingers, so the mat tracks the hand exactly.
    let next: Camera = {
      x: camera.x - (centroid.x - this.lastCentroid.x) / camera.zoom,
      y: camera.y - (centroid.y - this.lastCentroid.y) / camera.zoom,
      zoom: camera.zoom,
    };

    // Pinch: zoom about the centroid so the pinched spot stays put.
    if (this.pointers.size >= 2 && this.lastSpread > 0 && spread > 0) {
      next = zoomAbout(
        next,
        viewport,
        centroid,
        next.zoom * (spread / this.lastSpread),
        this.fitScale(),
        this.minRelativeZoom,
      );
    }

    this.options.setCamera(next);
    this.lastCentroid = centroid;
    this.lastSpread = spread;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    this.syncGestureBaseline();
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = this.options.element.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const camera = this.options.getCamera();
    const fit = this.fitScale();
    const factor = Math.exp(-event.deltaY * 0.0015);
    this.options.setCamera(
      zoomAbout(
        camera,
        this.options.getViewport(),
        point,
        clampZoom(camera.zoom * factor, fit, this.minRelativeZoom),
        fit,
        this.minRelativeZoom,
      ),
    );
  };

  /**
   * Re-baseline on every pointer add or remove, or lifting one finger of a
   * pinch makes the board jump by the distance between the two fingers.
   */
  private syncGestureBaseline(): void {
    this.lastCentroid = this.centroid();
    this.lastSpread = this.spread();
  }

  private centroid(): Point | null {
    if (this.pointers.size === 0) return null;
    let x = 0;
    let y = 0;
    for (const p of this.pointers.values()) {
      x += p.x;
      y += p.y;
    }
    return { x: x / this.pointers.size, y: y / this.pointers.size };
  }

  private spread(): number {
    if (this.pointers.size < 2) return 0;
    const pts = [...this.pointers.values()];
    const a = pts[0]!;
    const b = pts[1]!;
    return Math.hypot(b.x - a.x, b.y - a.y);
  }
}
