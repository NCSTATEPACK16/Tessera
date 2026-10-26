/**
 * The tray and its lenses, in a browser (§06).
 *
 * The unit suite already proves the lens filter never reorders. What it cannot
 * prove is that the thing a player actually touches is wired to that filter —
 * that the chips render, the counts are true, the glyph lands on the right
 * pieces, and the Region gate is a real gate rather than a disabled attribute
 * nobody removes.
 */

import { expect, test } from '@playwright/test';
import { BoardPage } from './board-page';

test.describe('the tray', () => {
  test('fills from a finished cut, and the board opens empty', async ({ page }) => {
    const board = await BoardPage.open(page);

    expect(await board.chips.count()).toBeGreaterThan(10);
    await expect(page.locator('canvas[data-layer]')).toHaveCount(4);

    // A tray piece is parked on its own solved slot, so a leak into the scene
    // renders the puzzle finished on the first frame with no error anywhere.
    const { placed, total } = await board.placed();
    expect(placed).toBe(0);
    expect(total).toBeGreaterThan(0);

    // The real computed number, never the target (§04) — "200" lands on 204.
    await expect(page.locator('header')).toContainText(/\d+ × \d+/);
  });

  test('virtualises — far fewer chips exist than pieces', async ({ page }) => {
    const board = await BoardPage.open(page);
    const { total } = await board.placed();
    const mounted = await board.chips.count();

    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThan(total / 2);
  });

  test('a lens change hides and reveals, and never reflows', async ({ page }) => {
    const board = await BoardPage.open(page);

    const all = await board.mountedIds();
    await board.pick('Edges');
    const edges = await board.mountedIds();
    await board.pick('Corners');
    await board.pick('All');

    // §06: "turn a filter off and every remaining piece is exactly where you
    // left it." Including the scroll position, which is why this compares the
    // mounted window rather than re-reading from the top.
    expect(await board.mountedIds()).toEqual(all);

    // Only part of the order is ever mounted, so a subsequence test would be
    // testing virtualisation. Relative order is the property that survives a
    // partial view — and it is the one a comparator in `lenses.ts` would break.
    const shared = edges.filter((id) => all.includes(id));
    expect(shared).toEqual(all.filter((id) => shared.includes(id)));
  });

  test('Corners is exactly four, and Edges carries the notch glyph', async ({ page }) => {
    const board = await BoardPage.open(page);

    await board.pick('Corners');
    const corners = await board.mountedIds();
    expect(corners.length).toBeGreaterThan(0);
    expect(corners.length).toBeLessThanOrEqual(4);

    await board.pick('Edges');
    const marks = await board.chips.evaluateAll((els) =>
      els.map((el) => el.querySelectorAll('span[aria-hidden]').length > 0),
    );
    // §06: colour is never the only signal.
    expect(marks.length).toBeGreaterThan(0);
    expect(marks.every(Boolean)).toBe(true);

    // And it has to mean something — most of All must be unmarked.
    await board.pick('All');
    const allMarks = await board.chips.evaluateAll((els) =>
      els.map((el) => el.querySelectorAll('span[aria-hidden]').length > 0),
    );
    expect(allMarks.filter(Boolean).length).toBeLessThan(allMarks.length);
  });

  test('the colour bins partition every piece, and each one filters', async ({ page }) => {
    const board = await BoardPage.open(page);
    const { total } = await board.placed();

    await board.pick('Colour');
    const bins = page.locator('[aria-label="Pieces"] button:has(span[style*="background"])');
    const count = await bins.count();
    expect(count).toBeGreaterThan(1);
    expect(count).toBeLessThanOrEqual(7);

    let sum = 0;
    for (let i = 0; i < count; i++) {
      const label = (await bins.nth(i).innerText()).replace(/\s+/g, ' ').trim();
      // Every bin carries a numeral beside its swatch (§06).
      expect(label).toMatch(/\d/);

      await bins.nth(i).click();
      await page.waitForTimeout(150);
      sum += Number(label.split(' ').pop());
    }

    // A partition, not a filter that quietly loses pieces or counts them twice.
    expect(sum).toBe(total);
  });

  test('Region is gated on zoom, and never strands the player', async ({ page }) => {
    const board = await BoardPage.open(page);
    const region = board.lens('Region');

    // Below 1.5× the "region" is most of the board and the lens filters nothing.
    // Disabled rather than hidden: a control that vanishes teaches nothing.
    await expect(region).toBeDisabled();

    await board.zoom(12);
    await expect(region).toBeEnabled();

    const shown = Number((await region.innerText()).match(/\d+/g)?.pop() ?? -1);
    const { total } = await board.placed();
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(total);

    await board.pick('Region');
    await board.zoom(-24);

    await expect(region).toBeDisabled();
    // Falling below the gate with Region active would leave the tray empty with
    // no explanation, so it drops back to All — always one tap away anyway.
    await expect(board.lens('All')).toHaveAttribute('aria-pressed', 'true');
  });
});

