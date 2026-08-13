/**
 * The three-detent bottom sheet (§06, §12).
 *
 * "iPhone portrait: a bottom sheet at three detents — peek (one row of pieces,
 * ~96pt), half, and full — with the lens chips pinned to the sheet header so
 * they are reachable one-handed."
 *
 * The header is pinned rather than scrolled with the content because the whole
 * point of the detents is one-handed reach: a lens chip that scrolls out of the
 * thumb's arc is a lens chip that is not offered.
 *
 * Dragging the handle tracks the finger and lands on the nearest detent on
 * release — never a bounce, never a snap-back to where it started, for the same
 * reason a dropped piece stays where it was dropped.
 */

import { useEffect, useRef, useState } from 'react';
import type { SheetDetent } from './store';

/** §06: peek is one row of pieces. */
const PEEK_PX = 96;

export interface SheetProps {
  rootRef?: React.Ref<HTMLElement> | undefined;
  detent: SheetDetent;
  onDetent: (detent: SheetDetent) => void;
  /** The title row. Pinned, and the first thing in the sheet after the handle. */
  header: React.ReactNode;
  /**
   * The pinned shelf row (§06), rendered directly under the title and **above**
   * the lens chips.
   *
   * Under the title because that is the only place peek can afford to keep it.
   * `collapseForDrag()` drops the sheet to peek at the exact moment a drag makes
   * the shelf appear, so the shelf is the one thing in this region that has to
   * survive peek — a drop target no finger can reach is not a drop target, no
   * matter how correct `isOverShelf` is about its rectangle. The lens chips
   * clip at peek instead, which is what they already did before the shelf
   * existed, so nothing is lost that was ever there.
   *
   * `undefined`/no node when the shelf has nothing to show; see `shelfVisible`.
   */
  shelf?: React.ReactNode;
  /** Whether `shelf` will actually render a row, so peek can grow to fit it. */
  shelfVisible?: boolean;
  /**
   * §C: the box-lid reference panel, rendered in the same pinned region as
   * `shelf`, after it. Grows/shrinks peek automatically through the existing
   * `ResizeObserver` on `pinned` — no new measurement needed.
   */
  reference?: React.ReactNode;
  /** The lens row. Pinned too, but the first thing peek is allowed to clip. */
  lenses: React.ReactNode;
  children: React.ReactNode;
}

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
function heightOf(
  detent: SheetDetent,
  viewport: number,
  shelfVisible: boolean,
  pinnedPx: number | null,
): number {
  switch (detent) {
    case 'peek':
      return shelfVisible ? Math.max(PEEK_PX, pinnedPx ?? PEEK_PX) : PEEK_PX;
    case 'half':
      return Math.round(viewport * 0.5);
    case 'full':
      return Math.round(viewport * 0.88);
  }
}

export function Sheet({
  rootRef,
  detent,
  onDetent,
  header,
  shelf,
  shelfVisible = false,
  reference,
  lenses,
  children,
}: SheetProps): React.ReactElement {
  const viewport = typeof window === 'undefined' ? 800 : window.innerHeight;
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const origin = useRef<{ y: number; height: number } | null>(null);

  // The handle, the title and the shelf: everything peek is obliged to fit.
  const pinned = useRef<HTMLDivElement>(null);
  const [pinnedPx, setPinnedPx] = useState<number | null>(null);

  useEffect(() => {
    const element = pinned.current;
    if (!element) return;

    const read = (): void => {
      const section = element.parentElement;
      if (!section) return;

      // From the section's own top *edge* to the shelf's bottom, not the pinned
      // box's own height. `height` here is a border box, and the section carries
      // a 1px `border-t` — which is exactly how much of the shelf hung off the
      // bottom of the screen the first time this was measured. Anything else
      // ever added above the content, a top padding included, is covered too.
      const bottom = element.getBoundingClientRect().bottom - section.getBoundingClientRect().top;
      // And the section's bottom padding is the home-indicator inset, which the
      // border box also owes room for. Zero in a desktop browser and ~34px on
      // the device this detent exists for — read, never assumed.
      const inset = Number.parseFloat(getComputedStyle(section).paddingBottom);

      // Rounded up: a region 100.5px tall does not fit in 100, and the whole
      // point of measuring is that the shelf's last row of pixels stays on
      // screen.
      setPinnedPx(Math.ceil(bottom) + (Number.isFinite(inset) ? inset : 0));
    };
    read();
    // Fires when the shelf appears, when it swaps its dashed placeholder for a
    // real chip, and when a rotation rewraps anything above it.
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const resting = heightOf(detent, viewport, shelfVisible, pinnedPx);
  const height = dragHeight ?? resting;
  const peekFloor = heightOf('peek', viewport, shelfVisible, pinnedPx);

  const nearest = (target: number): SheetDetent => {
    const options: SheetDetent[] = ['peek', 'half', 'full'];
    let best: SheetDetent = 'peek';
    let bestDistance = Infinity;
    for (const option of options) {
      const distance = Math.abs(heightOf(option, viewport, shelfVisible, pinnedPx) - target);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = option;
      }
    }
    return best;
  };

  return (
    <section
      ref={rootRef}
      aria-label="Pieces"
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-10 flex flex-col rounded-t-[22px] border-t border-[var(--edge-hair)] bg-[var(--mat-raised)]"
      style={{
        height,
        paddingBottom: 'env(safe-area-inset-bottom)',
        transition: dragHeight === null ? 'height var(--duration-base) var(--ease-standard)' : 'none',
      }}
    >
      {/* Everything peek must fit, in one measured box. */}
      <div ref={pinned} className="shrink-0">
        <div
          role="separator"
          aria-label="Resize the piece tray"
          className="flex h-[28px] shrink-0 cursor-grab items-center justify-center"
          style={{ touchAction: 'none' }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            origin.current = { y: event.clientY, height: resting };
          }}
          onPointerMove={(event) => {
            const start = origin.current;
            if (!start) return;
            const next = start.height + (start.y - event.clientY);
            setDragHeight(Math.max(peekFloor, Math.min(viewport * 0.94, next)));
          }}
          onPointerUp={() => {
            if (dragHeight !== null) onDetent(nearest(dragHeight));
            origin.current = null;
            setDragHeight(null);
          }}
          onPointerCancel={() => {
            origin.current = null;
            setDragHeight(null);
          }}
        >
          <span aria-hidden className="h-[4px] w-[36px] rounded-full bg-[var(--edge-hair)]" />
        </div>

        {/* Pinned, and the shelf's anchor: peek is sized from this box. */}
        <div className="shrink-0 px-[12px]">{header}</div>

        {/* The one thing in the sheet that must survive peek — see `shelf`. */}
        {shelf}
        {reference}
      </div>

      {/* Pinned too, so the lenses stay in the thumb's arc at half and full.
          They are what peek clips, which is what peek did before 3b. */}
      <div className="shrink-0 px-[12px] pb-[8px] pt-[12px]">{lenses}</div>

      {children}
    </section>
  );
}
