# Tessera — Implementation Plan

Companion to `DESIGN_BRIEF_Tessera.md` and `Tessera Design Doc.dc.html`.

> **Source-of-truth order.** The HTML design doc (`# Photo Puzzle Game Design/Tessera Design Doc.dc.html`)
> supersedes this file wherever they disagree. It was produced after the original brief and
> settles decisions this plan originally guessed at. The brief governs product intent, voice,
> and visual thesis; the design doc governs engine, state model, geometry, and component
> architecture. This file is the build schedule and the operational detail neither doc covers
> (backend shape, native path, privacy, testing).

Web-first → PWA → native iOS/iPadOS.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Shell / UI | React 19 + Vite + Tailwind v4 + Zustand | DOM is right for chrome. Design doc §03: chrome is "plain DOM, fully accessible, never inside the canvas" |
| Board renderer | **Canvas 2D, five-layer stack** | Design doc §03. See below |
| Cutter | **Web Worker + OffscreenCanvas** | Non-negotiable per §03. Main thread never blocks; setup screen shows real progress |
| State | Zustand for chrome only; board state lives outside React entirely | Piece positions update at 60fps and must not trigger React re-renders. React reads derived summary state only (progress %, combo, hints left, timer) |
| Audio | Web Audio API directly (not Howler) | Needs a sample pool, per-voice pitch shifting on one layer only, and a duck bus. Howler fights all three |
| Persistence | IndexedDB (idb-keyval) local; Supabase for sync only when earned | §14: everything works signed out, forever |
| Backend | Supabase (Postgres + Auth + Storage + Edge Functions) | Realtime not needed until Duo, post-MVP |
| Hosting | Netlify, SPA + PWA manifest | |
| Native | **Capacitor** wrap, decision revisited after the PWA gate | One codebase; real haptics, native photo picker, StoreKit |

### Renderer decision — reversed from the original plan

The original plan specified PixiJS v8. **Design doc §03 rejects WebGL for MVP** and the reasoning holds
at the locked 250-piece ceiling:

- At 250 pieces WebGL buys nothing over a per-frame `drawImage` loop across pre-rendered piece bitmaps.
- It costs shader authoring, context-loss handling on iOS backgrounding, and makes text/UI your problem.
- DOM/SVG pieces are also rejected: 250 elements each carrying a clip-path, shadow, and transform
  composite badly on an iPhone 12; CSS gives no honest additive blending for the light thesis; and
  browser hit-testing uses bounding boxes, so overlapping tabs pick the wrong piece.

**Build the renderer behind a thin `draw(scene, camera)` interface** so a WebGL backend can slot in the
day 1000-piece boards ship. That is the hedge — not building WebGL now.

### The layer stack (§03)

| Layer | Redraw rate | Contents |
|---|---|---|
| Mat | on resize | Finish texture and vignette. Static bitmap |
| Static board | on placement | Placed pieces plus the baked bloom mask. Expensive, but only changes when a piece lands |
| Dynamic | 60fps while active | Loose pieces and islands in view, held cluster, hint glow, ripples. Usually under twenty objects |
| Overlay | 60fps while active | X-Ray dimming pass, drag shadow, selection rings. Duo's second cursor later |
| Chrome | React | Top bar, tray, sheets, buttons, toasts |

On an idle board with no finger down, **both canvas layers are still and the app draws nothing at all.**
That is how the iPad stays cool for a sixty-minute session.

### Non-negotiable performance rules (§03)

- Cutting happens in a Web Worker with OffscreenCanvas.
- Piece bitmaps render once at `min(devicePixelRatio, 2)` and are **never re-rasterised while zooming**.
  Zoom scales the bitmap; a re-raster pass runs 200ms after the pinch settles, on-screen pieces only,
  only above 1.5× zoom.
- Source images downscale to **max 2560px long edge** before cutting.
- Hit-testing is a spatial hash over piece bounds, then point-in-path against the cached `Path2D`.
  Never a full scan.
- **Budget: 250 pieces, iPhone 12, sustained 60fps while dragging a 20-piece island.**
  If that fails, the fix is fewer live objects, not a smaller image.

---

## Locked decisions carried from §01

