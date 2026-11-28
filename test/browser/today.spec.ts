/**
 * Today's hero states (modernize spec §4, §11 row b): each one renders the
 * right single primary, and the others are absent. The decisions themselves
 * are `test/play/today.test.ts`'s; this is the wiring — the library entry for
 * `daily-YYYY-MM-DD`, the completion row, the streak — reaching the screen.
 *
 * No puzzle is played to get anywhere: `autoPlace` is the real Tier-3 path,
 * and the one finish below uses a real held hint for its last piece.
 */

import { expect, test, type Page } from '@playwright/test';
import { BoardPage, firstCuratedPhoto, reachPicker } from './board-page';

const hero = (page: Page) => page.getByRole('region', { name: 'Today’s puzzle' });

/** A clean database, then Back from the picker onto Today — a first visit. */
async function firstVisitToday(page: Page): Promise<void> {
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
  await reachPicker(page);
  await expect(firstCuratedPhoto(page)).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(hero(page)).toBeVisible();
}

test('first visit: Start, an invitation instead of a rail, and nothing scolds', async ({
  page,
}) => {
  await firstVisitToday(page);
  await expect(hero(page).getByRole('button', { name: /^Start today/ })).toBeVisible();
  await expect(hero(page).getByRole('button', { name: /^Keep going/ })).toHaveCount(0);
  await expect(hero(page).getByRole('button', { name: 'See your card' })).toHaveCount(0);

  await expect(page.getByText('Any photo works. Start with one you like looking at.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New puzzle' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^Continue your puzzle/ })).toHaveCount(0);
  await expect(page.getByText('Start one today')).toBeVisible();
  await expect(page.getByText('Finished puzzles hang here.')).toBeVisible();
});

test('not played, with a puzzle in progress: Start, and the rail', async ({ page }) => {
  test.setTimeout(90_000);
  const board = await BoardPage.open(page, { pieceCount: 50, mode: 'Zen' });
  await board.autoPlace();
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'load' });

  await expect(hero(page).getByRole('button', { name: /^Start today/ })).toBeVisible();
  await expect(hero(page).getByRole('button', { name: /^Keep going/ })).toHaveCount(0);
  // The snapshot's photoId survived the reload: a curated photo with a
  // non-daily id has no other way to its name, so it would read "Your photo".
  const rail = page.getByRole('button', { name: /^Continue your puzzle/ });
  await expect(rail).toHaveCount(1);
  await expect(rail).not.toHaveAccessibleName(/^Continue your puzzle: Your photo,/);
  await expect(page.getByRole('button', { name: 'All puzzles' })).toBeVisible();
  // The invitation is for an empty rail only.
  await expect(page.getByText('Any photo works.', { exact: false })).toHaveCount(0);
});

test('in progress: Keep going, with its ring, back onto the same board', async ({ page }) => {
  test.setTimeout(120_000);
  await firstVisitToday(page);
  await hero(page).getByRole('button', { name: /^Start today/ }).click();
  const board = new BoardPage(page);
  await board.waitForCut();
  await board.autoPlace(3);
  const saved = await board.placed();
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'load' });

  const keepGoing = hero(page).getByRole('button', { name: /^Keep going/ });
  await expect(keepGoing).toBeVisible();
  await expect(hero(page).getByRole('button', { name: /^Start today/ })).toHaveCount(0);
  await expect(hero(page).getByRole('progressbar')).toBeVisible();
  await expect(hero(page)).toContainText(`${saved.placed} of ${saved.total} placed`);
  // The board thumbnail has the board's aspect; the hero shows all of it.
  await expect(hero(page).locator('img')).toHaveCSS('object-fit', 'contain');
  // The daily is never a rail card — one puzzle, one place to resume it.
  await expect(page.getByRole('button', { name: /^Continue your puzzle/ })).toHaveCount(0);

  await keepGoing.click();
  await board.waitForCut();
  expect(await board.placed()).toEqual(saved);
});

test('done: See your card, a worded badge, and the dot gone', async ({ page }) => {
  test.setTimeout(120_000);
  await firstVisitToday(page);
  await hero(page).getByRole('button', { name: /^Start today/ }).click();
  const board = new BoardPage(page);
  await board.waitForCut();
  await board.autoPlaceAllBut(1);
  const [last] = await board.mountedIds();
  await board.placeViaHint(last!);
  await page.getByRole('button', { name: 'Done' }).click();
  // Done returns to where the daily started; Today is one tab away.
  await page.getByRole('navigation', { name: 'Tabs' }).getByRole('button', { name: 'Today' }).click();

  await expect(hero(page).getByRole('button', { name: 'See your card' })).toBeVisible();
  await expect(hero(page).getByText('Done today')).toBeVisible();
  await expect(hero(page).getByRole('button', { name: /^Start today|^Keep going/ })).toHaveCount(0);
  await expect(page.getByLabel('Daily not played yet')).toHaveCount(0);
  await expect(page.getByText('1 finished')).toBeVisible();

  await hero(page).getByRole('button', { name: 'See your card' }).click();
  await expect(page.getByRole('img', { name: 'Puzzle card' })).toBeVisible();
});

test('offline: the row sits below the hero, never over its button', async ({ page, context }) => {
  await firstVisitToday(page);
  await context.setOffline(true);
  const row = page.getByText('You’re offline. Puzzles you’ve started still work.');
  await expect(row).toBeVisible();

  const start = hero(page).getByRole('button', { name: /^Start today/ });
  await expect(start).toBeEnabled();
  const heroBox = (await hero(page).boundingBox())!;
  const rowBox = (await row.boundingBox())!;
  expect(rowBox.y).toBeGreaterThanOrEqual(heroBox.y + heroBox.height);
  await context.setOffline(false);
});

test('at 200% type the hero grows to hold its copy, never clipping it', async ({ page }) => {
  await firstVisitToday(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '32px'; // 200% of the 16px root
  });
  const heroBox = (await hero(page).boundingBox())!;
  const title = (await hero(page).getByRole('heading').boundingBox())!;
  const start = (await hero(page).getByRole('button', { name: /^Start today/ }).boundingBox())!;
  expect(title.y).toBeGreaterThanOrEqual(heroBox.y);
  expect(start.y + start.height).toBeLessThanOrEqual(heroBox.y + heroBox.height);
});

test('the derived accent tokens follow the daily’s accent, not the root’s', async ({ page }) => {
  await firstVisitToday(page);
  const { accent, dim, glow } = await page.evaluate(() => {
    const shell = document.querySelector('main')!.parentElement!;
    const style = getComputedStyle(shell);
    return {
      accent: shell.style.getPropertyValue('--accent').trim(),
      dim: style.getPropertyValue('--accent-dim'),
      glow: style.getPropertyValue('--accent-glow'),
    };
  });
  // A daily accent that happened to equal the fallback would prove nothing.
  expect(accent.toLowerCase()).not.toBe('#6fa8ff');
  expect(dim).toContain(accent);
  expect(glow).toContain(accent);
});

test('the streak card’s name reads the week, one period per sentence', async ({ page }) => {
  await firstVisitToday(page);
  const card = page.getByRole('button', { name: /^Daily streak/ });
  const name = (await card.getAttribute('aria-label'))!;
  expect(name).toContain('This week:');
  expect(name).not.toContain('..');
});
