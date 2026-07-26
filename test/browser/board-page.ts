/**
 * What the specs need to talk about the board, in one place.
 *
 * Two facts drive every selector here and both have already caught a bad test.
 *
 * **The tray is virtualised**, so the DOM never holds all N chips — only the
 * rows in view. Anything that counts chips is counting what is mounted, which is
 * a fact about the viewport rather than about the tray. Use `remaining()` when
 * you mean "how many pieces are left".
 *
 * **A piece on the mat is labelled differently from one in the tray** — "Find
 * piece 7 on the mat" versus "Piece 7" — because the Recent lens offers it as a
 * locator, not as a second draggable copy of a piece that already exists.
 * A selector that does not know this reports a working feature as broken.
 */

import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** Longest the cut may take before we call it hung. §04 budgets 1.2s in the worker. */
const CUT_TIMEOUT_MS = 30_000;

export class BoardPage {
  readonly tray: Locator;
  readonly chips: Locator;
  readonly board: Locator;

  constructor(readonly page: Page) {
    this.tray = page.locator('[aria-label="Pieces"]');
    this.chips = page.locator('[aria-label="Pieces"] button[aria-label^="Piece "]');
    this.board = page.locator('canvas[data-layer="dynamic"]');
  }

  static async open(page: Page): Promise<BoardPage> {
    const board = new BoardPage(page);
    await page.goto('/', { waitUntil: 'load' });
    await board.waitForCut();
    return board;
  }

  async waitForCut(): Promise<void> {
    await this.page.waitForFunction(
      () =>
        document.querySelectorAll('[aria-label="Pieces"] button[aria-label^="Piece "]').length > 10,
      null,
      { timeout: CUT_TIMEOUT_MS },
    );
  }

  chip(pieceId: number): Locator {
    return this.page.locator(`button[aria-label="Piece ${pieceId}"]`);
  }

  /** A piece sitting on the mat, as the Recent lens presents it. */
  matChip(pieceId: number): Locator {
    return this.page.locator(`button[aria-label="Find piece ${pieceId} on the mat"]`);
  }

  lens(name: string): Locator {
    return this.page.locator(`[aria-label="Pieces"] button:has-text("${name}")`).first();
  }

  /**
   * Switch lens, then put the pointer somewhere harmless.
   *
   * Leaving it on the chip that was just clicked means the next `wheel` scrolls
   * the tray instead of zooming the board — which reads exactly like the camera
   * being broken.
   */
  async pick(name: string): Promise<void> {
    await this.lens(name).click();
    await this.page.waitForTimeout(150);
    await this.page.mouse.move(4, 4);
  }

  /** Piece ids currently mounted, in the order the tray lays them out. */
  async mountedIds(): Promise<number[]> {
    return this.chips.evaluateAll((els) =>
      els.map((el) => Number(el.getAttribute('aria-label')!.replace('Piece ', ''))),
    );
  }

  /** Pieces not yet placed, from the top bar — unaffected by virtualisation. */
  async remaining(): Promise<number> {
    const text = await this.page.locator('header').innerText();
    const match = text.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) throw new Error(`BoardPage: no progress in header "${text}"`);
    return Number(match[2]) - Number(match[1]);
  }

  async placed(): Promise<{ placed: number; total: number }> {
    const text = await this.page.locator('header').innerText();
    const match = text.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) throw new Error(`BoardPage: no progress in header "${text}"`);
    return { placed: Number(match[1]), total: Number(match[2]) };
  }

  /**
   * A point on mat the player can actually reach.
   *
   * **Not the centre of the canvas.** On a phone the sheet is a fixed overlay
   * across the bottom of that canvas, so its centre is underneath the tray —
   * a drop there returns the piece to the tray, and a press there grabs the
   * sheet. Both present as drag-out being broken when it is working perfectly.
   *
   * The docked tray is a flex sibling and takes its width out of the canvas, so
   * there the centre is genuinely mat.
   */
  async matPoint(): Promise<{ x: number; y: number }> {
    const box = await this.board.boundingBox();
    expect(box, 'the board canvas has no box').not.toBeNull();

    const tray = await this.tray.boundingBox();
    const overlays = tray !== null && tray.y > box!.y && tray.y < box!.y + box!.height;
    if (!overlays) return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };

    // Halfway down the strip of mat left above the sheet at its resting detent.
    return { x: box!.x + box!.width / 2, y: box!.y + (tray!.y - box!.y) / 2 };
  }

  /**
   * Drag a chip out of the tray and drop it on the mat.
   *
   * Deliberately in steps and past the 6px threshold first: the promotion is the
   * part being exercised, and a single jump to the destination would skip it.
   */
  async dragOut(pieceId: number, to: { x: number; y: number }): Promise<void> {
    const box = await this.chip(pieceId).boundingBox();
    expect(box, `piece ${pieceId} is not a mounted chip`).not.toBeNull();

    await this.page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(box!.x - 40, box!.y, { steps: 6 });
    await this.page.mouse.move(to.x, to.y, { steps: 12 });
    await this.page.mouse.up();
    await this.page.waitForTimeout(400);
  }

  /** Pick a piece up off the mat and drop it somewhere else. */
  async dragOnMat(from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
    await this.page.mouse.move(from.x, from.y);
    await this.page.mouse.down();
    await this.page.mouse.move(from.x - 30, from.y - 20, { steps: 8 });
    await this.page.mouse.move(to.x, to.y, { steps: 12 });
    await this.page.mouse.up();
    await this.page.waitForTimeout(400);
  }

  async zoom(steps: number): Promise<void> {
    const at = await this.matPoint();
    await this.page.mouse.move(at.x, at.y);
    for (let i = 0; i < Math.abs(steps); i++) {
      await this.page.mouse.wheel(0, steps > 0 ? -240 : 240);
    }
    // The Region lens re-reads the camera 160ms after it settles, not per frame.
    await this.page.waitForTimeout(500);
  }
}

/**
 * Count DOM churn inside the tray.
 *
 * The way to catch the board leaking into React: a re-render of a 70-chip grid
 * is hundreds of mutations, so "did the tray re-render while the camera moved"
 * is a question with an unambiguous numeric answer.
 */
export async function watchTrayMutations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __mutations: number }).__mutations = 0;
    const start = (): void => {
      const tray = document.querySelector('[aria-label="Pieces"]');
      if (!tray) {
        setTimeout(start, 100);
        return;
      }
      new MutationObserver((records) => {
        (window as unknown as { __mutations: number }).__mutations += records.length;
      }).observe(tray, { childList: true, subtree: true, attributes: true });
    };
    start();
  });
}

export const trayMutations = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __mutations: number }).__mutations);
