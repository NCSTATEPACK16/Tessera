import { expect, test } from '@playwright/test';
import { BoardPage } from './board-page';

/**
 * Golden-image regression for the cut itself (Track 2). Everything else in
 * `test/cut/` proves the geometry algebraically — aspect in band, tabs
 * exactly reverse their sockets, the graph is symmetric — but none of that
 * catches a change that's still algebraically valid and looks wrong: a
 * shifted bevel highlight, a knob drawn at the wrong radius, an interior
 * jitter that reads as "off" to a human eye without tripping any numeric
 * assertion.
 *
 * This is safe to run as a real gate, which screenshot tests usually aren't,
 * for two reasons specific to this repo: `BoardPage.open()` already stubs
 * `crypto.randomUUID` so the same seed cuts the same board every run (no new
 * work here), and `CLAUDE.md` already pins the Playwright version to one
 * Chromium build, so anti-aliasing and font rendering can't drift out from
 * under the baseline between runs on the same OS.
 *
 * **What it can't do: prove the baseline itself is right, or survive a
 * change of OS.** These PNGs must be generated on the same platform that
 * checks them — Playwright's screenshot comparison is not cross-platform
 * stable (font hinting and GPU rasterisation differ by OS even at a pinned
 * Chromium build). CI runs on Linux; this repo's contributors mostly don't.
 * If this file has no baseline yet, or the baseline was generated on a
 * different OS than CI runs on, see `.github/workflows/update-golden-snapshots.yml`
 * — do not generate or hand-edit the PNGs locally and commit them.
 */

test.describe('golden cut geometry', () => {
  test('a fixed seed and photo cut the same piece shapes every time', async ({ page }, testInfo) => {
    // A piece chip's canvas draws the same bitmap at the same CSS size
    // regardless of viewport, so there is no signal in running this twice —
    // only cost, since the phone project's tray sheet starts at peek and
    // would need its own setup to reach a chip at all.
    testInfo.skip(testInfo.project.name === 'phone', 'chip rendering does not depend on viewport');

    // The smallest ladder rung: this test cares about individual piece
    // geometry, not board layout, so there's nothing to gain from cutting
    // more pieces and every one costs cut time.
    const board = await BoardPage.open(page, { pieceCount: 50 });

    // Piece 0 and piece 1 in the canonical order, whatever shapes they
    // happen to be for this seed — the point is that they never change
    // shape silently, not that either one is a specific corner or edge.
    await expect(board.chip(0)).toBeVisible();
    await expect(board.chip(1)).toBeVisible();

    await expect(board.chip(0)).toHaveScreenshot('piece-0.png');
    await expect(board.chip(1)).toHaveScreenshot('piece-1.png');
  });
});
