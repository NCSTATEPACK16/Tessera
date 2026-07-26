/**
 * The tray half of drag-out (§06).
 *
 * Pulling a piece out of the tray is one continuous movement of one finger that
 * crosses from DOM to canvas halfway through, and the player must not be able to
 * feel where. So the chip shares `MOVE_THRESHOLD_PX` with the board — imported
 * rather than restated, because two copies of 6 would drift and the drift would
 * present as "the tray feels different from the mat". It does **not** share the
 * board's `LONG_PRESS_MS`: §06 spends stillness on multi-select, so the chip's
 * hold is `SELECT_HOLD_MS` and means something else entirely.
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
import { MOVE_THRESHOLD_PX } from './pointer';

/**
 * §06: stillness on a chip enters multi-select.
 *
 * Longer than the mat's `LONG_PRESS_MS` on purpose. 120ms is the right latency
 * for a piece coming up into the hand, and far too eager for a mode change the
 * player has to be *deciding* to make — at 120ms an ordinary hesitation before a
 * drag would put the tray into select mode instead.
 */
export const SELECT_HOLD_MS = 450;

export interface TrayDragOptions {
  /**
   * The gesture became a drag. Return true if the piece was taken — false when
   * it could not be (already deployed, or a second finger is down), which
   * abandons the probe rather than leaving it half-promoted.
   */
  onPullOut: (pieceId: PieceId, event: PointerEvent) => boolean;
  /** Stillness past `SELECT_HOLD_MS`: enter multi-select with this chip as #1. */
  onEnterSelect?: (pieceId: PieceId) => void;
  /** Under both thresholds and released: a tap on the chip, not a drag. */
  onTap?: (pieceId: PieceId, event: PointerEvent) => void;
  /** True while the tray is in select mode. Asked, never cached. */
  selecting?: () => boolean;
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

    const dx = event.clientX - probe.x;
    const dy = event.clientY - probe.y;
    if (Math.hypot(dx, dy) < MOVE_THRESHOLD_PX) return;

    // In select mode the chip is a checkbox and nothing else.
    if (this.options.selecting?.()) {
      this.clear();
      return;
    }

    // The chip cedes the vertical axis to the browser (`touch-action: pan-y`), so
    // a vertical touch is the grid scrolling and must not become a drag.
    //
    // Cleared rather than left watching: a scroll that later curves sideways is
    // still a scroll, and promoting mid-flick would pull a piece out from under a
    // finger that was reading the tray.
    //
    // Touch only, deliberately. A mouse never scrolls from a drag, so applying the
    // check there would leave the desktop build with a dead gesture — and would
    // quietly rewrite what the Playwright suite measures.
    if (event.pointerType === 'touch' && Math.abs(dy) >= Math.abs(dx)) {
      this.clear();
      return;
    }

    this.promote(probe, event);
  }

  /**
   * Driven from the frame loop, exactly as the board's long press is.
   *
   * Stillness is multi-select now, not drag-out. A finger that has not moved is
   * deciding *which pieces*, not which piece — and §06 has no other input to spend
   * on entering the mode.
   */
  tick(nowMs: number): void {
    const probe = this.probe;
    if (!probe || nowMs - probe.t < SELECT_HOLD_MS) return;
    this.clear();
    this.options.onEnterSelect?.(probe.pieceId);
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
}
