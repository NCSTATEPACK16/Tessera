/**
 * The top bar (§12; modernize spec §5).
 *
 * Deliberately quiet: the puzzle's name, `n / N`, ghost icon buttons and a
 * 3px line. Zoom in and out sit beside Fit because one touch never moves the
 * camera (`input/pointer.ts`): they are the one-handed way to zoom. The real progress indicator is the light on the board (§07), and
 * chrome that competes with it would be arguing with the entire thesis. The
 * line's width is one CSS transition on one property, set when a placement
 * changes the summary — never a per-frame update.
 */

import type { Ref } from 'react';
import { topBarModel, type TopBarInput } from '@/play/top-bar';
import { Icon } from './kit';

export interface TopBarProps extends TopBarInput {
  /** The puzzle's name — `puzzleTitle`. */
  title: string;
  /** Measured by `App` so the board can be framed below the bar. */
  rootRef?: Ref<HTMLElement>;
  onFit: () => void;
  /** Multiply the zoom about the visible centre. */
  onZoom: (factor: number) => void;
  onPause: () => void;
}

const ICON_BUTTON =
  'pointer-events-auto touch-target flex items-center justify-center rounded-full text-[var(--ink-primary)] transition-colors duration-[var(--duration-fast)] hover:bg-[color-mix(in_srgb,var(--mat-raised)_82%,transparent)]';

/** One press of a zoom button. Four presses from 1× is roughly the 4× ceiling. */
export const ZOOM_STEP = 1.4;

export function TopBar({
  title,
  rootRef,
  onFit,
  onZoom,
  onPause,
  ...input
}: TopBarProps): React.ReactElement {
  const { count, progress } = topBarModel(input);
  const percent = Math.round(progress * 100);

  return (
    <header
      ref={rootRef}
      className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 px-4 pb-1"
      style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <h1 className="m-0 truncate font-display text-4 font-normal leading-tight text-[var(--ink-primary)]">
            {title}
          </h1>
          <span className="font-data text-1 tabular-nums text-[var(--ink-secondary)]">{count}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => onZoom(1 / ZOOM_STEP)}
            className={ICON_BUTTON}
          >
            <Icon.ZoomOut />
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => onZoom(ZOOM_STEP)}
            className={ICON_BUTTON}
          >
            <Icon.ZoomIn />
          </button>
          <button type="button" aria-label="Fit" onClick={onFit} className={ICON_BUTTON}>
            <Icon.Fit />
          </button>
          <button type="button" aria-label="Pause" onClick={onPause} className={ICON_BUTTON}>
            <Icon.Pause />
          </button>
        </div>
      </div>
      <div
        role="progressbar"
        aria-label="Progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-[3px] w-full overflow-hidden rounded-full bg-[var(--edge-hair)]"
      >
        <div
          className="h-full rounded-full bg-[var(--accent)]"
          style={{
            width: `${progress * 100}%`,
            transition: 'width var(--duration-slow) var(--ease-standard)',
          }}
        />
      </div>
    </header>
  );
}
