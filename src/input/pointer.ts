/**
 * The pointer machine (§05) — one of three deliberately separate state machines.
 *
 * Session lifecycle, pointer interaction, and piece membership are kept apart
 * because "conflating them is how jigsaw apps end up with pieces stuck to
 * fingers after a phone call comes in". This file knows about pointers and
 * nothing else: it does not know what a cluster is beyond an id, cannot move
 * one, and has no opinion about snapping.
 *
 * Arbitration is strict and in this order:
 *   two fingers   → always camera, and any held cluster is let go where it is
 *   one on a piece → drag
 *   one on mat     → camera pan
 *
 * There is no tap-to-select-then-tap-to-place, deliberately. Direct manipulation
 * only — the entire product promise is weight in the hand.
 *
 * One narrow exception (§07, step 4): a press that lifts before it ever becomes
 * a drag — under `MOVE_THRESHOLD_PX` and `LONG_PRESS_MS` — was previously a
 * complete no-op, an unclaimed gesture. It now reports `onTap`, consumed only
 * to choose a hint's target. This is not placement: nothing moves, nothing
 * merges, and the drag-or-nothing rule above is unchanged for every other
 * gesture on this machine.
 *
 * DOM-free by design: screen points and timestamps in, board commands out. The
 * listener shell that feeds it real `PointerEvent`s lives next door and stays
 * thin, because arbitration can only really be judged with two fingers on glass.
 */

import type { Point } from '@/core/geom';

/** §05: 6px of movement promotes a press to a drag. */
export const MOVE_THRESHOLD_PX = 6;

/** §05: 120ms of stillness does the same, for a player who picks up and thinks. */
export const LONG_PRESS_MS = 120;

/** Velocity is measured over this trailing window, in ms. */
const VELOCITY_WINDOW_MS = 60;

export type PointerPhase = 'idle' | 'pressing' | 'dragging' | 'camera';

export interface PointerSample {
  id: number;
  /** Screen pixels, relative to the canvas. */
  x: number;
  y: number;
  /** Milliseconds, monotonic. */
  t: number;
}

export interface GrabEvent {
  clusterId: number;
  /** Where the grab landed, in world units. */
  world: Point;
}

export interface DragEvent {
  clusterId: number;
  /** World-unit delta since the last drag event. */
  dx: number;
  dy: number;
}

export interface ReleaseEvent {
  clusterId: number;
  /** World units per second, for the spring to inherit. */
  velocity: Point;
  /** Where the finger left the mat, in world units. */
  world: Point;
}

export interface PointerHost {
  /** Screen → world. Borrowed from the camera, which is the only mapping. */
  toWorld(p: Point): Point;
  /**
   * The topmost draggable cluster under a world point, or null for bare mat.
   * Anchored clusters — the board — must report null: the board does not move.
   */
  pickCluster(world: Point): number | null;
  onGrab(event: GrabEvent): void;
  onDragTo(event: DragEvent): void;
  onRelease(event: ReleaseEvent): void;
  onCameraBegin(): void;
  onCameraEnd(): void;
  /** A press that lifted without ever becoming a drag. See the file header. */
  onTap?(clusterId: number): void;
}

interface Tracked extends Point {
  t: number;
}

export class PointerMachine {
  private phase_: PointerPhase = 'idle';
  private readonly pointers = new Map<number, Tracked>();

  /** The pointer that is pressing or dragging, if any. */
  private activeId: number | null = null;
  private pressedAt: Tracked | null = null;
  private pressedCluster: number | null = null;
  private lastDrag: Point | null = null;
  private readonly history: Tracked[] = [];

  constructor(private readonly host: PointerHost) {}

  get phase(): PointerPhase {
    return this.phase_;
  }

  /** The cluster currently in hand, for the scene's lift and shadow. */
  get heldCluster(): number | null {
    return this.phase_ === 'dragging' ? this.pressedCluster : null;
  }

  /**
   * Take over a drag that began somewhere this machine was not listening — the
   * tray (§06).
   *
   * A chip is DOM and the mat is canvas, but pulling a piece out of the tray is
   * one continuous movement of one finger, and the player must never feel the
   * seam. So the tray runs its own press threshold on the chip, decides the
   * gesture is a drag, moves the piece onto the mat, and hands the *live*
   * pointer here. From this call on it is an ordinary drag: the same
   * arbitration, the same velocity window, the same release into the spring.
   *
   * Everything after adoption is deliberately unchanged, including that a second
   * finger still wins for camera and drops the piece where it is.
   */
  adopt(sample: PointerSample, clusterId: number): boolean {
    // A pointer already in play means the tray promoted during a two-finger
    // gesture. Camera outranks a drag unconditionally (§05), so decline.
    if (this.pointers.size > 0) return false;

    this.pointers.set(sample.id, { x: sample.x, y: sample.y, t: sample.t });
    this.activeId = sample.id;
    this.pressedCluster = clusterId;
    this.pressedAt = { x: sample.x, y: sample.y, t: sample.t };
    this.history.length = 0;
    this.history.push({ x: sample.x, y: sample.y, t: sample.t });
    this.beginDrag();
    return this.phase_ === 'dragging';
  }

  down(sample: PointerSample): void {
    const existing = this.pointers.size;
    this.pointers.set(sample.id, { x: sample.x, y: sample.y, t: sample.t });

    // Two fingers always means camera, even mid-drag. The piece is let go at
    // exactly where it is — never returned, never kept attached.
    if (existing > 0) {
      this.releaseHeld(sample, true);
      this.beginCamera();
      return;
    }

    const world = this.host.toWorld({ x: sample.x, y: sample.y });
    const cluster = this.host.pickCluster(world);
    if (cluster === null) {
      this.beginCamera();
      return;
    }

    this.phase_ = 'pressing';
    this.activeId = sample.id;
    this.pressedCluster = cluster;
    this.pressedAt = { x: sample.x, y: sample.y, t: sample.t };
    this.history.length = 0;
    this.history.push({ x: sample.x, y: sample.y, t: sample.t });
  }

