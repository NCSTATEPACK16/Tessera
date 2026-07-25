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
  MAX_ZOOM,
  MIN_ZOOM,
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

describe('clampZoom', () => {
  it('holds the documented bounds', () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(1.5)).toBe(1.5);
  });
});

describe('zoomAbout', () => {
  it('keeps the pinched point fixed on screen', () => {
    const camera = { x: 10, y: 10, zoom: 1 };
    const anchor = { x: 300, y: 200 };

    const worldBefore = screenToWorld(camera, VIEWPORT, anchor);
    const zoomed = zoomAbout(camera, VIEWPORT, anchor, 2.4);
    const worldAfter = screenToWorld(zoomed, VIEWPORT, anchor);

    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 8);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 8);
    expect(zoomed.zoom).toBeCloseTo(2.4, 10);
  });

  it('respects the clamp while still holding the anchor', () => {
    const camera = { x: 0, y: 0, zoom: 3 };
    const anchor = { x: 100, y: 100 };
    const zoomed = zoomAbout(camera, VIEWPORT, anchor, 50);

    expect(zoomed.zoom).toBe(MAX_ZOOM);
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
    // 400/200 = 2 rather than 2000/50 = 40. Chosen to land inside the zoom
    // clamp so this tests the fit, not the clamp.
    const camera = fitCamera({ w: 400, h: 2000 }, 200, 50, 1);
    expect(camera.zoom).toBeCloseTo(2, 6);
  });

  it('degrades safely on an empty board', () => {
    expect(fitCamera(VIEWPORT, 0, 0)).toEqual(createCamera());
  });

  it('never returns a zoom outside the clamp', () => {
    const tiny = fitCamera(VIEWPORT, 100000, 100000);
    expect(tiny.zoom).toBe(MIN_ZOOM);
    const huge = fitCamera(VIEWPORT, 0.001, 0.001);
    expect(huge.zoom).toBe(MAX_ZOOM);
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
