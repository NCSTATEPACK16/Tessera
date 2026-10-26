/**
 * The phone sheet's resting heights (v2 spec §5.2), DOM-free so they are
 * tested. `default` is where the tray opens: 35% leaves the board ~59% of a
 * phone, where v1's half left it ~44% and the board frame ~16% after fit.
 * Half and full stay for the player who wants more of the tray.
 */
export type SheetDetent = 'peek' | 'default' | 'half' | 'full';

const DETENTS: readonly SheetDetent[] = ['peek', 'default', 'half', 'full'];

export const PEEK_PX = 96;

/** The tray's chip cell and gap — `Tray.tsx` reads these, so the two never drift. */
export const CHIP_CELL_PX = 56;
export const CHIP_GAP_PX = 8;
/** What default must leave under the pinned chrome: two whole rows of pieces. */
export const TWO_CHIP_ROWS_PX = 2 * CHIP_CELL_PX + 2 * CHIP_GAP_PX;

/**
 * Peek's height, from the pinned region as it actually rendered.
 *
 * **Measured, never computed.** The previous version added a constant for the
 * shelf's row to a constant for peek and got 164px, while the region it had to
 * contain measured 169px before the shelf was counted at all — the handle, the
 * title, and *two* wrapped rows of lens chips, where the arithmetic had assumed
 * one. The shelf rendered 5px below the bottom of the screen and drop-to-pin
 * was unreachable on a phone, with nothing anywhere reporting an error.
 *
 * So the number comes off the DOM. It cannot go stale when the title grows, or
 * when the chip cell changes size, or when the lens row wraps differently on a
 * narrower phone — and there is no third copy of the chip cell's height living
 * in this file to drift from the two that already exist.
 *
 * `pinnedPx` is null only before the first measurement, which is before any
 * shelf can exist; peek is the design doc's 96pt whenever the shelf is not
 * rendering, exactly as it was.
 */
export function heightOf(
  detent: SheetDetent,
  viewport: number,
  growPeek: boolean,
  pinnedPx: number | null,
  chromePx: number | null,
): number {
  switch (detent) {
    case 'peek':
      return growPeek ? Math.max(PEEK_PX, pinnedPx ?? PEEK_PX) : PEEK_PX;
    case 'default': {
      // 35% is the target, but on a short phone the pinned chrome alone can
      // be most of that — measured at 664px tall, it was all of it and the
      // tray opened showing no pieces. Two rows always, half at most.
      const half = Math.round(viewport * 0.5);
      const floor = chromePx === null ? 0 : chromePx + TWO_CHIP_ROWS_PX;
      return Math.min(half, Math.max(Math.round(viewport * 0.35), floor));
    }
    case 'half':
      return Math.round(viewport * 0.5);
    case 'full':
      return Math.round(viewport * 0.88);
  }
}

/** The detent a released drag settles on: whichever resting height is closest. */
export function nearestDetent(
  target: number,
  viewport: number,
  growPeek: boolean,
  pinnedPx: number | null,
  chromePx: number | null,
): SheetDetent {
  let best: SheetDetent = 'peek';
  let bestDistance = Infinity;
  for (const option of DETENTS) {
    const distance = Math.abs(heightOf(option, viewport, growPeek, pinnedPx, chromePx) - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = option;
    }
  }
  return best;
}
