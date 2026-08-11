# Response to the UX & Architecture report — five tracks

**Written:** 2026-08-11
**Covers:** `docs/TESSERA_UX_ARCHITECTURE_REPORT.md`, reviewed against the source and decomposed
into five sequenced tracks. Track 1 is specified to task level; Tracks 2–5 are scoped for their
own sessions.
**Supersedes nothing.** It amends `2026-08-03-steps-7-8-9-completion-first-run-pwa-design.md`
rather than replacing it — Tracks 4 and 5 are that document's Step 7 and Step 9, with the
report's findings folded in.

> The design doc (`docs/Tessera Design Doc.dc.html`) wins every disagreement with this file, and
> with the report. §A.3 lists the four places the report disagrees with it and how each resolves.

> The report itself is gitignored (`/docs/*`) and exists only on the working machine. §A quotes
> every claim it needs, so this file stands alone if the report is not present.

---

## 0. Why this is not one implementation session

The report covers four subsystems — iPad motor accessibility, the uploaded-photo pipeline,
open-source structure, and first-run + offline architecture — and it was written against
`handoff.md`'s description of Tessera, not against the source. It therefore does not know what
already ships. Verified against the code, roughly 40% of its §1.3, §2.2, and §2.3 recommendations
describe behaviour that is already built and tested.

Treating the report as a single task list is how working code gets rebuilt. §A separates what
exists from what does not; §B and §C are the work that remains.

**Scoping decisions, taken with the project owner before this file was written:**

- Five sequenced tracks, one session each. Track 1 detailed here; Tracks 2–5 get their own plans.
- Where the report contradicts the design doc, it resolves as an **opt-in Comfort mode**, never
  as a new default. The design doc stays authoritative for the default experience.
- **Exactly three new dependencies across all five tracks:** `heic-to` (runtime, lazy-loaded,
  worker-only), `vite-plugin-pwa` (build), `@axe-core/playwright` (dev). Everything else is
  hand-rolled — WCAG contrast maths on the OKLab already in `src/tray/colour.ts`, golden-image
  cut tests on Playwright's built-in `toHaveScreenshot()`. No `exifreader`, no `culori`, no
  `pixelmatch`.
- The product stays one page. No marketing site, no backend, no accounts. `index.html` is the
  product; native iOS via Capacitor remains a later path.

---

## A. Review verdict

### A.1 Already built — do not rebuild

Verified in source at `3e63c9f`. If an implementation session touches any of these, something
has gone wrong.

| Report claim | Where it already lives |
|---|---|
| §1.3 `touch-action: none` on the drag surface | `src/render/renderer.ts:137`, `src/ui/App.tsx:1026`, `Tray.tsx:296`, `Sheet.tsx:171` |
| §1.3 `overscroll-behavior: contain` | `src/ui/theme.css:87` (`none`), `PieceGrid.tsx:117` (`overscroll-contain`) |
| §1.3 pointer events with capture, not touch events | `src/input/pointer.ts`, `src/input/board-controls.ts` |
| §1.3 `viewport-fit=cover` + `env(safe-area-inset-*)` | `index.html:5`, `TopBar.tsx:37`, `Sheet.tsx:161`, `Tray.tsx:262`, `HintButton.tsx:66–70` |
| §2.2 EXIF orientation normalised at ingestion | `App.tsx:116–136` — `imageOrientation: 'from-image'` on **both** decode branches, deliberately explicit; regression fixture at `test/browser/fixtures/exif.ts` |
| §2.3 fixed crop frame, photo pans beneath it | `src/play/photo.ts` (`clampPan`, `computeCropRect`), `src/ui/PhotoCrop.tsx` |
| §2.3 clamped so the frame can never expose empty area | `clampPan` in `src/play/photo.ts` |
| §2.3 zoom slider as the non-pinch fallback | `PhotoCrop.tsx` — 44pt floor fixed during 5a's review |
| §2.3 deterministic seeding from the photo | `seedFromPuzzleId` — a `CLAUDE.md` invariant, one scheme, no exceptions |
| §2.3 big obvious commit + reversible escape | `PhotoPicker.tsx` / `PhotoCrop.tsx` sticky footers (`3e63c9f`) |
| §2.4 native `<input type="file">` picker | `PhotoPicker.tsx:216–222` |
| §1.2 ghost underlay, edge highlight, large-piece mode, snap-tolerance selector | `PuzzleAssists` in `src/play/setup.ts:71`; live controls in `PauseSheet.tsx:188–234` |
| §1.2 extracted accent nudged rather than used raw | `src/render/accent.ts` — `clampToAccentRange`, `ensureHueSeparation` (**partial**, see A.3) |
| §1.2 never colour alone | `CLAUDE.md` invariant; edge-piece corner notch, colour-bin numerals, picker checkmark badge |
| §1.1 no punishment on a failed drop | `CLAUDE.md` invariant: "no bounce-back… a dropped cluster stays exactly where it was dropped" |
| §3.3 photo manifest with provenance | `assets/curated/manifest.json` — 30 entries, each with real `licence.name` / `attribution` / `sourceUrl`; `validateManifest`; rendered on the Puzzle Card |
| §4.1 the whole tutorial design | `docs/superpowers/plans/2026-08-03-plan-7-first-run.md` (611 lines, unimplemented) |
| §4.2 the whole caching strategy | `docs/superpowers/plans/2026-08-03-plan-9-pwa-and-ipad-pass.md` (396 lines, unimplemented) — already picks `vite-plugin-pwa` + Workbox `ExpirationPlugin`, already keeps uploads in IndexedDB |

