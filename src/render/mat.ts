/**
 * The mat layer — finish texture and vignette.
 *
 * Redrawn only when the finish setting or the viewport changes (§03). The
 * four finishes ship as a setting; Felt is the default dark ground the light
 * thesis is designed against, Linen is the light-mode surface for bright rooms
 * and low vision (brief §5, §11).
 */

import type { MatFinish } from './scene';

export interface MatPalette {
  void: string;
  felt: string;
  raised: string;
  hair: string;
  /** True when the surface is light, so ink and shadows must invert. */
  light: boolean;
}

/** Surface tokens per finish. Only these four tokens change (§13). */
export const MAT_PALETTES: Record<MatFinish, MatPalette> = {
  felt: { void: '#0B0D10', felt: '#15181D', raised: '#1E232A', hair: '#2C333C', light: false },
  linen: { void: '#D9D4C9', felt: '#E8E4DC', raised: '#F2EFE9', hair: '#C6BFB1', light: true },
  walnut: { void: '#1A1310', felt: '#2A1E18', raised: '#382820', hair: '#4A362B', light: false },
  slate: { void: '#0E1114', felt: '#1B2026', raised: '#252C34', hair: '#38424C', light: false },
};

/**
 * Paint the mat.
 *
 * Deliberately plain: a flat ground, a soft radial vignette, and a fine grain.
 * The photo owns the colour in this app, so the surround stays a quiet gallery
 * wall (brief §5).
 */
export function drawMat(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  finish: MatFinish,
): void {
  const palette = MAT_PALETTES[finish];

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = palette.felt;
  ctx.fillRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.hypot(width, height) / 2;

  const vignette = ctx.createRadialGradient(cx, cy, radius * 0.25, cx, cy, radius);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, palette.light ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  drawGrain(ctx, width, height, palette.light ? 0.02 : 0.035);
}

/**
 * A fixed-pattern grain.
 *
 * Deterministic rather than random so the mat does not shimmer when it is
 * repainted on resize — the mat must read as a still surface, and any frame-to
 * -frame change in it would be visible against how little else moves.
 */
function drawGrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  alpha: number,
): void {
  const cell = 3;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ffffff';
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) {
      // Cheap deterministic hash of the cell position.
      const n = ((x * 73856093) ^ (y * 19349663)) >>> 0;
      if ((n & 7) === 0) ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.restore();
}
