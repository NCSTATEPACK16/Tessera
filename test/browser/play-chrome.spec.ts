/**
 * Play chrome (modernize spec §5, §11 row c): the top bar, the hint, the
 * board's framing above the sheet, the tray header, lenses and chips. Each
 * test here is about what the player sees and reaches; the numbers behind
 * them are unit-tested (`top-bar`, `sheet-motion`, `camera`, `handoff`).
 */

import { expect, test } from '@playwright/test';
import { BoardPage } from './board-page';

test.describe('the top bar', () => {
  test('the puzzle’s name, n / N, and a progress line', async ({ page }) => {
    test.setTimeout(90_000);
    const board = await BoardPage.open(page, { pieceCount: 50, mode: 'Zen' });
    const header = page.locator('header').first();
    const title = header.getByRole('heading');
    await expect(title).toBeVisible();
    await expect(title).not.toHaveText('Your photo');
    await expect(header.getByText(/^\d+ \/ \d+$/)).toBeVisible();

    await board.autoPlace(5);
    const { placed, total } = await board.placed();
    const line = header.getByRole('progressbar', { name: 'Progress' });
    await expect(line).toHaveAttribute('aria-valuenow', String(Math.round((placed / total) * 100)));
    // The bar's width transitions over 320ms; read it once it has landed.
    await page.waitForTimeout(450);
    const ratio = await line.evaluate((el) => {
      const fill = el.firstElementChild as HTMLElement;
      return fill.getBoundingClientRect().width / el.getBoundingClientRect().width;
    });
    expect(Math.abs(ratio - placed / total)).toBeLessThan(0.02);
  });

  test('at 200% type, Fit and Pause stay 44pt and on screen', { tag: '@phone' }, async ({ page }) => {
    await BoardPage.open(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '32px';
    });
    const viewport = page.viewportSize()!;
    for (const name of ['Fit', 'Pause']) {
      const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }
  });
});
