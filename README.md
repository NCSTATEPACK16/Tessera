# Tessera

A photo jigsaw where progress is literally light.

Give it any photo and it becomes a real jigsaw with real weight: pieces you pick up, drag, and snap
into place. The board starts as a dark, unlit mat holding scattered fragments; as you assemble, the
completed area emits light onto the mat around it. Progress is illumination — which means one
renderer feature serves the progress bloom, the hint glow, the merge seam, and the completion
payoff.

Web-first, built for iPad and iPhone touch from day one.

## Status

**Step 1 of 9 — the cutter and the renderer.** Hardcoded photo, no UI, per the build order in the
design doc §17.

- [x] **Step 1** — the cut (grid, jittered lattice, interlocking edges, baked bevel, adjacency
      graph) in a worker, and the Canvas 2D layer stack behind `draw(scene, camera)`
- [ ] **Step 2** — drag, snap, spring, audio *(and stop there and tune it)*
- [ ] **Step 3** — tray and lenses
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

The step 1 harness cuts a synthetic validation target — numbered cells, a hue sweep across x, a
value sweep down y, and a 1px hairline grid — chosen because a photo hides exactly the bugs this
step can produce. A misplaced piece or a misaligned tab is obvious against it and invisible against
foliage.

Controls: drag to pan, pinch or scroll to zoom, double-tap to fit. **Solve** drops every piece into
its slot so the seams can be inspected; **Re-cut** reseeds.

The HUD reports the real grid, the cut time against the 1.2s budget, and whether the renderer
currently has a frame scheduled — an idle board must read `scheduled: no`.

```bash
npm test          # 85 tests
npm run typecheck
npm run build
```

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

React 19 + Tailwind v4 + Zustand arrive at step 3, when the tray needs real chrome. Steps 1 and 2
have no UI by design.
