import { test } from '@playwright/test';
import { BoardPage } from './board-page';

/**
 * THROWAWAY DIAGNOSTIC — delete with this branch.
 *
 * `a vertical touch scrolls the tray and deploys nothing` (tray-3b.spec.ts)
 * fails only on Linux CI, with `scrollTop` exactly 0, on both viewports and
 * through retries, while passing reliably on macOS. Artifact evidence from
 * run 31596890551 already rules out a boot failure, a layout failure, an
 * empty tray (71 of 150 chips mounted, so the grid genuinely overflows),
 * a missed selector, and any page or console error.
 *
 * This exists to answer the one question the artifact cannot: *where* the
 * gesture is lost. The discriminator is the programmatic-scroll probe —
 *
 *   - programmatic scroll works, gesture does not  → the gesture never
 *     reaches the scroller (Chromium/CI gesture delivery)
 *   - programmatic scroll ALSO fails               → the container is not
 *     scrollable here at all, and the macOS pass is the anomaly to explain
 *
 * It reports rather than asserts: the test throws its own findings so the
 * whole report lands in CI's annotation in one run.
 */
test('DIAGNOSTIC: where does the synthesized touch scroll get lost', async ({ page }) => {
  test.setTimeout(120_000);

  const board = await BoardPage.open(page);
  const id = (await board.mountedIds())[0]!;
  const box = await board.chip(id).boundingBox();

  // Record every event that would prove the gesture arrived, before it runs.
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const log: string[] = [];
    w['__diag'] = log;
    const el = document.querySelector('[aria-label="Pieces"] .overflow-y-auto');
    const chip = document.querySelector('[aria-label="Pieces"] button[aria-label^="Piece"]');
    for (const type of ['touchstart', 'touchmove', 'touchend']) {
      chip?.addEventListener(type, () => log.push(type), { passive: true });
    }
    chip?.addEventListener(
      'pointerdown',
      (e) => log.push(`pointerdown:${(e as PointerEvent).pointerType}`),
      { passive: true },
    );
    el?.addEventListener('scroll', () => log.push('scroll'), { passive: true });
  });

  const geometry = await page.evaluate(() => {
    const el = document.querySelector('[aria-label="Pieces"] .overflow-y-auto');
    const chip = document.querySelector('[aria-label="Pieces"] button[aria-label^="Piece"]');
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    // The decisive probe: can this container be scrolled at all, by any means?
    const before = el.scrollTop;
    el.scrollTop = 50;
    const afterProgrammatic = el.scrollTop;
    el.scrollTop = before;
    return {
      found: true,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      overflowY: cs.overflowY,
      chipTouchAction: chip ? getComputedStyle(chip).touchAction : '(no chip)',
      programmaticScrollWorks: afterProgrammatic === 50,
      afterProgrammatic,
    };
  });

  const scrollTop = await board.scrollTrayByTouch(id);
  const events = await page.evaluate(
    () => ((window as unknown as Record<string, unknown>)['__diag'] as string[]) ?? [],
  );

  throw new Error(
    'TOUCH SCROLL DIAGNOSTIC REPORT\n' +
      JSON.stringify(
        {
          platform: process.platform,
          project: test.info().project.name,
          chipBox: box,
          geometry,
          gestureResultScrollTop: scrollTop,
          eventsObserved: events,
        },
        null,
        2,
      ),
  );
});