| Axis | Decision |
|---|---|
| Scope | MVP only — Classic, Daily, Zen, plus **Rotation as a modifier** |
| Piece ceiling | 250 pieces genuinely playable on an iPhone. The hard target everything is measured against |
| Tray | Always visible. Docked right on iPad, three-detent bottom sheet on iPhone. One canonical order; filters are lenses over it |
| Resume | Full fidelity — every loose piece position, camera, tray lens, scroll, and timer restored exactly |
| Accounts | Fully local until the player touches a streak or leaderboard, then an offer, never a gate |
| Rotation | **In MVP.** Piece and cluster state carries rotation from day one |
| First run | A guided 12-piece puzzle that teaches snap, tray, and hint by letting the player do them |
| Platform | Every interaction specified twice — web and native — so the App Store build is a port, not a rewrite |

Three are expensive to reverse: **rotation in MVP** (touches piece state, snap maths, every gesture),
**full-fidelity resume** (dictates the save format and the worker boundary), and the
**tray-as-persistent-ordered-list model** (dictates that filters are lenses, not sorts).

**Deferred out of MVP by decision (§10):** leaderboard, profile & stats, achievements wall, album mode,
Duo. The daily hub ships without a leaderboard tab in v1 — the streak alone carries the habit.

**Piece count ladder for MVP: 50 · 100 · 150 · 200 · 250.** The brief's ladder up to 1000 is post-MVP.
Piece count is a weak difficulty dial past 250 — it adds time, not challenge (§15). Counts are targets;
**show the real computed number everywhere**, never the target.

---

# Build order

Following §17 exactly. Steps 1 and 2 are the whole risk; everything after is comparatively routine.

## Step 1 — The cutter and the renderer

Hardcoded photo, no UI at all. **This is foundation code, not a spike** — the original plan called
Phase 0 a throwaway; the design doc's build order does not.

### The cut (§04) — deterministic from a seed

The whole cut is reproducible from `(puzzleId, seed)`. That single property means a saved game is a few
hundred bytes rather than a few megabytes, and Duo later gets identical boards for free.

- [ ] **Grid.** Given aspect `a = W/H` and target `N`: start at `cols = round(sqrt(N·a))`,
      `rows = round(N/cols)`, then search ±2 in both directions for the pair minimising a weighted sum
      of count error and piece-aspect error. Reject anything with piece aspect outside **0.82–1.22**.
      A 3:2 photo at "200" lands on 17×12 = 204.
- [ ] **Jitter the lattice.** Build a `(cols+1) × (rows+1)` vertex lattice. Every interior vertex gets a
      random offset up to **±0.12 × piece size** from a **mulberry32** PRNG seeded on the puzzle id.
      Border vertices stay pinned so the outer frame is a clean rectangle. Without this every piece is
      interchangeable at a glance and the search stops being fun.
- [ ] **Edges.** Each interior edge is generated **once and shared** by the two pieces that meet on it —
      one gets it as drawn, the other as its exact reverse. That is what makes pieces physically
      interlock rather than merely appear to. Canonical cubic-bezier chain in normalised edge space
      `(0,0)→(1,0)`: knob at `t ≈ 0.5 ± 0.06`, neck width `0.20`, head radius `0.14`, protrusion
      `0.22 × edge length ± 10%`, polarity by seeded coin toss. Transform onto the real edge vector.
      Boundary edges are straight lines.
- [ ] **The cut-style interface.** The entire style system is one signature:
      `edgePath(a, b, polarity, rng) → Path2D`. Classic ships in MVP. Ribbon, Organic, and Geometric are
      later implementations of that same signature and touch nothing else. **Build the interface now**
      even though only one implementation exists.
- [ ] **Rasterise.** Each piece bitmap is its cell bounds expanded by max protrusion + 2px bleed. Draw
      the closed path, `source-in`, draw the source image at the right offset. **Bake the material in the
      same pass:** 1px inner highlight on the upper-left of the path at 8% white, 1px inner shadow on the
      lower-right at 22% black. Baking means the bevel is free at runtime and reads correctly at any zoom.
      Store as `ImageBitmap`, transferred back from the worker.
- [ ] **Emit the adjacency graph.** *The output that actually matters.* For every piece: its four
      neighbour ids (or null) and its exact target offset from each.
- [ ] Read EXIF orientation, or portrait photos slice sideways.
- [ ] HEIC from the iOS picker: `<input type="file">` usually hands back a converted JPEG — verify, and
      have a clear error path.

