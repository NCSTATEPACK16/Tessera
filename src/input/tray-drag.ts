/**
 * The tray half of drag-out (§06).
 *
 * Pulling a piece out of the tray is one continuous movement of one finger that
 * crosses from DOM to canvas halfway through, and the player must not be able to
 * feel where. So the chip runs the *same* promotion thresholds the board runs —
 * `MOVE_THRESHOLD_PX` and `LONG_PRESS_MS`, imported rather than restated,
 * because two copies of 6 and 120 would drift and the drift would present as
 * "the tray feels different from the mat".
 *
 * On promotion this file does nothing clever: it reports the pointer and gets
 * out of the way. Deploying the piece and handing the pointer to
 * `BoardControls.adoptPointer` is the shell's job, and everything after that is
 * an ordinary board drag.
 *
 * The chip deliberately does **not** call `setPointerCapture`. Capturing here
 * would retarget every subsequent event to a chip that is about to be unmounted,
 * and the drag would die the moment the list re-rendered.
 */

import type { PieceId } from '@/cut/types';
import { LONG_PRESS_MS, MOVE_THRESHOLD_PX } from './pointer';

export interface TrayDragOptions {
  /**
   * The gesture became a drag. Return true if the piece was taken — false when
   * it could not be (already deployed, or a second finger is down), which
   * abandons the probe rather than leaving it half-promoted.
   */
  onPullOut: (pieceId: PieceId, event: PointerEvent) => boolean;
  /** Under both thresholds and released: a tap on the chip, not a drag. */
  onTap?: (pieceId: PieceId, event: PointerEvent) => void;
}

interface Probe {
  pieceId: PieceId;
  x: number;
  y: number;
  t: number;
}

/**
 * Watches one pointer at a time on the chip list.
 *
 * One at a time on purpose: a second finger in the tray is a scroll or a pinch,
 * never a second drag, which is the same arbitration §05 states for the mat.
 */
export class TrayDrag {
  private probe: Probe | null = null;
  private pointerId: number | null = null;

  constructor(private readonly options: TrayDragOptions) {}

  get pressing(): boolean {
    return this.probe !== null;
  }

  /** The piece under the finger, while the press is still undecided. */
  get pressedPiece(): PieceId | null {
    return this.probe?.pieceId ?? null;
  }

  down(pieceId: PieceId, event: PointerEvent): void {
    if (this.probe) return;
    this.probe = { pieceId, x: event.clientX, y: event.clientY, t: event.timeStamp };
    this.pointerId = event.pointerId;
  }

  move(event: PointerEvent): void {
    const probe = this.probe;
    if (!probe || event.pointerId !== this.pointerId) return;

    const moved = Math.hypot(event.clientX - probe.x, event.clientY - probe.y);
    if (moved < MOVE_THRESHOLD_PX) return;
    this.promote(probe, event);
  }

  /**
   * Driven from the frame loop, exactly as the board's long press is.
   *
   * Without it a player who presses a chip and holds still is never heard from —
   * and holding still is what someone does while deciding, which is precisely
   * the moment the piece should come up into the hand.
   */
  tick(nowMs: number): void {
    const probe = this.probe;
    if (!probe || nowMs - probe.t < LONG_PRESS_MS) return;
    // No event to hand over: synthesise the position from the press. The finger
    // has not moved, so the press point *is* the current point.
    this.promote(probe, this.syntheticEvent(probe));
  }

  up(event: PointerEvent): void {
    const probe = this.probe;
    if (!probe || event.pointerId !== this.pointerId) return;
    this.clear();
    this.options.onTap?.(probe.pieceId, event);
  }

  cancel(event?: PointerEvent): void {
    if (event && event.pointerId !== this.pointerId) return;
    this.clear();
  }

  // -------------------------------------------------------------------------

  private promote(probe: Probe, event: PointerEvent): void {
    // Cleared *before* the callback: `onPullOut` re-renders the chip list, and a
    // probe still pointing at an unmounted chip is a drag with nothing under it.
    this.clear();
    this.options.onPullOut(probe.pieceId, event);
  }

  private clear(): void {
    this.probe = null;
    this.pointerId = null;
  }

  private syntheticEvent(probe: Probe): PointerEvent {
    return {
      pointerId: this.pointerId ?? -1,
      clientX: probe.x,
      clientY: probe.y,
      timeStamp: probe.t + LONG_PRESS_MS,
    } as PointerEvent;
  }
}
