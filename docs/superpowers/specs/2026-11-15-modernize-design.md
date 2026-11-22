# Modernize: web and iOS — design

**Status:** proposal, awaiting owner approval. Nothing under `src/` changes until the owner rules on
§9 (conflicts) and §3 (type pairing).
**Brief:** `docs/superpowers/prompts/2026-11-15-fable-modernize-web-and-ios.md`.
**Comps:** `docs/superpowers/specs/assets/2026-11-15-modernize/` — `comps.html` is live (run
`npm run dev`, open `/docs/superpowers/specs/assets/2026-11-15-modernize/comps.html`); the `.webp`
files are stills of the same page. Every piece, chip, and cut line in the comps is the real cutter on
the real curated photos; streak and counts are sample data.

## 1. Intent

The app works and has a coherent system (§13 tokens, the 2026-10-20 kit). What it lacks is
presence: Today reads as a settings list with a photo in it, the tray reads as a form, and the
first second of every puzzle — the cut — is invisible, a spinner where the product's best moment
should be. The goal is that a player opening the app for the third time feels the same pull a good
photo book has, without the board or the tray paying for it in frames.

**Goals**
- Today leads with the photo. One primary action, in the daily photo's own accent.
- The tray looks like part of the board's world: pills, chips without cell frames, a recessed shelf,
  one header row. Motion that follows the finger.
- The cut becomes a visible, short, skippable moment: the photo is traced, lifts, and falls into the
  tray. Never slower to first touch than today.
- One type system with clear roles; fewer 12px lines; serif where it names a thing.
- Fix the 402pt first-run clip (§7) before any of the above.

**Non-goals.** New features, new modes, any change to the snap, the spring, the cut geometry, or
the hard-number table. No change to persistence shape.

**Anti-goals** (would be a failure even if it shipped working): the board or tray re-rendering
through React during any of this; an infinite animation on the play screen; motion that delays
first touch; a Today that feels like a feed (badges, counts competing for attention); a look that
only works on the curated photos and falls apart on a user's dim indoor shot.

## 2. Direction: gallery at night

The mat is a dark room; the photo is the only lit thing in it. Chrome is quiet ink on raised felt,
and colour comes from exactly one place: the photo's extracted accent (`extractAccent` for a cut
puzzle; the curated manifest's precomputed `dominant` through `clampToAccentRange` +
`ensureContrast` for Today, before anything is cut). One primary per screen, filled in that accent.
Everything else is outline, ghost, or text.

What changes and what doesn't:

| Keeps | Changes |
|---|---|
| §13 colour tokens, radii, spacing scale | Buttons become pills (radius 999) — see conflict C8 |
| ease-standard 120/200/320 on chrome | Finger-driven surfaces (sheet, drift) get a critically damped spring — C1 |
| Inter Tight / Plex Mono / Instrument Serif | Their roles (§3) |
| Lucide-style 1.75 stroke icons in `kit/Icon` | Icons inside pills, never icon-only primaries |
| 44pt floor everywhere | Hint becomes 52pt with a numeral badge (specced 2026-10-20, not yet built) |

## 3. Typography — owner decision

Comparison: `type.webp`, and live in the comps with the pairing switch at the top of the page.

| | A — as shipped | **B — retuned roles (recommended)** | C — Newsreader display |
|---|---|---|---|
| Families | Inter Tight, Plex Mono, Instrument Serif | same | Inter Tight, Plex Mono, **Newsreader** |
| Mono used for | every count, time, eyebrow, subline | eyebrows (tracked caps) and *ticking* numerals only (timer, live `n / N`) | as B |
| Metadata ("62% · 150 pieces") | Plex Mono 12 | Inter Tight 14, `tabular-nums` | as B |
| Serif used for | Today title, card | + puzzle names (t4 20) in rail, top bar, wall | as B, softer optical serif |
| Default body | 14 | 16 | 16 |
| Bundle delta | 0 | 0 (could drop Plex Mono 500: −14.9 KB) | +1.4 KB (Newsreader 400 latin 22.5 KB vs Instrument Serif 21.0 KB) |

