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

/**
 * Clamp to 0.5×–4× of the fitted board.
 *
 * `minRelativeZoom` raises that floor — large-piece mode (step 5b) passes
 * `REGION_LENS_ZOOM`, so pieces never render below 1.5×. It changes what the
 * player sees, never snap tolerance, which stays world-space.
 */
export function clampZoom(zoom: number, fit: number, minRelativeZoom = MIN_ZOOM): number {
  const base = fit > 0 ? fit : NO_BOARD_SCALE;
  return Math.min(MAX_ZOOM * base, Math.max(minRelativeZoom * base, zoom));
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
 * Frame content (board plus scatter), clamped to the zoom range — without ever
 * clipping the board frame.
 *
 * When the content fits inside the zoom floor this is exactly
 * `fitCameraToBounds`. When it doesn't, the clamp raises the zoom and
 * centring on the content would crop it symmetrically — and if the board sits
 * at one edge of the content, the board is what gets cut off. That was the
 * guided twelve on a 402pt phone: frame off the left edge, and Fit landing in
 * the same place. So on each axis where the board still fits at the clamped
 * zoom, the centre slides just far enough to keep the whole board in view; on
 * an axis where it can't fit (large-piece mode's higher floor), the content
 * centre stands.
 */
export function fitCameraToContent(
  viewport: Size,
  content: Rect,
  board: { w: number; h: number },
  minRelativeZoom = MIN_ZOOM,
): Camera {
  const framed = fitCameraToBounds(viewport, content);
  const zoom = clampZoom(framed.zoom, fitScale(viewport, board.w, board.h), minRelativeZoom);
  if (zoom === framed.zoom) return framed;
  return {
    x: keepSpanInView(framed.x, board.w, viewport.w / 2 / zoom),
    y: keepSpanInView(framed.y, board.h, viewport.h / 2 / zoom),
    zoom,
  };
}

/**
 * Move `centre` the least distance that keeps `[0, span]` within `centre ±
 * half`, if it can — inside the same 0.9 margin `fitScale` uses where there is
 * room, so the frame is not left flush against the screen edge.
 */
function keepSpanInView(centre: number, span: number, half: number, margin = 0.9): number {
  const reach = span <= half * margin * 2 ? half * margin : half;
  if (span > reach * 2) return centre;
  return Math.min(reach, Math.max(span - reach, centre));
}

/**
 * Modernize §5: frame `bounds` into the part of the viewport the player can
 * actually see — below the top bar, above the phone sheet — rather than the
 * whole board container. `visible` is in screen px within `viewport`.
 *
 * The zoom clamp still measures 1× against the *whole* viewport (`fitScale`),
 * so CLAUDE.md's zoom range keeps its meaning and a sheet that opens never
 * moves the 0.5×–4× goalposts (ruling R1). Only where the fit lands changes.
 */
export function fitCameraInRect(
  viewport: Size,
  visible: Rect,
  bounds: Rect,
  board: { w: number; h: number },
  minRelativeZoom = MIN_ZOOM,
): Camera {
  const area: Size = { w: Math.max(1, visible.w), h: Math.max(1, visible.h) };
  const framed = fitCameraToBounds(area, bounds);
  if (bounds.w <= 0 || bounds.h <= 0) return framed;
  const zoom = clampZoom(framed.zoom, fitScale(viewport, board.w, board.h), minRelativeZoom);
  const centre =
    zoom === framed.zoom
      ? framed
      : {
          x: keepSpanInView(framed.x, board.w, area.w / 2 / zoom),
          y: keepSpanInView(framed.y, board.h, area.h / 2 / zoom),
        };
  // The camera's point is the viewport's centre; shift it so the content's
  // centre lands on the visible rect's centre instead.
  const dx = visible.x + area.w / 2 - viewport.w / 2;
  const dy = visible.y + area.h / 2 - viewport.h / 2;
  return { x: centre.x - dx / zoom, y: centre.y - dy / zoom, zoom };
}

/**
 * `--ease-standard`, cubic-bezier(0.32, 0.72, 0, 1), as a function of time.
 * Solved for x by bisection: monotone, exact at both ends, no table.
 */
export function easeStandard(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const bez = (a: number, b: number, u: number): number =>
    3 * a * u * (1 - u) ** 2 + 3 * b * u * u * (1 - u) + u ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (bez(0.32, 0, mid) < t) lo = mid;
    else hi = mid;
  }
  return bez(0.72, 1, (lo + hi) / 2);
}

/**
 * The eased fit (§5: a refit on a detent change takes 320ms on
 * `--ease-standard`). Position moves linearly in the eased progress; zoom moves
 * in log space, so zooming 2× feels the same speed as zooming ½×.
 */
export function easeCamera(from: Camera, to: Camera, t: number): Camera {
  if (t <= 0) return from;
  if (t >= 1) return to;
  const p = easeStandard(t);
  return {
    x: from.x + (to.x - from.x) * p,
    y: from.y + (to.y - from.y) * p,
    zoom: from.zoom * (to.zoom / from.zoom) ** p,
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
  minRelativeZoom = MIN_ZOOM,
): Camera {
  const before = screenToWorld(camera, viewport, screenPoint);
  const zoom = clampZoom(nextZoom, fit, minRelativeZoom);
  const after = screenToWorld({ ...camera, zoom }, viewport, screenPoint);
  return {
    x: camera.x + (before.x - after.x),
    y: camera.y + (before.y - after.y),
    zoom,
  };
}
