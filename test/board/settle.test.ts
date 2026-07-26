/**
 * The settle (§09) — a spring, not an easing curve.
 *
 * "A piece flicked at the slot arrives hot and overshoots, while a piece gently
 * placed just settles. That velocity inheritance is most of the perceived
 * physicality, and it is exactly what a fixed cubic-bezier cannot give."
 *
 * So the load-bearing test here is `inherits release velocity`: two settles from
 * the same displacement to the same target that must not produce the same
 * motion. Any easing-curve implementation passes every other test in this file
 * and fails that one.
 */

import { describe, expect, it } from 'vitest';
import {
  REDUCED_MOTION_MS,
  SNAP_SPRING,
  createLinearSettle,
  createSettle,
  createSpringSettle,
} from '@/board/settle';
import type { Pose, Settle } from '@/board/settle';

const origin: Pose = { x: 0, y: 0, rot: 0 };
const still: Pose = { x: 0, y: 0, rot: 0 };

/** Run a settle at 60fps, returning every sample. */
function run(settle: Settle, forMs = 1000, stepMs = 1000 / 60): Pose[] {
  const out: Pose[] = [];
  for (let t = 0; t < forMs && !settle.done; t += stepMs) {
    const sample = settle.advance(stepMs);
    out.push({ x: sample.x, y: sample.y, rot: sample.rot });
  }
  return out;
}

/** Milliseconds until the piece first reaches its slot. */
function crossingMs(from: number, samples: Pose[], stepMs = 1000 / 60): number {
  const index = samples.findIndex((s) => Math.sign(s.x) !== Math.sign(from) || s.x === 0);
  return index < 0 ? Infinity : (index + 1) * stepMs;
}

describe('spring constants', () => {
  it('states §09 exactly', () => {
    expect(SNAP_SPRING.stiffness).toBe(520);
    expect(SNAP_SPRING.damping).toBe(26);
    expect(SNAP_SPRING.mass).toBe(1);
  });

  it('is underdamped, which is what produces the overshoot at all', () => {
    // Critical damping here is 2·sqrt(k·m) ≈ 45.6. Raise damping past that while
    // "tuning" and the piece slides into the slot with no contact at all.
    const critical = 2 * Math.sqrt(SNAP_SPRING.stiffness * SNAP_SPRING.mass);
    expect(SNAP_SPRING.damping).toBeLessThan(critical);
  });
});

describe('spring settle', () => {
  it('arrives at the slot in the neighbourhood of 90–140ms', () => {
    const settle = createSpringSettle({ x: 0.28, y: 0, rot: 0 }, origin, still);
    expect(crossingMs(0.28, run(settle))).toBeLessThan(140);
  });

  it('overshoots past the slot rather than easing into it', () => {
    const settle = createSpringSettle({ x: 0.28, y: 0, rot: 0 }, origin, still);
    const samples = run(settle);
    expect(Math.min(...samples.map((s) => s.x))).toBeLessThan(0);
  });

  it('inherits release velocity — a flicked piece arrives hot', () => {
    const from: Pose = { x: 0.28, y: 0, rot: 0 };
    const gentle = run(createSpringSettle(from, origin, still));
    const flicked = run(createSpringSettle(from, origin, { x: -3, y: 0, rot: 0 }));

    const past = (samples: Pose[]): number => Math.min(...samples.map((s) => s.x));
    expect(past(flicked)).toBeLessThan(past(gentle));
    expect(crossingMs(from.x, flicked)).toBeLessThan(crossingMs(from.x, gentle));
  });

  it('keeps the overshoot small — contact, not a bounce', () => {
    const settle = createSpringSettle({ x: 0.28, y: 0, rot: 0 }, origin, still);
    const samples = run(settle);
    // A tenth of a piece width at the very most; §09 wants a couple of pixels.
    expect(Math.min(...samples.map((s) => s.x))).toBeGreaterThan(-0.1);
  });

  it('comes to rest exactly on the target — the static layer bakes this', () => {
    const settle = createSpringSettle({ x: 0.28, y: -0.1, rot: 0.2 }, origin, still);
    run(settle, 2000);
    expect(settle.done).toBe(true);
    expect(settle.sample.x).toBe(0);
    expect(settle.sample.y).toBe(0);
    expect(settle.sample.rot).toBe(0);
  });

  it('finishes well inside a second even from the widest tolerance', () => {
    const settle = createSpringSettle({ x: 0.4, y: 0, rot: 0 }, origin, still);
    let elapsed = 0;
    while (!settle.done && elapsed < 2000) {
      settle.advance(1000 / 60);
      elapsed += 1000 / 60;
    }
    expect(settle.done).toBe(true);
    expect(elapsed).toBeLessThan(600);
  });

  it('survives a stalled frame instead of exploding', () => {
    // `interrupted` is a first-class state (§05): backgrounding the tab hands
    // the next frame a dt of seconds. An unsub-stepped explicit integrator turns
    // that into NaN and the piece disappears.
    const settle = createSpringSettle({ x: 0.3, y: 0.3, rot: 0 }, origin, still);
    const sample = settle.advance(4000);
    expect(Number.isFinite(sample.x)).toBe(true);
    expect(Math.abs(sample.x)).toBeLessThanOrEqual(0.3);
    expect(settle.done).toBe(true);
  });

  it('settles rotation on the same spring', () => {
    const settle = createSpringSettle({ x: 0, y: 0, rot: 0.2 }, origin, still);
    run(settle, 2000);
    expect(settle.sample.rot).toBe(0);
  });

  it('is already done when it starts on the target', () => {
    const settle = createSpringSettle(origin, origin, still);
    expect(settle.done).toBe(true);
  });
});

describe('reduced motion', () => {
  it('places in 120ms flat', () => {
    const settle = createLinearSettle({ x: 0.28, y: 0, rot: 0 }, origin);
    expect(REDUCED_MOTION_MS).toBe(120);

    settle.advance(60);
    expect(settle.sample.x).toBeCloseTo(0.14, 6);
    expect(settle.done).toBe(false);

    settle.advance(60);
    expect(settle.done).toBe(true);
    expect(settle.sample.x).toBe(0);
  });

  it('never overshoots — the whole point of the accommodation', () => {
    const settle = createLinearSettle({ x: 0.28, y: 0, rot: 0 }, origin);
    for (const sample of run(settle, 300)) {
      expect(sample.x).toBeGreaterThanOrEqual(0);
      expect(sample.x).toBeLessThanOrEqual(0.28);
    }
  });

  it('ignores release velocity, so a flick cannot reintroduce the overshoot', () => {
    const from: Pose = { x: 0.28, y: 0, rot: 0 };
    const settle = createSettle({
      from,
      to: origin,
      velocity: { x: -8, y: 0, rot: 0 },
      reducedMotion: true,
    });
    for (const sample of run(settle, 300)) expect(sample.x).toBeGreaterThanOrEqual(0);
  });
});

describe('createSettle', () => {
  it('springs by default and goes linear under reduced motion', () => {
    const from: Pose = { x: 0.28, y: 0, rot: 0 };
    const spring = run(createSettle({ from, to: origin }));
    const linear = run(createSettle({ from, to: origin, reducedMotion: true }));

    expect(Math.min(...spring.map((s) => s.x))).toBeLessThan(0);
    expect(Math.min(...linear.map((s) => s.x))).toBe(0);
  });
});
