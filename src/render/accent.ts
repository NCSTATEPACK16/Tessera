/**
 * Accent extraction (§13, step 4c).
 *
 * Three dominant colours from the photo's own pieces, in OKLab, become
 * `--accent`, `--accent-bloom`, and `--accent-tray`. Reuses the mean colour
 * already computed per piece at cut time (`src/tray/colour.ts`'s
 * `binByColour` does the same thing) — extraction never touches image data
 * a second time.
 *
 * **The clamp is the difference between a bloom and a stain.** A photo's
 * dominant colours are not always a colour you want to build UI chrome out
 * of — force `L` into 0.62–0.78 and `C` into 0.09–0.16 before anything uses
 * the result. A muddy photo still yields a clean hex; it just stops being a
 * muddy hex on a near-black mat, which reads as dirt rather than light.
 *
 * Extraction must never block the start of play (§13) — every path here
 * either returns a real result or `ACCENT_FALLBACK`, and never throws.
 */

import type { ColourInput } from '@/tray/colour';
import { hexOf, hueOf, kMeans, okLabToSrgb, srgbToOkLab } from '@/tray/colour';
import type { OkLab } from '@/tray/colour';

export const ACCENT_FALLBACK = '#6FA8FF';

const CLAMP_L = { min: 0.62, max: 0.78 };
const CLAMP_C = { min: 0.09, max: 0.16 };
const MIN_HUE_SEPARATION_DEG = 25;
const DOMINANT_COUNT = 3;

/**
 * `--mat-raised` (#1E232A, theme.css), not `--mat-void` — the accent sits on
 * both as either text/border colour or a light background, and raised is the
 * harder of the two to clear: it is lighter than void, so it costs more
 * contrast, not less. Passing against raised passes against void for free.
 */
export const MAT_RAISED_RGB: [number, number, number] = [30, 35, 42];
/** WCAG 2.1 AA, normal text. */
export const WCAG_MIN_CONTRAST = 4.5;
const CONTRAST_L_STEP = 0.01;
const CONTRAST_L_MAX = 0.95;

export interface AccentTokens {
  accent: string;
  accentBloom: string;
  accentTray: string;
}

export function fallbackAccentTokens(): AccentTokens {
  return { accent: ACCENT_FALLBACK, accentBloom: ACCENT_FALLBACK, accentTray: ACCENT_FALLBACK };
}

/** Force `lab` into the bloom-safe band, preserving its hue. */
export function clampToAccentRange(lab: OkLab): OkLab {
  const L = Math.min(CLAMP_L.max, Math.max(CLAMP_L.min, lab.L));
  const chroma = Math.hypot(lab.a, lab.b);
  // Achromatic input (grey, black, white) has no hue to preserve — atan2(0, 0)
  // is 0, which is as good a direction as any once chroma is floored above it.
  const hue = chroma > 0 ? Math.atan2(lab.b, lab.a) : 0;
  const clampedChroma = Math.min(CLAMP_C.max, Math.max(CLAMP_C.min, chroma));
  return { L, a: Math.cos(hue) * clampedChroma, b: Math.sin(hue) * clampedChroma };
}

