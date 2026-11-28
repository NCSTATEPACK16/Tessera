/** The top bar's lines (modernize spec §5): what it says in each state. */

import { describe, expect, it } from 'vitest';
import { topBarModel } from '@/play/top-bar';

const cut = { done: 0, total: 0 };

describe('topBarModel', () => {
  it('playing: n / N, and the fraction placed', () => {
    const model = topBarModel({ status: 'playing', placed: 35, total: 104, cut });
    expect(model.count).toBe('35 / 104');
    expect(model.progress).toBeCloseTo(35 / 104);
  });

  it('complete reads the same way, full', () => {
    expect(topBarModel({ status: 'complete', placed: 104, total: 104, cut })).toEqual({
      count: '104 / 104',
      progress: 1,
    });
  });

  it('cutting already reads n / N once the total is known; the line stays empty', () => {
    expect(
      topBarModel({ status: 'cutting', placed: 0, total: 104, cut: { done: 12, total: 104 } }),
    ).toEqual({ count: '0 / 104', progress: 0 });
    expect(topBarModel({ status: 'cutting', placed: 0, total: 0, cut }).count).toBe('Cutting');
  });

  it('failed says so', () => {
    expect(topBarModel({ status: 'failed', placed: 0, total: 0, cut }).count).toBe(
      'The cut failed',
    );
  });

  it('no pieces is no progress, never NaN', () => {
    expect(topBarModel({ status: 'playing', placed: 0, total: 0, cut }).progress).toBe(0);
  });
});
