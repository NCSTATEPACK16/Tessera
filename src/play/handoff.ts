/**
 * The seam between the tray and the board, in time (modernize §5): a chip
 * pulled onto the mat becomes the piece in hand at the chip's own size and
 * grows to the lift over 140ms, so the hand-off reads as one object rather
 * than a small thing swapped for a big one.
 *
 * The other direction has no flight: a piece dropped on the tray is released
 * over the tray, which covers the board canvas in both layouts, so its chip
 * simply fades in (`chip-in`) on the release tick.
 *
 * Pure: the runtime owns the clock and the reduced-motion check.
 */

import { easeStandard } from '@/render/camera';

export const HANDOFF_MS = 140;
/** A tray chip fits its piece inside the cell less this fraction on each side. */
export const CHIP_INSET = 0.1;

/** The lift's scale `elapsedMs` after adoption: `startScale` → `liftScale`, eased. */
export function handoffLiftScale(elapsedMs: number, startScale: number, liftScale: number): number {
  if (elapsedMs <= 0) return startScale;
  if (elapsedMs >= HANDOFF_MS) return liftScale;
  return startScale + (liftScale - startScale) * easeStandard(elapsedMs / HANDOFF_MS);
}