**Cost target:** 250 pieces from a 2560px image at 2× ≈ `250 × 190² × 4 bytes ≈ 36 MB` of bitmaps.
Cut time in the worker under **1.2s on an iPhone 12** — short enough that "cutting" is a beat of
anticipation, not a wait. **Show pieces materialising onto the mat as they arrive from the worker.**

### The renderer

- [ ] Five-layer stack per §03, behind `draw(scene, camera)`.
- [ ] Camera: pinch zoom, two-finger pan, double-tap to fit. Bounds **0.5× to 4×** with rubber-band.
- [ ] Spatial hash hit-testing → cached `Path2D` point-in-path.
- [ ] `touch-action: none` on the canvas or Safari steals pinch and pan.

**Gate:** 250 pieces cut and drawn on a real iPad, idle board drawing zero frames.

## Step 2 — Drag, snap, spring, audio

> §17: *"stop there for a week and tune it until it is the best snap anyone has felt, because if that
> fails nothing downstream saves it."* Budget this as real time. It will look like nothing on a
> burndown chart.

### State model (§05) — three machines, deliberately separate

Session lifecycle, pointer interaction, and piece membership. *"Conflating them is how jigsaw apps end
up with pieces stuck to fingers after a phone call comes in."*

```
Session:  idle → sourcing → cropping → configuring → cutting → playing ⇄ paused
          playing → completing → card → (newPuzzle | library)
          any → interrupted (backgrounded, low memory) → restoring → playing

Pointer:  idle · pressing · dragging · rotating · camera · settling · multiselect
```

`interrupted` is **a first-class state, not an error path.** On `visibilitychange` the timer stops, any
held piece is released to its current position, and a snapshot is written synchronously. Coming back
always lands on the board, never on a modal apologising.

```
Piece   { id, col, row, targetX, targetY, neighbours[4], bitmap, path,
          clusterId, x, y, rot }
Cluster { id, pieceIds[], x, y, rot, anchored, kind: 'loose'|'island'|'board' }
Board   { clusters: Map, unionFind, placedCount, edgeFrameComplete }
```

- [ ] Every piece belongs to exactly one cluster; a single loose piece is a cluster of one.
- [ ] **Cluster 0 is the board itself** — anchored, unrotatable, the only cluster with absolute
      coordinates. Everything else floats.
- [ ] Merging is union-find: the smaller cluster is transformed into the larger's frame and absorbed.
      **Merging with cluster 0 is what "placed" means.** Completion is
      `cluster0.pieceIds.length === N`. Nothing else.
- [ ] **Islands need almost no new code** — an island is a cluster with `kind:'island'`, a label, and a
      mat position. It drags, rotates, and snaps by identical rules. The only difference is
      presentational: a faint containing outline, a mono label chip, collapsible to that chip.

### Snap resolution, in order (§05)

- [ ] On release, gather every piece in the dragged cluster with a graph-neighbour outside it.
- [ ] For each pair, compute positional error between where the neighbour **is** and where it **should
      be** relative to the dragged piece, plus rotational error.
- [ ] Discard over tolerance: **0.18 / 0.28 / 0.40 × piece size** (Precise / Standard / Generous), and
      **12°** in Rotation mode. Tolerance is world-space, so zoom never changes difficulty.
- [ ] Lowest combined error wins. Ties break toward the cluster with more pieces, then toward cluster 0 —
      an ambiguous drop near the board prefers the board.
- [ ] **No survivor: the cluster stays exactly where it was dropped.** Dull tap, no penalty, no
      bounce-back. *Bounce-back is the single most infuriating pattern in this category — it discards
      the player's spatial intent.*

Snapping never asks "am I near my correct absolute position." It asks **"am I near where a graph-neighbour
says I should be."** That one choice is why free-floating islands work identically to placing on the
board frame, with no special-case code.

### Gestures (§05)

Strict priority arbitration:
- Two fingers **always** means camera — pinch-zoom, pan, and in Rotation mode twist to rotate the held
  piece if one exists, otherwise nothing.
- One finger on a piece means drag.
- One finger on empty mat means pan.
- **There is no tap-to-select-then-tap-to-place. Direct manipulation only** — the entire product promise
  is weight in the hand.
