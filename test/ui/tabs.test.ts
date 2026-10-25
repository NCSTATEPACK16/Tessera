// v2 spec §3: three tabs, and the tab bar is hidden everywhere else.
// `tabOf` is the whole decision of which screens show it; `TabBar` only draws.
import { describe, expect, it } from 'vitest';
import { tabOf } from '@/ui/tabs';

describe('tabOf', () => {
  it('puts home and the daily hub under Today', () => {
    expect(tabOf('home')).toBe('today');
    expect(tabOf('daily')).toBe('today');
  });
  it('maps the library to Puzzles and the wall to Collection', () => {
    expect(tabOf('library')).toBe('puzzles');
    expect(tabOf('wall')).toBe('collection');
  });
  it('hides the bar in setup, play, the first run and while checking', () => {
    for (const screen of ['setup', 'playing', 'first-run', 'checking']) {
      expect(tabOf(screen)).toBeNull();
    }
  });
});
