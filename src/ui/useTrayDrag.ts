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
  /** Stillness past `SELECT_HOLD_MS`: enter multi-select with this chip as #1. */
  onEnterSelect?: (pieceId: PieceId) => void;
  /** True while the tray is in select mode. Asked, never cached. */
  selecting?: () => boolean;
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
      onEnterSelect: (pieceId) => latest.current.onEnterSelect?.(pieceId),
      onTap: (pieceId) => latest.current.onTap?.(pieceId),
      selecting: () => latest.current.selecting?.() ?? false,
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

    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      probe.cancel();
    };
  }, []);

  // Not inside the effect: `tick` only ever reads `drag.current`/`frame.current`,
  // which are refs and always current, so a fresh closure per render costs
  // nothing and needs no dependency array to go stale over.
  //
  // The select hold needs a heartbeat, exactly as the board's long press does —
  // a player who presses a chip and holds still is deciding *which pieces*. But
  // the loop must not outlive the press: rescheduling itself unconditionally,
  // as this used to, pins a permanent per-frame callback for the tray's entire
  // mounted lifetime on a battery-powered target, whether or not a finger is
  // anywhere near it. So the loop starts from `down`, below, and stops
  // rescheduling the moment `pressing` goes false.
  const tick = (now: number): void => {
    const probe = drag.current!;
    if (!probe.pressing) {
      frame.current = 0;
      return;
    }
    probe.tick(now);
    frame.current = requestAnimationFrame(tick);
  };

  return {
    onChipPointerDown: (pieceId, event) => {
      drag.current!.down(pieceId, event.nativeEvent);
      // Only start a loop if one is not already running — a second press
      // while one is in flight (`TrayDrag.down` itself no-ops on this) must
      // not spawn a duplicate rAF chain.
      if (frame.current === 0) frame.current = requestAnimationFrame(tick);
    },
  };
}