- [ ] `pressing`: 6px movement threshold, 120ms long-press timer. 1px focus ring only.
- [ ] `dragging`: scale **1.06**, shadow spread, **8pt above the finger, never under it**.
- [ ] `settling`: input accepted during it — you can grab the next piece before this one lands.
- [ ] Rotation: snaps to 15° visually, resolves to 90° on release. **Defaults OFF.**

### The snap, frame by frame (§09)

| Time | What happens |
|---|---|
| 0ms | Release. Candidate resolution runs — sub-millisecond, a graph lookup, not a search |
| 0–90ms | Spring integration to target, **inheriting release velocity**. Overshoot ~2px past the slot |
| ~8ms in | Transient plays. **Audio leads the visual settle slightly** — the ear is what sells contact |
| 90–140ms | Settle back. Scale 1.06 → 1.00. Shadow collapses from spread to a 1px contact edge |
| 100ms | Neighbouring placed pieces ripple 1px outward, staggered 20ms per ring, two rings max |
| 100–360ms | Static layer recomposites. Bloom mask grows, eased over 260ms so **light arrives after the click** |
| 140ms | Ready for the next piece |

- [ ] **Spring, not easing:** stiffness **520**, damping **26**, mass **1**, integrated per frame from
      release velocity — so a piece flicked at the slot arrives hot and overshoots, while a piece gently
      placed just settles. *That velocity inheritance is most of the perceived physicality, and it is
      exactly what a fixed cubic-bezier cannot give.* This reverses the original plan's fixed timings.
- [ ] **Reduced motion:** skip overshoot and ripple, keep the light bloom and audio, place in 120ms linear.
- [ ] **X-Ray focus:** placed pieces without a connecting edge drop to **35% contrast** for the duration
      of a drag; candidate sockets keep full contrast. Restores over 160ms on release.

### Audio (§08)

| Event | Sound | Pitch |
|---|---|---|
| pickup | Soft peel, 60ms, low velocity. Confirms the grab without commenting on it | fixed |
| snap | Three layers: 8ms ceramic transient, felt body for weight, 200ms small-room tail | ladder, transient only |
| invalid drop | Dull muted tap. Neutral, quiet, never a buzzer. Information, not judgement | fixed, resets ladder |
| group merge | A chord instead of a note, voiced wider as the cluster grows | by cluster size |
| edge frame done | Distinct "frame lock" — longer, lower resonance marking a structural milestone | fixed |
| hint fired | Soft rising swell peaking with the glow. Never a chime, or it reads as a penalty | fixed |
| completion | Sustained chord resolving to the tonic, then a shutter click as the card composes | tonic |
| ambient | Low bed per mat finish, ducked 4dB under every snap. Off in Classic, on in Zen | n/a |

- [ ] Pitch ladder walks a pentatonic scale **up seven steps and holds at the top.** Breaks on a wrong
      drop or eight idle seconds, resets to root. **Off entirely in Zen.**
- [ ] **Pitch-shift the transient layer only**, via playback rate. Body and 200ms tail stay at 1.0 —
      otherwise the room appears to shrink as you get faster.
- [ ] Four round-robin samples per layer, ±3% detune.
- [ ] Unlock the AudioContext on the **first deliberate tap of the first-run screen**; pre-decode every
      buffer during the cutting step.
- [ ] Duck the ambient bed 4dB for 300ms under each snap.
- [ ] Buses: master / SFX / ambient, independent.
- [ ] Document behaviour with the iPhone silent switch.

> *"A snap that arrives 80ms late is worse than no snap; latency is a design property here, not an
> engineering detail."*

**Gate (§08):** the snap must feel complete **with the device on silent and no vibration**. Tune the
visual settle and audio transient until that is true. Only then does anything get layered on top for
native. Hand it to someone without explanation and watch whether they smile.

## Step 3 — Tray and lenses

### Filters are lenses, never sorts (§06)

**The tray has one canonical order that never changes unless the player changes it.** Filters hide and
reveal within that order; they do not reflow it. Turn a filter off and every remaining piece is exactly
where you left it.

> *"Muscle memory — 'the dark green one is two rows down on the left' — is the main reason a 250-piece
> session survives a coffee break, and every competitor destroys it by re-sorting on each filter change."*

