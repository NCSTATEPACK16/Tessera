# Steps 0/8/7/9 — foundations, completion payoff, first run, PWA

**Written:** 2026-08-03
**Covers:** `PLAN.md` Step 7 (First run), Step 8 (Completion payoff), Step 9 (PWA and the
iPad-grade pass), plus three loose ends owned by no step so far.
**Supersedes nothing.** This is the last design document before the v1 gate.

> The design doc (`docs/Tessera Design Doc.dc.html`) wins every disagreement with this file.
> Where this file decides something the design doc does not specify, it says so explicitly and
> gives the reasoning, in the same style `handoff.md` §1g uses for step 6's judgment calls.

---

## 1. Why the build order is not `PLAN.md`'s order

`PLAN.md` lists 7 → 8 → 9. The dependencies do not permit it:

- **Step 7 ends on the card.** §16: *"On completion: the card, then 'Now use your own photo' as
  primary and 'Today's puzzle' as secondary."* The card is Step 8's artefact. Building 7 first
  means building its final beat twice, or shipping it against 5c's placeholder banner.
- **Step 8's collection wall has no data.** `handleDone` in `src/ui/App.tsx:531-549` calls
  `deleteLibraryEntry` on completion. Nothing anywhere records that a puzzle was ever finished.
- **Both need real photographs.** Step 7's entire thesis is §16's *"a 12-piece board with a
  beautiful photo is already the whole game"*, and Step 8's card carries §15's *"quiet licence
  attribution for curated photos"* — attribution that does not exist because the photos are
  procedurally-drawn gradients.

So the order is **0 → 8 → 7 → 9**, in four plans. Each produces working, testable software on its
own.

| Plan | Delivers | Blocks |
|---|---|---|
| **0 — Foundations** | Real curated photos, EXIF/HEIC verification, workset-collapse removal | 8 and 7 |
| **8 — Completion payoff** | Completions store, Puzzle Card, share/save, collection wall | 7 |
| **7 — First run** | The guided twelve, landing on the real card | — |
| **9 — PWA and the iPad pass** | Offline, install prompt, performance, Split View | the v1 gate |

All four land as **one pull request** once coded, together with the already-committed step 5c and
step 6 work currently sitting unpushed on `step-5b-puzzle-setup`.

---

## 2. Plan 0 — Foundations

### 2.1 Real curated photos

`src/play/curated.ts` today holds six procedurally-drawn gradient scenes. `handoff.md` §1g is
explicit that this **must not ship at six**: `dailyPhotoIndex`'s coprime-stride rotation only
guarantees no *consecutive-day* repeat, so the daily visibly cycles every six days.

**The manifest.** `CuratedPhoto` grows from `{ id, name, width, height }` to:

```ts
export interface CuratedPhoto {
  id: string;
  name: string;
  /** §15: browse by feeling, not folder. */
  shelf: CuratedShelf;
  width: number;
  height: number;
  /** Path under `assets/curated/`, resolved by the bundler. */
  file: string;
  licence: CuratedLicence;
  /** Precomputed at build time (§15: "pre-compute everything"). */
  dominant: readonly string[];
  difficulty: 'easy' | 'standard' | 'hard';
  recommendedCounts: readonly number[];
}

export type CuratedShelf = 'wide-and-calm' | 'dense-and-busy' | 'one-animal-close';

export interface CuratedLicence {
  /** e.g. "CC0", "Unsplash License", "Public Domain (Rijksmuseum)". */
  name: string;
  /** Displayed on the completion card. e.g. "Photo: Jane Doe / Unsplash". */
  attribution: string;
  /** The page the file came from, for audit. */
  sourceUrl: string;
}
```

Shelf names are §15's own examples, taken verbatim. They are *feelings*, not categories, because
*"the player is choosing a mood for the next forty minutes."*

**Sourcing.** ~30 photographs across the three shelves, from Unsplash, Pexels, and public-domain
museum collections. §15 requires per-image licence verification rather than trusting the platform
default, so the shortlist — id, name, shelf, source URL, licence, attribution — is produced as its
own reviewable deliverable and **approved before any file enters the repo**. 30 rather than §15's
50: enough to push the daily's repeat cycle past a month and supply the guided twelve's hero,
while keeping licence verification real work rather than a rubber stamp.

**Cuttability.** §15: *"reject any photo with more than ~25% near-uniform area (open sky, flat
snow) at counts above 150, or tag it 'hard' and let it be a badge of honour rather than a bad
surprise."* The build-time script measures near-uniform area and writes `difficulty` and
`recommendedCounts` accordingly. A photo over the threshold is tagged `'hard'` and its
`recommendedCounts` stop at 150 — it is never rejected outright, because the design doc prefers
the badge of honour.

