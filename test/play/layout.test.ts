/**
 * Where pulled-out pieces land (§06: "auto-arranged in a loose grid so they are
 * immediately workable").
 *
 * The rect passed in is the **safe** rect — the viewport minus the dock or the
 * sheet — never the viewport. On a phone the centre of the board canvas is
 * underneath the sheet, so centring on the viewport would deal every pulled-out
 * piece behind the tray. `BoardPage.matPoint()` exists for exactly this reason.
 */

import { describe, expect, it } from 'vitest';
import type { Rect } from '@/core/geom';
import { PULL_OUT_SPACING, gridLayout } from '@/play/layout';

const safe: Rect = { x: 0, y: 0, w: 40, h: 30 };

describe('gridLayout', () => {
  it('lays n pieces out and returns n origins', () => {
    expect(gridLayout(9, 1, 1, safe)).toHaveLength(9);
    expect(gridLayout(0, 1, 1, safe)).toEqual([]);
  });

  it('never overlaps two pieces', () => {
    const origins = gridLayout(12, 1, 1, safe);

    for (let a = 0; a < origins.length; a++) {
      for (let b = a + 1; b < origins.length; b++) {
        const apart =
          Math.abs(origins[a]!.x - origins[b]!.x) >= 1 ||
          Math.abs(origins[a]!.y - origins[b]!.y) >= 1;
        expect(apart, `pieces ${a} and ${b} overlap`).toBe(true);
      }
    }
  });

  it('centres the block on the safe rect, not on the origin', () => {
    const origins = gridLayout(4, 1, 1, safe);
    const midX = origins.reduce((sum, p) => sum + p.x + 0.5, 0) / origins.length;
    const midY = origins.reduce((sum, p) => sum + p.y + 0.5, 0) / origins.length;

    expect(midX).toBeCloseTo(safe.x + safe.w / 2, 5);
    expect(midY).toBeCloseTo(safe.y + safe.h / 2, 5);
  });

  it('uses loose spacing when the block fits', () => {
    const origins = gridLayout(4, 1, 1, safe);
    const stride = Math.abs(origins[1]!.x - origins[0]!.x);

    expect(stride).toBeCloseTo(PULL_OUT_SPACING.loose, 5);
  });

  it('tightens before it overflows, and never past the tight bound', () => {
    // 25 pieces at loose spacing need 5 x 1.15 = 5.75 units; the rect is 5.
    const cramped: Rect = { x: 0, y: 0, w: 5, h: 5 };
    const origins = gridLayout(25, 1, 1, cramped);
    const stride = Math.abs(origins[1]!.x - origins[0]!.x);

    expect(stride).toBeLessThan(PULL_OUT_SPACING.loose);
    expect(stride).toBeGreaterThanOrEqual(PULL_OUT_SPACING.tight);
  });

  it('overflows rather than stacking, when even tight will not fit', () => {
    const tiny: Rect = { x: 0, y: 0, w: 2, h: 2 };
    const origins = gridLayout(25, 1, 1, tiny);
    const stride = Math.abs(origins[1]!.x - origins[0]!.x);

    // Pieces must still not overlap. A grid that does not fit is a grid the
    // player pans to, never a pile they cannot separate.
    expect(stride).toBeGreaterThanOrEqual(PULL_OUT_SPACING.tight);
  });
});
