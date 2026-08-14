/**
 * The library (step 5c).
 *
 * The regression guard that matters most here is the *absence* of a screen: a
 * first visit with nothing saved must never show an empty library apologising
 * to a first-time player — the failure mode the design decision was made
 * against, and it is one line of `App.tsx` away. §16's guided twelve now sits
 * between a truly fresh profile and the picker (covered on its own in
 * `first-run.spec.ts`'s "a brand-new player lands on the guided twelve, not
 * the picker"), so this test reaches the picker via skip, the same "reachable
 * from any beat" exit a real player has, and re-asserts the one thing that is
 * still this file's to guard: no empty-library screen anywhere on the way.
 */

import { expect, test } from '@playwright/test';
import { BoardPage, reachPicker } from './board-page';

test('a fresh, empty library is never rendered — the first visit lands on the picker', async ({
  page,
}) => {
  await page.addInitScript(() => {
    indexedDB.deleteDatabase('tessera');
  });
  await page.goto('/', { waitUntil: 'load' });
  await reachPicker(page);

  await expect(page.getByRole('button', { name: 'Choose this photo' })).toBeVisible();
  await expect(page.getByLabel('Your Puzzles')).toHaveCount(0);
  await expect(page.getByLabel(/Open puzzle:/)).toHaveCount(0);
});

test('a saved session becomes a card that opens back onto its board', async ({ page }) => {
  test.setTimeout(90_000);
  const board = await BoardPage.open(page, { mode: 'Zen' });
  const { total } = await board.placed();

  const [first] = await board.mountedIds();
  await board.placeViaHint(first!);
  await page.waitForTimeout(1200);

  await page.reload({ waitUntil: 'load' });

  // The card carries the real computed grid, never the target (§04).
  const card = page.getByLabel(/Open puzzle: \d+ × \d+/).first();
  await expect(card).toBeVisible();
  await expect(card).toContainText(`1 / ${total}`);

  await card.click();
  await board.waitForCut();
  expect((await board.placed()).placed).toBe(1);
});

test('New Puzzle from the library reaches the picker', async ({ page }) => {
  test.setTimeout(90_000);
  const board = await BoardPage.open(page, { mode: 'Zen' });
  const [first] = await board.mountedIds();
  await board.placeViaHint(first!);
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'load' });

  await expect(page.getByLabel(/Open puzzle:/).first()).toBeVisible();
  await page.getByLabel('New puzzle').click();
  await expect(page.getByRole('button', { name: 'Choose this photo' })).toBeVisible();
});
