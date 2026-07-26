/**
 * The tray half of drag-out (§06).
 *
 * `uses the same thresholds as the mat` is the one worth keeping. The tray and
 * the board are two different technologies either side of one continuous finger
 * movement, and the fastest way to make that seam visible is for the two halves
 * to disagree about when a press becomes a drag.
 */

import { describe, expect, it } from 'vitest';
import { LONG_PRESS_MS, MOVE_THRESHOLD_PX } from '@/input/pointer';
import { TrayDrag } from '@/input/tray-drag';

const at = (x: number, y: number, t: number, id = 1): PointerEvent =>
  ({ pointerId: id, clientX: x, clientY: y, timeStamp: t }) as PointerEvent;

function harness(taken = true) {
  const pulled: number[] = [];
  const tapped: number[] = [];
  const drag = new TrayDrag({
    onPullOut: (pieceId) => {
      pulled.push(pieceId);
      return taken;
    },
    onTap: (pieceId) => tapped.push(pieceId),
  });
  return { drag, pulled, tapped };
}

describe('TrayDrag', () => {
  it('uses the same thresholds as the mat', () => {
    const { drag, pulled } = harness();
    drag.down(4, at(0, 0, 0));
    drag.move(at(MOVE_THRESHOLD_PX - 1, 0, 8));
    expect(pulled).toEqual([]);

    drag.move(at(MOVE_THRESHOLD_PX, 0, 16));
    expect(pulled).toEqual([4]);
  });

  it('promotes on a long press, for a player who picks up and thinks', () => {
    const { drag, pulled } = harness();
    drag.down(4, at(10, 10, 0));

    drag.tick(LONG_PRESS_MS - 1);
    expect(pulled).toEqual([]);

    drag.tick(LONG_PRESS_MS);
    expect(pulled).toEqual([4]);
  });

  it('a press that goes nowhere is a tap, not a drag', () => {
    const { drag, pulled, tapped } = harness();
    drag.down(9, at(10, 10, 0));
    drag.up(at(11, 10, 40));

    expect(pulled).toEqual([]);
    expect(tapped).toEqual([9]);
  });

  it('promotes exactly once', () => {
    const { drag, pulled } = harness();
    drag.down(4, at(0, 0, 0));
    drag.move(at(40, 0, 16));
    drag.move(at(80, 0, 32));
    drag.tick(1000);

    expect(pulled).toEqual([4]);
  });

  it('clears itself before handing over — the chip is about to unmount', () => {
    const pulled: number[] = [];
    const drag = new TrayDrag({
      onPullOut: (pieceId) => {
        // The list re-renders inside this callback in the real shell.
        expect(drag.pressing).toBe(false);
        pulled.push(pieceId);
        return true;
      },
    });
    drag.down(2, at(0, 0, 0));
    drag.move(at(40, 0, 16));
    expect(pulled).toEqual([2]);
  });

  it('watches one pointer only — a second finger in the tray is not a drag', () => {
    const { drag, pulled } = harness();
    drag.down(4, at(0, 0, 0));
    drag.down(5, at(200, 0, 8));

    drag.move(at(240, 0, 16, 2));
    expect(pulled).toEqual([]);
    expect(drag.pressedPiece).toBe(4);
  });

  it('forgets everything on a cancel', () => {
    const { drag, pulled, tapped } = harness();
    drag.down(4, at(0, 0, 0));
    drag.cancel(at(0, 0, 8));

    drag.tick(1000);
    drag.up(at(0, 0, 16));

    expect(pulled).toEqual([]);
    expect(tapped).toEqual([]);
    expect(drag.pressing).toBe(false);
  });
});
