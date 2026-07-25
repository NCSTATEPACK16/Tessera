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

import type { Point, Size } from '@/core/geom';
import type { Camera } from './camera';
import { clampZoom, fitCamera, zoomAbout } from './camera';

export interface CameraControlsOptions {
  element: HTMLElement;
  getViewport: () => Size;
  getCamera: () => Camera;
  setCamera: (camera: Camera) => void;
  /** Board extent, for double-tap-to-fit. */
  getBoard: () => { w: number; h: number };
}

const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP = 24;

export class CameraControls {
  private readonly pointers = new Map<number, Point>();
  private lastCentroid: Point | null = null;
  private lastSpread = 0;
  private lastTapAt = 0;
  private lastTapPoint: Point = { x: 0, y: 0 };

  constructor(private readonly options: CameraControlsOptions) {
    const el = options.element;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
  }

  destroy(): void {
    const el = this.options.element;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointercancel', this.onPointerUp);
    el.removeEventListener('wheel', this.onWheel);
    this.pointers.clear();
  }

  fit(): void {
    const board = this.options.getBoard();
    this.options.setCamera(fitCamera(this.options.getViewport(), board.w, board.h));
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
      next = zoomAbout(next, viewport, centroid, next.zoom * (spread / this.lastSpread));
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
    const factor = Math.exp(-event.deltaY * 0.0015);
    this.options.setCamera(
      zoomAbout(camera, this.options.getViewport(), point, clampZoom(camera.zoom * factor)),
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
