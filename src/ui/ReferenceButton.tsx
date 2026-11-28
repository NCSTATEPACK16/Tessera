/**
 * The reference photo's toggle, in the tray's title row (modernize §5): the
 * photo itself, cover-fit into a 44pt square, so the control says what it
 * opens. It decodes once on mount through the same loader the panel uses, and
 * falls back to a photo glyph until — or unless — that decode lands.
 */

import { useEffect, useRef, useState } from 'react';
import { Icon } from './kit';

export interface ReferenceButtonProps {
  /** The same loader `ReferencePanel` takes — see its prop doc. */
  loadBitmap: () => Promise<ImageBitmap>;
  open: boolean;
  onToggle: () => void;
}

const SIDE = 44;

export function ReferenceButton({
  loadBitmap,
  open,
  onToggle,
}: ReferenceButtonProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadBitmap()
      .then((bmp) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) {
          bmp.close();
          return;
        }
        // Cover, not contain: a thumbnail with letterbox bars reads as a frame.
        const scale = Math.max(canvas.width / bmp.width, canvas.height / bmp.height);
        const w = bmp.width * scale;
        const h = bmp.height * scale;
        canvas
          .getContext('2d')
          ?.drawImage(bmp, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        bmp.close();
        setDrawn(true);
      })
      .catch(() => {
        // The glyph stays: the button still opens the panel, which says why.
      });
    return () => {
      cancelled = true;
    };
  }, [loadBitmap]);

  return (
    <button
      type="button"
      aria-label="Reference photo"
      aria-pressed={open}
      onClick={onToggle}
      className={[
        'touch-target relative grid shrink-0 place-items-center overflow-hidden rounded-[var(--radius-sm)]',
        'border bg-[var(--mat-felt)] text-[var(--ink-muted)] transition-colors',
        open ? 'border-[var(--accent)]' : 'border-[var(--edge-hair)]',
      ].join(' ')}
      style={{ width: SIDE, height: SIDE }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        width={SIDE * 2}
        height={SIDE * 2}
        className={`absolute inset-0 h-full w-full ${drawn ? '' : 'invisible'}`}
      />
      {!drawn && <Icon.Photo size={20} />}
    </button>
  );
}
