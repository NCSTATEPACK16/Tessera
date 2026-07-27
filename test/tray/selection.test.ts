/**
 * The selection set (§06).
 *
 * The load-bearing property is that **selection is over pieces, not over the
 * view**. A lens change is a change of what is on screen and nothing else, so a
 * selected piece the new lens hides is still selected and still counts toward
 * the pull-out total. Anything else and a player who selects five edges, checks
 * the colour bins, and comes back finds an empty selection.
 */

import { describe, expect, it } from 'vitest';
import { TraySelection } from '@/tray/selection';

describe('TraySelection', () => {
  it('keeps selection order, which is what the badges render', () => {
    const selection = new TraySelection();
    selection.toggle(30);
    selection.toggle(7);
    selection.toggle(19);

    expect(selection.ordered).toEqual([30, 7, 19]);
    expect(selection.badgeOf(7)).toBe(2);
  });

  it('badges are 1-based, and 0 means not selected', () => {
    const selection = new TraySelection();
    selection.toggle(4);

    expect(selection.badgeOf(4)).toBe(1);
    expect(selection.badgeOf(5)).toBe(0);
  });

  it('toggling off closes the gap in the badge numbers', () => {
    const selection = new TraySelection();
    selection.toggle(1);
    selection.toggle(2);
    selection.toggle(3);
    selection.toggle(2);

    expect(selection.ordered).toEqual([1, 3]);
    expect(selection.badgeOf(3)).toBe(2);
  });

  it('re-selecting a piece puts it at the end, not back in its old slot', () => {
    const selection = new TraySelection();
    selection.toggle(1);
    selection.toggle(2);
    selection.toggle(1);
    selection.toggle(1);

    expect(selection.ordered).toEqual([2, 1]);
  });

  it('remove is idempotent and never throws on a stranger', () => {
    const selection = new TraySelection();
    selection.toggle(8);
    selection.remove(8);
    selection.remove(8);
    selection.remove(99);

    expect(selection.size).toBe(0);
  });

  it('clear empties it', () => {
    const selection = new TraySelection();
    selection.toggle(1);
    selection.toggle(2);
    selection.clear();

    expect(selection.ordered).toEqual([]);
    expect(selection.has(1)).toBe(false);
  });
});