**Precompute.** A build-time script derives `width`, `height`, `dominant`, `difficulty`, and
`recommendedCounts` from the files and writes the manifest. `dominant` reuses `src/tray/colour.ts`'s
OKLab weighted k-means, which is already tested — the forest case in `test/tray/colour.test.ts` is
the one that proved a bare lightness weight cannot work, and that reasoning applies identically
here. **The script fails the build on any entry missing a licence**, so attribution can never
silently vanish from a completion card.

**The swap is invisible to callers.** `renderCuratedPhoto(id): Promise<ImageBitmap>` keeps its
exact signature; only its body changes, from `OffscreenCanvas` drawing to decoding a real asset.
The picker, `handleStartDaily`, and the daily rota are untouched. This is the whole point of
`handoff.md` §1g's claim that the six-photo problem is *"a content gap, not an architecture one"* —
growing `CURATED_PHOTOS` fixes the daily cycle with no code change at all.

### 2.2 EXIF and HEIC — verification, not construction

`PLAN.md`'s Step 1 checklist still has two unticked boxes:

- *"Read EXIF orientation, or portrait photos slice sideways."*
- *"HEIC from the iOS picker: `<input type="file">` usually hands back a converted JPEG — verify."*

Commit `cf2747e` ("Step 5c: EXIF orientation fix and a clear HEIC error path") landed both, and
`src/ui/App.tsx` carries `HEIC_MESSAGE`, `looksLikeHeic`, and `decodeUpload`. This work is
therefore **confirming behaviour and adding the missing regression tests**, then ticking the boxes.
If verification finds a gap, the plan fixes it; the plan does not assume one exists.

### 2.3 Workset collapse — deleted

`handoff.md` §E: *"Either design the gesture or delete the surface — do not leave it a third
time."* Deleted. Nothing in §06 requires collapse; the group chip's tap-to-rename is a complete
feature on its own.

**This is larger than it looks, and the plan treats it as three separate concerns:**

1. **Runtime surface.** `WorksetStore.setCollapsed`, `WorksetStore.isHidden`, the `collapsed`
   field on a Workset, `PlaySession.setWorksetCollapsed`, `PlaySession.moveWorksetBy`,
   `PlayRuntime.toggleGroupCollapsed`, `Renderer.drawGroupChips`'s collapsed branch,
   `groupChipText`'s `⌄`, and `groupChipRect`'s `collapsed` parameter.

2. **`isHidden` is a live invariant, not merely dead code.** `CLAUDE.md` names it as one of the
   **two predicates gating the mat** — `inTray` and `worksets.isHidden` — consulted in `rebuild`,
   `scene`, and `contentBounds` (`src/play/session.ts:331`, `:353`, `:723`). Honour one without
   the other and the player grabs invisible pieces. All three consultations must go together with
   the predicate, and `CLAUDE.md`'s invariant text must be rewritten in the same commit. Removing
   the predicate while leaving a consultation, or vice versa, is the failure this note exists to
   prevent.

3. **`collapsed` is in the save format.** `SessionSnapshot.worksets[].collapsed`
   (`src/persist/snapshot.ts:34`) and `Board.restore` (`src/board/board.ts:146`) both carry it, and
   `PlayRuntime`'s restore path at `runtime.ts:697` writes it back. Snapshots already written to
   real players' IndexedDB contain the field. **Restore must ignore an unknown `collapsed` rather
   than reject the snapshot** — the `version` field exists for exactly this, and losing an
   in-progress 250-piece board to a schema tidy-up is the single unforgivable failure in §14.

**Explicitly out of scope:** `ClusterState.collapsed` on `src/board/board.ts:57`. That is the
*island* collapse field, a different concept from a Workset, and whether it is separately dead is
its own question. This plan does not touch it.

---

## 3. Plan 8 — Completion payoff

### 3.1 The completions store

Today a finished puzzle is erased. `handleDone` deletes the library entry, and its snapshot,
thumbnail, and photo blob go with it. §15 wants the opposite: *"a growing mosaic of everything you
have finished is a possession, and people do not abandon possessions."*

A **new IndexedDB store**, `completions`, at **db v3 — additive**, following exactly the pattern
step 6 used for `daily`. `openDb`'s upgrade already guards every `createObjectStore` with a
`contains` check, so the bump preserves sessions, photos, thumbnails and daily. `daily.spec.ts`
asserts the v1→v2 bump preserved an existing session; **that assertion gets a v2→v3 twin**, because
getting this wrong deletes every in-progress puzzle a real player has.

