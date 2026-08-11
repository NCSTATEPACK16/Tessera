/**
 * The library (step 5c) — in-progress puzzle cards.
 *
 * A library with zero entries is never rendered; `App.tsx`'s entry flow goes
 * straight to the picker instead, so this component has no empty state to
 * build. A first-time player never sees an empty shelf apologising to them.
 *
 * The thumbnail is the *board*, not the source photo (`PLAN.md`'s explicit
 * requirement) — captured at save time, so a library read is a blob read: no
 * re-cutting, no re-rendering, no worker.
 */

import { useEffect, useState } from 'react';
import { ProgressRing } from './ProgressRing';
import { StreakFlame } from './StreakFlame';
import type { StreakTone } from './StreakFlame';
import type { LibraryEntry } from '@/persist/library';

export interface LibraryProps {
  entries: readonly LibraryEntry[];
  onOpen: (puzzleId: string) => void;
  onNewPuzzle: () => void;
  /** Step 6: the hub is a peer screen, reached from here. */
  onDaily?: () => void;
  /** Step 8: the collection wall of finished puzzles (§15). */
  onCollection?: () => void;
  streak?: number;
  streakTone?: StreakTone;
}

function relativeTime(updatedAt: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function LibraryCard({
  entry,
  onOpen,
}: {
  entry: LibraryEntry;
  onOpen: (puzzleId: string) => void;
}): React.ReactElement {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(entry.thumbnailBlob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [entry.thumbnailBlob]);

  // The real computed number, never the target (§04) — the same convention
  // `TopBar` already holds to.
  const { cols, rows, mode, placed, total } = entry.snapshot;

  return (
    <button
      type="button"
      aria-label={`Open puzzle: ${cols} × ${rows}`}
      onClick={() => onOpen(entry.puzzleId)}
      className="flex min-h-[44px] flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--edge-hair)] bg-[var(--mat-raised)] text-left"
    >
      <div className="relative aspect-[4/3] w-full bg-[var(--mat-void)]">
        {url && <img src={url} alt="" className="h-full w-full object-cover" />}
        <div className="absolute right-2 top-2">
          <ProgressRing completion={total === 0 ? 0 : placed / total} size={32} />
        </div>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <div className="text-[14px] text-[var(--ink-primary)]">
          {cols} × {rows} · {mode === 'zen' ? 'Zen' : 'Classic'}
        </div>
        <div className="font-[var(--font-data)] text-[11px] tabular-nums text-[var(--ink-muted)]">
          {placed} / {total} · {relativeTime(entry.updatedAt)}
        </div>
      </div>
    </button>
  );
}

export function Library({
  entries,
  onOpen,
  onNewPuzzle,
  onDaily,
  onCollection,
  streak = 0,
  streakTone = 'none',
}: LibraryProps): React.ReactElement {
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="font-[var(--font-display)] text-[28px] text-[var(--ink-primary)]">
          Your Puzzles
        </div>
        <div className="flex gap-2">
          {onCollection && (
            <button
              type="button"
              aria-label="Collection"
              onClick={onCollection}
              className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--edge-hair)] px-3 text-[13px] text-[var(--ink-primary)]"
            >
              Collection
            </button>
          )}
          {onDaily && (
            <button
              type="button"
              aria-label="Daily"
              onClick={onDaily}
              className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--edge-hair)] px-3 text-[13px] text-[var(--ink-primary)]"
            >
              <StreakFlame streak={streak} freezes={0} tone={streakTone} compact />
            </button>
          )}
          <button
            type="button"
            aria-label="New puzzle"
            onClick={onNewPuzzle}
            className="min-h-[44px] rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-[14px] text-[var(--mat-void)]"
          >
            New Puzzle
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {entries.map((entry) => (
          <LibraryCard key={entry.puzzleId} entry={entry} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
