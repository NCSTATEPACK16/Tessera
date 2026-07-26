/**
 * The two invariants that only a browser can check.
 *
 * **The board never re-renders through React** and **an idle board draws nothing
 * at all** are the top two lines of `CLAUDE.md`, and until this file existed
 * both were statements of intent. Neither is observable from a unit test: one is
 * about React commits during a 60fps gesture, the other about whether a frame
 * was scheduled. Here they are numbers.
 *
 * The third check runs the harness's Solve, which drives every piece through
 * release → resolveSnap → applySnap → cascade in a real browser. It is the
 * end-to-end guard on snap resolution that the tray's `SnapOptions.eligible`
 * predicate could plausibly break.
 */

import { expect, test } from '@playwright/test';
import { BoardPage, trayMutations, watchTrayMutations } from './board-page';

/**
 * A single re-render of a ~70-chip grid is hundreds of mutations, so the gap
 * between "did not re-render" and "re-rendered per frame" is two orders of
 * magnitude. This threshold sits in the middle of it and is not delicate.
 */
const RERENDER_BUDGET = 300;

test.describe('the board never re-renders through React', () => {
  test.beforeEach(async ({ page }) => {
    await watchTrayMutations(page);
  });

  test('moving the camera does not churn the tray', async ({ page }) => {
    const board = await BoardPage.open(page);
    const centre = await board.matPoint();
    await page.waitForTimeout(400);

    const before = await trayMutations(page);
    for (let i = 0; i < 40; i++) {
      await page.mouse.move(centre.x - 200 + i * 8, centre.y - 100 + (i % 7) * 6);
      if (i % 4 === 0) await page.mouse.wheel(0, i % 8 === 0 ? -120 : 120);
    }
    await page.waitForTimeout(200);

    // If `regionUnlocked` were published on the zoom value rather than on the
    // 1.5× crossing, a pinch would re-render the whole tray on every frame.
    expect(await trayMutations(page)).toBeLessThan(before + RERENDER_BUDGET);
  });

  test('dragging a piece for sixty frames does not re-render per frame', async ({ page }) => {
    const board = await BoardPage.open(page);
    const centre = await board.matPoint();
    const first = (await board.mountedIds())[0]!;

    const box = await board.chip(first).boundingBox();
    await page.waitForTimeout(400);
    const before = await trayMutations(page);

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x - 40, box!.y, { steps: 6 });
    for (let i = 0; i < 60; i++) {
      await page.mouse.move(centre.x - 180 + i * 6, centre.y + Math.sin(i / 4) * 60);
    }
    await page.mouse.up();
    await page.waitForTimeout(300);

    // The chip leaving the list is one legitimate re-render. Sixty are not.
    expect(await trayMutations(page)).toBeLessThan(before + RERENDER_BUDGET);
  });
});

test.describe('the dev harness', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'the harness assumes a desk');

  test('still cuts, still solves, and still goes still', async ({ page }) => {
    await page.goto('/dev.html', { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('status')?.textContent === 'ready', null, {
      timeout: 30_000,
    });

    // §03: "on an idle board with no finger down the app draws nothing at all."
    // That is how the iPad stays cool for a sixty-minute session.
    await expect(page.locator('#sched')).toHaveText('no');

    await page.locator('#solve').click();
    await page.waitForTimeout(1500);

    const solved = await page.locator('#placed').innerText();
    const [placed, total] = solved.split('/').map((n) => Number(n.trim()));
    expect(total).toBeGreaterThan(0);
    expect(placed).toBe(total);

    await page.waitForTimeout(800);
    await expect(page.locator('#sched')).toHaveText('no');
  });
});

test.describe('nothing is broken on the console', () => {
  test('a full session start raises no errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

    const board = await BoardPage.open(page);
    await board.pick('Edges');
    await board.pick('Colour');
    await board.pick('All');
    await board.dragOut((await board.mountedIds())[0]!, await board.matPoint());

    expect(errors).toEqual([]);
  });
});
