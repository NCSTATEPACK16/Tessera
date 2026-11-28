/**
 * The play screen's layout (modernize spec §5, phase c): the board column —
 * canvas, top bar or card, hint, overlays — and beside it the tray, docked or
 * as the phone sheet, with the pause sheet over everything.
 *
 * Slots, not state: `App` owns the runtime, the summary and every handler, and
 * builds each element; this file owns only where they sit. The board element
 * itself is the canvas host, which React never touches again after mount.
 */

import type { ReactNode } from 'react';

export interface PlayScreenProps {
  /** v2 spec §5.3: a left dock is the same row, reversed — the tray stays after
   * the board in the DOM, so focus order and the sheet path are unchanged. */
  reversed: boolean;
  board: ReactNode;
  /** The completion card, or the top bar while there is something to place. */
  header: ReactNode;
  hint: ReactNode;
  /** The group-rename form and the first run's overlay. */
  overlays: ReactNode;
  tray: ReactNode;
  pause: ReactNode;
}

export function PlayScreen({
  reversed,
  board,
  header,
  hint,
  overlays,
  tray,
  pause,
}: PlayScreenProps): React.ReactElement {
  return (
    <div className={`flex h-full w-full bg-[var(--mat-void)] ${reversed ? 'flex-row-reverse' : ''}`}>
      <div className="relative min-w-0 flex-1">
        {board}
        {header}
        {hint}
        {overlays}
      </div>
      {tray}
      {pause}
    </div>
  );
}
