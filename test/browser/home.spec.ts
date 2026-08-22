/**
 * The Home screen (design spec 2026-08-22) — the one entry-screen decision
 * this file's own regression guard is worth having: a profile with history
 * lands on Home, not Library, and a truly fresh profile still skips straight
 * to first-run/the picker exactly as before (Decision 2). The seeding
 * pattern (open a Zen puzzle, place one piece via hint, reload) mirrors
 * `library.spec.ts`'s own "a saved session becomes a card" test — the
 * shortest real path to "one in-progress puzzle" this suite has.
 */

import { expect, test } from '@playwright/test';
import { BoardPage, reachPicker } from './board-page';

test('a fresh profile with zero history skips Home', async ({ page }) => {
  await page.addInitScript(() => {
    indexedDB.deleteDatabase('tessera');
  });
  await page.goto('/', { waitUntil: 'load' });
  await reachPicker(page);

  await expect(page.getByRole('button', { name: 'Choose this photo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Browse Photos' })).toHaveCount(0);
});

test('a profile with one in-progress puzzle lands on Home and shows Continue', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const board = await BoardPage.open(page, { mode: 'Zen' });
  const [first] = await board.mountedIds();
  await board.placeViaHint(first!);
  await page.waitForTimeout(1200);

  await page.reload({ waitUntil: 'load' });

  await expect(page.getByRole('button', { name: 'Continue your puzzle' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Browse Photos' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload Yours' })).toBeVisible();
});

test('Browse Photos and Upload Yours each reach the picker with the right source', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const board = await BoardPage.open(page, { mode: 'Zen' });
  const [first] = await board.mountedIds();
  await board.placeViaHint(first!);
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'load' });

  await page.getByRole('button', { name: 'Upload Yours' }).click();
  await expect(page.getByRole('button', { name: 'Upload photo' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.reload({ waitUntil: 'load' });
  await page.getByRole('button', { name: 'Browse Photos' }).click();
  await expect(page.getByRole('button', { name: 'Curated photos' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('the Your Puzzles link reaches Library, and Library’s Home link returns', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const board = await BoardPage.open(page, { mode: 'Zen' });
  const [first] = await board.mountedIds();
  await board.placeViaHint(first!);
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'load' });

  await page.getByRole('button', { name: /Your Puzzles/ }).click();
  await expect(page.getByLabel(/Open puzzle:/).first()).toBeVisible();

  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.getByRole('button', { name: 'Browse Photos' })).toBeVisible();
});
