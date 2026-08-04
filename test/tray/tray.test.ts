/**
 * The tray model (§06).
 *
 * `a lens change never reflows the order` is the one that matters: it is §06's
 * promise stated as a test, at the level a player would actually notice it —
 * turn a filter on, turn it off, and everything is where you left it.
 */

import { describe, expect, it } from 'vitest';
import { TrayModel } from '@/tray/tray';
import type { TrayPiece } from '@/tray/tray';
import type { PieceLocation } from '@/tray/lenses';
import { RECENT_LIMIT, RecentPieces } from '@/tray/recent';

const COLS = 5;
const ROWS = 4;
const N = COLS * ROWS;

function pieces(): TrayPiece[] {
  return Array.from({ length: N }, (_, id) => {
    const col = id % COLS;
    const row = Math.floor(id / COLS);
    return {
      id,
      isEdge: col === 0 || row === 0 || col === COLS - 1 || row === ROWS - 1,
      isCorner: (col === 0 || col === COLS - 1) && (row === 0 || row === ROWS - 1),
      meanColor: [20 + col * 40, 200 - row * 30, 60 + ((col + row) % 4) * 45] as [
        number,
        number,
        number,
      ],
      colorVariance: 0.05,
      targetX: col,
      targetY: row,
      worldW: 1,
      worldH: 1,
    };
  });
}

function model(locations = new Map<number, PieceLocation>()): TrayModel {
  return new TrayModel({
    pieces: pieces(),
    seed: 42,
    locationOf: (id) => locations.get(id) ?? 'tray',
  });
}

describe('TrayModel', () => {
  it('a lens change never reflows the order', () => {
    const tray = model();
    const all = tray.visible('all', null, null);

    const edges = tray.visible('edges', null, null);
    tray.visible('corners', null, null);

    expect(tray.visible('all', null, null)).toEqual(all);
    // And the filtered view was drawn from the same order, in the same places.
    expect(edges).toEqual(all.filter((id) => edges.includes(id)));
  });

  it('hides a piece the moment it goes to the mat and again when it is placed', () => {
    const locations = new Map<number, PieceLocation>();
    const tray = model(locations);

    expect(tray.visible('all', null, null)).toHaveLength(N);
    locations.set(7, 'mat');
    expect(tray.visible('all', null, null)).toHaveLength(N - 1);
    locations.set(7, 'placed');
    expect(tray.visible('all', null, null)).toHaveLength(N - 1);
  });

  it('counts every lens for the chip row, and marks region locked', () => {
    const counts = model().lensCounts(null);
    const byLens = new Map(counts.map((entry) => [entry.lens, entry]));

    expect(byLens.get('all')?.count).toBe(N);
    expect(byLens.get('corners')?.count).toBe(4);
    expect(byLens.get('region')?.enabled).toBe(false);
    expect(byLens.get('edges')?.enabled).toBe(true);
  });

  it('unlocks region counts once a view rectangle exists', () => {
    const counts = model().lensCounts({ x: 0, y: 0, w: 2, h: 2 });
    const region = counts.find((entry) => entry.lens === 'region')!;
    expect(region.enabled).toBe(true);
    expect(region.count).toBe(4);
  });

  it('holds no selection of its own — the chrome store owns the lens', () => {
    const tray = model() as unknown as Record<string, unknown>;
    // Two homes for "which lens is active" means one of them is stale, and the
    // stale one is always the one being rendered from.
    expect(tray['lens']).toBeUndefined();
    expect(tray['setLens']).toBeUndefined();
  });

  it('remembers what was touched and forgets what was placed', () => {
    const locations = new Map<number, PieceLocation>();
    const tray = model(locations);

    tray.touch(3);
    locations.set(3, 'mat');
    expect(tray.visible('recent', null, null)).toEqual([3]);

    tray.place(3);
    expect(tray.visible('recent', null, null)).toEqual([]);
  });

  it('reorders only when the player asks', () => {
    const tray = model();
    const before = [...tray.order];
    const moved = before[5]!;

    tray.moveInOrder(moved, before[1]!);
    expect(tray.order[1]).toBe(moved);
    expect([...tray.order].sort((a, b) => a - b)).toEqual(
      [...before].sort((a, b) => a - b),
    );
  });

  it('the shelf is in canonical order, not pin order', () => {
    const tray = model();
    const first = tray.order[3]!;
    const second = tray.order[1]!;

    tray.pin(first);
    tray.pin(second);

    // Canonical, so the later-pinned piece comes first — the muscle memory §06
    // protects does not stop applying because there are two chips instead of 200.
    expect(tray.pinned).toEqual([second, first]);
  });

  it('a pinned piece is on the shelf and out of the grid', () => {
    const tray = model();
    const id = tray.order[0]!;
    tray.pin(id);

    expect(tray.pinned).toContain(id);
    expect(tray.visible('all', null, null)).not.toContain(id);

    tray.unpin(id);
    expect(tray.visible('all', null, null)).toContain(id);
  });

  it('a piece that leaves the tray leaves the shelf, without calling unpin', () => {
    const locations = new Map<number, PieceLocation>();
    const tray = model(locations);
    const id = tray.order[0]!;

    tray.pin(id);
    locations.set(id, 'mat');

    // No unpin call: the getter's own live-location filter must be what hides
    // it, not a prior unpin. This is the assertion that catches deleting the
    // `&& this.options.locationOf(id) === 'tray'` clause from the getter.
    expect(tray.pinned).not.toContain(id);

    // Moving it back to 'tray' makes it reappear, because `pinned_` still holds
    // the id — nothing here has cleared it. That is correct for this class in
    // isolation: clearing the pin on deploy is Task 8's job, in
    // `PlayRuntime.onPlayEvent`, not this getter's. Asserting the opposite would
    // require TrayModel to duplicate that responsibility.
    locations.set(id, 'tray');
    expect(tray.pinned).toContain(id);
  });

  it('pin() silently rejects a piece that is not in the tray', () => {
    const locations = new Map<number, PieceLocation>();
    const tray = model(locations);
    const id = tray.order[0]!;

    locations.set(id, 'mat');
    tray.pin(id);

    expect(tray.isPinned(id)).toBe(false);
    expect(tray.pinned).not.toContain(id);
  });
});

