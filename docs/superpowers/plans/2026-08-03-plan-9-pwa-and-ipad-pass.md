# Plan 9 — PWA and the iPad-Grade Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully playable offline after first visit, installable with a real prompt after the second
completion, and hitting the §03 performance budget on the worst device available — ending at the v1
gate: **a 250-piece puzzle at 60fps on iPad Safari, installed as a PWA, surviving a backgrounding.**

**Architecture:** `vite-plugin-pwa` generates a Workbox precache manifest from the build output, so
hashed asset names stay correct without being restated by hand. Everything else is measurement and
targeted fixes against `PLAN.md`'s hard numbers; this plan deliberately contains more profiling
than construction.

**Tech Stack:** TypeScript, Vite 6, `vite-plugin-pwa` (Workbox), Playwright, Safari Web Inspector.

**Depends on:** Plan 0 (curated photos must be real files to be precacheable), Plan 8 (the install
prompt counts completions).

## Global Constraints

- **§03's budget is the target**, and §17's instruction is to profile on **the worst device you can
  find, not the newest**.
- **Piece ceiling 250** at sustained 60fps while dragging a 20-piece island. **Source downscale max
  2560px. Cut budget under 1.2s** in the worker on an iPhone 12.
- **The board never re-renders through React. An idle board draws nothing.**
- **Piece bitmaps are rasterised once** at `min(dpr, 2)` and never re-rasterised while zooming.
- **No `localStorage` for session state — IndexedDB only.**
- **Touch target floor 44pt. Colour is never the only signal.**
- **`npm run test:browser` is a gate, not an optional extra.**
- Commands: `npm test` · `npm run typecheck` · `npm run build` · `npm run test:browser`

---

### Task 1: The service worker and manifest

**Files:**
- Modify: `vite.config.ts`, `package.json`, `index.html`
- Create: `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/maskable-512.png`
- Test: `test/browser/pwa.spec.ts`

**Interfaces:**
- Consumes: the build output.
- Produces: a registered service worker and a web app manifest. Task 2 consumes the installed
  state; Task 3 consumes the precache.

**Why a dependency here** when `dcdd29e7` hand-rolled the IndexedDB wrapper to avoid one: a
precache manifest must name **every hashed asset filename**, and a stale list serves a broken app
offline with no error anywhere. Workbox derives that list from the build. The IndexedDB wrapper was
~50 lines with no coupling to the bundler; this is not the same trade. Record this reasoning in the
commit message — a future reader will otherwise read it as inconsistency.

- [ ] **Step 1: Write the failing browser test**

```ts
import { expect, test } from '@playwright/test';

test('the app registers a service worker and ships a manifest', async ({ page }) => {
  await page.goto('/');
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
      timeout: 15_000,
    })
    .toBe(true);

  const manifest = await page.evaluate(async () => {
    const href = document.querySelector<HTMLLinkElement>('link[rel=manifest]')?.href;
    return href ? await (await fetch(href)).json() : null;
  });

  expect(manifest).not.toBeNull();
  expect(manifest.name).toBe('Tessera');
  expect(manifest.display).toBe('standalone');
  // §13's --mat-void. An installed app whose splash is white flashes on launch.
  expect(manifest.background_color).toBe('#0B0D10');
  expect(manifest.theme_color).toBe('#0B0D10');
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
});
```

This spec only passes against a built app, not the dev server. Add a **`pwa` Playwright project**
that runs `vite build && vite preview` as its `webServer`, and keep it out of the existing dock and
phone projects — a service worker in the dev server would cache stale modules and make every other
spec flaky.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:browser -- --project=pwa`
Expected: FAIL — no controller, no manifest link.

- [ ] **Step 3: Install and configure the plugin**

```bash
npm install -D vite-plugin-pwa
```

In `vite.config.ts`, add to `plugins`:

```ts
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Tessera',
        short_name: 'Tessera',
        description: 'A photo jigsaw where progress is literally light.',
        display: 'standalone',
        orientation: 'any',
        // §13's --mat-void, so the launch splash never flashes white.
        background_color: '#0B0D10',
        theme_color: '#0B0D10',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // §09: "fully playable offline after first visit" — the shell, the
        // audio bank, and the curated photos. The photos are only precacheable
        // at all because plan 0 made them real files.
        globPatterns: ['**/*.{js,css,html,woff2,png,jpg}'],
        // A 250-piece board's assets plus ~30 photos exceed the 2MB default.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
