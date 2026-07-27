/**
 * The group chip's geometry — §05's "mono label chip".
 *
 * Lives alone because it has two consumers that cannot ask each other:
 * `Renderer.drawGroupChips` draws the chip, and `PlayRuntime.groupChipAt`
 * hit-tests it. Canvas retains no scene graph, so the second cannot query the
 * first, and two independent copies of this arithmetic drift — the symptom being
 * a tap target that no longer matches the thing under the finger, which is
 * invisible until someone changes the padding.
 *
 * The text measurer is injected rather than imported: the renderer passes its
 * live `ctx.measureText`, the runtime passes a cached one, and the tests pass a
 * stub — which is what keeps this file testable in a node environment.
 *
 * Screen pixels throughout. A chip that scaled with zoom would be unreadable at
 * 0.5× and absurd at 4×; it is chrome *about* the group, not a thing lying on
 * the mat.
 */

import type { Point, Rect } from '@/core/geom';

export const GROUP_CHIP = {
  height: 22,
  padX: 8,
  /** Clearance between the chip's underside and the group's outline. */
  gap: 4,
  radius: 6,
  /**
   * Canvas `ctx.font` does not resolve CSS custom properties — a `var()` here
   * falls back to the default font silently, with no error. So the mono stack is
   * named directly, and §13's token rule does not reach into the canvas.
   */
  font: '11px ui-monospace, monospace',
} as const;

/** What the chip reads. A collapsed group is *only* its chip, so it says so. */
export function groupChipText(label: string, collapsed: boolean): string {
  return collapsed ? `${label} ⌄` : label;
}

/** The chip's screen rect, anchored to the top-left of the group's bounds. */
export function groupChipRect(
  label: string,
  collapsed: boolean,
  anchor: Point,
  measure: (text: string) => number,
): Rect {
  return {
    x: anchor.x,
    y: anchor.y - GROUP_CHIP.height - GROUP_CHIP.gap,
    w: measure(groupChipText(label, collapsed)) + GROUP_CHIP.padX * 2,
    h: GROUP_CHIP.height,
  };
}
