/**
 * The camera — the only world↔screen mapping in the codebase.
 *
 * Keeping it sole means snap tolerance can stay world-space without anyone
 * having to remember to convert, so zoom never changes difficulty (§05).
 */

import type { Point, Rect, Size } from '@/core/geom';

/**
 * Zoom bounds from §05 — **relative to the fitted board, not to a world unit.**
 *
 * `camera.zoom` is screen pixels per world unit, and a world unit is one piece
 * width. Applying these numbers to it directly makes "4×" mean *pieces are four
 * pixels across*, which collapses the whole board to a stamp in the middle of an
 * empty screen and, worse, presents as "I cannot zoom in any further".
 *
 * So 1× is the board fitted to the viewport, and everything that clamps takes
 * the fit scale as its reference. Double-tap to fit resolves to exactly 1×.
 */
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;

/** Above this, the region lens unlocks and re-rasterisation becomes worthwhile. */
export const REGION_LENS_ZOOM = 1.5;

/** Fallback pixels per world unit before a board exists. */
const NO_BOARD_SCALE = 64;

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

/**
 * Screen pixels per world unit at which the board exactly fits — the 1× the
 * zoom range is measured against.
 */
export function fitScale(viewport: Size, boardW: number, boardH: number, margin = 0.9): number {
  if (boardW <= 0 || boardH <= 0) return NO_BOARD_SCALE;
  return Math.min(viewport.w / boardW, viewport.h / boardH) * margin;
}

/** Clamp to 0.5×–4× of the fitted board. */
export function clampZoom(zoom: number, fit: number): number {
  const base = fit > 0 ? fit : NO_BOARD_SCALE;
  return Math.min(MAX_ZOOM * base, Math.max(MIN_ZOOM * base, zoom));
}

/** Zoom as the player understands it: 1× is the whole board on screen. */
export function relativeZoom(zoom: number, fit: number): number {
  return fit > 0 ? zoom / fit : 1;
}

/**
 * Fit a board into the viewport with margin. Double-tap resolves to this.
 *
 * Never clamped: this *is* 1×, so clamping it against a range expressed in
 * multiples of itself is circular — and getting that wrong is what pinned every
 * board to four pixels a piece.
 */
export function fitCamera(viewport: Size, boardW: number, boardH: number, margin = 0.9): Camera {
  if (boardW <= 0 || boardH <= 0) return createCamera();
  return { x: boardW / 2, y: boardH / 2, zoom: fitScale(viewport, boardW, boardH, margin) };
}

/**
 * Frame an arbitrary world rectangle.
 *
 * The opening view uses this rather than `fitCamera`, because on a fresh board
 * everything the player owns is *outside* the board — fitting the board alone
 * would open on an empty frame with the pieces off-screen.
 */
export function fitCameraToBounds(viewport: Size, bounds: Rect, margin = 0.9): Camera {
  if (bounds.w <= 0 || bounds.h <= 0) return createCamera();
  return {
    x: bounds.x + bounds.w / 2,
    y: bounds.y + bounds.h / 2,
    zoom: Math.min(viewport.w / bounds.w, viewport.h / bounds.h) * margin,
  };
}

/**
 * The visible world rectangle, inset from the viewport's edges by `insets`
 * screen pixels each side — the part of the mat the player can actually see
 * and reach once chrome (a docked tray, an iPhone sheet) is sitting on top of
 * some of the canvas.
 *
 * Both corners go through `screenToWorld` independently rather than
 * converting one corner and subtracting a raw screen-space size from it: an
 * inset is stated in screen pixels, and `camera.zoom` is screen pixels *per
 * world unit* — so getting this wrong the obvious way is correct only at
 * zoom 1, and silently wrong (too large at high zoom, too small at low zoom)
 * everywhere else.
 */
export function insetWorldRect(
  camera: Camera,
  viewport: Size,
  insets: { left: number; right: number; top: number; bottom: number },
): Rect {
  const topLeft = screenToWorld(camera, viewport, { x: insets.left, y: insets.top });
  const bottomRight = screenToWorld(camera, viewport, {
    x: viewport.w - insets.right,
    y: viewport.h - insets.bottom,
  });
  return {
    x: topLeft.x,
    y: topLeft.y,
    w: bottomRight.x - topLeft.x,
    h: bottomRight.y - topLeft.y,
  };
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
export function zoomAbout(
  camera: Camera,
  viewport: Size,
  screenPoint: Point,
  nextZoom: number,
  fit: number,
): Camera {
  const before = screenToWorld(camera, viewport, screenPoint);
  const zoom = clampZoom(nextZoom, fit);
  const after = screenToWorld({ ...camera, zoom }, viewport, screenPoint);
  return {
    x: camera.x + (before.x - after.x),
    y: camera.y + (before.y - after.y),
    zoom,
  };
}
