/**
 * The guided twelve's overlay (§16, step 7).
 *
 * Copy and the skip control only — the board underneath is the ordinary
 * `PlayRuntime`, and this component owns no game logic at all. `first-run.ts`
 * decides *when* a beat changes; this only renders what that beat says.
 *
 * Never a backdrop, never a dialog role: the board keeps taking drags
 * underneath it. Skip and the Comfort toggle are the only interactive
 * elements, so they alone carry `pointer-events-auto` against an otherwise
 * pass-through overlay.
 */

import type { FirstRunBeat } from '@/play/first-run';

export interface FirstRunOverlayProps {
  beat: FirstRunBeat;
  onSkip: () => void;
  /** §C Track 4: "offer Comfort mode by name" — a quiet aside, not part of the beat copy. */
  comfort: boolean;
  onToggleComfort: () => void;
}

/** §16's copy, verbatim. Beats with no line here render nothing. */
const COPY: Partial<Record<FirstRunBeat, string>> = {
  'cold-open': 'Drag a piece where you think it goes.',
  'tray-reveal': 'Pieces live here. Filter them.',
};

export function FirstRunOverlay({
  beat,
  onSkip,
  comfort,
  onToggleComfort,
}: FirstRunOverlayProps): React.ReactElement {
  const copy = COPY[beat];

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {copy && (
        <div
          className="flex justify-center px-5"
          style={{ paddingTop: 'calc(max(12px, env(safe-area-inset-top)) + 72px)' }}
        >
          <div className="rounded-[var(--radius-md)] bg-[color-mix(in_srgb,var(--mat-raised)_82%,transparent)] px-4 py-2 text-2 text-[var(--ink-primary)] backdrop-blur-[12px]">
            {copy}
          </div>
        </div>
      )}
      <button
        type="button"
        aria-label="Skip"
        onClick={onSkip}
        className="touch-target pointer-events-auto absolute right-[16px] rounded-[14px] border border-[var(--edge-hair)] bg-[color-mix(in_srgb,var(--mat-raised)_82%,transparent)] px-[16px] text-2 text-[var(--ink-primary)] backdrop-blur-[12px]"
        style={{ top: 'calc(max(12px, env(safe-area-inset-top)) + 64px)' }}
      >
        Skip
      </button>
      {/* The report's answer to letting the target user opt in without
          self-labelling: named plainly, offered quietly, bottom-left so it
          never competes with the beat copy or the hint button opposite it. */}
      <button
        type="button"
        aria-label="Comfort mode"
        aria-pressed={comfort}
        onClick={onToggleComfort}
        className={`touch-target pointer-events-auto absolute left-[16px] rounded-[14px] border px-[16px] text-2 backdrop-blur-[12px] ${
          comfort
            ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--mat-raised)_82%,transparent)] text-[var(--accent)]'
            : 'border-[var(--edge-hair)] bg-[color-mix(in_srgb,var(--mat-raised)_82%,transparent)] text-[var(--ink-muted)]'
        }`}
        style={{ bottom: 'max(16px, env(safe-area-inset-bottom))' }}
      >
        {comfort ? 'Comfort mode: On' : 'Comfort mode'}
      </button>
    </div>
  );
}
