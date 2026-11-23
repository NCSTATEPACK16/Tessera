/**
 * A finished puzzle's card, reopened from its `completions` row — the wall's
 * tile tap, and Today's "See your card" (modernize §4). Re-composed from the
 * stored thumbnail and denormalised meta: the store keeps a small row, not a
 * full-size PNG, so the card is rebuilt on demand.
 *
 * Reopened, not just finished: no again-harder, no new puzzle — every action
 * closes back to where it was opened. Share and Save operate on the rebuilt PNG.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CompletionRecord } from '@/persist/completions';
import { curatedPhotoById } from '@/play/curated';
import { composeCard } from '@/render/card';
import type { CardMeta } from '@/play/card';
import { CompletionCard } from './CompletionCard';

export function cardMetaOf(entry: CompletionRecord): CardMeta {
  return {
    title: (entry.photoId ? curatedPhotoById(entry.photoId)?.name : undefined) ?? 'Your photo',
    elapsedMs: entry.elapsedMs,
    pieceCount: entry.pieceCount,
    mode: entry.mode,
    cleanRun: entry.cleanRun,
    attribution: entry.attribution,
  };
}

export function ReopenedCard({
  entry,
  onClose,
}: {
  entry: CompletionRecord;
  onClose: () => void;
}): React.ReactElement | null {
  const [cardBlob, setCardBlob] = useState<Blob | null>(null);

  useEffect(() => {
    setCardBlob(null);
    let cancelled = false;
    void (async () => {
      const bitmap = await createImageBitmap(entry.thumbnailBlob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
      bitmap.close();
      await document.fonts.ready;
      const blob = await composeCard(canvas, cardMetaOf(entry));
      if (!cancelled) setCardBlob(blob);
    })();
    return () => {
      cancelled = true;
    };
  }, [entry]);

  if (!cardBlob) return null;
  // Portalled to `body`, fixed over the whole window: the tab bar is hidden on
  // the card (v2 §3), and no animating ancestor's transform can re-anchor it.
  return createPortal(
    <div className="fixed inset-0 z-50 bg-[var(--mat-void)]">
      <CompletionCard
        meta={cardMetaOf(entry)}
        cardBlob={cardBlob}
        canGoHarder={false}
        nextCount={null}
        onAgainHarder={onClose}
        onDone={onClose}
        onNewPuzzle={onClose}
      />
    </div>,
    document.body,
  );
}