describe('RecentPieces', () => {
  it('holds twenty and evicts the oldest', () => {
    const ring = new RecentPieces();
    for (let i = 0; i < RECENT_LIMIT + 5; i++) ring.touch(i);

    expect(ring.size).toBe(RECENT_LIMIT);
    expect(ring.has(0)).toBe(false);
    expect(ring.has(RECENT_LIMIT + 4)).toBe(true);
  });

  it('re-touching refreshes rather than duplicating', () => {
    const ring = new RecentPieces();
    for (let i = 0; i < RECENT_LIMIT; i++) ring.touch(i);

    ring.touch(0);
    ring.touch(999);

    expect(ring.size).toBe(RECENT_LIMIT);
    expect(ring.has(0)).toBe(true);
    expect(ring.has(1)).toBe(false);
  });
});

describe('restoreOrder / restorePinned / pinned', () => {
  it('pinnedIds reflects pin() calls as an array', () => {
    const tray = model();
    const ids = tray.order;
    tray.pin(ids[0]!);
    tray.pin(ids[1]!);
    expect(tray.pinnedIds).toEqual(expect.arrayContaining([ids[0], ids[1]]));
    expect(tray.pinnedIds).toHaveLength(2);
  });

  it('restoreOrder replaces the order wholesale', () => {
    const tray = model();
    const reversed = [...tray.order].reverse();
    tray.restoreOrder(reversed);
    expect([...tray.order]).toEqual(reversed);
  });

  it('a restored order still feeds the lenses as the canonical order', () => {
    // The invariant that outlives a reload: every lens's output is a
    // subsequence of whatever the canonical order currently is.
    const tray = model();
    const reversed = [...tray.order].reverse();
    tray.restoreOrder(reversed);
    const edges = tray.visible('edges', null, null);
    let cursor = -1;
    for (const id of edges) {
      const next = reversed.indexOf(id);
      expect(next).toBeGreaterThan(cursor);
      cursor = next;
    }
  });

  it('restorePinned sets pin state without re-checking location', () => {
    const locations = new Map<number, PieceLocation>();
    const tray = model(locations);
    const ids = tray.order;
    // Deliberately not in the tray: pin() would refuse, restorePinned must not.
    locations.set(ids[0]!, 'mat');
    tray.restorePinned([ids[0]!, ids[2]!]);
    expect(tray.isPinned(ids[0]!)).toBe(true);
    // ...and the shelf still filters it out, as it always has.
    expect(tray.pinned).not.toContain(ids[0]!);
    expect(tray.isPinned(ids[2]!)).toBe(true);
    expect(tray.isPinned(ids[1]!)).toBe(false);
  });

  it('restorePinned clears any prior pin state first', () => {
    const tray = model();
    const ids = tray.order;
    tray.pin(ids[0]!);
    tray.restorePinned([ids[1]!]);
    expect(tray.isPinned(ids[0]!)).toBe(false);
    expect(tray.isPinned(ids[1]!)).toBe(true);
  });
});
