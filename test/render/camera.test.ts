/**
 * The camera is the only world↔screen mapping in the codebase, which is what
 * lets snap tolerance stay world-space and zoom never change difficulty (§05).
 * These tests pin that invertibility down.
 */

import { describe, expect, it } from 'vitest';
import {
  clampZoom,
  createCamera,
  fitCamera,
  fitCameraToBounds,
  fitScale,
  MAX_ZOOM,
  MIN_ZOOM,
  relativeZoom,
  screenToWorld,
  visibleWorldBounds,
  worldToScreen,
  zoomAbout,
} from '@/render/camera';

const VIEWPORT = { w: 1024, h: 768 };

describe('world ↔ screen', () => {
  it('round-trips exactly', () => {
    const camera = { x: 12, y: -4, zoom: 2.5 };
    for (const p of [
      { x: 0, y: 0 },
      { x: 17.25, y: -3.5 },
      { x: -120, y: 88 },
    ]) {
      const back = screenToWorld(camera, VIEWPORT, worldToScreen(camera, VIEWPORT, p));
      expect(back.x).toBeCloseTo(p.x, 10);
      expect(back.y).toBeCloseTo(p.y, 10);
    }
  });

  it('puts the camera centre at the viewport centre', () => {
    const camera = { x: 30, y: 20, zoom: 1.75 };
    const screen = worldToScreen(camera, VIEWPORT, { x: 30, y: 20 });
    expect(screen.x).toBeCloseTo(VIEWPORT.w / 2, 10);
    expect(screen.y).toBeCloseTo(VIEWPORT.h / 2, 10);
  });

  it('scales world distance by zoom', () => {
    const camera = { x: 0, y: 0, zoom: 3 };
    const a = worldToScreen(camera, VIEWPORT, { x: 0, y: 0 });
    const b = worldToScreen(camera, VIEWPORT, { x: 1, y: 0 });
    expect(b.x - a.x).toBeCloseTo(3, 10);
  });
});

describe('zoom is measured against the fitted board, not against a world unit', () => {
  // `camera.zoom` is screen pixels per world unit, and a world unit is one piece
  // width — so the moment the 0.5×–4× bounds are applied to it directly, 4×
  // means "pieces are four pixels across" and the board collapses to a stamp in
  // the middle of the screen. 1× is the board fitted to the viewport.
  const FIT = fitScale(VIEWPORT, 17, 12);

  it('fits a 17 × 12 board across the viewport, not down to a stamp', () => {
    // The regression: one piece must be a piece-sized number of pixels.
    expect(FIT).toBeGreaterThan(50);
    expect(17 * FIT).toBeLessThanOrEqual(VIEWPORT.w);
    expect(12 * FIT).toBeLessThanOrEqual(VIEWPORT.h);
  });

  it('lets the player get four times closer than the fitted board', () => {
    expect(clampZoom(FIT * 99, FIT)).toBeCloseTo(FIT * MAX_ZOOM, 6);
  });

  it('lets the player back away to half the fitted board', () => {
    expect(clampZoom(FIT * 0.01, FIT)).toBeCloseTo(FIT * MIN_ZOOM, 6);
  });

  it('leaves anything inside the range alone', () => {
    expect(clampZoom(FIT * 2, FIT)).toBeCloseTo(FIT * 2, 6);
  });

  it('reads 1× when the board is fitted, which is what the HUD shows', () => {
    expect(relativeZoom(FIT, FIT)).toBeCloseTo(1, 10);
    expect(relativeZoom(FIT * 2.5, FIT)).toBeCloseTo(2.5, 10);
  });

  it('degrades to something usable when there is no board yet', () => {
    expect(fitScale(VIEWPORT, 0, 0)).toBeGreaterThan(0);
  });
});