```

**The webfonts are currently loaded from `fonts.googleapis.com`** (`index.html`). A cross-origin
stylesheet is not precacheable, so an offline launch would fall back to system fonts — and the
Puzzle Card's Instrument Serif is the one place §13 says the serif earns its keep. **Self-host the
three families** into `public/fonts/` and replace the two `<link>` tags. This also removes two
`preconnect`s from the critical path.

- [ ] **Step 4: Run the test**

Run: `npm run test:browser -- --project=pwa`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Step 9: service worker, web app manifest, and self-hosted fonts

vite-plugin-pwa is the one place the no-new-dependency posture is set aside.
A precache manifest must name every hashed filename, and a stale list serves
a broken app offline with no error anywhere; Workbox derives it from the
build. The hand-rolled IndexedDB wrapper had no such coupling to the bundler."
```

---

### Task 2: Offline, and the install prompt

**Files:**
- Create: `src/ui/InstallPrompt.tsx`
- Modify: `src/ui/App.tsx`
- Test: `test/browser/pwa.spec.ts`

**Interfaces:**
- Consumes: `completionCount()` from Plan 8 Task 1.
- Produces: `InstallPromptProps { platform: 'prompt' | 'ios-manual'; onInstall, onDismiss }`.

- [ ] **Step 1: Write the failing tests**

```ts
test('the app is playable offline after the first visit', async ({ page, context }) => {
  await page.goto('/');
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
      timeout: 15_000,
    })
    .toBe(true);

  await context.setOffline(true);
  await page.reload();

  // Not an error page, not a blank frame: the real app.
  await expect(page.locator('#root')).not.toBeEmpty();
  await expect(page.getByRole('button', { name: /photo|puzzle|Skip/i }).first()).toBeVisible();

  await context.setOffline(false);
});

test('the install prompt waits for the second completion', async ({ page }) => {
  const board = new BoardPage(page);
  await board.openFresh();
  await board.completeZenPuzzle();
  await expect(page.getByRole('button', { name: /Add to home screen/i })).toHaveCount(0);

  await board.completeZenPuzzle();
  await expect(page.getByRole('button', { name: /Add to home screen/i })).toBeVisible();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test:browser -- --project=pwa`
Expected: FAIL on both.

- [ ] **Step 3: Build the prompt**

§17: *"make 'add to home screen' a real prompt after the second completion — installed PWAs are
evicted far less aggressively."* Two platforms, two mechanisms:

```ts
// Chromium fires this; capture it and defer.
let deferred: BeforeInstallPromptEvent | null = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferred = event as BeforeInstallPromptEvent;
});
```

**iOS Safari fires no `beforeinstallprompt` at all** — the primary target platform for this entire
product has no programmatic install prompt. Detect standalone-capable iOS
(`'standalone' in navigator && !navigator.standalone`) and show an instructional sheet naming the
Share → Add to Home Screen path instead. This is not a fallback; on iPad it is the only mechanism
that exists.

Also request durable storage, which is the actual goal behind the prompt:

```ts
// §17 names iOS Safari eviction as a standing risk: "a player who loses a
// 250-piece board in progress will not return."
if (navigator.storage?.persist) void navigator.storage.persist();
```

Gate on `completionCount() >= 2`, dismissible, and **never shown again once dismissed** — store a
flag beside `firstRunDone` in the `daily` store.

- [ ] **Step 4: The 7-day idle warning**

§17: *"warn at 7 days idle."* On mount, if there is an in-progress library entry whose snapshot is
older than 7 days, show a single quiet line on the library offering to open it. **Not a modal, not
a scold** — the same register as the streak flame, which `PLAN.md` says never scolds.

- [ ] **Step 5: Run every gate and commit**

```bash
npm test && npm run typecheck && npm run build && npm run test:browser
git add -A
git commit -m "Step 9: offline play, the install prompt after the second completion, and persist()"
```

---

### Task 3: The performance and memory pass

**Files:**
- Modify: `src/play/runtime.ts`, `src/cut/cut-client.ts` (as measurement directs)
- Test: `test/browser/invariants.spec.ts`

**This task is measurement first.** Do not change code before a profile says what to change; a
speculative optimisation against a budget that is already met is how the idle-board invariant gets
broken for nothing.

**Interfaces:**
- Consumes: nothing new.
- Produces: no new exports. Behavioural only.

- [ ] **Step 1: Release the decoded source after cutting**

`PLAN.md` names this explicitly. `PlayRuntime.copySource` (`src/play/runtime.ts:236-249`) keeps a
duplicate for the ghost underlay, and the original is transferred to the worker and detached. Audit
what still holds a full 2560px bitmap once `build()` has run, and `close()` anything that does not
need to survive. **Assists can turn the ghost underlay on mid-puzzle from the pause sheet (5c), so
the ghost copy must stay** — this is a real constraint, not an oversight; confirm before freeing it.

- [ ] **Step 2: Profile a 250-piece session**

