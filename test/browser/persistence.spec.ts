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
import { BoardPage, openTab } from './board-page';

test('a reload mid-session restores the board rather than resetting it', async ({ page }) => {
  test.setTimeout(90_000);

  const board = await BoardPage.open(page, { mode: 'Zen' });

  await board.autoPlace(2);
  const before = await board.placed();
  expect(before.placed).toBe(2);

  // Past the 800ms autosave debounce. A fixed sleep is right here precisely
  // because the debounce is what is under test.
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'load' });

  // A session exists now, so the app lands on Home, not the picker — one
  // tap on the Puzzles tab reaches the library (2026-08-22 spec).
  await openTab(page, 'Puzzles');
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

  await board.autoPlace();
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
  // drop it. The app lands on Home because a save exists; the Puzzles tab
  // reaches the library from there (2026-08-22 spec).
  await page.reload({ waitUntil: 'load' });
  await openTab(page, 'Puzzles');
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

  await board.autoPlace();

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

test('a thumbnail capture on an idle board does not wait for a frame', async ({ page }) => {
  // Every autosave awaits `captureThumbnail` before it writes anything. An
  // async canvas encode (`convertToBlob`/`toBlob`) is scheduled by Chromium as
  // an idle task, and on a page producing no frames it sits on a ~1s fallback
  // timeout instead. Since the tray's rAF heartbeat stopped running forever
  // (bug K, PR #18), an idle board produces no frames — correctly — so the
  // 800ms debounce became ~1.8s, and a reload inside that window lost the save
  // outright (`reference-panel.spec.ts` on dock). A player closing the tab in
  // that window loses it the same way.
  test.setTimeout(90_000);
  const board = await BoardPage.open(page, { pieceCount: 50, mode: 'Zen' });
  const [first] = await board.mountedIds();
  await board.dragOut(first!, await board.matPoint());
  // Past the settle spring and the debounced save it triggered, so the board
  // is genuinely idle: nothing drawing, nothing scheduled.
  await page.waitForTimeout(3000);

  const elapsed = await page.evaluate(async () => {
    // The module as the dev server serves it to the app itself. A string
    // variable, so `tsc` does not try to resolve a URL path as a module.
    const url = '/src/persist/thumbnail.ts';
    const { captureThumbnail } = (await import(url)) as typeof import('@/persist/thumbnail');
    const source = new OffscreenCanvas(1280, 960);
    const ctx = source.getContext('2d')!;
    ctx.fillStyle = '#c84';
    ctx.fillRect(0, 0, 1280, 960);
    const start = performance.now();
    const blob = await captureThumbnail(source);
    if (blob.type !== 'image/jpeg' || blob.size === 0) throw new Error('not a JPEG');
    return performance.now() - start;
  });

  expect(elapsed).toBeLessThan(250);
});
