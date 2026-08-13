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
  onToggle: () => void;
}

export function ReferencePanel({
  loadBitmap,
  open,
  onToggle,
}: ReferencePanelProps): React.ReactElement {
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

  if (!open) {
    return (
      <button
        type="button"
        aria-label="Show reference photo"
        onClick={onToggle}
        className="touch-target flex w-full items-center justify-between px-[12px] text-1 text-[var(--ink-muted)]"
      >
        <span>Reference photo</span>
        <span aria-hidden>Show</span>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-[4px] px-[12px] pb-[8px]">
      <div className="flex items-center justify-between">
        <span className="text-1 text-[var(--ink-muted)]">Reference photo</span>
        <button
          type="button"
          aria-label="Hide reference photo"
          onClick={onToggle}
          className="touch-target text-1 text-[var(--ink-muted)]"
        >
          Hide
        </button>
      </div>
      {failed ? (
        <div className="text-1 text-[var(--ink-muted)]">Not available yet</div>
      ) : (
        <canvas
          ref={canvasRef}
          width={280}
          height={140}
          className="w-full rounded-[var(--radius-sm)]"
          aria-label="Reference photo thumbnail"
        />
      )}
    </div>
  );
}
