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

/**
 * Vite resolves every file under `assets/curated/` to its hashed build URL at
 * build time. `eager: false` so a picker showing thirty thumbnails does not
 * decode thirty full-size photos — only the chosen one is fetched.
 */
const FILES = import.meta.glob<{ default: string }>('../../assets/curated/*.jpg');

export async function renderCuratedPhoto(id: string): Promise<ImageBitmap> {
  const photo = curatedPhotoById(id);
  if (!photo) throw new Error(`renderCuratedPhoto: unknown curated photo id "${id}"`);

  const loader = FILES[`../../assets/curated/${photo.file}`];
  if (!loader) throw new Error(`renderCuratedPhoto: missing asset for "${id}"`);

  const url = (await loader()).default;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`renderCuratedPhoto: fetch failed for "${id}"`);
  // `createImageBitmap` from a Blob honours EXIF orientation by default in
  // Safari and Chromium; these files are pre-rotated at import anyway.
  return createImageBitmap(await response.blob());
}
