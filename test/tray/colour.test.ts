/**
 * Colour bins (§06).
 *
 * The test that justifies the whole file is `a forest does not become six shades
 * of dark`. §06 names that failure explicitly, and it is what the lightness
 * weighting exists to prevent — without it the lens is technically working and
 * practically useless, which is the worst kind of bug to ship.
 */

import { describe, expect, it } from 'vitest';
import {
  COLOUR_BINS,
  MIXED_BIN,
  MIXED_VARIANCE,
  binByColour,
  hexOf,
  okLabToSrgb,
  srgbToOkLab,
} from '@/tray/colour';
import type { ColourInput } from '@/tray/colour';

const flat = (id: number, rgb: [number, number, number]): ColourInput => ({
  id,
  meanColor: rgb,
  colorVariance: 0.05,
});

describe('OKLab', () => {
  it('puts white at L = 1 with no chroma', () => {
    const white = srgbToOkLab([255, 255, 255]);
    expect(white.L).toBeCloseTo(1, 3);
    expect(white.a).toBeCloseTo(0, 3);
    expect(white.b).toBeCloseTo(0, 3);
  });

  it('puts black at the origin', () => {
    const black = srgbToOkLab([0, 0, 0]);
    expect(black.L).toBeCloseTo(0, 6);
    expect(black.a).toBeCloseTo(0, 6);
    expect(black.b).toBeCloseTo(0, 6);
  });

  it('gives blue a negative b and red a positive a', () => {
    expect(srgbToOkLab([0, 0, 255]).b).toBeLessThan(-0.1);
    expect(srgbToOkLab([255, 0, 0]).a).toBeGreaterThan(0.1);
  });

  it('round-trips through sRGB', () => {
    for (const rgb of [
      [12, 34, 56],
      [200, 180, 40],
      [255, 255, 255],
      [0, 128, 64],
    ] as [number, number, number][]) {
      expect(okLabToSrgb(srgbToOkLab(rgb))).toEqual(rgb);
    }
  });

  it('renders a swatch as six hex digits', () => {
    expect(hexOf(srgbToOkLab([255, 0, 0]))).toBe('#ff0000');
    expect(hexOf(srgbToOkLab([0, 0, 0]))).toBe('#000000');
  });
});

