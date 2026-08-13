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
 *
 * **A selected chip is labelled differently again** — "Piece 7, selected 2" —
 * so `chip(7)` stops matching the moment it carries a badge. `chipAny(7)` is the
 * one to reach for when the question is "is this piece still in the tray".
 *
 * **A group's label chip is drawn on canvas, not mounted as DOM.** There is no
 * locator for it and there must never be one: a DOM chip over the board would
 * re-render the tray sixty times a second during a drag, which is the whole
 * thing keeping the board out of React was for. `boardInk` finds it in pixels
 * instead, which is also the only way to ask where a pulled-out group landed.
 */

import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { SELECT_HOLD_MS } from '@/input/tray-drag';

/** Longest the cut may take before we call it hung. §04 budgets 1.2s in the worker. */
const CUT_TIMEOUT_MS = 30_000;

/**
 * Slack on top of `SELECT_HOLD_MS` before we call the hold failed.
 *
 * The hold is driven from the frame loop rather than from a timer, so it lands
 * on a frame boundary and never on the millisecond.
 */
const HOLD_SLACK_MS = 250;

export class BoardPage {
  readonly tray: Locator;
  readonly chips: Locator;
  readonly board: Locator;
  /** §06's pinned shelf row. Absent from the DOM while empty and no drag is up. */
  readonly shelf: Locator;
  /** The tray's scrolling body — the virtualised grid, and nothing pinned. */
  readonly gridBody: Locator;
  /** Select mode's action bar (§06). Present only while select mode is on. */
  readonly pullOutButton: Locator;
  readonly cancelButton: Locator;

  constructor(readonly page: Page) {
    this.tray = page.locator('[aria-label="Pieces"]');
    this.chips = page.locator('[aria-label="Pieces"] button[aria-label^="Piece "]');
    this.board = page.locator('canvas[data-layer="dynamic"]');
    this.shelf = page.locator('[aria-label="Shelf"]');
    this.gridBody = page.locator('[aria-label="Pieces"] .overflow-y-auto');
    this.pullOutButton = page.locator('[aria-label="Pieces"] button:has-text("Pull out")');
    this.cancelButton = page.locator('[aria-label="Pieces"] button:has-text("Cancel")');
  }

  /**
   * Options for the setup screen `open()` walks through. Everything defaults
   * to `DEFAULT_PUZZLE_CONFIG`, which is what the rest of the suite assumes.
   */
  static async open(
    page: Page,
    options: { pieceCount?: number; mode?: 'Classic' | 'Zen' } = {},
  ): Promise<BoardPage> {
    const board = new BoardPage(page);
    await page.addInitScript(() => {
      // Deterministic seed for the browser suite: PhotoCrop.tsx mints a random
      // puzzle id via crypto.randomUUID() on every confirm, which would make
      // every test's cut geometry different and cause geometry-dependent
      // assertions (e.g. tray-3b.spec.ts's group-chip position) to flake.
      window.crypto.randomUUID = () =>
        'ffffffff-ffff-4fff-8fff-ffffffffffff' as `${string}-${string}-${string}-${string}-${string}`;
    });
    await page.goto('/', { waitUntil: 'load' });
    // Step 5c: the app checks the library on mount and lands on it rather
    // than the picker whenever a saved session exists. Every spec that is not
    // *about* the library needs the deterministic empty-library entry flow —
    // cleared once per `open()` call, not once per page, so a test that opens
    // twice for two independent runs (e.g. puzzle-setup.spec.ts's large-piece
    // comparison) gets a fresh picker both times. A caller that wants a save
    // to survive — `persistence.spec.ts` — calls `page.reload()` directly
    // rather than `open()` again, so this never runs a second time for it.
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
    // §16: a truly fresh profile has never seen the guided twelve, so
    // `App.tsx`'s entry-screen effect (empty library, no completions, no
    // first-run flag) opens there instead of the picker. Every spec here
    // except `first-run.spec.ts` wants the ordinary picker flow, so skip it —
    // the same "reachable from any beat" exit a real player has, and it lands
    // on exactly the picker screen this helper expects next.
    //
    // That entry-screen decision is itself async (it awaits the library and
    // completion-count IndexedDB reads before choosing), so the picker and
    // the first-run overlay are both "not there yet" for a beat after reload
    // — racing for whichever shows up first, rather than probing one on a
    // short fixed timeout, is what keeps this from settling on the wrong
    // branch before the app has decided.
    const picker = page.getByRole('button', { name: 'Choose this photo' });
    const skip = page.getByRole('button', { name: 'Skip' });
    await Promise.race([picker.waitFor({ state: 'visible' }), skip.waitFor({ state: 'visible' })]);
    if (await skip.isVisible()) {
      await skip.click();
      await picker.waitFor({ state: 'visible' });
    }
    await picker.click();
    await page.getByRole('button', { name: 'Use this photo' }).click();
    // Step 5b's setup screen sits between the crop and the cut. Every default
    // is accepted here — `DEFAULT_PUZZLE_CONFIG`, 150 pieces, Classic, every
    // assist off — which is the configuration the rest of the suite assumes.
    if (options.pieceCount !== undefined) {
      await page.getByLabel(`Piece count: ${options.pieceCount}`).click();
    }
    if (options.mode !== undefined) {
      await page.getByLabel(`Mode: ${options.mode}`).click();
    }
    await page.getByRole('button', { name: 'Start cutting' }).click();
    await board.waitForCut();
    return board;
  }

