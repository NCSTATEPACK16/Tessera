/**
 * Hit-testing — the entry point from screen space into piece space.
 *
 * §03 rejects DOM pieces partly because "browser hit-testing uses bounding
 * boxes, so overlapping tabs pick the wrong piece". That makes the bounding-box
 * case the load-bearing test here: a point inside a piece's box but outside its
 * outline must not pick it, or every drag near a knob grabs the neighbour.
 */

import { describe, expect, it } from 'vitest';
import type { CubicPath, Point } from '@/core/geom';
import { HitIndex, pointInPolygon, polygonFromPath } from '@/board/hit-test';
import type { HitPiece } from '@/board/hit-test';

/** A straight-sided closed square in bitmap-local pixels. */
function squarePath(size: number): CubicPath {
  const seg = (fromX: number, fromY: number, toX: number, toY: number) => ({
    c1: { x: fromX + (toX - fromX) / 3, y: fromY + (toY - fromY) / 3 },
    c2: { x: fromX + (2 * (toX - fromX)) / 3, y: fromY + (2 * (toY - fromY)) / 3 },
    to: { x: toX, y: toY },
  });
  return {
    start: { x: 0, y: 0 },
    segments: [
      seg(0, 0, size, 0),
      seg(size, 0, size, size),
      seg(size, size, 0, size),
      seg(0, size, 0, 0),
    ],
  };
}

function piece(over: Partial<HitPiece> & { id: number }): HitPiece {
  return {
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    rot: 0,
    pick: 0,
    poly: polygonFromPath(squarePath(100), 100),
    ...over,
  };
}

describe('polygonFromPath', () => {
  it('converts bitmap pixels to world units, so hit-testing never sees a bitmap', () => {
    // 100px path rasterised at 100px per world unit is one world unit across.
    const poly = polygonFromPath(squarePath(100), 100);
    let maxX = -Infinity;
    for (let i = 0; i < poly.length; i += 2) maxX = Math.max(maxX, poly[i]!);
    expect(maxX).toBeCloseTo(1, 10);
  });

  it('keeps the same shape at a different raster scale', () => {
    const at1x = polygonFromPath(squarePath(100), 100);
    const at2x = polygonFromPath(squarePath(200), 200);
    expect(at2x.length).toBe(at1x.length);
    for (let i = 0; i < at1x.length; i++) expect(at2x[i]).toBeCloseTo(at1x[i]!, 10);
  });
});

describe('pointInPolygon', () => {
  const square = polygonFromPath(squarePath(100), 100);

  it('accepts an interior point', () => {
    expect(pointInPolygon(square, 0.5, 0.5)).toBe(true);
  });

  it('rejects a point outside', () => {
    expect(pointInPolygon(square, 1.5, 0.5)).toBe(false);
    expect(pointInPolygon(square, -0.2, 0.5)).toBe(false);
  });

  it('rejects the notch of a concave outline — the socket a tab bites out', () => {
    // A square with a deep bite taken out of its right edge, as a socket does.
    const notched = [0, 0, 1, 0, 1, 0.4, 0.6, 0.5, 1, 0.6, 1, 1, 0, 1];
    expect(pointInPolygon(notched, 0.5, 0.5)).toBe(true);
    // Inside the bounding box, inside the bite, outside the piece.
    expect(pointInPolygon(notched, 0.9, 0.5)).toBe(false);
  });
});

describe('HitIndex', () => {
  it('picks the piece under the point', () => {
    const index = new HitIndex();
    index.rebuild([piece({ id: 7, x: 3, y: 2 })]);
    expect(index.pick({ x: 3.5, y: 2.5 })?.id).toBe(7);
  });

  it('picks nothing on empty mat', () => {
    const index = new HitIndex();
    index.rebuild([piece({ id: 7, x: 3, y: 2 })]);
    expect(index.pick({ x: 9, y: 9 })).toBeNull();
  });

  it('consults only nearby pieces, never the whole board', () => {
    const index = new HitIndex();
    const many: HitPiece[] = [];
    for (let i = 0; i < 250; i++) many.push(piece({ id: i, x: i * 2, y: 0 }));
    index.rebuild(many);

    // 250 pieces spread across the mat; a point near one must not scan them all.
    const candidates = index.candidatesAt({ x: 0.5, y: 0.5 });
    expect(candidates.length).toBeLessThan(8);
    expect(candidates).toContain(0);
  });

  it('picks the topmost when two outlines overlap', () => {
    const index = new HitIndex();
    index.rebuild([
      piece({ id: 1, x: 0, y: 0, pick: 5 }),
      piece({ id: 2, x: 0.2, y: 0.2, pick: 9 }),
    ]);
    expect(index.pick({ x: 0.5, y: 0.5 })?.id).toBe(2);
  });

  it('respects the outline, not the box — the reason pieces are not DOM elements', () => {
    const index = new HitIndex();
    // A tab protruding right: the bitmap box is wider than the body.
    const notched = [0, 0, 0.8, 0, 0.8, 0.4, 1, 0.5, 0.8, 0.6, 0.8, 1, 0, 1];
    index.rebuild([piece({ id: 4, x: 0, y: 0, w: 1, h: 1, poly: notched })]);

    expect(index.pick({ x: 0.9, y: 0.5 })?.id).toBe(4); // on the tab
    expect(index.pick({ x: 0.9, y: 0.1 })).toBeNull(); // in the box, off the piece
  });

  it('follows a piece as it is dragged', () => {
    const index = new HitIndex();
    const dragged = piece({ id: 3, x: 0, y: 0 });
    index.rebuild([dragged]);

    index.update({ ...dragged, x: 12, y: 8 });

    expect(index.pick({ x: 0.5, y: 0.5 })).toBeNull();
    expect(index.pick({ x: 12.5, y: 8.5 })?.id).toBe(3);
  });

  it('drops a piece that has been removed', () => {
    const index = new HitIndex();
    index.rebuild([piece({ id: 3, x: 0, y: 0 })]);
    index.remove(3);
    expect(index.pick({ x: 0.5, y: 0.5 })).toBeNull();
  });

  it('hit-tests a rotated piece in its own frame', () => {
    const index = new HitIndex();
    // A tall piece rotated a quarter turn about its centre is wide on screen.
    const tall = piece({ id: 5, x: 0, y: 0, w: 0.5, h: 2, rot: Math.PI / 2 });
    tall.poly = polygonFromPath(squarePath(100), 100).map((v, i) => (i % 2 === 0 ? v * 0.5 : v * 2));
    index.rebuild([tall]);

    const centre: Point = { x: 0.25, y: 1 };
    expect(index.pick(centre)?.id).toBe(5);
    // Unrotated this point is outside the 0.5-wide piece; rotated it is on it.
    expect(index.pick({ x: 1.1, y: 1 })?.id).toBe(5);
    expect(index.pick({ x: 0.25, y: 1.8 })).toBeNull();
  });
});
