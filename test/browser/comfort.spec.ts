/**
 * Comfort mode (§C Track 3): one flag, toggled from the pause sheet, that
 * widens every touch target to 60pt and floors snap tolerance at Generous.
 */

import { expect, test } from '@playwright/test';
import { BoardPage } from './board-page';

test('comfort mode widens buttons past 44px', async ({ page }) => {
  const board = await BoardPage.open(page);
  void board;

  await page.getByLabel('Pause').click();
  const resume = page.getByLabel('Resume');
  const before = await resume.boundingBox();
  expect(before?.height).toBeGreaterThanOrEqual(44);
  expect(before?.height).toBeLessThan(60);

  await page.getByLabel('Comfort mode').click();
  const after = await resume.boundingBox();
  expect(after?.height).toBeGreaterThanOrEqual(60);
});

test('comfort mode widens a square icon toggle too, not just full-width rows', async ({
  page,
}) => {
  const board = await BoardPage.open(page);
  void board;

  await page.getByLabel('Pause').click();
  const edgeHighlight = page.getByLabel('Edge highlight');
  const before = await edgeHighlight.boundingBox();
  expect(before?.width).toBeGreaterThanOrEqual(44);
  expect(before?.width).toBeLessThan(60);

  await page.getByLabel('Comfort mode').click();
  const after = await edgeHighlight.boundingBox();
  expect(after?.width).toBeGreaterThanOrEqual(60);
});

test('comfort mode floors snap tolerance and disables the tighter two', async ({ page }) => {
  const board = await BoardPage.open(page);
  void board;

  await page.getByLabel('Pause').click();
  await page.getByLabel('Snap tolerance: Precise').click();
  await expect(page.getByLabel('Snap tolerance: Precise')).toHaveAttribute('aria-pressed', 'true');

  await page.getByLabel('Comfort mode').click();
  await expect(page.getByLabel('Snap tolerance: Generous')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Snap tolerance: Precise')).toBeDisabled();
  await expect(page.getByLabel('Snap tolerance: Standard')).toBeDisabled();
});

test('a puzzle resumed with comfort already on opens floored at Generous', async ({ page }) => {
  test.setTimeout(90_000);
  const board = await BoardPage.open(page, { mode: 'Zen' });

  // A library entry needs some session activity, same as persistence.spec.ts.
  const [first] = await board.mountedIds();
  await board.placeViaHint(first!);

  await page.getByLabel('Pause').click();
  await page.getByLabel('Comfort mode').click();
  await page.getByLabel('Resume').click();

  // Past the 800ms autosave debounce, same as persistence.spec.ts.
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'load' });

  // A session exists now, so the app lands on Home, not the picker — one
  // tap through "Your Puzzles" reaches the library (2026-08-22 spec).
  await page.getByRole('button', { name: /Your Puzzles/ }).click();
  await page.getByLabel(/Open puzzle:/).first().click();
  await board.waitForCut();

  await page.getByLabel('Pause').click();
  await expect(page.getByLabel('Snap tolerance: Generous')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Snap tolerance: Precise')).toBeDisabled();
});
