import { describe, expect, it } from 'vitest';
import { chooseGrid, MAX_PIECE_ASPECT, MIN_PIECE_ASPECT } from '@/cut/grid';

describe('chooseGrid', () => {
  it('reproduces the worked example from design doc §04', () => {
    // "A 3:2 photo at '200' lands on 17×12 = 204."
    const grid = chooseGrid({ imageWidth: 3000, imageHeight: 2000, targetCount: 200 });
    expect(grid.cols).toBe(17);
    expect(grid.rows).toBe(12);
    expect(grid.count).toBe(204);
  });

  it('keeps piece aspect inside the accepted band across the MVP ladder and common aspects', () => {
    const aspects: [number, number][] = [
      [3000, 2000], // 3:2
      [2000, 3000], // 2:3 portrait
      [2560, 1440], // 16:9
      [2048, 2048], // square
      [2400, 1800], // 4:3
      [1800, 2400], // 3:4 portrait
    ];

    for (const [w, h] of aspects) {
      for (const target of [50, 100, 150, 200, 250]) {
        const grid = chooseGrid({ imageWidth: w, imageHeight: h, targetCount: target });
        expect(grid.pieceAspect).toBeGreaterThanOrEqual(MIN_PIECE_ASPECT);
        expect(grid.pieceAspect).toBeLessThanOrEqual(MAX_PIECE_ASPECT);
      }
    }
  });

  it('lands within 15% of the target count', () => {
    for (const target of [50, 100, 150, 200, 250]) {
      const grid = chooseGrid({ imageWidth: 3000, imageHeight: 2000, targetCount: target });
      expect(Math.abs(grid.count - target) / target).toBeLessThan(0.15);
    }
  });

  it('is deterministic — the grid depends only on dimensions and target', () => {
    const a = chooseGrid({ imageWidth: 3000, imageHeight: 2000, targetCount: 200 });
    const b = chooseGrid({ imageWidth: 3000, imageHeight: 2000, targetCount: 200 });
    expect(a).toEqual(b);
  });

  it('produces cells that tile the image exactly', () => {
    const grid = chooseGrid({ imageWidth: 3000, imageHeight: 2000, targetCount: 200 });
    expect(grid.cellW * grid.cols).toBeCloseTo(3000, 6);
    expect(grid.cellH * grid.rows).toBeCloseTo(2000, 6);
  });

  it('rejects degenerate input', () => {
    expect(() => chooseGrid({ imageWidth: 0, imageHeight: 100, targetCount: 100 })).toThrow();
    expect(() => chooseGrid({ imageWidth: 100, imageHeight: 100, targetCount: 2 })).toThrow();
  });

  it('still succeeds on a wide panorama at a workable count', () => {
    // 16:1 at 50 lands on 28×2, whose pieces are aspect 1.14 — inside the band.
    // Worth pinning: the guard below must not be so eager that it rejects this.
    const grid = chooseGrid({ imageWidth: 8000, imageHeight: 500, targetCount: 50 });
    expect(grid.pieceAspect).toBeGreaterThanOrEqual(MIN_PIECE_ASPECT);
    expect(grid.pieceAspect).toBeLessThanOrEqual(MAX_PIECE_ASPECT);
  });

  it('reports a useful failure when no grid keeps pieces square enough', () => {
    // 40:1 at 20 pieces. The row count floors at 2, so every candidate in the
    // search window is a long thin sliver and all are rejected. The caller has
    // to crop or raise the count; widening the search would not help.
    expect(() => chooseGrid({ imageWidth: 8000, imageHeight: 200, targetCount: 20 })).toThrow(
      /piece aspect/,
    );
  });
});
