/**
 * Hint tiers and economy (§07).
 *
 * Three tiers, escalating on how long the hint button is held — a judgment
 * call, not something the design doc specifies. The doc confirms a tap fires
 * Tier 1 and a hold fires Tier 2 (the iPad mockup's "hint hold for tier 2"),
 * but never says what escalates to Tier 3. This treats it as one gesture
 * continuum — tap / hold / hold-longer — rather than inventing an unrelated
 * one. Revisit the two threshold constants below on real hardware; they are
 * chosen, not measured.
 *
 * Pure and DOM-free, like every other decision-bearing module in this
 * codebase — `Renderer` and the hint button are the only things that draw or
 * dispatch any of this.
 */

export type HintTier = 1 | 2 | 3;

export const HINT_HOLD_TIER2_MS = 450;
export const HINT_HOLD_TIER3_MS = 1200;

/** Tier reached for a hold released after `holdMs`, or still held at `holdMs`. */
export function tierForHoldMs(holdMs: number): HintTier {
  if (holdMs >= HINT_HOLD_TIER3_MS) return 3;
  if (holdMs >= HINT_HOLD_TIER2_MS) return 2;
  return 1;
}

/** Tier 1 is free and unlimited — "the default button behaviour" (§07). */
export function tierCost(tier: HintTier): number {
  if (tier === 2) return 1;
  if (tier === 3) return 2;
  return 0;
}

export type PuzzleMode = 'classic' | 'daily' | 'zen';

const HINT_BASE = 3;
const HINT_REFILL_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Total hints earned so far this puzzle. `Infinity` in Zen, where "every tier
 * is free and the counter is simply absent — not greyed out" (§07): the
 * absence is the message, so a caller must check `mode` before rendering a
 * counter at all rather than rendering `Infinity`.
 */
export function hintsAvailable(elapsedMs: number, mode: PuzzleMode): number {
  if (mode === 'zen') return Infinity;
  return HINT_BASE + Math.floor(Math.max(0, elapsedMs) / HINT_REFILL_INTERVAL_MS);
}

/** Whether `tier` can be fired without going over what's been earned. */
export function canAffordTier(
  tier: HintTier,
  hintsUsed: number,
  elapsedMs: number,
  mode: PuzzleMode,
): boolean {
  if (mode === 'zen' || tier === 1) return true;
  return hintsUsed + tierCost(tier) <= hintsAvailable(elapsedMs, mode);
}

/** hintsUsed after spending on `tier`. Zen and Tier 1 never spend. */
export function spendTier(tier: HintTier, hintsUsed: number, mode: PuzzleMode): number {
  if (mode === 'zen') return hintsUsed;
  return hintsUsed + tierCost(tier);
}

/** §07/§15: a completion is "clean" only with zero hints used. */
export function isCleanRun(hintsUsed: number): boolean {
  return hintsUsed === 0;
}
