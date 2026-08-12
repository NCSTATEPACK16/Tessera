/**
 * Select mode's action bar (§06).
 *
 * Exit is explicit — Cancel, Escape, or completing the pull-out — and never an
 * outside tap. A stray tap on the board during a careful ten-piece selection
 * must not discard it.
 */

import React from 'react';

export interface SelectionBarProps {
  count: number;
  onPullOut: () => void;
  onCancel: () => void;
}

export function SelectionBar({ count, onPullOut, onCancel }: SelectionBarProps): React.ReactElement {
  return (
    <div className="flex shrink-0 items-center gap-[8px] px-[12px] py-[8px]">
      <button
        type="button"
        // 44pt floor, everywhere.
        className="touch-target flex-1 rounded-[8px] bg-[var(--accent)] px-[12px] text-2 text-black disabled:opacity-40"
        disabled={count < 2}
        onClick={onPullOut}
      >
        Pull out {count}
      </button>
      <button
        type="button"
        className="touch-target rounded-[8px] border border-[var(--edge-hair)] px-[12px] text-2"
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  );
}
