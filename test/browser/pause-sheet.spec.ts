/**
 * The pause sheet (step 5c).
 *
 * The invariant under test in the first case is that pausing is an *overlay*:
 * `PlayRuntime` is never torn down, so resuming does not re-cut. A version
 * that unmounted the runtime would still look correct in a screenshot and
 * would cost a second and a half of worker time on every resume, so the proof
 * is that the board is immediately interactive again.
 */

import { expect, test } from '@playwright/test';
import { BoardPage } from './board-page';

test('pause and resume leaves the runtime intact', async ({ page }) => {
  const board = await BoardPage.open(page);
  const before = await board.remaining();

  await page.getByLabel('Pause').click();
  await expect(page.getByLabel('Pause sheet backdrop')).toBeVisible();
  await page.getByLabel('Resume').click();
  await expect(page.getByLabel('Pause sheet backdrop')).toHaveCount(0);

  // No re-cut: the board answers a drag immediately, with the same piece set.
  const [first] = await board.mountedIds();
  await board.dragOut(first!, await board.matPoint());
  await expect(board.chip(first!)).toHaveCount(0);
  expect(await board.remaining()).toBe(before);
});

test('the backdrop dismisses the sheet, same as Resume', async ({ page }) => {
  const board = await BoardPage.open(page);
  await page.getByLabel('Pause').click();
  await page.getByLabel('Pause sheet backdrop').click({ position: { x: 5, y: 5 } });
  await expect(page.getByLabel('Pause sheet backdrop')).toHaveCount(0);
  await expect(board.chips.first()).toBeVisible();
});

test('restart is a two-step confirm, and cancelling changes nothing', async ({ page }) => {
  test.setTimeout(90_000);
  const board = await BoardPage.open(page, { mode: 'Zen' });
  const [first] = await board.mountedIds();
  await board.placeViaHint(first!);
  expect((await board.placed()).placed).toBe(1);

  await page.getByLabel('Pause').click();
  await page.getByLabel('Restart').click();
  await expect(page.getByLabel('Confirm restart')).toBeVisible();
  await page.getByLabel('Cancel restart').click();
  await expect(page.getByLabel('Confirm restart')).toHaveCount(0);
  await page.getByLabel('Resume').click();

  expect((await board.placed()).placed).toBe(1);
});

test('confirming restart returns the board to zero placed', async ({ page }) => {
  test.setTimeout(90_000);
  const board = await BoardPage.open(page, { mode: 'Zen' });
  const [first] = await board.mountedIds();
  await board.placeViaHint(first!);
  expect((await board.placed()).placed).toBe(1);

  await page.getByLabel('Pause').click();
  await page.getByLabel('Restart').click();
  await page.getByLabel('Confirm restart').click();

  await expect(page.getByLabel('Pause sheet backdrop')).toHaveCount(0);
  await board.waitForCut();
  // Polled, not read once: the restart tears down one runtime and cuts a
  // whole new board, and the header keeps the old count until it lands.
  await expect
    .poll(async () => (await board.placed()).placed, { timeout: 30_000 })
    .toBe(0);
});

test('a settings toggle persists its state across opening and closing the sheet', async ({
  page,
}) => {
  await BoardPage.open(page);

  await page.getByLabel('Pause').click();
  const edgeHighlight = page.getByLabel('Edge highlight');
  await expect(edgeHighlight).toHaveAttribute('aria-pressed', 'false');
  await edgeHighlight.click();
  await expect(edgeHighlight).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Resume').click();

  await page.getByLabel('Pause').click();
  await expect(page.getByLabel('Edge highlight')).toHaveAttribute('aria-pressed', 'true');
});

test('snap tolerance can be changed mid-session', async ({ page }) => {
  await BoardPage.open(page);

  await page.getByLabel('Pause').click();
  await expect(page.getByLabel('Snap tolerance: Standard')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByLabel('Snap tolerance: Generous').click();
  await expect(page.getByLabel('Snap tolerance: Generous')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByLabel('Snap tolerance: Standard')).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  await page.getByLabel('Resume').click();
  await page.getByLabel('Pause').click();
  await expect(page.getByLabel('Snap tolerance: Generous')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('the reference image opens from the sheet and dismisses on tap', async ({ page }) => {
  await BoardPage.open(page);

  await page.getByLabel('Pause').click();
  await page.getByLabel('Reference image').click();

  const overlay = page.getByLabel('Reference image overlay');
  await expect(overlay).toBeVisible();
  await overlay.click({ position: { x: 5, y: 5 } });
  await expect(overlay).toHaveCount(0);
  await expect(page.getByLabel('Resume')).toBeVisible();
});
