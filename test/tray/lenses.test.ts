/**
 * The lenses (§06). The load-bearing test in this file is `is a subsequence`.
 *
 * "Filters hide and reveal within that order; they do not reflow it. Turn a
 * filter off and every remaining piece is exactly where you left it." Every
 * competitor destroys that by re-sorting on each filter change, and the way it
 * gets destroyed here is someone adding a comparator to `lenses.ts` for a
 * plausible reason. The subsequence property catches it across all six lenses in
 * one assertion, so there is no lens for which the guard has to be remembered.
 */

import { describe, expect, it } from 'vitest';
import { LENSES, lensEnabled, visible } from '@/tray/lenses';
import type { Lens, LensPiece, LensView, PieceLocation } from '@/tray/lenses';
import { MIXED_BIN } from '@/tray/colour';

const COLS = 5;
const ROWS = 4;
const N = COLS * ROWS;

function piece(id: number, overrides: Partial<LensPiece> = {}): LensPiece {
  const col = id % COLS;
  const row = Math.floor(id / COLS);
  return {
    id,
    location: 'tray',
    isEdge: col === 0 || row === 0 || col === COLS - 1 || row === ROWS - 1,
    isCorner: (col === 0 || col === COLS - 1) && (row === 0 || row === ROWS - 1),
    colourBin: id % 6,
    targetX: col,
    targetY: row,
    worldW: 1,
    worldH: 1,
    ...overrides,
  };
}

function build(overrides: Record<number, Partial<LensPiece>> = {}): Map<number, LensPiece> {
  const map = new Map<number, LensPiece>();
  for (let id = 0; id < N; id++) map.set(id, piece(id, overrides[id] ?? {}));
  return map;
}

/** Deliberately not sorted: the canonical order is a shuffle. */
const ORDER = [13, 2, 19, 7, 0, 11, 4, 16, 9, 1, 18, 5, 12, 3, 17, 8, 14, 6, 10, 15];

const view = (overrides: Partial<LensView> = {}): LensView => ({
  region: null,
  recent: new Set<number>(),
  pinned: new Set<number>(),
  ...overrides,
});

function isSubsequence(subset: readonly number[], order: readonly number[]): boolean {
  let cursor = 0;
  for (const id of subset) {
    cursor = order.indexOf(id, cursor);
    if (cursor < 0) return false;
    cursor++;
  }
  return true;
}

describe('visible', () => {
  it('is a subsequence of the canonical order, for every lens', () => {
    const pieces = build();
    const v = view({ region: { x: 0, y: 0, w: 2, h: 2 }, recent: new Set([19, 2, 15]) });

    for (const lens of LENSES) {
      const shown = visible(ORDER, pieces, lens, lens === 'colour' ? 3 : null, v);
      expect(isSubsequence(shown, ORDER), `${lens} reflowed the canonical order`).toBe(true);
    }
  });

  it('shows every tray piece under All', () => {
    expect(visible(ORDER, build(), 'all', null, view())).toEqual(ORDER);
  });

  it('never shows a placed piece, under any lens', () => {
    const placed: Record<number, Partial<LensPiece>> = {};
    for (const id of [0, 4, 15, 19]) placed[id] = { location: 'placed' satisfies PieceLocation };
    const pieces = build(placed);
    const v = view({ region: { x: 0, y: 0, w: 99, h: 99 }, recent: new Set([0, 4, 15, 19]) });

    for (const lens of LENSES) {
      const shown = visible(ORDER, pieces, lens, null, v);
      expect(shown).not.toContain(0);
      expect(shown).not.toContain(19);
    }
  });

  it('drops a piece from the tray lenses once it is on the mat', () => {
    const pieces = build({ 7: { location: 'mat' } });
    expect(visible(ORDER, pieces, 'all', null, view())).not.toContain(7);
  });

  it('Edges keeps only straight-sided pieces, corners included', () => {
    const shown = visible(ORDER, build(), 'edges', null, view());
    // The interior of a 5×4 is the 3×2 block of ids 6,7,8,11,12,13.
    expect(shown).not.toContain(6);
    expect(shown).not.toContain(12);
    expect(shown).toContain(0);
    expect(shown).toHaveLength(N - 6);
  });

  it('Corners keeps exactly four', () => {
    expect(visible(ORDER, build(), 'corners', null, view()).sort((a, b) => a - b)).toEqual([
      0, 4, 15, 19,
    ]);
  });

  it('Colour keeps one bin, and the mixed bin is selectable like any other', () => {
    const pieces = build({ 7: { colourBin: MIXED_BIN }, 12: { colourBin: MIXED_BIN } });
    expect(visible(ORDER, pieces, 'colour', MIXED_BIN, view()).sort((a, b) => a - b)).toEqual([
      7, 12,
    ]);
  });
});

describe('the Region lens', () => {
  it('is locked with no region, and shows nothing rather than everything', () => {
    expect(visible(ORDER, build(), 'region', null, view())).toEqual([]);
    expect(lensEnabled('region', view())).toBe(false);
  });

  it('keeps pieces whose destination intersects the view, not their position', () => {
    // Ids 0,1,5,6 are the top-left 2×2 of destinations.
    const shown = visible(
      ORDER,
      build(),
      'region',
      null,
      view({ region: { x: 0, y: 0, w: 2, h: 2 } }),
    );
    expect(shown.sort((a, b) => a - b)).toEqual([0, 1, 5, 6]);
  });

  it('unlocks the moment a region exists', () => {
    expect(lensEnabled('region', view({ region: { x: 0, y: 0, w: 1, h: 1 } }))).toBe(true);
  });

  it('every other lens is always offered — an empty lens is information', () => {
    for (const lens of LENSES.filter((l): l is Lens => l !== 'region')) {
      expect(lensEnabled(lens, view())).toBe(true);
    }
  });
});

describe('the Recent lens', () => {
  it('reaches onto the mat, which is the only reason it exists', () => {
    const pieces = build({ 7: { location: 'mat' }, 12: { location: 'mat' } });
    const shown = visible(ORDER, pieces, 'recent', null, view({ recent: new Set([7, 12]) }));
    expect(shown.sort((a, b) => a - b)).toEqual([7, 12]);
  });

  it('presents in canonical order, never newest-first', () => {
    const pieces = build();
    // 2 sits before 19 in ORDER; touching 19 last must not float it to the top.
    const shown = visible(ORDER, pieces, 'recent', null, view({ recent: new Set([19, 2]) }));
    expect(shown).toEqual([2, 19]);
  });
});

describe('the shelf (pinned)', () => {
  it('a pinned piece leaves every lens — the shelf is where it lives now', () => {
    const pieces = build();
    const v = view({ recent: new Set([13]), pinned: new Set([13]) });

    for (const lens of LENSES) {
      expect(visible(ORDER, pieces, lens, null, v), `${lens} showed a pinned piece`).not.toContain(
        13,
      );
    }
  });

  it('pinning is still a filter, so the subsequence property holds', () => {
    const pieces = build();
    const out = visible(ORDER, pieces, 'all', null, view({ pinned: new Set([2, 7, 11]) }));

    expect(isSubsequence(out, ORDER)).toBe(true);
  });
});
