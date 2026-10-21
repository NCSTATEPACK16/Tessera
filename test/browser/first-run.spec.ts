/**
 * The guided twelve (§16, step 7) — a curated 12-piece board, already
 * scattered, that teaches the tray and the hint by revealing them at the
 * right moment rather than explaining them.
 *
 * The twelve pieces start loose on the mat (`startInTray: false`), not in
 * the tray — the tray panel is not even mounted until four are placed
 * (§16's "slides in on its own"), so there would be nothing to reveal them
 * from otherwise. `PlayRuntime.build()` scatters them into a real loose band
 * below the board (`firstRunScatter`) rather than leaving them at their own
 * home slots — a piece released without ever having moved is still exactly
 * adjacent to its real graph neighbours, and `resolveSnap` finds a genuine
 * neighbour before it ever falls back to the board-frame exception, merging
 * hint-placed pieces into a loose island instead of the board. `tapLoosePiece`
 * below asks the dev hook where the loose pieces are.
 */

import { expect, test, type Page } from '@playwright/test';
import { BoardPage, firstCuratedPhoto } from './board-page';

/**
 * A truly fresh profile: empty IndexedDB, reloaded, but stopping short of
 * the picker click-through `BoardPage.open()` does — a first-run test is
 * about *not* reaching the picker at all.
 */
async function openFreshProfile(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.crypto.randomUUID = () =>
      'ffffffff-ffff-4fff-8fff-ffffffffffff' as `${string}-${string}-${string}-${string}-${string}`;
  });
  await page.goto('/', { waitUntil: 'load' });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase('tessera');
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      }),
  );
  await page.reload({ waitUntil: 'load' });
}

/** Pieces not yet placed, from the top bar — same parsing as `board-page.ts`. */
async function remaining(page: Page): Promise<number> {
  const text = await page.locator('header').innerText();
  const match = text.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) throw new Error(`no progress in header "${text}"`);
  return Number(match[2]) - Number(match[1]);
}

/**
 * Tap a loose piece, targeting it for a hint. Its position comes from the dev
 * hook (`__tessera.loosePoints`) — the scatter has real gaps, and hunting for
 * a piece in a grid of candidate clicks took longer than the rest of the test.
 */
async function tapLoosePiece(page: Page): Promise<void> {
  const [point] = await page.evaluate(() => window.__tessera!.loosePoints());
  expect(point, 'no loose piece on the mat').toBeDefined();
  await new BoardPage(page).tapAt(point!);
  await expect(page.locator('button[aria-label="Hint"]')).toBeVisible();
}

/**
 * Tap a loose piece (targeting it) and hold the hint button to tier 3, the
 * same escalation `board-page.ts`'s `placeViaHint` uses — the only
 * difference is there is no tray chip to drag out first, since the piece is
 * already loose on the mat.
 *
 * `tapLoosePiece` taps through `BoardPage.tapAt`, not a manual move/down/up:
 * a tap is only recognised under `LONG_PRESS_MS` (120ms), and the IPC gap
 * between separate `down()`/`up()` calls routinely exceeds that.
 */
async function tapAndFireHint(page: Page): Promise<void> {
  await tapLoosePiece(page);

  const hintButton = page.locator('button[aria-label^="Hint"]');
  await expect(hintButton).toBeEnabled();
  const box = await hintButton.boundingBox();
  expect(box, 'hint button has no box').not.toBeNull();

  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  // Past both escalation thresholds (§07, `src/play/hints.ts`).
  await page.waitForTimeout(1300);
  await page.mouse.up();
  await page.waitForTimeout(250);
}

test('a brand-new player lands on the guided twelve, not the picker', async ({ page }) => {
  await openFreshProfile(page);

  await expect(page.getByText('Drag a piece where you think it goes.')).toBeVisible();
  // §16: "No account, no menu, no mode picker."
  await expect(firstCuratedPhoto(page)).toHaveCount(0);
  await expect.poll(() => remaining(page)).toBe(12);
});

