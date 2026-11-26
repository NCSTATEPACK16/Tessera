import { describe, expect, it } from 'vitest';
import { HANDOFF_MS, HOMING_MS, handoffLiftScale, homingRect } from '@/play/handoff';

describe('handoffLiftScale', () => {
  it('starts at the chip’s scale and lands on the lift at 140ms', () => {
    expect(HANDOFF_MS).toBe(140);
    expect(handoffLiftScale(0, 0.4, 1.06)).toBe(0.4);
    expect(handoffLiftScale(140, 0.4, 1.06)).toBe(1.06);
    expect(handoffLiftScale(500, 0.4, 1.06)).toBe(1.06);
    expect(handoffLiftScale(-5, 0.4, 1.06)).toBe(0.4);
  });

  it('is monotone in between, growing or shrinking', () => {
    for (const [from, to] of [
      [0.4, 1.06],
      [2.5, 1.2],
    ] as const) {
      let last = handoffLiftScale(0, from, to);
      for (let t = 5; t <= 140; t += 5) {
        const next = handoffLiftScale(t, from, to);
        if (to > from) expect(next).toBeGreaterThanOrEqual(last);
        else expect(next).toBeLessThanOrEqual(last);
        last = next;
      }
    }
  });
});

describe('homingRect', () => {
  const from = { x: 100, y: 200, w: 80, h: 60 };
  const to = { x: 900, y: 700, w: 40, h: 30 };

  it('runs from the piece to the tray over 200ms, then is gone', () => {
    expect(HOMING_MS).toBe(200);
    expect(homingRect(from, to, 0)).toEqual(from);
    const near = homingRect(from, to, 199)!;
    expect(Math.abs(near.x - to.x)).toBeLessThan(2);
    expect(Math.abs(near.w - to.w)).toBeLessThan(1);
    expect(homingRect(from, to, 200)).toBeNull();
    expect(homingRect(from, to, 1000)).toBeNull();
  });

  it('moves every edge toward the target, never past it', () => {
    let last = homingRect(from, to, 0)!;
    for (let t = 10; t < 200; t += 10) {
      const next = homingRect(from, to, t)!;
      expect(next.x).toBeGreaterThanOrEqual(last.x);
      expect(next.x).toBeLessThanOrEqual(to.x);
      expect(next.w).toBeLessThanOrEqual(last.w);
      expect(next.w).toBeGreaterThanOrEqual(to.w);
      last = next;
    }
  });
});
