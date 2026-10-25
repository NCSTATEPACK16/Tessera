/**
 * The library (step 5c).
 *
 * The "no empty library on a first visit" guard lives in `home.spec.ts`'s
 * fresh-profile test, alongside the other entry-screen decision.
 */

import { expect, test } from '@playwright/test';
import { BoardPage, firstCuratedPhoto, openTab } from './board-page';

test('a saved session becomes a card that opens back onto its board', async ({ page }) => {
  test.setTimeout(90_000);
  const board = await BoardPage.open(page, { mode: 'Zen' });
  const { total } = await board.placed();

  await board.autoPlace();
  await page.waitForTimeout(1200);

  await page.reload({ waitUntil: 'load' });
  // A profile with history now lands on Home first (2026-08-22 spec) — one
  // tap on the Puzzles tab reaches the library exactly as before.
  await openTab(page, 'Puzzles');

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
  await board.autoPlace();
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'load' });
  // A profile with history now lands on Home first (2026-08-22 spec).
  await openTab(page, 'Puzzles');

  await expect(page.getByLabel(/Open puzzle:/).first()).toBeVisible();
  await page.getByLabel('New puzzle').click();
  await expect(firstCuratedPhoto(page)).toBeVisible();
});