### A.2 Stale claims — in the report, and in `handoff.md`

- **`handoff.md` §6 says the curated licences are `'stub'`.** False against the current manifest:
  all 30 rows carry real Unsplash attribution (`"Photo: Deep Doshi / Unsplash"` plus a
  `sourceUrl`). Do not schedule a task to fix it. Do spend twenty minutes confirming none of the
  30 is a placeholder, since `validateManifest` only checks the fields are non-empty.
- **Report §2.4 wants `accept="image/*,image/heic,image/heif"`.** The input is `accept="image/*"`,
  which already surfaces HEIC assets on iOS. The explicit hints are a one-line nicety folded into
  Track 1, not a fix for anything.
- **Report §4.2 assumes 30 high-res JPEGs may blow a ~50 MB iOS budget.** Correct in principle;
  measure before designing around it. `assets/curated/` is 30 files at roughly 0.5–1 MB each.

### A.3 Where the report disagrees with the design doc, and how it resolves

Four recommendations conflict. `CLAUDE.md`: the design doc wins.

1. **60pt primary targets vs. the doc's 44pt floor** → Comfort mode (Track 3). Default unchanged.
2. **A 1.15–1.25× grab scale vs. the locked lift `scale: 1.06`** (`src/render/scene.ts:99`,
   `renderer.ts:597`) → Comfort mode overrides it to 1.20. `Scene`'s default stays 1.06.
3. **"Magnetic pre-snap — ease the piece toward home before release" → rejected as specified.**
   It contradicts *the model is truth; the settle is presentation*. The spring is integrated from
   release velocity (stiffness 520, damping 26); a pre-release ease would either move a piece the
   model still says is loose, or introduce a second animation authority over the same piece. The
   forgiveness the report is actually after already exists — a wider tolerance (`generous`,
   0.40×) plus the `edgeHighlight` assist, both of which Comfort mode turns on.
4. **"On finger-up outside tolerance, return it gently to the tray" → rejected.** Directly
   contradicts the no-bounce-back invariant. The report's own alternative — "or leave it where
   dropped" — is what already happens, and it is not configurable.

### A.4 The genuine gaps

