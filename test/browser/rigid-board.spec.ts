/**
 * The board stays still unless the player moves it.
 *
 * Each case is a way it used to lurch when the player only meant to grab a
 * piece (see `input/pointer.ts` and `render/camera-controls.ts`): a tap then a
 * grab refit the view (double-tap-to-fit), and a fingertip that missed a piece
 * panned the board. Touch goes through CDP's `Input.dispatchTouchEvent`, so
 * these are the browser's own touch → pointer events, not synthetic ones.
 */

import { expect, test, type Page } from '@playwright/test';
import { BoardPage } from './board-page';

type Rect = { left: number; top: number; right: number; bottom: number };

function expectSameRect(after: Rect, before: Rect): void {
  for (const key of ['left', 'top', 'right', 'bottom'] as const) {
    expect(Math.abs(after[key] - before[key]), `frame ${key} moved`).toBeLessThan(0.5);
  }
}

async function touch(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id })),
    });
  return {
    async drag(from: { x: number; y: number }, to: { x: number; y: number }, steps = 10) {
      await send('touchStart', [from]);
      for (let i = 1; i <= steps; i++) {
        await send('touchMove', [
          { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps },
        ]);
      }
      await send('touchEnd', []);
    },
    async pinchOut(at: { x: number; y: number }, steps = 10) {
      await send('touchStart', [
        { x: at.x - 20, y: at.y },
        { x: at.x + 20, y: at.y },
      ]);
      for (let i = 1; i <= steps; i++) {
        await send('touchMove', [
          { x: at.x - 20 - i * 6, y: at.y },
          { x: at.x + 20 + i * 6, y: at.y },
        ]);
      }
      await send('touchEnd', []);
    },
  };
}

test.describe('the board stays still', () => {
  test('tapping a piece and then grabbing it does not refit the view', { tag: '@smoke' }, async ({ page }) => {
    const board = await BoardPage.open(page);
    const [first] = await board.mountedIds();
    await board.dragOut(first!, await board.matPoint());
    await board.waitForIdle();

    const [point] = await page.evaluate(() => window.__tessera!.loosePoints());
    expect(point, 'no loose piece on the mat').toBeDefined();
    const before = await board.frameRect();

    await board.tapAt(point!);
    await board.dragOnMat(point!, { x: point!.x + 60, y: point!.y + 20 });

    expectSameRect(await board.frameRect(), before);
  });

  test('one finger on bare mat never pans', { tag: '@smoke' }, async ({ page }) => {
    const board = await BoardPage.open(page);
    await board.waitForIdle();
    const before = await board.frameRect();
    // Inside the empty board frame: no piece is placed yet, so this is bare mat.
    const from = { x: before.left + 12, y: before.top + 12 };

    await (await touch(page)).drag(from, { x: from.x + 120, y: from.y + 80 });
    await page.waitForTimeout(200);

    expectSameRect(await board.frameRect(), before);
  });

  test('two fingers still pinch', async ({ page }) => {
    const board = await BoardPage.open(page);
    await board.waitForIdle();
    const before = await board.frameRect();

    await (await touch(page)).pinchOut(await board.matPoint());
    await page.waitForTimeout(200);

    const after = await board.frameRect();
    expect(after.right - after.left).toBeGreaterThan((before.right - before.left) * 1.1);
  });

  test('the zoom buttons zoom', async ({ page }) => {
    const board = await BoardPage.open(page);
    await board.waitForIdle();
    const before = await board.frameRect();

    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    const zoomed = await board.frameRect();
    expect(zoomed.right - zoomed.left).toBeGreaterThan((before.right - before.left) * 1.3);

    await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    const back = await board.frameRect();
    expect(Math.abs(back.right - back.left - (before.right - before.left))).toBeLessThan(1);
  });
});
