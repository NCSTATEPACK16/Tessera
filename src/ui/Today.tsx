/**
 * Today — the first tab (v2 spec §3), and what a profile with history lands on.
 * Born as the 2026-08-22 Home screen; every prop is data `App.tsx` already
 * computes for `Library` and `DailyHub`, arranged — not a new read path.
 *
 * Top to bottom: the daily hero (into the hub), the most recent in-progress
 * puzzle, the one primary action, the streak, and the PWA banner inline at the
 * end — never fixed over a button. Collection and Puzzles are tabs now, so the
 * teasers and links that stood in for them are gone.
 */

import { useEffect, useState } from 'react';
import { StreakFlame } from './StreakFlame';
import type { StreakTone } from './StreakFlame';
import type { DayCell } from '@/daily/streak';
import type { LibraryEntry } from '@/persist/library';
import { ProgressRing } from './ProgressRing';
import { PwaBanner } from './PwaBanner';
import { Badge, Button, Icon } from './kit';

export interface TodayProps {
  dailyPreview: {
    title: string;
    photoUrl: string;
    pieceCount: number;
    resetsInMs: number;
    hintsIncluded: number;
  };
  /** True once today's daily is finished. */
  dailyDone: boolean;
  /** The most recently touched in-progress puzzle, or null for none. */
  continuing: LibraryEntry | null;
  streak: number;
  streakTone: StreakTone;
  weekPips: readonly DayCell[];
  onDaily: () => void;
  onContinue: (puzzleId: string) => void;
  onNewPuzzle: () => void;
  onSettings: () => void;
}

function formatResetsIn(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function ContinueCard({
  entry,
  onContinue,
}: {
  entry: LibraryEntry;
  onContinue: (puzzleId: string) => void;
}): React.ReactElement {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(entry.thumbnailBlob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [entry.thumbnailBlob]);

  const { placed, total } = entry.snapshot;
  return (
    <button
      type="button"
      aria-label="Continue your puzzle"
      onClick={() => onContinue(entry.puzzleId)}
      className="flex items-center gap-4 rounded-[var(--radius-md)] border border-[var(--edge-hair)] bg-[var(--mat-raised)] p-3 text-left transition-transform duration-[var(--duration-fast)] ease-[var(--ease-standard)] active:scale-[0.98]"
    >
      <div className="h-16 w-20 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--mat-void)]">
        {url && <img src={url} alt="" className="h-full w-full object-cover" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="eyebrow">Keep going</div>
        <div className="text-3 text-[var(--ink-primary)]">Continue your puzzle</div>
        <div className="font-data text-1 tabular-nums text-[var(--ink-muted)]">
          {placed} / {total} placed
        </div>
      </div>
      <ProgressRing completion={total === 0 ? 0 : placed / total} size={32} />
    </button>
  );
}

export function Today({
  dailyPreview,
  dailyDone,
  continuing,
  streak,
  streakTone,
  weekPips,
  onDaily,
  onContinue,
  onNewPuzzle,
  onSettings,
}: TodayProps): React.ReactElement {
  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-5 p-5 [animation:screen-in_var(--duration-slow)_var(--ease-standard)]">
      <div className="flex items-center justify-between gap-3">
        <h1 className="m-0 font-display text-5 font-normal text-[var(--ink-primary)]">
          Tessera
        </h1>
        <button
          type="button"
          aria-label="Settings"
          onClick={onSettings}
          className="touch-target flex items-center justify-center rounded-full text-[var(--ink-muted)]"
        >
          <Icon.Gear />
        </button>
      </div>

      <button
        type="button"
        aria-label={`Play today's puzzle: ${dailyPreview.title}`}
        onClick={onDaily}
        className="relative flex aspect-[4/3] w-full items-end overflow-hidden rounded-[var(--radius-lg)] border border-[var(--edge-hair)] bg-[var(--mat-void)] text-left transition-transform duration-[var(--duration-fast)] ease-[var(--ease-standard)] active:scale-[0.98] sm:aspect-[16/9]"
      >
        <img
          src={dailyPreview.photoUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* B7: a real scrim under real ink. The caption sat in `--mat-void` on a
            black gradient — 1.0:1, measured — and was unreadable on any photo. */}
        <div className="relative flex w-full flex-col gap-2 bg-gradient-to-t from-[rgb(0_0_0/0.85)] via-[rgb(0_0_0/0.55)] to-transparent p-5 pt-16">
          <div className="flex items-center gap-2">
            {/* `.eyebrow` is unlayered CSS and outranks a utility colour. */}
            <span className="eyebrow" style={{ color: 'var(--ink-secondary)' }}>
              Daily · {dailyPreview.pieceCount} pieces
            </span>
            {dailyDone && <Badge label="Done" tone="success" />}
          </div>
          <div className="font-display text-5 leading-tight text-[var(--ink-primary)]">
            {dailyPreview.title}
          </div>
          <div className="font-data text-1 tabular-nums text-[var(--ink-secondary)]">
            {dailyPreview.hintsIncluded} hints included · resets in{' '}
            {formatResetsIn(dailyPreview.resetsInMs)}
          </div>
        </div>
      </button>

      {continuing && <ContinueCard entry={continuing} onContinue={onContinue} />}

      <Button variant="primary" size="lg" aria-label="New puzzle" onClick={onNewPuzzle}>
        New puzzle
      </Button>

      <div className="rounded-[var(--radius-md)] border border-[var(--edge-hair)] bg-[var(--mat-raised)] p-4">
        {streakTone === 'none' ? (
          <div className="text-2 text-[var(--ink-secondary)]">Play the daily to start a streak.</div>
        ) : (
          <StreakFlame streak={streak} freezes={0} tone={streakTone} pips={weekPips} />
        )}
      </div>

      <PwaBanner />
    </div>
  );
}