| # | Track | Why | Report § |
|---|---|---|---|
| 1 | **Photo ingestion: HEIC** | `App.tsx` *detects HEIC and rejects it* with a friendly message. The target user shoots HEIC by default. This is the single functional blocker on "a grandparent uploads a photo of the grandkids." | 2.1, 2.2, 2.4 |
| 2 | **Open-source hardening + first CI** | No `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `ARCHITECTURE.md`, no `.github/` at all, no CI. Entirely greenfield. | 3 |
| 3 | **Comfort mode, contrast gates, Dynamic Type** | Tremor damping does not exist. `accent.ts` clamps to a range but never measures a contrast *ratio*. The type scale is px, so system text size does nothing. | 1.1, 1.2 |
| 4 | **Step 7 — first run** | Plan exists, unimplemented. Amend with the report's onboarding research. | 4.1 |
| 5 | **Step 9 — PWA** | Plan exists, unimplemented. Amend with the report's iOS storage findings. | 4.2 |

**Order: 1 → 2 → 3 → 4 → 5.** Track 1 first because Tracks 4 and 5 both assume ingestion works.
Track 2 touches no file under `src/` and may run in parallel with, or ahead of, Track 1 — and its
CI gates protect Tracks 3–5. Track 3 lands before Track 4 so the tutorial can offer Comfort mode
by name, which is the report's "opt into comfort without self-labeling" point.

---

## B. Track 1 — HEIC ingestion

**Goal.** A HEIC file chosen from an iPad's photo library becomes a correctly-oriented,
downscaled `ImageBitmap` on the crop screen, with visible progress throughout, and without the
~2.7 MB libheif WASM ever loading on the curated or JPEG path.

**New dependency:** `heic-to`. It tracks libheif releases more closely than `heic2any` and
exposes orientation options, which decision 4 depends on.

### Files

| File | Change |
|---|---|
| `src/play/heic.ts` | **New.** DOM-free detection plus the orientation decision, documented. Tested. |
| `src/play/heic.worker.ts` | **New.** Transport shell only — mirrors `src/cut/cutter.worker.ts`. |
| `src/play/heic-client.ts` | **New.** Main-thread front door — mirrors `src/cut/cut-client.ts`. |
| `src/ui/App.tsx` | `decodeUpload` (line 116) gains a HEIC branch; `HEIC_MESSAGE` demoted to a fallback. |
| `src/ui/PhotoPicker.tsx` | `accept` hints; a "Getting your photo ready…" busy state. |
| `src/play/photo.ts` | Add `isLowResForCount` (pure). |
| `test/play/heic.test.ts` | **New.** vitest — the detection table and the orientation decision table. |
| `test/browser/photo-picker.spec.ts` | The existing HEIC-*rejection* test inverts to HEIC-succeeds. |

### The eight decisions, each to be written into the code

1. **Detection is three-signal, and the container sniff is the authority.** MIME (`file.type`),
   extension, and a sniff of the first 12 bytes — `ftyp` at offset 4, brand at offset 8 in
   `{heic, heix, hevc, heim, heis, hevm, hevs, mif1, msf1}`. Windows misreports the MIME type for
   `.heic`; the sniff is the only signal that never lies. A pure function over a `Uint8Array`, so
   it lives in `heic.ts` and is tested in vitest. `looksLikeHeic` (`App.tsx:105`) moves here and
   gains the third signal.

2. **Try the browser first, unconditionally.** Call `createImageBitmap` before any detection
   branch — iOS often transcodes to JPEG on the share path, and Safari sometimes returns a
   decodable bitmap anyway. Only on *throw* **and** positive detection does the worker spin up.
   This keeps the WASM off the happy path even for a file literally named `photo.heic`.

3. **The WASM never enters the main bundle.** `import('heic-to')` lives inside `heic.worker.ts`,
   so Vite code-splits it into the worker chunk. Track 2's CI adds a bundle budget on the main
   entry chunk to keep it that way.

4. **Orientation: one source, applied once — this is the whole `irot` fix.** Ask `heic-to` for
   the converted JPEG **without** applying orientation, then hand the resulting blob to the same
   `createImageBitmap(blob, { imageOrientation: 'from-image' })` path every other upload takes.
   HEIC can carry rotation in both the EXIF `Orientation` tag and the container's `irot` box, and
   the classic bug is applying both. We never apply a rotation ourselves, so there is nothing to
   double. **Write this as a comment in `heic.ts`** — without it, the absent rotation handling
   reads as an omission rather than a decision.

5. **The downscale happens once, where it already happens.** The converted blob goes through
   `probeImageSize` + `downscaleTarget` (`src/play/photo.ts:104`) exactly as a JPEG does.
   `CLAUDE.md`'s 2560px long-edge cap is enforced in one place; do not add a second.

6. **Progress is visible from the instant the file lands**, not from when the worker starts —
   report §2.4's "nothing happened" gap, which the target audience reads as their own mistake.
   Reuse `App.tsx`'s existing `SetupPhase` union: add a `busy` field to the `picker` phase rather
   than a new phase, so `PhotoPicker` renders the message over its own surface with no route
   change.

7. **Failure stays graceful and unchanged.** Conversion throws → `HEIC_MESSAGE` verbatim, exactly
   as today. Nothing regresses on a device where the WASM will not load.

8. **EXIF stripping on persisted derivatives: verify, do not add code.** `PhotoCrop`'s
   `rasterizeCrop` re-encodes through a canvas, so EXIF — including GPS — is gone by construction
   before anything reaches `src/persist/photos.ts`. Confirm it with a test that reads a persisted
   blob back and finds no `Exif` marker. Do not write a stripping pass for something that cannot
   survive.

### Also in Track 1, same area, small

- **`isLowResForCount(photo, targetCount)` in `photo.ts`** — pure, tested. Drives a gentle "This
  photo is a little small — pieces may look soft" note on the setup screen. Warns, never blocks.
- **Explicitly not doing: face-biased crop centring** (report §2.3). `FaceDetector` is
  Chromium-only and absent from Safari, the primary target; anything else means a model
  dependency. YAGNI.

### Track 1 verification

`npm test` · `npm run typecheck` · `npm run build` (which also confirms the code-split: the main
chunk size must not move) · `npm run test:browser` on dock **and** phone.

Then the gate `CLAUDE.md` calls a gate and which no step since 5a has actually run: **upload a
real HEIC from an iPad's photo library** over `npm run dev` on the LAN (`vite.config.ts` already
sets `server.host: true` for this). Chromium cannot prove this one — it has no HEIC files and no
iOS share path.

**Acceptance test, concretely:** on an iPad, tap "Use my own photo," pick an unmodified iPhone
HEIC, and reach the crop screen with the photo upright and correctly framed, having seen
continuous progress and no error — with the network panel showing no libheif WASM fetch on a
subsequent JPEG upload.

---

## C. Tracks 2–5 — scoped, each for its own session

### Track 2 — Open-source hardening and the first CI

Zero files under `src/`. One decision to confirm at the top: **the code licence — MIT
recommended** (permissive, and it matches the "land your first accessibility fix" goal;
Apache-2.0 if the patent grant matters more).

- `LICENSE` (code) and a **separate** `ASSETS-LICENSE.md`. The latter must state plainly that the
  Unsplash License is neither CC0 nor the code licence: free commercial use without permission,
  but no selling unaltered copies and no compiling the photos to replicate a competing service. A
  puzzle game is squarely fine; a contributor assuming the code licence covers the photographs is
  the risk this file exists to remove.
- `ARCHITECTURE.md` — the contributor-facing view of the three subsystems. It should **link to**
  `CLAUDE.md`'s Invariants / Coordinate spaces / Layout sections, not duplicate them. `CLAUDE.md`
  is already that document, and two copies will diverge.
- `CONTRIBUTING.md` — setup; the two-suite posture (vitest owns `*.test.ts`, Playwright owns
  `*.spec.ts`, neither ever collects the other's); the "DOM-free is the same word as tested" rule;
  and the accessibility acceptance criteria as first-class rules rather than folklore.
- `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1.
- `.github/CODEOWNERS` — maintainer review required on `src/cut/`, `src/board/`,
  `assets/curated/`, `assets/curated/manifest.json`, `src/play/curated-manifest.ts`.
