/**
 * Puzzle setup math (step 5b) — pure, DOM-free, same standard as
 * `src/play/photo.ts` and `src/cut/grid.ts`.
 */

import { chooseGrid } from '@/cut/grid';
import { fitScale } from '@/render/camera';
import type { SnapDifficulty } from '@/board/snap';

export const PIECE_COUNT_LADDER = [50, 100, 150, 200, 250] as const;
export type PieceCount = (typeof PIECE_COUNT_LADDER)[number];

/**
 * The next rung up, or null once already at (or past) the top of the ladder —
 * what "puzzle this again, harder" offers.
 *
 * Defensive about off-ladder input: it works off the *target* count a puzzle
 * was configured with, which is always one of the five, but §04's "show the
 * real computed number" means a realised `cols × rows` could reach here by
 * mistake, and returning the first rung above it is the sane answer.
 */
export function nextHarderCount(current: number): number | null {
  for (const count of PIECE_COUNT_LADDER) {
    if (count > current) return count;
  }
  return null;
}

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

/**
 * The narrowest a piece may be *in source pixels* before it starts to look
 * soft on screen.
 *
 * Chosen, not measured — flagged the way `hints.ts` flags its escalation
 * thresholds. The reasoning: a piece is displayed at roughly its fitted screen
 * width, and below ~64 source pixels a piece rasterised at `min(dpr, 2)` is
 * being upscaled on any modern display, which reads as mush along the cut
 * edges where the eye is actually looking. Revisit on hardware.
 */
export const MIN_PIECE_IMAGE_PX = 64;

/**
 * Whether this photo is too small for this piece count to look sharp.
 *
 * "Too small" is a property of the photo *and* the count together, never of
 * the photo alone — the same picture that is mush at 250 pieces is fine at 50.
 * The caller warns; it must never block. A player who wants a soft 250-piece
 * puzzle of a treasured low-resolution photo is allowed to have one.
 */
export function isLowResForCount(photo: PhotoSize, targetCount: number): boolean {
  const grid = chooseGrid({
    imageWidth: photo.width,
    imageHeight: photo.height,
    targetCount,
  });
  return grid.cellW < MIN_PIECE_IMAGE_PX;
}

export type PuzzleMode = 'classic' | 'zen';

export interface PuzzleAssists {
  ghostOpacity: number;
  edgeHighlight: boolean;
  largePieceMode: boolean;
  /** §C Track 3: one flag, read by the lift, the snap floor, tremor damping, and 60pt targets. */
  comfort: boolean;
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
    comfort: false,
  },
};

/**
 * Comfort mode floors snap tolerance at Generous — the widest band, never the
 * player's own choice of a tighter one. `generous` is already the floor for
 * itself; nothing below it exists on the ladder.
 */
export function floorDifficulty(difficulty: SnapDifficulty, comfort: boolean): SnapDifficulty {
  return comfort ? 'generous' : difficulty;
}
