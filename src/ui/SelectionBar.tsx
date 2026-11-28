/**
 * Select mode's action bar (§06).
 *
 * Exit is explicit — Cancel, Escape, or completing the pull-out — and never an
 * outside tap. A stray tap on the board during a careful ten-piece selection
 * must not discard it.
 */

import React from 'react';
import { Button } from './kit';

export interface SelectionBarProps {
  count: number;
  /** Ruling R5: pins every selected piece and ends select mode. */
  onPin: () => void;
  onPullOut: () => void;
  onCancel: () => void;
}

export function SelectionBar({
  count,
  onPin,
  onPullOut,
  onCancel,
}: SelectionBarProps): React.ReactElement {
  return (
    <div className="flex shrink-0 items-center gap-[8px] px-[12px] py-[8px]">
      {/* The count lives here, once, rather than inside a button label. */}
      <span className="meta flex-1 text-[var(--ink-muted)]">{count} selected</span>
      <Button variant="outline" disabled={count < 1} onClick={onPin}>
        Pin
      </Button>
      {/* A pull-out of one is just a drag; two is the least that is a group. */}
      <Button variant="primary" disabled={count < 2} onClick={onPullOut}>
        Pull out
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
