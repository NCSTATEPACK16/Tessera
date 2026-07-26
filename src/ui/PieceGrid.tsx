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
}: PieceGridProps): React.ReactElement {
  const scroller = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({ top: 0, height: 0, width: 0 });

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;

    const read = (): void =>
      setMetrics({
        top: element.scrollTop,
        height: element.clientHeight,
        width: element.clientWidth,
      });

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
                onActivate={onLocate}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
