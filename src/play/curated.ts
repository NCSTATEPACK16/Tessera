/**
 * The bundled curated-photo set for the picker (step 5a).
 *
 * Procedurally drawn rather than real image files — see the plan note in
 * docs/superpowers/plans/2026-08-01-step-5a-photo-picker-crop.md, Task 2, for
 * why. `CURATED_PHOTOS` and `curatedPhotoById` are pure and tested;
 * `renderCuratedPhoto` touches `OffscreenCanvas` and is judged by hand, the
 * same category `CLAUDE.md`'s testing posture puts `renderer.ts` in.
 */

import { CURATED_PHOTOS } from './curated-manifest';

export type CuratedShelf = 'wide-and-calm' | 'dense-and-busy' | 'one-animal-close';

/**
 * §15: "Each entry needs licence and attribution stored alongside it, surfaced
 * quietly on the completion card." `validateManifest` is what makes that a
 * build failure rather than a blank line on a card nobody notices.
 */
export interface CuratedLicence {
  name: string;
  attribution: string;
  sourceUrl: string;
}

export interface CuratedPhoto {
  id: string;
  name: string;
  /** §15: "browse by feeling, not folder" — a mood for the next forty minutes. */
  shelf: CuratedShelf;
  width: number;
  height: number;
  /** Basename under `assets/curated/`. */
  file: string;
  licence: CuratedLicence;
  /** Precomputed at build time, OKLab-derived. Drives nothing yet; §15 wants it ready. */
  dominant: readonly string[];
  /**
   * §15's cuttability rule: over ~25% near-uniform area is tagged 'hard' and
   * capped at 150, "a badge of honour rather than a bad surprise" — never
   * rejected outright.
   */
  difficulty: 'easy' | 'standard' | 'hard';
  recommendedCounts: readonly number[];
}

export { CURATED_PHOTOS };

export function curatedPhotoById(id: string): CuratedPhoto | undefined {
  return CURATED_PHOTOS.find((photo) => photo.id === id);
}

export function photosByShelf(shelf: CuratedShelf): readonly CuratedPhoto[] {
  return CURATED_PHOTOS.filter((photo) => photo.shelf === shelf);
}

/** Human-readable problems, empty when the manifest is shippable. */
export function validateManifest(photos: readonly CuratedPhoto[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const photo of photos) {
    if (seen.has(photo.id)) problems.push(`${photo.id}: duplicate id`);
    seen.add(photo.id);
    if (!photo.licence.name) problems.push(`${photo.id}: licence.name is empty`);
    if (!photo.licence.attribution) problems.push(`${photo.id}: licence.attribution is empty`);
    if (!photo.licence.sourceUrl) problems.push(`${photo.id}: licence.sourceUrl is empty`);
    if (!photo.file) problems.push(`${photo.id}: file is empty`);
    if (photo.width <= 0 || photo.height <= 0) {
      problems.push(`${photo.id}: width and height must be positive`);
    }
  }
  return problems;
}

/** One deterministic scene per id, distinct enough to tell apart in a thumbnail grid. */
function drawScene(ctx: OffscreenCanvasRenderingContext2D, id: string, w: number, h: number): void {
  const palettes: Record<string, [string, string, string]> = {
    'aurora-ridge': ['#0b1d3a', '#1f6f6f', '#8fe3c7'],
    'harbor-grid': ['#0d1b2a', '#3d6b8c', '#e8c07d'],
    'canyon-light': ['#3a1d0b', '#a85c32', '#f2c879'],
    'orchard-rows': ['#12240f', '#3f6b2f', '#c7e08f'],
    'tide-pools': ['#001f2b', '#0f6b7a', '#bfe9e6'],
    'glacier-blue': ['#0a1f33', '#3c7fa8', '#dff3ff'],
  };
  const [a, b, c] = palettes[id] ?? ['#101418', '#3a4552', '#c8d2dc'];

  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, a);
  gradient.addColorStop(0.55, b);
  gradient.addColorStop(1, c);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  // A few soft bands so the "photo" has some internal structure for a cut
  // preview to look like it's cutting something, not a flat swatch.
  const bandCount = 5;
  for (let i = 0; i < bandCount; i++) {
    const y = (h / bandCount) * i + (h / bandCount) * 0.5;
    ctx.strokeStyle = `rgba(255,255,255,${0.05 + i * 0.02})`;
    ctx.lineWidth = h * 0.03;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(w * 0.33, y - h * 0.06, w * 0.66, y + h * 0.06, w, y);
    ctx.stroke();
  }
}

export async function renderCuratedPhoto(id: string): Promise<ImageBitmap> {
  const photo = curatedPhotoById(id);
  if (!photo) throw new Error(`renderCuratedPhoto: unknown curated photo id "${id}"`);

  const canvas = new OffscreenCanvas(photo.width, photo.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('renderCuratedPhoto: no 2d context');

  drawScene(ctx, id, photo.width, photo.height);
  return canvas.transferToImageBitmap();
}
