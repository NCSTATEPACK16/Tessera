/**
 * The canonical order (§06).
 *
 * Two properties matter and both are cheap: it is stable for a seed, so a tray
 * survives a reload with the player's muscle memory intact, and it is a
 * permutation, so no piece is quietly lost or duplicated. The third assertion —
 * that it is *not* cut order — is the one that would otherwise be discovered by
 * a player noticing the photograph reassembled in their tray.
 */

import { describe, expect, it } from 'vitest';
import { canonicalOrder, reorder } from '@/tray/order';

const ids = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

describe('canonicalOrder', () => {
  it('is stable for a seed', () => {
    expect(canonicalOrder(ids(200), 7)).toEqual(canonicalOrder(ids(200), 7));
  });

  it('differs between seeds', () => {
    expect(canonicalOrder(ids(200), 7)).not.toEqual(canonicalOrder(ids(200), 8));
  });

  it('is a permutation of every piece', () => {
    const order = canonicalOrder(ids(204), 3);
    expect(order).toHaveLength(204);
    expect([...order].sort((a, b) => a - b)).toEqual(ids(204));
  });

  it('is not cut order — the tray must not reassemble the photograph', () => {
    const order = canonicalOrder(ids(200), 11);
    const inPlace = order.filter((id, index) => id === index).length;
    // A shuffle of 200 leaves about one fixed point on average; a dozen would
    // mean the shuffle is barely doing anything.
    expect(inPlace).toBeLessThan(10);
  });

  it('handles the degenerate sizes', () => {
    expect(canonicalOrder([], 1)).toEqual([]);
    expect(canonicalOrder([4], 1)).toEqual([4]);
  });
});

describe('reorder', () => {
  it('moves a piece before another and leaves the rest alone', () => {
    expect(reorder([1, 2, 3, 4], 4, 2)).toEqual([1, 4, 2, 3]);
  });

  it('moves to the end when there is nothing to sit before', () => {
    expect(reorder([1, 2, 3], 1, null)).toEqual([2, 3, 1]);
  });

  it('is a no-op for a piece that is not in the order', () => {
    expect(reorder([1, 2, 3], 9, 2)).toEqual([1, 2, 3]);
  });
});
