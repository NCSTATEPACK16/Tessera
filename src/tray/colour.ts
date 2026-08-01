/**
 * The Colour lens's bins (§06) — "colour clustering, done honestly".
 *
 * Six k-means bins in OKLab plus a seventh "mixed" bin. Three things in that
 * sentence are load-bearing and each one is a place this feature normally fails.
 *
 * **OKLab, not RGB or HSL.** Euclidean distance in OKLab tracks how different two
 * colours actually look; in RGB it tracks nothing in particular, so bins come out
 * arbitrary and the lens stops being trustworthy.
 *
 * **Lightness is down-weighted.** §06: "weighted so lightness contributes less
 * than hue — otherwise a photo of a forest gives you six shades of 'dark' and the
 * filter is useless." That is `LIGHTNESS_WEIGHT`, and it is the single number
 * that decides whether this feature earns its place.
 *
 * **A piece straddling sky and roof goes to "mixed" rather than being forced into
 * a lie.** Its mean colour is a colour that appears nowhere on it, so binning it
 * by that mean actively misinforms. The seventh bin is the honest answer.
 *
 * The pixels were already read at cut time — `meanColor` and `colorVariance`
 * arrive on every `CutPiece` — so the tray never touches image data.
 */

import { rngFor } from '@/core/rng';
import type { PieceId } from '@/cut/types';

/** Bins, before the mixed one. §06 says six. */
export const COLOUR_BINS = 6;

/** The seventh bin. Not a cluster — a refusal to guess. */
export const MIXED_BIN = 6;

/**
 * §06's lightness de-weighting, applied to ΔL *after* both axes are normalised
 * against the spread of this particular photograph.
 *
 * The normalisation is the part that matters. A raw weight on ΔL cannot do the
 * job: in OKLab a photograph's lightness ranges over most of 0–1 while its
 * chroma axes range over perhaps ±0.1, so lightness outweighs hue by roughly
 * five to one before any weight is applied — and a forest, where that ratio is
 * far worse, is precisely the case §06 names. Dividing each axis by its own
 * standard deviation first makes this number mean what it says: **at 0.4,
 * lightness carries 40% of the weight hue does, in whatever colour space this
 * photograph actually occupies.**
 *
 * At 1.0 a forest bins into six shades of dark. Near 0, near-black and
 * near-white greens land in the same bin, which reads as a bug. 0.4 is a
 * judgement call worth re-checking against real photographs on the device.
 */
export const LIGHTNESS_WEIGHT = 0.4;

/**
 * Spread floor for the normalisation, in OKLab units.
 *
 * A black-and-white photograph has effectively zero chroma spread, and dividing
 * by it would amplify pure float noise into the dominant signal — six bins of
 * rounding error. 0.001 is below the perceptible threshold, so flooring there
 * costs nothing on a photograph that does have colour and caps the amplification
 * at 1000× on one that does not.
 */
const MIN_SPREAD = 1e-3;

/**
 * Above this internal variance a piece goes to "mixed".
 *
 * `colorVariance` is RMS channel deviation normalised against the maximum
 * possible spread (`src/cut/raster.ts`), so this is a plain 0–1 number rather
 * than a magic pixel value. A flat patch of sky sits near 0.02; a piece with a
 * roofline across it runs well above this. **Tunable, and it wants confirming
 * against real photographs** — the normalisation makes it comparable across
 * images, not correct in the abstract.
 */
export const MIXED_VARIANCE = 0.22;

/** k-means is iterative; the cut is deterministic, so this must terminate. */
const MAX_ITERATIONS = 24;

export interface OkLab {
  L: number;
  a: number;
  b: number;
}

/** What binning needs from a piece. A structural subset of `CutPiece`. */
export interface ColourInput {
  id: PieceId;
  meanColor: readonly [number, number, number];
  colorVariance: number;
}

export interface ColourBin {
  /** 0–5 for a real cluster, `MIXED_BIN` for the seventh. */
  index: number;
  /** The numeral on the chip. Colour is never the only signal (§06). */
  numeral: number;
  /** Centroid as `#rrggbb`, for the swatch beside the numeral. */
  swatch: string;
  count: number;
  mixed: boolean;
}

export interface ColourBinning {
  /** Presentation order: hue-sorted, with "mixed" last. */
  bins: ColourBin[];
  binOf: Map<PieceId, number>;
}

