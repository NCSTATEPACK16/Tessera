/**
 * One light system, four jobs (§07): progress bloom, hint glow, merge seam, and
 * completion payoff are the same renderer feature at different intensities — a
 * downsampled, blurred copy of the static layer drawn back with
 * `globalCompositeOperation:'lighter'`, driven by a per-region intensity mask.
 *
 * This module is the intensity math only, kept DOM-free and pure so it is
 * testable without a canvas — `Renderer` is the only place any of it gets
 * drawn. Two jobs are wired into `Renderer` today: progress bloom (driven by
 * `Scene.completion`, which already existed as an unused field) and
 * completion payoff (driven by `PlayEvent.complete`). Hint glow and merge seam
 * are built to the same spec but not yet wired — they need a hint tier and a
 * seam-edge geometry that don't exist until a later step.
 */

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Sine ease between two bounds, `t` in [0, 1]. */
function easeSine(t: number, from: number, to: number): number {
  return from + (to - from) * (0.5 - 0.5 * Math.cos(Math.PI * clamp01(t)));
}

// ---------------------------------------------------------------------------
// Progress bloom — scales with completion, 0 → 0.9, spilling ~one piece-width
// past the assembled boundary. Grows continuously, so the room brightens as
// you work. No timeline: it is a direct function of board state, not an event.

export const PROGRESS_BLOOM_PEAK = 0.9;
export const PROGRESS_BLOOM_SPILL_PIECE_WIDTHS = 1;

/** `completion` is 0–1, the same value `Board.placedCount / N` produces. */
export function progressBloomIntensity(completion: number): number {
  return clamp01(completion) * PROGRESS_BLOOM_PEAK;
}

// ---------------------------------------------------------------------------
// Hint glow — localised region mask at 0.55, breathing on a 1400ms cycle for
// two breaths (§09's frame-by-frame timeline).

export const HINT_GLOW_RISE_MS = 860;
export const HINT_GLOW_BREATHE_END_MS = 2260;
export const HINT_GLOW_DECAY_END_MS = 3000;
export const HINT_GLOW_PEAK = 0.55;
export const HINT_GLOW_BREATH_LOW = 0.35;
/** Two breaths inside the 860–2260ms window: one full sine cycle per 700ms. */
export const HINT_GLOW_BREATH_PERIOD_MS = (HINT_GLOW_BREATHE_END_MS - HINT_GLOW_RISE_MS) / 2;

/**
 * `elapsedMs` since the hint fired. Returns 0 once the hint has fully decayed
 * — the caller is responsible for stopping the animation loop at that point,
 * the same way any other `startAnimating` source is retired.
 */
export function hintGlowIntensity(elapsedMs: number): number {
  if (elapsedMs < 0) return 0;
  if (elapsedMs < HINT_GLOW_RISE_MS) {
    return easeSine(elapsedMs / HINT_GLOW_RISE_MS, 0, HINT_GLOW_PEAK);
  }
  if (elapsedMs < HINT_GLOW_BREATHE_END_MS) {
    const t = (elapsedMs - HINT_GLOW_RISE_MS) / HINT_GLOW_BREATH_PERIOD_MS;
    // Breathing, not pulsing: a full sine cycle per breath rather than a sawtooth.
    const phase = 0.5 - 0.5 * Math.cos(2 * Math.PI * t);
    return HINT_GLOW_BREATH_LOW + (HINT_GLOW_PEAK - HINT_GLOW_BREATH_LOW) * phase;
  }
  if (elapsedMs < HINT_GLOW_DECAY_END_MS) {
    const t = (elapsedMs - HINT_GLOW_BREATHE_END_MS) / (HINT_GLOW_DECAY_END_MS - HINT_GLOW_BREATHE_END_MS);
    return easeSine(t, HINT_GLOW_PEAK, 0);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Merge seam — thin, short-lived mask along the newly joined edge, 260ms,
// peak 0.7, feathered to nothing.

export const MERGE_SEAM_DURATION_MS = 260;
export const MERGE_SEAM_PEAK = 0.7;
/** Fraction of the duration spent rising to peak; the rest is the feather-out. */
const MERGE_SEAM_ATTACK_FRACTION = 0.15;

export function mergeSeamIntensity(elapsedMs: number): number {
  if (elapsedMs < 0 || elapsedMs >= MERGE_SEAM_DURATION_MS) return 0;
  const attackEnd = MERGE_SEAM_DURATION_MS * MERGE_SEAM_ATTACK_FRACTION;
  if (elapsedMs < attackEnd) {
    return easeSine(elapsedMs / attackEnd, 0, MERGE_SEAM_PEAK);
  }
  const t = (elapsedMs - attackEnd) / (MERGE_SEAM_DURATION_MS - attackEnd);
  return easeSine(t, MERGE_SEAM_PEAK, 0);
}

// ---------------------------------------------------------------------------
// Completion payoff — global mask ramps to 1.0 over 1200ms, holds three
// seconds, settles to 0.85 as the card composes.

export const COMPLETION_RAMP_MS = 1200;
export const COMPLETION_HOLD_MS = 3000;
export const COMPLETION_SETTLE_INTENSITY = 0.85;

/**
 * `elapsedMs` since `PlayEvent.complete` fired. Reaches and holds
 * `COMPLETION_SETTLE_INTENSITY` forever after the hold — the completion glow
 * does not turn off, it settles, matching the card staying lit behind it.
 */
export function completionIntensity(elapsedMs: number): number {
  if (elapsedMs < 0) return 0;
  if (elapsedMs < COMPLETION_RAMP_MS) {
    return easeSine(elapsedMs / COMPLETION_RAMP_MS, 0, 1);
  }
  const holdEnd = COMPLETION_RAMP_MS + COMPLETION_HOLD_MS;
  if (elapsedMs < holdEnd) return 1;
  return COMPLETION_SETTLE_INTENSITY;
}
