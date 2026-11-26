/**
 * The sheet's physics (modernize spec §5 Motion, C1): a rubber band past the
 * detents, a release projected from velocity, and a critically damped settle
 * that never overshoots.
 */

import { describe, expect, it } from 'vitest';
import { releaseTarget, rubberBand, settleSheet } from '@/ui/sheet-motion';

describe('rubberBand', () => {
  it('follows the finger 1:1 between the detents', () => {
    expect(rubberBand(300, 100, 600)).toBe(300);
  });

  it('past an edge, the excess at 0.35×', () => {
    expect(rubberBand(700, 100, 600)).toBe(635);
    expect(rubberBand(40, 100, 600)).toBe(79);
  });
});

describe('releaseTarget', () => {
  const detents = [100, 350, 760] as const;

  it('at rest, the nearest detent', () => {
    expect(releaseTarget(300, 0, detents)).toBe(350);
    expect(releaseTarget(200, 0, detents)).toBe(100);
  });

  it('projects 0.18s ahead, one step at a time below 1800 px/s', () => {
    // 120 + 1000 × 0.18 = 300 → 350.
    expect(releaseTarget(120, 1000, detents)).toBe(350);
    // 120 + 1700 × 0.18 = 426 → 350.
    expect(releaseTarget(120, 1700, detents)).toBe(350);
    expect(releaseTarget(120, -1700, detents)).toBe(100);
  });

  it('a hard flick may skip a detent', () => {
    expect(releaseTarget(120, 2500, detents)).toBe(760);
    // 760 − 3500 × 0.18 = 130 → 100, two detents down.
    expect(releaseTarget(760, -3500, detents)).toBe(100);
  });

  it('a slower flick that would skip a detent is held to one step', () => {
    // 100 + 1750 × 0.18 = 415 → 350 anyway; force a skip with a closer full.
    expect(releaseTarget(100, 1750, [100, 200, 420])).toBe(200);
  });
});

describe('settleSheet', () => {
  const run = (from: { h: number; v: number }, target: number, seconds: number) => {
    const trace: number[] = [];
    let state = { ...from, done: false };
    for (let i = 0; i < seconds * 120 && !state.done; i++) {
      state = settleSheet(state, target, 1 / 120);
      trace.push(state.h);
    }
    return { trace, state };
  };

  it('even a release faster than critical damping absorbs never passes it', () => {
    const { trace } = run({ h: 100, v: 9000 }, 350, 2);
    expect(Math.max(...trace)).toBeLessThanOrEqual(350);
  });

  it('a fast release toward a detent never passes it', () => {
    const { trace, state } = run({ h: 100, v: 3000 }, 350, 2);
    expect(Math.max(...trace)).toBeLessThanOrEqual(350.5);
    expect(state.done).toBe(true);
    expect(state.h).toBe(350);
  });

  it('comes to rest within a second', () => {
    const { trace, state } = run({ h: 100, v: 0 }, 350, 1);
    expect(state.done).toBe(true);
    expect(trace.length).toBeLessThanOrEqual(120);
  });

  it('from rest it moves one way only', () => {
    const { trace } = run({ h: 760, v: 0 }, 350, 1);
    for (let i = 1; i < trace.length; i++) expect(trace[i]!).toBeLessThanOrEqual(trace[i - 1]!);
  });
});
