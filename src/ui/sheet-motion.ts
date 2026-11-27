/**
 * The sheet's physics (modernize spec §5 Motion; ruling C1). DOM-free, so it
 * is tested; `Sheet.tsx` only writes the heights these return to the style.
 *
 * - Drag follows the finger 1:1; past the top or bottom detent it rubber-bands
 *   at 0.35×.
 * - Release projects the height 0.18s ahead along the release velocity and
 *   takes the nearest detent — at most one step from where the finger let go,
 *   unless the flick is faster than 1800 px/s.
 * - Settle is a critically damped spring (k 380, d 39, m 1 — ζ ≈ 1) seeded
 *   with that velocity, and never passes its detent: the same posture as a
 *   dropped piece, which stays where it was dropped (no bounce, anywhere).
 */

export const RUBBER_BAND = 0.35;
export const PROJECT_S = 0.18;
export const SKIP_VELOCITY = 1800;
const STIFFNESS = 380;
const DAMPING = 39;
const MASS = 1;

/** Identity inside `[min, max]`; past an edge, the edge plus the excess × `factor`. */
export function rubberBand(height: number, min: number, max: number, factor = RUBBER_BAND): number {
  if (height > max) return max + (height - max) * factor;
  if (height < min) return min - (min - height) * factor;
  return height;
}

function nearestIndex(height: number, detents: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < detents.length; i++) {
    if (Math.abs(detents[i]! - height) < Math.abs(detents[best]! - height)) best = i;
  }
  return best;
}

/**
 * The detent height a release lands on. `velocityPxPerS` is positive when the
 * sheet is growing; `detents` ascend.
 */
export function releaseTarget(
  height: number,
  velocityPxPerS: number,
  detents: readonly number[],
): number {
  const from = nearestIndex(height, detents);
  let to = nearestIndex(height + velocityPxPerS * PROJECT_S, detents);
  if (Math.abs(to - from) > 1 && Math.abs(velocityPxPerS) <= SKIP_VELOCITY) {
    to = from + Math.sign(to - from);
  }
  return detents[to]!;
}

/** One step of the settle. `done` once within half a pixel and nearly still. */
export function settleSheet(
  state: { h: number; v: number },
  target: number,
  dtS: number,
): { h: number; v: number; done: boolean } {
  // Velocity pointing away from the detent — a flick released past full, or
  // below peek, still moving outward — is dropped: carrying it would take the
  // sheet further out before turning it back, which is a bounce.
  const toward = Math.sign(target - state.h);
  const v0 = Math.sign(state.v) === -toward ? 0 : state.v;
  const force = -STIFFNESS * (state.h - target) - DAMPING * v0;
  const v = v0 + (force / MASS) * dtS;
  const h = state.h + v * dtS;
  // Critical damping cannot overshoot from rest, but a flick faster than it
  // absorbs would: the detent is a wall, never a bounce.
  const crossed = Math.sign(state.h - target) !== Math.sign(h - target) && state.h !== target;
  if (crossed || (Math.abs(h - target) < 0.5 && Math.abs(v) < 5)) {
    return { h: target, v: 0, done: true };
  }
  return { h, v, done: false };
}
