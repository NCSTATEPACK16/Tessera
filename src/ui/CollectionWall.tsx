/**
 * The collection wall (§15) — "a growing mosaic of everything you have
 * finished is a possession, and people do not abandon possessions." The
 * strongest retention lever in the product, and the reason step 8 stopped
 * erasing finished puzzles.
 *
 * A CSS-grid mosaic of `thumbnailBlob` tiles, newest first (the store already
 * sorts). Tapping a tile re-shows its card (`ReopenedCard`).
 *
 * Empty state is an invitation, not an apology (§10, design doc screen 02):
 * one line pointing at the next puzzle. Never a printed zero.
 */

import { useEffect, useState } from 'react';
import type { CompletionRecord } from '@/persist/completions';
import { ReopenedCard } from './ReopenedCard';

export interface CollectionWallProps {
  entries: readonly CompletionRecord[];
}

function WallTile({
  entry,
  onOpen,
}: {
  entry: CompletionRecord;
  onOpen: (entry: CompletionRecord) => void;
}): React.ReactElement {
  const [url, setUrl] = useState<string | null>(null);

  // With 30+ tiles a leaked object URL is real memory, on the device §17 says
  // to profile — revoked on unmount.
  useEffect(() => {
    const objectUrl = URL.createObjectURL(entry.thumbnailBlob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [entry.thumbnailBlob]);

  const date = new Date(entry.completedAt).toISOString().slice(0, 10);

  return (
    <button
      type="button"
      // The accessible name carries the facts the image cannot.
      aria-label={`Puzzle finished ${date}, ${entry.pieceCount} pieces`}
      onClick={() => onOpen(entry)}
      className="relative flex aspect-square touch-target items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--edge-hair)] bg-[var(--mat-void)]"
    >
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
      {entry.cleanRun && (
        // A clean run is a glyph *and* a word, never colour alone (§13).
        <span className="absolute bottom-1 left-1 rounded-[6px] bg-[color-mix(in_srgb,var(--mat-void)_70%,transparent)] px-1.5 py-0.5 meta text-[var(--ink-primary)]">
          ✓ clean
        </span>
      )}
    </button>
  );
}

export function CollectionWall({ entries }: CollectionWallProps): React.ReactElement {
  const [selected, setSelected] = useState<CompletionRecord | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-[60rem] flex-col gap-5 p-5 [animation:screen-in_var(--duration-slow)_var(--ease-standard)]">
      <h1 className="m-0 font-display text-5 font-normal text-[var(--ink-primary)]">
        Collection
      </h1>

      {entries.length === 0 ? (
        <div className="text-2 text-[var(--ink-muted)]">
          Your finished puzzles gather here. Complete one and it becomes the first.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {entries.map((entry) => (
            <WallTile key={entry.puzzleId} entry={entry} onOpen={setSelected} />
          ))}
        </div>
      )}
      {/* Over the mosaic, which stays put underneath while the card composes. */}
      {selected && <ReopenedCard entry={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
