/**
 * The two seams between the tray and the board, in time (modernize §5).
 *
 * Out: a chip pulled onto the mat becomes the piece in hand at the chip's own
 * size and grows to the lift over 140ms, so the hand-off reads as one object
 * rather than a small thing swapped for a big one.
 *
 * Home: a piece dropped on the tray is in the tray on the release tick — the
 * model is truth — and what flies for 200ms is only a picture of it, from where
 * it was to the tray, drawn on the board's dynamic layer.
 *
 * Pure: the runtime owns the clock and the reduced-motion check.
 */

import type { Rect } from '@/core/geom';
import { easeStandard } from '@/render/camera';

export const HANDOFF_MS = 140;
/** A tray chip fits its piece inside the cell less this fraction on each side. */
export const CHIP_INSET = 0.1;
export const HOMING_MS = 200;

/** The lift's scale `elapsedMs` after adoption: `startScale` → `liftScale`, eased. */
export function handoffLiftScale(elapsedMs: number, startScale: number, liftScale: number): number {
  if (elapsedMs <= 0) return startScale;
  if (elapsedMs >= HANDOFF_MS) return liftScale;
  return startScale + (liftScale - startScale) * easeStandard(elapsedMs / HANDOFF_MS);
}

/** Where a homing piece is drawn `elapsedMs` after release, or null once it is home. */
export function homingRect(from: Rect, to: Rect, elapsedMs: number): Rect | null {
  if (elapsedMs >= HOMING_MS) return null;
  const p = easeStandard(Math.max(0, elapsedMs) / HOMING_MS);
  const lerp = (a: number, b: number): number => a + (b - a) * p;
  return { x: lerp(from.x, to.x), y: lerp(from.y, to.y), w: lerp(from.w, to.w), h: lerp(from.h, to.h) };
}
