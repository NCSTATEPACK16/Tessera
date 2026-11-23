/**
 * The Today hero's scrim (modernize spec §4) — the one number that decides
 * whether the caption is readable on any photo.
 *
 * A flat 0.82 from the bottom of the copy block to the eyebrow's line, then a
 * 64px fade to clear, so the photo is untouched above the copy. Measured over a
 * pure white photo, the worst case: `--ink-secondary` holds 6.7:1, while
 * `--ink-muted` would be 3.9:1 — which is why muted ink never goes on the hero.
 * 0.70 would leave the eyebrow at 4.25:1, under AA. `test/ui/scrim.test.ts`
 * checks both sides of the constant.
 *
 * DOM-free, so it is tested in node; `Today.tsx` only reads
 * `heroScrimBackground()`.
 */

import { contrastRatio } from '@/render/accent';

type Rgb = readonly [number, number, number];

export const HERO_SCRIM_RGB: Rgb = [8, 9, 11];
export const HERO_SCRIM_ALPHA = 0.82;
/** The fade above the eyebrow line, in CSS px. */
export const HERO_SCRIM_FADE_PX = 64;

export function heroScrimBackground(): string {
  const [r, g, b] = HERO_SCRIM_RGB;
  const solid = `rgb(${r} ${g} ${b} / ${HERO_SCRIM_ALPHA})`;
  const clear = `rgb(${r} ${g} ${b} / 0)`;
  return `linear-gradient(to top, ${solid} 0, ${solid} calc(100% - ${HERO_SCRIM_FADE_PX}px), ${clear} 100%)`;
}

/** Contrast of `ink` against the scrim composited over pure white. */
export function scrimContrastOverWhite(ink: Rgb, alpha = HERO_SCRIM_ALPHA): number {
  const under = HERO_SCRIM_RGB.map((c) => 255 * (1 - alpha) + c * alpha) as unknown as Rgb;
  return contrastRatio(ink, under);
}
