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
}

export class BoardControls {
  readonly camera: CameraControls;
  readonly machine: PointerMachine;

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
    this.camera.destroy();
  }

  /** Drive the long-press timer from the frame loop. */
  tick(nowMs: number): void {
    this.machine.tick(nowMs);
  }

  /** Backgrounding, low memory, a phone call (§05). */
  interrupt(): void {
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

  private readonly onDown = (event: PointerEvent): void => {
    this.machine.down(this.local(event));
    this.camera.feedDown(event);
    // Wake the frame loop on the press itself, not on the first movement: the
    // 120ms long-press is driven from `tick`, so without this a player who picks
    // a piece up and holds it still is never heard from.
    this.options.onChange();
  };

  private readonly onMove = (event: PointerEvent): void => {
    this.machine.move(this.local(event));
    if (this.machine.phase === 'camera') this.camera.feedMove(event);
  };

  private readonly onUp = (event: PointerEvent): void => {
    this.machine.up(this.local(event));
    this.camera.feedUp(event);
  };

  private readonly onCancel = (event: PointerEvent): void => {
    this.machine.cancel(this.local(event));
    this.camera.feedUp(event);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    this.camera.feedWheel(event);
  };
}
