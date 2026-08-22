/**
 * The box-lid reference panel (§C) — a persistent small thumbnail of the
 * whole target photo, docked in the tray. Independent of the ghost underlay
 * assist and of the board's render pipeline entirely.
 */

import { expect, test } from '@playwright/test';
import { BoardPage } from './board-page';

test('the reference thumbnail shows while playing, and its state survives a reload', async ({
  page,
}) => {
  // Same budget `persistence.spec.ts` gives its own cut+reload+re-cut test —
  // the default 30s is tight for that round trip even before this test's own
  // extra detent-drag and toggle steps.
  test.setTimeout(90_000);
  const board = await BoardPage.open(page, { pieceCount: 50, mode: 'Zen' });

  await expect(page.getByLabel('Reference photo thumbnail')).toBeVisible();

  // Drag a piece out onto the mat. `App.tsx`'s autosave (`scheduleSave`)
  // only runs from a play event (snap/return/deploy), never from an assists
  // change alone, so toggling the reference panel by itself would leave no
  // library entry to reload back into — a plain `dragOut` fires `deploy`,
  // which is enough. (Not `placeViaHint`: its hint-targeting tap has no
  // proven-reliable coverage on the phone viewport anywhere in this suite —
  // `completion.spec.ts` skips phone for exactly that kind of flow — and
  // this test does not need a placed piece, only a play event.)
  const [first] = await board.mountedIds();
  await board.dragOut(first!, await board.matPoint());

  // Docked (iPad) is a fixed-height `<aside>` — collapsing content there
  // does not change its box. Only the phone's three-detent `Sheet` sizes
  // peek from its measured pinned region, same as `tray-3b.spec.ts`'s
  // shelf-visibility check — and only at the `peek` detent specifically:
  // `half`/`full` are fixed viewport fractions (`Sheet.heightOf`), so the
  // default `half` detent would not move no matter what the pinned content
  // does. Drag the handle down to force `peek`, the same technique
  // `drag-out.spec.ts`'s detent test uses — done only now, after the mat
  // interaction above, so forcing the detent can never interfere with it.
  const docked = (page.viewportSize()?.width ?? 0) >= 768;
  let sheetBefore: { height: number } | null = null;
  if (!docked) {
    const handle = page.locator('section[aria-label="Pieces"] [role="separator"]').first();
    const hb = await handle.boundingBox();
    const viewport = page.viewportSize()!;
    await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb!.x + hb!.width / 2, viewport.height - 4, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    sheetBefore = await page.getByLabel('Pieces').boundingBox();
  }

  await page.getByLabel('Hide reference photo').click();
  await expect(page.getByLabel('Reference photo thumbnail')).toBeHidden();

  if (!docked) {
    // Past the sheet's own `--duration-base` (200ms) height transition.
    await page.waitForTimeout(300);
    const sheetAfter = await page.getByLabel('Pieces').boundingBox();
    expect(sheetAfter?.height ?? 0).toBeLessThan(sheetBefore?.height ?? Infinity);
  }

  // Past the 800ms autosave debounce, same as `persistence.spec.ts` — a
  // fixed sleep is right here precisely because the debounce is under test.
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'load' });

  // A session exists now, so the app lands on Home, not back in play — one
  // tap through "Your Puzzles" reaches the library (2026-08-22 spec).
  await page.getByRole('button', { name: /Your Puzzles/ }).click();
  await page.getByLabel(/Open puzzle:/).first().click();
  await board.waitForCut();

  await expect(page.getByLabel('Show reference photo')).toBeVisible();
  await expect(page.getByLabel('Reference photo thumbnail')).toBeHidden();
});