| Lens | Behaviour |
|---|---|
| All | The canonical order. Default, always one tap from any other lens |
| Edges | Straight-sided pieces. Tinted **and marked with a corner notch glyph** — colour is never the only signal |
| Corners | Four pieces. Trivial to implement, disproportionately loved, the natural first move |
| Colour | Six OKLab k-means bins plus a "mixed" bin, each labelled with a swatch **and a numeral** |
| **Region** | **The superpower.** Offered only above 1.5× zoom: pieces whose destination lies inside the current viewport. *This is what makes 250 pieces tractable on a phone* |
| Recent | Last twenty pieces you touched but did not place. Fixes the "I had it a second ago" moment |

- [ ] **Colour clustering, done honestly:** six bins, k-means **in OKLab** over each piece's mean colour,
      weighted so lightness contributes less than hue — otherwise a forest photo gives six shades of
      "dark" and the filter is useless. Pieces with high internal colour variance (straddling sky and
      roof) go into a **seventh "mixed" bin** rather than being forced into a lie. Computed once at cut
      time and cached.
- [ ] **Pinned shelf row** at the top of the tray, surviving every lens. Drag a piece there to say
      "I am working on this one."
- [ ] **Multi-select** by long-press; selected chips carry a numbered order badge. "Pull out" lifts them
      onto the mat as a labelled island, auto-arranged in a loose grid so they are immediately workable.
      *This is what makes a 250-piece board feel like a table rather than a scroll list.*
- [ ] **iPad landscape:** docked right, 300–380pt, resizable by dragging its inner edge, always visible.
- [ ] **iPhone portrait:** bottom sheet at three detents — peek (one row, ~96pt), half, full — with lens
      chips pinned to the sheet header so they are reachable one-handed. Dragging a piece out
      auto-collapses to peek and re-expands on release, so the mat is never obscured mid-drag.
- [ ] Virtualised piece chips.

## Step 4 — Hints and light

### One light system, four jobs (§07)

Progress bloom, hint glow, merge seam, and completion payoff are **the same renderer feature at different
intensities.** Implement once: a downsampled copy of the static layer, blurred, drawn back with
`globalCompositeOperation:'lighter'`, with a per-region intensity mask. Everything below is a value fed
into that mask.

| Job | Value |
|---|---|
| Progress bloom | Scales with completion, 0 → 0.9, spilling ~one piece-width beyond the assembled boundary. Grows continuously, so the room brightens as you work |
| Hint glow | Localised region mask at 0.55, breathing on a 1400ms cycle for two breaths |
| Merge seam | Thin, short-lived mask along the newly joined edge, 260ms, peak 0.7, feathered to nothing |
| Completion | Global mask ramps to 1.0 over 1200ms, holds three seconds, settles to 0.85 as the card composes |

### Hint tiers (§07)

- [ ] **Tier 1 — Warm.** Free, unlimited, **the default button behaviour.** Tap a loose piece, then the
      hint button: a 3×3-piece region breathes for 3s. Peak 0.55, **feathered over a piece-and-a-half so
      no exact slot is legible.** It answers "where do I look," which is the honest help.
- [ ] **Tier 2 — Guide** (costs 1). Exact slot outlines at 1px in accent; the held or selected piece
      translates 6px toward it and holds, as if magnetised, with a faint light trail. If the piece is in
      the tray, its chip leans instead.
- [ ] **Tier 3 — Place** (costs 2). Auto-place with the **full** snap treatment — same spring, same
      audio, same ripple. *Never a diminished version; a player who needed help still deserves the good part.*
- [ ] **In Zen every tier is free and the counter is simply absent** — not greyed out, not showing "∞".
      *The absence is the message.*
- [ ] Economy: 3 per puzzle in Classic, +1 per 10 minutes. Track `hintsUsed`. Mark 0-hint runs "clean".
      Never disqualify.

Hint glow timeline (§09):

| Time | What happens |
|---|---|
| 0ms | Tap registers. Counter decrements **only at tier 2+**, and animates so the cost is never a surprise |
| 0–160ms | Camera **eases** toward the region if off-screen. Never a hard cut — the player must keep their bearings |
| 160–860ms | Glow rises to 0.55 on the 3×3 mask, feathered a piece-and-a-half |
| 860–2260ms | Two breaths at 1400ms each, sine-eased between 0.35 and 0.55. **Breathing, not pulsing** — pulsing reads as an alarm |
| 2260–3000ms | Decay to zero. If the player places the piece mid-hint, **the glow converts into the snap bloom** rather than being cut off |

