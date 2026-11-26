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

// Modernize C3: the thumbnail is the board, framed to the board — not the
// camera's view of it — with the photo unlit under the placed pieces, so an
// early board is not a black rectangle. Zoomed in first, so a capture of the
// static layer (the old path) would be cropped to the viewport's aspect.
test("an early board's thumbnail shows the photo, framed to the board", async ({ page }) => {
  test.setTimeout(90_000);
  const board = await BoardPage.open(page, { mode: 'Zen' });
  await board.zoom(3);
  await board.autoPlace();
  await page.waitForTimeout(1200);

  const read = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tessera');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const get = <T,>(store: string): Promise<T[]> =>
      new Promise((resolve, reject) => {
        const request = db.transaction(store).objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
      });
    const [session] = await get<{ cols: number; rows: number }>('sessions');
    const [thumb] = await get<{ blob: Blob }>('thumbnails');
    const bitmap = await createImageBitmap(thumb!.blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    let sum = 0;
    let sumSq = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const y = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
      sum += y;
      sumSq += y * y;
    }
    const mean = sum / n;
    // The board frame's own rect — camera maths, not clipped to the viewport.
    const frame = (
      window as unknown as {
        __tessera: { frameRect(): { left: number; top: number; right: number; bottom: number } | null };
      }
    ).__tessera.frameRect()!;
    return {
      aspect: bitmap.width / bitmap.height,
      boardAspect: (frame.right - frame.left) / (frame.bottom - frame.top),
      gridAspect: session!.cols / session!.rows,
      stdDev: Math.sqrt(sumSq / n - mean * mean),
    };
  });

  // The board's own aspect, to the thumbnail's pixel rounding — a capture of
  // the zoomed camera view would carry the viewport's instead.
  expect(Math.abs(read.aspect / read.boardAspect - 1)).toBeLessThan(0.02);
  // And near the grid's, since pieces are near-square (0.82–1.22).
  expect(read.aspect / read.gridAspect).toBeGreaterThan(0.82);
  expect(read.aspect / read.gridAspect).toBeLessThan(1.22);
  // A flat dark rectangle has a deviation of ~0; the unlit photo has texture.
  expect(read.stdDev).toBeGreaterThan(6);
});
