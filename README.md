# Tessera

A photo jigsaw where progress is literally light.

Give it any photo and it becomes a real jigsaw with real weight: pieces you pick up, drag, and snap
into place. The board starts as a dark, unlit mat holding scattered fragments; as you assemble, the
completed area emits light onto the mat around it. Progress is illumination — which means one
renderer feature serves the progress bloom, the hint glow, the merge seam, and the completion
payoff.

Web-first, built for iPad and iPhone touch from day one.

## Status

**Step 3a of 9 — the tray and its lenses.** There is a product now: a board with a tray beside it,
docked on a tablet and a three-detent sheet on a phone. Pieces start in the tray, you drag them out
onto the mat, and they snap with the step-2 spring and audio intact.

Step 2 is still not *finished* until it has been tuned by hand on an iPad, which the design doc
budgets a week for and treats as a real gate: **the snap must feel complete with the device on
silent and no vibration.** The code is in place and the dials are on screen — on the setup screen
and in the pause sheet, since step 5c retired the harness — but the judging has not happened yet.

- [x] **Step 1** — the cut (grid, jittered lattice, interlocking edges, baked bevel, adjacency
      graph) in a worker, and the Canvas 2D layer stack behind `draw(scene, camera)`
- [x] **Step 2** — clusters and union-find, snap resolution over graph neighbours, the release
      spring, the pointer machine, and the three-layer snap audio *(tuning still owed)*
- [ ] **Step 3** — tray and lenses
      - [x] **3a** — the React chrome, the tray, all six lenses, OKLab colour bins, drag-out,
            both form factors, virtualised chips
      - [ ] **3b** — pinned shelf, multi-select, pull out as island
- [ ] **Step 4** — hints and light
- [ ] **Step 5** — setup, library, resume
- [ ] **Step 6** — daily and streak
- [ ] **Step 7** — first run, the guided twelve
- [ ] **Step 8** — completion payoff
- [ ] **Step 9** — PWA and the iPad-grade pass

The full schedule lives in `PLAN.md`, which is kept outside the repo — see below.

## Running it

```bash
npm install
npm run dev
```

The dev server is host-exposed, so the printed network URL works from an iPad or iPhone on the same
network. Real-hardware testing is a gate at every step.

One page, `/` — the product: board and tray.

The curated photos cut a synthetic validation target — numbered cells, a hue sweep across x, a value sweep down y,
and a 1px hairline grid — chosen because a photo hides exactly the bugs these steps can produce. A
misplaced piece or a misaligned tab is obvious against it and invisible against foliage. The hue and
value sweeps also give the Colour lens something real to bin. The real photo picker arrives at
step 5.

**Playing it.** Pieces live in the tray; drag one out onto the board. One finger on a piece drags
it, one finger on the mat or on the placed board pans, and two fingers always mean camera. There is
no tap-to-select — direct manipulation only. A piece dropped anywhere stays exactly where you
dropped it; drop one back over the tray and it goes home.

**The lenses.** All, Edges, Corners, Colour, Region, Recent. They *hide and reveal* within one
canonical order — they never re-sort it, so turning a filter off leaves every remaining piece
exactly where you left it. Region unlocks past 1.5× zoom and shows the pieces belonging in what you
are looking at. Recent finds the ones you pulled out and did not place.

**The dials.** Snap tolerance (Precise / Standard / Generous), rotation, reduced motion, and the
four assists are set on the setup screen before the cut, and tolerance plus the assists can be
changed mid-session from the pause sheet. Step 5c deleted `dev.html` and the step-2 harness that
used to carry them.

```bash
npm test             # 319 unit tests, node environment
npm run test:browser # 29 Playwright checks, dock and phone viewports
npm run typecheck
npm run build
```

`npm run test:browser` boots the dev server itself and drives the real app. It is a gate at the end
of every step, not an optional extra: a green unit suite says nothing about whether the app boots,
and the two invariants that matter most here — **the board never re-renders through React**, and
**an idle board draws nothing at all** — are only observable in a browser. Both are measured rather
than asserted.

## Design documents

The design brief, the UI/UX specification, and the build plan are the source of truth for this
project, but they are **not in the repo** — they live on the working machine under `docs/` and
`PLAN.md`, both gitignored, and are updated in place as steps land.

[`CLAUDE.md`](CLAUDE.md) is the in-repo summary: the invariants, the three coordinate spaces, and
the hard numbers everything is measured against. It is enough to work in this codebase without the
source documents; it is not a replacement for them when making design decisions.

## Stack

Canvas 2D on a five-layer stack with a DOM chrome shell, per design doc §03 — not WebGL, not DOM
pieces. At the locked 250-piece ceiling there is nothing WebGL buys over a per-frame `drawImage`
loop across pre-rendered bitmaps, and it costs shader authoring, iOS context-loss handling, and
making text your problem. The renderer sits behind a thin `draw(scene, camera)` interface so a
WebGL backend can slot in the day 1000-piece boards ship.

React 19 + Tailwind v4 + Zustand carry the chrome, arriving at step 3 with the tray. **The board
never re-renders through React**: piece positions update at 60fps outside it, and React reads only
summary state that changes at human speed. Everything with a decision in it — the lens filter, the
colour binning, the pointer machines — is DOM-free and unit-tested; the files that touch the DOM,
React, or Web Audio stay thin enough to judge by hand, which is the only way snap feel can be judged
anyway.
