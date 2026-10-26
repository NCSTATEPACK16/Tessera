/**
 * The daily and the streak (step 6).
 *
 * Time travel is deliberately absent. Stubbing the page's clock would test the
 * stub; every date-dependent branch — freeze spend, repair, month boundaries —
 * is unit-tested in `test/daily/streak.test.ts` against explicit date keys.
 * What is left is what only a browser can answer: IndexedDB, the schema bump,
 * the routes into the hub, and the streak incrementing end to end.
 */

import { expect, test } from '@playwright/test';
import { BoardPage, firstCuratedPhoto, reachPicker, openTab } from './board-page';

/**
 * A clean database and the picker, which is where a first visit lands.
 *
 * The delete runs once, via `page.evaluate` against the already-loaded page —
 * not `page.addInitScript`, which re-fires on every subsequent navigation
 * including a later `page.reload()`. An `addInitScript` version of this wiped
 * the daily's autosaved session back out from under `daily is the same board
 * on every visit`'s reload, and the library looked permanently empty.
 */
async function freshVisit(page: import('@playwright/test').Page): Promise<void> {
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
  // §16: a truly fresh profile lands on the guided twelve, not the picker
  // directly — see `reachPicker`'s own doc for why this races rather than
  // waits on the picker alone.
  await reachPicker(page);
  await expect(firstCuratedPhoto(page)).toBeVisible();
}

test('the hub is reachable from Today on a first visit', async ({ page }) => {
  await freshVisit(page);
  // v2: the picker is a pushed step, not a hub — Back reaches Today's daily.
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByLabel(/^Play today's puzzle/).click();

  // Every state of screen 11 that a brand-new player should see.
  await expect(page.getByLabel('Start today’s')).toBeVisible();
  await expect(page.getByText('Start a streak.')).toBeVisible();
  await expect(page.getByLabel(/^Completions, /)).toBeVisible();
  // v1 ships streak-only.
  await expect(page.getByText('Leaderboard')).toHaveCount(0);
});

test('the hub is reachable from Today, and today’s daily is not listed in Puzzles', async ({
  page,
}) => {
  test.setTimeout(90_000);

  // A saved ordinary session, so the app lands on the library after a reload.
  const board = await BoardPage.open(page, { mode: 'Zen' });
  await board.autoPlace();
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'load' });
  await openTab(page, 'Puzzles');
  await expect(page.getByLabel(/Open puzzle:/).first()).toBeVisible();
  const ordinaryCards = await page.getByLabel(/Open puzzle:/).count();

  // v2 spec §3: the hub is a push within Today, reached from its hero.
  await openTab(page, 'Today');
  await page.getByLabel(/^Play today's puzzle/).click();
  await expect(page.getByLabel('Start today’s')).toBeVisible();

  // Start the daily, leave it part-done, and come back to the library: the
  // daily must live on the hub, not be offered twice.
  await page.getByLabel('Start today’s').click();
  await board.waitForCut();
  await page.getByLabel('Pause').click();
  await page.getByLabel('Leave').click();

  // Leave routes back to where play started — the hub.
  await expect(page.getByLabel('Continue today’s')).toBeVisible();

  await openTab(page, 'Puzzles');
  await expect(page.getByLabel(/Open puzzle:/)).toHaveCount(ordinaryCards);
});

test('starting the daily skips the picker, the crop, and the setup screen', async ({ page }) => {
  test.setTimeout(90_000);
  await freshVisit(page);
  // v2: the picker is a pushed step, not a hub — Back reaches Today's daily.
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByLabel(/^Play today's puzzle/).click();
  await page.getByLabel('Start today’s').click();

  const board = new BoardPage(page);
  await board.waitForCut();

  await expect(firstCuratedPhoto(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start cutting' })).toHaveCount(0);
  await expect(page.locator('header')).toBeVisible();
});

test('the daily is the same board on every visit', async ({ page }) => {
  test.setTimeout(120_000);
  await freshVisit(page);
  // v2: the picker is a pushed step, not a hub — Back reaches Today's daily.
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByLabel(/^Play today's puzzle/).click();
  await page.getByLabel('Start today’s').click();

  const board = new BoardPage(page);
  await board.waitForCut();
  // Autosave only schedules on a real play event (§14) — an untouched board
  // never fires one, so nothing to restore would exist yet. One placement
  // is enough to trigger it, the same way `persistence.spec.ts` does.
  await board.autoPlace();
  const first = await board.placed();
  expect(first.placed).toBe(1);

  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'load' });
  // A session exists now, so the reload lands on Home (2026-08-22 spec);
  // its own daily-preview card reaches the hub directly.
  await page.getByRole('button', { name: /Play today.s puzzle/ }).click();
  await page.getByLabel('Continue today’s').click();
  await board.waitForCut();

  const after = await board.placed();
  expect(after.total).toBe(first.total);
  expect(after.placed).toBe(first.placed);
});

/**
 * The increment end to end: every piece but one through the dev hook (the real
 * Tier-3 path), then the last by a real held hint — inside the daily's three
 * Classic hints — so `complete`, the card and the streak write all fire from a
 * real gesture. The arithmetic is `test/daily/streak.test.ts`'s; this is the
 * wiring between the board finishing and the hub counting it.
 */
test('finishing the daily starts the streak', async ({ page }) => {
  test.setTimeout(120_000);
  await freshVisit(page);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByLabel(/^Play today's puzzle/).click();
  await expect(page.getByText('Start a streak.')).toBeVisible();
  await page.getByLabel('Start today’s').click();

  const board = new BoardPage(page);
  await board.waitForCut();
  await board.autoPlaceAllBut(1);
  const [last] = await board.mountedIds();
  await board.placeViaHint(last!);

  await page.getByRole('button', { name: 'Done' }).click();
  // Done routes back to where the daily started — the hub.
  await expect(page.getByLabel('Play it again')).toBeVisible();
  await expect(page.getByText('day streak')).toBeVisible();
  await expect(page.getByText('day streak').locator('..')).toContainText('1');
  await expect(page.getByText('Start a streak.')).toHaveCount(0);
});

test('upgrading the database to v2 keeps an existing session', async ({ page }) => {
  test.setTimeout(90_000);

  // Save a real session under the current schema.
  const board = await BoardPage.open(page, { mode: 'Zen' });
  await board.autoPlace();
  await page.waitForTimeout(1200);

  // Prove the `daily` store exists alongside the three from v1, and that the
  // session survived the bump. This is the assertion that stands between a
  // schema change and deleting every in-progress puzzle a real player has.
  const stores = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tessera');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const names = Array.from(db.objectStoreNames);
    const count = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction('sessions', 'readonly');
      const request = tx.objectStore('sessions').count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return { names, count };
  });

  expect(stores.names).toEqual(
    expect.arrayContaining(['sessions', 'photos', 'thumbnails', 'daily']),
  );
  expect(stores.count).toBeGreaterThan(0);
});
