/**
 * The cut's output contract.
 *
 * "The output that actually matters is not the images, it is the adjacency
 * graph: for every piece, its four neighbour ids (or null), and its exact
 * target offset from each." (design doc §04, step 5)
 */

import type { CubicPath, Rect } from '@/core/geom';

/** Neighbour slots, in the order a piece's sides are walked. */
export const TOP = 0;
export const RIGHT = 1;
export const BOTTOM = 2;
export const LEFT = 3;

export type PieceId = number;

export interface NeighbourLink {
  /** The adjacent piece. */
  id: PieceId;
  /**
   * Where that neighbour's origin sits relative to this piece's origin, in
   * world units, when both are correctly placed.
   *
   * This is the number snap resolution actually uses. Snapping never asks "am I
   * near my correct absolute position on the board" — it asks "am I near where
   * a graph-neighbour says I should be", which is what makes free-floating
   * islands work identically to placing on the board frame, with no
   * special-case code.
   */
  dx: number;
  dy: number;
}

export interface CutPiece {
  id: PieceId;
  col: number;
  row: number;

  /**
   * Where this piece's bitmap origin belongs, in world units. Not the cell
   * origin — the bitmap is grown by the knob protrusions and the bleed, so this
   * is the top-left of the *bitmap*, which is what the renderer draws at.
   */
  targetX: number;
  targetY: number;

  /** Bitmap size in world units. */
  worldW: number;
  worldH: number;

  /** [top, right, bottom, left]; null where the piece meets the frame. */
  neighbours: (NeighbourLink | null)[];

  /** True when any side is a boundary — drives the Edges lens. */
  isEdge: boolean;
  /** True when two sides are boundaries — drives the Corners lens. */
  isCorner: boolean;

  /** Outline in bitmap-local pixels. Used for point-in-path hit testing. */
  path: CubicPath;
  /** The piece's own pixels, bevel already baked in. */
  bitmap: ImageBitmap;

  /**
   * Mean colour in sRGB 0–255, sampled inside the path at cut time. Feeds the
   * Colour lens's OKLab k-means at step 3, and computing it here means the tray
   * never has to touch pixel data.
   */
  meanColor: [number, number, number];
  /** Variance of piece colour, 0–1. High values go to the "mixed" bin. */
  colorVariance: number;
}

export interface CutGeometry {
  cols: number;
  rows: number;
  count: number;
  /** Image pixels per world unit. World unit = one piece width. */
  scale: number;
  /** Board extent in world units. */
  boardW: number;
  boardH: number;
  /** Bitmap bounds in image space, parallel to the piece list. */
  bounds: Rect[];
}

export interface CutResult {
  seed: number;
  cutStyle: string;
  geometry: CutGeometry;
  pieces: CutPiece[];
}

/** Progressive messages from the cutter worker. */
export type CutMessage =
  | {
      type: 'grid';
      cols: number;
      rows: number;
      count: number;
      boardW: number;
      boardH: number;
      /** Image pixels per world unit. Hit-testing needs it to read `path`. */
      scale: number;
    }
  | { type: 'pieces'; pieces: CutPiece[]; done: number; total: number }
  | { type: 'graph'; graph: (NeighbourLink | null)[][] }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface CutRequest {
  seed: number;
  targetCount: number;
  cutStyle: string;
  source: ImageBitmap;
  /** Device pixel ratio, already clamped by the caller. */
  pixelRatio: number;
}
