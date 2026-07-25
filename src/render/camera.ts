/**
 * The camera — the only world↔screen mapping in the codebase.
 *
 * Keeping it sole means snap tolerance can stay world-space without anyone
 * having to remember to convert, so zoom never changes difficulty (§05).
 */

import type { Point, Size } from '@/core/geom';

/** Zoom bounds from §05. Rubber-band beyond these, never a hard stop. */
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;

/** Above this, the region lens unlocks and re-rasterisation becomes worthwhile. */
export const REGION_LENS_ZOOM = 1.5;

export interface Camera {
  /** World point at the viewport centre. */
  x: number;
  y: number;
  /** Screen pixels per world unit. */
  zoom: number;
}

export function createCamera(): Camera {
  return { x: 0, y: 0, zoom: 1 };
}

export function worldToScreen(camera: Camera, viewport: Size, p: Point): Point {
  return {
    x: (p.x - camera.x) * camera.zoom + viewport.w / 2,
    y: (p.y - camera.y) * camera.zoom + viewport.h / 2,
  };
}

export function screenToWorld(camera: Camera, viewport: Size, p: Point): Point {
  return {
    x: (p.x - viewport.w / 2) / camera.zoom + camera.x,
    y: (p.y - viewport.h / 2) / camera.zoom + camera.y,
  };
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * Fit a board into the viewport with margin. Double-tap resolves to this.
 */
export function fitCamera(viewport: Size, boardW: number, boardH: number, margin = 0.9): Camera {
  if (boardW <= 0 || boardH <= 0) return createCamera();
  const zoom = Math.min(viewport.w / boardW, viewport.h / boardH) * margin;
  return { x: boardW / 2, y: boardH / 2, zoom: clampZoom(zoom) };
}

/** Visible world rectangle, used to cull everything off-screen. */
export function visibleWorldBounds(
  camera: Camera,
  viewport: Size,
): { x: number; y: number; w: number; h: number } {
  const w = viewport.w / camera.zoom;
  const h = viewport.h / camera.zoom;
  return { x: camera.x - w / 2, y: camera.y - h / 2, w, h };
}

/** Zoom about a fixed screen point, so pinch keeps the pinched spot still. */
export function zoomAbout(camera: Camera, viewport: Size, screenPoint: Point, nextZoom: number): Camera {
  const before = screenToWorld(camera, viewport, screenPoint);
  const zoom = clampZoom(nextZoom);
  const after = screenToWorld({ ...camera, zoom }, viewport, screenPoint);
  return {
    x: camera.x + (before.x - after.x),
    y: camera.y + (before.y - after.y),
    zoom,
  };
}