Why B: today 87 of ~110 text uses are 12 or 14px, and mono sublines are what wrap on a 402pt phone
(Plex Mono is ~18% wider than Inter Tight at the same size). B removes the wraps, raises the floor
to 14 for anything a player reads, and keeps mono where its meaning — "this number is ticking" —
is true. It narrows §13's "counts in mono" (C7). C is a taste call: Newsreader is warmer and reads
better at 20px on a phone; Instrument Serif is more distinctive at 40+. I would not change families
without seeing both on the owner's own iPad.

All fonts stay self-hosted through `@fontsource` (the comps page loads Newsreader from a CDN for
comparison only; the app never will).

Off-scale strays fixed in phase a regardless of pairing: `tracking-wide` (PhotoPicker:134),
`tracking-[0.08em]` (Badge — becomes the eyebrow token), `font-medium` (Tray:186).

## 4. Today

Stills: `today-phones.webp` (402 × 874pt), `today-ipad.webp` (1180 × 820pt landscape, at 62%).

**Structure, top to bottom (phone):** wordmark + date + settings; **hero** (370 × 380, radius 22)
with the daily photo full-bleed and the copy block on a scrim; **Keep going** rail (200 × 150
thumbnails, horizontal scroll, "All puzzles" link); **streak** and **collection** as two compact
cards side by side; install row last, web only. Tab bar unchanged in function.

**Hero states**

| State | Photo | Eyebrow | Title | Line | Action |
|---|---|---|---|---|---|
| Not played | full photo | `DAILY · 200 PIECES` | photo name, serif 40 | "3 hints included · new puzzle in 9h 41m" | **Start** (accent fill) |
| In progress | the live board: unlit photo + lit placed pieces + bloom | same | same | "76 of 200 placed" | **Keep going** + ring + % |
| Done | full photo | `DAILY · DONE` | same | "200 pieces in 24:18 · clean run" | **See your card** (outline) + "Done today" badge with ✓ (never colour alone) |
| First visit / offline | full photo | same | same | same as not played | Start; offline row inline below the hero, never over a button |

In progress opens the same library entry `daily-YYYY-MM-DD` — no daily-specific save path. Done
opens the card from `completions`; the daily is never in the library once finished.

**Scrim.** The copy sits on a gradient owned by the copy block: `rgb(8 9 11 / 0.82)` from the
bottom to the eyebrow's line, fading to 0 over the last 64px. Measured over pure white: eyebrow
(`--ink-secondary`) 6.7:1; `--ink-muted` would be 3.9:1, so muted ink never goes on the hero. 0.70
fails (4.25:1). The alpha is a named constant with a unit test that computes the contrast.

**Thumbnails** (rail, hero in progress): the photo unlit (`brightness(.2) saturate(.5)`) with the
placed pieces lit at full and the progress bloom on top. Today an early board is a black rectangle
because only placed pieces are drawn. This is the existing `captureThumbnail` path plus an unlit
underlay; conflict C3.

