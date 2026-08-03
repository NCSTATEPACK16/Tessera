/**
 * The top bar (§12).
 *
 * Deliberately quiet. Progress is the arc and the numerals; the real progress
 * indicator is the light on the board (§07), and chrome that competes with it
 * would be arguing with the entire thesis.
 *
 * The count is **the real computed number, never the target** (§04) — "200"
 * lands on 17 × 12 = 204, and showing 200 would be a small lie the player can
 * check.
 */

import { ProgressRing } from './ProgressRing';

export interface TopBarProps {
  status: 'cutting' | 'playing' | 'complete' | 'failed';
  placed: number;
  total: number;
  cut: { done: number; total: number; cols: number; rows: number };
  onFit: () => void;
}

export function TopBar({ status, placed, total, cut, onFit }: TopBarProps): React.ReactElement {
  const completion = total === 0 ? 0 : placed / total;

  return (
    <header
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-[16px] p-[12px]"
      style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
    >
      <div className="pointer-events-auto flex items-center gap-[12px] rounded-[14px] border border-[var(--edge-hair)] bg-[color-mix(in_srgb,var(--mat-raised)_82%,transparent)] px-[14px] py-[8px] backdrop-blur-[12px]">
        <ProgressRing completion={completion} size={32} />
        <div className="flex flex-col">
          <span className="font-[var(--font-data)] text-[14px] tabular-nums text-[var(--ink-primary)]">
            {placed} / {total}
          </span>
          <span className="text-[12px] text-[var(--ink-muted)]">
            {status === 'cutting'
              ? cut.total > 0
                ? `Cutting ${cut.done} of ${cut.total}`
                : 'Cutting'
              : status === 'failed'
                ? 'The cut failed'
                : `${cut.cols} × ${cut.rows}`}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onFit}
        className="pointer-events-auto rounded-[14px] border border-[var(--edge-hair)] bg-[color-mix(in_srgb,var(--mat-raised)_82%,transparent)] px-[16px] text-[14px] text-[var(--ink-primary)] backdrop-blur-[12px]"
      >
        Fit
      </button>
    </header>
  );
}
