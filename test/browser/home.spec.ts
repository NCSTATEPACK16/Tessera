/**
 * Today (v2 spec §3), born as the 2026-08-22 Home screen. The entry decision
 * is still this file's own regression guard: a profile with history lands on
 * Today, and a truly fresh profile still skips straight to first-run/the
 * picker exactly as before. The seeding pattern (open a Zen puzzle, place one
 * piece, reload) is the shortest real path to "one in-progress puzzle".
 * The tabs themselves are `tabs.spec.ts`'s, and so are Continue, New puzzle and the
 * daily hero on a seeded Today — two tests that re-asserted them here were
 * deleted after mutation checks (2026-11-15 redundancy review, D1/D2).
 */

import { expect, test, type Page } from '@playwright/test';
import { BoardPage, firstCuratedPhoto, reachPicker } from './board-page';

async function seedOneInProgress(page: Page): Promise<void> {
  const board = await BoardPage.open(page, { mode: 'Zen' });
  await board.autoPlace();
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'load' });
}

test('a fresh profile with zero history skips Today', async ({ page }) => {
  await page.addInitScript(() => {
    indexedDB.deleteDatabase('tessera');
  });
  await page.goto('/', { waitUntil: 'load' });
  await reachPicker(page);

  await expect(firstCuratedPhoto(page)).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Tabs' })).toHaveCount(0);
  // Nor an empty library apologising to a first-time player (step 5c).
  await expect(page.getByLabel(/Open puzzle:/)).toHaveCount(0);
});

test('the hero caption is readable over the photo', async ({ page }) => {
  test.setTimeout(90_000);
  await seedOneInProgress(page);
  // B7: the caption was `--mat-void` on a black gradient — 1.0:1. It must be
  // light ink now; the scrim under it is what makes that hold on any photo.
  const color = await page
    .getByRole('region', { name: 'Today’s puzzle' })
    .getByRole('heading')
    .evaluate((el) => getComputedStyle(el).color);
  const [r, g, b] = color.match(/\d+/g)!.map(Number);
  expect((r! + g! + b!) / 3).toBeGreaterThan(200);
});
