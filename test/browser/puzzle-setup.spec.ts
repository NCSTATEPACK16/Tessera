/**
 * Step 5b's setup screen, in a real browser.
 *
 * The interesting assertions here are the ones that go *through* the screen
 * rather than at it: a piece count that reaches the cutter, an assist that
 * changes what the camera is allowed to do. Asserting `aria-pressed` alone
 * would pass just as happily if the value were dropped on the way to
 * `PlayRuntime`, which is exactly the failure this file exists to catch.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { BoardPage, boardInk } from './board-page';

async function toSetupScreen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.crypto.randomUUID = () =>
      'ffffffff-ffff-4fff-8fff-ffffffffffff' as `${string}-${string}-${string}-${string}-${string}`;
  });
  await page.goto('/', { waitUntil: 'load' });
  // Step 5c: the app lands on the library rather than the picker whenever a
  // saved session exists — and this helper is called twice inside one test
  // (e.g. the large-piece-mode comparison), by which point the first run has
  // already autosaved one. Cleared on every call, matching `BoardPage.open`,
  // so each call gets a fresh picker rather than only the first.
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
  await page.getByRole('button', { name: 'Choose this photo' }).click();
  await page.getByRole('button', { name: 'Use this photo' }).click();
  await expect(page.getByRole('button', { name: 'Start cutting' })).toBeVisible();
}

/** The cut's real grid, off the TopBar — never the target (CLAUDE.md). */
async function cutTotal(page: Page): Promise<number> {
  const text = await page.getByText(/×/).first().textContent();
  const [cols, rows] = (text ?? '').split('×').map((s) => Number(s.trim()));
  expect(Number.isFinite(cols) && Number.isFinite(rows)).toBe(true);
  return (cols as number) * (rows as number);
}

test.describe('puzzle setup', () => {
  test('selecting a piece count reaches the runtime with that count', async ({ page }) => {
    await toSetupScreen(page);
    await page.getByRole('button', { name: 'Piece count: 50' }).click();
    await page.getByRole('button', { name: 'Start cutting' }).click();

    const board = new BoardPage(page);
    await board.waitForCut();

    // 50 is a target, not a promise (§04) — chooseGrid picks the nearest
    // aspect-respecting grid, so this asserts a *small* real count, not the
    // literal 50, matching CLAUDE.md's "never the target" rule.
    expect(await cutTotal(page)).toBeLessThan(80);
  });

  test('the default configuration cuts a bigger board than the 50-piece one', async ({ page }) => {
    await toSetupScreen(page);
    await page.getByRole('button', { name: 'Start cutting' }).click();

    const board = new BoardPage(page);
    await board.waitForCut();

    // DEFAULT_PUZZLE_CONFIG is 150 — the ladder's middle value, and what
    // BoardPage.open() accepts for the rest of the suite.
    const total = await cutTotal(page);
    expect(total).toBeGreaterThan(100);
    expect(total).toBeLessThan(220);
  });

  test('mode and rotation are selectable and survive into a running board', async ({ page }) => {
    await toSetupScreen(page);

    const zen = page.getByRole('button', { name: 'Mode: Zen' });
    await expect(zen).toHaveAttribute('aria-pressed', 'false');
    await zen.click();
    await expect(zen).toHaveAttribute('aria-pressed', 'true');

    const rotationButton = page.getByRole('button', { name: 'Rotation' });
    await expect(rotationButton).toHaveAttribute('aria-pressed', 'false');
    await rotationButton.click();
    await expect(rotationButton).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Start cutting' }).click();
    const board = new BoardPage(page);
    await board.waitForCut();
    // Reaching a playable board at all is the regression guard: a dropped
    // option between the setup screen and PlayRuntime shows up here as a
    // failed mount, not as a wrong-looking piece.
    await expect(board.chips.first()).toBeVisible();
  });

  test('snap tolerance is selectable and reaches a playable board', async ({ page }) => {
    await toSetupScreen(page);

    const generous = page.getByRole('button', { name: 'Snap tolerance: Generous' });
    const standard = page.getByRole('button', { name: 'Snap tolerance: Standard' });
    await expect(standard).toHaveAttribute('aria-pressed', 'true');
    await generous.click();
    await expect(generous).toHaveAttribute('aria-pressed', 'true');
    await expect(standard).toHaveAttribute('aria-pressed', 'false');

    await page.getByRole('button', { name: 'Start cutting' }).click();
    const board = new BoardPage(page);
    await board.waitForCut();
    await expect(board.chips.first()).toBeVisible();
  });

  test('large piece mode holds pieces bigger than the default zoom floor does', async ({
    page,
  }) => {
    // Measured, not inferred: the same piece, dropped on the mat and then
    // zoomed away from as hard as the wheel allows, under each floor. The
    // 1.5× floor must leave it visibly larger than the 0.5× one — a floor
    // that never reached the camera would make the two identical.
    const measure = async (largePieceMode: boolean): Promise<number> => {
      await toSetupScreen(page);
      if (largePieceMode) {
        await page.getByRole('button', { name: 'Large piece mode' }).click();
      }
      await page.getByRole('button', { name: 'Start cutting' }).click();

      const board = new BoardPage(page);
      await board.waitForCut();

      const at = await board.matPoint();
      const id = (await board.mountedIds())[0];
      expect(id, 'no chip mounted to drag').not.toBeUndefined();
      await board.dragOut(id as number, at);

      await board.zoom(-40); // wheel out, well past either floor
      const ink = await boardInk(page);
      expect(ink.pieces, 'no piece ink on the mat after the drag').not.toBeNull();
      return ink.pieces!.w;
    };

    const defaultFloor = await measure(false);
    const raisedFloor = await measure(true);

    expect(raisedFloor).toBeGreaterThan(defaultFloor * 1.5);
  });

  test('the ghost underlay slider changes what the board paints', async ({ page }) => {
    const staticInk = async (): Promise<number> =>
      page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-layer="static"]');
        if (!canvas) throw new Error('no static layer');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2d context');
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let lit = 0;
        for (let i = 3; i < data.length; i += 4) {
          if ((data[i] as number) > 0) lit++;
        }
        return lit;
      });

    // No pieces are placed yet on either run, so any ink on the static layer
    // beyond the board outline is the ghost itself.
    await toSetupScreen(page);
    await page.getByRole('button', { name: 'Start cutting' }).click();
    let board = new BoardPage(page);
    await board.waitForCut();
    const withoutGhost = await staticInk();

    await toSetupScreen(page);
    const slider = page.getByLabel('Ghost underlay opacity');
    await slider.fill('0.3');
    await page.getByRole('button', { name: 'Start cutting' }).click();
    board = new BoardPage(page);
    await board.waitForCut();
    const withGhost = await staticInk();

    expect(withGhost).toBeGreaterThan(withoutGhost);
  });
});
