/**
 * React's half of the tray drag probe.
 *
 * All the deciding is in `TrayDrag`, which is DOM-free and tested. What is left
 * here is listener bookkeeping and one detail worth stating: the probe's
 * listeners go on `window`, not on the chip. The chip unmounts the instant the
 * piece is pulled out of the tray — that is what "leaves the list" means — so a
 * listener living on it would be removed mid-gesture and the drag would die
 * somewhere over the mat.
 */

import { useEffect, useRef } from 'react';
import type { PieceId } from '@/cut/types';
import { TrayDrag } from '@/input/tray-drag';

export interface UseTrayDragOptions {
  onPullOut: (pieceId: PieceId, event: PointerEvent) => boolean;
  onTap?: (pieceId: PieceId) => void;
}

export function useTrayDrag(options: UseTrayDragOptions): {
  onChipPointerDown: (pieceId: PieceId, event: React.PointerEvent) => void;
} {
  // Read through a ref so the probe is built once and never sees a stale
  // callback — rebuilding it on every render would drop a press in progress.
  const latest = useRef(options);
  latest.current = options;

  const drag = useRef<TrayDrag | null>(null);
  const frame = useRef(0);

  if (!drag.current) {
    drag.current = new TrayDrag({
      onPullOut: (pieceId, event) => latest.current.onPullOut(pieceId, event),
      onTap: (pieceId) => latest.current.onTap?.(pieceId),
    });
  }

  useEffect(() => {
    const probe = drag.current!;

    const move = (event: PointerEvent): void => probe.move(event);
    const up = (event: PointerEvent): void => probe.up(event);
    const cancel = (event: PointerEvent): void => probe.cancel(event);

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);

    // The long press needs a heartbeat, exactly as the board's does — a player
    // who presses a chip and holds still is deciding, and that is the moment the
    // piece should come up into the hand.
    const tick = (now: number): void => {
      if (probe.pressing) probe.tick(now);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      cancelAnimationFrame(frame.current);
      probe.cancel();
    };
  }, []);

  return {
    onChipPointerDown: (pieceId, event) => drag.current!.down(pieceId, event.nativeEvent),
  };
}