// ---------------------------------------------------------------------------
// sRGB ↔ OKLab. Björn Ottosson's matrices, unmodified.

function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function fromLinear(channel: number): number {
  const c = channel <= 0.0031308 ? channel * 12.92 : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
}

export function srgbToOkLab(rgb: readonly [number, number, number]): OkLab {
  const r = toLinear(rgb[0]);
  const g = toLinear(rgb[1]);
  const b = toLinear(rgb[2]);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function okLabToSrgb(lab: OkLab): [number, number, number] {
  const l = (lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b) ** 3;
  const m = (lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b) ** 3;
  const s = (lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b) ** 3;

  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export function hexOf(lab: OkLab): string {
  const [r, g, b] = okLabToSrgb(lab);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Plain squared Euclidean. Meaningful only in the normalised space below. */
function distanceSq(a: OkLab, b: OkLab): number {
  const dL = a.L - b.L;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return dL * dL + da * da + db * db;
}

interface Normalisation {
  /** Scale factors onto the space k-means actually runs in. */
  L: number;
  ab: number;
}

/**
 * Put this photograph's colours into a space where the weight means something.
 *
 * `a` and `b` share one scale factor deliberately. Normalising them separately
 * would stretch the chroma plane unevenly and bend hue angles, so two colours
 * that look equally far apart would stop being equally far apart — which is the
 * one thing OKLab was chosen to guarantee.
 */
function normalisationOf(samples: readonly OkLab[]): Normalisation {
  if (samples.length === 0) return { L: LIGHTNESS_WEIGHT, ab: 1 };

  let meanL = 0;
  let meanA = 0;
  let meanB = 0;
  for (const s of samples) {
    meanL += s.L;
    meanA += s.a;
    meanB += s.b;
  }
  meanL /= samples.length;
  meanA /= samples.length;
  meanB /= samples.length;

  let varL = 0;
  let varAB = 0;
  for (const s of samples) {
    varL += (s.L - meanL) ** 2;
    varAB += ((s.a - meanA) ** 2 + (s.b - meanB) ** 2) / 2;
  }

  const sdL = Math.max(Math.sqrt(varL / samples.length), MIN_SPREAD);
  const sdAB = Math.max(Math.sqrt(varAB / samples.length), MIN_SPREAD);

  return { L: LIGHTNESS_WEIGHT / sdL, ab: 1 / sdAB };
}

const scale = (lab: OkLab, n: Normalisation): OkLab => ({
  L: lab.L * n.L,
  a: lab.a * n.ab,
  b: lab.b * n.ab,
});

const unscale = (lab: OkLab, n: Normalisation): OkLab => ({
  L: lab.L / n.L,
  a: lab.a / n.ab,
  b: lab.b / n.ab,
});

// ---------------------------------------------------------------------------

/**
 * Bin every piece. Deterministic for a given `(pieces, seed)`.
 *
 * "Computed once at cut time and cached" (§06) — the caller is expected to hold
 * the result for the session, not recompute it per render.
 */
export function binByColour(pieces: readonly ColourInput[], seed: number): ColourBinning {
  const binOf = new Map<PieceId, number>();

  const mixed: ColourInput[] = [];
  const clusterable: ColourInput[] = [];
  for (const piece of pieces) {
    (piece.colorVariance > MIXED_VARIANCE ? mixed : clusterable).push(piece);
  }

  const lab = clusterable.map((piece) => srgbToOkLab(piece.meanColor));
  const norm = normalisationOf(lab);
  const samples = lab.map((sample) => scale(sample, norm));

  const k = Math.min(COLOUR_BINS, samples.length);
  const scaled = k > 0 ? kMeans(samples, k, seed, 'colourBins') : [];
  const centroids = scaled.map((centroid) => unscale(centroid, norm));

  const counts = new Array<number>(centroids.length).fill(0);
  for (const [i, piece] of clusterable.entries()) {
    const bin = nearest(samples[i]!, scaled);
    binOf.set(piece.id, bin);
    counts[bin] = (counts[bin] ?? 0) + 1;
  }
  for (const piece of mixed) binOf.set(piece.id, MIXED_BIN);

  // Present the bins as a spectrum rather than in whatever order k-means++
  // happened to seed them — the tray's chip row should look composed, and hue
  // order is the only ordering a player can predict.
  const ordered = centroids
    .map((centroid, index) => ({ centroid, index, count: counts[index] ?? 0 }))
    .sort((a, b) => hueOf(a.centroid) - hueOf(b.centroid));

  const remap = new Map<number, number>();
  ordered.forEach((entry, position) => remap.set(entry.index, position));
  for (const [id, bin] of binOf) {
    if (bin !== MIXED_BIN) binOf.set(id, remap.get(bin) ?? bin);
  }

  const bins: ColourBin[] = ordered.map((entry, position) => ({
    index: position,
    numeral: position + 1,
    swatch: hexOf(entry.centroid),
    count: entry.count,
    mixed: false,
  }));

  if (mixed.length > 0) {
    bins.push({
      index: MIXED_BIN,
      numeral: bins.length + 1,
      swatch: '#8A929E',
      count: mixed.length,
      mixed: true,
    });
  }

  return { bins, binOf };
}

export function hueOf(lab: OkLab): number {
  return Math.atan2(lab.b, lab.a);
}

function nearest(sample: OkLab, centroids: readonly OkLab[]): number {
  let best = 0;
  let bestDistance = Infinity;
  for (const [i, centroid] of centroids.entries()) {
    const d = distanceSq(sample, centroid);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

/**
 * k-means with a k-means++ seeding, drawn from a stream of its own.
 *
 * Seeded because the cut is deterministic from a seed and the result is part of
 * what a player will have memorised — "the dark green one is two rows down on the
 * left" (§06) has to survive a reload. `kind` is `rngFor`'s stream discriminator:
 * every caller needs its own, per-concern stream — never a shared one — so
 * this takes it as a parameter rather than hardcoding the tray's.
 */
export function kMeans(samples: readonly OkLab[], k: number, seed: number, kind: string): OkLab[] {
  const rng = rngFor(seed, kind, 0);
  const centroids: OkLab[] = [samples[Math.floor(rng.next() * samples.length)]!];

  while (centroids.length < k) {
    const weights = samples.map((sample) => {
      let closest = Infinity;
      for (const centroid of centroids) closest = Math.min(closest, distanceSq(sample, centroid));
      return closest;
    });
    const total = weights.reduce((sum, w) => sum + w, 0);

    // Every remaining point sits on top of a chosen centroid: no meaningful
    // choice is left, so take the first rather than dividing by zero.
    if (total <= 0) {
      centroids.push(samples[centroids.length % samples.length]!);
      continue;
    }

    let target = rng.next() * total;
    let picked = samples.length - 1;
    for (const [i, w] of weights.entries()) {
      target -= w;
      if (target <= 0) {
        picked = i;
        break;
      }
    }
    centroids.push(samples[picked]!);
  }

  const assignment = new Array<number>(samples.length).fill(-1);

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let moved = false;
    for (const [i, sample] of samples.entries()) {
      const bin = nearest(sample, centroids);
      if (assignment[i] !== bin) {
        assignment[i] = bin;
        moved = true;
      }
    }
    if (!moved) break;

    const sums = centroids.map(() => ({ L: 0, a: 0, b: 0, n: 0 }));
    for (const [i, sample] of samples.entries()) {
      const acc = sums[assignment[i]!]!;
      acc.L += sample.L;
      acc.a += sample.a;
      acc.b += sample.b;
      acc.n++;
    }

    for (const [i, acc] of sums.entries()) {
      // An emptied centroid re-seeds onto the point furthest from anything,
      // rather than being dropped — six bins were asked for.
      if (acc.n === 0) {
        centroids[i] = furthestFrom(samples, centroids);
        continue;
      }
      centroids[i] = { L: acc.L / acc.n, a: acc.a / acc.n, b: acc.b / acc.n };
    }
  }

  return centroids;
}

function furthestFrom(samples: readonly OkLab[], centroids: readonly OkLab[]): OkLab {
  let best = samples[0]!;
  let bestDistance = -1;
  for (const sample of samples) {
    let closest = Infinity;
    for (const centroid of centroids) closest = Math.min(closest, distanceSq(sample, centroid));
    if (closest > bestDistance) {
      bestDistance = closest;
      best = sample;
    }
  }
  return best;
}
