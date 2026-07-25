/**
 * Step 4 of the cut — rasterise (design doc §04).
 *
 * "Then bake the material in the same pass: a 1px inner highlight stroked on
 * the upper-left of the path at 8% white, a 1px inner shadow on the lower-right
 * at 22% black. Baking it means the bevel is free at runtime and always reads
 * correctly regardless of zoom."
 */

import type { CubicPath, Rect } from '@/core/geom';
import { pathBounds, toPath2D, translatePath } from '@/core/geom';

/** Extra pixels around the path bounds, so edges never clip under filtering. */
export const BLEED_PX = 2;

const HIGHLIGHT_ALPHA = 0.08;
const SHADOW_ALPHA = 0.22;
/** Stroked at 2px so roughly 1px lands inside the shape after clipping. */
const BEVEL_STROKE = 2;

export interface RasterisedPiece {
  bitmap: ImageBitmap;
  /** Bitmap bounds in image space. */
  bounds: Rect;
  /** The outline translated into bitmap-local pixels. */
  localPath: CubicPath;
  meanColor: [number, number, number];
  colorVariance: number;
}

/**
 * Cut one piece out of the source and bake its material.
 *
 * The bitmap is the path's own bounds plus bleed — not the cell — because the
 * knobs protrude past the cell on whichever sides drew outward.
 */
export function rasterisePiece(
  source: CanvasImageSource,
  path: CubicPath,
  pixelRatio: number,
): RasterisedPiece {
  const raw = pathBounds(path);

  const bounds: Rect = {
    x: Math.floor(raw.x) - BLEED_PX,
    y: Math.floor(raw.y) - BLEED_PX,
    w: Math.ceil(raw.w) + BLEED_PX * 2 + 1,
    h: Math.ceil(raw.h) + BLEED_PX * 2 + 1,
  };

  const localPath = translatePath(path, -bounds.x, -bounds.y);

  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(bounds.w * pixelRatio)),
    Math.max(1, Math.round(bounds.h * pixelRatio)),
  );
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('rasterisePiece: no 2d context');

  ctx.scale(pixelRatio, pixelRatio);

  const p2d = toPath2D(localPath);

  // Silhouette first, then the source painted only where the silhouette is.
  // `source-in` rather than a clip: it antialiases the edge against
  // transparency, so pieces composite cleanly over the lit mat instead of
  // carrying a hard fringe.
  ctx.fillStyle = '#000';
  ctx.fill(p2d);
  ctx.globalCompositeOperation = 'source-in';
  ctx.drawImage(source, -bounds.x, -bounds.y);

  bakeBevel(ctx, localPath);

  const meanColor = sampleMeanColor(ctx, canvas.width, canvas.height);

  return {
    bitmap: canvas.transferToImageBitmap(),
    bounds,
    localPath,
    meanColor: meanColor.mean,
    colorVariance: meanColor.variance,
  };
}

/**
 * Bake the 1px bevel.
 *
 * Trick: stroke the outline offset down-right and keep only what lands inside
 * the piece (`source-atop`). The visible remainder is a band just inside the
 * upper-left border — the highlight. Offsetting up-left instead gives the
 * lower-right shadow. Two strokes, no filters, no second canvas.
 */
function bakeBevel(ctx: OffscreenCanvasRenderingContext2D, localPath: CubicPath): void {
  ctx.globalCompositeOperation = 'source-atop';
  ctx.lineWidth = BEVEL_STROKE;

  ctx.save();
  ctx.translate(1, 1);
  ctx.strokeStyle = `rgba(255,255,255,${HIGHLIGHT_ALPHA})`;
  ctx.stroke(toPath2D(localPath));
  ctx.restore();

  ctx.save();
  ctx.translate(-1, -1);
  ctx.strokeStyle = `rgba(0,0,0,${SHADOW_ALPHA})`;
  ctx.stroke(toPath2D(localPath));
  ctx.restore();

  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Mean colour and variance over the piece's opaque pixels.
 *
 * Computed here because the pixels are already decoded and on this thread —
 * the tray's Colour lens should never have to touch pixel data. Sampled on a
 * stride rather than every pixel; at 250 pieces the difference is invisible and
 * the cut has a 1.2s budget to respect.
 */
function sampleMeanColor(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
): { mean: [number, number, number]; variance: number } {
  const data = ctx.getImageData(0, 0, width, height).data;

  const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / 1024))) * 4;

  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += stride) {
    const alignedIndex = i - (i % 4);
    if ((data[alignedIndex + 3] ?? 0) < 200) continue;
    r += data[alignedIndex] ?? 0;
    g += data[alignedIndex + 1] ?? 0;
    b += data[alignedIndex + 2] ?? 0;
    n++;
  }

  if (n === 0) return { mean: [0, 0, 0], variance: 0 };

  const mean: [number, number, number] = [r / n, g / n, b / n];

  let acc = 0;
  let m = 0;
  for (let i = 0; i < data.length; i += stride) {
    const alignedIndex = i - (i % 4);
    if ((data[alignedIndex + 3] ?? 0) < 200) continue;
    const dr = (data[alignedIndex] ?? 0) - mean[0];
    const dg = (data[alignedIndex + 1] ?? 0) - mean[1];
    const db = (data[alignedIndex + 2] ?? 0) - mean[2];
    acc += dr * dr + dg * dg + db * db;
    m++;
  }

  // Normalised against the maximum possible spread so the "mixed" bin threshold
  // at step 3 is a plain 0–1 number rather than a magic pixel value.
  const variance = m === 0 ? 0 : Math.sqrt(acc / m) / 441.67;

  return { mean, variance: Math.min(1, variance) };
}
