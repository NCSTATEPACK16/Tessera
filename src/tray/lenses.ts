/**
 * The lenses (§06). **Filters, never sorts.**
 *
 * "The tray has one canonical order that never changes unless the player changes
 * it. Filters hide and reveal within that order; they do not reflow it. Turn a
 * filter off and every remaining piece is exactly where you left it."
 *
 * That is the whole design, and it has an exact machine-checkable form: **every
 * lens's output is a subsequence of the canonical order.** `visible` walks the
 * order once and keeps or drops — there is no comparator anywhere in this file,
 * and there must never be one. `test/tray/lenses.test.ts` asserts the
 * subsequence property across all six, which is the cheapest possible guard on
 * the thing §06 says every competitor gets wrong.
 *
 * Pure data in, ids out. No DOM, no session, no camera — the camera's
 * contribution is a world rectangle the caller computes with
 * `visibleWorldBounds`, so this file stays testable in a node environment.
 */

import type { PieceId } from '@/cut/types';
import type { Rect } from '@/core/geom';
import { MIXED_BIN } from './colour';

export type Lens = 'all' | 'edges' | 'corners' | 'colour' | 'region' | 'recent';

export const LENSES: readonly Lens[] = ['all', 'edges', 'corners', 'colour', 'region', 'recent'];

/**
 * Where a piece is. Placed is cluster 0 and nothing else (§05) — this type
 * describes the other two, which the board has no opinion about.
 */
export type PieceLocation = 'tray' | 'mat' | 'placed';

/** What a lens needs to know about a piece. A structural subset of `CutPiece`. */
export interface LensPiece {
  id: PieceId;
  location: PieceLocation;
  isEdge: boolean;
  isCorner: boolean;
  /** From `binByColour`. `MIXED_BIN` for the seventh bin. */
  colourBin: number;
  /** Where the piece belongs, in world units — the Region lens's whole basis. */
  targetX: number;
  targetY: number;
  worldW: number;
  worldH: number;
}

export interface LensView {
  /**
   * The visible world rectangle, or null when the Region lens is locked.
   *
   * Locked below 1.5× because below that the "region" is most of the board and
   * the lens filters nothing — offering it there would teach the player it does
   * not work.
   */
  region: Rect | null;
  /** Membership only. Recency is not an order here — see `recent.ts`. */
  recent: ReadonlySet<PieceId>;
}

/**
 * The pieces a lens reveals, in canonical order.
 *
 * Every lens except Recent shows tray residents only: a piece on the mat is
 * already in the player's hands spatially, and duplicating it as a chip would
 * make one piece look like two.
 */
export function visible(
  order: readonly PieceId[],
  pieces: ReadonlyMap<PieceId, LensPiece>,
  lens: Lens,
  arg: number | null,
  view: LensView,
): PieceId[] {
  const out: PieceId[] = [];

  for (const id of order) {
    const piece = pieces.get(id);
    if (!piece || piece.location === 'placed') continue;
    if (keeps(piece, lens, arg, view)) out.push(id);
  }

  return out;
}

function keeps(piece: LensPiece, lens: Lens, arg: number | null, view: LensView): boolean {
  // Recent is the one lens that reaches onto the mat — finding a piece you put
  // down and lost is the entire reason it exists.
  if (lens === 'recent') return view.recent.has(piece.id);
  if (piece.location !== 'tray') return false;

  switch (lens) {
    case 'all':
      return true;
    case 'edges':
      return piece.isEdge;
    case 'corners':
      return piece.isCorner;
    case 'colour':
      return arg === null ? true : piece.colourBin === arg;
    case 'region':
      return view.region !== null && intersects(piece, view.region);
  }
}

/**
 * Does the piece's *destination* fall inside the view?
 *
 * Its destination, never its current position: the Region lens answers "which of
 * my remaining pieces belong in what I am looking at", which is what makes 250
 * pieces tractable on a phone (§06).
 */
function intersects(piece: LensPiece, region: Rect): boolean {
  return (
    piece.targetX < region.x + region.w &&
    piece.targetX + piece.worldW > region.x &&
    piece.targetY < region.y + region.h &&
    piece.targetY + piece.worldH > region.y
  );
}

/**
 * Whether a lens has anything to offer right now.
 *
 * Region is gated on zoom. Colour's mixed bin only exists when some piece
 * actually straddles two things. A lens with no pieces behind it is still
 * offered — an empty Corners lens on a nearly-finished puzzle is information,
 * not a dead end.
 */
export function lensEnabled(lens: Lens, view: LensView): boolean {
  return lens === 'region' ? view.region !== null : true;
}

/** Bin ids a Colour lens argument may take, mixed included. */
export function isColourBin(value: number): boolean {
  return (value >= 0 && value < MIXED_BIN) || value === MIXED_BIN;
}
