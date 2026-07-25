# Tessera — working notes

A photo jigsaw where progress is literally light. Web-first → PWA → native iOS/iPadOS.

## Source of truth, in order

1. **`docs/Tessera Design Doc.dc.html`** — the locked UI/UX spec. Engine, state model, cut
   geometry, tray behaviour, light system, motion, tokens, persistence. **This wins every
   disagreement.**
2. **`docs/DESIGN_BRIEF_Tessera.md`** — product intent, voice, visual thesis, modes.
3. **`PLAN.md`** — the build schedule, reconciled to the design doc. Backend shape, native path,
   privacy, licensing.

The design doc is a rendered document; its tables live in the `<script type="text/x-dc">` block as
plain data, not in the prose.

## Invariants

Break any of these and something downstream breaks in a way that looks like a different bug.

- **The board never re-renders through React.** Piece positions update at 60fps. React reads only
  derived summary state — progress %, combo, hints left, timer.
- **Snap resolution asks a graph neighbour, never an absolute board position.** This is what makes
  free-floating islands work identically to placing on the board frame, with no special-case code.
- **Every piece placement goes through the union-find.** Merging with cluster 0 is what "placed"
  means; completion is `cluster0.pieceIds.length === N` and nothing else.
- **Snap tolerance is always world-space**, so zoom never changes difficulty.
- **The cut is deterministic from a seed.** Never store geometry or piece images — a snapshot is
  ~6 KB because it stores neither.
- **Per-concern PRNG streams**, derived from `(seed, kind, id)` via `rngFor`. Never a shared
  stream: it would make values depend on iteration order, and interlock depends on two different
  pieces drawing the same edge.
- **Cutting happens in a worker.** The main thread never blocks.
- **Piece bitmaps are rasterised once** at `min(dpr, 2)` and never re-rasterised while zooming.
- **Tray filters are lenses, never sorts.** The canonical order never reflows.
- **No `localStorage` for session state** — IndexedDB only.
- **No feedback may depend on a channel the web build lacks.** Haptics are an amplifier, never the
  carrier. The snap must feel complete on a silent device with no vibration.
- **Colour is never the only signal.** Edge pieces get a corner notch glyph; colour bins get a
  numeral alongside the swatch.
- **There is no lose state anywhere in this app**, and no bounce-back on a failed drop. A dropped
  cluster stays exactly where it was dropped.

## Coordinate spaces

Named, because conflating them is where snap bugs come from.

| Space | Unit | Who knows about it |
|---|---|---|
| `image` | source px, post-EXIF, post-downscale to 2560 | the cutter, and nothing else |
| `world` | 1 = one piece width, origin at board top-left | piece positions, clusters, snap tolerance |
| `screen` | CSS px after the camera | the renderer and the hit-test entry point |

`Camera` in `src/render/camera.ts` is the only world↔screen mapping. Nothing else converts.

## Layout

```
src/
  core/     rng.ts geom.ts            seeded streams, path maths
  cut/      grid lattice edge edges   the cut, §04 step by step
            piece-path raster graph
            cutter.ts                 orchestrator, thread-agnostic
            cutter.worker.ts          transport shell only
            cut-client.ts             main-thread front door
  render/   renderer.ts               draw(scene, camera) — the whole surface
            frame-scheduler.ts        invalidation; "idle draws nothing"
            camera.ts camera-controls.ts scene.ts mat.ts
  dev/      harness.ts                step 1-2 only, deleted at step 5
test/                                 mirrors src/
docs/                                 the two design documents
```

All cutting logic lives in `cutter.ts`, not the worker, so it stays testable off-thread.

## Hard numbers

Do not drift from these without changing the design doc first.

| | |
|---|---|
| Piece ceiling | 250, genuinely playable on an iPhone 12 at sustained 60fps while dragging a 20-piece island |
| Source downscale | max 2560px long edge |
| Cut budget | under 1.2s in the worker on an iPhone 12 |
| Piece aspect | 0.82–1.22, hard reject outside |
| Lattice jitter | ±0.12 × piece size, interior vertices only |
| Tab geometry | knob at t ≈ 0.5 ± 0.06, neck 0.20, head radius 0.14, protrusion 0.22 × edge length ± 10% |
| Snap tolerance | 0.18 / 0.28 / 0.40 × piece size (Precise / Standard / Generous), 12° in Rotation |
| Snap spring | stiffness 520, damping 26, mass 1, integrated from release velocity |
| Lift | scale 1.06, 8pt above the finger, never under it |
| Zoom | 0.5× to 4×, rubber-banded; region lens unlocks above 1.5× |
| Bloom / hint / X-Ray | 0.90 max / 0.55 peak / 0.35 dim |
| Save | IndexedDB, debounced 800ms + synchronous write on `visibilitychange` |
| Touch target | 44pt floor, everywhere |

## Commands

```
npm run dev        # dev harness, host-exposed for real-device testing
npm test           # vitest
npm run typecheck
npm run build
```

## Testing posture

The cut is deterministic, so it is genuinely testable and the tests are worth trusting: same seed →
identical geometry, tabs exactly reverse their sockets, piece aspect in band, graph symmetric,
border unjittered. `test/cut/interlock.test.ts` is the load-bearing one.

Snap *feel* is not testable. It is judged by hand on an iPad, and that is a real gate, not a
formality — §17 budgets a week on it and says to spend it.

Test on real hardware every step. The iPad Safari behaviours in the plan are not reproducible in
Chrome devtools.
