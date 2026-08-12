/**
 * Accent extraction (§13, step 4c).
 *
 * The clamp is the load-bearing assertion here, the same way the forest case
 * is load-bearing for `binByColour`: it must hold for a photo whose dominant
 * colours are muddy, near-black, or near-white, not just for a well-behaved
 * one — those are exactly the ~1 photo in 20 §17 flags as an embarrassment
 * risk.
 */

import { describe, expect, it } from 'vitest';
import {
  ACCENT_FALLBACK,
  adaptiveGhostOpacity,
  clampToAccentRange,
  contrastRatio,
  ensureContrast,
  ensureHueSeparation,
  extractAccent,
  fallbackAccentTokens,
  MAT_RAISED_RGB,
  WCAG_MIN_CONTRAST,
} from '@/render/accent';
import { hueOf, okLabToSrgb, srgbToOkLab } from '@/tray/colour';
import type { ColourInput, OkLab } from '@/tray/colour';

const flat = (id: number, rgb: [number, number, number]): ColourInput => ({
  id,
  meanColor: rgb,
  colorVariance: 0.05,
});

const hueDeg = (lab: OkLab): number => (hueOf(lab) * 180) / Math.PI;

describe('clampToAccentRange', () => {
  it('forces lightness into 0.62–0.78', () => {
    expect(clampToAccentRange(srgbToOkLab([0, 0, 0])).L).toBeCloseTo(0.62, 5);
    expect(clampToAccentRange(srgbToOkLab([255, 255, 255])).L).toBeCloseTo(0.78, 5);
  });

  it('forces chroma into 0.09–0.16', () => {
    const grey = clampToAccentRange(srgbToOkLab([128, 128, 128]));
    const chroma = Math.hypot(grey.a, grey.b);
    expect(chroma).toBeGreaterThanOrEqual(0.09 - 1e-9);
    expect(chroma).toBeLessThanOrEqual(0.16 + 1e-9);

    const saturated = clampToAccentRange(srgbToOkLab([255, 0, 0]));
    const saturatedChroma = Math.hypot(saturated.a, saturated.b);
    expect(saturatedChroma).toBeLessThanOrEqual(0.16 + 1e-9);
  });

  it('preserves hue for a colour that already has one', () => {
    const blue = srgbToOkLab([20, 60, 200]);
    const clamped = clampToAccentRange(blue);
    expect(hueDeg(clamped)).toBeCloseTo(hueDeg(blue), 1);
  });

  it('gives an achromatic colour a real hue rather than leaving it grey', () => {
    const clamped = clampToAccentRange(srgbToOkLab([128, 128, 128]));
    expect(Math.hypot(clamped.a, clamped.b)).toBeGreaterThan(0);
  });
});

describe('ensureHueSeparation', () => {
  it('leaves an already-separated pair alone', () => {
    const accent = clampToAccentRange(srgbToOkLab([255, 0, 0]));
    const bloom = clampToAccentRange(srgbToOkLab([0, 180, 255]));
    expect(ensureHueSeparation(accent, bloom)).toEqual(bloom);
  });

  it('rotates a too-close bloom out to at least 25°, without moving accent', () => {
    const accent = clampToAccentRange(srgbToOkLab([255, 60, 20]));
    const bloom = clampToAccentRange(srgbToOkLab([255, 80, 30])); // nearly the same hue
    const separated = ensureHueSeparation(accent, bloom);

    const gap = Math.abs(hueDeg(accent) - hueDeg(separated)) % 360;
    expect(Math.min(gap, 360 - gap)).toBeGreaterThanOrEqual(25 - 1e-6);
  });

  it('keeps the rotated bloom inside the clamp band', () => {
    const accent = clampToAccentRange(srgbToOkLab([255, 60, 20]));
    const bloom = clampToAccentRange(srgbToOkLab([255, 80, 30]));
    const separated = ensureHueSeparation(accent, bloom);

    expect(separated.L).toBe(bloom.L);
    expect(Math.hypot(separated.a, separated.b)).toBeCloseTo(Math.hypot(bloom.a, bloom.b), 6);
  });
});