describe('zoomAbout', () => {
  const FIT = fitScale(VIEWPORT, 20, 15);

  it('keeps the pinched point fixed on screen', () => {
    const camera = { x: 10, y: 10, zoom: FIT };
    const anchor = { x: 300, y: 200 };

    const worldBefore = screenToWorld(camera, VIEWPORT, anchor);
    const zoomed = zoomAbout(camera, VIEWPORT, anchor, FIT * 2.4, FIT);
    const worldAfter = screenToWorld(zoomed, VIEWPORT, anchor);

    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 8);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 8);
    expect(zoomed.zoom).toBeCloseTo(FIT * 2.4, 10);
  });

  it('respects the clamp while still holding the anchor', () => {
    const camera = { x: 0, y: 0, zoom: FIT * 3 };
    const anchor = { x: 100, y: 100 };
    const zoomed = zoomAbout(camera, VIEWPORT, anchor, FIT * 50, FIT);

    expect(zoomed.zoom).toBeCloseTo(FIT * MAX_ZOOM, 6);
    const before = screenToWorld(camera, VIEWPORT, anchor);
    const after = screenToWorld(zoomed, VIEWPORT, anchor);
    expect(after.x).toBeCloseTo(before.x, 8);
    expect(after.y).toBeCloseTo(before.y, 8);
  });
});

describe('fitCamera', () => {
  it('centres the board and fits it inside the viewport', () => {
    const camera = fitCamera(VIEWPORT, 20, 15);
    expect(camera.x).toBe(10);
    expect(camera.y).toBe(7.5);
    expect(20 * camera.zoom).toBeLessThanOrEqual(VIEWPORT.w);
    expect(15 * camera.zoom).toBeLessThanOrEqual(VIEWPORT.h);
  });

  it('fits by the limiting axis', () => {
    // A wide board in a tall viewport must be limited by width, not height:
    // 400/200 = 2 rather than 2000/50 = 40.
    const camera = fitCamera({ w: 400, h: 2000 }, 200, 50, 1);
    expect(camera.zoom).toBeCloseTo(2, 6);
  });

  it('degrades safely on an empty board', () => {
    expect(fitCamera(VIEWPORT, 0, 0)).toEqual(createCamera());
  });

  it('is exactly 1× by definition, whatever the board', () => {
    // Fitting is the reference the zoom range is measured against, so it can
    // never itself be clamped — that was the bug that made the board a stamp.
    for (const [w, h] of [
      [17, 12],
      [100000, 100000],
      [0.001, 0.001],
    ]) {
      const camera = fitCamera(VIEWPORT, w!, h!);
      expect(relativeZoom(camera.zoom, fitScale(VIEWPORT, w!, h!))).toBeCloseTo(1, 10);
    }
  });
});

describe('fitCameraToBounds', () => {
  it('frames an arbitrary rectangle — the board plus its scattered pieces', () => {
    // The opening view has to show the pieces, which live outside the board.
    const camera = fitCameraToBounds(VIEWPORT, { x: -8, y: -6, w: 33, h: 24 });
    expect(camera.x).toBeCloseTo(-8 + 33 / 2, 10);
    expect(camera.y).toBeCloseTo(-6 + 24 / 2, 10);
    expect(33 * camera.zoom).toBeLessThanOrEqual(VIEWPORT.w);
    expect(24 * camera.zoom).toBeLessThanOrEqual(VIEWPORT.h);
  });
});

describe('visibleWorldBounds', () => {
  it('describes the viewport in world units, centred on the camera', () => {
    const camera = { x: 50, y: 40, zoom: 2 };
    const view = visibleWorldBounds(camera, VIEWPORT);

    expect(view.w).toBeCloseTo(VIEWPORT.w / 2, 10);
    expect(view.h).toBeCloseTo(VIEWPORT.h / 2, 10);
    expect(view.x + view.w / 2).toBeCloseTo(camera.x, 10);
    expect(view.y + view.h / 2).toBeCloseTo(camera.y, 10);
  });

  it('shows less world as zoom rises', () => {
    const near = visibleWorldBounds({ x: 0, y: 0, zoom: 4 }, VIEWPORT);
    const far = visibleWorldBounds({ x: 0, y: 0, zoom: 1 }, VIEWPORT);
    expect(near.w).toBeLessThan(far.w);
  });
});