test('the tray is not on screen before four pieces are placed', async ({ page }) => {
  test.setTimeout(90_000);
  await openFreshProfile(page);
  await expect.poll(() => remaining(page)).toBe(12);
  // The header updates from `summary`, published slightly ahead of the hit
  // index that makes the just-cut pieces themselves clickable.
  await page.waitForTimeout(300);

  // The tray is *absent*, not merely collapsed.
  await expect(page.getByLabel('Pieces')).toHaveCount(0);

  // Three instantly through the dev hook; the fourth by a real tap and hold,
  // so the reveal below follows a real placement.
  await page.evaluate(() => window.__tessera!.place(3));
  await expect.poll(() => remaining(page)).toBe(9);
  await tapAndFireHint(page);

  await expect(page.getByLabel('Pieces')).toBeVisible();
  await expect(page.getByText('Pieces live here. Filter them.')).toBeVisible();

  // §16 Track 4: the lens chips pulse once, exactly on this reveal — the
  // tray mounts fresh only for this beat, never for ordinary play.
  await expect(page.getByLabel('Pieces').locator('.lens-chip-pulse')).toHaveCount(1);
});

test('skip is always reachable and never modal', async ({ page }) => {
  test.setTimeout(90_000);
  await openFreshProfile(page);
  await expect.poll(() => remaining(page)).toBe(12);
  await page.waitForTimeout(300);

  const skip = page.getByLabel('Skip');
  await expect(skip).toBeVisible();

  await tapAndFireHint(page);
  // Never modal: the board underneath still took the placement, and skip is still there.
  await expect(skip).toBeVisible();

  await skip.click();
  await expect(firstCuratedPhoto(page)).toBeVisible();
});

test('skipping before the cut finishes streaming raises no console error', async ({ page }) => {
  // Regression: `PlayRuntime.start()`'s worker-streaming handlers
  // (`onGrid`/`onPieces`) called `render()`/`materialise()` with no
  // `this.destroyed` guard, unlike the check just below the awaited
  // `cutInWorker(...)` call. Skipping fast enough to destroy the runtime
  // while the 12-piece cut is still streaming landed a callback on an
  // already torn-down `Renderer` (its layer map cleared by `destroy()`),
  // throwing "Renderer: unknown layer". `openFreshProfile` reloads to a
  // blank page, so this test's own tap on Skip races the cut by
  // construction — no artificial delay needed to hit the window.
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await openFreshProfile(page);
  await page.getByLabel('Skip').click();
  await expect(firstCuratedPhoto(page)).toBeVisible();
  await page.waitForTimeout(500); // let any in-flight worker message land

  expect(errors).toEqual([]);
});

test('a skipped tutorial writes no completion — the wall stays earned', async ({ page }) => {
  test.setTimeout(90_000);
  await openFreshProfile(page);
  await expect.poll(() => remaining(page)).toBe(12);
  await page.waitForTimeout(300);

  await tapAndFireHint(page);
  await page.getByLabel('Skip').click();

  const completions = await page.evaluate(
    () =>
      new Promise<number>((res) => {
        const r = indexedDB.open('tessera');
        r.onsuccess = () => {
          const tx = r.result.transaction('completions', 'readonly');
          const all = tx.objectStore('completions').getAll();
          all.onsuccess = () => res(all.result.length);
        };
      }),
  );
  expect(completions).toBe(0);
});

// v2 spec B6: `interrupt()` on skip autosaves the tutorial board, which then
// surfaced on Home as "Continue your puzzle 0 / 12". The library is
// in-progress puzzles the player chose; the guided twelve was never one.
test('a skipped tutorial leaves nothing in the library', async ({ page }) => {
  test.setTimeout(90_000);
  await openFreshProfile(page);
  await expect.poll(() => remaining(page)).toBe(12);
  await page.waitForTimeout(300);

  await page.getByLabel('Skip').click();
  // Past the 800ms autosave debounce, so a late save would already have landed.
  await page.waitForTimeout(1500);

  const sessionKeys = await page.evaluate(
    () =>
      new Promise<string[]>((res) => {
        const r = indexedDB.open('tessera');
        r.onsuccess = () => {
          const tx = r.result.transaction(['sessions', 'photos'], 'readonly');
          const sessions = tx.objectStore('sessions').getAllKeys();
          const photos = tx.objectStore('photos').getAllKeys();
          tx.oncomplete = () =>
            res([...sessions.result, ...photos.result].map((key) => String(key)));
        };
      }),
  );
  expect(sessionKeys).not.toContain('first-run');
});