- `.github/ISSUE_TEMPLATE/` — bug; **accessibility** (device, iPadOS version, assistive settings
  on, what failed); and photo-suggestion, which demands licence proof and which a maintainer
  merges, never the contributor.
- `.github/workflows/ci.yml` — **the repo's first CI.** `npm test`, `npm run typecheck`,
  `npm run build`, `npm run test:browser` (with `npx playwright install --with-deps chromium`,
  honouring the deliberate version pin). Plus a manifest-integrity job — every
  `assets/curated/*.jpg` has a manifest row, every row has a file and non-placeholder licence
  fields — and Track 1's bundle budget.
- **Golden-image cut tests** via Playwright's `toHaveScreenshot()`, no new dependency. Fixed
  seed, fixed curated photo. Screenshot baselines are usually too brittle to earn their keep;
  they work *here* precisely because `CLAUDE.md` already pins Playwright to one Chromium build
  and `BoardPage.open()` already stubs `crypto.randomUUID` for determinism.
- README rewrite: the accessibility mission first — it is both the differentiator and the
  contributor magnet — then a screenshot/GIF, then one-command setup.
- Seed `good first issue` / `help wanted`. The deferred minors itemised in `handoff.md` §1e are
  ready-made candidates.

### Track 3 — Comfort mode, contrast gates, Dynamic Type

- **`PuzzleAssists` gains `comfort: boolean`** (`src/play/setup.ts:71`) — one flag, one place,
  read by everything below, toggled in `PauseSheet` beside the existing three assists.
- **What it changes:** control targets to 60pt via a `data-comfort` attribute on `<html>` (the
  same mechanism `App.tsx` already uses to publish `--accent`); `heldLift.scale` 1.06 → 1.20;
  snap difficulty floored at `generous`; tremor damping on.
- **Tremor damping in `src/input/pointer.ts`** — a one-pole low-pass plus a small dead-zone on
  the drag path. DOM-free, therefore tested. It must not delay `MOVE_THRESHOLD_PX` promotion, or
  it reads as lag rather than steadiness. Flag the constants as *chosen, not measured*, the way
  `hints.ts` already flags its escalation thresholds.