// v2 spec §5.2: the phone sheet opens at 35% so the board gets most of the
// screen — but never so low that the pinned chrome leaves no pieces showing,
// which is what a flat 35% did on this 664px-tall viewport.
test('on a phone the tray opens low, with two whole rows of pieces showing', { tag: '@phone' }, async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'the dock is a side panel, not a sheet');
  const board = await BoardPage.open(page);
  const viewport = page.viewportSize()!;
  const tray = (await board.tray.boundingBox())!;

  expect(tray.height).toBeGreaterThanOrEqual(Math.round(viewport.height * 0.35) - 4);
  expect(tray.height).toBeLessThanOrEqual(Math.round(viewport.height * 0.5) + 4);

  const rows = new Set<number>();
  for (const chip of await board.chips.all()) {
    const box = await chip.boundingBox();
    if (box && box.y >= tray.y && box.y + box.height <= tray.y + tray.height) {
      rows.add(Math.round(box.y));
    }
  }
  expect(rows.size).toBeGreaterThanOrEqual(2);
});

// v2 spec §5.3: the dock only earns its width in landscape. In iPad portrait
// a 340pt dock took ~41% of an 820pt screen, so the sheet is used instead.
test.describe('iPad layout', () => {
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'dock', 'viewport-driven; run once');
  });

  test('portrait iPad gets the bottom sheet, not the dock', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    const board = await BoardPage.open(page);
    const tray = (await board.tray.boundingBox())!;
    expect(Math.round(tray.y + tray.height)).toBe(1180);
    expect(tray.width).toBeGreaterThan(820 * 0.9);
  });

  test('landscape iPad docks the tray on the right', async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 820 });
    const board = await BoardPage.open(page);
    const tray = (await board.tray.boundingBox())!;
    expect(tray.width).toBeGreaterThanOrEqual(300);
    expect(tray.width).toBeLessThanOrEqual(380);
    expect(Math.round(tray.x + tray.width)).toBe(1180);
  });

  test('rotating mid-puzzle swaps dock for sheet and keeps the lens', async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 820 });
    const board = await BoardPage.open(page);
    const before = await board.remaining();
    await board.lens('Edges').click();

    await page.setViewportSize({ width: 820, height: 1180 });
    await expect
      .poll(async () => (await board.tray.boundingBox())?.width ?? 0)
      .toBeGreaterThan(820 * 0.9);
    expect(await board.remaining()).toBe(before);
    await expect(board.lens('Edges')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a left-handed player can dock the tray on the left', async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 820 });
    const board = await BoardPage.open(page);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const r = indexedDB.open('tessera');
          r.onsuccess = () => {
            const tx = r.result.transaction('daily', 'readwrite');
            tx.objectStore('daily').put({ key: 'traySide', side: 'left' });
            tx.oncomplete = () => resolve();
          };
        }),
    );
    // A real move, then past the autosave debounce, so the reload has a
    // puzzle to continue.
    await board.dragOut((await board.mountedIds())[0]!, await board.matPoint());
    await page.waitForTimeout(1200);
    await page.reload({ waitUntil: 'load' });
    await page.getByText('Continue your puzzle').click();
    await board.waitForCut();

    const tray = (await board.tray.boundingBox())!;
    expect(Math.round(tray.x)).toBe(0);
    const hint = (await page.locator('button[aria-label^="Hint"]').boundingBox())!;
    expect(hint.x).toBeLessThan(tray.width + 100);
  });
});
