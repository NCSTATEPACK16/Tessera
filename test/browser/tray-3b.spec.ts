/**
 * Step 3b in a real browser — the shelf, multi-select, and worksets.
 *
 * Three things in 3b are *only* observable here, and all three are glue that no
 * unit test can reach:
 *
 *   `isOverShelf`    a React ref's `getBoundingClientRect()` handed to the board's
 *                    release path as a predicate. Whether the shelf is where the
 *                    finger can put a piece is a question about layout.
 *   `setTrayInsets`  the sheet is a fixed overlay across the board canvas, and its
 *                    height never changes the canvas's size. Left at zero, every
 *                    pulled-out piece is dealt behind the sheet, where a drop
 *                    returns it to the tray. Only a browser knows the number.
 *   the group chip   drawn on canvas, never mounted as DOM. There is no locator
 *                    for it, so it is found in pixels — see `boardInk`.
 *
 * It also extends the two top-line invariants over a Workset (the board never
 * re-renders through React; an idle board draws nothing at all), and carries the
 * regression test for the 3a scroll defect, where `touch-action: none` on a chip
 * left the phone tray unscrollable.
 *
 * **The tray is virtualised and the sheet overlays the board.** Use `remaining()`
 * and `matPoint()`; counting chips measures the viewport. And a chip's label
 * changes when it is badged, which is what `chipAny` is for.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { MOVE_THRESHOLD_PX } from '@/input/pointer';
import {
  BoardPage,
  boardInk,
  boardPaints,
  trayMutations,
  watchBoardPaints,
  watchTrayMutations,
} from './board-page';
import type { InkBox } from './board-page';

/**
 * A single re-render of a ~70-chip grid is hundreds of mutations, so the gap
 * between "did not re-render" and "re-rendered per frame" is two orders of
 * magnitude. Same number as `invariants.spec.ts`, for the same reason: it sits
 * in the middle of that gap and is not delicate.
 */
const RERENDER_BUDGET = 300;

const isPhone = ({ viewport }: { viewport: { width: number } | null }): boolean =>
  (viewport?.width ?? 0) < 768;

/**
 * Enter select mode on the first of `count` mounted chips, add the rest, and
 * pull the lot out.
 *
 * Deliberately silent about *how many* end up selected — `enterSelect` holds a
 * chip, and what a hold contributes to the selection is asserted on its own
 * below rather than assumed here.
 */
async function pullOut(board: BoardPage, page: Page, count: number): Promise<number[]> {
  const ids = (await board.mountedIds()).slice(0, count);
  await board.enterSelect(ids[0]!);
  for (const id of ids.slice(1)) await board.chipAny(id).click();

  await board.pullOutButton.click();
  await page.waitForTimeout(500);
  // Completing the pull-out is one of §06's three exits from select mode.
  await expect(board.pullOutButton).toHaveCount(0);

  return ids;
}

/**
 * Tap a canvas-drawn rectangle without it reading as the start of a pan.
 *
 * The travel is under `MOVE_THRESHOLD_PX` on purpose, and imported rather than
 * restated: `App` tells a group-chip tap from a drag with that same constant, so
 * a local copy of 6 here would stop testing the rule the day it changed.
 */
async function tapOnCanvas(page: Page, box: InkBox): Promise<void> {
  const x = box.x + box.w / 2;
  const y = box.y + box.h / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + MOVE_THRESHOLD_PX - 2, y, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}

// ---------------------------------------------------------------------------
// The pull-out

test('the pull-out puts the selection on the mat as one labelled group', async ({ page }) => {
  const board = await BoardPage.open(page);
  const before = await board.remaining();

  // Every piece starts in the tray, so the mat is genuinely empty. Anything this
  // test finds drawn afterwards got there by being pulled out.
  expect((await boardInk(page)).all, 'the board did not open with an empty mat').toBeNull();

  const ids = (await board.mountedIds()).slice(0, 5);
  await board.enterSelect(ids[0]!);
  for (const id of ids.slice(1)) await board.chipAny(id).click();

  // Read the count off the bar rather than assuming it.
  const selected = Number((await board.pullOutButton.innerText()).match(/(\d+)/)![1]);
  expect(selected).toBeGreaterThanOrEqual(ids.length - 1);

  await board.pullOutButton.click();
  await page.waitForTimeout(500);
  await expect(board.pullOutButton).toHaveCount(0);

  // `remaining()` reads the header, so virtualisation cannot skew it. A piece on
  // the mat has left the tray but is not placed, so this must not move.
  expect(await board.remaining()).toBe(before);
  for (const id of ids.slice(1)) await expect(board.chipAny(id)).toHaveCount(0);

  const ink = await boardInk(page);
  expect(ink.pieces, 'nothing was drawn on the mat').not.toBeNull();
  expect(ink.chip, 'the group arrived without its label chip').not.toBeNull();
});

