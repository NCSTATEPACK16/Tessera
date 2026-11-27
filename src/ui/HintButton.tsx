/**
 * The hint button (§07/§12). Bottom-right, thumb-adjacent per the design
 * mockup — the same corner on both dock and phone. Modernize C4: a 52pt
 * lightbulb, its allowance a numeral badge that bumps once when spent.
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
import { Icon } from './kit';

export interface HintButtonProps {
  /** Whether a loose piece has been tapped to receive the hint. */
  hasTarget: boolean;
  /**
   * v2 spec §5.1: hints left, or `null` for unlimited (Zen), which shows no
   * number. At 0 the pill dims but stays live — tier 1 never costs anything.
   */
  count: number | null;
  onFire: (tier: HintTier) => boolean;
  /** v2 spec §5.3: the corner opposite a left dock, so it stays thumb-adjacent. */
  corner?: 'left' | 'right';
}

export function HintButton({
  hasTarget,
  count,
  onFire,
  corner = 'right',
}: HintButtonProps): React.ReactElement {
  const downAt = useRef<number | null>(null);

  return (
    <button
      type="button"
      aria-label={
        (count === null ? 'Hint' : `Hint, ${count} left`) +
        (hasTarget ? '' : ' — tap a loose piece first')
      }
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
        ...(corner === 'left'
          ? { left: 'max(16px, env(safe-area-inset-left))' }
          : { right: 'max(16px, env(safe-area-inset-right))' }),
        // `--sheet-clearance`: the height of whatever overlays the bottom of
        // the viewport right now — the phone sheet at its current height, 0
        // when docked. Without it the button sits under the sheet: invisible,
        // and unclickable because the sheet intercepts the pointer first. A
        // CSS variable written by `App.updateInsets`, never a prop: the sheet
        // moves every frame of a drag, and a prop would re-render the tray
        // with it.
        bottom: 'max(calc(var(--sheet-clearance, 0px) + 16px), env(safe-area-inset-bottom))',
      }}
      className={`pointer-events-auto z-10 flex h-[52px] w-[52px] items-center justify-center rounded-full border border-[var(--edge-hair)] bg-[color-mix(in_srgb,var(--mat-raised)_82%,transparent)] text-[var(--ink-primary)] backdrop-blur-[12px] disabled:opacity-40 ${count === 0 ? 'opacity-60' : ''}`}
    >
      <Icon.Lightbulb size={22} />
      {count !== null && (
        // C4: the count as a numeral badge. Keyed on the count, so a spend
        // remounts it and the bump plays once; nothing ever loops.
        <span
          key={count}
          data-hint-badge
          aria-hidden
          className="absolute -right-[2px] -top-[2px] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--accent)] px-[4px] font-data text-1 tabular-nums text-[var(--mat-void)]"
          style={{ animation: 'badge-bump var(--duration-base) var(--ease-standard)' }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
