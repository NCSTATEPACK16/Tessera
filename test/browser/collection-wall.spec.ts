/**
 * The collection wall (step 8, §15) — "the strongest retention lever in the
 * product." A finished puzzle becomes a tile that survives reload and reopens
 * its card. Reachable from the picker (where a player with no in-progress
 * puzzles lands) and the library alike.
 *
 * Two of these solve a whole board, so they run on the dock project only, at
 * the smallest ladder rung — the same posture as `completion.spec.ts`.
 */

import { expect, test } from '@playwright/test';
import { BoardPage, reachPicker } from './board-page';

test.describe('collection wall', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'one solve is enough');

  test('the wall is an invitation when empty, not an apology', async ({ page }) => {
    await page.addInitScript(() => {
      window.crypto.randomUUID = () =>
        'ffffffff-ffff-4fff-8fff-ffffffffffff' as `${string}-${string}-${string}-${string}-${string}`;
    });
    await page.goto('/', { waitUntil: 'load' });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const request = indexedDB.deleteDatabase('tessera');
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
          request.onblocked = () => resolve();
        }),
    );
    await page.reload({ waitUntil: 'load' });
    // §16: a truly fresh profile lands on the guided twelve, which has no
    // "Collection" entry point — see `reachPicker`'s own doc.
    await reachPicker(page);

    await page.getByRole('button', { name: 'Collection' }).click();
    await expect(page.getByText(/finished puzzles/i)).toBeVisible();
    // No "you have nothing", no "0 puzzles".
    await expect(page.getByText(/^0 /)).toHaveCount(0);
  });

  test('a finished puzzle becomes a tile, and the tile reopens its card', async ({ page }) => {
    test.setTimeout(600_000);
    await BoardPage.openZenAndComplete(page);
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Collection' }).click();

    const tiles = page.getByRole('button', { name: /Puzzle finished/ });
    await expect(tiles).toHaveCount(1);
    await tiles.first().click();
    await expect(page.getByRole('img', { name: 'Puzzle card' })).toBeVisible();
  });

  test('the wall survives a reload — it is a possession, not session state', async ({ page }) => {
    test.setTimeout(600_000);
    await BoardPage.openZenAndComplete(page);
    await page.getByRole('button', { name: 'Done' }).click();
    // Done writes the completion, then navigates to the picker — waiting for
    // that landing is what proves the async save committed before the reload.
    await expect(page.getByRole('button', { name: 'Choose this photo' })).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Collection' }).click();
    await expect(page.getByRole('button', { name: /Puzzle finished/ })).toHaveCount(1);
  });
});