test('the pull-out lands on mat the player can see, never behind the tray', async ({ page }) => {
  // This is `setTrayInsets`, and it has had no automated coverage until now. On
  // a phone the sheet is a fixed overlay across the bottom of the board canvas
  // and never changes the canvas's size, so with the insets left at zero the
  // block centres on the canvas and half of it is dealt under the sheet — where
  // a drop returns the piece straight to the tray.
  const board = await BoardPage.open(page);
  await pullOut(board, page, 5);

  const ink = (await boardInk(page)).all;
  expect(ink, 'nothing was drawn on the mat').not.toBeNull();

  const canvas = (await board.board.boundingBox())!;
  const tray = (await board.tray.boundingBox())!;

  expect(ink!.x).toBeGreaterThanOrEqual(canvas.x - 1);
  expect(ink!.y).toBeGreaterThanOrEqual(canvas.y - 1);
  expect(ink!.x + ink!.w).toBeLessThanOrEqual(canvas.x + canvas.width + 1);
  expect(ink!.y + ink!.h).toBeLessThanOrEqual(canvas.y + canvas.height + 1);

  const overlapsTray = !(
    ink!.x + ink!.w <= tray.x ||
    ink!.x >= tray.x + tray.width ||
    ink!.y + ink!.h <= tray.y ||
    ink!.y >= tray.y + tray.height
  );
  expect(overlapsTray, 'the pulled-out group is underneath the tray').toBe(false);
});

test('the group label chip is canvas, and tapping it renames the group', async ({ page }) => {
  const board = await BoardPage.open(page);
  await pullOut(board, page, 5);

  // Never DOM. A chip mounted over the board would re-render the tray on every
  // frame of a drag, which is precisely what keeping the board out of React was
  // for — so the absence of this node is the assertion, not an oversight.
  await expect(page.locator('[data-group-chip]')).toHaveCount(0);

  const chip = (await boardInk(page)).chip;
  expect(chip, 'no label chip was drawn').not.toBeNull();

  await tapOnCanvas(page, chip!);
  const name = page.locator('input[aria-label="Group name"]');
  await expect(name).toBeVisible();
  await expect(name).toHaveValue(/^Set \d+$/);

  await name.fill('Rails');
  await name.press('Enter');
  await page.waitForTimeout(300);
  await expect(name).toHaveCount(0);

  // Find the chip in pixels again — it is a different width now — and tap it.
  // The round trip proves the drawn chip and `groupChipAt`'s hit rect are the
  // same rectangle, which is the only thing keeping the tap target from
  // drifting away from the thing under the finger.
  const renamed = (await boardInk(page)).chip;
  expect(renamed).not.toBeNull();
  await tapOnCanvas(page, renamed!);
  await expect(name).toHaveValue('Rails');
});

// ---------------------------------------------------------------------------
// The shelf

