import { describe, expect, it } from 'vitest';
import {
  clampGhostOpacity,
  DEFAULT_PUZZLE_CONFIG,
  GHOST_OPACITY_MAX,
  nextHarderCount,
  PIECE_COUNT_LADDER,
  pieceScreenSize,
} from '@/play/setup';

describe('PIECE_COUNT_LADDER', () => {
  it('is the five MVP counts in order', () => {
    expect(PIECE_COUNT_LADDER).toEqual([50, 100, 150, 200, 250]);
  });
});

describe('pieceScreenSize', () => {
  it('matches fitScale on a square photo at a count with an exact square grid', () => {
    // 400x400 photo at targetCount 4 -> chooseGrid finds 2x2 (cellW = 200),
    // so boardW = boardH = 2 world units. A 1000x1000 viewport at margin 0.9
    // fits that at scale = min(1000/2, 1000/2) * 0.9 = 450.
    const size = pieceScreenSize({ width: 400, height: 400 }, 4, { w: 1000, h: 1000 });
    expect(size).toBeCloseTo(450, 6);
  });

  it('shrinks as the viewport shrinks', () => {
    const big = pieceScreenSize({ width: 2400, height: 1600 }, 150, { w: 1200, h: 900 });
    const small = pieceScreenSize({ width: 2400, height: 1600 }, 150, { w: 400, h: 300 });
    expect(small).toBeLessThan(big);
  });

  it('shrinks as the target count rises, for the same photo and viewport', () => {
    const viewport = { w: 1200, h: 900 };
    const photo = { width: 2400, height: 1600 };
    const at50 = pieceScreenSize(photo, 50, viewport);
    const at250 = pieceScreenSize(photo, 250, viewport);
    expect(at250).toBeLessThan(at50);
  });
});

describe('clampGhostOpacity', () => {
  it('leaves an in-range value unchanged', () => {
    expect(clampGhostOpacity(0.15)).toBe(0.15);
  });

  it('clamps below zero up to zero', () => {
    expect(clampGhostOpacity(-0.5)).toBe(0);
  });

  it('clamps above the max down to the max', () => {
    expect(clampGhostOpacity(1)).toBe(GHOST_OPACITY_MAX);
  });

  it('leaves the boundary values exactly at the edges', () => {
    expect(clampGhostOpacity(0)).toBe(0);
    expect(clampGhostOpacity(GHOST_OPACITY_MAX)).toBe(GHOST_OPACITY_MAX);
  });
});

describe('DEFAULT_PUZZLE_CONFIG', () => {
  it('defaults every assist off/neutral', () => {
    expect(DEFAULT_PUZZLE_CONFIG.assists).toEqual({
      ghostOpacity: 0,
      edgeHighlight: false,
      largePieceMode: false,
    });
  });

  it('defaults rotation off and mode classic', () => {
    expect(DEFAULT_PUZZLE_CONFIG.rotation).toBe(false);
    expect(DEFAULT_PUZZLE_CONFIG.mode).toBe('classic');
  });
});

describe('nextHarderCount', () => {
  it('steps to the next rung', () => {
    expect(nextHarderCount(50)).toBe(100);
    expect(nextHarderCount(150)).toBe(200);
  });

  it('returns null once already at the max', () => {
    expect(nextHarderCount(250)).toBeNull();
  });

  it('returns null for a value above the max', () => {
    expect(nextHarderCount(999)).toBeNull();
  });

  it('finds the first rung above an off-ladder value', () => {
    expect(nextHarderCount(120)).toBe(150);
  });

  it('walks the whole ladder and then stops', () => {
    const walked: number[] = [];
    let current: number | null = PIECE_COUNT_LADDER[0];
    while (current !== null) {
      walked.push(current);
      current = nextHarderCount(current);
    }
    expect(walked).toEqual([...PIECE_COUNT_LADDER]);
  });
});