```ts
export interface CompletionRecord {
  puzzleId: string;
  /** The curated photo's id, or null for an uploaded photo. Carries attribution. */
  photoId: string | null;
  /** The final board, captured by `captureThumbnail` — not the source photo. */
  thumbnailBlob: Blob;
  elapsedMs: number;
  pieceCount: number;
  mode: PuzzleMode;
  cleanRun: boolean;
  /** Epoch ms. Orders the wall, newest first. */
  completedAt: number;
  /** Denormalised at write time so the wall never re-reads the manifest. */
  attribution: string | null;
}
```

Why a separate store rather than a status flag on the library entry: **"in progress" and
"finished" stay separate concepts**, the library's semantics do not change, and a completed
250-piece snapshot plus its full-size source blob does not stay resident forever. §17 names iOS
Safari storage eviction as a standing risk — *"a player who loses a 250-piece board in progress
will not return"* — and the cheapest way to protect in-progress boards is to not hoard finished
ones.

`handleDone` therefore becomes: write the completion, *then* delete the in-progress entry. In that
order, so a crash between them loses nothing.

### 3.2 The Puzzle Card

Split the same way `cutter.ts`/`cutter.worker.ts` and `light.ts`/`renderer.ts` already split, which
is what `CLAUDE.md` means by *"DOM-free is the same word as tested"*:

- **`src/play/card.ts`** — pure layout maths. Given photo aspect, metadata, and a target pixel
  size, returns positioned boxes for the image, title, data rows, badge, and attribution. Tested.
- **`src/render/card.ts`** — `composeCard(...): Promise<Blob>`. Draws the boxes and returns a PNG.
  Canvas, judged by hand, the category `CLAUDE.md`'s testing posture puts `renderer.ts` in.

**The card's image is the completed board canvas, not the source photo.** `captureThumbnail`
already performs exactly this capture for library cards. §11's wireframe 05 says *"the photo, fully
lit"*, and the lit assembled board **is** that — seams and all. Composing from the source photo
would discard the thing the player just made and print a stock image instead.

Content, from wireframe 05 verbatim: the photo, the title, the elapsed time, the piece count, the
mode, the clean-run badge. Plus §15's quiet licence attribution for curated photos.

**Typography.** `--type-display` (Instrument Serif) *"earns its keep here and nowhere else on this
screen."* `index.html` already loads it with the comment *"for the completion card at step 8 and
used nowhere before it"* — this is that step. Times and counts use `--type-data` (IBM Plex Mono,
tnum). **No exclamation marks, no confetti — the lit photo is the reward.**

### 3.3 The card screen, share, and the wall

`src/ui/CompletionCard.tsx` replaces `src/ui/CompletionBanner.tsx`, whose own header already
declares itself a placeholder for *"Step 8's Puzzle Card"*. It keeps the banner's daily variant —
design doc screen 10's *"Daily variant with streak increment"* — and its `again-harder` and `done`
actions, and adds share, save, and new-puzzle.

**Share** uses `navigator.canShare({ files })` where present, falling back to a PNG download.
Feature-detected, never assumed: the fallback is the desktop path, not an error path.

**Next difficulty.** §15: *"Suggest the next step on the completion card, in the moment of
confidence."* `nextHarderCount` already exists in `src/play/setup.ts` and 5c already wires
again-harder; the card surfaces the specific number rather than a generic label.

**`src/ui/CollectionWall.tsx`** — the mosaic, newest first, from `listCompletions()`. Tapping a
tile shows its card again. Empty state is an invitation, not an apology, matching the library's
existing treatment (design doc screen 02). Reached from the library; a new `'wall'` value on
`App`'s `Screen` union.

---

## 4. Plan 7 — First run

### 4.1 The coach

**`src/play/first-run.ts`** — a pure state machine, DOM-free and tested. Fed `(placed,
msSinceLastPlacement, skipped)`, it returns the current beat:

```ts
export type FirstRunBeat =
  | 'cold-open'      // "Drag a piece where you think it goes."
  | 'playing'        // no copy on screen
  | 'tray-reveal'    // "Pieces live here. Filter them." — lens chips pulse once
  | 'hint-rescue'    // tier 1 fires unprompted, exactly once
  | 'complete';
```

Every number §16 specifies is a named constant in this one tested file: tray reveal at **4
placed**, hint rescue at **8 placed** after **20 seconds** with no placement, firing **once**.
Putting these in `useEffect` timers in `App.tsx` instead would leave them with no unit-test surface
at all — which is precisely how step 3b shipped two defects that reading the code missed.

### 4.2 The beats

- **Cold open.** A curated 12-piece photo, already scattered. One line of copy, *"Drag a piece
  where you think it goes."* **No account, no menu, no mode picker.** The tray is **not rendered
  at all** before the `tray-reveal` beat — that is what §16's *"the tray slides in on its own"*
  means, and it is why the coach must be able to gate the tray's mount.