On the **worst device available**. Record, against `PLAN.md`'s hard numbers:

| Measure | Budget |
|---|---|
| Cut time in the worker | under 1.2s |
| Sustained fps dragging a 20-piece island | 60 |
| Peak memory, 250 pieces | note it; compare to a 50-piece session |
| Idle frames drawn | **zero** |

Write the numbers into `handoff.md`. A profile not written down was not taken.

- [ ] **Step 3: Assert the idle invariant still holds under a service worker**

`test/browser/invariants.spec.ts` already asserts *"an idle board draws nothing"* against the
harness's `scheduled` readout, and counts DOM mutations inside the tray during a camera gesture and
a 60-frame drag. **Add both to the `pwa` project**, because a service worker changes load order and
an `autoUpdate` registration can trigger a reload nothing else would.

- [ ] **Step 4: Fix only what the profile flagged**, and re-measure after each change.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Step 9: memory and performance pass against the §03 budget"
```

---

### Task 4: Split View and Stage Manager

**Files:**
- Modify: `src/input/board-controls.ts`
- Test: judged by hand on an iPad. No Playwright coverage — Chromium has no Split View.

**Interfaces:**
- Consumes: `PointerMachine` from `src/input/pointer.ts`.
- Produces: no new exports.

`PLAN.md`: *"Stage Manager works, but Split View gestures can steal a drag near screen edges."*
The failure is a `pointercancel` mid-drag when the system claims the gesture — and with no
handling, the piece is left held forever, or dropped somewhere the player did not choose.

- [ ] **Step 1: Handle `pointercancel` as a release, not a loss**

In `src/input/board-controls.ts`, treat `pointercancel` exactly as `pointerup` **at the last known
position**. `CLAUDE.md`: *"There is no lose state anywhere in this app, and no bounce-back on a
failed drop. A dropped cluster stays exactly where it was dropped."* A cancelled drag is a drop, at
the last place the player actually had it.

- [ ] **Step 2: Verify on hardware**

On an iPad in Split View, drag a piece from the tray toward the screen edge until the system
gesture fires. The piece must land where it was, the board must remain interactive, and no piece
may remain visually lifted.

- [ ] **Step 3: Commit**

```bash
git add src/input/board-controls.ts
git commit -m "Step 9: a Split View gesture that steals a drag drops the piece, never loses it"
```

---

### Task 5: The v1 gate and bookkeeping

**Files:** `PLAN.md`, `CLAUDE.md`, `handoff.md`

- [ ] **Step 1: Run the gate**

**A 250-piece puzzle at 60fps on iPad Safari, installed as a PWA, surviving a backgrounding.**

Concretely: install to the home screen, start a 250-piece puzzle from a real curated photo, place
pieces until the board is meaningfully assembled, background the app for several minutes, reopen.
The board must return exactly as left, and §05's *"coming back always lands on the board, never on
a modal apologising"* must hold.

- [ ] **Step 2: Tick `PLAN.md`'s Step 9** and record the gate result — including a failure, if that
      is what happened. A gate reported as passed without being run is worse than no gate.

- [ ] **Step 3: `CLAUDE.md`**

Add the PWA to the layout notes and one invariant:

```markdown
- **The precache manifest is generated, never hand-written.** Workbox derives it from the build
  output; a hand-maintained list goes stale silently and serves a broken app offline with no error
  anywhere. This is the one dependency the no-new-dependency posture yields to, and the reason is
  the coupling to hashed filenames.
- **A `pointercancel` is a drop, not a loss.** Split View and Stage Manager steal gestures near
  screen edges. There is no lose state anywhere in this app.
```

- [ ] **Step 4: The final handoff section** — the profile numbers from Task 3, the gate result, and
      what remains open for v1.1: the ~30 → 50 photo gap, the leaderboard the day accounts exist,
      cut styles and Fog, and album mode.

- [ ] **Step 5: Commit**

```bash
git add PLAN.md CLAUDE.md handoff.md
git commit -m "Step 9: the v1 gate, profile numbers, and the final handoff"
```

---

## Definition of done

- [ ] `npm test`, `npm run typecheck`, `npm run build` clean.
- [ ] `npm run test:browser` green on dock, phone, **and the new pwa project**.
- [ ] A reload with the network off serves the real app, not an error page.
- [ ] The install prompt appears after the second completion and not before; iOS gets the
      instructional sheet.
- [ ] `navigator.storage.persist()` is requested.
- [ ] The idle-board and no-React-rerender invariants still hold with a service worker registered.
- [ ] Profile numbers for a 250-piece session are written into `handoff.md`.
- [ ] **The v1 gate has actually been run on an iPad**, and its result — pass or fail — is recorded.
