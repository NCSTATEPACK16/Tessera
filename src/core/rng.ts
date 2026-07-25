/**
 * Seeded randomness for the cut.
 *
 * The whole cut is deterministic from a seed (design doc §04) — the single most
 * useful property it can have, because a saved game then stores no geometry and
 * Duo later gets identical boards for free.
 *
 * The subtlety is *stream structure*. A single shared stream makes every drawn
 * value depend on iteration order, which breaks two things we need:
 *
 *   1. An interior edge is generated once and shared by the two pieces that meet
 *      on it. Those two pieces reach the edge at different points in any
 *      iteration, so a shared stream would hand them different curves.
 *   2. Changing one part of the cutter (say, adding a lattice draw) would shift
 *      every subsequent value and silently re-cut every existing saved puzzle.
 *
 * So each concern derives its own independent stream from `(seed, kind, id)`.
 * Edge geometry becomes a pure function of `(seed, edgeId)` — order-independent,
 * independently testable, and stable under unrelated code changes.
 */

export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Next float in [min, max). */
  range(min: number, max: number): number;
  /** Symmetric jitter in [-magnitude, +magnitude). */
  jitter(magnitude: number): number;
  /** Fair coin. */
  bool(): boolean;
}

/**
 * mulberry32 — the PRNG named in design doc §04. Fast, tiny, and good enough
 * for geometry; it is not and need not be cryptographic.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;

  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range: (min, max) => min + next() * (max - min),
    jitter: (magnitude) => (next() * 2 - 1) * magnitude,
    bool: () => next() < 0.5,
  };
}

/**
 * FNV-1a over a string. Used only to fold a stream's identity into its seed —
 * never for storage or identity itself.
 */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Derive an independent PRNG stream for one concern.
 *
 * `rngFor(seed, 'edge', 'h:4,2')` returns the same stream no matter when — or
 * whether — any other stream was drawn from. That is the whole point.
 */
export function rngFor(seed: number, kind: string, id: string | number): Rng {
  return mulberry32(hashString(`${seed >>> 0}:${kind}:${id}`));
}

/**
 * Normalise an arbitrary puzzle id into a numeric seed.
 *
 * Puzzle ids are strings everywhere above the cutter; the cutter wants a number.
 * Keeping the conversion in one place means a puzzle id and its seed can never
 * drift apart.
 */
export function seedFromPuzzleId(puzzleId: string): number {
  return hashString(puzzleId);
}
