/**
 * Worksets (§06's pull-out), and the invariant the whole feature rests on.
 *
 * A Workset is **not a cluster.** §05's island is a welded group holding true
 * relative offsets; §06's pull-out group is a loose grid that deliberately does
 * not. Making pull-out a union-find cluster would hand `snap.ts` geometry that
 * is wrong by construction, and it would resolve against it with no error raised
 * and nothing drawn differently — the same silent class of failure that
 * `SnapOptions.eligible` exists to prevent.
 *
 * So the load-bearing assertion here is `membership ends on merge`. A placed
 * piece still counted in a group draws a containing outline stretching into the
 * assembled board: wrong on screen, silent everywhere else.
 */

import { describe, expect, it } from 'vitest';
import type { Rect } from '@/core/geom';
import {
  WORKSET_DROP_TOLERANCE,
  WorksetStore,
  escapedBounds,
  worksetBounds,
} from '@/play/workset';

const box = (x: number, y: number, w = 1, h = 1): Rect => ({ x, y, w, h });

describe('WorksetStore', () => {
  it('a piece is in at most one Workset', () => {
    const store = new WorksetStore();
    store.create([1, 2, 3]);
    const second = store.create([3, 4, 5]);

    expect(store.worksetOf(3)?.id).toBe(second);
    expect(store.all().find((w) => w.id !== second)?.pieceIds).toEqual([1, 2]);
  });

  it('membership ends on merge — the silent failure this file exists for', () => {
    const store = new WorksetStore();
    const id = store.create([1, 2, 3]);

    store.remove(2);

    expect(store.worksetOf(2)).toBeUndefined();
    expect(store.get(id)?.pieceIds).toEqual([1, 3]);
  });

  it('dissolves below two members, because a group of one is not a group', () => {
    const store = new WorksetStore();
    const id = store.create([1, 2]);

    store.remove(1);

    expect(store.get(id)).toBeUndefined();
    expect(store.worksetOf(2)).toBeUndefined();
    expect(store.all()).toEqual([]);
  });

  it('auto-labels in sequence, and rename sticks', () => {
    const store = new WorksetStore();
    const first = store.create([1, 2]);
    const second = store.create([3, 4]);

    expect(store.get(first)?.label).toBe('Set 1');
    expect(store.get(second)?.label).toBe('Set 2');

    store.rename(first, 'the roof');
    expect(store.get(first)?.label).toBe('the roof');
  });

  it('refuses to create a group of fewer than two', () => {
    const store = new WorksetStore();
    expect(store.create([1])).toBe(-1);
    expect(store.all()).toEqual([]);
  });

  it('never hides a member — collapse was removed at plan 0', () => {
    const store = new WorksetStore();
    const id = store.create([1, 2]);
    expect(store.worksetOf(1)?.id).toBe(id);
    // The mat's only remaining gate is `inTray`. If a second predicate ever
    // returns here, `rebuild`, `scene` and `contentBounds` must all consult it —
    // see CLAUDE.md. Honouring one without the others draws pieces the player
    // cannot grab.
    expect('isHidden' in store).toBe(false);
  });
});

describe('worksetBounds', () => {
  it('is the bounding box of the members it can locate', () => {
    const boxes = new Map<number, Rect>([
      [1, box(0, 0)],
      [2, box(4, 3)],
    ]);

    expect(worksetBounds([1, 2], (id) => boxes.get(id) ?? null)).toEqual({
      x: 0,
      y: 0,
      w: 5,
      h: 4,
    });
  });

  it('is null when nothing can be located', () => {
    expect(worksetBounds([1, 2], () => null)).toBeNull();
  });
});

describe('escapedBounds', () => {
  const bounds = box(0, 0, 10, 10);

  it('a piece inside the box has not escaped', () => {
    expect(escapedBounds(box(4, 4), bounds, WORKSET_DROP_TOLERANCE)).toBe(false);
  });

  it('a piece just outside is still within tolerance', () => {
    expect(escapedBounds(box(10.5, 4), bounds, WORKSET_DROP_TOLERANCE)).toBe(false);
  });

  it('a piece dragged clear across the mat has escaped', () => {
    expect(escapedBounds(box(40, 4), bounds, WORKSET_DROP_TOLERANCE)).toBe(true);
  });

  /**
   * The project's own rule: *a test that passes at both extremes of the constant
   * it is guarding is not testing that constant.* This one fails at zero and at
   * infinity, so the tolerance is genuinely load-bearing here.
   */
  it('the tolerance actually decides — it is not slack', () => {
    const just = box(11.5, 4);
    expect(escapedBounds(just, bounds, 0)).toBe(true);
    expect(escapedBounds(just, bounds, Infinity)).toBe(false);
  });
});
