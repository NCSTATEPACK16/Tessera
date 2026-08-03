/**
 * Puzzle setup math (step 5b) — pure, DOM-free, same standard as
 * `src/play/photo.ts` and `src/cut/grid.ts`.
 */

import { chooseGrid } from '@/cut/grid';
import { fitScale } from '@/render/camera';
import type { SnapDifficulty } from '@/board/snap';

export const PIECE_COUNT_LADDER = [50, 100, 150, 200, 250] as const;
export type PieceCount = (typeof PIECE_COUNT_LADDER)[number];

export interface PhotoSize {
  width: number;
  height: number;
}

/** PLAN.md: "Ghost underlay 0–30%." */
export const GHOST_OPACITY_MAX = 0.3;

export function clampGhostOpacity(value: number): number {
  return Math.max(0, Math.min(GHOST_OPACITY_MAX, value));
}

/**
 * The real on-screen CSS pixel width one piece would render at, for this
 * device's viewport, this photo, and this candidate piece count.
 *
 * World unit = one piece width (CLAUDE.md's coordinate-space table), so the
 * fit scale `fitScale` returns *is* the piece's screen pixel width — no
 * further conversion, the same identity `cutter.ts` relies on for `boardW`/
 * `boardH`.
 */
export function pieceScreenSize(
  photo: PhotoSize,
  targetCount: number,
  viewport: { w: number; h: number },
): number {
  const grid = chooseGrid({
    imageWidth: photo.width,
    imageHeight: photo.height,
    targetCount,
  });
  const boardW = photo.width / grid.cellW;
  const boardH = photo.height / grid.cellW;
  return fitScale(viewport, boardW, boardH);
}

export type PuzzleMode = 'classic' | 'zen';

export interface PuzzleAssists {
  ghostOpacity: number;
  edgeHighlight: boolean;
  largePieceMode: boolean;
}

export interface PuzzleConfig {
  targetCount: number;
  mode: PuzzleMode;
  rotation: boolean;
  difficulty: SnapDifficulty;
  assists: PuzzleAssists;
}

export const DEFAULT_PUZZLE_CONFIG: PuzzleConfig = {
  targetCount: 150,
  mode: 'classic',
  rotation: false,
  difficulty: 'standard',
  assists: {
    ghostOpacity: 0,
    edgeHighlight: false,
    largePieceMode: false,
  },
};