- [ ] **Group merge:** both cluster outlines flash once at 40% for 120ms, then the shared seam
      light-bleeds outward over 260ms as the chord plays.
- [ ] **Edge-frame completion** gets its own beat: the entire border traces once in accent light over
      600ms, clockwise from the top-left corner.

### Accent extraction (§13)

- [ ] Three dominant colours in OKLab → `--accent`, `--accent-bloom`, `--accent-tray`.
- [ ] **Extractor clamp — the difference between a bloom and a stain:** force `L` into **0.62–0.78** and
      `C` into **0.09–0.16** before use. A muddy photo yields a muddy hex, and a muddy hex on a near-black
      mat reads as dirt, not light.
- [ ] Enforce **minimum 25° hue separation** between accent and bloom, or the two roles become
      indistinguishable.
- [ ] Fallback `#6FA8FF` on failure, empty library, and first run.
- [ ] Keep a manual **"use neutral accent"** escape in settings. **Never let extraction block the start
      of play.**

### Assists (settings, not hints; never leaderboard-affecting)

- [ ] Ghost underlay 0–30%. Edge highlight. Snap tolerance selector. Large-piece mode.

## Step 5 — Setup, library, resume

- [ ] Photo import: file picker + drag-and-drop. Crop & frame with aspect selector, rotate, and a **live
      piece-grid overlay**.
- [ ] Puzzle setup: count ladder with **a rendered piece at actual size on this device** — "250" means
      nothing, a piece next to a thumb does. Mode select, rotation toggle (default off), assists,
      cutting progress.
- [ ] Library: in-progress cards whose **thumbnails show the actual current board, not the source photo**,
      with a % ring in the session accent. Empty state is an invitation, not an apology.
- [ ] Pause sheet: resume, reference image (full-bleed, tap to dismiss), restart confirm, settings, leave.
- [ ] **"Puzzle this again, harder"** — build it here, not later. It is nearly free and it is the cheapest
      repeat session in the product: same photo at the next count up skips every friction point in the
      funnel (§15).

### Save format (§14)

```
SessionSnapshot {
  puzzleId, seed, cols, rows, mode, assists, version,
  pieces: Float32Array [x, y, rot, clusterId] × N,   // packed, base64
  clusters: [{ id, kind, label, x, y, rot, collapsed }],
  camera: { x, y, zoom },
  tray: { order[], pinned[], lens, lensArg, scroll },
  timer: { elapsedMs, running:false }, hintsUsed, cleanRun
}
```

- [ ] ~6 KB for a 250-piece board — small enough to write on every placement without thinking about it.
      **Because the cut is seeded, no geometry and no images are stored**; the snapshot restores a board
      bit-for-bit on any device.
- [ ] IndexedDB, debounced **800ms**, plus a **synchronous write on `visibilitychange`**.
- [ ] Source photos live in IndexedDB as blobs. They upload to Supabase Storage only if the player signs
      in and opts into sync.
- [ ] Carry a `version` field from day one.

## Step 6 — Daily and streak

- [ ] Daily hub: today's puzzle, streak with freeze pips, month calendar of completions.
      **No leaderboard tab in v1** — it appears the day accounts exist.
- [ ] Same `(imageId, pieceCount, seed)` for everyone; resets 00:00 **local**. Store the user's timezone
      and compute the streak server-side against it.
- [ ] Streak logic in an Edge Function, not the client. One freeze earned per 7-day streak (auto-spends
      on a missed day), one manual repair per month. **Generous on purpose** — a broken streak is the #1
      churn event, and the flame never scolds.
- [ ] Daily puzzles pre-seeded months ahead. **A missing day must never break the hub.**

## Step 7 — First run (§16)

The guided twelve. *"Done wrong that is a tutorial wall; done right it is the best sixty seconds in the
product, because a 12-piece board with a beautiful photo is already the whole game."*

- [ ] Open on a curated 12-piece photo, already scattered. No copy but **"Drag a piece where you think it
      goes."** No account, no menu, no mode picker.
- [ ] First correct snap: full juice. **Nothing is explained; the sound and the light explain it.**
- [ ] At four placed, the tray slides in on its own carrying the remaining pieces, with one line:
      **"Pieces live here. Filter them."** The lens chips pulse once.
- [ ] At eight placed, if 20 seconds pass with no placement, the hint button glows and fires tier 1
      unprompted, once. *The player learns the hint exists by being rescued by it, not by reading about it.*
