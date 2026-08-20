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
  /** Step 5c: the grid's scroll position, captured for the save format. */
  onScroll?: ((top: number) => void) | undefined;
  /** Step 5c: where a restored session left the grid scrolled. */
  initialScrollTop?: number | undefined;
  /**
   * §16 Track 4: the guided twelve's tray-reveal beat pulses the lens chips
   * once. `Tray` (and `LensChips` inside it) mounts fresh at exactly the
   * reveal moment for that puzzle — App.tsx does not conditionally mount it
   * for any other puzzle — so "pulse on mount" already is "pulse on reveal"
   * with no separate trigger needed. Defaults false for ordinary play, where
   * the tray is never freshly mounted mid-session this way.
   */
  pulseLenses?: boolean;
}

export function Tray(props: TrayProps): React.ReactElement {
  const chrome = useChrome();

  // Never in state — the badges come from `selectedCount` plus a render-time
  // read of this, and putting a mutable set in state would re-render the grid
  // on every toggle anyway. The count is the only thing React needs to know.
  const selection = useRef(new TraySelection());

  /**
   * The chip whose still press opened select mode, while that press is still on.
   *
   * The hold fires from the frame loop at `SELECT_HOLD_MS` with the finger
   * *still down*. The `pointerup` that ends that same hold then dispatches an
   * ordinary DOM `click` on the same chip, and in select mode a click is a
   * toggle — so without this the mode-opening gesture immediately deselects the
   * one piece it just selected, and every pull-out is a piece short.
   *
   * Tied to the gesture, never to a clock. It is armed by the hold and disarmed
   * by the next press on any chip, so a fast second tap on the same chip is
   * never eaten; and a hold that ends in a `pointercancel` — no click at all —
   * cannot leave a guard behind, because the only thing that could reach it is a
   * click, and a click needs a press first.
   *
   * `TrayDrag` cannot do this: it is DOM-free, it has already cleared its probe
   * by the time the hold fires, and a `click` is not an event it has ever seen.
   */
  const openedSelect = useRef<PieceId | null>(null);

  const enterSelect = (pieceId: PieceId): void => {
    selection.current.clear();
    selection.current.toggle(pieceId);
    openedSelect.current = pieceId;
    chrome.setSelecting(true);
    chrome.setSelectedCount(selection.current.size);
  };

  const toggleSelected = (pieceId: PieceId): void => {
    if (openedSelect.current === pieceId) {
      openedSelect.current = null;
      return;
    }
    selection.current.toggle(pieceId);
    chrome.setSelectedCount(selection.current.size);
  };

  const exitSelect = (): void => {
    selection.current.clear();
    openedSelect.current = null;
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

  const { onChipPointerDown: pressChip } = useTrayDrag({
    onPullOut: props.onPullOut,
    onEnterSelect: enterSelect,
    selecting: () => chrome.selecting,
  });

  // A new press is a new gesture, so whatever the last one armed is spent.
  // This is the disarm half of `openedSelect` and the reason it cannot leak.
  const onChipPointerDown = (pieceId: PieceId, event: React.PointerEvent): void => {
    openedSelect.current = null;
    pressChip(pieceId, event);
  };

  // Two nodes rather than one, because the sheet has to put the shelf *between*
  // them: at peek the shelf is the row that has to survive and the lenses are
  // the row that may clip, and a single header node offers nowhere to say so.
  // The dock has no peek to collide with and stacks them straight back up.
  const title = (
    <div className="flex items-baseline justify-between">
      <h2 className="text-3 font-medium text-[var(--ink-primary)]">Pieces</h2>
      <span className="font-[var(--font-data)] text-1 tabular-nums text-[var(--ink-muted)]">
        {props.remaining} left
      </span>
    </div>
  );

  const lenses = (
    <LensChips
      lens={props.lens}
      lensArg={props.lensArg}
      counts={props.counts}
      bins={props.bins}
      binCount={props.binCount}
      pulse={props.pulseLenses ?? false}
      onPick={props.onPick}
    />
  );

  // Built once, per the review note: two literal copies of this prop list
  // would be two places to forget the shelf exists. Which container ends up
  // mounting it is the only thing that differs below.
  const shelf = (
    <Shelf
      rootRef={props.shelfRef}
      ids={chrome.shelf}
      cell={CELL}
      dragging={props.dragging}
      bitmapOf={props.bitmapOf}
      isEdge={props.isEdge}
      onChipPointerDown={onChipPointerDown}
    />
  );
  // Mirrors `Shelf`'s own hidden-when-empty condition (`ids.length === 0 &&
  // !dragging`) — the sheet needs to know whether that row will render
  // *before* rendering it, to grow peek by exactly a shelf row and no more.
  const shelfVisible = chrome.shelf.length > 0 || props.dragging;

  const grid = (
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
      onScroll={props.onScroll}
      initialScrollTop={props.initialScrollTop}
    />
  );

  const selectionBar = chrome.selecting && (
    <SelectionBar
      count={chrome.selectedCount}
      onPullOut={() => {
        const ids = selection.current.ordered;
        exitSelect();
        props.onPullSelection(ids);
      }}
      onCancel={exitSelect}
    />
  );

  if (!props.docked) {
    // The sheet pins the shelf directly under the title, above the lens chips.
    // `collapseForDrag()` drops it to peek at the exact moment a drag makes the
    // shelf appear, so the shelf is the row that has to survive peek and the
    // lenses are the row that may clip — which is what they did at peek before
    // the shelf existed. Sizing peek from the measured region rather than from
    // arithmetic is the other half of that; see `Sheet.heightOf`.
    return (
      <Sheet
        rootRef={props.rootRef}
        detent={props.detent}
        onDetent={props.onDetent}
        header={title}
        shelf={shelf}
        shelfVisible={shelfVisible}
        lenses={lenses}
      >
        {grid}
        {selectionBar}
      </Sheet>
    );
  }

  // The dock has no detent to survive, so the shelf stays in document order
  // above the grid — there is no peek to collide with.
  return (
    <aside
      ref={props.rootRef}
      aria-label="Pieces"
      className="relative flex h-full shrink-0 flex-col border-l border-[var(--edge-hair)] bg-[var(--mat-raised)]"
      style={{ width: props.width, paddingRight: 'env(safe-area-inset-right)' }}
    >
      <ResizeEdge width={props.width} onWidth={props.onWidth} />
      <div className="flex shrink-0 flex-col gap-[12px] px-[12px] pb-[12px] pt-[16px]">
        {title}
        {lenses}
      </div>
      {shelf}
      {grid}
      {selectionBar}
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
