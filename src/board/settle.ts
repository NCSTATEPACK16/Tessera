/**
 * The settle — how a snapped cluster travels the last few pixels (§09).
 *
 * A spring, integrated per frame from the release velocity, **not** an easing
 * curve. A piece flicked at its slot arrives hot and overshoots; a piece set
 * down gently just settles. That velocity inheritance is most of the perceived
 * physicality, and a fixed cubic-bezier cannot produce it at all — the same
 * curve plays no matter how the piece was released.
 *
 * Two implementations sit behind one `advance(dt)` interface, because reduced
 * motion is a different motion rather than a smaller one: it skips the overshoot
 * entirely and places in 120ms flat, while keeping the light and the audio (§09).
 * Same seam as `edgePath` in the cut — one interface, more than one answer.
 *
 * On timing: §09's frame table reads "0–90ms spring to target, 90–140ms settle
 * back". With the locked constants (520/26/1, ζ ≈ 0.57) the piece reaches its
 * slot at ~115ms and the visible correction is over shortly after, with a small
 * tail beneath a pixel. The constants are the specification and the table is the
 * description of what they feel like, so the constants win; §17 budgets a week
 * of hand-tuning on real hardware, and this is one of the dials it turns.
 */

/** §09, and repeated in CLAUDE.md's hard numbers. Do not drift. */
export const SNAP_SPRING = {
  stiffness: 520,
  damping: 26,
  mass: 1,
} as const;

/** §09: reduced motion places in 120ms linear. */
export const REDUCED_MOTION_MS = 120;

/**
 * Integration sub-step. A spring integrated explicitly at a variable dt is the
 * classic way to make a piece fly off-screen after a stall, and `interrupted` is
 * a first-class state here, so stalls are guaranteed rather than hypothetical.
 */
const MAX_STEP_S = 1 / 240;

/** Rest thresholds: well under a pixel at any zoom the camera allows. */
const REST_DISTANCE = 5e-4;
const REST_VELOCITY = 5e-3;

export interface Pose {
  x: number;
  y: number;
  /** Radians. */
  rot: number;
}

export interface SettleSample extends Pose {
  done: boolean;
}

export interface Settle {
  /** Advance by `dtMs` and return the new pose. */
  advance(dtMs: number): SettleSample;
  readonly done: boolean;
  /** The current pose without advancing. */
  readonly sample: SettleSample;
}

export interface SettleSpec {
  from: Pose;
  to: Pose;
  /** World units per second, and radians per second. Defaults to at rest. */
  velocity?: Pose;
  reducedMotion?: boolean;
}

const ZERO: Pose = { x: 0, y: 0, rot: 0 };

/**
 * Damped spring on each axis, seeded from the release velocity.
 *
 * State is kept as *displacement from the target* rather than absolute position,
 * so coming to rest is exactly "displacement is zero" and the final pose is the
 * target to the last float — which matters because the static layer bakes placed
 * pieces, and a baked half-pixel error never washes out.
 */
export function createSpringSettle(from: Pose, to: Pose, velocity: Pose = ZERO): Settle {
  let dx = from.x - to.x;
  let dy = from.y - to.y;
  let drot = from.rot - to.rot;
  let vx = velocity.x;
  let vy = velocity.y;
  let vrot = velocity.rot;

  const { stiffness, damping, mass } = SNAP_SPRING;

  const atRest = (): boolean =>
    Math.abs(dx) < REST_DISTANCE &&
    Math.abs(dy) < REST_DISTANCE &&
    Math.abs(drot) < REST_DISTANCE &&
    Math.abs(vx) < REST_VELOCITY &&
    Math.abs(vy) < REST_VELOCITY &&
    Math.abs(vrot) < REST_VELOCITY;

  let done = atRest();
  if (done) {
    dx = 0;
    dy = 0;
    drot = 0;
  }

  const sample = (): SettleSample => ({ x: to.x + dx, y: to.y + dy, rot: to.rot + drot, done });

  return {
    get done() {
      return done;
    },
    get sample() {
      return sample();
    },
    advance(dtMs: number): SettleSample {
      if (done) return sample();

      // Semi-implicit Euler, sub-stepped. Clamped because a backgrounded tab
      // hands back a dt measured in seconds, and no spring survives that in one
      // step regardless of how it is integrated.
      let remaining = Math.min(Math.max(dtMs, 0) / 1000, 1);
      while (remaining > 0) {
        const step = Math.min(remaining, MAX_STEP_S);
        remaining -= step;

        vx += ((-stiffness * dx - damping * vx) / mass) * step;
        vy += ((-stiffness * dy - damping * vy) / mass) * step;
        vrot += ((-stiffness * drot - damping * vrot) / mass) * step;

        dx += vx * step;
        dy += vy * step;
        drot += vrot * step;
      }

      if (atRest()) {
        done = true;
        dx = 0;
        dy = 0;
        drot = 0;
        vx = 0;
        vy = 0;
        vrot = 0;
      }
      return sample();
    },
  };
}

/**
 * Linear placement for reduced motion: no overshoot, no ripple, 120ms.
 *
 * Release velocity is deliberately not an input. Feeding it in is the obvious
 * "improvement" and it would put the overshoot straight back for exactly the
 * players who asked not to have it.
 */
export function createLinearSettle(from: Pose, to: Pose, durationMs = REDUCED_MOTION_MS): Settle {
  let elapsed = 0;
  const done = (): boolean => elapsed >= durationMs;

  const sample = (): SettleSample => {
    const t = durationMs <= 0 ? 1 : Math.min(elapsed / durationMs, 1);
    return {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      rot: from.rot + (to.rot - from.rot) * t,
      done: done(),
    };
  };

  return {
    get done() {
      return done();
    },
    get sample() {
      return sample();
    },
    advance(dtMs: number): SettleSample {
      elapsed += Math.max(dtMs, 0);
      return sample();
    },
  };
}

export function createSettle(spec: SettleSpec): Settle {
  return spec.reducedMotion
    ? createLinearSettle(spec.from, spec.to)
    : createSpringSettle(spec.from, spec.to, spec.velocity);
}
