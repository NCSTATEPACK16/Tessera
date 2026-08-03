/**
 * The completion banner (step 5c) — deliberately minimal. No bloom sequence,
 * no card, no share: those are Step 8's Puzzle Card. This only needs
 * completion to be reachable and actionable — "play again, harder" and
 * "done" — replacing the TopBar's progress readout for the moment.
 */

export interface CompletionBannerProps {
  canGoHarder: boolean;
  onAgainHarder: () => void;
  onDone: () => void;
}

export function CompletionBanner({
  canGoHarder,
  onAgainHarder,
  onDone,
}: CompletionBannerProps): React.ReactElement {
  return (
    <div
      className="pointer-events-auto absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-[12px] rounded-[14px] border border-[var(--edge-hair)] bg-[color-mix(in_srgb,var(--mat-raised)_92%,transparent)] p-[12px] backdrop-blur-[12px]"
      style={{ margin: 12, marginTop: 'max(12px, env(safe-area-inset-top))' }}
    >
      <div className="text-[14px] text-[var(--ink-primary)]">Puzzle complete</div>
      <div className="flex gap-2">
        {canGoHarder && (
          <button
            type="button"
            aria-label="Play again, harder"
            onClick={onAgainHarder}
            className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--accent)] px-3 text-[13px] text-[var(--accent)]"
          >
            Again, harder
          </button>
        )}
        <button
          type="button"
          aria-label="Done"
          onClick={onDone}
          className="min-h-[44px] rounded-[var(--radius-md)] bg-[var(--accent)] px-3 text-[13px] text-[var(--mat-void)]"
        >
          Done
        </button>
      </div>
    </div>
  );
}