test.describe('the shelf', () => {
  test.skip(isPhone, 'the sheet form factor is covered on its own below');

  test('a chip dropped on it is pinned, and lifts out of every lens', async ({ page }) => {
    // This is `isOverShelf`, and it has had no automated coverage until now.
    const board = await BoardPage.open(page);
    const before = await board.remaining();
    const id = (await board.mountedIds())[0]!;

    // Hidden while empty, so it does not exist until the drag does.
    await expect(board.shelf).toHaveCount(0);
    await board.pin(id);

    await expect(board.shelf).toBeVisible();
    const pinned = board.shelf.locator(`button[aria-label="Piece ${id}"]`);
    await expect(pinned).toHaveCount(1);

    // Pinned is a tray state. The piece went home; it did not stay on the mat,
    // and it certainly was not placed.
    expect(await board.remaining()).toBe(before);
    expect((await boardInk(page)).all, 'the pinned piece was left on the mat').toBeNull();

    // 44pt floor, everywhere.
    expect((await pinned.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    // §06: "a pinned shelf row … survives every lens." Filtering, never sorting:
    // the piece is lifted out of the grid entirely rather than moved within it.
    for (const lens of ['Edges', 'Corners', 'Colour', 'All']) {
      await board.pick(lens);
      await expect(pinned).toHaveCount(1);
      await expect(board.gridBody.locator(`button[aria-label="Piece ${id}"]`)).toHaveCount(0);
    }
  });
});

test.describe('the shelf on a phone', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 768, 'dock viewport');

  test('is inside the viewport while a chip is in flight', async ({ page }) => {
    // KNOWN DEFECT, carried from task 9. `collapseForDrag()` drops the sheet to
    // peek exactly when a drag makes the shelf appear, and peek is
    // `PEEK_PX + SHELF_ROW_PX` = 164px — but the sheet's own pinned region (the
    // 28px handle, the title, and two wrapped rows of lens chips) is already
    // 169px before the shelf is added at all. The shelf therefore renders below
    // the section's own box and, because the section is `bottom: 0`, below the
    // viewport: measured at y=669 in a 664px-tall viewport.
    //
    // The consequence is that drop-to-pin is unreachable on a phone. It is not
    // a drop-target arithmetic bug — `isOverShelf` answers correctly about a
    // rectangle no finger can occupy.
    //
    // Marked `fail` rather than skipped so the gate says so the day it is fixed.
    test.fail();

    const board = await BoardPage.open(page);
    const id = (await board.mountedIds())[0]!;
    const box = (await board.chip(id).boundingBox())!;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 40, box.y, { steps: 6 });
    await page.waitForTimeout(200);

    const shelf = await board.shelf.boundingBox();
    const viewport = page.viewportSize()!;
    await page.mouse.up();
    await page.waitForTimeout(200);

    expect(shelf, 'the shelf did not appear while a chip was in flight').not.toBeNull();
    expect(shelf!.y + shelf!.height).toBeLessThanOrEqual(viewport.height);
  });
});

// ---------------------------------------------------------------------------
// Select mode

