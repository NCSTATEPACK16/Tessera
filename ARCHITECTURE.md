# Architecture

The contributor-facing map of Tessera's three subsystems. **The invariants, coordinate spaces, and
hard numbers themselves live in [`CLAUDE.md`](CLAUDE.md) — this file links to those sections rather
than restating them**, because a second copy of a rule is a second place for it to go stale. Read
`CLAUDE.md` first if you're about to touch code; read this file first if you're trying to figure out
*where* to touch it.

## The three subsystems

### 1. The engine — cut, board, render

A photo becomes a jigsaw through a deterministic pipeline that never stores geometry or piece
images: `src/cut/` cuts a seeded lattice into interlocking pieces (in a worker — see
[Hard numbers](CLAUDE.md#hard-numbers) for the cut budget), `src/board/` tracks which pieces have
merged into which cluster via union-find, and `src/render/` draws the current state of that model
onto a five-layer Canvas 2D stack.

**The board never re-renders through React.** This is the load-bearing invariant of the whole
engine — see [CLAUDE.md § Invariants](CLAUDE.md#invariants) for the full list and why each one
exists. `src/render/renderer.ts`'s `draw(scene, camera)` is the entire rendering surface; nothing
else touches the canvas.

Three coordinate spaces run through this subsystem (`image` → `world` → `screen`) and conflating
them is where snap bugs come from — see
[CLAUDE.md § Coordinate spaces](CLAUDE.md#coordinate-spaces).

### 2. The chrome — React, the tray, input

`src/ui/` is React 19 + Tailwind + Zustand, and it owns everything the engine doesn't: the tray and
its lenses (`src/tray/`), pointer and drag handling (`src/input/`), and the screens a player moves
through (picker, crop, setup, library, pause, completion). `src/play/session.ts` and
`src/play/runtime.ts` are the seam between the two subsystems — the model the engine updates at
60fps, and the host that mounts it and feeds React only the derived summary state (progress %,
combo, hints left, timer) it's allowed to read.

**Everything with a decision in it is DOM-free and unit-tested; the files that touch the DOM,
React, or Web Audio are thin enough to judge by hand.** `vitest` runs in a node environment, so
DOM-free is the same word as tested — see the *Testing posture* section of `CLAUDE.md`.

### 3. Persistence and content

`src/persist/` is IndexedDB only — **no `localStorage` for session state**, see
[CLAUDE.md § Invariants](CLAUDE.md#invariants). `src/daily/` derives the daily puzzle as a closed-form
function of the date rather than a pre-seeded table, so it needs no daily-specific save path: the
daily is an ordinary puzzle with a deterministic id. `assets/curated/` plus
`src/play/curated-manifest.ts` (generated — see `npm run curated:manifest`) are the curated photo
library; their licence is **not** the code's — see [`ASSETS-LICENSE.md`](ASSETS-LICENSE.md).

## Where to start reading

| If you're working on... | Start here |
|---|---|
| The cut, piece geometry, tabs/sockets | `src/cut/cutter.ts`, then `test/cut/interlock.test.ts` |
| Snap, clusters, the union-find | `src/board/board.ts`, `src/board/snap.ts` |
| Drag feel, the release spring | `src/board/settle.ts`, `src/input/pointer.ts` |
| The tray, lenses, filtering | `src/tray/lenses.ts`, `test/tray/lenses.test.ts` |
| Any screen (picker, setup, pause, completion) | the matching file directly under `src/ui/` |
| Save/resume, the library, the daily | `src/persist/`, `src/daily/` |
| Accessibility (Comfort mode, contrast, touch targets) | `src/play/setup.ts`'s `PuzzleAssists`, `src/render/accent.ts` |

## Testing

Two suites, and they never collect each other's files: `vitest` owns `*.test.ts` (pure functions,
node environment), `@playwright/test` owns `*.spec.ts` (the app, in a real browser, dock and phone
viewports). `npm run test:browser` is a gate, not an optional extra — see `CLAUDE.md`'s *Testing
posture* section for the two invariants that are only observable in a browser, and for the two real
defects that suite has already caught that code review missed. `CONTRIBUTING.md` has the setup and
commands.

## Full layout

`CLAUDE.md`'s own `## Layout` section is the complete, current directory tree with a one-line
description of every module — not duplicated here.
