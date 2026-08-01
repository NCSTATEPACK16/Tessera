/**
 * Hint tiers and economy (§07) — the numbers `PLAN.md` fixes, checked
 * directly. See `src/play/hints.ts` for the tier-3 gesture caveat.
 */

import { describe, expect, it } from 'vitest';
import {
  HINT_HOLD_TIER2_MS,
  HINT_HOLD_TIER3_MS,
  canAffordTier,
  hintsAvailable,
  isCleanRun,
  spendTier,
  tierCost,
  tierForHoldMs,
} from '@/play/hints';

describe('tierForHoldMs', () => {
  it('is tier 1 for a tap, well under the tier-2 threshold', () => {
    expect(tierForHoldMs(0)).toBe(1);
    expect(tierForHoldMs(HINT_HOLD_TIER2_MS - 1)).toBe(1);
  });

  it('is tier 2 once the hold crosses the tier-2 threshold', () => {
    expect(tierForHoldMs(HINT_HOLD_TIER2_MS)).toBe(2);
    expect(tierForHoldMs(HINT_HOLD_TIER3_MS - 1)).toBe(2);
  });

  it('is tier 3 once the hold crosses the tier-3 threshold', () => {
    expect(tierForHoldMs(HINT_HOLD_TIER3_MS)).toBe(3);
    expect(tierForHoldMs(HINT_HOLD_TIER3_MS + 10_000)).toBe(3);
  });
});

describe('tierCost', () => {
  it('tier 1 is free; tier 2 costs 1; tier 3 costs 2 — not 1+2', () => {
    expect(tierCost(1)).toBe(0);
    expect(tierCost(2)).toBe(1);
    expect(tierCost(3)).toBe(2);
  });
});

describe('hintsAvailable', () => {
  it('starts at 3 per puzzle in Classic', () => {
    expect(hintsAvailable(0, 'classic')).toBe(3);
  });

  it('adds one per 10 minutes elapsed', () => {
    expect(hintsAvailable(10 * 60 * 1000, 'classic')).toBe(4);
    expect(hintsAvailable(25 * 60 * 1000, 'classic')).toBe(5);
  });

  it('is infinite in Zen', () => {
    expect(hintsAvailable(0, 'zen')).toBe(Infinity);
  });
});

describe('canAffordTier', () => {
  it('tier 1 is always affordable, even at zero hints and in Classic', () => {
    expect(canAffordTier(1, 999, 0, 'classic')).toBe(true);
  });

  it('tier 2 and 3 are gated on what has been earned', () => {
    expect(canAffordTier(2, 3, 0, 'classic')).toBe(false);
    expect(canAffordTier(2, 2, 0, 'classic')).toBe(true);
    expect(canAffordTier(3, 2, 0, 'classic')).toBe(false);
    expect(canAffordTier(3, 1, 0, 'classic')).toBe(true);
  });

  it('every tier is free in Zen regardless of hintsUsed', () => {
    expect(canAffordTier(3, 1_000_000, 0, 'zen')).toBe(true);
  });
});

describe('spendTier', () => {
  it('tier 1 never spends', () => {
    expect(spendTier(1, 0, 'classic')).toBe(0);
  });

  it('tier 2 and 3 spend their cost', () => {
    expect(spendTier(2, 0, 'classic')).toBe(1);
    expect(spendTier(3, 1, 'classic')).toBe(3);
  });

  it('Zen never spends, at any tier', () => {
    expect(spendTier(3, 5, 'zen')).toBe(5);
  });
});

describe('isCleanRun', () => {
  it('is clean only at zero hints used', () => {
    expect(isCleanRun(0)).toBe(true);
    expect(isCleanRun(1)).toBe(false);
  });
});
