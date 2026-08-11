/**
 * Completion (steps 5c/8) — the Puzzle Card, "again, harder", share, and the
 * completions store.
 *
 * Solving a whole board is expensive, so this runs on the dock project only
 * and at the smallest ladder rung. It is the only test in the suite that
 * reaches `event.type === 'complete'` at all, which is what makes it worth the
 * minute it costs: the card, `RuntimeSummary.status === 'complete'`, and the
 * save-then-delete path have no other coverage anywhere.
 *
 * Zen mode, because every hint tier is free there — Tier 3's auto-place is the
 * only way a spec can place a specific piece without the app growing a
 * test-only hook (see `BoardPage.placeViaHint`).
 */

import { expect, test } from '@playwright/test';
import { BoardPage } from './board-page';

test.describe('completion', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'one solve is enough');

  test('the card shows the run, offers the next step up, and can be shared', async ({ page }) => {
    test.setTimeout(600_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    const board = await BoardPage.openZenAndComplete(page);

    await expect(page.getByRole('img', { name: 'Puzzle card' })).toBeVisible();
    // §15: "Suggest the next difficulty step on the card, in the moment of
    // confidence" — the specific number, not a generic label.
    await expect(page.getByRole('button', { name: /Again, at \d+ pieces/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Share' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();

    expect(errors, 'completing raised an error').toEqual([]);
    void board;
  });

  test('a finished puzzle leaves the library and joins the completions', async ({ page }) => {
    test.setTimeout(600_000);
    await BoardPage.openZenAndComplete(page);
    await page.getByRole('button', { name: 'Done' }).click();
    // Done writes the completion, then lands on the picker. Waiting for that
    // landing is what proves the async save committed — a fixed timeout races
    // it and flakes under full-suite load.
    await expect(page.getByRole('button', { name: 'Choose this photo' })).toBeVisible();

    const counts = await page.evaluate(async () => {
      const read = (store: string): Promise<number> =>
        new Promise((res, rej) => {
          const r = indexedDB.open('tessera');
          r.onsuccess = () => {
            const tx = r.result.transaction(store, 'readonly');
            const all = tx.objectStore(store).getAll();
            all.onsuccess = () => res(all.result.length);
            tx.onerror = () => rej(tx.error);
          };
          r.onerror = () => rej(r.error);
        });
      return { sessions: await read('sessions'), completions: await read('completions') };
    });

    expect(counts.completions).toBe(1);
    expect(counts.sessions).toBe(0);

    // The only puzzle there was, so the flow returns to the picker.
    await expect(page.getByRole('button', { name: 'Choose this photo' })).toBeVisible();
  });

  test('again-harder cuts the next rung up from the same photo', async ({ page }) => {
    test.setTimeout(600_000);
    // Capture the piece total while the board is still playing — once the card
    // is up, the progress header `placed()` reads is gone.
    const board = await BoardPage.open(page, { pieceCount: 50, mode: 'Zen' });
    const before = (await board.placed()).total;
    await board.completeZenPuzzle();

    await page.getByRole('button', { name: /Again, at \d+ pieces/ }).click();
    await board.waitForCut();

    // 50 -> 100 on the ladder. A target is not a promise (§04), so this
    // asserts "meaningfully bigger", not an exact count.
    await expect
      .poll(async () => (await board.placed()).total, { timeout: 60_000 })
      .toBeGreaterThan(before);
  });
});