- [ ] On completion: the card, then **"Now use your own photo"** primary, **"Today's puzzle"** secondary.
- [ ] Skippable from a small "skip" at all times, never modal, and **it counts as a real completion on the
      collection wall.** *A tutorial the player is allowed to be proud of is not a tutorial.*
- [ ] Rotation never appears in the guided first puzzle.

## Step 8 — Completion payoff

- [ ] Bloom sequence → card composes. Puzzle Card (canvas → PNG): photo, time, piece count, date, mode,
      clean-run badge, and **quiet licence attribution for curated photos.**
- [ ] Display serif earns its keep here **and nowhere else on this screen.** No exclamation marks, no
      confetti — the lit photo is the reward.
- [ ] Share (Web Share API where present, else download the PNG), save, again-harder, new puzzle.
- [ ] Collection wall: completed puzzles as a growing mosaic. *"A possession — and people do not abandon
      possessions."*
- [ ] Suggest the next difficulty step on the card, in the moment of confidence.

## Step 9 — PWA and the iPad-grade pass

- [ ] PWA manifest, service worker caching shell + curated photos + audio. **Fully playable offline after
      first visit.**
- [ ] **Make "add to home screen" a real prompt after the second completion** — installed PWAs are evicted
      far less aggressively. Warn at 7 days idle.
- [ ] Performance pass against the §03 budget. Memory pass: profile a 250-piece session on **the worst
      device you can find, not the newest.** Cap source at 2560px, release the decoded source after cutting.
- [ ] Stage Manager works, but Split View gestures can steal a drag near screen edges — handle it.

**Gate:** a 250-piece puzzle at 60fps on iPad Safari, installed as a PWA, surviving a backgrounding.

---

## Supabase, when it arrives (§14)

**Play stays account-free forever.** Supabase enters only when the player touches something that
inherently needs identity — a streak they want across devices, or a leaderboard. The prompt at that
moment **says what it buys, not what it demands.**

| Table | Contents |
|---|---|
| `profiles` | Created only on sign-in. Display name, avatar, preferences. Never required to play |
| `puzzles` | Photo reference, seed, cols, rows, cut style, dominant colours, licence and attribution for curated images |
| `sessions` | One per attempt: puzzle, mode, assists, elapsed, hints used, clean-run flag, completed_at |
| `session_state` | The snapshot jsonb plus a format version. One row per active session, upserted on sync |
| `daily_puzzles` | Date-keyed curated photo and piece count. Pre-seeded months ahead |
| `scores` | Daily leaderboard rows. Hints used is a visible column, not a disqualifier. **Exists but stays unexposed until v1.1** |

All RLS, owner-scoped. Anonymous → authenticated upgrade carries local sessions up with it.

**Conflict rule for multi-device resume:** last-write-wins on `updated_at`, **except that the snapshot
with more placed pieces always wins.** *Losing progress is unforgivable; losing three loose-piece
positions is not.*

**Leaderboard submissions must be server-validated** when scores are exposed. An Edge Function checks
elapsed time against a server-recorded start, piece count, and a plausibility floor. Set `verified=false`
and quietly exclude implausible runs. Client-reported times alone will be cheated within a week.

**Privacy — do this now, not when someone asks.** Users upload personal photos. Store a downscaled
derivative only, never the original. Write a plain-language line in settings about what is stored, and
ship a "delete all my photos" action that actually purges Storage.

---

## The starter library (§15)

Fifty open-source photos are a design asset, not a content dump. Three rules:

1. **Curate for cuttability.** Reject any photo with more than ~25% near-uniform area (open sky, flat
   snow) at counts above 150 — or tag it "hard" so it is a badge of honour rather than a bad surprise.
2. **Browse by feeling, not folder.** Shelves like "wide and calm", "dense and busy", "one animal, close"
   beat "Landscape / Geography / Animals". The player is choosing a mood for the next forty minutes.
3. **Pre-compute everything at build time** — dominant colours, difficulty rating, recommended piece
   counts — so a curated photo opens instantly while an uploaded one takes a second.

Store licence and attribution alongside each image as data; surface it quietly on the completion card.
Source from Unsplash, Pexels, and public-domain museum collections, and **verify per-image licence rather
than trusting the platform default.** Getting this wrong is an App Store review problem, not just an
ethics one.