test('a returning player is never taught again', async ({ page }) => {
  test.setTimeout(90_000);
  await openFreshProfile(page);
  await expect.poll(() => remaining(page)).toBe(12);

  await page.getByLabel('Skip').click();

  // §C Track 4: the synchronous pre-hydration cache, mirrored alongside the
  // IndexedDB write markFirstRunDone makes — not just the async source of
  // truth eventually agreeing after a reload.
  const cached = await page.evaluate(() => localStorage.getItem('tessera:firstRunSeen'));
  expect(cached).toBe('true');

  await page.reload({ waitUntil: 'load' });

  await expect(page.getByText('Drag a piece where you think it goes.')).toHaveCount(0);
});

test('Comfort mode is offered by name, quietly, and actually widens controls live', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openFreshProfile(page);
  await expect.poll(() => remaining(page)).toBe(12);

  const comfortToggle = page.getByLabel('Comfort mode');
  await expect(comfortToggle).toBeVisible();
  await expect(comfortToggle).toHaveAttribute('aria-pressed', 'false');

  const skip = page.getByLabel('Skip');
  const before = await skip.boundingBox();
  expect(before?.height).toBeLessThan(60);

  await comfortToggle.click();
  await expect(comfortToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(comfortToggle).toHaveText('Comfort mode: On');

  // Applied live to the actual running puzzle, the same as the pause
  // sheet's toggle — not just a label change on the overlay itself.
  const after = await skip.boundingBox();
  expect(after?.height).toBeGreaterThanOrEqual(60);
});

test('finishing the twelve earns a real completion and offers the two next steps', async ({
  page,
  viewport,
}) => {
  // A full 12-piece solve on the phone viewport means finding each remaining
  // loose piece under the tray sheet's shrinking clearance — the same cost
  // `completion.spec.ts` already decided isn't worth paying twice for one
  // solve; that file's equivalent full-solve tests carry the identical skip.
  test.skip((viewport?.width ?? 0) < 768, 'one solve is enough');
  await openFreshProfile(page);
  await expect.poll(() => remaining(page)).toBe(12);

  // Eleven through the dev hook, the last by a real tap and hold — so the
  // completion below fires from a real gesture.
  await page.evaluate(() => window.__tessera!.placeAllBut(1));
  await expect.poll(() => remaining(page)).toBe(1);
  await tapAndFireHint(page);

  await expect(page.getByRole('img', { name: 'Puzzle card' })).toBeVisible();
  // §16: "Now use your own photo" primary, "Today's puzzle" secondary.
  await expect(page.getByRole('button', { name: 'Now use your own photo' })).toBeVisible();
  await expect(page.getByRole('button', { name: "Today's puzzle" })).toBeVisible();
  // No "Again, at N pieces" — there is no harder rung on a fixed tutorial.
  await expect(page.getByRole('button', { name: /^Again, at/ })).toHaveCount(0);

  // §16: "it counts as a real completion on the collection wall." Recorded on
  // the chosen next step, same as every other puzzle's "Done" — waiting for
  // the picker to land is what proves the async save committed, the same
  // reasoning completion.spec.ts's own equivalent test uses.
  await page.getByRole('button', { name: 'Now use your own photo' }).click();
  await expect(firstCuratedPhoto(page)).toBeVisible();

  const completions = await page.evaluate(
    () =>
      new Promise<number>((res) => {
        const r = indexedDB.open('tessera');
        r.onsuccess = () => {
          const tx = r.result.transaction('completions', 'readonly');
          const all = tx.objectStore('completions').getAll();
          all.onsuccess = () => res(all.result.length);
        };
      }),
  );
  expect(completions).toBe(1);
});

test('"Today\'s puzzle" from the guided twelve\'s card starts the real daily', async ({
  page,
  viewport,
}) => {
  test.skip((viewport?.width ?? 0) < 768, 'one solve is enough');
  await openFreshProfile(page);
  await expect.poll(() => remaining(page)).toBe(12);

  // Eleven through the dev hook, the last by a real tap and hold — so the
  // completion below fires from a real gesture.
  await page.evaluate(() => window.__tessera!.placeAllBut(1));
  await expect.poll(() => remaining(page)).toBe(1);
  await tapAndFireHint(page);

  await expect(page.getByRole('button', { name: "Today's puzzle" })).toBeVisible();
  await page.getByRole('button', { name: "Today's puzzle" }).click();

  // A real puzzle screen, not the picker and not still the finished card.
  await expect(page.getByRole('img', { name: 'Puzzle card' })).toHaveCount(0);
  await expect(page.getByLabel('Pause')).toBeVisible();
});
