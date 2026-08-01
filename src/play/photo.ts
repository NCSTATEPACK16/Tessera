/**
 * Crop geometry for the photo-picker flow (step 5a).
 *
 * Pure and DOM-free, same standard as `src/cut/grid.ts` — no ImageBitmap, no
 * canvas. `PhotoCrop.tsx` owns turning these numbers into pixels; this module
 * only answers "where is the crop rectangle."
 */

export interface PhotoSize {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Quarter-turns clockwise. */
export type RotateSteps = 0 | 1 | 2 | 3;

/** Zoom 1 shows the largest crop the frame aspect allows — never less of the photo than that. */
export const MIN_ZOOM = 1;
/** Matches the board camera's own top end (CLAUDE.md "Hard numbers": zoom 0.5x-4x). */
export const MAX_ZOOM = 4;

/** The photo's size after applying `rotateSteps`, since 90/270 degree turns swap the axes. */
export function effectiveSize(photo: PhotoSize, rotateSteps: RotateSteps): PhotoSize {
  return rotateSteps % 2 === 0
    ? { width: photo.width, height: photo.height }
    : { width: photo.height, height: photo.width };
}

/**
 * The crop rectangle's size at `MIN_ZOOM` — the largest `frameAspect`-shaped
 * rectangle that fits entirely inside `effective` (a "cover" fit).
 */
export function baseCropSize(
  effective: PhotoSize,
  frameAspect: number,
): { width: number; height: number } {
  const photoAspect = effective.width / effective.height;
  if (photoAspect > frameAspect) {
    return { width: effective.height * frameAspect, height: effective.height };
  }
  return { width: effective.width, height: effective.width / frameAspect };
}

function cropSizeAt(
  photo: PhotoSize,
  frameAspect: number,
  rotateSteps: RotateSteps,
  zoom: number,
): { width: number; height: number } {
  const base = baseCropSize(effectiveSize(photo, rotateSteps), frameAspect);
  return { width: base.width / zoom, height: base.height / zoom };
}

/** Keeps the crop rectangle fully inside the (rotated) photo at the given zoom. */
export function clampPan(
  photo: PhotoSize,
  frameAspect: number,
  rotateSteps: RotateSteps,
  zoom: number,
  pan: Point,
): Point {
  const size = effectiveSize(photo, rotateSteps);
  const crop = cropSizeAt(photo, frameAspect, rotateSteps, zoom);
  const maxX = Math.max(0, (size.width - crop.width) / 2);
  const maxY = Math.max(0, (size.height - crop.height) / 2);
  return {
    x: Math.max(-maxX, Math.min(maxX, pan.x)),
    y: Math.max(-maxY, Math.min(maxY, pan.y)),
  };
}

/** The crop rectangle, in the rotated photo's pixel space, top-left + size. */
export function computeCropRect(
  photo: PhotoSize,
  frameAspect: number,
  rotateSteps: RotateSteps,
  zoom: number,
  pan: Point,
): CropRect {
  const size = effectiveSize(photo, rotateSteps);
  const crop = cropSizeAt(photo, frameAspect, rotateSteps, zoom);
  const clamped = clampPan(photo, frameAspect, rotateSteps, zoom, pan);
  return {
    x: size.width / 2 + clamped.x - crop.width / 2,
    y: size.height / 2 + clamped.y - crop.height / 2,
    width: crop.width,
    height: crop.height,
  };
}

/** CLAUDE.md "Hard numbers": source downscale, max 2560px long edge. Never upscales. */
export function downscaleTarget(
  width: number,
  height: number,
  maxLongEdge = 2560,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxLongEdge / longEdge;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
