import { describe, expect, it } from 'vitest';
import { HANDOFF_MS, handoffLiftScale } from '@/play/handoff';

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
