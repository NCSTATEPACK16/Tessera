/**
 * Drag-out — the seam between DOM and canvas (§06).
 *
 * This is the one thing at step 3 that genuinely could not be unit-tested. A
 * chip is React, the mat is canvas, and pulling a piece from one to the other is
 * a single continuous movement of a single finger crossing between two event
 * systems. `TrayDrag` and `PointerMachine.adopt` are each tested on their own;
 * whether they are wired to each other is a question only a browser can answer.
 */

import { expect, test } from '@playwright/test';
import { boardInk, BoardPage } from './board-page';

test.describe('pulling a piece out of the tray', () => {
  test('the piece leaves the tray and lands on the mat', async ({ page }) => {
    const board = await BoardPage.open(page);
    const before = await board.remaining();

    const first = (await board.mountedIds())[0]!;
    const centre = await board.matPoint();
    await board.dragOut(first, centre);

    await expect(board.chip(first)).toHaveCount(0);
    // It is on the mat, not placed — the progress counter must not move.
    expect(await board.remaining()).toBe(before);
  });

  test('Recent finds it again, as a locator rather than a second copy', async ({ page }) => {
    const board = await BoardPage.open(page);
    const first = (await board.mountedIds())[0]!;
    await board.dragOut(first, await board.matPoint());

    await board.pick('Recent');
    // §06: "the last twenty pieces you touched but did not place. Quietly fixes
    // the 'I had it a second ago' moment."
    await expect(board.matChip(first)).toHaveCount(1);
    // Never both — one piece must not look like two.
    await expect(board.chip(first)).toHaveCount(0);
  });

  test('dropping it back over the tray puts it home', async ({ page }) => {
    const board = await BoardPage.open(page);
    const first = (await board.mountedIds())[0]!;

    const centre = await board.matPoint();
    await board.dragOut(first, centre);
    await expect(board.chip(first)).toHaveCount(0);

    const tray = await board.tray.boundingBox();
    await board.dragOnMat(centre, {
      x: tray!.x + tray!.width / 2,
      y: tray!.y + tray!.height * 0.7,
    });

    await board.pick('All');
    await expect(board.chip(first)).toHaveCount(1);
    await board.pick('Recent');
    await expect(board.matChip(first)).toHaveCount(0);
  });

  test('a piece dropped on bare mat stays exactly where it was dropped', async ({ page }) => {
    // There is no lose state in this app and no bounce-back on a failed drop.
    const board = await BoardPage.open(page);
    const first = (await board.mountedIds())[0]!;

    const centre = await board.matPoint();
    const spot = { x: centre.x - 120, y: centre.y + 90 };
    await board.dragOut(first, spot);

    // Still ours to pick up, from precisely where it was let go.
    await board.dragOnMat(spot, { x: spot.x + 60, y: spot.y });
    await board.pick('Recent');
    await expect(board.matChip(first)).toHaveCount(1);
    expect(await board.remaining()).toBeGreaterThan(0);
  });

  test('a piece dragged far past the mat stops at a fixed boundary', async ({ page }) => {
    // Once on the mat, a piece is canvas-drawn rather than a DOM chip
    // (`board-page.ts`'s own doc comment on `boardInk`), so its screen
    // position has to be read back from pixels, the same technique
    // `puzzle-setup.spec.ts`'s large-piece-mode test uses.
    const board = await BoardPage.open(page, { pieceCount: 50, mode: 'Zen' });
    const mat = await board.matPoint();
    const first = (await board.mountedIds())[0]!;

    // Onto the mat first — the boundary only governs mat drags.
    await board.dragOut(first, mat);

    // The camera never auto-follows a drag, and the clamp is world-space —
    // at the default (fitted) zoom, the far corner of a 50-piece board's
    // reachable margin can genuinely sit off-screen, by design (that's what
    // `Fit` and the zoom range are for). Zoom out first, same technique
    // `puzzle-setup.spec.ts`'s large-piece-mode test uses, so the whole
    // reachable area stays on screen and a clamped position is actually
    // there to read back.
    await board.zoom(-40);
    const onMat = (await boardInk(page)).pieces;
    expect(onMat, 'no piece ink on the mat after the drag').not.toBeNull();

    // A huge drag, then a second, larger huge drag from wherever the first
    // landed. If the boundary is a fixed edge rather than an ever-tracking
    // offset, both land at the same clamped position.
    await board.dragOnMat(
      { x: onMat!.x + onMat!.w / 2, y: onMat!.y + onMat!.h / 2 },
      { x: mat.x + 5000, y: mat.y + 5000 },
    );
    const firstDrag = (await boardInk(page)).pieces;
    expect(firstDrag, 'no piece ink on the mat after the first huge drag').not.toBeNull();

    await board.dragOnMat(
      { x: firstDrag!.x + firstDrag!.w / 2, y: firstDrag!.y + firstDrag!.h / 2 },
      { x: mat.x + 8000, y: mat.y + 8000 },
    );
    const secondDrag = (await boardInk(page)).pieces;
    expect(secondDrag, 'no piece ink on the mat after the second huge drag').not.toBeNull();

    expect(secondDrag!.x).toBeCloseTo(firstDrag!.x, 0);
    expect(secondDrag!.y).toBeCloseTo(firstDrag!.y, 0);
  });
});

test.describe('the phone form factor', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 768, 'dock viewport');

  test('the tray is a sheet, and the handle moves between detents', async ({ page }) => {
    const board = await BoardPage.open(page);

    await expect(page.locator('section[aria-label="Pieces"]')).toHaveCount(1);
    await expect(page.locator('aside[aria-label="Pieces"]')).toHaveCount(0);

    const sheet = page.locator('section[aria-label="Pieces"]');
    const before = await sheet.boundingBox();

    const handle = page.locator('section[aria-label="Pieces"] [role="separator"]').first();
    const hb = await handle.boundingBox();
    await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb!.x + hb!.width / 2, 60, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    // Lands on a detent, never bouncing back to where the drag started.
    expect((await sheet.boundingBox())!.height).toBeGreaterThan(before!.height);
  });

  test('the lens chips stay reachable at every detent', async ({ page }) => {
    // §06 pins them to the sheet header precisely so they stay in the thumb's
    // arc — a lens that scrolls out of reach is a lens that is not offered.
    const board = await BoardPage.open(page);
    for (const name of ['All', 'Edges', 'Corners']) {
      await expect(board.lens(name)).toBeVisible();
    }
  });
});
