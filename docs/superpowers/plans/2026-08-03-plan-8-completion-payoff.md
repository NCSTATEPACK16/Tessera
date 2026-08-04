# Plan 8 — Completion Payoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop erasing finished puzzles; compose a real Puzzle Card from the completed board; give
the player share, save, again-harder and new-puzzle from it; and build the collection wall §15
calls the strongest retention lever in the product.

**Architecture:** A new additive IndexedDB store (`completions`, db v3) records one small row per
finish, so "in progress" and "finished" stay separate concepts and a completed 250-piece snapshot
plus its source blob does not stay resident forever. The card splits pure layout maths
(`src/play/card.ts`, tested) from canvas drawing (`src/render/card.ts`, judged by hand) — the same
split `cutter.ts`/`cutter.worker.ts` and `light.ts`/`renderer.ts` already use.

**Tech Stack:** TypeScript, React 19, Vite 6, IndexedDB, Canvas/OffscreenCanvas, Web Share API,
vitest (node env), Playwright.

**Depends on:** Plan 0 (the card's attribution line reads `CuratedPhoto.licence.attribution`).

## Global Constraints

- **The design doc wins every disagreement.** §11 wireframe 05 is the card's layout; §15 is the
  wall and the attribution requirement; §13 is the token sheet.
- **`--type-display` (Instrument Serif) earns its keep on the card and nowhere else on this
  screen.** `--type-data` (IBM Plex Mono, tnum) for times and counts.
- **No exclamation marks, no confetti — the lit photo is the reward.**
- **DOM-free is the same word as tested.**
- **The board never re-renders through React.**
- **No `localStorage` for session state — IndexedDB only.**
- **Touch target floor 44pt, everywhere. Colour is never the only signal.**
- **`npm run test:browser` is a gate, not an optional extra.**
- Commands: `npm test` · `npm run typecheck` · `npm run build` · `npm run test:browser`

---

### Task 1: The completions store, db v3

**Files:**
- Modify: `src/persist/db.ts`
- Create: `src/persist/completions.ts`
- Test: `test/browser/persistence.spec.ts`

**Interfaces:**
- Consumes: `idbGet`, `idbPut`, `idbGetAll`, `idbDelete` from `src/persist/db.ts`;
  `PuzzleMode` from `src/play/setup.ts`.
- Produces:
  - `CompletionRecord` — the shape in Step 3.
  - `saveCompletion(record: CompletionRecord): Promise<void>`
  - `listCompletions(): Promise<CompletionRecord[]>` — newest first, by `completedAt`.
  - `completionCount(): Promise<number>` — Plan 9's install prompt counts on this.
  - `STORE_COMPLETIONS` exported from `db.ts`.

- [ ] **Step 1: Write the failing browser test**

IndexedDB is not available in vitest's node environment, so the schema bump is asserted in
Playwright — exactly where step 6 asserted its own v1→v2 bump. Add to
`test/browser/persistence.spec.ts`:

```ts
test('the v2 to v3 bump preserves an in-progress session', async ({ page }) => {
  const board = new BoardPage(page);
  await board.open();
  await board.placeViaHint();
  // Autosave only fires from a real play event — see handoff.md §1g. One
  // placement is the established pattern for making a save worth waiting on.
  await page.waitForTimeout(1200);

  const before = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('tessera');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const version = db.version;
    const names = [...db.objectStoreNames];
    db.close();
    return { version, names };
  });

  expect(before.version).toBe(3);
  expect(before.names).toContain('completions');
  // The whole point: the bump is additive.
  expect(before.names).toEqual(
    expect.arrayContaining(['sessions', 'photos', 'thumbnails', 'daily', 'completions']),
  );

  await page.reload();
  // The session written before the bump is still there and still restores.
  await expect(board.remaining()).not.toHaveText('0');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:browser -- test/browser/persistence.spec.ts`
Expected: FAIL — version is 2, no `completions` store.

- [ ] **Step 3: Bump the schema and write the store**

In `src/persist/db.ts`, change `DB_VERSION` to `3`, add the constant, and add the guarded
`createObjectStore`. Update the comment above `DB_VERSION` — it currently says *"Bumped to 2 at
step 6"* — to record the v3 bump and the same reasoning:

```ts
export const STORE_COMPLETIONS = 'completions';
```

```ts
      if (!db.objectStoreNames.contains(STORE_COMPLETIONS)) {
        db.createObjectStore(STORE_COMPLETIONS, { keyPath: 'puzzleId' });
      }
```

Then `src/persist/completions.ts`:

```ts
/**
 * The collection wall's data (step 8).
 *
 * §15: "a growing mosaic of everything you have finished is a possession, and
 * people do not abandon possessions." Before this store, `handleDone` deleted
 * the library entry and a finished puzzle left no trace at all.
 *
 * Deliberately a *separate* store rather than a status flag on the library
 * entry: "in progress" and "finished" stay distinct concepts, and a completed
 * 250-piece snapshot plus its full-size source blob does not stay resident
 * forever. §17 names iOS Safari storage eviction as a standing risk, and the
 * cheapest way to protect in-progress boards is to not hoard finished ones.
 */

import { STORE_COMPLETIONS, idbGetAll, idbPut } from './db';
import type { PuzzleMode } from '@/play/setup';

export interface CompletionRecord {
  puzzleId: string;
  /** The curated photo's id, or null for an upload. */
  photoId: string | null;
  /** The final board — `captureThumbnail`'s output, never the source photo. */
  thumbnailBlob: Blob;
  elapsedMs: number;
  pieceCount: number;
  mode: PuzzleMode;
  cleanRun: boolean;
  /** Epoch ms. Orders the wall, newest first. */
  completedAt: number;
  /**
   * Denormalised at write time so the wall never re-reads the manifest — and
   * so a photo later removed from the library keeps its attribution on the
   * cards that already earned it.
   */
  attribution: string | null;
}

export async function saveCompletion(record: CompletionRecord): Promise<void> {
  await idbPut<CompletionRecord>(STORE_COMPLETIONS, record);
}

/** Newest first. */
export async function listCompletions(): Promise<CompletionRecord[]> {
  const all = await idbGetAll<CompletionRecord>(STORE_COMPLETIONS);
  return all.sort((a, b) => b.completedAt - a.completedAt);
}

/** Plan 9's install prompt fires after the second completion (§17). */
export async function completionCount(): Promise<number> {
  return (await idbGetAll<CompletionRecord>(STORE_COMPLETIONS)).length;
}
```

- [ ] **Step 4: Run the browser test**

Run: `npm run test:browser -- test/browser/persistence.spec.ts`
Expected: PASS on both projects.

- [ ] **Step 5: Commit**

```bash
git add src/persist/db.ts src/persist/completions.ts test/browser/persistence.spec.ts
git commit -m "Step 8: the completions store — IndexedDB v3, additive"
```

---

### Task 2: The card's layout maths

**Files:**
- Create: `src/play/card.ts`
- Test: `test/play/card.test.ts`

**Interfaces:**
- Consumes: `PuzzleMode` from `src/play/setup.ts`.
- Produces — these exact names and shapes, because Task 3 draws them field by field:

  ```ts
  export interface CardMeta {
    title: string;
    elapsedMs: number;
    pieceCount: number;
    mode: PuzzleMode;
    cleanRun: boolean;
    /** null for an uploaded photo — there is nothing to credit. */
    attribution: string | null;
  }

  export interface CardRect { x: number; y: number; w: number; h: number }

  /** `w`/`h` are the drawn extent; the renderer sets `ctx.font` from `size`. */
  export interface CardTextBox { x: number; y: number; w: number; h: number; text: string; size: number }

  export interface CardLayout {
    width: number;
    height: number;
    photo: CardRect;
    title: CardTextBox;
    stats: CardTextBox[];
    badge: CardRect | null;
    attribution: CardTextBox | null;
  }
  ```

  - `layoutCard(photoAspect: number, meta: CardMeta, targetWidth: number): CardLayout`
  - `formatElapsed(ms: number): string` — `"18:42"`, `"1:04:11"` past an hour.
  Task 3 draws exactly these boxes; Task 4 renders the same `formatElapsed` in the DOM.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { formatElapsed, layoutCard, type CardMeta } from '@/play/card';

const meta: CardMeta = {
  title: 'Harbour, June',
  elapsedMs: 18 * 60_000 + 42_000,
  pieceCount: 204,
  mode: 'classic',
  cleanRun: true,
  attribution: 'Photo: A. Example / Unsplash',
};

describe('formatElapsed', () => {
  // §13: --type-data is "IBM Plex Mono, tnum. Must not shift width as it
  // ticks." Zero-padding is what makes that true of the string itself.
  it('renders wireframe 05 verbatim', () => {
    expect(formatElapsed(18 * 60_000 + 42_000)).toBe('18:42');
  });

  it('pads seconds, so the glyph count never changes within an hour', () => {
    expect(formatElapsed(60_000 + 4_000)).toBe('01:04');
  });

  it('grows to hours only when it must', () => {
    expect(formatElapsed(3_600_000 + 4 * 60_000 + 11_000)).toBe('1:04:11');
  });

  it('floors rather than rounds — a card must never claim a time not reached', () => {
    expect(formatElapsed(59_999)).toBe('00:59');
  });
});

describe('layoutCard', () => {
  it('sizes the photo to its own aspect, never cropping it', () => {
    const wide = layoutCard(3 / 2, meta, 1200);
    expect(wide.photo.w).toBe(1200 - 2 * 40);
    expect(wide.photo.h).toBeCloseTo((1200 - 80) / (3 / 2), 0);
  });

  it('is taller for a portrait photo, so the card follows the image', () => {
    const portrait = layoutCard(2 / 3, meta, 1200);
    const landscape = layoutCard(3 / 2, meta, 1200);
    expect(portrait.height).toBeGreaterThan(landscape.height);
  });

  it('emits the four stats from wireframe 05, in order', () => {
    const layout = layoutCard(3 / 2, meta, 1200);
    expect(layout.stats.map((s) => s.text)).toEqual(['18:42', '204 pieces', 'classic']);
    expect(layout.badge).not.toBeNull();
  });

  it('omits the clean-run badge when the run was not clean', () => {
    const layout = layoutCard(3 / 2, { ...meta, cleanRun: false }, 1200);
    expect(layout.badge).toBeNull();
  });

  it('omits attribution for an uploaded photo — there is nothing to credit', () => {
    const layout = layoutCard(3 / 2, { ...meta, attribution: null }, 1200);
    expect(layout.attribution).toBeNull();
  });

  it('keeps every box inside the card', () => {
    const layout = layoutCard(3 / 2, meta, 1200);
    const boxes = [layout.photo, ...layout.stats, layout.badge, layout.attribution].filter(
      (b): b is NonNullable<typeof b> => b !== null,
    );
    for (const box of boxes) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + (box.w ?? 0)).toBeLessThanOrEqual(layout.width);
      expect(box.y + (box.h ?? 0)).toBeLessThanOrEqual(layout.height);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/play/card.test.ts`
Expected: FAIL — `@/play/card` does not exist.

- [ ] **Step 3: Write the layout**

`src/play/card.ts`. Use §13's spacing scale (`4 8 12 16 24 40 64`) and type scale
(`12 14 16 20 28 40 64`) — **nothing off-scale ships**. Padding is `--space-6` (40). Title at 40 in
the display serif; stats at 16 in the data mono; attribution at 12 in `--ink-muted`. The card's
height is derived from the photo's, so a portrait photo yields a taller card rather than a cropped
one.

`formatElapsed` floors: `Math.floor(ms / 1000)`, then `mm:ss` zero-padded, growing to `h:mm:ss`
past an hour.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/play/card.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/play/card.ts test/play/card.test.ts
git commit -m "Step 8: the Puzzle Card's layout maths — pure, per wireframe 05"
```

---

### Task 3: Composing the card to a PNG

**Files:**
- Create: `src/render/card.ts`

**Interfaces:**
- Consumes: `layoutCard`, `CardMeta` from Task 2.
- Produces: `composeCard(board: HTMLCanvasElement | OffscreenCanvas, meta: CardMeta, targetWidth?:
  number): Promise<Blob>` — a PNG. Task 4 shares and downloads it; Task 6's wall shows its
  thumbnail.

Canvas, so judged by hand — the category `CLAUDE.md` puts `renderer.ts` in. No unit test; the
browser test in Task 4 asserts a non-empty PNG comes out.

- [ ] **Step 1: Write it**

```ts
/**
 * The Puzzle Card (§11 wireframe 05, §15's attribution requirement).
 *
 * The image is the *completed board canvas*, not the source photo.
 * `captureThumbnail` already performs exactly this capture for library cards,
 * and §11 says "the photo, fully lit" — the lit assembled board is that,
 * seams and all. Composing from the source would print a stock image instead
 * of the thing the player just made.
 *
 * Canvas work, judged by hand. Every position comes from `layoutCard`, which
 * is tested; this file only draws.
 */
import { layoutCard, type CardMeta } from '@/play/card';

const CARD_WIDTH = 1200;

export async function composeCard(
  board: HTMLCanvasElement | OffscreenCanvas,
  meta: CardMeta,
  targetWidth: number = CARD_WIDTH,
): Promise<Blob> {
  const layout = layoutCard(board.width / board.height, meta, targetWidth);
  const canvas = new OffscreenCanvas(layout.width, layout.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('composeCard: 2d context unavailable');

  // §13's --mat-raised: the card is a raised surface, not the void.
  ctx.fillStyle = '#1E232A';
  ctx.fillRect(0, 0, layout.width, layout.height);

  ctx.drawImage(board, layout.photo.x, layout.photo.y, layout.photo.w, layout.photo.h);

  // §13: the display serif "earns its keep here and nowhere else on this
  // screen." Loaded in index.html since step 5 for exactly this moment.
  ctx.fillStyle = '#EDF0F4';
  ctx.textBaseline = 'top';
  ctx.font = `${layout.title.size}px "Instrument Serif", serif`;
  ctx.fillText(layout.title.text, layout.title.x, layout.title.y);

  // Times and counts in tnum mono, so nothing shifts width.
  for (const stat of layout.stats) {
    ctx.fillStyle = '#8A929E';
    ctx.font = `${stat.size}px "IBM Plex Mono", monospace`;
    ctx.fillText(stat.text, stat.x, stat.y);
  }

  if (layout.badge) {
    // A clean run is a badge *and* a word — colour is never the only signal.
    ctx.strokeStyle = '#8A929E';
    ctx.lineWidth = 1;
    ctx.strokeRect(layout.badge.x, layout.badge.y, layout.badge.w, layout.badge.h);
    ctx.fillStyle = '#EDF0F4';
    ctx.font = '16px "Inter Tight", system-ui, sans-serif';
    ctx.fillText('clean run', layout.badge.x + 12, layout.badge.y + 8);
  }

  if (layout.attribution) {
    // §15: "surfaced quietly on the completion card."
    ctx.fillStyle = '#8A929E';
    ctx.font = `${layout.attribution.size}px "Inter Tight", system-ui, sans-serif`;
    ctx.fillText(layout.attribution.text, layout.attribution.x, layout.attribution.y);
  }

  return canvas.convertToBlob({ type: 'image/png' });
}
```

**Fonts must be loaded before drawing.** `ctx.font` silently falls back to a default if the
webfont has not arrived, and a card in the wrong typeface is a silent failure. Await
`document.fonts.ready` at the call site in Task 4, not here — this file stays DOM-free enough to
run in a worker later.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/render/card.ts
git commit -m "Step 8: compose the Puzzle Card from the completed board, not the source photo"
```

---

### Task 4: The card screen — replacing the 5c banner

**Files:**
- Create: `src/ui/CompletionCard.tsx`
- Delete: `src/ui/CompletionBanner.tsx`
- Modify: `src/ui/App.tsx`
- Test: `test/browser/completion.spec.ts`

**Interfaces:**
- Consumes: `composeCard` (Task 3), `formatElapsed` (Task 2), `saveCompletion` (Task 1),
  `nextHarderCount` from `src/play/setup.ts`, `captureThumbnail` from `src/persist/thumbnail.ts`.
- Produces: `CompletionCardProps { meta, cardBlob, canGoHarder, nextCount, onAgainHarder, onDone,
  onNewPuzzle, daily? }` and `CompletionCard`. Task 6's wall reuses `CompletionCard` to re-show a
  finished puzzle.

`src/ui/CompletionBanner.tsx`'s own header already declares it a placeholder for *"Step 8's Puzzle
Card"*. This is that replacement; keep its `daily` variant (design doc screen 10, *"Daily variant
with streak increment"*) exactly.

- [ ] **Step 1: Write the failing browser test**

Add to `test/browser/completion.spec.ts`, which already reaches `status === 'complete'` via Zen:

```ts
test('the card shows the run, offers the next step up, and can be shared', async ({ page }) => {
  const board = new BoardPage(page);
  await board.openZenAndComplete();

  await expect(page.getByRole('img', { name: 'Puzzle card' })).toBeVisible();
  // §15: "Suggest the next difficulty step on the card, in the moment of
  // confidence" — the specific number, not a generic label.
  await expect(page.getByRole('button', { name: /Again, at \d+ pieces/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
});

test('a finished puzzle leaves the library and joins the completions', async ({ page }) => {
  const board = new BoardPage(page);
  await board.openZenAndComplete();
  await page.getByRole('button', { name: 'Done' }).click();

  const counts = await page.evaluate(async () => {
    const read = (store: string) =>
      new Promise<number>((res, rej) => {
        const r = indexedDB.open('tessera');
        r.onsuccess = () => {
          const tx = r.result.transaction(store, 'readonly');
          const all = tx.objectStore(store).getAll();
          all.onsuccess = () => res(all.result.length);
          tx.onerror = () => rej(tx.error);
        };
      });
    return { sessions: await read('sessions'), completions: await read('completions') };
  });

  expect(counts.completions).toBe(1);
  expect(counts.sessions).toBe(0);
});
```

Neither helper exists yet. Add **both** to `test/browser/board-page.ts`, wrapping whatever
`completion.spec.ts` currently does to finish a puzzle. **Put them on `BoardPage`**, because that
class exists precisely so specs do not reach past it. Plan 7 and Plan 9 both consume these exact
names:

```ts
/** Start a fresh Zen puzzle and place every piece. Leaves the card on screen. */
async openZenAndComplete(): Promise<void>;

/** Complete the puzzle currently on the board. Plan 9 calls this twice in a row. */
async completeZenPuzzle(): Promise<void>;

/** Clear IndexedDB once, then load — for a genuinely first-time player. */
async openFresh(): Promise<void>;
```

`openFresh` must delete the database via `page.evaluate` **against the already-loaded page**, never
`page.addInitScript` — the latter re-fires on every navigation, including a test's own `reload()`,
and silently wipes the state the assertion depends on. That trap cost step 6 a debugging session
(`handoff.md` §1g).

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:browser -- test/browser/completion.spec.ts`
Expected: FAIL — no card, no share button, and `completions` is empty.

- [ ] **Step 3: Write `CompletionCard.tsx`**

Render the composed PNG in an `<img alt="Puzzle card">` from an object URL, **revoked on unmount** —
a leaked blob URL pins the whole PNG in memory for the session. Beneath it, four actions:

```tsx
// §15: the next step up, named. `nextHarderCount` already exists — 5c wired
// again-harder; this surfaces the number.
{canGoHarder && (
  <button type="button" onClick={onAgainHarder} aria-label={`Again, at ${nextCount} pieces`}>
    Again, at {nextCount} pieces
  </button>
)}
```

Share, feature-detected — the fallback is the desktop path, not an error path:

```tsx
const share = async (): Promise<void> => {
  const file = new File([cardBlob], 'tessera.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch {
      // A dismissed share sheet is not an error and must not fall through to
      // a surprise download.
      return;
    }
  }
  download();
};
```

Keep the daily variant's copy from the banner verbatim. Every button clears the 44pt floor. **No
exclamation marks, no confetti.**

- [ ] **Step 4: Wire it into `App.tsx`**

Replace the `CompletionBanner` render at `src/ui/App.tsx:894-903`. On entering
`summary.status === 'complete'`, compose the card once — guarded by a ref, the same way
`recordedDaily` guards the streak credit at `:690-703`, so a re-render cannot recompose it:

```ts
// Fonts first: `ctx.font` falls back silently if the webfont has not arrived,
// and a card in the wrong typeface is a defect nothing reports.
await document.fonts.ready;
const blob = await composeCard(canvas, meta);
```

Then change `handleDone` (`:531-549`). Today it deletes and nothing else. It becomes: capture the
thumbnail, `saveCompletion(...)`, **then** `deleteLibraryEntry(...)` — in that order, so a crash
between them loses nothing. Keep the existing `await saveInFlight.current` before both; the
race it guards (an autosave overtaking the delete and resurrecting the entry) is unchanged and
still real.

`attribution` comes from `curatedPhotoById(photoId)?.licence.attribution ?? null`.

- [ ] **Step 5: Delete the banner**

```bash
git rm src/ui/CompletionBanner.tsx
```

Check for other importers first: `grep -rn "CompletionBanner" src test`.

- [ ] **Step 6: Run every gate**

```bash
npm test && npm run typecheck && npm run build && npm run test:browser
```
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Step 8: the Puzzle Card replaces 5c's placeholder banner

handleDone now writes the completion before deleting the in-progress entry,
so a crash between them loses nothing."
```

---

### Task 5: The collection wall

**Files:**
- Create: `src/ui/CollectionWall.tsx`
- Modify: `src/ui/App.tsx`, `src/ui/Library.tsx`
- Test: `test/browser/collection-wall.spec.ts`

**Interfaces:**
- Consumes: `listCompletions`, `CompletionRecord` (Task 1); `CompletionCard` (Task 4).
- Produces: `CollectionWallProps { entries, onBack, onOpen }` and `CollectionWall`.
  `App`'s `Screen` union gains `'wall'`.

- [ ] **Step 1: Write the failing browser test**

```ts
import { expect, test } from '@playwright/test';
import { BoardPage } from './board-page';

test('the wall is an invitation when empty, not an apology', async ({ page }) => {
  const board = new BoardPage(page);
  await board.open();
  await page.getByRole('button', { name: 'Collection' }).click();
  await expect(page.getByText(/finished puzzles/i)).toBeVisible();
  // No "you have nothing", no "0 puzzles".
  await expect(page.getByText(/^0 /)).toHaveCount(0);
});

test('a finished puzzle becomes a tile, and the tile reopens its card', async ({ page }) => {
  const board = new BoardPage(page);
  await board.openZenAndComplete();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Collection' }).click();

  const tiles = page.getByRole('button', { name: /Puzzle finished/ });
  await expect(tiles).toHaveCount(1);
  await tiles.first().click();
  await expect(page.getByRole('img', { name: 'Puzzle card' })).toBeVisible();
});

test('the wall survives a reload — it is a possession, not session state', async ({ page }) => {
  const board = new BoardPage(page);
  await board.openZenAndComplete();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Collection' }).click();
  await expect(page.getByRole('button', { name: /Puzzle finished/ })).toHaveCount(1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:browser -- test/browser/collection-wall.spec.ts`
Expected: FAIL — no Collection button.

- [ ] **Step 3: Write the wall**

A CSS-grid mosaic of `thumbnailBlob` tiles, newest first. Each tile is a `<button>` clearing 44pt
with `aria-label={`Puzzle finished ${date}, ${pieceCount} pieces`}` — the accessible name carries
the facts the image cannot. A clean run gets a small marker that is **a glyph and a word, never
colour alone**.

Empty state, per design doc screen 02's treatment and §10's *"copy is an invitation, not an
apology"*: one line pointing at the next puzzle. Do not print a zero.

Tiles read `thumbnailBlob` through `URL.createObjectURL`, **revoked on unmount**. With 30+ tiles a
leak here is real memory, on the device §17 says to profile.

- [ ] **Step 4: Route to it**

Add `'wall'` to `App`'s `Screen` union (`src/ui/App.tsx:163`), load entries with
`listCompletions()`, and add a "Collection" control to `src/ui/Library.tsx`'s header beside the
existing actions. Back returns to the library.

- [ ] **Step 5: Run every gate**

```bash
npm test && npm run typecheck && npm run build && npm run test:browser
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Step 8: the collection wall — §15's strongest retention lever"
```

---

### Task 6: Handoff and plan bookkeeping

**Files:**
- Modify: `PLAN.md`, `CLAUDE.md`, `handoff.md`

- [ ] **Step 1: Tick `PLAN.md`'s Step 8**

All five boxes, each annotated with what actually landed. Note explicitly that the card composes
from the **completed board canvas**, since `PLAN.md` says only *"photo"*.

- [ ] **Step 2: Add the new invariant to `CLAUDE.md`**

```markdown
- **A finished puzzle is written to `completions` before it is deleted from the library**, in that
  order, so a crash between the two loses nothing. The wall reads `completions` and nothing else;
  the library is in-progress puzzles only. If a completed puzzle ever appears in the library, the
  two stores have been conflated.
- **The Puzzle Card composes from the completed board canvas, not the source photo.** §11's "the
  photo, fully lit" is the assembled board, seams and all. Sourcing the card from the original
  prints a stock image instead of what the player made.
```

Add `card.ts`, `CompletionCard`, `CollectionWall`, and `completions.ts` to the layout tree.

- [ ] **Step 3: Write the handoff section**

Follow `handoff.md` §1g's shape: what landed, what was deliberately scoped out, the judgment calls
with no design document behind them (card pixel width, the stat ordering, the wall's tile density),
and the standing real-hardware gate — specifically the serif at real size on a phone, and whether
the wall's tiles read as a mosaic or a list.

- [ ] **Step 4: Commit**

```bash
git add PLAN.md CLAUDE.md handoff.md
git commit -m "Step 8: handoff notes, PLAN ticks, and the two new invariants"
```

---

## Definition of done

- [ ] `npm test`, `npm run typecheck`, `npm run build` clean.
- [ ] `npm run test:browser` green on dock and phone, including the v2→v3 bump test.
- [ ] A finished puzzle appears on the wall and is gone from the library.
- [ ] `grep -rn "CompletionBanner" src test` returns nothing.
- [ ] Share falls back to a download where `navigator.canShare` is absent, and a **dismissed**
      share sheet does not trigger a surprise download.
- [ ] Judged on real hardware: the serif at real size, the card's share sheet on iOS, and the
      wall's tile density on a phone.
