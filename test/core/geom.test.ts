/**
 * Geometry helpers.
 *
 * `reverseCubicPath` is the load-bearing one — interlock is exactly the claim
 * that a reversed edge coincides with its forward self, so it is tested here on
 * synthetic paths as well as on real edges in cut/interlock.test.ts.
 */

import { describe, expect, it } from 'vitest';
import type { CubicPath } from '@/core/geom';
import {
  cubicAt,
  joinPaths,
  pathBounds,
  reverseCubicPath,
  samplePath,
  translatePath,
} from '@/core/geom';

const path: CubicPath = {
  start: { x: 0, y: 0 },
  segments: [
    { c1: { x: 1, y: 2 }, c2: { x: 3, y: -1 }, to: { x: 4, y: 0 } },
    { c1: { x: 5, y: 1 }, c2: { x: 7, y: 3 }, to: { x: 8, y: 2 } },
  ],
};

describe('cubicAt', () => {
  it('hits the endpoints at t=0 and t=1', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 10, y: 4 };
    const c1 = { x: 2, y: 8 };
    const c2 = { x: 8, y: -4 };
    expect(cubicAt(p0, c1, c2, p1, 0)).toEqual(p0);
    expect(cubicAt(p0, c1, c2, p1, 1)).toEqual(p1);
  });

  it('reduces to a straight line for collinear controls', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 9, y: 0 };
    const mid = cubicAt(p0, { x: 3, y: 0 }, { x: 6, y: 0 }, p1, 0.5);
    expect(mid.x).toBeCloseTo(4.5, 10);
    expect(mid.y).toBeCloseTo(0, 10);
  });
});

describe('reverseCubicPath', () => {
  it('swaps the endpoints', () => {
    const reversed = reverseCubicPath(path);
    expect(reversed.start).toEqual({ x: 8, y: 2 });
    const last = reversed.segments[reversed.segments.length - 1]!;
    expect(last.to).toEqual({ x: 0, y: 0 });
  });

  it('keeps the segment count', () => {
    expect(reverseCubicPath(path).segments).toHaveLength(path.segments.length);
  });

  it('traces the identical curve, sampled', () => {
    const forward = samplePath(path, 32);
    const backward = samplePath(reverseCubicPath(path), 32).reverse();

    expect(forward).toHaveLength(backward.length);
    for (let i = 0; i < forward.length; i++) {
      expect(forward[i]!.x).toBeCloseTo(backward[i]!.x, 12);
      expect(forward[i]!.y).toBeCloseTo(backward[i]!.y, 12);
    }
  });

  it('round-trips to the original', () => {
    expect(reverseCubicPath(reverseCubicPath(path))).toEqual(path);
  });

  it('does not mutate its input', () => {
    const before = structuredClone(path);
    reverseCubicPath(path);
    expect(path).toEqual(before);
  });

  it('handles a single-segment path', () => {
    const one: CubicPath = {
      start: { x: 1, y: 1 },
      segments: [{ c1: { x: 2, y: 2 }, c2: { x: 3, y: 3 }, to: { x: 4, y: 4 } }],
    };
    const back = reverseCubicPath(one);
    expect(back.start).toEqual({ x: 4, y: 4 });
    expect(back.segments[0]).toEqual({
      c1: { x: 3, y: 3 },
      c2: { x: 2, y: 2 },
      to: { x: 1, y: 1 },
    });
  });
});

describe('samplePath', () => {
  it('returns start plus perSegment points per segment', () => {
    expect(samplePath(path, 8)).toHaveLength(1 + 8 * 2);
  });

  it('begins at the start and ends at the final point', () => {
    const pts = samplePath(path, 4);
    expect(pts[0]).toEqual(path.start);
    expect(pts[pts.length - 1]).toEqual({ x: 8, y: 2 });
  });
});