---

## Native path — Capacitor wrap

Decision revisited with real data after the PWA gate. Design doc §08 specifies every interaction twice so
this is a port, not a rewrite:

| Interaction | Web (Netlify, iOS Safari) | Native iOS / iPadOS |
|---|---|---|
| Snap feedback | Spring visual + three-layer audio. **Must feel complete on a silent device** | Same, plus medium impact haptic on the contact frame |
| Pickup | Lift, scale, shadow spread only | Light impact haptic added |
| Completion | Full bloom, chord, shutter | Heavy impact then success notification layered under the chord |
| Photo picking | File input + drag-and-drop. No album browsing, no Live Photos | PHPicker: albums, search, Live Photo stills, no permission prompt |
| Sharing | Web Share API where present, else download the card PNG | Native share sheet, save to Photos, AirDrop, Messages variant |
| Audio | Web Audio, unlocked on first tap, **muted by the hardware silent switch** | AVAudioEngine playback category — survives the silent switch if opted in |
| Resume | IndexedDB; **iOS Safari may evict after ~7 days of no visits** | On-device store + iCloud key-value backup. Never evicted |
| Offline | Service worker caches shell, photos, audio | Everything bundled; offline is the default state |
| Multitasking | Resize handled; Split View can steal a drag near edges | Proper scene support, drag-and-drop a photo in from Files or Photos |

> **The design rule that falls out of this table: no feedback may depend on a channel the web build lacks.
> Haptics are an amplifier, never the carrier.**

> **Review risk:** Apple rejects thin webview wrappers. Native haptics, native photo picker, notifications,
> and IAP are what make this a real app rather than a bookmark. Ship all four in the first native build.

---

## Post-MVP

Cut styles (Ribbon, Organic, Geometric — all just new `edgePath` implementations) → Fog → Rush → Album →
Blind → leaderboard exposure → profile & stats → achievements wall → Duo (Realtime) → whimsy pieces →
piece counts above 250 (the point at which a WebGL backend behind `draw(scene, camera)` earns its cost).

---

## Standing risks (§17)

| Risk | Response |
|---|---|
| **The snap can fail** | The entire thesis rests on one 140ms interaction. Prototype it first, alone, and be willing to spend a week tuning something that looks like nothing on a burndown chart |
| **iOS Safari storage eviction** | A player who loses a 250-piece board in progress will not return. Warn at 7 days idle; make "add to home screen" a real prompt after the second completion |
| **Rotation raises the floor** | Right for MVP, but it must **default OFF**, be introduced by suggestion after a clean run, and never appear in the guided first puzzle |
| **Memory at 250 on old phones** | Bitmaps + two canvases + the source blob can push an iPhone 11 into a tab reload. Cap source at 2560px, release the decoded source after cutting, test on the worst device you can find |
| **Colour extraction embarrassment** | ~1 photo in 20 produces a broken-looking accent. The clamp handles most; keep a manual neutral-accent escape and never let extraction block play |
| **Curated photo licensing** | Fifty images sourced quickly is fifty licence obligations. Verify per-image, store attribution as data, display it on the card |

**Health metric to instrument early:** *median seconds between placements at 250 pieces.* It predicts
churn before retention numbers do. If a player is scrolling instead of searching, the lenses have failed
and the region lens is the specific answer (§15).

---

## Invariants for `CLAUDE.md`

- The board **never** re-renders through React.
- Every piece placement goes through the union-find.
- Snap resolution asks a **graph neighbour**, never an absolute board position.
- Snap tolerance is always **world-space**.
- The cut is **deterministic from a seed** — never store geometry or piece images.
- Cutting happens in a **worker**. The main thread never blocks.
- Piece bitmaps are rasterised **once**; zoom scales them.
- Tray filters are **lenses**, never sorts. The canonical order never reflows.
- No `localStorage` for session state — IndexedDB only.
- **No feedback may depend on a channel the web build lacks.**
- Colour is **never** the only signal.
- There is **no lose state** anywhere in this app, and no bounce-back on a failed drop.

## Working notes

- Keep this file at repo root and check items off as you go.
- Test on real hardware every step. The iPad Safari behaviours here are not reproducible in Chrome devtools.
- Steps 1 and 2 carry essentially all the risk. Do not let schedule pressure compress step 2 — it is the
  product.
