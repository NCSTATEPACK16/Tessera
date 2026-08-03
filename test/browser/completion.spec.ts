/**
 * Completion (step 5c) — the banner, "again, harder", and Done.
 *
 * Solving a whole board is expensive, so this runs on the dock project only
 * and at the smallest ladder rung. It is the only test in the suite that
 * reaches `event.type === 'complete'` at all, which is what makes it worth
 * the minute it costs: the banner, `RuntimeSummary.status === 'complete'`,
 * and the delete-on-Done path have no other coverage anywhere.
 *
 * Zen mode, because every hint tier is free there — Tier 3's auto-place is
 * the only way a spec can place a specific piece without the app growing a
 * test-only hook (see `BoardPage.placeViaHint`).
 */

import { expect, test } from '@playwright/test';
import { BoardPage } from './board-page';

test.describe('completion', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'one solve is enough');

  test('solving shows the banner, and Done removes the puzzle from the library', async ({
    page,
  }) => {
    test.setTimeout(600_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    const board = await BoardPage.open(page, { pieceCount: 50, mode: 'Zen' });

    const { total } = await board.placed();
    expect(total).toBeGreaterThan(0);

    for (let i = 0; i < total; i++) {
      const [next] = await board.mountedIds();
      expect(next, `no chip left in the tray at ${i} of ${total}`).not.toBeUndefined();
      await board.placeViaHint(next!);
    }

    await expect(page.getByText('Puzzle complete')).toBeVisible();
    await expect(page.getByLabel('Play again, harder')).toBeVisible();

    await page.getByLabel('Done').click();
    await page.waitForTimeout(1000);
    expect(errors, 'Done raised an error').toEqual([]);

    // The only puzzle there was, so the library is empty again and is never
    // rendered — the entry flow goes straight back to the picker.
    await expect(page.getByRole('button', { name: 'Choose this photo' })).toBeVisible();
    await expect(page.getByLabel(/Open puzzle:/)).toHaveCount(0);
  });

  test('again-harder cuts the next rung up from the same photo', async ({ page }) => {
    test.setTimeout(600_000);
    const board = await BoardPage.open(page, { pieceCount: 50, mode: 'Zen' });
    const { total } = await board.placed();

    for (let i = 0; i < total; i++) {
      const [next] = await board.mountedIds();
      expect(next, `no chip left in the tray at ${i} of ${total}`).not.toBeUndefined();
      await board.placeViaHint(next!);
    }

    await page.getByLabel('Play again, harder').click();
    await board.waitForCut();

    // 50 -> 100 on the ladder. A target is not a promise (§04), so this
    // asserts "meaningfully bigger", not an exact count.
    await expect.poll(async () => (await board.placed()).total, { timeout: 60_000 }).toBeGreaterThan(total);
  });
});
