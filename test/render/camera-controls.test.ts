/**
 * Camera gestures, fed by hand — the board must never move unless the player
 * asked it to. Each case here is one way it used to lurch:
 *
 * - a double press (tap a piece, then grab it) refit the whole view;
 * - a second finger mid-drag pinched from where the first finger *started*;
 * - a plain trackpad scroll zoomed.
 *
 * DOM-free: a fake element and plain objects shaped like the events.
 */

import { describe, expect, it } from 'vitest';
import type { Camera } from '@/render/camera';
import { CameraControls } from '@/render/camera-controls';

const VIEWPORT = { w: 800, h: 600 };

function rig(start: Camera = { x: 5, y: 5, zoom: 60 }) {
  let camera = start;
  const element = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: VIEWPORT.w, height: VIEWPORT.h }),
    setPointerCapture: () => {},
  } as unknown as HTMLElement;
  const controls = new CameraControls({
    element,
    getViewport: () => VIEWPORT,
    getCamera: () => camera,
    setCamera: (next) => {
      camera = next;
    },
    getBoard: () => ({ w: 10, h: 10 }),
    attach: false,
  });
  return { controls, camera: () => camera };
}

const pointer = (pointerId: number, clientX: number, clientY: number) =>
  ({ pointerId, clientX, clientY }) as PointerEvent;

const wheel = (over: Partial<WheelEvent>) =>
  ({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, clientX: 400, clientY: 300, preventDefault: () => {}, ...over }) as WheelEvent;

describe('no double-tap-to-fit', () => {
  it('two quick presses in one spot leave the camera exactly where it was', () => {
    const { controls, camera } = rig();
    const before = camera();
    controls.feedDown(pointer(1, 400, 300));
    controls.feedUp(pointer(1, 400, 300));
    controls.feedDown(pointer(2, 402, 301));
    controls.feedUp(pointer(2, 402, 301));
    expect(camera()).toEqual(before);
  });
});

describe('a second finger mid-drag pinches from a current baseline', () => {
  it('does not jump on the first move after the second finger lands', () => {
    const { controls, camera } = rig();
    // Finger 1 goes down on a piece and drags 200px — the camera only tracks it.
    controls.feedDown(pointer(1, 200, 300));
    controls.feedTrack(pointer(1, 400, 300));
    const before = camera();

    // Finger 2 lands; finger 1 then moves by one pixel.
    controls.feedDown(pointer(2, 600, 300));
    controls.feedMove(pointer(1, 401, 300));

    const after = camera();
    // A one-pixel move: about a pixel of pan, a sub-percent zoom. The stale baseline
    // made this a 100px pan and a 2× zoom.
    expect(Math.abs(after.x - before.x) * after.zoom).toBeLessThan(2);
    expect(after.zoom / before.zoom).toBeGreaterThan(0.99);
    expect(after.zoom / before.zoom).toBeLessThan(1.01);
  });

  it('feedTrack never moves the camera, and ignores pointers it has not seen', () => {
    const { controls, camera } = rig();
    const before = camera();
    controls.feedDown(pointer(1, 200, 300));
    controls.feedTrack(pointer(1, 500, 300));
    controls.feedTrack(pointer(9, 10, 10)); // a hovering mouse
    expect(camera()).toEqual(before);
  });
});

describe('wheel', () => {
  it('a plain wheel or trackpad scroll pans and never zooms', () => {
    const { controls, camera } = rig();
    const before = camera();
    controls.feedWheel(wheel({ deltaX: 30, deltaY: 60 }));
    expect(camera().zoom).toBe(before.zoom);
    expect(camera().x).toBeCloseTo(before.x + 30 / before.zoom, 10);
    expect(camera().y).toBeCloseTo(before.y + 60 / before.zoom, 10);
  });

  it('a ctrl-wheel — a trackpad pinch — zooms', () => {
    const { controls, camera } = rig();
    const before = camera();
    controls.feedWheel(wheel({ deltaY: -20, ctrlKey: true }));
    expect(camera().zoom).toBeGreaterThan(before.zoom);
  });

  it('line-mode deltas are scaled to pixels', () => {
    const { controls, camera } = rig();
    const before = camera();
    controls.feedWheel(wheel({ deltaY: 3, deltaMode: 1 }));
    expect(camera().y).toBeCloseTo(before.y + 48 / before.zoom, 10);
  });
});

describe('zoomBy — the zoom buttons', () => {
  it('zooms about the visible centre, within the clamp', () => {
    const { controls, camera } = rig();
    const before = camera();
    controls.zoomBy(1.4);
    expect(camera().zoom).toBeCloseTo(before.zoom * 1.4, 6);
    // About the centre: the centre's world point does not move.
    expect(camera().x).toBeCloseTo(before.x, 10);
    for (let i = 0; i < 20; i++) controls.zoomBy(1.4);
    const fit = Math.min((VIEWPORT.w * 0.9) / 10, (VIEWPORT.h * 0.9) / 10);
    expect(camera().zoom).toBeLessThanOrEqual(fit * 4 + 1e-9);
  });
});
