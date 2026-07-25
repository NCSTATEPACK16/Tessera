/**
 * The scene contract.
 *
 * A scene is plain data describing what should be on screen — never objects
 * with draw methods. That is what keeps a WebGL backend droppable behind the
 * same `draw(scene, camera)` interface the day 1000-piece boards ship (§03),
 * and it means the renderer can be reasoned about without a canvas.
 */

import type { CubicPath } from '@/core/geom';

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
  /** Outline in bitmap-local pixels, for hit testing. */
  path: CubicPath;
  /** Pixels per world unit the bitmap was rasterised at. */
  bitmapScale: number;
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
  /** The cluster currently in hand, drawn above everything with its lift. */
  held: ScenePiece[];

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
    held: [],
    completion: 0,
  };
}
