/**
 * The Daily hub (design doc screen 11; `PLAN.md` step 6).
 *
 * Every one of the doc's six states for this screen is a prop combination
 * rather than internal state, so there is one place — `App.tsx` — that decides
 * which one the player is in, and this file only draws it.
 *
 * The today card's preview is drawn straight from the curated photo, once,
 * into a small canvas. That is not the board thumbnail: an in-progress daily
 * *does* have a board thumbnail, and it is preferred when present, because
 * `PLAN.md` is explicit that a progress card shows the board and not the
 * source photo.
 *
 * No leaderboard tab. `PLAN.md` and the design doc both say v1 ships
 * streak-only, and the tab appears the day accounts exist.
 */

import { useEffect, useRef, useState } from 'react';
import { curatedPhotoById, renderCuratedPhoto } from '@/play/curated';
import type { DailyPuzzle } from '@/daily/daily';
import type { DayCell, MonthGrid } from '@/daily/streak';
import { MonthCalendar } from './MonthCalendar';
import { ProgressRing } from './ProgressRing';
import { StreakFlame, streakMessage } from './StreakFlame';
import type { StreakTone } from './StreakFlame';

export interface DailyHubProps {
  daily: DailyPuzzle;
  /** Human date for the card, e.g. "Monday, 3 August". Formatted by the caller. */
  dateLabel: string;
  monthLabel: string;
  streak: number;
  freezes: number;
  tone: StreakTone;
  pips: readonly DayCell[];
  grid: MonthGrid;
  /** Non-null when today's daily is saved and unfinished. */
  progress: { placed: number; total: number } | null;
  /** The saved board thumbnail for an in-progress daily. */
  progressThumbnail: Blob | null;
  doneToday: boolean;
  canRepair: boolean;
  onRepair: () => void;
  onStart: () => void;
  onLibrary: () => void;
  onNewPuzzle: () => void;
}

/** The curated photo for today, drawn once at card size. */
function DailyPreview({ photoId }: { photoId: string }): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let bitmap: ImageBitmap | null = null;
    void (async () => {
      const rendered = await renderCuratedPhoto(photoId);
      bitmap = rendered;
      const canvas = canvasRef.current;
      if (cancelled || !canvas) {
        rendered.close();
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // `object-fit: cover`, by hand: fill the card and crop the overflow.
      const scale = Math.max(canvas.width / rendered.width, canvas.height / rendered.height);
      const w = rendered.width * scale;
      const h = rendered.height * scale;
      ctx.drawImage(rendered, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    })();
    return () => {
      cancelled = true;
      bitmap?.close();
    };
  }, [photoId]);

  return <canvas ref={canvasRef} width={640} height={480} className="h-full w-full object-cover" />;
}

function ProgressThumbnail({ blob }: { blob: Blob }): React.ReactElement {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span />;
}

export function DailyHub({
  daily,
  dateLabel,
  monthLabel,
  streak,
  freezes,
  tone,
  pips,
  grid,
  progress,
  progressThumbnail,
  doneToday,
  canRepair,
  onRepair,
  onStart,
  onLibrary,
  onNewPuzzle,
}: DailyHubProps): React.ReactElement {
  const photoName = curatedPhotoById(daily.photoId)?.name ?? 'Today’s photo';
  const cta = doneToday ? 'Play it again' : progress ? 'Continue today’s' : 'Start today’s';

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="font-[var(--font-display)] text-5 text-[var(--ink-primary)]">
          Daily
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Your puzzles"
            onClick={onLibrary}
            className="touch-target rounded-[var(--radius-md)] border border-[var(--edge-hair)] px-3 text-2 text-[var(--ink-primary)]"
          >
            Your puzzles
          </button>
          <button
            type="button"
            aria-label="New puzzle"
            onClick={onNewPuzzle}
            className="touch-target rounded-[var(--radius-md)] border border-[var(--edge-hair)] px-3 text-2 text-[var(--ink-primary)]"
          >
            New puzzle
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        {/* Today's card */}
        <div className="flex min-w-[240px] flex-[1.3] flex-col gap-2">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--edge-hair)] bg-[var(--mat-void)]">
            {progressThumbnail ? (
              <ProgressThumbnail blob={progressThumbnail} />
            ) : (
              <DailyPreview photoId={daily.photoId} />
            )}
            {progress && (
              <div className="absolute right-2 top-2">
                <ProgressRing
                  completion={progress.total === 0 ? 0 : progress.placed / progress.total}
                  size={32}
                />
              </div>
            )}
            {doneToday && (
              <div className="absolute right-2 top-2 rounded-[var(--radius-sm)] bg-[var(--accent)] px-2 py-1 text-1 text-[var(--mat-void)]">
                ✓ Done today
              </div>
            )}
          </div>
          <div className="text-2 text-[var(--ink-primary)]">
            {dateLabel} · {photoName}
          </div>
          <div className="font-[var(--font-data)] text-1 tabular-nums text-[var(--ink-muted)]">
            {progress
              ? `${progress.placed} / ${progress.total} placed`
              : `${daily.targetCount} pieces`}
          </div>
        </div>

        {/* Streak */}
        <div className="flex min-w-[240px] flex-1 flex-col justify-between gap-3">
          <StreakFlame streak={streak} freezes={freezes} tone={tone} pips={pips} />
          <div className="text-2 text-[var(--ink-muted)]">
            {streakMessage(tone, streak, canRepair)}
          </div>
          {canRepair && (
            <button
              type="button"
              aria-label="Repair streak"
              onClick={onRepair}
              className="touch-target self-start rounded-[var(--radius-md)] border border-[var(--accent)] px-3 text-2 text-[var(--accent)]"
            >
              Repair streak
            </button>
          )}
          <button
            type="button"
            aria-label={cta}
            onClick={onStart}
            className="touch-target rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-2 text-[var(--mat-void)]"
          >
            {cta}
          </button>
        </div>
      </div>

      <MonthCalendar grid={grid} label={monthLabel} />
    </div>
  );
}
