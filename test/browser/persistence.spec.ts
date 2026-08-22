/**
 * Save and resume (§14) — the only place it can be observed at all.
 *
 * Persistence across a reload is browser-only by construction: IndexedDB does
 * not exist in vitest's node environment, so `src/persist/*` has no unit-test
 * surface and this file is where the whole path — the 800ms debounce, the
 * snapshot, `Board.restore`, the tray/workset/camera replay — earns its keep.
 *
 * The load-bearing assertion is placed-count identity across the reload. A
 * restore that silently deployed the tray, or lost cluster 0's membership,
 * would show up here and nowhere else.
 */

import { expect, test } from '@playwright/test';
import { BoardPage } from './board-page';

test('a reload mid-session restores the board rather than resetting it', async ({ page }) => {
  test.setTimeout(90_000);

  // Zen: every hint tier is free, which is what lets `placeViaHint` actually
  // place a piece without inventing a test-only hook.
  const board = await BoardPage.open(page, { mode: 'Zen' });

  const [first, second] = await board.mountedIds();
  await board.placeViaHint(first!);
  await board.placeViaHint(second!);
  const before = await board.placed();
  expect(before.placed).toBe(2);

  // Past the 800ms autosave debounce. A fixed sleep is right here precisely
  // because the debounce is what is under test.
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'load' });

  // A session exists now, so the app lands on Home, not the picker — one
  // tap through "Your Puzzles" reaches the library (2026-08-22 spec).
  await page.getByRole('button', { name: /Your Puzzles/ }).click();
  const card = page.getByLabel(/Open puzzle:/).first();
  await expect(card).toBeVisible();
  await card.click();

  await board.waitForCut();
  const after = await board.placed();
  expect(after.placed).toBe(before.placed);
  expect(after.total).toBe(before.total);
});

test('the v2 to v3 bump is additive — it adds `completions` and loses nothing', async ({
  page,
}) => {
  test.setTimeout(90_000);

  // `open()` deletes the database, so the app creates it fresh at the current
  // version. The claim under test is the shape of that current version: v3,
  // with `completions` alongside every store step 6 and before it created —
  // the same additive guarantee `daily.spec.ts` asserts for v1→v2.
  const board = await BoardPage.open(page, { mode: 'Zen' });

  const [first] = await board.mountedIds();
  await board.placeViaHint(first!);
  // Past the 800ms autosave debounce, so a real session exists to survive.
  await page.waitForTimeout(1200);

  const schema = await page.evaluate(
    () =>
      new Promise<{ version: number; names: string[] }>((resolve, reject) => {
        const request = indexedDB.open('tessera');
        request.onsuccess = () => {
          const db = request.result;
          const result = { version: db.version, names: [...db.objectStoreNames] };
          db.close();
          resolve(result);
        };
        request.onerror = () => reject(request.error);
      }),
  );

  expect(schema.version).toBe(3);
  expect(schema.names).toEqual(
    expect.arrayContaining(['sessions', 'photos', 'thumbnails', 'daily', 'completions']),
  );

  // The session written before this read still restores — the bump did not
  // drop it. The app lands on Home because a save exists; "Your Puzzles"
  // reaches the library from there (2026-08-22 spec).
  await page.reload({ waitUntil: 'load' });
  await page.getByRole('button', { name: /Your Puzzles/ }).click();
  const card = page.getByLabel(/Open puzzle:/).first();
  await expect(card).toBeVisible();
  await card.click();
  await board.waitForCut();
  expect((await board.placed()).placed).toBe(1);
});

test('a session left through the pause sheet is still there on the next visit', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const board = await BoardPage.open(page, { mode: 'Zen' });

  const [first] = await board.mountedIds();
  await board.placeViaHint(first!);

  // Leave runs the synchronous save through `interrupt()` — the same path
  // `visibilitychange` uses — so the card is current the moment it appears.
  await page.getByLabel('Pause').click();
  await page.getByLabel('Leave').click();

  const card = page.getByLabel(/Open puzzle:/).first();
  await expect(card).toBeVisible();
  await card.click();
  await board.waitForCut();
  expect((await board.placed()).placed).toBe(1);
});
