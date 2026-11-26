/**
 * A finished puzzle's card, reopened from its `completions` row — the wall's
 * tile tap, and Today's "See your card" (modernize §4). Re-composed from the
 * stored thumbnail and denormalised meta: the store keeps a small row, not a
 * full-size PNG, so the card is rebuilt on demand.
 *
 * Reopened, not just finished: no again-harder, no new puzzle — every action
 * closes back to where it was opened. Share and Save operate on the rebuilt PNG.
 */

import { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CompletionRecord } from '@/persist/completions';
import { curatedPhotoById } from '@/play/curated';
import { composeCard } from '@/render/card';
import type { CardMeta } from '@/play/card';
import { AccentContext, accentScope } from './accent-scope';
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
  // The portal leaves Shell's subtree; carry its accent across.
  const accent = useContext(AccentContext);
  // Read through a ref: openers pass an inline arrow, and a dependency on it
  // would recompose the card on every parent render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    setCardBlob(null);
    let cancelled = false;
    void (async () => {
      const bitmap = await createImageBitmap(entry.thumbnailBlob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
      bitmap.close();
      await document.fonts.ready;
      return composeCard(canvas, cardMetaOf(entry));
    })().then(
      (blob) => {
        if (!cancelled) setCardBlob(blob);
      },
      () => {
        // A thumbnail that will not decode has no card to show. Closing hands
        // the tap back, so the opener's button is never left dead.
        if (!cancelled) closeRef.current();
      },
    );
    return () => {
      cancelled = true;
    };
  }, [entry]);

  if (!cardBlob) return null;
  // Portalled to `body`, fixed over the whole window: the tab bar is hidden on
  // the card (v2 §3), and no animating ancestor's transform can re-anchor it.
  return createPortal(
    <div className="fixed inset-0 z-50 bg-[var(--mat-void)]" {...accentScope(accent)}>
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
