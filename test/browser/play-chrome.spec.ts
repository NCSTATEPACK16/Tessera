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

test.describe('the board, framed above the sheet', () => {
  // The sheet is the phone's form factor; the dock is a flex sibling and
  // never overlaps the board at all.
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'phone', 'phone sheet only');
  });

  test('sits between the top bar and the sheet, at rest and after Fit', { tag: '@phone' }, async ({
    page,
  }) => {
    const board = await BoardPage.open(page);
    const check = async (): Promise<void> => {
      const frame = await board.frameRect();
      const bar = (await page.locator('header').first().boundingBox())!;
      const sheet = (await board.tray.boundingBox())!;
      expect(frame.top).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
      expect(frame.bottom).toBeLessThanOrEqual(sheet.y + 1);
    };
    await check();
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await page.waitForTimeout(100);
    await check();
  });

  test('opening the sheet refits only a camera still at its fit', { tag: '@phone' }, async ({
    page,
  }) => {
    const board = await BoardPage.open(page);
    const viewport = page.viewportSize()!;

    await board.dragSheetTo(viewport.height * 0.5);
    const sheet = (await board.tray.boundingBox())!;
    expect((await board.frameRect()).bottom).toBeLessThanOrEqual(sheet.y + 1);

    // The player zooms in: from here the view is theirs (ruling R2).
    const mat = await board.matPoint();
    await page.mouse.move(mat.x, mat.y);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(200);
    const chosen = await board.frameRect();

    await board.dragSheetTo(viewport.height * 0.85);
    const after = await board.frameRect();
    expect(Math.abs(after.top - chosen.top)).toBeLessThan(1);
    expect(Math.abs(after.left - chosen.left)).toBeLessThan(1);
  });
});

test.describe('the tray header and lenses', () => {
  /** The resolved `font-data` family, read off a probe so the test names no font. */
  const monoFamily = (page: import('@playwright/test').Page): Promise<string> =>
    page.evaluate(() => {
      const probe = document.createElement('span');
      probe.className = 'font-data';
      document.body.append(probe);
      const family = getComputedStyle(probe).fontFamily;
      probe.remove();
      return family;
    });

  test('one row: a mono eyebrow and a reference thumbnail that toggles', { tag: '@phone' }, async ({
    page,
  }) => {
    const board = await BoardPage.open(page, { pieceCount: 50, mode: 'Zen' });
    const eyebrow = board.tray.locator('.eyebrow').first();
    await expect(eyebrow).toHaveText(`TRAY · ${await board.remaining()} LOOSE`, {
      useInnerText: true,
    });
    const family = await monoFamily(page);
    expect(await eyebrow.evaluate((el) => getComputedStyle(el).fontFamily)).toBe(family);

    const button = board.tray.getByRole('button', { name: 'Reference photo', exact: true });
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Reference photo thumbnail')).toBeVisible();
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByLabel('Reference photo thumbnail')).toBeHidden();
    await button.click();
    await expect(page.getByLabel('Reference photo thumbnail')).toBeVisible();
  });

  test('lenses are 36px pills with mono counts and a ringed active state', { tag: '@phone' }, async ({
    page,
  }) => {
    const board = await BoardPage.open(page, { pieceCount: 50, mode: 'Zen' });
    const all = board.tray.getByRole('button', { name: /^All/ });
    const box = (await all.boundingBox())!;
    expect(Math.abs(box.height - 36)).toBeLessThanOrEqual(1);
    const family = await monoFamily(page);
    expect(
      await all.locator('span').last().evaluate((el) => getComputedStyle(el).fontFamily),
    ).toBe(family);

    await expect(all).toHaveAttribute('aria-pressed', 'true');
    const marked = await all.evaluate((el) => {
      const style = getComputedStyle(el);
      return style.boxShadow !== 'none' || style.outlineStyle !== 'none';
    });
    expect(marked).toBe(true);
  });

  test('the dock wraps the lens row instead of scrolling it', async ({ page }) => {
    const board = await BoardPage.open(page, { pieceCount: 50, mode: 'Zen' });
    const row = board.tray.getByRole('button', { name: /^All/ }).locator('..');
    const fits = await row.evaluate((el) => el.scrollWidth <= el.clientWidth);
    expect(fits).toBe(true);
  });
});

test.describe('the chips', () => {
  test('frameless, ringed and numbered when selected, and lifted while pressed', { tag: '@phone' }, async ({
    page,
  }) => {
    const board = await BoardPage.open(page);
    const [first, second] = await board.mountedIds();
    const chip = board.chip(first!);
    expect(await chip.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('0px');

    // Held, under the select-hold: the press scale is CSS, never React state.
    // A handle, and the 150ms waited in-page: under load a round trip can
    // outlast the 450ms select-hold, which relabels the chip out from under a
    // locator (the scale is the same either way — `:active` is still held).
    const handle = (await chip.elementHandle())!;
    const box = (await chip.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const scale = await handle.evaluate(
      (el) =>
        new Promise<number>((res) =>
          setTimeout(() => res(new DOMMatrix(getComputedStyle(el).transform).a), 150),
        ),
    );
    await page.mouse.up();
    await page.keyboard.press('Escape');
    expect(Math.abs(scale - 1.06)).toBeLessThan(0.01);

    await board.enterSelect(second!);
    const selected = board.chipAny(second!);
    await expect(selected).toContainText('1');
    expect(await selected.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
  });
});

test.describe('a piece dropped on the tray', () => {
  /**
   * Drag a piece already on the mat onto the tray's handle row — inside the
   * tray at every detent and above the shelf, so it returns rather than pins —
   * and report, from the page, how many animations its chip carries on the
   * first frame it exists. Read in-page: the chip-in is 320ms all told, and a
   * round trip under load can outlast it.
   */
  async function dropOnTray(page: import('@playwright/test').Page, board: BoardPage): Promise<{
    id: number;
    animations: number;
  }> {
    const id = (await board.mountedIds())[0]!;
    const mat = await board.matPoint();
    await board.dragOut(id, mat);
    await board.waitForIdle();

    const tray = (await board.tray.boundingBox())!;
    await page.mouse.move(mat.x, mat.y);
    await page.mouse.down();
    await page.mouse.move(mat.x - 30, mat.y - 20, { steps: 8 });
    await page.mouse.move(tray.x + tray.width / 2, tray.y + 10, { steps: 12 });
    const probe = page.evaluate(
      (pieceId) =>
        new Promise<number>((res) => {
          const started = performance.now();
          const look = (): void => {
            const chip = document.querySelector(
              `[aria-label="Pieces"] button[aria-label="Piece ${pieceId}"]`,
            );
            if (chip) res(chip.getAnimations().length);
            else if (performance.now() - started > 2000) res(-1);
            else requestAnimationFrame(look);
          };
          look();
        }),
      id,
    );
    await page.mouse.up();
    return { id, animations: await probe };
  }

  test('is in the tray at once, homes, and lets the board go idle', { tag: '@phone' }, async ({
    page,
  }) => {
    const board = await BoardPage.open(page, { pieceCount: 50, mode: 'Zen' });
    const { animations } = await dropOnTray(page, board);
    expect(animations).toBe(1);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => (window as unknown as { __tessera: { idle(): boolean } }).__tessera.idle())).toBe(true);
  });

  test('under reduced motion, arrives with no animation at all', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const board = await BoardPage.open(page, { pieceCount: 50, mode: 'Zen' });
    const { animations } = await dropOnTray(page, board);
    expect(animations).toBe(0);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => (window as unknown as { __tessera: { idle(): boolean } }).__tessera.idle())).toBe(true);
  });
});