  /**
   * Open a fresh Zen puzzle and solve it completely, leaving the completion
   * card on screen. Zen makes every hint tier free, which is the only way a
   * spec can place specific pieces without a test-only hook. Small ladder rung
   * by default — a full solve is expensive and one is enough.
   *
   * Plan 8's card and wall specs, and Plan 9's second-completion prompt, all
   * enter through here rather than reaching past `BoardPage`.
   */
  static async openZenAndComplete(
    page: Page,
    options: { pieceCount?: number } = {},
  ): Promise<BoardPage> {
    const board = await BoardPage.open(page, {
      pieceCount: options.pieceCount ?? 50,
      mode: 'Zen',
    });
    await board.completeZenPuzzle();
    return board;
  }

  /** Place every remaining piece via Tier-3 hints. Plan 9 calls this twice. */
  async completeZenPuzzle(): Promise<void> {
    const { total } = await this.placed();
    for (let i = 0; i < total; i++) {
      const [next] = await this.mountedIds();
      if (next === undefined) break;
      await this.placeViaHint(next);
    }
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

  /**
   * The chip for a piece whatever it is currently saying about itself.
   *
   * `chip(7)` is an exact label match, so it silently stops matching once the
   * piece is badged. The comma is load-bearing: without it `Piece 8` would also
   * match `Piece 82`, and the assertion "this piece left the tray" would pass on
   * a completely different chip.
   */
  chipAny(pieceId: number): Locator {
    return this.page.locator(
      `button[aria-label="Piece ${pieceId}"], button[aria-label^="Piece ${pieceId}, "]`,
    );
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

  /**
   * Hold a chip still until the tray enters select mode (§06).
   *
   * Still, deliberately: a press that travels `MOVE_THRESHOLD_PX` promotes to a
   * drag instead, which is a different gesture with a different outcome. The
   * wait is `SELECT_HOLD_MS` plus slack because the hold is driven from the
   * frame loop, and the constant is imported rather than restated so the two
   * cannot drift.
   */
  async enterSelect(pieceId: number): Promise<void> {
    const box = await this.chip(pieceId).boundingBox();
    expect(box, `piece ${pieceId} is not a mounted chip`).not.toBeNull();

    await this.page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await this.page.mouse.down();
    await this.page.waitForTimeout(SELECT_HOLD_MS + HOLD_SLACK_MS);
    await this.page.mouse.up();

    // The bar is the mode: if it is not here, the hold did not take, and every
    // assertion after this point would be measuring the wrong thing.
    await expect(this.pullOutButton).toBeVisible();
  }

  /**
   * Drag a chip out of the tray and drop it on the shelf row (§06).
   *
   * The shelf does not exist until the drag does — it is hidden when empty and
   * shows a dashed placeholder only while a chip is in flight — so its rectangle
   * has to be read mid-gesture, after the promotion and before the release. That
   * ordering is the whole reason this cannot reuse `dragOut`.
   *
   * Stepped past the 6px threshold first, exactly as `dragOut` is: the promotion
   * is part of what is being exercised.
   */
  async pin(pieceId: number): Promise<void> {
    const box = await this.chip(pieceId).boundingBox();
    expect(box, `piece ${pieceId} is not a mounted chip`).not.toBeNull();

    await this.page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await this.page.mouse.down();
    await this.page.mouse.move(box!.x - 40, box!.y, { steps: 6 });

    // The promotion auto-collapses the sheet to peek — a 200ms transition —
    // and the shelf sits inside it. Reading the box before that settles is
    // this method's own version of the flake `tray-3b.spec.ts`'s sibling
    // geometry test already waits out.
    await this.page.waitForTimeout(250);

    const shelf = await this.shelf.boundingBox();
    expect(shelf, 'the shelf did not appear while a chip was in flight').not.toBeNull();

    await this.page.mouse.move(shelf!.x + shelf!.width / 2, shelf!.y + shelf!.height / 2, {
      steps: 12,
    });
    await this.page.mouse.up();
    await this.page.waitForTimeout(400);
  }

  /**
   * Drag a chip straight down the tray with a genuine **touch** pointer.
   *
   * Playwright's `mouse` cannot produce `pointerType: 'touch'` and its
   * `touchscreen` can only tap, so this drives CDP directly:
   * `Input.synthesizeScrollGesture` with `gestureSourceType: 'touch'` emits real
   * touch events through Chromium's own gesture recogniser, which is the only
   * way to get both `pointerType === 'touch'` on the chip *and* native
   * scrolling out of one gesture. A mouse-driven version of this test would
   * exercise the wrong branch of `TrayDrag.move` and prove nothing: the axis
   * rule is deliberately touch-only, because a mouse never scrolls from a drag.
   *
   * `Emulation.setTouchEmulationEnabled` is sent explicitly so this works at the
   * dock viewport too, where the device descriptor has `hasTouch: false`.
   *
   * Returns the tray body's `scrollTop` afterwards.
   */
  async scrollTrayByTouch(pieceId: number, distance = 150): Promise<number> {
    const box = await this.chip(pieceId).boundingBox();
    expect(box, `piece ${pieceId} is not a mounted chip`).not.toBeNull();

    const cdp = await this.page.context().newCDPSession(this.page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await cdp.send('Input.synthesizeScrollGesture', {
      x: box!.x + box!.width / 2,
      y: box!.y + box!.height / 2,
      xDistance: 0,
      // Negative is a finger travelling *up* the screen, which scrolls down.
      yDistance: -distance,
      gestureSourceType: 'touch',
      speed: 800,
    });
    await this.page.waitForTimeout(400);
    await cdp.detach();

    return this.page.evaluate(() => {
      const el = document.querySelector('[aria-label="Pieces"] .overflow-y-auto');
      return el ? el.scrollTop : -1;
    });
  }

  /**
   * Actually *place* a piece — pull it onto the mat, tap to target it, then
   * hold the hint button past both escalation thresholds so Tier 3 drops it
   * into its slot through the real `release()` path (§07).
   *
   * The only way a spec can place a specific piece without the app growing a
   * test-only hook: a drag would have to land inside snap tolerance of a slot
   * whose world position nothing in the DOM reports.
   *
   * Zen mode makes every tier free, which is what makes a full solve possible.
   */
  async placeViaHint(pieceId: number): Promise<void> {
    const dropPoint = await this.matPoint();
    await this.dragOut(pieceId, dropPoint);

    await this.page.mouse.move(dropPoint.x, dropPoint.y);
    await this.page.mouse.down();
    await this.page.mouse.up();

    const hintButton = this.page.locator('button[aria-label^="Hint"]');
    await expect(hintButton).toBeEnabled();
    const box = await hintButton.boundingBox();
    expect(box, 'hint button has no box').not.toBeNull();

    await this.page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await this.page.mouse.down();
    // Past both escalation thresholds (§07, `src/play/hints.ts`).
    await this.page.waitForTimeout(1300);
    await this.page.mouse.up();
    await this.page.waitForTimeout(250);
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

/** A rectangle in CSS pixels, in the viewport's own coordinates. */
export interface InkBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * What the dynamic layer actually has ink on, measured in pixels.
 *
 * The board is a canvas and retains no scene graph, so there is nothing to
 * query — and the group label chip is deliberately not DOM, so there is no
 * locator either. Reading the pixels back is the only honest way to ask "where
 * did the pull-out land" and "where is the chip I have to tap", and it is also
 * the only way to ask it without the app growing a test-only hook.
 *
 * Three boxes, because three questions:
 *
 *   `all`     every visible pixel, group outline included. "Is the group on mat
 *             the player can see, or behind the sheet?"
 *   `chip`    the label chip. Found by *alpha*, not colour: real curated photos
 *             (`src/play/curated.ts`) have genuinely dark gradient regions, so a
 *             darkness test misclassifies piece pixels as chip.
 *
 *             The chip fill is `rgba(20,20,22,0.86)`, which over a transparent
 *             canvas composites to a≈219 — measured live, it lands a sharp,
 *             dominant spike at 219-220. But a live alpha histogram also showed
 *             piece *edges* are anti-aliased (curved tab/socket paths), scattering
 *             low-count noise pixels across the *entire* 0-255 alpha range,
 *             including right through the chip's band — a plain "is alpha in
 *             range" test over the whole canvas lets a handful of those stray
 *             edge pixels, wherever on the mat they land, blow the chip's
 *             bounding box out to cover the pieces underneath it too. What
 *             distinguishes the real chip is not just its alpha but that it is a
 *             large *contiguous* block of matching pixels, where edge noise is
 *             isolated single pixels along a curve. So this floods the narrow
 *             band around that spike (`CHIP_ALPHA_MIN`..`CHIP_ALPHA_MAX`) and
 *             keeps only the largest connected component — noise pixels never
 *             chain into anything bigger than a few px and lose every time.
 *             (The fill alone reconstructs the full rect: text sits inside the
 *             chip's padding, so the top/bottom rows and left/right columns of
 *             the fill are never touched by a glyph, and the component's bbox
 *             already spans the whole chip without needing to also classify the
 *             text-on-fill pixels, whose composited alpha — ≈249, `0.82 +
 *             0.86·(1-0.82)` — sits in its own, noisier band anyway.)
 *   `pieces`  the pulled-out pieces, chip excluded. Coordinates already subtract
 *             the chip's whole rectangle. Piece interiors are opaque (a=255,
 *             dominant in the same histogram); the boundary is `a ≥ PIECE_ALPHA_MIN`
 *             instead of `=== 255` only to tolerate rounding at the piece's own
 *             anti-aliased edge, which is what `pieces` is also the fallback box
 *             for when no chip is on screen.
 *
 * Null when nothing is drawn at all, which is what an untouched board looks
 * like: every piece starts in the tray, so the mat is genuinely empty.
 */
export async function boardInk(page: Page): Promise<{
  all: InkBox | null;
  chip: InkBox | null;
  pieces: InkBox | null;
}> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-layer="dynamic"]');
    if (!canvas) throw new Error('boardInk: no dynamic layer');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('boardInk: no 2d context');

    const rect = canvas.getBoundingClientRect();
    const { width, height } = canvas;
    const dpr = width / rect.width;
    const data = ctx.getImageData(0, 0, width, height).data;

    interface Bounds {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    }
    const fresh = (): Bounds => ({ minX: Infinity, minY: Infinity, maxX: -1, maxY: -1 });
    const grow = (b: Bounds, x: number, y: number): void => {
      if (x < b.minX) b.minX = x;
      if (y < b.minY) b.minY = y;
      if (x > b.maxX) b.maxX = x;
      if (y > b.maxY) b.maxY = y;
    };
    const box = (b: Bounds): { x: number; y: number; w: number; h: number } | null =>
      b.maxX < 0
        ? null
        : {
            x: rect.x + b.minX / dpr,
            y: rect.y + b.minY / dpr,
            w: (b.maxX - b.minX + 1) / dpr,
            h: (b.maxY - b.minY + 1) / dpr,
          };

    // The chip fill's own composited alpha, `0.86 * 255` rounded, ± the small
    // spread the histogram showed at the chip's anti-aliased rounded corners.
    const CHIP_ALPHA_MIN = 210;
    const CHIP_ALPHA_MAX = 230;
    // Below this, treat a pixel as "not really opaque" — an anti-aliased piece
    // edge or the chip itself, never a piece's solid interior.
    const PIECE_ALPHA_MIN = 253;
    // A real chip's fill is hundreds of contiguous pixels; edge-antialiasing
    // noise never chains past a handful. Anything under this is noise, not chip.
    const MIN_CHIP_CLUSTER = 20;

    const all = fresh();
    const bright = fresh();
    const inBand = new Uint8Array(width * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const a = data[i + 3]!;
        // Above the group outline's 3%-alpha fill, so a faint wash still counts.
        if (a <= 8) continue;
        grow(all, x, y);
        if (a >= CHIP_ALPHA_MIN && a <= CHIP_ALPHA_MAX) inBand[y * width + x] = 1;
        else if (a >= PIECE_ALPHA_MIN) grow(bright, x, y);
      }
    }

    // Flood-fill the band mask (4-connectivity) and keep only the largest
    // component — see the doc comment above for why size, not just alpha,
    // is what tells the chip's fill apart from scattered piece-edge noise.
    const visited = new Uint8Array(width * height);
    const qx = new Int32Array(width * height);
    const qy = new Int32Array(width * height);
    const chip = fresh();
    let bestSize = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const start = y * width + x;
        if (!inBand[start] || visited[start]) continue;

        let head = 0;
        let tail = 0;
        qx[tail] = x;
        qy[tail] = y;
        tail++;
        visited[start] = 1;
        let size = 0;
        const bounds = fresh();

        while (head < tail) {
          const cx = qx[head]!;
          const cy = qy[head]!;
          head++;
          size++;
          grow(bounds, cx, cy);

          const neighbours: Array<[number, number]> = [
            [cx - 1, cy],
            [cx + 1, cy],
            [cx, cy - 1],
            [cx, cy + 1],
          ];
          for (const [nx, ny] of neighbours) {
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const np = ny * width + nx;
            if (inBand[np] && !visited[np]) {
              visited[np] = 1;
              qx[tail] = nx;
              qy[tail] = ny;
              tail++;
            }
          }
        }

        if (size > bestSize) {
          bestSize = size;
          chip.minX = bounds.minX;
          chip.minY = bounds.minY;
          chip.maxX = bounds.maxX;
          chip.maxY = bounds.maxY;
        }
      }
    }
    const hasChip = bestSize >= MIN_CHIP_CLUSTER;
    if (!hasChip) {
      chip.minX = Infinity;
      chip.minY = Infinity;
      chip.maxX = -1;
      chip.maxY = -1;
    }

    // The chip's text sits inside the chip's own footprint, so subtract the
    // chip's whole rectangle rather than trusting the alpha band twice.
    const pieces = fresh();
    if (hasChip) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (x >= chip.minX && x <= chip.maxX && y >= chip.minY && y <= chip.maxY) continue;
          const i = (y * width + x) * 4;
          if (data[i + 3]! < PIECE_ALPHA_MIN) continue;
          grow(pieces, x, y);
        }
      }
    }

    return {
      all: box(all),
      chip: box(chip),
      pieces: box(chip.maxX >= 0 ? pieces : bright),
    };
  });
}

/**
 * Count draws of the board's own canvas layers.
 *
 * "On an idle board with no finger down the app draws nothing at all" (§03) is
 * a claim about scheduling, and the dev harness publishes it directly as
 * `#sched`. The product page has no such readout, so this instruments the thing
 * itself: every layer repaint begins by clearing its canvas, and the board's
 * four canvases are the only ones carrying `data-layer`. A chip's thumbnail
 * canvas clears itself too and is correctly not counted.
 */
export async function watchBoardPaints(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store = window as unknown as { __paints: number };
    store.__paints = 0;
    const proto = CanvasRenderingContext2D.prototype;
    const original = proto.clearRect;
    proto.clearRect = function clearRect(
      this: CanvasRenderingContext2D,
      ...args: [number, number, number, number]
    ): void {
      const canvas = this.canvas;
      if (canvas instanceof HTMLCanvasElement && canvas.dataset['layer']) store.__paints++;
      original.apply(this, args);
    };
  });
}

export const boardPaints = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __paints: number }).__paints);
