/**
 * The collection wall (§15) — "a growing mosaic of everything you have
 * finished is a possession, and people do not abandon possessions." The
 * strongest retention lever in the product, and the reason step 8 stopped
 * erasing finished puzzles.
 *
 * A CSS-grid mosaic of `thumbnailBlob` tiles, newest first (the store already
 * sorts). Tapping a tile re-shows its card, re-composed from the stored
 * thumbnail and denormalised meta — the completions store keeps a small row,
 * not a full-size PNG, so the card is rebuilt on demand.
 *
 * Empty state is an invitation, not an apology (§10, design doc screen 02):
 * one line pointing at the next puzzle. Never a printed zero.
 */

import { useEffect, useMemo, useState } from 'react';
import type { CompletionRecord } from '@/persist/completions';
import { curatedPhotoById } from '@/play/curated';
import { composeCard } from '@/render/card';
import type { CardMeta } from '@/play/card';
import { CompletionCard } from './CompletionCard';

export interface CollectionWallProps {
  entries: readonly CompletionRecord[];
  onBack: () => void;
}

function metaOf(entry: CompletionRecord): CardMeta {
  return {
    title: (entry.photoId ? curatedPhotoById(entry.photoId)?.name : undefined) ?? 'Your photo',
    elapsedMs: entry.elapsedMs,
    pieceCount: entry.pieceCount,
    mode: entry.mode,
    cleanRun: entry.cleanRun,
    attribution: entry.attribution,
  };
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
        <span className="absolute bottom-1 left-1 rounded-[6px] bg-[color-mix(in_srgb,var(--mat-void)_70%,transparent)] px-1.5 py-0.5 font-[var(--font-data)] text-1 text-[var(--ink-primary)]">
          ✓ clean
        </span>
      )}
    </button>
  );
}

export function CollectionWall({ entries, onBack }: CollectionWallProps): React.ReactElement {
  const [selected, setSelected] = useState<CompletionRecord | null>(null);
  const [cardBlob, setCardBlob] = useState<Blob | null>(null);

  const selectedMeta = useMemo(() => (selected ? metaOf(selected) : null), [selected]);

  // Re-compose the card from the stored thumbnail when a tile opens.
  useEffect(() => {
    if (!selected) {
      setCardBlob(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const bitmap = await createImageBitmap(selected.thumbnailBlob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
      bitmap.close();
      await document.fonts.ready;
      const blob = await composeCard(canvas, metaOf(selected));
      if (!cancelled) setCardBlob(blob);
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  if (selected && cardBlob && selectedMeta) {
    // Reopened from the wall: no again-harder, no new-puzzle — both actions
    // just close back to the mosaic. Share and Save operate on the rebuilt PNG.
    return (
      <div className="relative h-full w-full bg-[var(--mat-void)]">
        <CompletionCard
          meta={selectedMeta}
          cardBlob={cardBlob}
          canGoHarder={false}
          nextCount={null}
          onAgainHarder={() => setSelected(null)}
          onDone={() => setSelected(null)}
          onNewPuzzle={() => setSelected(null)}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="font-[var(--font-display)] text-5 text-[var(--ink-primary)]">
          Collection
        </div>
        <button
          type="button"
          aria-label="Back"
          onClick={onBack}
          className="touch-target rounded-[var(--radius-md)] border border-[var(--edge-hair)] px-3 text-2 text-[var(--ink-primary)]"
        >
          Back
        </button>
      </div>

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
    </div>
  );
}