- **Hit-slop as a policy, not 107 edits.** One `Touchable` wrapper or Tailwind utility that
  expands the touch region without touching the visual mark. Audit, then apply once.
- **A contrast gate on `src/render/accent.ts`.** Hand-rolled `contrastRatio(a, b)` (WCAG relative
  luminance, about ten lines) plus `ensureContrast(lab, against, minRatio)`, which walks OKLab
  lightness until it passes. `clampToAccentRange` stays as the first pass; this is the second,
  and it is the one that *measures a ratio* instead of assuming a range. Test at a near-black
  photo **and** a near-white one — per `CLAUDE.md`, a test that passes at both extremes of the
  constant it guards is not testing that constant.
- **Adaptive ghost opacity** from local region luminance. `CutPiece.meanColor` already exists
  (`accent.ts` consumes it), so this is a per-slot lookup, not a second pixel pass.
- **Dynamic Type** — convert `--text-1…7` (`theme.css:43–49`) from px to rem and move the ~107
  `text-[Npx]` Tailwind classes onto the tokens. Mechanical but broad; its own task, with
  `@axe-core/playwright` asserting nothing clips at 200% text.
- **Instrumentation (report §1.1.6) — flagged, recommended deferred.** Supplementary-attempts-
  per-piece and time-to-seat are the right objective accessibility metrics, but the obvious
  wiring routes per-attempt data through `RuntimeSummary` and breaks *the board never re-renders
  through React*. If it lands, it lands the way `elapsedMs` and `cleanRun` already do — frozen
  into the summary on the `complete` event only, never per frame.

### Track 4 — Step 7, first run

Execute `docs/superpowers/plans/2026-08-03-plan-7-first-run.md`, amended with:

- Report §4.1 independently confirms the plan's core instinct — interactive first success, a real
  completion, skippable *and* replayable. Cite it; change nothing.
- Its fail-open rule for the seen-flag, which resolves one of `handoff.md` §6.1's open questions:
  **IndexedDB is the source of truth, mirrored to a `localStorage` boolean as a synchronous
  pre-hydration cache** so launch never flashes the wrong screen. `CLAUDE.md` forbids
  `localStorage` for *session state*; a fail-open UI-routing cache is not session state, but this
  is invariant-adjacent and must be written into `CLAUDE.md` as an explicit, narrow carve-out
  rather than left implicit. A missing flag means "show the tutorial again," which is harmless.
- Offer Comfort mode by name during first run — a Track 3 dependency, and the report's answer to
  letting the target user opt into comfort without self-labeling.

### Track 5 — Step 9, PWA

Execute `docs/superpowers/plans/2026-08-03-plan-9-pwa-and-ipad-pass.md`, amended with:

- **Measure the curated corpus before designing the budget.** Both the plan and the report reason
  from an assumed size; `assets/curated/` is 30 files at roughly 0.5–1 MB each.
- The report's **thumbnail tier**: small thumbnails precached, so the picker and the collection
  wall render offline from the first launch, with full-res cached on first play under a bounded
  LRU. The eager `?url` glob added on 2026-08-11 (`curatedPhotoUrl`) is already the seam for this.
- Confirm the plan's existing "uploads live in IndexedDB, never Cache Storage" split, and add
  `navigator.storage.persist()` plus `estimate()` headroom checks before large writes — the plan
  already lists `persist()` in its definition of done.
- Background Sync is unsupported on iOS Safari: feature-detect, fall back to in-app retry on next
  launch.
- iPadOS 26 replaced classic Split View and Slide Over with a windowing model. The plan's Task 4
  predates that; re-scope it to "survive arbitrary window resizes and `pointercancel`" rather than
  to specific Split View behaviours.

---

## Verification, all tracks

`npm test` · `npm run typecheck` · `npm run build` · `npm run test:browser` on both dock and
phone. Non-negotiable: `CLAUDE.md` calls the browser suite a gate, and a green `npm test` is
500-odd assertions about pure functions that stay green while the app fails to boot.

**Real hardware, once per track.** No step since 5a has had a device pass; five have deferred it
in a row. Each track carries one explicitly, because each has something only a device can prove.

| Track | What only an iPad can prove |
|---|---|
| 1 | A real HEIC from the Photos library converts, upright, at a usable speed |
| 2 | — (no runtime surface) |
| 3 | Whether tremor damping reads as steady or as lag; whether 60pt reads as confident or childish |
| 4 | Whether the tutorial's coaching lands without being read |
| 5 | Offline launch, install, backgrounding, and window resize under iPadOS 26 |

`npm run dev` is already LAN-exposed (`vite.config.ts`, `server.host: true`) for exactly this.
