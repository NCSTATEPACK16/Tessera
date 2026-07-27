/**
 * The scene contract.
 *
 * A scene is plain data describing what should be on screen — never objects
 * with draw methods. That is what keeps a WebGL backend droppable behind the
 * same `draw(scene, camera)` interface the day 1000-piece boards ship (§03),
 * and it means the renderer can be reasoned about without a canvas.
 */

import type { CubicPath, Rect } from '@/core/geom';

export type MatFinish = 'felt' | 'linen' | 'walnut' | 'slate';

/** One drawable piece, positioned in world units. */
export interface ScenePiece {
  id: number;
  /** Bitmap origin in world space. */
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  bitmap: ImageBitmap;
  /** Outline in bitmap-local *image* pixels, for hit testing. */
  path: CubicPath;
  /**
   * Image pixels per world unit — the scale `path` is expressed in.
   *
   * Not the device pixel ratio, and not the bitmap's own resolution. It was
   * called `bitmapScale` once and the ambiguity cost an afternoon: passing the
   * DPR here makes every hit-test polygon tens of times too large and offset
   * clean off the piece it describes, so nothing on the board can be picked up
   * and nothing anywhere reports an error.
   */
  pathScale: number;
}

/**
 * A group drawn on the mat — §05's island, or §06's pull-out Workset.
 *
 * **Both kinds render identically**, deliberately. The model has two objects
 * because a pull-out group's internal offsets are wrong by construction and must
 * never reach the union-find; the player has one concept, and this is where that
 * stays true.
 */
export interface SceneGroup {
  id: number;
  label: string;
  collapsed: boolean;
  /** World units. The members' bounding box, or the chip's box when collapsed. */
  bounds: Rect;
  kind: 'workset' | 'island';
}

export interface Scene {
  finish: MatFinish;
  /** Board extent in world units. */
  boardW: number;
  boardH: number;

  /** Pieces merged into cluster 0. Redrawn only when this set changes. */
  placed: ScenePiece[];
  /** Loose pieces and islands. Redrawn every active frame. */
  loose: ScenePiece[];
  /** Containing outlines and label chips. Drawn with the dynamic layer. */
  groups: SceneGroup[];
  /** The cluster currently in hand, drawn above everything with its lift. */
  held: ScenePiece[];
  /**
   * The lift applied to `held` (§05): 8pt above the finger, never under it, and
   * 1.06 larger.
   *
   * Stated in *screen* pixels and divided by zoom at draw time, deliberately.
   * Baked into world units it would grow as the player zoomed in, and the lift
   * is a property of the hand rather than of the mat.
   */
  heldLift: { offsetPx: number; scale: number };

  /** 0–1. Drives the progress bloom (§07). */
  completion: number;
}

export function emptyScene(finish: MatFinish = 'felt'): Scene {
  return {
    finish,
    boardW: 0,
    boardH: 0,
    placed: [],
    loose: [],
    groups: [],
    held: [],
    heldLift: { offsetPx: 8, scale: 1.06 },
    completion: 0,
  };
}