  move(sample: PointerSample): void {
    const tracked = this.pointers.get(sample.id);
    if (!tracked) return;
    tracked.x = sample.x;
    tracked.y = sample.y;
    tracked.t = sample.t;

    if (sample.id !== this.activeId) return;

    if (this.phase_ === 'pressing' && this.pressedAt) {
      const moved = Math.hypot(sample.x - this.pressedAt.x, sample.y - this.pressedAt.y);
      if (moved < MOVE_THRESHOLD_PX) return;
      this.beginDrag();
    }

    if (this.phase_ !== 'dragging' || !this.lastDrag || this.pressedCluster === null) return;

    this.history.push({ x: sample.x, y: sample.y, t: sample.t });
    const from = this.host.toWorld(this.lastDrag);
    const to = this.host.toWorld({ x: sample.x, y: sample.y });
    this.lastDrag = { x: sample.x, y: sample.y };
    this.host.onDragTo({ clusterId: this.pressedCluster, dx: to.x - from.x, dy: to.y - from.y });
  }

  up(sample: PointerSample): void {
    this.finish(sample, false);
  }

  /** A cancelled pointer is an interruption, not a drop: no throw velocity. */
  cancel(sample: PointerSample): void {
    this.finish(sample, true);
  }

  /**
   * Let go of everything — backgrounding, low memory, a phone call (§05).
   *
   * The held cluster is released to its current position, so coming back lands
   * on a board, never on a piece welded to a pointer that no longer exists.
   */
  interrupt(): void {
    const last = this.activeId !== null ? this.pointers.get(this.activeId) : undefined;
    this.releaseHeld(
      { id: this.activeId ?? -1, x: last?.x ?? 0, y: last?.y ?? 0, t: last?.t ?? 0 },
      true,
    );
    this.pointers.clear();
    this.endCameraIfNeeded();
    this.phase_ = 'idle';
    this.activeId = null;
    this.pressedAt = null;
    this.pressedCluster = null;
  }

  /** Called from the frame loop so the long press can fire without movement. */
  tick(nowMs: number): void {
    if (this.phase_ !== 'pressing' || !this.pressedAt) return;
    if (nowMs - this.pressedAt.t >= LONG_PRESS_MS) this.beginDrag();
  }

  // -------------------------------------------------------------------------

  private beginDrag(): void {
    if (this.pressedCluster === null || !this.pressedAt) return;
    this.phase_ = 'dragging';
    this.lastDrag = { x: this.pressedAt.x, y: this.pressedAt.y };
    this.host.onGrab({
      clusterId: this.pressedCluster,
      world: this.host.toWorld({ x: this.pressedAt.x, y: this.pressedAt.y }),
    });
  }

  private beginCamera(): void {
    if (this.phase_ === 'camera') return;
    this.phase_ = 'camera';
    this.activeId = null;
    this.pressedAt = null;
    this.pressedCluster = null;
    this.host.onCameraBegin();
  }

  private finish(sample: PointerSample, interrupted: boolean): void {
    this.pointers.delete(sample.id);

    // Captured before `releaseHeld`/the reset below can clear it — a tap never
    // reached 'dragging', so `releaseHeld` itself is a no-op for this pointer.
    const tappedCluster =
      !interrupted && this.phase_ === 'pressing' && this.activeId === sample.id
        ? this.pressedCluster
        : null;

    this.releaseHeld(sample, interrupted);

    if (this.pointers.size === 0) {
      this.endCameraIfNeeded();
      this.phase_ = 'idle';
      this.activeId = null;
      this.pressedAt = null;
      this.pressedCluster = null;
    }

    if (tappedCluster !== null) this.host.onTap?.(tappedCluster);
  }

  private releaseHeld(sample: PointerSample, interrupted: boolean): void {
    if (this.phase_ !== 'dragging' || this.pressedCluster === null) return;
    if (this.activeId !== null && sample.id !== this.activeId && !interrupted) return;

    const world = this.host.toWorld({ x: sample.x, y: sample.y });
    const velocity = interrupted ? { x: 0, y: 0 } : this.velocity(sample);
    const clusterId = this.pressedCluster;

    this.phase_ = 'idle';
    this.activeId = null;
    this.pressedAt = null;
    this.pressedCluster = null;
    this.lastDrag = null;

    this.host.onRelease({ clusterId, velocity, world });
  }

  /**
   * Throw velocity over the trailing window, in world units per second.
   *
   * A window rather than the last frame: a single frame's delta is noisy enough
   * that an identical gesture can produce wildly different overshoots, and the
   * spring inherits this number directly.
   */
  private velocity(sample: PointerSample): Point {
    this.history.push({ x: sample.x, y: sample.y, t: sample.t });

    const cutoff = sample.t - VELOCITY_WINDOW_MS;
    let oldest: Tracked | null = null;
    for (const entry of this.history) {
      if (entry.t >= cutoff) {
        oldest = entry;
        break;
      }
    }
    if (!oldest) return { x: 0, y: 0 };

    const dt = sample.t - oldest.t;
    if (dt <= 0) return { x: 0, y: 0 };

    const from = this.host.toWorld(oldest);
    const to = this.host.toWorld({ x: sample.x, y: sample.y });
    return { x: ((to.x - from.x) / dt) * 1000, y: ((to.y - from.y) / dt) * 1000 };
  }

  private endCameraIfNeeded(): void {
    if (this.phase_ === 'camera') this.host.onCameraEnd();
  }
}
