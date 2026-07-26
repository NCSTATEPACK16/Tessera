/**
 * Scatter loose pieces onto the mat margin.
 *
 * Seeded, so a given puzzle always opens looking the same — the board a player
 * returns to after a coffee break should be the board they left, and that
 * starts with the initial scatter being reproducible rather than random.
 */

import { rngFor } from '@/core/rng';
import type { CutPiece, PieceId } from '@/cut/types';

export interface ScatterOptions {
  seed: number;
  boardW: number;
  boardH: number;
  /** Mat margin around the board, in world units. */
  margin?: number;
}

export interface ScatterPosition {
  id: PieceId;
  /** Bitmap origin in world units. */
  x: number;
  y: number;
}

/**
 * Place pieces in a ring around the board, biased away from the board itself so
 * the assembled area stays readable from the first second.
 */
export function scatterPieces(
  pieces: readonly CutPiece[],
  options: ScatterOptions,
): ScatterPosition[] {
  const { seed, boardW, boardH } = options;
  /**
   * Kept tight enough that the whole scatter still fits inside the 0.5× zoom
   * floor. A wider ring looks generous and means the opening view is a zoom the
   * player can never get back to once they have zoomed in.
   */
  const margin = options.margin ?? Math.max(boardW, boardH) * 0.25;

  return pieces.map((piece) => {
    const rng = rngFor(seed, 'scatter', piece.id);

    // Pick a side, then a position along it, then a depth into the margin.
    const side = Math.floor(rng.next() * 4);
    const along = rng.next();
    const depth = 0.12 + rng.next() * 0.88;

    let x: number;
    let y: number;
    switch (side) {
      case 0: // above
        x = -margin * 0.5 + along * (boardW + margin);
        y = -margin * depth - piece.worldH;
        break;
      case 1: // right
        x = boardW + margin * depth;
        y = -margin * 0.5 + along * (boardH + margin);
        break;
      case 2: // below
        x = -margin * 0.5 + along * (boardW + margin);
        y = boardH + margin * depth;
        break;
      default: // left
        x = -margin * depth - piece.worldW;
        y = -margin * 0.5 + along * (boardH + margin);
        break;
    }

    return { id: piece.id, x, y };
  });
}
