/**
 * The tray half of drag-out (§06), and the entry to multi-select.
 *
 * Two rules earn their tests here. **Stillness selects, movement drags** — the
 * mat's 120ms long press no longer applies to a chip, because §06 spends that
 * input on multi-select and only one gesture can have it. And **the chip cedes
 * the vertical axis to the browser**: the grid scrolls vertically, so a vertical
 * touch is a scroll and must never become a drag.
 */

import { describe, expect, it } from 'vitest';
import { MOVE_THRESHOLD_PX } from '@/input/pointer';
import { SELECT_HOLD_MS, TrayDrag } from '@/input/tray-drag';

const at = (
  x: number,
  y: number,
  t: number,
  id = 1,
  pointerType = 'mouse',
): PointerEvent => ({ pointerId: id, clientX: x, clientY: y, timeStamp: t, pointerType }) as PointerEvent;

const touch = (x: number, y: number, t: number, id = 1): PointerEvent =>
  at(x, y, t, id, 'touch');

function harness(taken = true, selecting = false) {
  const pulled: number[] = [];
  const tapped: number[] = [];
  const selected: number[] = [];
  const drag = new TrayDrag({
    onPullOut: (pieceId) => {
      pulled.push(pieceId);
      return taken;
    },
    onEnterSelect: (pieceId) => selected.push(pieceId),
    onTap: (pieceId) => tapped.push(pieceId),
    selecting: () => selecting,
  });
  return { drag, pulled, tapped, selected };
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

  it('stillness enters select mode, and never drags out', () => {
    const { drag, pulled, selected } = harness();
    drag.down(4, at(10, 10, 0));

    drag.tick(SELECT_HOLD_MS - 1);
    expect(selected).toEqual([]);

    drag.tick(SELECT_HOLD_MS);
    expect(selected).toEqual([4]);
    expect(pulled).toEqual([]);
  });

  it('a vertical touch is the grid scrolling, not a drag', () => {
    const { drag, pulled } = harness();
    drag.down(4, touch(0, 0, 0));
    drag.move(touch(2, 40, 16));

    expect(pulled).toEqual([]);
    // Cleared, not left watching: a scroll that curves sideways is still a scroll.
    expect(drag.pressing).toBe(false);
  });

  it('a horizontal touch commits to the drag', () => {
    const { drag, pulled } = harness();
    drag.down(4, touch(0, 0, 0));
    drag.move(touch(-40, 2, 16));

    expect(pulled).toEqual([4]);
  });

  it('the axis check is touch only — mouse and pen keep 3a behaviour', () => {
    const { drag, pulled } = harness();
    drag.down(4, at(0, 0, 0));
    drag.move(at(0, 40, 16));

    expect(pulled).toEqual([4]);
  });

  it('in select mode a chip is a checkbox, never a handle', () => {
    const { drag, pulled } = harness(true, true);
    drag.down(4, at(0, 0, 0));
    drag.move(at(40, 0, 16));

    expect(pulled).toEqual([]);
  });

  it('a press that goes nowhere is a tap, not a drag', () => {
    const { drag, pulled, tapped } = harness();
    drag.down(9, at(10, 10, 0));
    drag.up(at(11, 10, 40));

    expect(pulled).toEqual([]);
    expect(tapped).toEqual([9]);
  });

  it('promotes exactly once', () => {
    const { drag, pulled, selected } = harness();
    drag.down(4, at(0, 0, 0));
    drag.move(at(40, 0, 16));
    drag.move(at(80, 0, 32));
    drag.tick(1000);

    expect(pulled).toEqual([4]);
    expect(selected).toEqual([]);
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
