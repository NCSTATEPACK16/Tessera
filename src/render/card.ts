/**
 * The Puzzle Card (§11 wireframe 05, §15's attribution requirement).
 *
 * The image is the *completed board canvas*, not the source photo.
 * `captureThumbnail` already performs exactly this capture for library cards,
 * and §11 says "the photo, fully lit" — the lit assembled board is that,
 * seams and all. Composing from the source would print a stock image instead
 * of the thing the player just made.
 *
 * Canvas work, judged by hand. Every position comes from `layoutCard`, which
 * is tested; this file only draws.
 */
import { layoutCard, type CardMeta } from '@/play/card';

const CARD_WIDTH = 1200;

export async function composeCard(
  board: HTMLCanvasElement | OffscreenCanvas,
  meta: CardMeta,
  targetWidth: number = CARD_WIDTH,
): Promise<Blob> {
  const layout = layoutCard(board.width / board.height, meta, targetWidth);
  const canvas = new OffscreenCanvas(layout.width, layout.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('composeCard: 2d context unavailable');

  // §13's --mat-raised: the card is a raised surface, not the void.
  ctx.fillStyle = '#1E232A';
  ctx.fillRect(0, 0, layout.width, layout.height);

  ctx.drawImage(board, layout.photo.x, layout.photo.y, layout.photo.w, layout.photo.h);

  // §13: the display serif "earns its keep here and nowhere else on this
  // screen." Loaded in index.html since step 5 for exactly this moment.
  ctx.fillStyle = '#EDF0F4';
  ctx.textBaseline = 'top';
  ctx.font = `${layout.title.size}px "Instrument Serif", serif`;
  ctx.fillText(layout.title.text, layout.title.x, layout.title.y);

  // Times and counts in tnum mono, so nothing shifts width.
  for (const stat of layout.stats) {
    ctx.fillStyle = '#8A929E';
    ctx.font = `${stat.size}px "IBM Plex Mono", monospace`;
    ctx.fillText(stat.text, stat.x, stat.y);
  }

  if (layout.badge) {
    // A clean run is a badge *and* a word — colour is never the only signal.
    ctx.strokeStyle = '#8A929E';
    ctx.lineWidth = 1;
    ctx.strokeRect(layout.badge.x, layout.badge.y, layout.badge.w, layout.badge.h);
    ctx.fillStyle = '#EDF0F4';
    ctx.font = '16px "Inter Tight", system-ui, sans-serif';
    ctx.fillText('clean run', layout.badge.x + 12, layout.badge.y + 8);
  }

  if (layout.attribution) {
    // §15: "surfaced quietly on the completion card."
    ctx.fillStyle = '#8A929E';
    ctx.font = `${layout.attribution.size}px "Inter Tight", system-ui, sans-serif`;
    ctx.fillText(layout.attribution.text, layout.attribution.x, layout.attribution.y);
  }

  return canvas.convertToBlob({ type: 'image/png' });
}
