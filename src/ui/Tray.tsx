/**
 * The tray (§06) — docked on iPad, a bottom sheet on iPhone.
 *
 * One component for both form factors on purpose: the lens row, the chip grid,
 * and the drag-out gesture are identical, and the only thing that differs is the
 * container. Two components would be two places to forget that filters are
 * lenses.
 *
 * The dock's inner edge is a resize handle, 300–380pt per §06. Resizing changes
 * the board's viewport, which is why `App` watches the board container with a
 * `ResizeObserver` rather than the window — a window resize event never fires
 * when the player drags this edge, and the camera would silently stop matching
 * the canvas.
 */

import { useRef } from 'react';
import type { PieceId } from '@/cut/types';
import type { ColourBin } from '@/tray/colour';
import type { Lens } from '@/tray/lenses';
import { LensChips } from './LensChips';
import { PieceGrid } from './PieceGrid';
import { Sheet } from './Sheet';
import { TRAY_MAX_WIDTH, TRAY_MIN_WIDTH } from './store';
import type { SheetDetent } from './store';

/** 44pt floor with air around the thumbnail. */
const CELL = 56;
const GAP = 8;

export interface TrayProps {
  /**
   * The tray's own element, so a drop over it can be recognised.
   *
   * On the root of whichever container is in use rather than on a wrapper: a
   * wrapper would need `display: contents` to keep the dock's flex layout
   * intact, and a `contents` element has no bounding rectangle at all — the
   * drop test would silently always answer "no".
   */
  rootRef?: React.Ref<HTMLElement> | undefined;
  docked: boolean;
  width: number;
  detent: SheetDetent;
  onWidth: (width: number) => void;
  onDetent: (detent: SheetDetent) => void;

  lens: Lens;
  lensArg: number | null;
  counts: Map<Lens, { count: number; enabled: boolean }>;
  bins: readonly ColourBin[];
  binCount: (bin: number) => number;
  onPick: (lens: Lens, arg?: number | null) => void;

  ids: readonly PieceId[];
  remaining: number;
  bitmapOf: (id: PieceId) => ImageBitmap | null;
  isEdge: (id: PieceId) => boolean;
  isOnMat: (id: PieceId) => boolean;
  onChipPointerDown: (pieceId: PieceId, event: React.PointerEvent) => void;
  onLocate: (pieceId: PieceId) => void;
}

export function Tray(props: TrayProps): React.ReactElement {
  const header = (
    <div className="flex flex-col gap-[12px]">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[16px] font-medium text-[var(--ink-primary)]">Pieces</h2>
        <span className="font-[var(--font-data)] text-[12px] tabular-nums text-[var(--ink-muted)]">
          {props.remaining} left
        </span>
      </div>
      <LensChips
        lens={props.lens}
        lensArg={props.lensArg}
        counts={props.counts}
        bins={props.bins}
        binCount={props.binCount}
        onPick={props.onPick}
      />
    </div>
  );

  const grid = (
    <PieceGrid
      ids={props.ids}
      cell={CELL}
      gap={GAP}
      bitmapOf={props.bitmapOf}
      isEdge={props.isEdge}
      isOnMat={props.isOnMat}
      onChipPointerDown={props.onChipPointerDown}
      onLocate={props.onLocate}
    />
  );

  if (!props.docked) {
    return (
      <Sheet
        rootRef={props.rootRef}
        detent={props.detent}
        onDetent={props.onDetent}
        header={header}
      >
        {grid}
      </Sheet>
    );
  }

  return (
    <aside
      ref={props.rootRef}
      aria-label="Pieces"
      className="relative flex h-full shrink-0 flex-col border-l border-[var(--edge-hair)] bg-[var(--mat-raised)]"
      style={{ width: props.width, paddingRight: 'env(safe-area-inset-right)' }}
    >
      <ResizeEdge width={props.width} onWidth={props.onWidth} />
      <div className="shrink-0 px-[12px] pb-[12px] pt-[16px]">{header}</div>
      {grid}
    </aside>
  );
}

/** The dock's inner edge. §06: "resizable by dragging its inner edge." */
function ResizeEdge({
  width,
  onWidth,
}: {
  width: number;
  onWidth: (width: number) => void;
}): React.ReactElement {
  const origin = useRef<{ x: number; width: number } | null>(null);

  return (
    <div
      role="separator"
      aria-label="Resize the piece tray"
      aria-valuenow={width}
      aria-valuemin={TRAY_MIN_WIDTH}
      aria-valuemax={TRAY_MAX_WIDTH}
      // Wider than it looks: a 1px hairline is a 1px target, and §13 puts the
      // floor at 44pt for everything.
      className="absolute left-[-10px] top-0 z-10 h-full w-[20px] cursor-col-resize"
      style={{ touchAction: 'none' }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        origin.current = { x: event.clientX, width };
      }}
      onPointerMove={(event) => {
        const start = origin.current;
        if (!start) return;
        onWidth(start.width + (start.x - event.clientX));
      }}
      onPointerUp={() => {
        origin.current = null;
      }}
      onPointerCancel={() => {
        origin.current = null;
      }}
    />
  );
}
