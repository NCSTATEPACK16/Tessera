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

import { useRef, useState } from 'react';
import type { SheetDetent } from './store';

/** §06: peek is one row of pieces. */
const PEEK_PX = 96;

export interface SheetProps {
  rootRef?: React.Ref<HTMLElement> | undefined;
  detent: SheetDetent;
  onDetent: (detent: SheetDetent) => void;
  header: React.ReactNode;
  children: React.ReactNode;
}

function heightOf(detent: SheetDetent, viewport: number): number {
  switch (detent) {
    case 'peek':
      return PEEK_PX;
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
  children,
}: SheetProps): React.ReactElement {
  const viewport = typeof window === 'undefined' ? 800 : window.innerHeight;
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const origin = useRef<{ y: number; height: number } | null>(null);

  const resting = heightOf(detent, viewport);
  const height = dragHeight ?? resting;

  const nearest = (target: number): SheetDetent => {
    const options: SheetDetent[] = ['peek', 'half', 'full'];
    let best: SheetDetent = 'peek';
    let bestDistance = Infinity;
    for (const option of options) {
      const distance = Math.abs(heightOf(option, viewport) - target);
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
          setDragHeight(Math.max(PEEK_PX, Math.min(viewport * 0.94, next)));
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

      {/* Pinned, so the lenses stay in the thumb's arc at every detent. */}
      <div className="shrink-0 px-[12px] pb-[8px]">{header}</div>

      {children}
    </section>
  );
}
