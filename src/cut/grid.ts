/**
 * Step 1 of the cut — choose the grid (design doc §04).
 *
 * Piece counts are targets, never promises. The grid is derived from the image
 * aspect so pieces stay near-square, and the *real* number is what gets shown
 * everywhere in the UI.
 */

/** Piece aspect outside this band is rejected outright. */
export const MIN_PIECE_ASPECT = 0.82;
export const MAX_PIECE_ASPECT = 1.22;

/** How far either side of the seed guess to search. */
const SEARCH_RADIUS = 2;

/**
 * Relative weights of the two error terms.
 *
 * Equal weighting reproduces the worked example in §04 — a 3:2 photo at a
 * target of 200 lands on 17 × 12 = 204 — with clear margin over its neighbours.
 * The hard aspect rejection above is what actually guarantees square-ish
 * pieces, so these only break ties among already-acceptable grids.
 */
const WEIGHT_COUNT_ERROR = 1;
const WEIGHT_ASPECT_ERROR = 1;

export interface Grid {
  cols: number;
  rows: number;
  /** cols × rows. This is the number the player is shown. */
  count: number;
  /** Width of one cell in image pixels. */
  cellW: number;
  /** Height of one cell in image pixels. */
  cellH: number;
  /** cellW / cellH. Guaranteed within the accepted band. */
  pieceAspect: number;
}

export interface ChooseGridOptions {
  imageWidth: number;
  imageHeight: number;
  targetCount: number;
}

/**
 * Pick the grid whose real piece count and piece aspect together deviate least.
 *
 * Starts at `cols = round(sqrt(N·a))`, `rows = round(N/cols)`, then searches ±2
 * in both directions, rejecting anything whose piece aspect falls outside the
 * accepted band.
 */
export function chooseGrid({ imageWidth, imageHeight, targetCount }: ChooseGridOptions): Grid {
  if (imageWidth <= 0 || imageHeight <= 0) {
    throw new Error('chooseGrid: image dimensions must be positive');
  }
  if (targetCount < 4) {
    throw new Error('chooseGrid: target count must be at least 4');
  }

  const aspect = imageWidth / imageHeight;
  const seedCols = Math.max(2, Math.round(Math.sqrt(targetCount * aspect)));
  const seedRows = Math.max(2, Math.round(targetCount / seedCols));

  let best: Grid | null = null;
  let bestScore = Infinity;
  // Tracked only so the failure path can say something useful.
  let closestRejectedAspect: number | null = null;

  for (let c = seedCols - SEARCH_RADIUS; c <= seedCols + SEARCH_RADIUS; c++) {
    if (c < 2) continue;
    for (let r = seedRows - SEARCH_RADIUS; r <= seedRows + SEARCH_RADIUS; r++) {
      if (r < 2) continue;

      const cellW = imageWidth / c;
      const cellH = imageHeight / r;
      const pieceAspect = cellW / cellH;

      if (pieceAspect < MIN_PIECE_ASPECT || pieceAspect > MAX_PIECE_ASPECT) {
        if (
          closestRejectedAspect === null ||
          Math.abs(pieceAspect - 1) < Math.abs(closestRejectedAspect - 1)
        ) {
          closestRejectedAspect = pieceAspect;
        }
        continue;
      }

      const count = c * r;
      const countError = Math.abs(count - targetCount) / targetCount;
      const aspectError = Math.abs(pieceAspect - 1);
      const score = WEIGHT_COUNT_ERROR * countError + WEIGHT_ASPECT_ERROR * aspectError;

      if (score < bestScore) {
        bestScore = score;
        best = { cols: c, rows: r, count, cellW, cellH, pieceAspect };
      }
    }
  }

  if (!best) {
    // Only reachable for extreme aspects (a panorama at a low count), where no
    // grid in the search window produces square-ish pieces. Widening the search
    // would not help; the caller needs to crop or raise the count.
    throw new Error(
      `chooseGrid: no grid within ±${SEARCH_RADIUS} of ${seedCols}×${seedRows} keeps piece aspect ` +
        `inside ${MIN_PIECE_ASPECT}–${MAX_PIECE_ASPECT} for a ${imageWidth}×${imageHeight} image ` +
        `at target ${targetCount}` +
        (closestRejectedAspect !== null
          ? ` (closest was ${closestRejectedAspect.toFixed(3)})`
          : ''),
    );
  }

  return best;
}
