import { describe, expect, it } from 'vitest';
import { formatElapsed, layoutCard, type CardMeta } from '@/play/card';

const meta: CardMeta = {
  title: 'Harbour, June',
  elapsedMs: 18 * 60_000 + 42_000,
  pieceCount: 204,
  mode: 'classic',
  cleanRun: true,
  attribution: 'Photo: A. Example / Unsplash',
};

describe('formatElapsed', () => {
  // §13: --type-data is "IBM Plex Mono, tnum. Must not shift width as it
  // ticks." Zero-padding is what makes that true of the string itself.
  it('renders wireframe 05 verbatim', () => {
    expect(formatElapsed(18 * 60_000 + 42_000)).toBe('18:42');
  });

  it('pads seconds, so the glyph count never changes within an hour', () => {
    expect(formatElapsed(60_000 + 4_000)).toBe('01:04');
  });

  it('grows to hours only when it must', () => {
    expect(formatElapsed(3_600_000 + 4 * 60_000 + 11_000)).toBe('1:04:11');
  });

  it('floors rather than rounds — a card must never claim a time not reached', () => {
    expect(formatElapsed(59_999)).toBe('00:59');
  });
});

describe('layoutCard', () => {
  it('sizes the photo to its own aspect, never cropping it', () => {
    const wide = layoutCard(3 / 2, meta, 1200);
    expect(wide.photo.w).toBe(1200 - 2 * 40);
    expect(wide.photo.h).toBeCloseTo((1200 - 80) / (3 / 2), 0);
  });

  it('is taller for a portrait photo, so the card follows the image', () => {
    const portrait = layoutCard(2 / 3, meta, 1200);
    const landscape = layoutCard(3 / 2, meta, 1200);
    expect(portrait.height).toBeGreaterThan(landscape.height);
  });

  it('emits the four stats from wireframe 05, in order', () => {
    const layout = layoutCard(3 / 2, meta, 1200);
    expect(layout.stats.map((s) => s.text)).toEqual(['18:42', '204 pieces', 'classic']);
    expect(layout.badge).not.toBeNull();
  });

  it('omits the clean-run badge when the run was not clean', () => {
    const layout = layoutCard(3 / 2, { ...meta, cleanRun: false }, 1200);
    expect(layout.badge).toBeNull();
  });

  it('omits attribution for an uploaded photo — there is nothing to credit', () => {
    const layout = layoutCard(3 / 2, { ...meta, attribution: null }, 1200);
    expect(layout.attribution).toBeNull();
  });

  it('keeps every box inside the card', () => {
    const layout = layoutCard(3 / 2, meta, 1200);
    const boxes = [layout.photo, ...layout.stats, layout.badge, layout.attribution].filter(
      (b): b is NonNullable<typeof b> => b !== null,
    );
    for (const box of boxes) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + (box.w ?? 0)).toBeLessThanOrEqual(layout.width);
      expect(box.y + (box.h ?? 0)).toBeLessThanOrEqual(layout.height);
    }
  });
});
