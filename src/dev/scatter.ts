/**
 * Scatter loose pieces onto the mat margin.
 *
 * Seeded, so a given puzzle always opens looking the same — the board a player
 * returns to after a coffee break should be the board they left, and that
 * starts with the initial scatter being reproducible rather than random.
 */

import { rngFor } from '@/core/rng';
import type { CutPiece } from '@/cut/types';
import type { ScenePiece } from '@/render/scene';

export interface ScatterOptions {
  seed: number;
  boardW: number;
  boardH: number;
  /** Mat margin around the board, in world units. */
  margin?: number;
  /** Pixels per world unit the bitmaps were rasterised at. */
  bitmapScale: number;
}

/**
 * Place pieces in a ring around the board, biased away from the board itself so
 * the assembled area stays readable from the first second.
 */
export function scatterPieces(pieces: readonly CutPiece[], options: ScatterOptions): ScenePiece[] {
  const { seed, boardW, boardH, bitmapScale } = options;
  const margin = options.margin ?? Math.max(boardW, boardH) * 0.45;

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

    return {
      id: piece.id,
      x,
      y,
      w: piece.worldW,
      h: piece.worldH,
      rot: 0,
      bitmap: piece.bitmap,
      path: piece.path,
      bitmapScale,
    };
  });
}

/** The piece at its solved position — what "placed" looks like. */
export function solvedPiece(piece: CutPiece, bitmapScale: number): ScenePiece {
  return {
    id: piece.id,
    x: piece.targetX,
    y: piece.targetY,
    w: piece.worldW,
    h: piece.worldH,
    rot: 0,
    bitmap: piece.bitmap,
    path: piece.path,
    bitmapScale,
  };
}