describe('extractAccent', () => {
  it('falls back on no pieces', () => {
    expect(extractAccent([], 1)).toEqual(fallbackAccentTokens());
  });

  it('falls back when the neutral escape is set, regardless of the photo', () => {
    const pieces = [flat(0, [255, 0, 0]), flat(1, [0, 0, 255])];
    expect(extractAccent(pieces, 1, true)).toEqual(fallbackAccentTokens());
  });

  it('separates accent and bloom for a genuinely two-toned photo', () => {
    const pieces = [
      ...Array.from({ length: 20 }, (_, i) => flat(i, [220, 40, 30])),
      ...Array.from({ length: 20 }, (_, i) => flat(20 + i, [20, 90, 220])),
    ];
    const tokens = extractAccent(pieces, 1);

    expect(tokens.accent).not.toBe(tokens.accentBloom);
    const accentLab = srgbToOkLab(hexToRgb(tokens.accent));
    const bloomLab = srgbToOkLab(hexToRgb(tokens.accentBloom));
    const gap = Math.abs(hueDeg(accentLab) - hueDeg(bloomLab)) % 360;
    expect(Math.min(gap, 360 - gap)).toBeGreaterThanOrEqual(25 - 1);
  });

  it('never yields a muddy result for a near-black, low-variety photo (§17)', () => {
    const pieces = Array.from({ length: 30 }, (_, i) => flat(i, [18, 16, 20]));
    const tokens = extractAccent(pieces, 1);

    // Loose tolerance: `hexOf` round-trips through 8-bit sRGB, which quantises
    // the clamp's exact OKLab values by a few thousandths — real error from
    // representing colour as a hex string, not a defect in the clamp itself.
    for (const hex of [tokens.accent, tokens.accentBloom, tokens.accentTray]) {
      const lab = srgbToOkLab(hexToRgb(hex));
      expect(lab.L).toBeGreaterThanOrEqual(0.62 - 5e-3);
      expect(lab.L).toBeLessThanOrEqual(0.78 + 5e-3);
      const chroma = Math.hypot(lab.a, lab.b);
      expect(chroma).toBeGreaterThanOrEqual(0.09 - 5e-3);
    }
  });

  it('is deterministic for a given seed, the way the cut itself is', () => {
    const pieces = [flat(0, [200, 40, 40]), flat(1, [40, 200, 60]), flat(2, [40, 60, 200])];
    expect(extractAccent(pieces, 7)).toEqual(extractAccent(pieces, 7));
  });

  it('never throws', () => {
    expect(() => extractAccent([flat(0, [0, 0, 0])], 1)).not.toThrow();
  });

  it('always meets the WCAG floor against --mat-raised, at a near-black and a near-white photo', () => {
    // CLAUDE.md: a test that passes at both extremes of the constant it guards
    // is not testing that constant — so this asserts the actual measured
    // ratio, not just that extraction returns something.
    const nearBlack = Array.from({ length: 12 }, (_, i) => flat(i, [5, 5, 8]));
    const nearWhite = Array.from({ length: 12 }, (_, i) => flat(i, [250, 248, 245]));
    for (const pieces of [nearBlack, nearWhite]) {
      const tokens = extractAccent(pieces, 1);
      expect(contrastRatio(hexToRgb(tokens.accent), MAT_RAISED_RGB)).toBeGreaterThanOrEqual(
        WCAG_MIN_CONTRAST - 1e-6,
      );
    }
  });
});

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

describe('contrastRatio', () => {
  it('is 1 for two identical colours', () => {
    expect(contrastRatio([100, 100, 100], [100, 100, 100])).toBeCloseTo(1, 5);
  });

  it('is 21 for pure black against pure white — the WCAG maximum', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1);
  });

  it('is symmetric — argument order does not matter', () => {
    const a: [number, number, number] = [10, 200, 90];
    const b: [number, number, number] = [230, 20, 40];
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 6);
  });
});

describe('ensureContrast', () => {
  // Hue 240deg, L 0.62, chroma 0.16 — the clamp's own permitted extreme.
  // Hand-computed this session: contrastRatio comes out to ~4.478, just under
  // WCAG_MIN_CONTRAST. This is the case clampToAccentRange alone cannot catch.
  const nearMiss: OkLab = {
    L: 0.62,
    a: Math.cos((240 * Math.PI) / 180) * 0.16,
    b: Math.sin((240 * Math.PI) / 180) * 0.16,
  };

  it('confirms the near-miss actually fails 4.5:1 against --mat-raised', () => {
    expect(contrastRatio(okLabToSrgb(nearMiss), MAT_RAISED_RGB)).toBeLessThan(WCAG_MIN_CONTRAST);
  });

  it('walks lightness up until the near-miss clears the WCAG floor', () => {
    const fixed = ensureContrast(nearMiss, MAT_RAISED_RGB, WCAG_MIN_CONTRAST);
    expect(contrastRatio(okLabToSrgb(fixed), MAT_RAISED_RGB)).toBeGreaterThanOrEqual(
      WCAG_MIN_CONTRAST - 1e-6,
    );
    expect(fixed.L).toBeGreaterThan(nearMiss.L);
  });

  it('leaves an already-compliant colour untouched', () => {
    const bright: OkLab = { L: 0.78, a: 0.02, b: 0.02 };
    const before = contrastRatio(okLabToSrgb(bright), MAT_RAISED_RGB);
    expect(before).toBeGreaterThanOrEqual(WCAG_MIN_CONTRAST);
    expect(ensureContrast(bright, MAT_RAISED_RGB, WCAG_MIN_CONTRAST)).toEqual(bright);
  });

  it('never throws and returns its best effort even for an unreachable target', () => {
    const impossible: OkLab = { L: 0.62, a: 0, b: 0 };
    expect(() => ensureContrast(impossible, MAT_RAISED_RGB, 21)).not.toThrow();
  });
});

describe('adaptiveGhostOpacity', () => {
  it('boosts opacity for a near-black slot, past the base value', () => {
    expect(adaptiveGhostOpacity(0.2, [5, 5, 5])).toBeGreaterThan(0.2);
  });

  it('leaves a near-white slot at the base value — no boost needed there', () => {
    expect(adaptiveGhostOpacity(0.2, [250, 250, 250])).toBeCloseTo(0.2, 5);
  });

  it('is monotonic — a darker slot never gets less boost than a lighter one, same base', () => {
    const dark = adaptiveGhostOpacity(0.2, [10, 10, 10]);
    const mid = adaptiveGhostOpacity(0.2, [128, 128, 128]);
    const light = adaptiveGhostOpacity(0.2, [240, 240, 240]);
    expect(dark).toBeGreaterThanOrEqual(mid);
    expect(mid).toBeGreaterThanOrEqual(light);
  });

  it('never exceeds the adaptive ceiling regardless of how dark the slot is', () => {
    expect(adaptiveGhostOpacity(0.3, [0, 0, 0])).toBeLessThanOrEqual(0.55);
  });
});

/** Sanity check that the fallback is the documented constant. */
describe('fallbackAccentTokens', () => {
  it('is the fixed fallback colour on every field', () => {
    expect(fallbackAccentTokens()).toEqual({
      accent: ACCENT_FALLBACK,
      accentBloom: ACCENT_FALLBACK,
      accentTray: ACCENT_FALLBACK,
    });
  });
});