- **First correct snap: full juice.** Nothing is explained; the existing snap, light and audio
  explain it. No new code — this beat is a decision *not* to add anything.
- **Tray reveal at four placed.** The tray mounts and animates in carrying the remaining pieces,
  with *"Pieces live here. Filter them."* The lens chips pulse once.
- **Hint rescue at eight placed.** If 20 seconds pass with no placement, the hint button glows and
  `PlayRuntime.fireHint(1)` fires unprompted, once. *The player learns the hint exists by being
  rescued by it, not by reading about it.*
- **Completion.** The real Step 8 card, then **"Now use your own photo"** primary and **"Today's
  puzzle"** secondary.

### 4.3 Configuration and entry

`targetCount: 12` passes straight through. `PIECE_COUNT_LADDER` is `[50, 100, 150, 200, 250]` but
`PuzzleConfig.targetCount` is a plain `number`, so **the ladder is not widened** — 12 must never
become an offerable count on the setup screen.

**Rotation never appears in the guided first puzzle** (§16). Fixed config, in the shape of step
6's `DAILY_CONFIG`.

**Entry condition:** no library entries, no completions, and no `firstRunDone` flag. Three
conditions rather than one because each alone is wrong — a player who finished the tutorial and
then deleted everything must not be taught again.

**Skip** is a small control, present at all times, never modal. **It writes no completion.** §16's
*"it counts as a real completion on the collection wall"* reads as *finishing* the tutorial earning
a real trophy — consistent with *"a tutorial the player is allowed to be proud of is not a
tutorial."* A skipped tutorial would put a possession the player never earned as the first tile on
their wall. Skip sets `firstRunDone` and exits to the photo picker.

---

## 5. Plan 9 — PWA and the iPad-grade pass

### 5.1 Service worker

**`vite-plugin-pwa`.** This is the one place the codebase's no-new-dependency posture
(`dcdd29e7`'s hand-rolled IndexedDB wrapper) is set aside, and the reason is specific: a precache
manifest must name every hashed asset filename, and a stale list **serves a broken app offline with
no error anywhere**. Workbox generates that manifest from the build output. The IndexedDB wrapper
was ~50 lines with no such coupling to the bundler; this is not the same trade.

Precache covers the shell, the audio bank, and the curated photos — §09's *"fully playable offline
after first visit."* Note that the photos are only precacheable because Plan 0 made them real
files; procedural scenes had nothing to cache.

### 5.2 Install prompt and eviction

§17: *"make 'add to home screen' a real prompt after the second completion — installed PWAs are
evicted far less aggressively."* The completions store makes "second completion" a one-line count.

**iOS Safari fires no `beforeinstallprompt`** — the target platform for this entire product has no
programmatic install prompt at all. It gets an instructional sheet instead, which is the only
option that exists, and the plan says so rather than discovering it on device. Plus
`navigator.storage.persist()` and §17's warning at 7 days idle.

### 5.3 Performance and Split View

- The §03 budget, profiled on **the worst device available, not the newest** (§17).
- Cap source at 2560px — already enforced — and **release the decoded source after cutting**.
- Stage Manager works, but **Split View gestures can steal a drag near screen edges**; the plan
  arbitrates at the edge rather than assuming the pointer machine sees every event.

**Gate:** a 250-piece puzzle at 60fps on iPad Safari, installed as a PWA, surviving a backgrounding.

---

## 6. Testing posture

Unchanged from `CLAUDE.md`, and it applies to all four plans:

- **Anything with a real decision in it is DOM-free and unit-tested.** `first-run.ts`, `card.ts`,
  the curated manifest and its validation, `completions.ts`.
- **`npm run test:browser` is a gate, not an optional extra** — run on every change and without
  exception before the PR. New specs: the card and share fallback, the collection wall, the first
  run's four beats, the db v2→v3 bump preserving an existing session, and an offline reload.
- **Real hardware every step.** This remains the standing open gate it has been since 5a. Snap
  feel, the card's serif at real size, the wall's tile density on a phone, and the Split View edge
  behaviour are all judged by hand on an iPad, and none of them are answerable in Chromium.

## 7. What this design deliberately does not do

Named here so none of it reads as an oversight later, in the manner of `handoff.md` §1g:

- **No Supabase, no accounts, no leaderboard.** Play stays account-free through step 9. The
  collection wall, the streak, and every completion live in the client's IndexedDB.
- **No album mode, profile, stats, or achievements wall** — §10 defers all of them out of MVP by
  decision.
- **No cut styles or Fog.** §15 names them as the difficulty lever after rotation; they are
  post-MVP.
- **The full 50-photo library is not delivered** — ~30, for the reason given in §2.1. The gap
  narrows rather than closes, and stays tracked in `handoff.md`.
