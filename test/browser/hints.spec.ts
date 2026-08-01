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
    await page.mouse.move(dropPoint.x, dropPoint.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(50);

    await expect(hintButton).toBeEnabled();

    await hintButton.click();
    await page.waitForTimeout(200);

    expect(errors).toEqual([]);
  });

  test('holding the hint button escalates to tier 3, and auto-places the target', async ({ page }) => {
    const board = await BoardPage.open(page);

    const [pieceId] = await board.mountedIds();
    const dropPoint = await board.matPoint();
    await board.dragOut(pieceId!, dropPoint);

    await page.mouse.move(dropPoint.x, dropPoint.y);
    await page.mouse.down();
    await page.mouse.up();

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
