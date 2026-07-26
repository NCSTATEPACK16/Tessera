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
}

export function PieceChip({
  pieceId,
  bitmap,
  size,
  isEdge,
  onMat,
  onPointerDown,
  onActivate,
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
      aria-label={onMat ? `Find piece ${pieceId} on the mat` : `Piece ${pieceId}`}
      onPointerDown={(event) => {
        if (onMat) return;
        onPointerDown(pieceId, event);
      }}
      onClick={() => {
        if (onMat) onActivate(pieceId);
      }}
      style={{ width: size, height: size, touchAction: 'none' }}
      className={[
        'relative flex items-center justify-center rounded-[8px] border transition-colors',
        'border-[var(--edge-hair)] bg-[var(--mat-felt)]',
        onMat ? 'opacity-40' : 'active:border-[var(--accent)]',
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
      {onMat && (
        <span className="pointer-events-none absolute bottom-[2px] right-[4px] font-[var(--font-data)] text-[10px] text-[var(--ink-muted)]">
          mat
        </span>
      )}
    </button>
  );
}
