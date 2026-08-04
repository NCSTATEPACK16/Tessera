import { describe, expect, it } from 'vitest';
import { difficultyFor, nearUniformFraction } from '../../scripts/build-curated-manifest';

/** A w×h RGBA buffer filled with one colour. */
function solid(w: number, h: number, rgb: [number, number, number]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = rgb[0];
    out[i * 4 + 1] = rgb[1];
    out[i * 4 + 2] = rgb[2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

describe('nearUniformFraction', () => {
  it('is 1 for a flat image — the open-sky case §15 warns about', () => {
    expect(nearUniformFraction(solid(32, 32, [120, 140, 200]), 32, 32)).toBeCloseTo(1, 2);
  });

  it('is near 0 for high-frequency noise', () => {
    const w = 32;
    const h = 32;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const v = (i * 97) % 256;
      px[i * 4] = v;
      px[i * 4 + 1] = (v * 3) % 256;
      px[i * 4 + 2] = (v * 7) % 256;
      px[i * 4 + 3] = 255;
    }
    expect(nearUniformFraction(px, w, h)).toBeLessThan(0.2);
  });
});

describe('difficultyFor', () => {
  // §15: "reject any photo with more than ~25% near-uniform area at counts
  // above 150, or tag it 'hard'". The threshold is the whole point of this
  // function — a test that passed either side of it would be testing nothing.
  it('caps a flat photo at 150 and calls it hard', () => {
    const out = difficultyFor(0.4);
    expect(out.difficulty).toBe('hard');
    expect(Math.max(...out.recommendedCounts)).toBe(150);
  });

  it('lets a busy photo go to the top of the ladder', () => {
    const out = difficultyFor(0.05);
    expect(out.difficulty).toBe('easy');
    expect(Math.max(...out.recommendedCounts)).toBe(250);
  });

  it('puts the threshold at 0.25, not near it', () => {
    expect(difficultyFor(0.24).difficulty).not.toBe('hard');
    expect(difficultyFor(0.26).difficulty).toBe('hard');
  });
});
