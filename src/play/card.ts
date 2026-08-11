/**
 * The Puzzle Card's layout maths (§11 wireframe 05).
 *
 * Pure and DOM-free, so it is tested — the same `cutter.ts`/`cutter.worker.ts`
 * and `light.ts`/`renderer.ts` split the rest of the codebase uses: every
 * position lives here and is asserted; `src/render/card.ts` only draws the
 * boxes this returns.
 *
 * Nothing off §13's scales ships. Spacing is `4 8 12 16 24 40 64`; type is
 * `12 14 16 20 28 40 64`. The card's height is *derived from the photo's*, so a
 * portrait photo yields a taller card rather than a cropped one — §11 says the
 * card follows the image.
 */

import type { PuzzleMode } from '@/play/setup';

export interface CardMeta {
  title: string;
  elapsedMs: number;
  pieceCount: number;
  mode: PuzzleMode;
  cleanRun: boolean;
  /** null for an uploaded photo — there is nothing to credit. */
  attribution: string | null;
}

export interface CardRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** `w`/`h` are the drawn extent; the renderer sets `ctx.font` from `size`. */
export interface CardTextBox {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  size: number;
}

export interface CardLayout {
  width: number;
  height: number;
  photo: CardRect;
  title: CardTextBox;
  stats: CardTextBox[];
  badge: CardRect | null;
  attribution: CardTextBox | null;
}

// §13 spacing scale.
const SPACE_2 = 8;
const SPACE_4 = 16;
const SPACE_5 = 24;
const SPACE_6 = 40;
// §13 type scale.
const TYPE_TITLE = 40; // --text-6, the display serif — earns its keep here only.
const TYPE_STAT = 16; // --text-3, the data mono.
const TYPE_ATTRIBUTION = 12; // --text-1, --ink-muted.

// A mono glyph advances ~0.6em; the data row is IBM Plex Mono, so this predicts
// its drawn width closely enough to keep the boxes honest without measuring.
const MONO_ADVANCE = 0.6;
// Line box for a top-baseline draw: enough to clear descenders at any size.
const lineHeight = (size: number): number => Math.round(size * 1.3);

/** `"18:42"`, growing to `"1:04:11"` past an hour. Floors — a card must never
 * claim a time not reached. */
export function formatElapsed(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const pad = (n: number): string => String(n).padStart(2, '0');
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function layoutCard(photoAspect: number, meta: CardMeta, targetWidth: number): CardLayout {
  const pad = SPACE_6;
  const width = targetWidth;
  const contentW = width - 2 * pad;

  // The photo fills the content width at its own aspect (W/H), never cropped.
  const photo: CardRect = {
    x: pad,
    y: pad,
    w: contentW,
    h: contentW / photoAspect,
  };

  let cursorY = photo.y + photo.h + SPACE_5;

  const title: CardTextBox = {
    x: pad,
    y: cursorY,
    w: contentW,
    h: lineHeight(TYPE_TITLE),
    text: meta.title,
    size: TYPE_TITLE,
  };
  cursorY = title.y + title.h + SPACE_4;

  // The data row, in order (§11 wireframe 05): time, count, mode. Laid left to
  // right on one line, separated by a fixed gap.
  const statTexts = [formatElapsed(meta.elapsedMs), `${meta.pieceCount} pieces`, meta.mode];
  const stats: CardTextBox[] = [];
  let statX = pad;
  for (const text of statTexts) {
    const w = Math.ceil(text.length * TYPE_STAT * MONO_ADVANCE);
    stats.push({ x: statX, y: cursorY, w, h: lineHeight(TYPE_STAT), text, size: TYPE_STAT });
    statX += w + SPACE_5;
  }
  cursorY += lineHeight(TYPE_STAT) + SPACE_4;

  // A clean run is a badge *and* a word — colour is never the only signal
  // (§13). The word "clean run" is drawn inside it by the renderer.
  const badge: CardRect | null = meta.cleanRun
    ? { x: pad, y: cursorY, w: 132, h: TYPE_STAT + 2 * SPACE_2 }
    : null;
  if (badge) cursorY = badge.y + badge.h + SPACE_4;

  // §15: attribution, surfaced quietly. Absent for an upload.
  const attribution: CardTextBox | null =
    meta.attribution === null
      ? null
      : {
          x: pad,
          y: cursorY,
          w: contentW,
          h: lineHeight(TYPE_ATTRIBUTION),
          text: meta.attribution,
          size: TYPE_ATTRIBUTION,
        };
  if (attribution) cursorY = attribution.y + attribution.h;

  const height = cursorY + pad;
  return { width, height, photo, title, stats, badge, attribution };
}
