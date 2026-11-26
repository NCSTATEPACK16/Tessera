/**
 * Hint tiers (§07), the browser-only surface: the tap-to-target gesture is a
 * real `PointerEvent` sequence over the canvas, and the hint button's
 * hold-to-escalate reads a real clock — neither is reachable from a unit test.
 *
 * The model layer (economy, tier costs, Tier 3's snap path) is covered in
 * `test/play/hints.test.ts` and `test/play/session.test.ts`; this file only
 * has to prove the DOM/canvas seam doesn't drop anything on the floor.
 */

import { expect, test } from '@playwright/test';
import { BoardPage } from './board-page';

test.describe('hints (§07)', () => {
  test('a tap targets a loose piece, enabling the hint button; tap fires tier 1 with no error', async ({
    page,
  }) => {
    const board = await BoardPage.open(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    const [pieceId] = await board.mountedIds();
    const dropPoint = await board.matPoint();
    await board.dragOut(pieceId!, dropPoint);

    const hintButton = page.locator('button[aria-label^="Hint"]');
    await expect(hintButton).toBeDisabled();

    // A plain tap on the mat piece — no movement, an immediate release, the
    // one gesture `PointerMachine` treats as a tap rather than a drag.
    await board.tapAt(dropPoint);
    await page.waitForTimeout(50);

    await expect(hintButton).toBeEnabled();

    await hintButton.click();
    await page.waitForTimeout(200);

    expect(errors).toEqual([]);
  });

  test('holding the hint button escalates to tier 3, and auto-places the target', { tag: '@smoke' }, async ({ page }) => {
    const board = await BoardPage.open(page);

    const [pieceId] = await board.mountedIds();
    const dropPoint = await board.matPoint();
    await board.dragOut(pieceId!, dropPoint);

    await board.tapAt(dropPoint);

    const hintButton = page.locator('button[aria-label^="Hint"]');
    await expect(hintButton).toBeEnabled();

    const before = await board.placed();

    const box = await hintButton.boundingBox();
    expect(box, 'hint button has no box').not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    // Past both escalation thresholds (§07, `src/play/hints.ts`).
    await page.waitForTimeout(1300);
    await page.mouse.up();
    await page.waitForTimeout(200);

    const after = await board.placed();
    expect(after.placed).toBe(before.placed + 1);
    // Tier 3 placed it — it is no longer a valid target, so the button goes
    // back to disabled rather than staying armed for a piece already placed.
    await expect(hintButton).toBeDisabled();
  });
});

// Modernize C4: a 52pt lightbulb, its count a numeral badge — what is left,
// so a spend is never a surprise.
test('a Classic puzzle: a 52pt lightbulb with its allowance as a badge', async ({ page }) => {
  await BoardPage.open(page);
  const hint = page.locator('button[aria-label^="Hint"]');
  const box = (await hint.boundingBox())!;
  expect(Math.abs(box.width - 52)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.height - 52)).toBeLessThanOrEqual(1);
  await expect(hint.locator('[data-hint-badge]')).toHaveText('3');
});

test('a spend bumps the badge once, and it settles', async ({ page }) => {
  const board = await BoardPage.open(page);
  const [pieceId] = await board.mountedIds();
  const dropPoint = await board.matPoint();
  await board.dragOut(pieceId!, dropPoint);
  await board.tapAt(dropPoint);

  const hint = page.locator('button[aria-label^="Hint"]');
  await expect(hint).toBeEnabled();
  const box = (await hint.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700); // past 450ms, short of 1200: tier 2, which costs one
  await page.mouse.up();

  // Read in the page, the frame the new badge appears: a round trip per
  // poll can outlast a 200ms bump.
  const running = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const read = (): void => {
          const el = document.querySelector('[data-hint-badge]');
          if (el?.textContent === '2') resolve(el.getAnimations().length);
          else requestAnimationFrame(read);
        };
        read();
      }),
  );
  expect(running).toBe(1);
  const badge = hint.locator('[data-hint-badge]');
  // One bump, never an idle loop.
  await page.waitForTimeout(350);
  expect(await badge.evaluate((el) => el.getAnimations().length)).toBe(0);
});

test('a Zen puzzle shows no count — its hints are unlimited', async ({ page }) => {
  await BoardPage.open(page, { mode: 'Zen' });
  await expect(page.locator('button[aria-label^="Hint"] [data-hint-badge]')).toHaveCount(0);
});
