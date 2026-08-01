/**
 * The hint button (§07/§12). Bottom-right, thumb-adjacent per the design
 * mockup — the same corner on both dock and phone.
 *
 * Tap fires Tier 1 (free, unlimited — "the default button behaviour").
 * Holding past a threshold escalates to Tier 2, and further to Tier 3 — the
 * design doc confirms tap/hold for tiers 1/2 but never specifies what
 * escalates to Tier 3. This is that gesture, documented as a judgment call in
 * `src/play/hints.ts`, not something read out of the spec.
 *
 * No press-position tracking here, unlike `TrayDrag`/`PointerMachine`: this is
 * a button, not a piece, so there is no drag-vs-tap arbitration to run —
 * only a hold-duration read at release.
 */

import { useRef } from 'react';
import type { HintTier } from '@/play/hints';
import { tierForHoldMs } from '@/play/hints';

export interface HintButtonProps {
  /** Whether a loose piece has been tapped to receive the hint. */
  hasTarget: boolean;
  onFire: (tier: HintTier) => boolean;
  /**
   * Height of whatever overlays the bottom of the viewport right now — the
   * iPhone sheet at its current detent, 0 when docked. Without this the
   * button sits bottom-anchored to the raw viewport and ends up underneath
   * the sheet: invisible, and unclickable because the sheet's own section
   * intercepts the pointer event first.
   */
  clearanceBottomPx?: number;
}

export function HintButton({
  hasTarget,
  onFire,
  clearanceBottomPx = 0,
}: HintButtonProps): React.ReactElement {
  const downAt = useRef<number | null>(null);

  return (
    <button
      type="button"
      aria-label={hasTarget ? 'Hint' : 'Hint — tap a loose piece first'}
      disabled={!hasTarget}
      // §07: "if the player places the piece mid-hint" is a model concern, not
      // this button's — `PlaySession.useHint` and the renderer's decay timers
      // own that, not a disabled state here.
      onPointerDown={() => {
        downAt.current = performance.now();
      }}
      onPointerUp={() => {
        const startedAt = downAt.current;
        downAt.current = null;
        if (startedAt === null) return;
        onFire(tierForHoldMs(performance.now() - startedAt));
      }}
      onPointerLeave={() => {
        // A drag off the button cancels rather than firing whatever tier the
        // hold happened to reach — the same "no accidental commit" posture
        // every other press-based gesture in this app takes.
        downAt.current = null;
      }}
      style={{
        position: 'absolute',
        right: 'max(16px, env(safe-area-inset-right))',
        bottom:
          clearanceBottomPx > 0
            ? clearanceBottomPx + 16
            : 'max(16px, env(safe-area-inset-bottom))',
      }}
      className="pointer-events-auto z-10 flex h-[44px] min-w-[44px] items-center justify-center rounded-full border border-[var(--edge-hair)] bg-[color-mix(in_srgb,var(--mat-raised)_82%,transparent)] px-[16px] text-[14px] text-[var(--ink-primary)] backdrop-blur-[12px] disabled:opacity-40"
    >
      Hint
    </button>
  );
}
