/**
 * The pinned shelf (§06): "a pinned shelf row sits at the top of the tray and
 * survives every lens."
 *
 * Hidden when empty — a permanently reserved 96pt row is a lot of tray to spend
 * on nothing, and on the iPhone sheet at peek it is most of the tray. A dashed
 * placeholder appears while a chip drag is in flight instead, so the drop target
 * is visible in the one moment it is useful.
 */

import React from 'react';
import type { PieceId } from '@/cut/types';
import { PieceChip } from './PieceChip';

export interface ShelfProps {
  ids: readonly PieceId[];
  cell: number;
  dragging: boolean;
  bitmapOf: (id: PieceId) => ImageBitmap | null;
  isEdge: (id: PieceId) => boolean;
  onChipPointerDown: (pieceId: PieceId, event: React.PointerEvent) => void;
  /**
   * Exposes the row's own DOM node, so `App` can test a release's client point
   * against `getBoundingClientRect()` — the same pattern `isOverTray` already
   * uses. `PlayRuntime` never learns this element exists; only React does.
   */
  rootRef?: React.Ref<HTMLDivElement> | undefined;
}

export function Shelf({
  ids,
  cell,
  dragging,
  bitmapOf,
  isEdge,
  onChipPointerDown,
  rootRef,
}: ShelfProps): React.ReactElement | null {
  if (ids.length === 0 && !dragging) return null;

  return (
    <div
      ref={rootRef}
      aria-label="Shelf"
      className={[
        'flex shrink-0 gap-[8px] overflow-x-auto px-[12px] py-[6px]',
        ids.length === 0 ? 'rounded-[8px] border border-dashed border-[var(--edge-hair)]' : '',
      ].join(' ')}
    >
      {ids.length === 0 ? (
        <p className="py-[8px] text-1 text-[var(--ink-muted)]">Drop a piece here to keep it.</p>
      ) : (
        ids.map((id) => (
          <PieceChip
            key={id}
            pieceId={id}
            bitmap={bitmapOf(id)}
            size={cell}
            isEdge={isEdge(id)}
            onMat={false}
            pinned
            onPointerDown={onChipPointerDown}
            onActivate={() => {}}
          />
        ))
      )}
    </div>
  );
}
