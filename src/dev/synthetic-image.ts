/**
 * A synthetic cut-validation target.
 *
 * A photo hides cut bugs — a misaligned tab across two areas of similar foliage
 * is invisible. This image is built to expose them:
 *
 *   numbered cells    a piece drawn in the wrong place is obvious at a glance
 *   hue sweep in x    gives the Colour lens something real to bin at step 3
 *   value sweep in y  separates bins that hue alone would collapse
 *   1px hairline grid seam gaps and tab misalignment show up immediately
 *
 * Dev-only. Deleted or ignored the moment a real photo pipeline exists.
 */

export interface SyntheticImageOptions {
  width?: number;
  height?: number;
  /** Hairline cells across. Deliberately unrelated to the puzzle grid. */
  cellsX?: number;
  cellsY?: number;
}

export async function createSyntheticImage(
  options: SyntheticImageOptions = {},
): Promise<ImageBitmap> {
  const { width = 1920, height = 1280, cellsX = 12, cellsY = 8 } = options;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('createSyntheticImage: no 2d context');

  const cellW = width / cellsX;
  const cellH = height / cellsY;

  for (let y = 0; y < cellsY; y++) {
    for (let x = 0; x < cellsX; x++) {
      const hue = (x / cellsX) * 360;
      // Kept off the extremes so no cell is pure black or pure white — the mean
      // colour of every piece has to remain meaningful.
      const lightness = 68 - (y / Math.max(1, cellsY - 1)) * 40;
      ctx.fillStyle = `hsl(${hue} 62% ${lightness}%)`;
      ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
    }
  }

  // Hairline grid.
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= cellsX; x++) {
    ctx.moveTo(Math.round(x * cellW) + 0.5, 0);
    ctx.lineTo(Math.round(x * cellW) + 0.5, height);
  }
  for (let y = 0; y <= cellsY; y++) {
    ctx.moveTo(0, Math.round(y * cellH) + 0.5);
    ctx.lineTo(width, Math.round(y * cellH) + 0.5);
  }
  ctx.stroke();

  // Cell numbers.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(Math.min(cellW, cellH) * 0.34)}px "IBM Plex Mono", ui-monospace, monospace`;
  for (let y = 0; y < cellsY; y++) {
    for (let x = 0; x < cellsX; x++) {
      const label = String(y * cellsX + x + 1).padStart(2, '0');
      const cx = (x + 0.5) * cellW;
      const cy = (y + 0.5) * cellH;
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.fillText(label, cx + 2, cy + 2);
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.fillText(label, cx, cy);
    }
  }

  // Corner ticks, so board orientation is unambiguous when zoomed in.
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 6;
  const tick = Math.min(width, height) * 0.06;
  ctx.beginPath();
  ctx.moveTo(0, tick);
  ctx.lineTo(0, 0);
  ctx.lineTo(tick, 0);
  ctx.stroke();

  return canvas.transferToImageBitmap();
}
