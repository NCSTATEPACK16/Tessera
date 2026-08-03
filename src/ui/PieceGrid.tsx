/**
 * The virtualised chip grid.
 *
 * 250 chips is 250 canvases if you let it be, and each one costs a backing
 * store; on the iPhone 12 the §03 memory budget is already carrying 36MB of
 * piece bitmaps. So only the rows in view exist, plus a couple either side, and
 * the scroll height is faked by a spacer.
 *
 * Written by hand rather than pulled in as a dependency because it is thirty
 * lines and a fixed-size grid is the easy case: every cell is the same height,
 * so the visible range is division, not measurement.
 *
 * **Scroll position is preserved across lens changes on purpose.** §06: turn a
 * filter off and every remaining piece is exactly where you left it.
 */

import { useEffect, useRef, useState } from 'react';
import type { PieceId } from '@/cut/types';
import { PieceChip } from './PieceChip';

/** Rows kept alive above and below the viewport, so a fast flick stays filled. */
const OVERSCAN = 2;

export interface PieceGridProps {
  ids: readonly PieceId[];
  cell: number;
  gap: number;
  bitmapOf: (id: PieceId) => ImageBitmap | null;
  isEdge: (id: PieceId) => boolean;
  isOnMat: (id: PieceId) => boolean;
  onChipPointerDown: (pieceId: PieceId, event: React.PointerEvent) => void;
  onLocate: (pieceId: PieceId) => void;
  /** The tray is in select mode (§06): a tap toggles instead of locating. */
  selecting?: boolean;
  /** 1-based selection order for a piece, or 0. */
  badgeOf?: (id: PieceId) => number;
  /** A tap while `selecting`. */
  onChipClick?: (id: PieceId) => void;
  /** Step 5c: fired on every scroll, human-speed only — not a per-frame hook. */
  onScroll?: (top: number) => void;
  /** Step 5c: applied once, before the first virtualisation pass. */
  initialScrollTop?: number;
}

export function PieceGrid({
  ids,
  cell,
  gap,
  bitmapOf,
  isEdge,
  isOnMat,
  onChipPointerDown,
  onLocate,
  selecting,
  badgeOf,
  onChipClick,
  onScroll,
  initialScrollTop,
}: PieceGridProps): React.ReactElement {
  // One `onActivate` for both meanings a tap can have, decided here rather than
  // by a second callback on `PieceChip` — locate-on-mat and toggle-in-select-mode
  // never apply at the same time, so there is only ever one thing a tap does.
  const activate = selecting ? (onChipClick ?? ((): void => {})) : onLocate;

  const scroller = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({ top: 0, height: 0, width: 0 });

  // Held in a ref rather than in the effect's dependency array: the listener
  // is attached once for the life of the grid, and re-attaching it on every
  // render of the parent would be a scroll listener churning at chrome speed.
  const onScrollRef = useRef(onScroll);
  onScrollRef.current = onScroll;

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;

    const read = (): void => {
      setMetrics({
        top: element.scrollTop,
        height: element.clientHeight,
        width: element.clientWidth,
      });
      onScrollRef.current?.(element.scrollTop);
    };

    // Before the first read, so a restored grid opens already scrolled rather
    // than flashing at the top and jumping.
    if (initialScrollTop !== undefined) element.scrollTop = initialScrollTop;
    read();
    element.addEventListener('scroll', read, { passive: true });
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => {
      element.removeEventListener('scroll', read);
      observer.disconnect();
    };
  }, []);

  const stride = cell + gap;
  const columns = Math.max(1, Math.floor((metrics.width + gap) / stride));
  const rows = Math.ceil(ids.length / columns);

  const first = Math.max(0, Math.floor(metrics.top / stride) - OVERSCAN);
  const last = Math.min(rows, Math.ceil((metrics.top + metrics.height) / stride) + OVERSCAN);

  const visible: { id: PieceId; x: number; y: number }[] = [];
  for (let row = first; row < last; row++) {
    for (let column = 0; column < columns; column++) {
      const id = ids[row * columns + column];
      if (id === undefined) break;
      visible.push({ id, x: column * stride, y: row * stride });
    }
  }

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[12px]">
      {ids.length === 0 ? (
        <p className="px-[4px] py-[24px] text-[14px] text-[var(--ink-muted)]">
          Nothing under this lens. Every other one is a tap away.
        </p>
      ) : (
        <div style={{ position: 'relative', height: Math.max(0, rows * stride - gap) }}>
          {visible.map(({ id, x, y }) => (
            <div key={id} style={{ position: 'absolute', transform: `translate(${x}px, ${y}px)` }}>
              <PieceChip
                pieceId={id}
                bitmap={bitmapOf(id)}
                size={cell}
                isEdge={isEdge(id)}
                onMat={isOnMat(id)}
                onPointerDown={onChipPointerDown}
                onActivate={activate}
                badge={badgeOf ? badgeOf(id) : 0}
                selecting={selecting ?? false}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
