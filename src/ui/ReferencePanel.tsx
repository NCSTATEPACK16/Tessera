/**
 * The box-lid reference panel (§C) — a persistent small thumbnail of the
 * whole target photo, docked in the tray. Independent of the board's render
 * pipeline entirely: this is a plain `<canvas>` drawn once per photo, not a
 * layer `Renderer` knows about.
 *
 * Not the ghost underlay (`PuzzleAssists.ghostOpacity`, drawn on the board
 * itself by `Renderer.setGhostUnderlay`) — this is a separate assist, shown
 * or hidden independently.
 */

import { useEffect, useRef, useState } from 'react';

export interface ReferencePanelProps {
  /**
   * Resolves to a fresh decode of the source photo. A function rather than a
   * bitmap prop: the caller owns sequencing around the async, fire-and-forget
   * `savePhoto` write this races against on a freshly started puzzle (see
   * `App.tsx`'s wiring), and owns closing the bitmap once drawn.
   */
  loadBitmap: () => Promise<ImageBitmap>;
  open: boolean;
  /**
   * The sheet's height budget: at default the pinned chrome must still leave
   * two whole rows of pieces on a 664px phone, so the sheet's panel keeps the
   * old open row's 44px. The dock has the height and shows the photo larger.
   */
  compact: boolean;
}

export function ReferencePanel({
  loadBitmap,
  open,
  compact,
}: ReferencePanelProps): React.ReactElement | null {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let bitmap: ImageBitmap | null = null;
    void loadBitmap()
      .then((bmp) => {
        if (cancelled) {
          bmp.close();
          return;
        }
        bitmap = bmp;
        const canvas = canvasRef.current;
        if (!canvas) return;
        // Sized from the box it lands in, at most 2x: the tray's width is the
        // player's to choose, and the panel spans it.
        const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
        canvas.width = Math.round(canvas.clientWidth * dpr);
        canvas.height = Math.round(canvas.clientHeight * dpr);
        const scale = Math.min(canvas.width / bmp.width, canvas.height / bmp.height);
        const w = bmp.width * scale;
        const h = bmp.height * scale;
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        ctx?.drawImage(bmp, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      bitmap?.close();
    };
  }, [open, loadBitmap]);

  // Closed is nothing at all: the title row's `ReferenceButton` is the toggle.
  if (!open) return null;

  return (
    <div className="px-[12px] pb-[8px]">
      {failed ? (
        <p
          className={`meta flex ${compact ? 'h-[44px]' : 'h-[96px]'} items-center justify-center rounded-[var(--radius-sm)] border border-[var(--edge-hair)] text-[var(--ink-muted)]`}
        >
          Reference photo not available yet
        </p>
      ) : (
        <canvas
          ref={canvasRef}
          className={`block w-full rounded-[var(--radius-sm)] ${compact ? 'h-[44px]' : 'h-[96px]'}`}
          aria-label="Reference photo thumbnail"
        />
      )}
    </div>
  );
}
