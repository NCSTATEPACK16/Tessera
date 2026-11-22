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
import type { Point, Rect, Size } from '@/core/geom';
import { FIRST_RUN_PIECE_EXTENT, PULL_OUT_SPACING, firstRunScatter, gridLayout } from '@/play/layout';
import { MIN_ZOOM, fitCameraToBounds, fitScale } from '@/render/camera';
import { rngFor } from '@/core/rng';

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

  it('shifts the block clear of `avoid` when `safe` has slack', () => {
    // `avoid` fills all of `safe` except a strip on the right — the only
    // valid nudge is a rightward shift; up/left/down all run out of room.
    const avoid: Rect = { x: 0, y: 0, w: 38, h: 30 };
    const origins = gridLayout(1, 2, 2, safe, avoid);

    // Naive centring would land at (19, 14); the only room to clear `avoid`
    // is to the right, up to the safe rect's own edge.
    expect(origins[0]).toEqual({ x: 38, y: 14 });
  });

  it('falls back to the naive centred placement when there is no slack to clear it', () => {
    const avoid: Rect = { x: 0, y: 0, w: 40, h: 30 }; // fills `safe` entirely
    const origins = gridLayout(1, 2, 2, safe, avoid);

    expect(origins[0]).toEqual({ x: 19, y: 14 });
  });

  it("passing `avoid: null` reproduces today's behaviour exactly", () => {
    const withNull = gridLayout(4, 1, 1, safe, null);
    const withoutArg = gridLayout(4, 1, 1, safe);

    expect(withNull).toEqual(withoutArg);
  });

  it('does not nudge when the naive placement does not overlap `avoid`', () => {
    const avoid: Rect = { x: 100, y: 100, w: 5, h: 5 }; // nowhere near `safe`
    const nudged = gridLayout(4, 1, 1, safe, avoid);
    const plain = gridLayout(4, 1, 1, safe, null);

    expect(nudged).toEqual(plain);
  });
});

describe('firstRunScatter', () => {
  // The guided twelve's loose band (modernize spec §7). Left-anchored and
  // sqrt(n)-wide, it outgrew a 402pt phone's zoom floor and pushed the board
  // frame off-screen. A fixed board-width wrap fixed the phone and broke a
  // desktop window instead (a 3-wide stack is too tall for 900px) — so the row
  // length is chosen for the viewport.
  const PHONE = { w: 402, h: 874 };
  const DESK = { w: 1280, h: 900 };
  const LAND = { w: 874, h: 402 };
  const BOARD = { w: 3, h: 4 };
  const scatter = (vp: Size, n = 12) =>
    firstRunScatter(n, BOARD.w, BOARD.h, vp, rngFor(7, 'firstRunScatter', 0));
  const perRowOf = (pts: Point[]) => pts.filter((p) => Math.abs(p.y - pts[0]!.y) < 0.5).length;
  const contentBounds = (pts: Point[]): Rect => {
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const left = Math.min(0, ...xs);
    const right = Math.max(BOARD.w, ...xs.map((x) => x + FIRST_RUN_PIECE_EXTENT));
    const bottom = Math.max(...ys) + FIRST_RUN_PIECE_EXTENT;
    return { x: left, y: 0, w: right - left, h: bottom };
  };

  it('places one origin per piece, all below the board', () => {
    const pts = scatter(PHONE);
    expect(pts).toHaveLength(12);
    for (const p of pts) expect(p.y).toBeGreaterThanOrEqual(4 + 0.8 - 0.15);
  });

  it('fits inside the zoom floor on a phone, a desktop window and a landscape phone', () => {
    for (const vp of [PHONE, DESK, LAND]) {
      const framed = fitCameraToBounds(vp, contentBounds(scatter(vp)));
      expect(framed.zoom, `${vp.w}x${vp.h}`).toBeGreaterThanOrEqual(
        fitScale(vp, BOARD.w, BOARD.h) * MIN_ZOOM,
      );
    }
  });

  it('stacks narrow on a portrait phone and spreads wide on a desktop', () => {
    expect(perRowOf(scatter(PHONE))).toBe(3);
    expect(perRowOf(scatter(DESK))).toBeGreaterThan(3);
  });

  it('centres every row under the board, the short last row too', () => {
    for (const vp of [PHONE, DESK]) {
      const pts = scatter(vp, 10);
      const rows = new Map<number, number[]>();
      for (const p of pts) {
        const key = Math.round((p.y - 4.8) / 1.35);
        rows.set(key, [...(rows.get(key) ?? []), p.x]);
      }
      for (const xs of rows.values()) {
        const mid = (Math.min(...xs) + Math.max(...xs) + 1) / 2;
        expect(Math.abs(mid - BOARD.w / 2), `${vp.w}x${vp.h}`).toBeLessThan(0.3);
      }
    }
  });

  it('is deterministic per seed and viewport', () => {
    expect(scatter(PHONE)).toEqual(scatter(PHONE));
  });
});