test.describe('select mode', () => {
  test('a badged chip carries a numeral and an aria-pressed state', async ({ page }) => {
    const board = await BoardPage.open(page);
    const ids = (await board.mountedIds()).slice(0, 3);

    await board.enterSelect(ids[0]!);
    await board.chipAny(ids[1]!).click();

    // Colour is never the only signal: the order is a numeral, and it is in the
    // accessible name as well as on the face of the chip.
    await expect(board.chipAny(ids[1]!)).toHaveAttribute(
      'aria-label',
      new RegExp(`^Piece ${ids[1]}, selected \\d+$`),
    );
    await expect(board.chipAny(ids[1]!)).toHaveAttribute('aria-pressed', 'true');
    await expect(board.chipAny(ids[2]!)).toHaveAttribute('aria-pressed', 'false');

    // `aria-pressed` is set only while the mode is on — outside it a chip is a
    // draggable thing, not a checkbox that happens to be off.
    await board.cancelButton.click();
    await expect(board.pullOutButton).toHaveCount(0);
    expect(await board.chipAny(ids[1]!).getAttribute('aria-pressed')).toBeNull();
  });

  test('a stray tap on the board does not discard the selection', async ({ page }) => {
    const board = await BoardPage.open(page);
    const ids = (await board.mountedIds()).slice(0, 3);

    await board.enterSelect(ids[0]!);
    await board.chipAny(ids[1]!).click();
    await board.chipAny(ids[2]!).click();
    const label = await board.pullOutButton.innerText();

    const at = await board.matPoint();
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(250);

    // Exit is explicit — Cancel, Escape, or completing the pull-out — and never
    // an outside tap. A careful ten-piece selection must survive a fumble.
    await expect(board.pullOutButton).toBeVisible();
    expect(await board.pullOutButton.innerText()).toBe(label);
  });

  test('Escape leaves it, and the badges go with it', async ({ page }) => {
    const board = await BoardPage.open(page);
    const ids = (await board.mountedIds()).slice(0, 2);

    await board.enterSelect(ids[0]!);
    await board.chipAny(ids[1]!).click();
    await page.keyboard.press('Escape');

    await expect(board.pullOutButton).toHaveCount(0);
    await expect(board.chip(ids[1]!)).toHaveCount(1);
  });

  test('Pull out is refused below two pieces, and clears the 44pt floor', async ({ page }) => {
    const board = await BoardPage.open(page);
    const ids = (await board.mountedIds()).slice(0, 3);

    await board.enterSelect(ids[0]!);
    await expect(board.pullOutButton).toBeDisabled();

    await board.chipAny(ids[1]!).click();
    await board.chipAny(ids[2]!).click();
    await expect(board.pullOutButton).toBeEnabled();

    for (const button of [board.pullOutButton, board.cancelButton]) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('the chip the hold started on is selection #1', async ({ page }) => {
    // KNOWN DEFECT, carried from task 9. `TrayDrag.tick` enters select mode at
    // 450ms while the finger is still down; the `pointerup` that ends the hold
    // then fires an ordinary `click` on that same chip, and in select mode a
    // click is a toggle — so the chip that opened the mode is immediately
    // toggled back out of it. Observable as the bar reading "Pull out 1" during
    // the hold and "Pull out 0" the instant the finger lifts.
    //
    // `TrayDrag` cannot see this: the click is a DOM event on the button, not
    // part of the probe it clears in `tick`.
    //
    // Marked `fail` rather than skipped so the gate says so the day it is fixed.
    test.fail();

    const board = await BoardPage.open(page);
    const id = (await board.mountedIds())[0]!;

    await board.enterSelect(id);
    await expect(board.chipAny(id)).toHaveAttribute('aria-label', `Piece ${id}, selected 1`);
  });
});

// ---------------------------------------------------------------------------
// The two invariants, extended over a Workset

test('the board does not re-render through React while a group is dragged', async ({ page }) => {
  await watchTrayMutations(page);
  const board = await BoardPage.open(page);
  await pullOut(board, page, 5);

  const before = await boardInk(page);
  expect(before.pieces).not.toBeNull();

  // A fifth of the way in and four fifths of the way down the block: the middle
  // of the bottom-left piece, rather than the air between pieces that the centre
  // of a grid arrangement always is.
  const grab = {
    x: before.pieces!.x + before.pieces!.w * 0.2,
    y: before.pieces!.y + before.pieces!.h * 0.78,
  };

  await page.waitForTimeout(400);
  const mutationsBefore = await trayMutations(page);
  await board.dragOnMat(grab, { x: grab.x + 70, y: grab.y + 50 });
  const mutationsAfter = await trayMutations(page);

  // The block got wider and taller, so a piece genuinely moved — a camera pan
  // would have translated the ink without changing its size, and would have
  // made the mutation count below true for the wrong reason.
  const after = await boardInk(page);
  expect(after.pieces!.w + after.pieces!.h).toBeGreaterThan(
    before.pieces!.w + before.pieces!.h + 20,
  );

  // A re-render of the chip grid is hundreds of mutations. This is not a matter
  // of opinion, which is the entire reason the counter exists.
  expect(mutationsAfter - mutationsBefore).toBeLessThan(RERENDER_BUDGET);
});

test('an idle board carrying a group draws nothing at all', async ({ page }) => {
  // §03: "on an idle board with no finger down the app draws nothing at all."
  // The dev harness publishes that as `#sched`; the product page has no such
  // readout, so `watchBoardPaints` counts the clears that begin every layer
  // repaint instead. A group on the mat must not hold the loop open — its
  // outline and its label chip are drawn once and then left alone.
  //
  // A *collapsed* group is deliberately not covered: `toggleGroupCollapsed` is
  // reachable from no gesture in the app, and a spec that reached past the UI to
  // call it would be testing the runtime rather than the product.
  await watchBoardPaints(page);
  const board = await BoardPage.open(page);
  await pullOut(board, page, 5);

  await page.waitForTimeout(1200);
  const before = await boardPaints(page);
  expect(before).toBeGreaterThan(0);

  await page.waitForTimeout(1000);
  expect(await boardPaints(page)).toBe(before);
});

// ---------------------------------------------------------------------------
// The 3a scroll regression

test('a vertical touch scrolls the tray and deploys nothing', async ({ page }) => {
  // The chip carries `touch-action: pan-y`, never `none`. `none` does not lose a
  // race with native scrolling, it disables it — so no `pointercancel` fires,
  // the tray could not be scrolled by touch at all, and a downward flick pulled
  // a piece out instead. Both halves are asserted here because either one alone
  // is satisfied by the broken build.
  const board = await BoardPage.open(page);
  const before = await board.remaining();
  const id = (await board.mountedIds())[0]!;
  expect((await boardInk(page)).all).toBeNull();

  const scrollTop = await board.scrollTrayByTouch(id);

  expect(scrollTop, 'the tray did not scroll under a touch').toBeGreaterThan(0);
  // The mat is the honest reading of "deployed nothing": a deployed piece has
  // left the tray but is not placed, so the progress counter would not move.
  expect((await boardInk(page)).all, 'the scroll deployed a piece onto the mat').toBeNull();
  expect(await board.remaining()).toBe(before);
});
