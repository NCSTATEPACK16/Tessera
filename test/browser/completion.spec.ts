/**
 * Completion (steps 5c/8) — the Puzzle Card, "again, harder", share, and the
 * completions store.
 *
 * Solving a whole board is expensive, so this runs on the dock project only
 * and at the smallest ladder rung. It is the only file in the suite that
 * reaches `event.type === 'complete'` at all, which is what makes it worth the
 * minute it costs: the card, `RuntimeSummary.status === 'complete'`, and the
 * save-then-delete path have no other coverage anywhere.
 *
 * Zen mode, because every hint tier is free there — Tier 3's auto-place is the
 * only way a spec can place a specific piece without the app growing a
 * test-only hook (see `BoardPage.placeViaHint`).
 *
 * **Three of the four tests below share one solve** rather than each paying
 * for their own — they're all pure observations of the same "just finished"
 * state, right up until one of them (`Done`) changes it, which is why that
 * one runs last, in source order, inside a `mode: 'serial'` describe sharing
 * one `beforeAll`-built page. The ink-stability check is the one exception
 * that still needs its *own* precise timing: it exists to catch a real,
 * previously-found race (a piece's spring not yet settled when the card
 * reads the static canvas), and that race is only observable in the instant
 * right after the solve — so both of its pixel readings are taken inside the
 * shared `beforeAll`, immediately after `openZenAndComplete` returns, before
 * any of the other tests get a chance to run and eat the very window being
 * measured. The fourth test ("again-harder") needs the *pre-completion*
 * piece count, which the shared setup no longer has by the time it runs, so
 * it keeps its own independent solve.
 */

import { expect, test } from '@playwright/test';
import { BoardPage } from './board-page';

test.describe('completion', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, 'one solve is enough');

  test.describe('after a solve', () => {
    test.describe.configure({ mode: 'serial' });

    let board: BoardPage;
    let errors: string[];
    let inkAtCardVisible: number;
    let inkAfterSettle: number;

    test.beforeAll(async ({ browser }) => {
      test.setTimeout(600_000);
      const context = await browser.newContext();
      const page = await context.newPage();
      errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });

      board = await BoardPage.openZenAndComplete(page);

      // The static canvas the card and the completion thumbnail both read
      // from. With the fix, by the time the card is on screen the last
      // piece's spring has already been waited out, so ink coverage here
      // must already equal what it is after a further, generous wait — no
      // more piece can arrive. Measured immediately, before any other test
      // in this group gets a turn and burns the window this is checking.
      const inkOf = (): Promise<number> =>
        page.evaluate(() => {
          const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-layer="static"]');
          if (!canvas) throw new Error('no static layer');
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('no 2d context');
          const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
          let lit = 0;
          for (let i = 3; i < data.length; i += 4) {
            if ((data[i] as number) > 0) lit++;
          }
          return lit;
        });

      inkAtCardVisible = await inkOf();
      await page.waitForTimeout(400); // past the ~120ms spring, generously
      inkAfterSettle = await inkOf();
    });

    test.afterAll(async () => {
      await board.page.context().close();
    });

    test('the card shows the run, offers the next step up, and can be shared', async () => {
      const page = board.page;
      await expect(page.getByRole('img', { name: 'Puzzle card' })).toBeVisible();
      // §15: "Suggest the next difficulty step on the card, in the moment of
      // confidence" — the specific number, not a generic label.
      await expect(page.getByRole('button', { name: /Again, at \d+ pieces/ })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Share' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();

      expect(errors, 'completing raised an error').toEqual([]);
    });

    test('the composed card is never missing the last piece', () => {
      expect(inkAtCardVisible).toBe(inkAfterSettle);
    });

    test('a finished puzzle leaves the library and joins the completions', async () => {
      const page = board.page;
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
  });

  test('again-harder cuts the next rung up from the same photo', async ({ page }) => {
    test.setTimeout(600_000);
    // Capture the piece total while the board is still playing — once the card
    // is up, the progress header `placed()` reads is gone. This needs its own
    // solve: the shared setup above no longer has the pre-completion total by
    // the time it finishes.
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
