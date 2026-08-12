/**
 * Dynamic Type (§C Track 3): the seven `--text-N` tokens moved from px to
 * rem, so text actually grows with the browser's root font size rather than
 * staying fixed. This is the one place that growth is verified — a token
 * migration with no test would silently regress the moment someone reaches
 * back for a `text-[13px]` arbitrary value out of habit.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { BoardPage } from './board-page';

test('the text tokens actually scale with the root font size', async ({ page }) => {
  const board = await BoardPage.open(page);
  void board;

  const at16 = await page.evaluate(
    () => getComputedStyle(document.documentElement).getPropertyValue('--text-3'),
  );

  await page.evaluate(() => {
    document.documentElement.style.fontSize = '32px'; // 200% of the 16px root
  });

  const fontSizeAt200 = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.className = 'text-3';
    document.body.appendChild(probe);
    const size = parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();
    return size;
  });

  // 1rem at a 32px root is 32px — double the 16px it would be at the default
  // root, proving the token is relative, not a fixed pixel value like `at16`
  // (still expressed in rem in the stylesheet) would otherwise stay.
  expect(at16.trim()).toBe('1rem');
  expect(fontSizeAt200).toBeCloseTo(32, 0);
});

test('nothing clips at 200% text zoom on the pause sheet', async ({ page }) => {
  const board = await BoardPage.open(page);
  void board;

  await page.evaluate(() => {
    document.documentElement.style.fontSize = '32px';
  });
  await page.getByLabel('Pause').click();

  // No element's content runs past its own box — the direct, visible signal
  // a token-based clip check exists to catch.
  const overflowing = await page.evaluate(() => {
    const sheet = document.querySelector('[aria-label="Pause sheet backdrop"]')?.nextElementSibling;
    if (!sheet) return ['<pause sheet not found>'];
    const bad: string[] = [];
    for (const el of sheet.querySelectorAll('*')) {
      // A few px of tolerance for sub-pixel flex rounding at a non-integer
      // effective zoom — not the multi-line truncation this check exists to
      // catch, which reads as tens of px, not two or three.
      if (el.scrollWidth > el.clientWidth + 4) bad.push(el.className.toString());
    }
    return bad;
  });
  expect(overflowing).toEqual([]);
});

test('an axe scan of the paused board finds no target-size or scrollable-content violations at 200%', async ({
  page,
}) => {
  const board = await BoardPage.open(page);
  void board;

  await page.evaluate(() => {
    document.documentElement.style.fontSize = '32px';
  });
  await page.getByLabel('Pause').click();

  const results = await new AxeBuilder({ page }).analyze();
  const relevant = results.violations.filter((v) =>
    ['target-size', 'scrollable-region-focusable'].includes(v.id),
  );
  expect(relevant).toEqual([]);
});
