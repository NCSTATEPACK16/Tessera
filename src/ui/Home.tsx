/**
 * The landing screen for a profile with history — sits in front of `Library`,
 * per `docs/superpowers/specs/2026-08-22-home-screen-design.md`. Every prop
 * here is data `App.tsx` already computes for `Library`'s/`DailyHub`'s own
 * props; this is a new arrangement of existing state, not a new read path.
 */

import { useEffect, useState } from 'react';
import { StreakFlame } from './StreakFlame';
import type { StreakTone } from './StreakFlame';
import type { DayCell } from '@/daily/streak';
import type { CompletionRecord } from '@/persist/completions';
import type { LibraryEntry } from '@/persist/library';

export interface HomeProps {
  dailyPreview: {
    title: string;
    photoUrl: string;
    pieceCount: number;
    resetsInMs: number;
    hintsIncluded: number;
  };
  /** Set only when exactly one puzzle is in progress (Decision 5). */
  continuing: LibraryEntry | null;
  /** For "Your Puzzles (N)"; 0 hides the link entirely. */
  libraryCount: number;
  streak: number;
  streakTone: StreakTone;
  weekPips: readonly DayCell[];
  /** Last 3, for the teaser tiles. Empty array is the empty-state case. */
  completions: readonly CompletionRecord[];
  onDaily: () => void;
  onContinue: (puzzleId: string) => void;
  onLibrary: () => void;
  onBrowsePhotos: () => void;
  onUploadYours: () => void;
  onCollection: () => void;
}

function formatResetsIn(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function CompletionTile({ entry }: { entry: CompletionRecord }): React.ReactElement {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(entry.thumbnailBlob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [entry.thumbnailBlob]);
  return (
    <div className="aspect-square overflow-hidden rounded-[var(--radius-sm)] bg-[var(--mat-void)]">
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
    </div>
  );
}

export function Home({
  dailyPreview,
  continuing,
  libraryCount,
  streak,
  streakTone,
  weekPips,
  completions,
  onDaily,
  onContinue,
  onLibrary,
  onBrowsePhotos,
  onUploadYours,
  onCollection,
}: HomeProps): React.ReactElement {
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <div className="font-[var(--font-display)] text-5 text-[var(--ink-primary)]">Tessera</div>

      <button
        type="button"
        aria-label={`Play today's puzzle: ${dailyPreview.title}`}
        onClick={onDaily}
        className="relative flex aspect-[16/9] w-full items-end overflow-hidden rounded-[var(--radius-md)] border border-[var(--edge-hair)] bg-[var(--mat-void)] text-left"
      >
        <img
          src={dailyPreview.photoUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="relative flex w-full flex-col gap-1 bg-gradient-to-t from-black/60 to-transparent p-4 text-[var(--mat-void)]">
          <div className="text-2">{dailyPreview.title}</div>
          <div className="font-[var(--font-data)] text-1 tabular-nums opacity-80">
            {dailyPreview.pieceCount} pieces · {dailyPreview.hintsIncluded} hints included ·
            resets in {formatResetsIn(dailyPreview.resetsInMs)}
          </div>
        </div>
      </button>

      {continuing && (
        <button
          type="button"
          aria-label="Continue your puzzle"
          onClick={() => onContinue(continuing.puzzleId)}
          className="touch-target flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--edge-hair)] px-4 text-2 text-[var(--ink-primary)]"
        >
          <span>Continue your puzzle</span>
          <span className="font-[var(--font-data)] tabular-nums text-[var(--ink-muted)]">
            {continuing.snapshot.placed} / {continuing.snapshot.total}
          </span>
        </button>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          aria-label="Browse Photos"
          onClick={onBrowsePhotos}
          className="touch-target flex-1 rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-2 text-[var(--mat-void)]"
        >
          Browse Photos
        </button>
        <button
          type="button"
          aria-label="Upload Yours"
          onClick={onUploadYours}
          className="touch-target flex-1 rounded-[var(--radius-md)] border border-[var(--edge-hair)] px-4 text-2 text-[var(--ink-primary)]"
        >
          Upload Yours
        </button>
      </div>

      {libraryCount > 0 && (
        <button
          type="button"
          aria-label={`Your Puzzles (${libraryCount})`}
          onClick={onLibrary}
          className="touch-target self-start text-2 text-[var(--accent)]"
        >
          Your Puzzles ({libraryCount})
        </button>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="min-w-[200px] flex-1 rounded-[var(--radius-md)] border border-[var(--edge-hair)] p-3">
          {streakTone === 'none' ? (
            <div className="text-2 text-[var(--ink-muted)]">Play the daily to start a streak.</div>
          ) : (
            <StreakFlame streak={streak} freezes={0} tone={streakTone} pips={weekPips} />
          )}
        </div>

        <button
          type="button"
          aria-label="Collection"
          onClick={onCollection}
          className="min-w-[200px] flex-1 rounded-[var(--radius-md)] border border-[var(--edge-hair)] p-3 text-left"
        >
          {completions.length === 0 ? (
            <div className="text-2 text-[var(--ink-muted)]">
              Your collection starts here. Finish a puzzle to light the first tile.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-3 gap-2">
                {completions.slice(0, 3).map((entry) => (
                  <CompletionTile key={entry.completedAt} entry={entry} />
                ))}
              </div>
              <div className="text-1 text-[var(--ink-muted)]">{completions.length} completed</div>
            </div>
          )}
        </button>
      </div>
    </div>
  );
}
