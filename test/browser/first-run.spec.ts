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
 * hint-placed pieces into a loose island instead of the board. Because the
 * scattered pieces have real gaps between them (not a gapless tiled grid),
 * `tapLoosePiece` below searches a dense grid of candidates rather than
 * computing one exact point.
 */

import { expect, test, type Page } from '@playwright/test';

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
 * A grid of candidate points over the lower portion of the canvas, where
 * `PlayRuntime.build()` scatters the guided twelve's pieces (a loose band
 * below the empty board frame, per `src/play/runtime.ts`'s `firstRunScatter`
 * comment). Scattered pieces have real gaps between them, unlike a tiled
 * board, so a single computed point is not reliable — `tapLoosePiece` tries
 * candidates from this list until one lands on a piece.
 */
async function scatterBandCandidates(page: Page): Promise<{ x: number; y: number }[]> {
  const box = await page.locator('canvas[data-layer="dynamic"]').boundingBox();
  expect(box, 'the board canvas has no box').not.toBeNull();
  const { x, y, width, height } = box!;

  // On phone the revealed tray is a bottom sheet overlaying the canvas, not
  // a docked sibling that takes its own width — same fact `board-page.ts`'s
  // `matPoint()` exists to handle. A candidate under the sheet hits the
  // sheet, not a piece beneath it, so the search region stops above it.
  // `.count()` first: `boundingBox()` on a locator matching nothing waits
  // for it to appear rather than resolving quickly to null, and pre-reveal
  // there genuinely is no such element yet.
  const trayLocator = page.locator('[aria-label="Pieces"]');
  const tray = (await trayLocator.count()) > 0 ? await trayLocator.boundingBox() : null;
  const overlaps = tray !== null && tray.y > y && tray.y < y + height;
  const bottom = overlaps ? tray!.y - y : height;

  // Dense, and covering most of the available height above the sheet: as
  // pieces are placed and merge into the board, `contentBounds()` shrinks to
  // whatever is still loose, so the remaining pieces' actual screen region
  // moves and shrinks unpredictably rather than staying in a fixed band. A
  // single remaining piece is also a small target for a sparse grid to
  // happen to land on. The range starts past the top overlay row (copy pill,
  // Skip) rather than at the very top.
  const points: { x: number; y: number }[] = [];
  for (let row = 0; row < 14; row++) {
    for (let col = 0; col < 16; col++) {
      points.push({
        x: x + width * (0.03 + (col / 15) * 0.94),
        y: y + 0.22 * bottom + (row / 13) * 0.76 * bottom,
      });
    }
  }
  return points;
}

/**
 * Tap whatever loose piece is nearest one of `scatterBandCandidates`'s
 * points, targeting it for a hint. Tries candidates in turn until the hint
 * button reports a target — the scattered layout has real gaps, so no
 * single point is guaranteed to land on a piece.
 */
async function tapLoosePiece(page: Page): Promise<void> {
  const hintButton = page.locator('button[aria-label^="Hint"]');
  const candidates = await scatterBandCandidates(page);
  for (const point of candidates) {
    await page.mouse.click(point.x, point.y);
    if (await hintButton.getAttribute('aria-label') === 'Hint') return;
  }
  throw new Error('no candidate point landed on a loose piece');
}

/**
 * Tap a loose piece (targeting it) and hold the hint button to tier 3, the
 * same escalation `board-page.ts`'s `placeViaHint` uses — the only
 * difference is there is no tray chip to drag out first, since the piece is
 * already loose on the mat.
 *
 * `page.mouse.click()` inside `tapLoosePiece`, not a manual move/down/up: a
 * tap is only recognised under `LONG_PRESS_MS` (120ms, `src/input/
 * pointer.ts`), and the IPC latency between separate `down()`/`up()` calls
 * routinely exceeds that, promoting the gesture to a zero-distance drag
 * instead — confirmed by instrumenting `PointerMachine.down()` directly
 * this session. `click()` keeps the two close enough together to land
 * inside the window.
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
  await expect(page.getByRole('button', { name: /Choose this photo/i })).toHaveCount(0);
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

  for (let i = 0; i < 4; i++) {
    await tapAndFireHint(page);
  }

  await expect(page.getByLabel('Pieces')).toBeVisible();
  await expect(page.getByText('Pieces live here. Filter them.')).toBeVisible();
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
  await expect(page.getByRole('button', { name: /Choose this photo/i })).toBeVisible();
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
  test.setTimeout(120_000);
  await openFreshProfile(page);
  await expect.poll(() => remaining(page)).toBe(12);

  for (let i = 0; i < 12; i++) {
    await tapAndFireHint(page);
  }

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
  await expect(page.getByRole('button', { name: /Choose this photo/i })).toBeVisible();

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
  test.setTimeout(120_000);
  await openFreshProfile(page);
  await expect.poll(() => remaining(page)).toBe(12);

  for (let i = 0; i < 12; i++) {
    await tapAndFireHint(page);
  }

  await expect(page.getByRole('button', { name: "Today's puzzle" })).toBeVisible();
  await page.getByRole('button', { name: "Today's puzzle" }).click();

  // A real puzzle screen, not the picker and not still the finished card.
  await expect(page.getByRole('img', { name: 'Puzzle card' })).toHaveCount(0);
  await expect(page.getByLabel('Pause')).toBeVisible();
});
