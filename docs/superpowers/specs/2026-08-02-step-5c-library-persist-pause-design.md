# Step 5c — Library, save/resume, pause sheet, again-harder

**Written:** 2026-08-02
**Status:** design, approved by project owner section-by-section, not yet implemented
**Branch context:** built on top of `step-5b-puzzle-setup` (5a photo picker/crop, 5b puzzle
setup screen), which is pushed but not yet merged (PR blocked on PAT permissions, see
`handoff.md` §1f.3).

## Scope

Closes out everything `PLAN.md`'s Step 5 checklist still has open, per `handoff.md` §1f.2:

- Library screen (in-progress cards, live board thumbnails, % ring, empty state)
- Pause sheet (resume, reference image, restart confirm, settings, leave)
- `SessionSnapshot` save/resume (`PLAN.md` §14 / design doc's "Save format" section):
  IndexedDB, 800ms debounce + synchronous `visibilitychange` write
- "Puzzle this again, harder"

Plus two loose ends `handoff.md` flagged as unowned by any Step 5 sub-step, explicitly folded
in by decision at the start of this brainstorm:

- `dev.html` / the step-2 harness deletion (`CLAUDE.md`: "It goes at step 5")
- EXIF orientation + HEIC upload handling (open since Step 1's checklist)

**Explicitly out of scope**, staying where they already are: the full Puzzle Card / bloom
sequence / collection wall (Step 8), the Daily hub and streak (Step 6), Supabase sync (any
of it — this pass is IndexedDB-only, "play stays account-free forever" holds).

**Delivery shape:** one continuous implementation session, landing as sections/commits rather
than separate sub-step branches like 5a/5b — the project owner decided this explicitly rather
than spinning up 5c/5d/5e.

---

## Architecture

### The `pieces[]` ambiguity, resolved

The design doc's save format (identical text in both `PLAN.md` and the source-of-truth HTML —
checked directly, not just its `PLAN.md` mirror) specifies:

```
pieces: Float32Array [x, y, rot, clusterId] × N,   // packed, base64
clusters: [{ id, kind, label, x, y, rot, collapsed }],
```

This doesn't resolve cleanly against `Board`'s actual model, where a piece owns only
`localX`/`localY` (its offset inside its cluster's own frame) and has **no independent
rotation at all** — only clusters rotate (`Cluster.rot`), and `cluster.rot` is already
carried in the `clusters[]` array. The doc never says which "x, y, rot" a piece's slot means:
world position, local offset, or something else, and never explains why a piece would need its
own `rot` when the model has none. This is the same kind of doc/model gap step 4b hit for hint
tiers — decided here rather than guessed silently:

**Decision:** `pieces[i] = [localX, localY, 0, clusterId]`. The third slot is always `0` and
carries no meaning today — reserved only so the array's shape literally matches the documented
format, in case a future feature (none currently planned) gives a piece independent rotation.
`localX`/`localY` are `Board`'s own fields, copied verbatim. `clusters[]` remains the sole
source of truth for position, rotation, kind, label, and collapsed state — exactly
`Board.Cluster` serialized.

### Restore: a second entry point into `Board`, not new merge logic

`Board`'s constructor always builds one cluster per piece — correct for a fresh cut, wrong for
resuming a game in progress. Restore needs a way to seed `Board`'s internal maps directly from
saved state instead.

**New factory: `Board.restore(input: readonly BoardInput[], snapshot: BoardSnapshot): Board`**
where `BoardInput` is the same deterministic-cut output `createBoard` already takes (so
`targetX`/`targetY`/`neighbours` are identical to a fresh cut of the same seed), and
`BoardSnapshot` carries the saved `clusters[]` and per-piece `[localX, localY, clusterId]`
triples. It writes `this.clusters` and each piece's `clusterId`/`localX`/`localY` directly,
skipping the constructor's default "every piece is its own cluster" initialization. Union-find,
`merge()`, `resolveSnap`, `candidateSockets` — nothing about them changes; they only ever read
`this.clusters`/`piece.clusterId`, and don't care how that state was populated.

### What needs new public surface (none of this exists today)

Captured in one place because it's the actual size of the plumbing work, spread across files
that currently have no reason to expose any of it:

| Field | Currently | Change needed |
|---|---|---|
| Camera (`x, y, zoom`) | Private field on `PlayRuntime` | New getter |
| `WorksetStore.all()` | Already `{id, label, pieceIds, collapsed}` | None — matches the format's `worksets` addendum from 3b exactly |
| Tray `order`/`pinned` | Live in the tray model already | Read-only accessor needed |
| Tray `scroll` | **Lives nowhere as data** — raw DOM `scrollTop` in the sheet/grid | New tracked field, written on scroll, read at save time |
| `lens`/`lensArg` | Zustand-only (`src/ui/store.ts`), UI-side state | Threaded into the snapshot call from `App.tsx`, since `PlayRuntime` itself has no reason to know about lenses today |
| `hintsUsed`/`elapsedMs` | Already tracked in `PlaySession` | None |
| `cleanRun` | **Not tracked anywhere** | New boolean on `PlaySession`, flips `false` the first time a hint is used or a piece is force-placed (tier 3) |
| Assists/difficulty live mutation | Constructor-only (`this.options.assists`/`this.options.difficulty`), no setters | New `PlayRuntime.setAssists()`/`setDifficulty()`, needed for the pause sheet's settings panel |

`PlayRuntime.snapshot()` assembles all of the above into a `SessionSnapshot`.
`PlayRuntime.restore(snapshot, source)` is the inverse: builds via `Board.restore` instead of
`createBoard`, replays worksets/tray order/pinned/scroll/lens, sets camera, and sets
`startedAtMs = now - snapshot.timer.elapsedMs` so the timer continues rather than resetting.

### Source photos are the canonical durable copy, not any in-memory `ImageBitmap`

The design doc is explicit: *"Source photos live in IndexedDB as blobs."* Restoring a puzzle
needs the actual photo pixels to re-cut from — the cut is deterministic given the same seed and
image, but it still needs the image. This also resolves a data-flow question the screens below
depend on (reference image, "again, harder"): rather than keeping multiple long-lived
`ImageBitmap` copies alive across screens — fragile, given `ImageBitmap` transfer to the cutter
worker detaches the original, which is exactly the bug 5b's handoff already flagged for the
ghost underlay — **the stored blob is the one source of truth**, and every consumer decodes a
fresh working copy from it on demand:

- Crop confirm writes the cropped photo to a new `photos` IndexedDB store, keyed by
  `puzzleId`, once.
- `PlayRuntime` decodes its own working copy to hand to the cutter (as today).
- The pause sheet's reference image decodes a copy on open, revokes it on close — never held
  for the session.
- "Again, harder" decodes a fresh copy, mints a new `puzzleId`/seed, keeps everything else
  (mode, rotation, assists, difficulty) from the completed config.
- Restore (opening a library card) decodes a copy before calling `Board.restore`.

### Module layout

```
src/persist/
  db.ts        promisified raw-IndexedDB open/get/put/delete/getAll — hand-rolled, no
               dependency added (package.json currently has only react/react-dom/zustand)
  snapshot.ts  SessionSnapshot type, pack/unpack (Float32Array <-> base64),
               serialize(runtime-derived state) / buildRestoreInput(snapshot)
  thumbnail.ts capture(canvas) -> downsampled Blob
  photos.ts    write-once photo blob store, keyed by puzzleId
  library.ts   list()/save()/delete() over a session-record store keyed by puzzleId,
               each record = { snapshot, thumbnailBlob, updatedAt }
```

Debounce (800ms) and the `visibilitychange` synchronous write live in `PlayRuntime`, not
`App.tsx` — `PlayRuntime` already owns the session and sees every `PlayEvent`, and needs to be
able to save regardless of which screen is currently mounted around it.

---

## Screens and flow

### Entry flow

`App.tsx`'s `SetupPhase` union gains two members: `'checking'` (initial — resolving the library
query) and `'library'`.

On mount: query `library.list()`. Empty → `'picker'` (unchanged from today — first-ever visit
never sees an empty-state library, it goes straight to the picker). Non-empty → `'library'`.

### Library screen (`src/ui/Library.tsx`)

Grid of cards from `library.list()`. Each card: thumbnail (object URL from the stored blob),
`ProgressRing` (reusing the existing component, driven by the snapshot's `placedCount/total`),
`cols × rows`, mode, relative last-touched time. Tap a card: decode that entry's photo blob,
`Board.restore(...)`, mount `PlayRuntime.restore(...)`, go straight to `'playing'` — no picker,
crop, or setup screen in between. "New puzzle" CTA → `'picker'`.

No separate empty-state screen needed beyond what the entry flow already provides — a library
with zero records is never rendered; the app is in `'picker'` instead.

### Pause sheet (`src/ui/PauseSheet.tsx`, built on the existing `Sheet.tsx`)

Opens from a new pause button added to `TopBar`, next to the existing "Fit" button. Enabled
only once `status === 'playing'`. Contents:

- **Resume** — dismiss.
- **Reference image** — full-bleed, decoded fresh from the stored photo blob, tap to dismiss.
  Decoded on open, closed on dismiss.
- **Restart** — two-step confirm. Rebuilds `PlayRuntime` with the same `puzzleId`/seed/config
  (every piece back in the tray, worksets cleared, hints and timer reset). Cheap — the in-memory
  session already holds the decoded bitmap, so this doesn't need the photo blob again.
- **Settings** — the four step-5b assists (ghost opacity, edge highlight, large-piece, snap
  tolerance) become live-editable, via the new `setAssists()`/`setDifficulty()` methods. This is
  the settings-sheet home 4c's handoff already anticipated ("no settings sheet exists yet" —
  it does now). **Mode and rotation stay fixed for the session** — the doc never describes
  either as mid-session-editable, and live rotation toggling would touch snap tolerance and
  gesture state broadly enough to be its own project.
- **Leave** — synchronous save, navigate to `'library'`.

### Completion banner

`RuntimeSummary.status` gains a `'complete'` value (today only `'cutting' | 'playing' |
'failed'`). `TopBar`'s progress readout is replaced by a small non-modal banner on completion:

- **"Play again, harder"** — next rung in `PIECE_COUNT_LADDER`, same photo (decoded fresh from
  the stored blob)/mode/rotation/assists, new `puzzleId`/seed. Skips picker/crop/setup
  entirely — the whole point, per `handoff.md`'s framing of this feature as "nearly free" once
  the ladder exists. Hidden once already at 250 (nothing to step up to within the MVP ladder).
- **"Done"** — deletes the snapshot, thumbnail, and photo blob for this `puzzleId` (per the
  decision below), navigates to `'library'`.

This is deliberately minimal — no bloom sequence, no card, no share, no collection wall. Those
are Step 8's job. This pass only needs completion to be reachable and actionable.

### Completed puzzles and the library

Library shows in-progress puzzles only, matching the design doc's literal description. On
"Done," the puzzle's snapshot/thumbnail/photo-blob records are deleted outright rather than
kept-but-hidden behind a `completed` flag — there is no collection wall yet to read such a flag,
and inventing one now risks a data shape Step 8 doesn't actually want. Step 8 builds its own
store when it needs one.

---

## HEIC / EXIF

**EXIF orientation:** `decodeUpload` in `App.tsx` calls `createImageBitmap` with no
`imageOrientation` option at either call site (resized and non-resized branches). Add
`imageOrientation: 'from-image'` explicitly to both, rather than relying on a browser default
that has varied historically across engines. That's the entire fix — no manual EXIF byte
parsing.

**HEIC:** genuinely can't be verified without a real device this session — same standing gap
5a already flagged for iOS's picker behavior. The buildable half is the clear error path
`PLAN.md` itself asks for: if `decodeUpload` throws and the file's type/extension indicates
`heic`/`heif`, surface a specific message ("HEIC photos aren't supported directly here — try
'Most Compatible' in Settings → Photos, or export as JPEG") instead of the generic "couldn't
open that photo." Real-device verification of what iOS actually hands back through the file
input stays an open flag, not claimed as resolved.

## `dev.html` deletion

Remove `dev.html`, `src/dev/{harness,synthetic-image,scatter}.ts`, and the `dev` entry in
`vite.config.ts`'s `rollupOptions.input`. Grep the repo for any other references (docs,
playwright config, package.json scripts) before removing and clean those up too.

## Testing

**Vitest** (pure, DOM-free — same standard as the rest of the codebase):
- Pack/unpack round-trip for the `Float32Array` ↔ base64 encoding.
- `Board.restore` correctness: build a board, drag/merge/rotate several clusters into a
  non-trivial state, snapshot it, restore into a fresh `Board`, assert identical `worldOf` for
  every piece and identical cluster membership.
- The "next rung" helper for "again, harder," including the at-250 edge case.
- `cleanRun` flips correctly on tier-2/tier-3 hint use and stays true otherwise.

**Playwright** (the parts only a real browser can answer, per `CLAUDE.md`'s testing posture —
this is a gate, not optional):
- The load-bearing one: place a few pieces, reload the page, confirm the board restores
  pixel-identical (same pieces placed, same clusters) rather than resetting to a fresh cut.
- Library renders correctly from a real saved session (thumbnail, ring, card metadata).
- Pause sheet: open, reference image toggle, restart confirm (and cancel), settings live-edit,
  leave → lands on library.
- Completion banner: both actions, including "again, harder" skipping straight past
  picker/crop/setup into a new board.

**Real-hardware check:** flagged as an open gate per this project's standing convention (5a and
5b both left this open too) — not performed in this brainstorming/design session. In particular
this pass's IndexedDB-eviction interaction with iOS Safari's ~7-day inactive eviction (Step 9's
concern, but relevant here since this is the pass that makes losing an in-progress board a real
possibility for the first time) wants judging on a device before this is called done.

---

## Open questions carried forward, not blocking this spec

- Whether "again, harder" should also reset `cleanRun`/hint usage tracking independent of the
  new puzzle instance it creates (it does, implicitly — it's a new `puzzleId` with fresh
  `PlaySession` state) is worth a sentence in `PLAN.md` once this lands, not a decision this
  spec needs to make differently than what falls out naturally from the architecture above.
- Storage eviction / capacity handling for the `photos`/library stores is explicitly deferred
  (decided during brainstorming: uncapped for this pass) — Step 9 already owns the iOS Safari
  eviction problem broadly, and revisiting capacity limits before real usage data exists would
  be guessing.
