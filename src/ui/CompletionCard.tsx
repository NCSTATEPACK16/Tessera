/**
 * The Puzzle Card (§11 wireframe 05) — the completion payoff, replacing step
 * 5c's placeholder banner. The composed PNG carries the title, time, count,
 * clean-run badge and attribution; this screen shows it and offers the four
 * actions beneath it.
 *
 * No exclamation marks, no confetti — the lit photo is the reward (§15).
 */

import { useEffect, useState } from 'react';
import type { CardMeta } from '@/play/card';

export interface CompletionCardProps {
  meta: CardMeta;
  /** The composed card PNG. Shown here, shared, and saved. */
  cardBlob: Blob;
  canGoHarder: boolean;
  /** The next rung up (§15: named, in the moment of confidence). */
  nextCount: number | null;
  onAgainHarder: () => void;
  onDone: () => void;
  onNewPuzzle: () => void;
  /**
   * Present only when the puzzle just finished was a daily (design doc screen
   * 10, "Daily variant with streak increment").
   */
  daily?: { streak: number; freezeEarned: boolean };
  /**
   * §16: the guided twelve ends here too, but offers what comes *next*
   * rather than "again, harder" or "new puzzle" — there is no harder rung on
   * a fixed 12-piece tutorial, and "new puzzle" undersells the two real
   * choices. Present only for that one completion.
   */
  firstRun?: { onOwnPhoto: () => void; onDaily: () => void };
}

export function CompletionCard({
  cardBlob,
  canGoHarder,
  nextCount,
  onAgainHarder,
  onDone,
  onNewPuzzle,
  daily,
  firstRun,
}: CompletionCardProps): React.ReactElement {
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  // A leaked blob URL pins the whole PNG in memory for the session, so it is
  // revoked the moment this card leaves the screen.
  useEffect(() => {
    const url = URL.createObjectURL(cardBlob);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [cardBlob]);

  const download = (): void => {
    const url = URL.createObjectURL(cardBlob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'tessera.png';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  // Feature-detected: the download is the desktop path, not an error path.
  const share = async (): Promise<void> => {
    const file = new File([cardBlob], 'tessera.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch {
        // A dismissed share sheet is not an error and must not fall through to
        // a surprise download.
        return;
      }
    }
    download();
  };

  const secondary =
    'touch-target rounded-[var(--radius-md)] border border-[var(--edge-hair)] px-3 text-2 text-[var(--ink-primary)]';

  return (
    <div className="pointer-events-auto absolute inset-0 z-10 flex flex-col items-center justify-center gap-[16px] overflow-y-auto bg-[color-mix(in_srgb,var(--mat-void)_86%,transparent)] p-[24px] backdrop-blur-[12px]">
      {daily && (
        <div className="flex flex-col items-center">
          <div className="text-2 text-[var(--ink-primary)]">
            {`Daily done · ${daily.streak} day streak`}
          </div>
          {daily.freezeEarned && (
            <div className="font-[var(--font-data)] text-1 text-[var(--ink-muted)]">
              Freeze earned — one missed day is covered.
            </div>
          )}
        </div>
      )}

      {imgUrl && (
        <img
          src={imgUrl}
          alt="Puzzle card"
          className="max-h-[60vh] w-auto max-w-full rounded-[14px] border border-[var(--edge-hair)]"
        />
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {/* §16: no harder rung on a fixed 12-piece tutorial, and "new puzzle"
            undersells the two real next steps — replaced entirely, not added
            alongside. */}
        {!firstRun && canGoHarder && nextCount !== null && (
          <button
            type="button"
            aria-label={`Again, at ${nextCount} pieces`}
            onClick={onAgainHarder}
            className="touch-target rounded-[var(--radius-md)] border border-[var(--accent)] px-3 text-2 text-[var(--accent)]"
          >
            {`Again, at ${nextCount} pieces`}
          </button>
        )}
        <button type="button" aria-label="Share" onClick={() => void share()} className={secondary}>
          Share
        </button>
        <button type="button" aria-label="Save" onClick={download} className={secondary}>
          Save
        </button>
        {firstRun ? (
          <button
            type="button"
            aria-label="Today's puzzle"
            onClick={firstRun.onDaily}
            className={secondary}
          >
            Today&rsquo;s puzzle
          </button>
        ) : (
          <button type="button" aria-label="New puzzle" onClick={onNewPuzzle} className={secondary}>
            New puzzle
          </button>
        )}
        <button
          type="button"
          aria-label={firstRun ? 'Now use your own photo' : 'Done'}
          onClick={firstRun ? firstRun.onOwnPhoto : onDone}
          className="touch-target rounded-[var(--radius-md)] bg-[var(--accent)] px-3 text-2 text-[var(--mat-void)]"
        >
          {firstRun ? 'Now use your own photo' : 'Done'}
        </button>
      </div>
    </div>
  );
}
