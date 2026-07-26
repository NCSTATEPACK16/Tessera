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

import { useEffect, useRef } from 'react';
import type { PieceId } from '@/cut/types';
import type { ColourBin } from '@/tray/colour';
import type { Lens } from '@/tray/lenses';
import { TraySelection } from '@/tray/selection';
import { LensChips } from './LensChips';
import { PieceGrid } from './PieceGrid';
import { SelectionBar } from './SelectionBar';
import { Shelf } from './Shelf';
import { Sheet } from './Sheet';
import { TRAY_MAX_WIDTH, TRAY_MIN_WIDTH, useChrome } from './store';
import type { SheetDetent } from './store';
import { useTrayDrag } from './useTrayDrag';

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
  /** The shelf row's own element (§06), so a drop over it can pin rather than
   * just return. Same reasoning as `rootRef`, one region smaller. */
  shelfRef?: React.Ref<HTMLDivElement> | undefined;
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
  /**
   * The drag-out probe now lives here rather than at the call site: select mode
   * is entered from the same press-and-hold the probe already watches, and the
   * `TraySelection` it feeds is owned by this component (see below).
   */
  onPullOut: (pieceId: PieceId, event: PointerEvent) => boolean;
  onLocate: (pieceId: PieceId) => void;
  /** A chip drag is in flight (§06) — the shelf shows its dashed placeholder. */
  dragging: boolean;
  /** §06's pull-out. The button that calls it is disabled below two pieces. */
  onPullSelection: (pieceIds: readonly PieceId[]) => void;
}

export function Tray(props: TrayProps): React.ReactElement {
  const chrome = useChrome();

  // Never in state — the badges come from `selectedCount` plus a render-time
  // read of this, and putting a mutable set in state would re-render the grid
  // on every toggle anyway. The count is the only thing React needs to know.
  const selection = useRef(new TraySelection());

  const enterSelect = (pieceId: PieceId): void => {
    selection.current.clear();
    selection.current.toggle(pieceId);
    chrome.setSelecting(true);
    chrome.setSelectedCount(selection.current.size);
  };

  const toggleSelected = (pieceId: PieceId): void => {
    selection.current.toggle(pieceId);
    chrome.setSelectedCount(selection.current.size);
  };

  const exitSelect = (): void => {
    selection.current.clear();
    chrome.setSelecting(false);
    chrome.setSelectedCount(0);
  };

  // Exit is explicit — Cancel, Escape, or completing the pull-out — and never an
  // outside tap. A stray tap on the board during a careful ten-piece selection
  // must not discard it.
  useEffect(() => {
    if (!chrome.selecting) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') exitSelect();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chrome.selecting]);

  const { onChipPointerDown } = useTrayDrag({
    onPullOut: props.onPullOut,
    onEnterSelect: enterSelect,
    selecting: () => chrome.selecting,
  });

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

  // Shelf, then grid, then the select-mode action bar — in that order both on
  // the dock and in the sheet, so the two form factors read identically.
  const body = (
    <>
      <Shelf
        rootRef={props.shelfRef}
        ids={chrome.shelf}
        cell={CELL}
        dragging={props.dragging}
        bitmapOf={props.bitmapOf}
        isEdge={props.isEdge}
        onChipPointerDown={onChipPointerDown}
      />
      <PieceGrid
        ids={props.ids}
        cell={CELL}
        gap={GAP}
        bitmapOf={props.bitmapOf}
        isEdge={props.isEdge}
        isOnMat={props.isOnMat}
        onChipPointerDown={onChipPointerDown}
        onLocate={props.onLocate}
        selecting={chrome.selecting}
        badgeOf={(id) => selection.current.badgeOf(id)}
        onChipClick={toggleSelected}
      />
      {chrome.selecting && (
        <SelectionBar
          count={chrome.selectedCount}
          onPullOut={() => {
            const ids = selection.current.ordered;
            exitSelect();
            props.onPullSelection(ids);
          }}
          onCancel={exitSelect}
        />
      )}
    </>
  );

  if (!props.docked) {
    return (
      <Sheet
        rootRef={props.rootRef}
        detent={props.detent}
        onDetent={props.onDetent}
        header={header}
      >
        {body}
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
      {body}
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
