/**
 * v2 spec §3: three tabs — Today, Puzzles, Collection. Present on the three
 * peer screens and the daily hub, absent in setup and on the board. A phone
 * gets a bottom bar; anything 768pt wide or more gets a floating bar on top.
 */

import { expect, test, type Page } from '@playwright/test';
import { BoardPage } from './board-page';

const tabs = (page: Page) => page.getByRole('navigation', { name: 'Tabs' });
const tab = (page: Page, name: string) => tabs(page).getByRole('button', { name, exact: true });

/** One in-progress puzzle, then a reload onto Today. */
async function seedHistory(page: Page): Promise<void> {
  const board = await BoardPage.open(page, { pieceCount: 50, mode: 'Zen' });
  await board.autoPlace();
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'load' });
  await expect(tabs(page)).toBeVisible();
}

test('three tabs, each showing its own screen', { tag: '@phone' }, async ({ page }) => {
  test.setTimeout(90_000);
  await seedHistory(page);

  await expect(tabs(page).getByRole('button')).toHaveText(['Today', 'Puzzles', 'Collection']);
  await expect(tab(page, 'Today')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'Continue your puzzle' })).toBeVisible();

  await tab(page, 'Puzzles').click();
  await expect(tab(page, 'Puzzles')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByLabel(/Open puzzle:/).first()).toBeVisible();

  await tab(page, 'Collection').click();
  await expect(tab(page, 'Collection')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText(/Your finished puzzles gather here/)).toBeVisible();

  await tab(page, 'Today').click();
  await expect(page.getByRole('button', { name: 'Continue your puzzle' })).toBeVisible();
});

test('the tab bar is absent in setup and on the board', async ({ page }) => {
  test.setTimeout(90_000);
  await seedHistory(page);

  await page.getByRole('button', { name: 'New puzzle' }).click();
  await expect(page.getByRole('button', { name: /^Curated photo:/ }).first()).toBeVisible();
  await expect(tabs(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Continue your puzzle' }).click();
  await new BoardPage(page).waitForCut();
  await expect(tabs(page)).toHaveCount(0);
});

test('a phone gets a bottom bar', { tag: '@phone' }, async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, 'the dock gets the top bar');
  test.setTimeout(90_000);
  await seedHistory(page);
  const box = await tabs(page).boundingBox();
  const viewport = page.viewportSize()!;
  expect(Math.round(box!.y + box!.height)).toBe(viewport.height);
});

test('a wide screen gets a floating bar on top', async ({ page }) => {
  test.setTimeout(90_000);
  await seedHistory(page);
  const box = await tabs(page).boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.y).toBeLessThan(40);
  // Centred, and not edge to edge.
  expect(box!.width).toBeLessThan(viewport.width / 2);
  expect(Math.abs(box!.x + box!.width / 2 - viewport.width / 2)).toBeLessThan(2);
});

test('Today carries a dot while the daily is unplayed', async ({ page }) => {
  test.setTimeout(90_000);
  await seedHistory(page);
  await expect(tab(page, 'Today').getByLabel('Daily not played yet')).toBeVisible();
});

test('the daily hub is a push within Today, with a way back', async ({ page }) => {
  test.setTimeout(90_000);
  await seedHistory(page);
  await page.getByRole('button', { name: /Play today's puzzle/ }).click();
  await expect(page.getByRole('button', { name: /Start today/ })).toBeVisible();
  await expect(tab(page, 'Today')).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue your puzzle' })).toBeVisible();
});

test('the gear opens Settings, and Tray side persists', async ({ page }) => {
  test.setTimeout(90_000);
  await seedHistory(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const sheet = page.getByRole('dialog', { name: 'Settings' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'How to play' })).toBeVisible();

  await sheet.getByRole('button', { name: 'Tray side: Left' }).click();
  await expect(sheet.getByRole('button', { name: 'Tray side: Left' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Tray side: Left' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('no banner is ever fixed over the screen', async ({ page }) => {
  test.setTimeout(90_000);
  await seedHistory(page);
  for (const name of ['Today', 'Puzzles', 'Collection']) {
    await tab(page, name).click();
    await expect(page.locator('[role="status"].fixed')).toHaveCount(0);
  }
});