describe('pathBounds', () => {
  it('contains the curve at any sample density — it is solved, not sampled', () => {
    const bounds = pathBounds(path);
    // 512 per segment would defeat any sampled implementation. This is the
    // guarantee `rasterisePiece` depends on: bounds that never clip a knob.
    for (const p of samplePath(path, 512)) {
      expect(p.x).toBeGreaterThanOrEqual(bounds.x - 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(bounds.y - 1e-9);
      expect(p.x).toBeLessThanOrEqual(bounds.x + bounds.w + 1e-9);
      expect(p.y).toBeLessThanOrEqual(bounds.y + bounds.h + 1e-9);
    }
  });

  it('is tight — every side of the box is actually touched', () => {
    const bounds = pathBounds(path);
    const pts = samplePath(path, 2048);
    const near = (value: number, target: number): boolean => Math.abs(value - target) < 1e-3;

    expect(pts.some((p) => near(p.x, bounds.x))).toBe(true);
    expect(pts.some((p) => near(p.x, bounds.x + bounds.w))).toBe(true);
    expect(pts.some((p) => near(p.y, bounds.y))).toBe(true);
    expect(pts.some((p) => near(p.y, bounds.y + bounds.h))).toBe(true);
  });

  it('finds an extremum the endpoints alone would miss', () => {
    // A curve that bulges well past both endpoints on y.
    const arch: CubicPath = {
      start: { x: 0, y: 0 },
      segments: [{ c1: { x: 0, y: 12 }, c2: { x: 10, y: 12 }, to: { x: 10, y: 0 } }],
    };
    const bounds = pathBounds(arch);
    expect(bounds.y).toBeCloseTo(0, 9);
    // Peak of a symmetric cubic arch is 3/4 of the control height.
    expect(bounds.h).toBeCloseTo(9, 9);
  });

  it('is exact for an axis-aligned straight path', () => {
    const line: CubicPath = {
      start: { x: 2, y: 5 },
      segments: [{ c1: { x: 4, y: 5 }, c2: { x: 6, y: 5 }, to: { x: 8, y: 5 } }],
    };
    const bounds = pathBounds(line);
    expect(bounds.x).toBeCloseTo(2, 8);
    expect(bounds.w).toBeCloseTo(6, 8);
    expect(bounds.h).toBeCloseTo(0, 8);
  });
});

describe('translatePath', () => {
  it('shifts every point, control points included', () => {
    const moved = translatePath(path, 10, -5);
    expect(moved.start).toEqual({ x: 10, y: -5 });
    expect(moved.segments[0]!.c1).toEqual({ x: 11, y: -3 });
    expect(moved.segments[0]!.to).toEqual({ x: 14, y: -5 });
  });

  it('preserves the shape — bounds move but do not resize', () => {
    const before = pathBounds(path);
    const after = pathBounds(translatePath(path, 3, 7));
    expect(after.w).toBeCloseTo(before.w, 10);
    expect(after.h).toBeCloseTo(before.h, 10);
    expect(after.x).toBeCloseTo(before.x + 3, 10);
    expect(after.y).toBeCloseTo(before.y + 7, 10);
  });

  it('does not mutate its input', () => {
    const before = structuredClone(path);
    translatePath(path, 5, 5);
    expect(path).toEqual(before);
  });
});

describe('joinPaths', () => {
  it('keeps the first start and concatenates every segment', () => {
    const a: CubicPath = {
      start: { x: 0, y: 0 },
      segments: [{ c1: { x: 1, y: 0 }, c2: { x: 2, y: 0 }, to: { x: 3, y: 0 } }],
    };
    const b: CubicPath = {
      start: { x: 3, y: 0 },
      segments: [{ c1: { x: 4, y: 0 }, c2: { x: 5, y: 0 }, to: { x: 6, y: 0 } }],
    };
    const joined = joinPaths([a, b]);
    expect(joined.start).toEqual({ x: 0, y: 0 });
    expect(joined.segments).toHaveLength(2);
    expect(joined.segments[1]!.to).toEqual({ x: 6, y: 0 });
  });

  it('rejects an empty list rather than returning something meaningless', () => {
    expect(() => joinPaths([])).toThrow();
  });
});
