/**
 * The gap the 2026-11-15 test review found (modernize spec §11 row c): every
 * placement in the suite went through `autoPlace`, the Tier-3 path, so nothing
 * proved a piece dragged by a hand actually lands. This one does — out of the
 * tray, across the seam onto the canvas, and released over its own slot.
 */

import { expect, test } from '@playwright/test';
import { BoardPage } from './board-page';

test(
  'a piece dragged by hand from the tray onto its own slot is placed',
  { tag: ['@phone', '@smoke'] },
  async ({ page }) => {
    test.setTimeout(90_000);
    const board = await BoardPage.open(page, { pieceCount: 50, mode: 'Zen' });
    await board.autoPlace(10);
    const before = await board.placed();

    // A chip whose slot is clear of the tray — the sheet on a phone, the dock
    // beside the board otherwise. Dropped over the tray, a piece goes home,
    // which is a different test.
    const tray = (await board.tray.boundingBox())!;
    const clear = (p: { x: number; y: number }): boolean =>
      p.x < tray.x - 24 || p.x > tray.x + tray.width + 24 || p.y < tray.y - 24;
    let target: { id: number; at: { x: number; y: number } } | null = null;
    for (const id of await board.mountedIds()) {
      const at = await board.slotPoint(id);
      if (at && clear(at)) {
        target = { id, at };
        break;
      }
    }
    expect(target, 'a mounted chip with a slot above the tray').not.toBeNull();

    await board.dragOut(target!.id, target!.at);
    await expect.poll(async () => (await board.placed()).placed).toBe(before.placed + 1);
    await expect(board.chip(target!.id)).toHaveCount(0);
  },
);