**Streak card:** numeral (serif 40), "day streak", one line ("Today keeps it going." / "Played
today. 1 freeze saved."), seven pips with weekday letters; a freeze is a dashed pip with a snowflake
glyph, today a ring — shape carries the meaning, not colour. Zero is "0" with "Start one today", no
scolding.

**Collection card:** 2 × 4 mosaic of the most recent completions (from `completions` only), "14
finished", "2,150 pieces placed" (summed from completions). Empty: outlined tile slots and
"Finished puzzles hang here."

**First visit after the guided twelve:** no rail; an invitation card ("Any photo works. Start with
one you like looking at." + New puzzle) instead of an empty state.

**iPad landscape:** hero 640 × 392 left; streak and collection stacked in a right column; rail full
width below at 200 × 132; the tab bar becomes a floating pill bar bottom-centre.

## 5. Play chrome and tray

Stills: `tray-phones.webp` (default detent, select mode), `tray-ipad.webp` (dock).

**Top bar:** puzzle name (serif t4 20) with `n / N` in mono below; Fit and Pause as 44pt ghost
icon buttons; a 3px progress line under the bar in the accent, width transition 320ms
ease-standard on each placement (React reads the summary; this is a CSS transition on one style
property, not a per-frame update).

**Hint:** 52pt round, lightbulb glyph, numeral badge. On spend the badge does one 200ms scale
(1 → 1.15 → 1) and the number changes. No idle animation.

**Board framing (phone):** fit the board to the area *above the sheet at its current detent*, not
the full viewport. Today the board centres on the full height and the sheet covers its lower third,
and the Hint pill sits on the frame's corner. Re-fit on detent change uses the camera's existing
eased fit (320ms), never per-frame during the sheet drag.

**Tray, one header row:** `TRAY · 66 LOOSE` eyebrow left; a 44pt reference thumbnail button right
(replaces the "Reference photo · Hide" row — tap shows the reference panel as today). Lenses as
36pt-tall pills with mono counts; the active lens filled with `accent-tray` at 22% and a 1px
accent ring; colour bins keep swatch **and** numeral. Region enables above 1.5× zoom as now.

**Chips:** no cell frame — the piece silhouette on the felt, with its baked bevel and one shared
soft shadow baked into the chip bitmap at cut time. Edge pieces keep the corner bracket glyph.
Selected: 2px accent ring around the cell plus an order numeral badge (1, 2, 3…) top-left.
Press: CSS `scale(1.06)` over 120ms on `:active`/a data attribute, never React state.

**Shelf (select mode):** a recessed well (`--mat-deep`, inset shadow) above the grid, holding pinned
chips; the selection bar below with Pin, Pull out, Cancel.

**iPad dock:** 340pt right column, same header and lenses; top bar's right edge stops at the dock.

### Motion (all numbers)

| Element | Motion |
|---|---|
| Sheet drag | follows the finger 1:1; past the top/bottom detent, rubber band at 0.35× |
| Sheet release | projected height = height + v × 0.18s; nearest detent; skip more than one detent only if \|v\| > 1800 px/s |
| Sheet settle | spring k 380, d 39, m 1 (ζ ≈ 1, no overshoot), seeded with release velocity — C1 |
| Sheet, reduced motion | 120ms ease-standard to the detent |
| Chip press | scale 1.06, 120ms ease-standard |
| Drag-out handoff | the canvas lift starts at chip size and grows to 1.06 over 140ms, 8pt above the finger (the hard-number lift, unchanged) |
| Return to tray | the piece shrinks toward its chip cell over 200ms ease-standard, then the chip fades in over 120ms. This is the piece going home, not a bounce-back: it only happens when the player drops on the tray |
| Lens change | grid cross-fade 120ms; canonical order never reflows |
| Progress line | width, 320ms ease-standard |
| Tab switch | outgoing fades 120ms, incoming fades + rises 8pt over 200ms |
| Push into setup | 24px slide + fade, 320ms; back reverses |

## 6. The cut animation

Live player and stills: `cut-players.webp`, `cut-frames.webp` (phone, 150 pieces),
`cut-frames-ipad.webp` (dock). The player in `comps.html` can scrub, slow to ¼, simulate a 2.4s
worker, switch to reduced motion, and switch destination (tray vs the guided twelve's scatter).

### Storyboard (phone, 150 pieces, fast worker)

| t (ms) | Frame |
|---|---|
| 0–180 | Photo arrives already framed in the board rect, scale 0.985 → 1, opacity 0 → 1. The empty frame hairline is under it. |
| 120–620 | **Sweep.** Cut lines trace down the photo row by row behind a slightly diagonal front (slope 0.12). Fresh lines glow in `accentBloom` (2.2px stroke at α .5 + 1.1px crisp at α .6, additive), then settle to a hairline at α .38. A row's lines draw only once that row's pieces have arrived from the worker; the sweep never outruns the cut. |
| 380–700 | The sheet rises to its default detent (ease-standard 320). |
| 560–800 | **Lift.** Row by row, pieces swap from the photo to their own bitmaps and rise: scale 1.045, 3pt up, 160ms each, no earlier than 120ms after their row's lines. The gaps that open are the mat. |
| lift + 100 | **Drift.** Each piece arcs along a quadratic toward its chip's cell on a critically damped spring (k 210, ζ 1), 380ms, staggered 120ms across columns. It fades as it passes under the sheet lip (u .72–.97); its chip fades in where it lands (d .7–1). |
| ≤ 1400 | **Rest.** Tray grid fully present, board empty, every animation source retired. The board is idle and draws nothing. |

Ceiling: `max(1400, cutMs + 500)`. If the worker is slow the whole timeline stretches to follow
arrival; it never waits on itself.

**The guided twelve:** same sweep and lift; the drift goes to the centred scatter on the mat
(§7's fix) instead of the tray, which mounts at four placed as §16 says.

**Reduced motion:** photo 0–120, all lines at once 120–240, glow decays to 520, cross-fade from
photo to the rest state 420–620. No travel.

**Rules:** tap anywhere skips to rest. Never plays on restore — a saved puzzle opens at rest.
Input is live from the first frame a piece is at rest in the tray; the intro never blocks a
gesture on a piece that has landed. Time to first touch is unchanged: the worker is the critical
path and the animation follows it.

### Implementation shape

- `src/render/cut-intro.ts`: pure timeline maths (schedule from arrival times, per-piece state at
  t). DOM-free, unit-tested: monotonic, never ahead of arrival, ends by ceiling, RM path ≤ 620ms.
- The downscaled photo is kept as an `ImageBitmap` on the main thread before the source is
  transferred to the worker, and released at rest.
- Line layers are built incrementally per arriving batch into one offscreen canvas (glow as a
  wider low-alpha stroke — no per-frame `filter: blur`). No per-piece shadows during drift.
- Pieces disappear behind the sheet lip / dock edge; the tray grid does not animate per chip in
  DOM. React sees one summary field, `introPhase: 'cutting' | 'landing' | 'rest'` — two flips per
  puzzle. The tray mounts its grid at `landing` with a single opacity transition.
- The animation is a render source that retires itself; `invariants.spec` idle-draws-nothing holds
  after rest.
- **Audio:** per row, a soft filtered-noise grain (bandpass ~2.4–4 kHz, 18ms, low gain, rising
  slightly across rows) and the existing felt settle from the bank at rest. Silent device loses
  nothing — the sweep carries it visually.
- **Haptics (native only):** light impact per row, ≥ 90ms apart, at most 8. An amplifier only.

## 7. The 402pt first-run clip (PR 0, first)

**Symptom:** on a 402pt-wide phone, the guided twelve's board frame and scattered pieces are cut
off the left edge, web and iOS; Fit doesn't recover. Baseline: `baseline-phone-firstrun-402.webp`.

**Root cause.** `PlayRuntime.build()`'s `firstRunScatter` lays the twelve pieces out left-anchored
at x = 0 with `perRow = ceil(sqrt(n × 1.6))` = 5, so the loose content is ~7.2 world units wide
next to a 3-column board. `frameContent()` and `CameraControls.fit()` frame `contentBounds`, but
both clamp zoom to ≥ 0.5× the board-fit scale (`clampZoom`, the hard-number zoom floor). At 402pt
the content can't fit inside that floor, so it is clipped symmetrically about the *content* centre
— and the board frame, at the content's left edge, goes off-screen. Fit uses the same clamp, so it
lands in the same place.

**Fix.**
1. Scatter centred under the board and wrapped to the board's width (`perRow = max(cols, 3)`), so
   the content is never much wider than the board.
2. When the zoom clamp bites, centre on the board frame rather than the content, so the frame is
   never the thing clipped.
3. No change to the zoom floor or any hard number.

**Test:** an `@phone` spec at 402 × 874 asserting the frame rect and the bounds of every loose
piece are inside the viewport, before and after Fit. Needs two dev-only hook methods on
`__tessera`: `frameRect()` and `looseBounds()` (screen space).

## 8. Remaining phase-3 surfaces (phase e)

Daily hub, completion card, collection wall, the first-run overlay, upload and HEIC errors, and
the Settings sheet get the same system: serif names, pill primaries in the accent, metadata in
Inter Tight with tabular numerals, scrims measured. Known fix: the calendar's numerals are 2.4:1
on felt — raise to `--ink-secondary`. These get their own comps at the start of phase e, approved
before that phase's code.

## 9. Conflicts with the design doc — owner rulings needed

I don't edit the design doc. Each of these needs a ruling (and, where approved, a doc change by
the owner) before the phase that depends on it.

| # | Design doc says | Proposal | Phase |
|---|---|---|---|
| C1 | §13 `--ease-standard`: "All UI motion"; spring-snap "never used on chrome" | Sheet settle and cut drift use a critically damped spring seeded with velocity (no overshoot). Snap spring untouched. | c, d |
| C2 | §13 `--type-display`: "Never in chrome" | Serif for titles and puzzle names (top bar, rail, wall); never for controls, labels, or data | a |
| C3 | §11 thumbnails "show the actual current board" | Same board, plus the photo unlit underneath so an early board isn't black | b |
| C4 | Hint control "Hint · 3" | 52pt lightbulb with numeral badge (specced in the 2026-10-20 modern-look spec, never built) | c |
| C5 | §04 cut budget 1.2s | Budget unchanged; the *visual* rest lands at ~1.4s (≤ cutMs + 500). First touch is not delayed. | d |
| C6 | §07 bloom is the only light | Cut lines drawn as additive accent strokes during the intro only | d |
| C7 | §13 `--type-data`: "timers, counts, times" | Pairing B: mono for ticking numerals and eyebrows; static counts in Inter Tight `tnum` (or pairing C) | a |
| C8 | DESIGN.md buttons radius-md | Pill buttons (radius 999) for primaries and lenses | a |

## 10. Approaches considered

1. **Token-level refresh only** — retune type, colours, radii; leave layouts. Cheap and safe, but
   leaves Today as a list and the cut invisible, which is most of what the brief asks for.
2. **Recompose surfaces on the existing system (chosen).** Keep §13 tokens and the kit; rebuild
   Today, the tray header and chips, and add the cut intro as a render source. Each phase is its own
   PR and the invariants hold throughout.
3. **New visual world** (e.g. a light gallery theme, new families). Bigger payoff in screenshots,
   but discards a coherent system the owner approved last month and touches every surface at
   once — a big-bang PR against a browser gate is the wrong shape.

## 11. Phasing

Each is its own PR into main from `claude/modernize-5e3d27` (or a branch off it), in order.

| PR | Scope | Gate |
|---|---|---|
| 0 | §7 clip fix + `@phone` 402 test + hook methods | smoke, `test:browser` |
| a | Typography roles (per ruling), off-scale strays, scrim constant + test, motion tokens, pill buttons | smoke, `test:browser`, `:full` |
| b | Today (+ extract `Shell.tsx` from `App.tsx`), thumbnails with unlit underlay, streak/collection cards | smoke, `test:browser`, `:full` |
| c | Top bar, hint, board framing above the sheet, tray look and motion (+ extract `PlayScreen`) | as above; `invariants.spec` must stay green |
| d | Cut intro | as above |
| e | Transitions, phase-3 surfaces (own comps first) | as above |

### Tests added along the way

- PR 0: `@phone` 402 frame and loose bounds in viewport, before and after Fit.
- a: scrim contrast constant (unit).
- b: Today states (not played, in progress, done, first visit) render the right primary.
- c: **a piece dragged by hand onto its slot** (the gap from the 2026-11-15 test review — today no
  test does this); tray mutation count during sheet drag stays at the invariant's bound.
- d: intro retires (idle by the ceiling), skip on tap, never on restore, RM duration, tray mutation
  count during the intro ≤ the phase flips; `cut-intro.ts` unit tests.
- Known flake carried from the review: the load-sensitive first-run test — fix the wait, don't
  retry it.

### Owner checks on real hardware, per PR

- 0: guided twelve on the iPhone, portrait; Fit.
- a: read Today and the card at arm's length on the phone; compare pairings on the iPad.
- b: the hero on three dailies (one pale, one dark, one saturated); scrim legibility outdoors.
- c: sheet flick feel on iPad and iPhone; drag-out from the tray and drop back; 250 pieces at
  60fps while dragging a 20-piece island (unchanged budget).
- d: the intro on an iPhone 12-class device at 150 and 250 pieces; skip by tap; reduced motion.
- e: each surface once, VoiceOver pass on the card and wall.

## 12. Left to the builder

Exact copy beyond what's above; the icon for the reference button (thumbnail, not a glyph); the
iPad portrait layout (phone structure at wider gutters, rail at 200 × 150); whether the unlit
underlay is drawn at capture time or composited at display time (capture time is simpler; pick by
what keeps the thumbnail write under its current budget).

## 13. Also noticed

- `PRODUCT.md`'s `## Platform` value isn't one the design tooling recognises (web / ios /
  android / adaptive). Not touched.
- The `Hint` pill overlapping the board's corner on a phone looks like a regression of the
  modern-look spec's B2; it is folded into phase c's board framing.
