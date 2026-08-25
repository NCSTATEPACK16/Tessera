/**
 * The pull-out arrangement (§06: "auto-arranged in a loose grid so they are
 * immediately workable").
 *
 * Pure and world-space. It is handed a **safe** rect — the viewport minus the
 * docked tray's width, or minus the sheet at its current detent — and never the
 * raw viewport. On a phone the sheet is a fixed overlay across the bottom of the
 * board canvas, so the canvas centre is underneath the tray: centring there
 * would deal every pulled-out piece behind the sheet, where a drop returns it to
 * the tray. That is the same trap `BoardPage.matPoint()` was written to avoid.
 *
 * The camera never moves as a result of this. Easing the camera toward a region
 * is §07 hint behaviour and belongs to step 4.
 */

import type { Point, Rect } from '@/core/geom';

/**
 * Piece-size multiples between grid origins.
 *
 * `loose` is the default and leaves visible air between pieces, so the
 * containing outline reads as a group rather than as a block. `tight` is the
 * floor: below 1.0 pieces would overlap, and a pile the player has to separate
 * is worse than a grid they have to pan to.
 */
export const PULL_OUT_SPACING = { loose: 1.15, tight: 1.02 };

/**
 * Bitmap-origin positions, in world units, for `n` pulled-out pieces.
 *
 * Row-major from the top-left of the block, and the block is centred on
 * `safe`. If `avoid` is given (the board frame's bounds) and the naive
 * centred block would overlap it, the block is nudged clear along whichever
 * axis has slack in `safe` — preferring the smaller shift. If no direction
 * has room, the naive placement is left unchanged: this is a nudge, not a
 * hard constraint (§06: "when there is room").
 */
export function gridLayout(
  n: number,
  pieceW: number,
  pieceH: number,
  safe: Rect,
  avoid: Rect | null = null,
): Point[] {
  if (n <= 0) return [];

  const columns = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / columns);

  const spacing = fittedSpacing(columns, rows, pieceW, pieceH, safe);
  const strideX = pieceW * spacing;
  const strideY = pieceH * spacing;

  // Measured across piece *centres*, so the block's own edges are half a piece
  // outside it — which is what makes the centring land where the eye expects.
  const spanX = (columns - 1) * strideX;
  const spanY = (rows - 1) * strideY;

  let firstX = safe.x + safe.w / 2 - spanX / 2 - pieceW / 2;
  let firstY = safe.y + safe.h / 2 - spanY / 2 - pieceH / 2;

  if (avoid) {
    const block: Rect = { x: firstX, y: firstY, w: spanX + pieceW, h: spanY + pieceH };
    const nudged = nudgeClear(block, avoid, safe);
    firstX = nudged.x;
    firstY = nudged.y;
  }

  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      x: firstX + (i % columns) * strideX,
      y: firstY + Math.floor(i / columns) * strideY,
    });
  }
  return out;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * The smallest single-axis shift that clears `block` of `avoid`, staying
 * inside `safe` — or `block`'s own origin, unchanged, if no direction fits.
 */
function nudgeClear(block: Rect, avoid: Rect, safe: Rect): Point {
  if (!rectsOverlap(block, avoid)) return { x: block.x, y: block.y };

  const shifts: { axis: 'x' | 'y'; delta: number }[] = [
    { axis: 'x', delta: avoid.x - (block.x + block.w) }, // clear to the left
    { axis: 'x', delta: avoid.x + avoid.w - block.x }, // clear to the right
    { axis: 'y', delta: avoid.y - (block.y + block.h) }, // clear upward
    { axis: 'y', delta: avoid.y + avoid.h - block.y }, // clear downward
  ];
  const candidates = shifts.filter((shift) => {
    const x = block.x + (shift.axis === 'x' ? shift.delta : 0);
    const y = block.y + (shift.axis === 'y' ? shift.delta : 0);
    return (
      x >= safe.x && x + block.w <= safe.x + safe.w && y >= safe.y && y + block.h <= safe.y + safe.h
    );
  });

  if (candidates.length === 0) return { x: block.x, y: block.y };

  const best = candidates.reduce((a, b) => (Math.abs(a.delta) < Math.abs(b.delta) ? a : b));
  return {
    x: block.x + (best.axis === 'x' ? best.delta : 0),
    y: block.y + (best.axis === 'y' ? best.delta : 0),
  };
}

/** Loose if the block fits, otherwise as loose as it can be, never below tight. */
function fittedSpacing(
  columns: number,
  rows: number,
  pieceW: number,
  pieceH: number,
  safe: Rect,
): number {
  const neededX = columns * pieceW;
  const neededY = rows * pieceH;
  if (neededX <= 0 || neededY <= 0) return PULL_OUT_SPACING.loose;

  const fits = Math.min(safe.w / neededX, safe.h / neededY);
  return Math.max(PULL_OUT_SPACING.tight, Math.min(PULL_OUT_SPACING.loose, fits));
}
