import { describe, expect, it } from 'vitest';
import {
  baseCropSize,
  clampPan,
  computeCropRect,
  downscaleTarget,
  effectiveSize,
  MAX_ZOOM,
  MIN_ZOOM,
} from '@/play/photo';

describe('effectiveSize', () => {
  it('leaves size unchanged at 0 and 2 quarter-turns', () => {
    expect(effectiveSize({ width: 400, height: 300 }, 0)).toEqual({ width: 400, height: 300 });
    expect(effectiveSize({ width: 400, height: 300 }, 2)).toEqual({ width: 400, height: 300 });
  });

  it('swaps width and height at 1 and 3 quarter-turns', () => {
    expect(effectiveSize({ width: 400, height: 300 }, 1)).toEqual({ width: 300, height: 400 });
    expect(effectiveSize({ width: 400, height: 300 }, 3)).toEqual({ width: 300, height: 400 });
  });
});

describe('baseCropSize', () => {
  it('fits full height when the photo is wider than the frame aspect', () => {
    // 4:3 photo (1.333), 1:1 frame — height-limited.
    const base = baseCropSize({ width: 400, height: 300 }, 1);
    expect(base).toEqual({ width: 300, height: 300 });
  });

  it('fits full width when the photo is narrower than the frame aspect', () => {
    // 4:3 photo (1.333), 16:9 frame (1.778) — width-limited.
    const base = baseCropSize({ width: 400, height: 300 }, 16 / 9);
    expect(base.width).toBeCloseTo(400, 6);
    expect(base.height).toBeCloseTo(400 / (16 / 9), 6);
  });

  it('exactly reproduces the photo when the frame aspect matches it', () => {
    const base = baseCropSize({ width: 400, height: 300 }, 4 / 3);
    expect(base.width).toBeCloseTo(400, 6);
    expect(base.height).toBeCloseTo(300, 6);
  });
});

describe('clampPan', () => {
  it('leaves pan at (0,0) unchanged — always valid, centered', () => {
    const pan = clampPan({ width: 400, height: 300 }, 1, 0, MIN_ZOOM, { x: 0, y: 0 });
    expect(pan).toEqual({ x: 0, y: 0 });
  });

  it('clamps pan that would push the crop rect outside the photo', () => {
    // 1:1 frame on a 400x300 photo at MIN_ZOOM: base crop is 300x300, so pan.x
    // can range over +/-50 (400-300)/2 before the rect leaves the photo.
    const pan = clampPan({ width: 400, height: 300 }, 1, 0, MIN_ZOOM, { x: 1000, y: 0 });
    expect(pan.x).toBeCloseTo(50, 6);
    expect(pan.y).toBe(0);
  });

  it('shrinks the allowed pan range as zoom increases', () => {
    const panAtMinZoom = clampPan({ width: 400, height: 300 }, 1, 0, MIN_ZOOM, { x: 1000, y: 0 });
    const panAtMaxZoom = clampPan({ width: 400, height: 300 }, 1, 0, MAX_ZOOM, { x: 1000, y: 0 });
    expect(panAtMaxZoom.x).toBeGreaterThan(panAtMinZoom.x);
  });
});

describe('computeCropRect', () => {
  it('is centered on the photo at pan (0,0) and MIN_ZOOM', () => {
    const rect = computeCropRect({ width: 400, height: 300 }, 1, 0, MIN_ZOOM, { x: 0, y: 0 });
    expect(rect).toEqual({ x: 50, y: 0, width: 300, height: 300 });
  });

  it('shrinks toward the requested aspect as zoom increases, staying centered at pan 0', () => {
    const rect = computeCropRect({ width: 400, height: 300 }, 1, 0, 2, { x: 0, y: 0 });
    expect(rect.width).toBeCloseTo(150, 6);
    expect(rect.height).toBeCloseTo(150, 6);
    expect(rect.x).toBeCloseTo(125, 6);
    expect(rect.y).toBeCloseTo(75, 6);
  });

  it('accounts for a 90-degree rotation swapping the effective photo size', () => {
    // A 400x300 photo rotated 1 step is effectively 300x400. A 1:1 frame at
    // MIN_ZOOM should now be limited by the effective width (300), not by 300
    // coincidentally matching the unrotated height.
    const rect = computeCropRect({ width: 400, height: 300 }, 1, 1, MIN_ZOOM, { x: 0, y: 0 });
    expect(rect.width).toBeCloseTo(300, 6);
    expect(rect.height).toBeCloseTo(300, 6);
  });

  it('clamps an out-of-range pan rather than returning a rect outside the photo', () => {
    const rect = computeCropRect({ width: 400, height: 300 }, 1, 0, MIN_ZOOM, { x: 10_000, y: 0 });
    expect(rect.x + rect.width).toBeLessThanOrEqual(400 + 1e-6);
    expect(rect.x).toBeGreaterThanOrEqual(-1e-6);
  });
});

describe('downscaleTarget', () => {
  it('leaves dimensions unchanged when already under the max long edge', () => {
    expect(downscaleTarget(1200, 800)).toEqual({ width: 1200, height: 800 });
  });

  it('leaves dimensions unchanged exactly at the boundary', () => {
    expect(downscaleTarget(2560, 1440)).toEqual({ width: 2560, height: 1440 });
  });

  it('scales the long edge down to exactly maxLongEdge, preserving aspect', () => {
    const result = downscaleTarget(5120, 2880);
    expect(result.width).toBe(2560);
    expect(result.height).toBe(1440);
  });

  it('scales down a tall (portrait) image by its long edge, which is the height', () => {
    const result = downscaleTarget(2000, 6000);
    expect(result.height).toBe(2560);
    expect(result.width).toBeCloseTo((2000 * 2560) / 6000, 0);
  });

  it('never upscales', () => {
    const result = downscaleTarget(100, 80, 2560);
    expect(result).toEqual({ width: 100, height: 80 });
  });
});
