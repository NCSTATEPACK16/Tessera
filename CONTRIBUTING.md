# Contributing to Tessera

Thanks for looking at this. Tessera's accessibility mission — a puzzle a grandparent with motor
tremor and an iPad can actually finish — is the reason this project is worth contributing to, and
it's a real constraint on every PR, not a section at the bottom of this file. See
[`README.md`](README.md) for what the project is, and [`ARCHITECTURE.md`](ARCHITECTURE.md) for
where things live before you start.

## Setup

```bash
npm install
npx playwright install --with-deps chromium   # once, for the browser suite
npm run dev
```

`npm run dev` is host-exposed (`vite.config.ts`'s `server.host: true`) — the printed network URL
works from an iPad or iPhone on the same network, which matters far more here than in most
projects; see *Real hardware*, below.

## Before opening a PR

```bash
npm test             # vitest — pure functions, node environment
npm run typecheck
npm run build
npm run test:browser # Playwright — the app, in a real browser, dock and phone viewports
```

All four are the CI gate (`.github/workflows/ci.yml`) and all four must be green. `npm run
test:browser` is not an optional extra: a passing `npm test` is several hundred assertions about
pure functions, and it stays green while the app fails to boot. Two of this project's most
important invariants — **the board never re-renders through React**, and **an idle board draws
nothing at all** — are only observable in a browser, and are measured in that suite rather than
merely asserted.

## The two-suite posture

`vitest` owns `*.test.ts`. `@playwright/test` owns `*.spec.ts`. Neither ever collects the other's
files — if you add a test, put it under `test/` in the matching shape (mirrors `src/`) with the
right extension, not the other way around.

**"DOM-free is the same word as tested" here.** `vitest` runs in a node environment with no DOM, so
any file with a real decision in it — a piece of geometry, a filter, a state transition, an
economy — belongs on the DOM-free side of the line and gets a `vitest` suite. Files that must touch
the DOM, React, or Web Audio (`board-controls.ts`, everything under `src/ui/`, `engine.ts`) are kept
thin enough to be judged by hand, and covered by the browser suite instead. If you find yourself
writing non-trivial logic inside a React component or an event handler, that's usually a sign it
belongs in a plain, DOM-free module one level down — check `src/board/`, `src/play/`, or `src/tray/`
for the existing shape before inventing a new one.

## Accessibility acceptance criteria — first-class rules, not folklore

These are not suggestions. A PR that violates one of these is not accessibility "polish to add
later" — it's a defect, on the same footing as a snap bug:

- **44pt (px, at 1x) is the touch-target floor, everywhere**, no exceptions for a control that
  "looks small enough to be fine."
- **Colour is never the only signal.** If you add a new piece of state a player needs to
  distinguish (a filter, a status, a selection), it needs a second channel — a glyph, a numeral, a
  shape — not just a colour change. See `CLAUDE.md`'s invariant list for the existing examples
  (edge-piece corner notch, colour-bin numerals).
- **`touch-action` and `overscroll-behavior` are deliberate, not defaults.** If you add a
  draggable or scrollable surface, check what the nearest existing one does
  (`src/render/renderer.ts`, `Tray.tsx`, `Sheet.tsx`) before copying a browser default that will
  fight it.
- **No feedback may depend on a channel the web build lacks.** Haptics are an amplifier, never the
  carrier — a snap must feel complete on a silent device with no vibration.
- **There is no lose state, and no bounce-back on a failed drop.** A dropped cluster stays exactly
  where it was dropped. Don't add punishment logic anywhere in the drop path.
- **`env(safe-area-inset-*)` and `viewport-fit=cover`** are already wired at the root
  (`index.html`); any new full-bleed surface needs to respect the existing inset pattern, not
  reinvent it.

If a change touches motor-accessibility-sensitive code (drag thresholds, snap tolerance, touch
targets, tremor-adjacent input handling), say so explicitly in the PR description — see the
`accessibility` issue template for the fields a report like that needs.

## Real hardware

Chromium on a desk is not iPad Safari, and several of the behaviours in this codebase are not
reproducible in devtools — snap *feel* most of all. If your change touches drag, snap, input, or
anything under `src/render/`, test it on an actual iPad or iPhone over the LAN dev server before
opening the PR, and say in the PR description what you tested and on what device. CI cannot gate
this; reviewers will ask if the description doesn't say.

## Code review expectations

- Match the existing file's shape before introducing a new one — check `ARCHITECTURE.md`'s
  "where to start" table.
- A bug fix doesn't need surrounding cleanup, and a one-shot operation doesn't need a new
  abstraction. Small, scoped PRs review faster and are far easier to bisect later.
- `src/cut/`, `src/board/`, and `assets/curated/` (plus its manifest) require maintainer review —
  see `.github/CODEOWNERS`. That's not a trust judgment about you; it's because bugs in the cut or
  the union-find are the kind that corrupt saved puzzles silently.

## Good first issues

Issues labelled `good first issue` are real, scoped gaps recorded during development — not busywork
invented for new contributors. `help wanted` marks anything larger that's open for the taking. Both
labels are on the issue tracker; if nothing's labelled when you look, ask in a new issue and a
maintainer will help you find something sized right.
