/**
 * One tray cell (§12's "piece chip").
 *
 * The bitmap is drawn onto a small `<canvas>` rather than converted to a blob
 * URL, and with `drawImage` rather than `transferFromImageBitmap` — the latter
 * *consumes* the `ImageBitmap`, and that same bitmap is what the renderer draws
 * the piece from on the mat. One `transferFromImageBitmap` here and the piece
 * vanishes from the board the moment it is dragged out.
 *
 * Only the chips actually on screen exist, so the canvas count stays in the
 * dozens rather than the hundreds. See `PieceGrid`.
 *
 * Edge pieces get a corner notch glyph as well as a tint: §06 is explicit that
 * colour is never the only signal.
 */

import { useEffect, useRef } from 'react';
import type { PieceId } from '@/cut/types';

export interface PieceChipProps {
  pieceId: PieceId;
  bitmap: ImageBitmap | null;
  size: number;
  isEdge: boolean;
  /** On the mat rather than in the tray: shown by the Recent lens only. */
  onMat: boolean;
  onPointerDown: (pieceId: PieceId, event: React.PointerEvent) => void;
  onActivate: (pieceId: PieceId) => void;
  /** 1-based selection order, or 0. Rendered as a numeral — never colour alone. */
  badge?: number;
  pinned?: boolean;
  selecting?: boolean;
}

export function PieceChip({
  pieceId,
  bitmap,
  size,
  isEdge,
  onMat,
  onPointerDown,
  onActivate,
  badge = 0,
  pinned,
  selecting,
}: PieceChipProps): React.ReactElement {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    if (!element || !bitmap) return;

    const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
    element.width = Math.floor(size * ratio);
    element.height = Math.floor(size * ratio);

    const ctx = element.getContext('2d');
    if (!ctx) return;

    // Fit the piece inside the cell with a little air, preserving its aspect —
    // a squashed thumbnail is unrecognisable against the piece on the mat, and
    // recognising it is the entire job of this element.
    const inset = size * 0.1 * ratio;
    const box = size * ratio - inset * 2;
    const scale = Math.min(box / bitmap.width, box / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;

    ctx.clearRect(0, 0, element.width, element.height);
    ctx.drawImage(bitmap, (size * ratio - w) / 2, (size * ratio - h) / 2, w, h);
  }, [bitmap, size]);

  return (
    <button
      type="button"
      // The Recent lens shows pieces already on the mat. Dragging one of those
      // from here would be a second copy of a piece that already exists, so the
      // chip locates it instead — the frustration it fixes is "where did it go",
      // not "I cannot reach it".
      aria-label={
        onMat
          ? `Find piece ${pieceId} on the mat`
          : badge
            ? `Piece ${pieceId}, selected ${badge}`
            : `Piece ${pieceId}`
      }
      aria-pressed={selecting ? badge > 0 : undefined}
      onPointerDown={(event) => {
        if (onMat) return;
        onPointerDown(pieceId, event);
      }}
      onClick={() => {
        if (selecting) onActivate(pieceId);
        else if (onMat) onActivate(pieceId);
      }}
      // `pan-y`, never `none`. `none` does not lose a race with native scrolling
      // — it disables it, so no `pointercancel` ever fires and the handler in
      // `useTrayDrag` never runs. Chips are 56px on an 8px gap, which left the
      // scroll container reachable only through the gutters: on a phone the tray
      // could not be scrolled by touch at all. The vertical axis belongs to the
      // browser; `TrayDrag` commits to a drag on horizontal movement.
      style={{ width: size, height: size, touchAction: 'pan-y' }}
      className={[
        'relative flex items-center justify-center rounded-[8px] border transition-colors',
        onMat ? 'opacity-40' : 'active:border-[var(--accent)]',
        pinned && !onMat ? 'border-[var(--accent)]' : 'border-[var(--edge-hair)]',
        'bg-[var(--mat-felt)]',
      ].join(' ')}
    >
      <canvas ref={canvas} style={{ width: size, height: size }} className="pointer-events-none" />

      {isEdge && (
        // The notch glyph. Never the tint alone (§06).
        <span
          aria-hidden
          className="pointer-events-none absolute left-[3px] top-[3px] h-[9px] w-[9px] border-l-2 border-t-2 border-[var(--accent)] opacity-80"
        />
      )}
      {pinned && !onMat && (
        // The pinned glyph — drawn, not typed, matching the notch's approach
        // above. A free corner (badge top-right, notch top-left, mat label
        // bottom-right), because colour is never the only signal: the accent
        // border is decoration, this shape is what the state actually reads
        // on, colour vision or not.
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-[2px] left-[3px] h-[9px] w-[7px] bg-[var(--accent)] opacity-80"
          style={{ clipPath: 'polygon(50% 100%, 0% 35%, 15% 0%, 85% 0%, 100% 35%)' }}
        />
      )}
      {badge > 0 && (
        // §06's numbered order badge. The numeral is the signal; the ring is
        // decoration, because colour is never the only signal.
        <span className="pointer-events-none absolute right-[2px] top-[2px] flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[var(--accent)] px-[3px] font-[var(--font-data)] text-[10px] text-black">
          {badge}
        </span>
      )}
      {onMat && (
        <span className="pointer-events-none absolute bottom-[2px] right-[4px] font-[var(--font-data)] text-[10px] text-[var(--ink-muted)]">
          mat
        </span>
      )}
    </button>
  );
}
