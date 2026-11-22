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

import type { Point, Rect, Size } from '@/core/geom';
import type { Rng } from '@/core/rng';

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

/**
 * The drag boundary's margin, in piece widths each side of the board frame —
 * CLAUDE.md's hard number, `clamp(sqrt(pieces) x 0.8, 4, 18)`. The session's
 * `dragBounds` and the first-run scatter both read it here, so a piece is never
 * dealt where the player could not have dragged it.
 */
export function dragMargin(pieceCount: number): number {
  return Math.min(18, Math.max(4, Math.sqrt(pieceCount) * 0.8));
}

/** Pitch between the guided twelve's scattered origins, in piece widths. */
const FIRST_RUN_PITCH = 1.35;
/** Gap between the board's bottom edge and the first scattered row. */
const FIRST_RUN_GAP = 0.8;
const FIRST_RUN_JITTER = 0.15;
/**
 * A piece bitmap's extent in world units: one cell plus a knob's 0.22
 * protrusion either side (§04). Used only to estimate the band's bounds when
 * choosing a row length.
 */
export const FIRST_RUN_PIECE_EXTENT = 1.44;

/**
 * Bitmap origins for the guided twelve's loose band (§16), one per piece, in
 * input order — below the board, every row (the last included) centred under
 * it.
 *
 * The row length is chosen for the viewport: whichever length, from three
 * across up to all in one row, lets board-plus-band fit at the largest zoom.
 * A portrait phone gets a narrow stack, a desktop window a wide band. It used
 * to be left-anchored and `sqrt(n × 1.6)` across regardless, which on a 402pt
 * phone made the content wider than the zoom floor allows and pushed the board
 * frame off the left edge (modernize spec §7); a fixed board-width wrap fixed
 * the phone and made a 3 × 4 board's band too tall for a 900px desktop window.
 * Ties go to the shorter row, and no row is wider than the drag boundary
 * (`dragMargin`). Jitter draws x then y per piece, as before.
 *
 * Known limit: on a portrait phone the 3-across stack's last row reaches below
 * the drag boundary (y ≈ 10.3 against 8 for a 3 × 4 board). A row long enough
 * to stay inside it would be wider than the phone's zoom floor allows — the
 * original clip. The player can still drag those pieces up, toward the board;
 * only further down is refused. Fixing both needs a pitch or margin change,
 * which is the owner's call.
 */
export function firstRunScatter(
  count: number,
  boardW: number,
  boardH: number,
  viewport: Size,
  rng: Rng,
): Point[] {
  const perRow = bestRowLength(count, boardW, boardH, viewport);
  const origins: Point[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, count - row * perRow);
    const span = (inRow - 1) * FIRST_RUN_PITCH + 1;
    const left = boardW / 2 - span / 2;
    origins.push({
      x: left + (i % perRow) * FIRST_RUN_PITCH + rng.range(-FIRST_RUN_JITTER, FIRST_RUN_JITTER),
      y:
        boardH +
        FIRST_RUN_GAP +
        row * FIRST_RUN_PITCH +
        rng.range(-FIRST_RUN_JITTER, FIRST_RUN_JITTER),
    });
  }
  return origins;
}

function bestRowLength(count: number, boardW: number, boardH: number, viewport: Size): number {
  const shortest = Math.min(count, 3);
  let best = shortest;
  let bestScale = -Infinity;
  const widest = boardW + dragMargin(count) * 2;
  for (let perRow = shortest; perRow <= Math.max(shortest, count); perRow++) {
    const rows = Math.ceil(count / perRow);
    const bandW = (perRow - 1) * FIRST_RUN_PITCH + FIRST_RUN_PIECE_EXTENT;
    // Never wider than the drag boundary: a piece dealt outside it is one the
    // player could not drag outward. The shortest row is always allowed.
    if (perRow > shortest && bandW > widest) break;
    const w = Math.max(boardW, bandW);
    const h = boardH + FIRST_RUN_GAP + (rows - 1) * FIRST_RUN_PITCH + FIRST_RUN_PIECE_EXTENT;
    const scale = Math.min(viewport.w / w, viewport.h / h);
    if (scale > bestScale) {
      bestScale = scale;
      best = perRow;
    }
  }
  return best;
}
