/**
 * The listener shell — real `PointerEvent`s in, `PointerMachine` and camera out.
 *
 * Everything with a decision in it lives in `PointerMachine`, which is DOM-free
 * and tested. What is left here is plumbing, and two pieces of it are worth
 * pointing at because both are invisible until they are wrong:
 *
 * 1. The camera controller is fed *every* pointer down and up even while a piece
 *    is being dragged, but is only allowed to move the camera during a camera
 *    gesture. If it only heard about the second finger, a pinch that begins
 *    mid-drag would start from a one-finger baseline and the board would jump by
 *    the distance between the fingers.
 *
 * 2. `touch-action: none` is set on the canvases by the renderer. Without it
 *    Safari takes pinch and pan for itself and the mat simply does not move.
 *
 * 3. A drag that began on a tray chip (§06) is *adopted*: its listeners live on
 *    `window` rather than the board, because the gesture starts outside the
 *    board element and must not have a seam in it. The element handlers skip
 *    that pointer while it is adopted, or every move would be processed twice —
 *    once bubbling through the board, once at the window.
 */

import type { Point, Size } from '@/core/geom';
import type { PlaySession } from '@/play/session';
import { LIFT_PX } from '@/play/session';
import type { Camera } from '@/render/camera';
import { screenToWorld } from '@/render/camera';
import { CameraControls } from '@/render/camera-controls';
import { PointerMachine } from './pointer';

export interface BoardControlsOptions {
  element: HTMLElement;
  session: PlaySession;
  getViewport: () => Size;
  getCamera: () => Camera;
  setCamera: (camera: Camera) => void;
  getBoard: () => { w: number; h: number };
  /** Something changed that the renderer should hear about. */
  onChange: () => void;
  /**
   * Last refusal on a release, in viewport coordinates. Return true to say "I
   * dealt with this drop" and the board will not snap it.
   *
   * The tray uses it: a single piece let go over the tray goes back into it
   * rather than being left floating under the panel where it cannot be seen.
   * This is not bounce-back — the player aimed at the tray.
   */
  interceptRelease?: (event: { clusterId: number; client: Point }) => boolean;
}

export class BoardControls {
  readonly camera: CameraControls;
  readonly machine: PointerMachine;

  /** The pointer currently being driven from `window`, if any. */
  private adopted: number | null = null;
  /** Viewport coordinates of the last event seen, for the release intercept. */
  private lastClient: Point = { x: 0, y: 0 };

  constructor(private readonly options: BoardControlsOptions) {
    this.camera = new CameraControls({
      element: options.element,
      getViewport: options.getViewport,
      getCamera: options.getCamera,
      setCamera: options.setCamera,
      getBoard: options.getBoard,
      getFitBounds: () => options.session.contentBounds(),
      attach: false,
    });

    this.machine = new PointerMachine({
      toWorld: (p) => this.toWorld(p),
      pickCluster: (world) => options.session.pickCluster(world),
      onGrab: (event) => {
        options.session.grab(event.clusterId);
        options.onChange();
      },
      onDragTo: (event) => {
        options.session.dragBy(event.clusterId, event.dx, event.dy);
        options.onChange();
      },
      onRelease: (event) => {
        this.releaseAdoption();
        if (options.interceptRelease?.({ clusterId: event.clusterId, client: this.lastClient })) {
          options.onChange();
          return;
        }
        // The lift is a screen-space 8pt, so it is worth different amounts of
        // world at different zooms — convert here, at the one place that knows.
        const liftWorld = LIFT_PX / options.getCamera().zoom;
        options.session.release(event.clusterId, event.velocity, liftWorld);
        options.onChange();
      },
      onCameraBegin: () => options.onChange(),
      onCameraEnd: () => options.onChange(),
    });

    const el = options.element;
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancel);
    el.addEventListener('wheel', this.onWheel, { passive: false });
  }

  destroy(): void {
    const el = this.options.element;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp);
    el.removeEventListener('pointercancel', this.onCancel);
    el.removeEventListener('wheel', this.onWheel);
    this.releaseAdoption();
    this.camera.destroy();
  }

  /**
   * Take over a drag that began on a tray chip (§06).
   *
   * The caller has already moved the piece onto the mat and knows its cluster;
   * all that is left is to make the rest of the gesture indistinguishable from
   * one that started on the board. Returns false when the machine declines —
   * a second finger is down, and camera outranks a drag.
   */
  adoptPointer(event: PointerEvent, clusterId: number): boolean {
    if (!this.machine.adopt(this.local(event), clusterId)) return false;

    this.adopted = event.pointerId;
    this.lastClient = { x: event.clientX, y: event.clientY };
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onCancel);
    this.options.onChange();
    return true;
  }

  /** Drive the long-press timer from the frame loop. */
  tick(nowMs: number): void {
    this.machine.tick(nowMs);
  }

  /** Backgrounding, low memory, a phone call (§05). */
  interrupt(): void {
    this.releaseAdoption();
    this.machine.interrupt();
    this.options.session.interrupt();
    this.options.onChange();
  }

  private toWorld(p: Point): Point {
    return screenToWorld(this.options.getCamera(), this.options.getViewport(), p);
  }

  private local(event: PointerEvent): { id: number; x: number; y: number; t: number } {
    const rect = this.options.element.getBoundingClientRect();
    return {
      id: event.pointerId,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      t: event.timeStamp,
    };
  }

  /** Detach the window listeners an adopted drag runs on. Idempotent. */
  private releaseAdoption(): void {
    if (this.adopted === null) return;
    this.adopted = null;
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onCancel);
  }

  /**
   * True when this event has already been handled at the window.
   *
   * An adopted pointer moving across the board fires the board's own listener as
   * well, and processing the same move twice doubles the drag delta — the piece
   * runs away from the finger at exactly twice its speed.
   */
  private duplicate(event: PointerEvent): boolean {
    return this.adopted === event.pointerId && event.currentTarget !== window;
  }

  private readonly onDown = (event: PointerEvent): void => {
    this.machine.down(this.local(event));
    this.camera.feedDown(event);
    // Wake the frame loop on the press itself, not on the first movement: the
    // 120ms long-press is driven from `tick`, so without this a player who picks
    // a piece up and holds it still is never heard from.
    this.options.onChange();
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (this.duplicate(event)) return;
    this.lastClient = { x: event.clientX, y: event.clientY };
    this.machine.move(this.local(event));
    if (this.machine.phase === 'camera') this.camera.feedMove(event);
  };

  private readonly onUp = (event: PointerEvent): void => {
    if (this.duplicate(event)) return;
    this.lastClient = { x: event.clientX, y: event.clientY };
    this.machine.up(this.local(event));
    this.camera.feedUp(event);
    this.releaseAdoption();
  };

  private readonly onCancel = (event: PointerEvent): void => {
    if (this.duplicate(event)) return;
    this.lastClient = { x: event.clientX, y: event.clientY };
    this.machine.cancel(this.local(event));
    this.camera.feedUp(event);
    this.releaseAdoption();
  };

  private readonly onWheel = (event: WheelEvent): void => {
    this.camera.feedWheel(event);
  };
}