describe('binByColour', () => {
  const rainbow: ColourInput[] = [
    ...[0, 1, 2].map((i) => flat(i, [220 - i, 30, 40])),
    ...[3, 4, 5].map((i) => flat(i, [230 - i, 170, 30])),
    ...[6, 7, 8].map((i) => flat(i, [40, 190 - i, 60])),
    ...[9, 10, 11].map((i) => flat(i, [30, 140, 210 - i])),
    ...[12, 13, 14].map((i) => flat(i, [140, 40, 200 - i])),
    ...[15, 16, 17].map((i) => flat(i, [120, 120, 120 - i])),
  ];

  it('is deterministic for a seed', () => {
    const a = binByColour(rainbow, 5);
    const b = binByColour(rainbow, 5);
    expect([...a.binOf]).toEqual([...b.binOf]);
    expect(a.bins).toEqual(b.bins);
  });

  it('keeps obviously different hues apart', () => {
    const { binOf } = binByColour(rainbow, 5);
    expect(binOf.get(0)).not.toBe(binOf.get(9));
    expect(binOf.get(0)).not.toBe(binOf.get(6));
  });

  it('keeps obviously similar colours together', () => {
    const { binOf } = binByColour(rainbow, 5);
    expect(binOf.get(0)).toBe(binOf.get(1));
    expect(binOf.get(9)).toBe(binOf.get(11));
  });

  it('bins every piece, and only into bins it declared', () => {
    const { bins, binOf } = binByColour(rainbow, 5);
    expect(binOf.size).toBe(rainbow.length);
    const declared = new Set(bins.map((bin) => bin.index));
    for (const bin of binOf.values()) expect(declared.has(bin)).toBe(true);
  });

  it('labels every bin with a numeral as well as a swatch — §06', () => {
    const { bins } = binByColour(rainbow, 5);
    for (const [i, bin] of bins.entries()) {
      expect(bin.numeral).toBe(i + 1);
      expect(bin.swatch).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('a forest bins by hue, not by six shades of dark', () => {
    // The failure §06 names, built deliberately: a 6×6 grid of low-chroma
    // foliage colours where lightness varies over most of the range and hue
    // varies over a narrow arc. Unweighted, lightness dominates by an order of
    // magnitude and every bin comes out a shade of dark green.
    const forest: ColourInput[] = [];
    for (let hue = 0; hue < 6; hue++) {
      for (let level = 0; level < 6; level++) {
        const angle = (100 + hue * 12) * (Math.PI / 180);
        const rgb = okLabToSrgb({
          L: 0.22 + level * 0.09,
          a: Math.cos(angle) * 0.055,
          b: Math.sin(angle) * 0.055,
        });
        forest.push(flat(hue * 6 + level, rgb));
      }
    }

    const { binOf } = binByColour(forest, 2);
    const hueOf = (id: number): number => Math.floor(id / 6);
    const levelOf = (id: number): number => id % 6;

    // How often do two pieces sharing a hue land in one bin, versus two pieces
    // sharing a lightness? The lens is useful only when the first number wins.
    const agreement = (same: (a: number, b: number) => boolean): number => {
      let together = 0;
      let pairs = 0;
      for (let a = 0; a < forest.length; a++) {
        for (let b = a + 1; b < forest.length; b++) {
          if (!same(a, b)) continue;
          pairs++;
          if (binOf.get(a) === binOf.get(b)) together++;
        }
      }
      return together / pairs;
    };

    const byHue = agreement((a, b) => hueOf(a) === hueOf(b));
    const byLightness = agreement((a, b) => levelOf(a) === levelOf(b));

    expect(byHue).toBeGreaterThan(0.5);
    expect(byHue).toBeGreaterThan(byLightness * 2);
  });

  it('a black-and-white photograph still bins by lightness', () => {
    // The other half of what normalising against this photograph's own spread
    // buys: with no hue to bin by, lightness gets the weight, and a grey ramp
    // produces six usable bins rather than one bin of float noise.
    const greys: ColourInput[] = [];
    for (let i = 0; i < 24; i++) {
      const level = Math.round(20 + (i % 6) * 40);
      greys.push(flat(i, [level, level, level]));
    }

    const { bins, binOf } = binByColour(greys, 4);
    expect(bins).toHaveLength(COLOUR_BINS);
    expect(binOf.get(0)).not.toBe(binOf.get(5));
    // Same grey, same bin — the bins track lightness rather than nothing.
    expect(binOf.get(0)).toBe(binOf.get(6));
  });

  it('sends a high-variance piece to the mixed bin rather than guessing', () => {
    const straddling: ColourInput = {
      id: 99,
      meanColor: [128, 128, 128],
      colorVariance: MIXED_VARIANCE + 0.1,
    };
    const { bins, binOf } = binByColour([...rainbow, straddling], 5);

    expect(binOf.get(99)).toBe(MIXED_BIN);
    expect(bins.at(-1)?.mixed).toBe(true);
    expect(bins.at(-1)?.count).toBe(1);
  });

  it('omits the mixed bin entirely when nothing straddles', () => {
    expect(binByColour(rainbow, 5).bins.some((bin) => bin.mixed)).toBe(false);
  });

  it('survives fewer pieces than bins, and none at all', () => {
    expect(binByColour([], 1).bins).toEqual([]);
    const two = binByColour([flat(0, [10, 20, 30]), flat(1, [200, 30, 40])], 1);
    expect(two.bins).toHaveLength(2);
    expect(two.binOf.size).toBe(2);
  });
});
