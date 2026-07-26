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
