import { describe, expect, it } from 'vitest';
import { parseE2eStart } from '@/dev/e2e';

describe('parseE2eStart', () => {
  it('is null without the flag, so an ordinary visit is never routed', () => {
    expect(parseE2eStart('')).toBeNull();
    expect(parseE2eStart('?pieces=50&mode=zen')).toBeNull();
  });

  it('reads the count and mode the browser suite asks for', () => {
    expect(parseE2eStart('?e2e=1&pieces=150&mode=classic')).toEqual({ targetCount: 150, mode: 'classic' });
    expect(parseE2eStart('?e2e=1&pieces=50&mode=zen')).toEqual({ targetCount: 50, mode: 'zen' });
  });

  it('falls back to a 50-piece Zen board on missing or nonsense values', () => {
    expect(parseE2eStart('?e2e')).toEqual({ targetCount: 50, mode: 'zen' });
    expect(parseE2eStart('?e2e&pieces=lots&mode=hard')).toEqual({ targetCount: 50, mode: 'zen' });
    expect(parseE2eStart('?e2e&pieces=-3')).toEqual({ targetCount: 50, mode: 'zen' });
  });
});
