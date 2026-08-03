/**
 * The bundled curated-photo set for the picker (step 5a).
 *
 * Procedurally drawn rather than real image files — see the plan note in
 * docs/superpowers/plans/2026-08-01-step-5a-photo-picker-crop.md, Task 2, for
 * why. `CURATED_PHOTOS` and `curatedPhotoById` are pure and tested;
 * `renderCuratedPhoto` touches `OffscreenCanvas` and is judged by hand, the
 * same category `CLAUDE.md`'s testing posture puts `renderer.ts` in.
 */

export interface CuratedPhoto {
  id: string;
  name: string;
  width: number;
  height: number;
}

export const CURATED_PHOTOS: CuratedPhoto[] = [
  { id: 'aurora-ridge', name: 'Aurora Ridge', width: 2400, height: 1600 },
  { id: 'harbor-grid', name: 'Harbor Grid', width: 2400, height: 1600 },
  { id: 'canyon-light', name: 'Canyon Light', width: 1600, height: 2400 },
  { id: 'orchard-rows', name: 'Orchard Rows', width: 2400, height: 1800 },
  { id: 'tide-pools', name: 'Tide Pools', width: 2400, height: 1800 },
  { id: 'glacier-blue', name: 'Glacier Blue', width: 2000, height: 2000 },
];

export function curatedPhotoById(id: string): CuratedPhoto | undefined {
  return CURATED_PHOTOS.find((photo) => photo.id === id);
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