function circularHueDiffDeg(a: OkLab, b: OkLab): number {
  const diff = Math.abs(((hueOf(a) - hueOf(b)) * 180) / Math.PI) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Rotate `bloom`'s hue away from `accent` until they clear the minimum
 * separation, holding both channels' magnitudes fixed. Only ever rotates
 * `bloom` — `accent` is the role everything else in chrome is keyed to, so it
 * never moves to accommodate a second colour.
 */
export function ensureHueSeparation(accent: OkLab, bloom: OkLab): OkLab {
  const gap = circularHueDiffDeg(accent, bloom);
  if (gap >= MIN_HUE_SEPARATION_DEG) return bloom;

  const chroma = Math.hypot(bloom.a, bloom.b);
  const bloomHue = chroma > 0 ? hueOf(bloom) : hueOf(accent);
  const deficitRad = ((MIN_HUE_SEPARATION_DEG - gap) * Math.PI) / 180;
  // Rotate further round the circle in whichever direction `bloom` was
  // already offset from `accent`, so a tiny existing gap still reads as
  // "distinct hue, same family" rather than jumping to the opposite side.
  const direction = Math.sin(bloomHue - hueOf(accent)) < 0 ? -1 : 1;
  const rotated = bloomHue + direction * deficitRad;
  return { L: bloom.L, a: Math.cos(rotated) * chroma, b: Math.sin(rotated) * chroma };
}

/**
 * Dominant colours by cluster size, largest first. `k` centroids come back
 * from `kMeans` in no particular order — this is what "dominant" means.
 */
function rankBySize(samples: readonly OkLab[], centroids: readonly OkLab[]): OkLab[] {
  const counts = new Array<number>(centroids.length).fill(0);
  for (const sample of samples) {
    let best = 0;
    let bestDistance = Infinity;
    for (const [i, centroid] of centroids.entries()) {
      const d = (sample.L - centroid.L) ** 2 + (sample.a - centroid.a) ** 2 + (sample.b - centroid.b) ** 2;
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    }
    counts[best] = (counts[best] ?? 0) + 1;
  }
  return centroids
    .map((centroid, i) => ({ centroid, count: counts[i] ?? 0 }))
    .sort((a, b) => b.count - a.count)
    .map((entry) => entry.centroid);
}

function relativeLuminance(rgb: readonly [number, number, number]): number {
  const linear = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
}

/** WCAG 2.1 contrast ratio, 1 (identical) to 21 (black on white). Symmetric. */
export function contrastRatio(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  const lumA = relativeLuminance(a);
  const lumB = relativeLuminance(b);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The second pass, after `clampToAccentRange`: walk OKLab lightness upward
 * until the colour actually clears `minRatio` against `against`, rather than
 * assuming the clamp's L/C band is always enough — it is not (see the
 * near-miss test in `accent.test.ts`, a real value the clamp alone permits).
 * Hue and chroma magnitude are held fixed; only L moves. Never throws — an
 * unreachable ratio returns the best L found, the same never-block posture
 * `extractAccent` already keeps for every other failure mode here.
 */
export function ensureContrast(
  lab: OkLab,
  against: readonly [number, number, number],
  minRatio: number,
): OkLab {
  let candidate = lab;
  for (let L = lab.L; L <= CONTRAST_L_MAX; L += CONTRAST_L_STEP) {
    candidate = { ...lab, L };
    if (contrastRatio(okLabToSrgb(candidate), against) >= minRatio) return candidate;
  }
  return candidate;
}

/**
 * Step 5b's ghost underlay is a single dimmed copy of the source photo drawn
 * under placed pieces (`renderer.ts`'s `paintStatic`). A uniform alpha reads
 * as invisible over the photo's own dark regions against `--mat-void`'s
 * near-black — this boosts opacity per slot from that slot's own mean colour,
 * using the pixel data cut already sampled (`CutPiece.meanColor`), so it costs
 * no second pass over the image. Chosen, not measured — revisit on hardware.
 */
const GHOST_ADAPTIVE_CEILING = 0.55;
const GHOST_BOOST_LIGHTNESS_FLOOR = 0.7;

export function adaptiveGhostOpacity(
  base: number,
  meanColor: readonly [number, number, number],
): number {
  const L = srgbToOkLab(meanColor).L;
  const boost = Math.max(0, GHOST_BOOST_LIGHTNESS_FLOOR - L);
  return Math.min(GHOST_ADAPTIVE_CEILING, base + boost * base);
}

/**
 * Extract accent tokens from a puzzle's pieces. `useNeutral` is the manual
 * escape (§13) — settings, not a computed decision; there is nowhere to
 * reach it from yet (no settings sheet exists — step 5), so this parameter
 * is the seam that screen wires into rather than a UI toggle today.
 */
export function extractAccent(
  pieces: readonly ColourInput[],
  seed: number,
  useNeutral = false,
): AccentTokens {
  if (useNeutral || pieces.length === 0) return fallbackAccentTokens();

  try {
    const samples = pieces.map((piece) => srgbToOkLab(piece.meanColor));
    const k = Math.min(DOMINANT_COUNT, samples.length);
    if (k === 0) return fallbackAccentTokens();

    const centroids = kMeans(samples, k, seed, 'accent');
    const ranked = rankBySize(samples, centroids);

    // `ensureContrast` is only for `accent` — the token used as interactive
    // text/border colour against dark chrome. `accentBloom`/`accentTray`
    // drive a light/glow effect, not legibility, so they stay on the clamp
    // alone.
    const accent = ensureContrast(
      clampToAccentRange(ranked[0]!),
      MAT_RAISED_RGB,
      WCAG_MIN_CONTRAST,
    );
    const bloom = ensureHueSeparation(accent, clampToAccentRange(ranked[1] ?? ranked[0]!));
    const tray = clampToAccentRange(ranked[2] ?? ranked[1] ?? ranked[0]!);

    return { accent: hexOf(accent), accentBloom: hexOf(bloom), accentTray: hexOf(tray) };
  } catch {
    // Never let extraction block the start of play (§13).
    return fallbackAccentTokens();
  }
}
