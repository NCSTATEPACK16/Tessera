# Tessera v2 — redesign, beta, and monetisation stance

**Date:** 2026-10-18 · **Status:** awaiting approval · **Amends:** `docs/Tessera Design Doc.dc.html`
(§ Form factors, Screen inventory, Component inventory, Decisions). Where this spec and the design
doc disagree after approval, the design doc is updated to match — it stays the source of truth.

Decisions here came out of a two-round grilling session (Q1–Q21). Baseline screenshots of v1 at
iPhone (390×844), iPad portrait (820×1180) and iPad landscape (1180×820) are in
[`assets/v2-baseline/`](assets/v2-baseline/), captured from tesserapuzzle.netlify.app.

---

## 1. What v2 is, and is not

v2 is a layout and flow revision of the shipping app plus the measurement and native shell needed
for a public beta. It is **not** a new engine, a new mode, or a monetisation build.

| Settled | Decision |
|---|---|
| Ads | **None.** See §6. |
| Monetisation in the beta | None. IAP (photo packs, cut styles) is the post-beta path. |
| Native path | Capacitor (existing `native/ios-capacitor-shell`), universal iPhone + iPad. |
| Beta channel | Web soft launch, then a TestFlight public link posted to Reddit. |
| Beta goal | Retention + qualitative feedback. Go/no-go in §8. |
| morluto/rea | Not used to build v2. It is a reverse-engineering toolkit; at most it audits our own build for stray SDKs before review. |

---

## 2. Baseline findings (v1, measured)

| # | Finding | Where | Severity |
|---|---|---|---|
| B1 | The "ready to play offline" banner (`PwaBanner`, fixed bottom, z-60) sits on top of **Choose this photo** on iPhone. The first tap of the funnel is blocked until it is dismissed. | `iphone-02-picker` | High |
| B2 | iPhone play at the default half detent: the board frame gets ~16% of the screen height, and the Hint pill overlaps the frame's corner. | `iphone-05-play` | High |
| B3 | iPad portrait docks the tray at 768pt+, so the 340pt dock takes ~41% of the width. | `ipad-portrait-05-play` | Medium |
| B4 | Setup's **Start cutting** is below the fold on iPhone — assists push it down. | `iphone-04-setup` | Medium |
| B5 | Picker header buttons wrap ("Today's / puzzle") on iPhone. | `iphone-02-picker` | Low |
| B6 | After skipping the first run and starting a 150-piece puzzle, Home's **Continue** card read **0 / 12**. Possibly the skipped tutorial board persisted as a library item. **Unverified** — investigate in slice 2 before fixing. | `iphone-06-home-returning` | Medium if real |
| B7 | Home's daily hero caption is low-contrast grey over the photo. | `iphone-06-home-returning` | Low |

The funnel today is **Home CTA → picker (select + "Choose this photo") → crop ("Use this photo") →
setup ("Start cutting") → play**: four screens, five taps at minimum.

---

## 3. Navigation

Three tabs, per HIG (tabs are peer sections, never actions):

| Tab | Contents | Nav bar |
|---|---|---|
| **Today** | Daily hero card → daily hub · Continue card (most recent in-progress) · primary **New puzzle** button | Title "Tessera" · gear → Settings sheet |
| **Puzzles** | The library (in-progress only — completions live on the wall) | **+** → New puzzle |
| **Collection** | The wall | — |

- How-to is not a tab: the guided twelve teaches, and Settings gets a "How to play" row.
- The tab bar is **hidden** in setup, play, the first run, and the completion card.
- iPhone: bottom tab bar, 49pt + `safe-area-inset-bottom`, icon + label, 44pt targets.
- iPad (≥ 768pt wide): tabs move to a centred floating bar at the top (iPadOS 18 pattern).
- First run is unchanged: a fresh profile goes to the guided twelve, never to Today.

**Tab bar states:** rest · selected (accent fill on icon, label `--ink-primary`) · badge (Today, when
the daily is not yet played — a dot, never a number) · hidden.

**Invariant check:** play is mounted *outside* the tab tree. Switching tabs never touches
`PlayRuntime`; the board-never-renders-through-React invariant is unaffected.

---

## 4. Funnel: three steps

**Photo → Setup → Play.** Three taps from Today: **New puzzle** → *a photo* → **Start**.

### Step 1 — Photo

- Segmented control: **Curated** · **Your photos**. Native: "Your photos" opens PHPicker
  (`@capacitor/camera`); web: the file input.
- **Tapping a photo selects it and advances.** The separate "Choose this photo" confirm is removed.
- States: curated (default) · loading (skeleton tiles) · unreadable file · too-large file ·
  picker cancelled (stay on step 1, no error).

### Step 2 — Setup (crop folded in)

Layout, iPhone portrait, top to bottom:

| Region | Share of height | Contents |
|---|---|---|
| Nav | ~7% | Back · "New puzzle" |
| Crop canvas | ~48% | Photo, auto centre-cropped to the chosen aspect, **live piece-grid overlay** that redraws as the count changes. Pinch to zoom, drag to reposition. Low-resolution warning inline. |
| Controls | ~33% | Piece count ladder (50/100/150/200/250) · Mode (Classic / Zen) · **More options** disclosure (Rotation, aspect, assists) — closed by default |
| Start | ~12%, sticky | Primary **Start**, full width, in the thumb zone, always above the fold |

iPad: crop canvas left (~60% width), controls right, Start pinned bottom-right.

- The puzzle id is minted on **Start** (it moves from `PhotoCrop`'s confirm). The browser suite's
  `randomUUID` stub in `BoardPage.open()` still applies.
- States: default fit · repositioned · aspect changed · low-resolution warning · More options open ·
  cutting progress (Start becomes a progress bar; cancel returns to step 2 intact).

### Step 3 — Play

As §5.

---

## 5. Play screen

### 5.1 Chrome

Keep v1's floating top bar. **No Back** (leaving lives in the Pause sheet) and **no visible timer**
(`elapsedMs` is still recorded for the card).

| Component | States |
|---|---|
| Top bar (floating, overlays board) | Cutting (ring shows cut progress) · playing (ring = % placed, `placed / total`) · complete (hidden) |
| Fit | rest · disabled at fit |
| Pause | rest → Pause sheet |
| **Hint pill** | `Hint · 3` (Classic / Daily) · `Hint` (Zen, no count) · `Hint · 0` dimmed but still tappable for tier 1 · no target (disabled) · counting down (animates on spend) |

**Hint count, no per-frame updates.** `hintsAvailable(elapsedMs, mode)` grows by one every ten
minutes. The count is published on `RuntimeSummary` as `hintsLeft` and refreshed by **one scheduled
timeout at the next accrual boundary**, plus on every spend — never from the frame loop. Otherwise
the summary becomes a per-tick re-render channel.

### 5.2 iPhone portrait — screen real estate

| | Default | While dragging (peek) | Tray full |
|---|---|---|---|
| Top chrome (overlay) | ~6% | ~6% | ~6% |
| Board area | **~59%** (from ~44%) | **~89%** | ~12% |
| Tray sheet | **~35%** (from 50%) | ~11% (96pt) | 88% |

- Default detent changes from **half (50%) → a new default of 35%**. Half and full are kept.
  Detents become **peek · default (35%) · half (50%) · full (88%)** — the sheet snaps to the nearest one.
- The board **fits to the area above the sheet** (fixes B2). The Hint pill sits 16pt above the sheet
  and never over the frame at fit.
- Thumb reach: everything actionable — lenses, chips, Hint, Pause sheet actions — is in the bottom
  ~40%. The top bar is information plus two secondary buttons.

### 5.3 iPad — screen real estate

| | Landscape (≥ 1024pt wide) | Portrait |
|---|---|---|
| Tray | Docked, 300–380pt (~27% at 1180) | Bottom sheet, default 35% |
| Board | ~73% of width | ~59% of height |

- `DOCK_QUERY` becomes `(orientation: landscape) and (min-width: 1024px)` (fixes B3).
- New setting **Tray side: Left / Right** (default right). The two-handed iPad grip puts one thumb on
  the tray and one on the board; left-handed players get the mirror. Hint follows to the opposite
  bottom corner. Padding uses `safe-area-inset-left` when docked left.

### 5.4 Overlays during play

`PwaBanner` never renders during play, setup, or the first run (fixes B1). On Today it renders
**inline** as a dismissible row under the Continue card, never `position: fixed` over a CTA.

---

## 6. Ads: the strategy is none

The locked brief rules ads out explicitly ("no ad slot", "never sell hints in a way that makes the
game feel gated", reject Magic Jigsaw's "ad-cluttered chrome"). The redesign brief's ad model was
weighed against the app as built:

| Proposed placement | Why it fails here |
|---|---|
| Rewarded video to unlock a hint | Tier 1 is free and unlimited; Zen hints are unlimited. It sells relief from frustration — the exact thing the brief forbids. |
| Banner in the safe area outside the grid | On iPhone that space *is* the tray and the thumb zone (§5.2). A 50pt banner costs ~6% of the board. |
| Interstitial between completions | Lands on the Puzzle Card — the payoff — and breaks the wind-down tone. |

**Beta:** no ads, no IAP, no tracking SDKs. No App Tracking Transparency prompt.

**Post-beta path (if go, §8):** IAP — photo packs and cut styles, plus a one-time unlock.

**Fallback, recorded and not approved:** if IAP conversion fails, ads only on off-board surfaces:
a single opt-in rewarded video on the daily hub that grants a streak freeze, and a non-personalised
banner on Puzzles/Collection only. Never during setup or play, never on the card, never gating a
hint. This would need its own spec and a brief amendment.

---

## 7. Beta infrastructure

### 7.1 Measurement — TelemetryDeck

Privacy-first, no ATT, one JS SDK for both web and the Capacitor app, retention reports built in.
Verify the SDK package and API against current docs at implementation.

| Event | Payload | Fired from |
|---|---|---|
| `app_open` | platform (web / ios) | `App.tsx` mount |
| `puzzle_start` | count, mode, source (curated / upload / daily) | Setup's Start |
| `first_placement` | — | runtime, first merge into cluster 0, once per puzzle |
| `puzzle_complete` | count, mode, cleanRun | `complete` event |
| `daily_complete` | — | `commitCompletion` for `daily-*` ids |
| `first_run_skipped` | — | first-run skip |

- Anonymous install id lives in **IndexedDB** (no `localStorage`). Settings: one line of
  explanation and an off switch, which stops every event.
- `src/telemetry/` is DOM-free and tested: event shaping, the opt-out gate, and "nothing fires
  per frame".

### 7.2 Feedback

TestFlight's screenshot feedback on iOS. On web, a **Send feedback** row in the Pause sheet and
Settings opens a short external form. No in-app survey prompt.

### 7.3 Web changes for traffic

- Open Graph and Twitter meta plus an OG image.
- Puzzle Card: small Tessera wordmark and URL in the footer.
- `netlify.toml`: SPA fallback, long cache on hashed assets, no-cache on `sw.js` and the manifest.
- `/privacy`: plain language — saves stay in IndexedDB on the device, photos are never uploaded,
  the six anonymous events, how to turn them off. Linked from Settings and App Store Connect.
- "Get the iOS beta" link on Today once TestFlight is live.

### 7.4 Native (Capacitor)

- Rebase `native/ios-capacitor-shell` (549b6e3) onto main. Bundle id `com.johnbradner.tessera`,
  display name **Tessera**, store name **Tessera: Photo Jigsaw** (check availability).
- `@capacitor/haptics` per the design doc's parity table: light on pickup, medium on snap contact,
  heavy plus success on completion. An amplifier only — the snap must still be complete on a
  silent device.
- `@capacitor/camera` → PHPicker for "Your photos". No library permission prompt.
- `@capacitor/local-notifications`: a daily reminder, offered once after the first daily completion.
  Local only.
- One seam, `src/platform/`, so the web path stays the default and `Capacitor.isNativePlatform()`
  is read in one place.
- These three features are what keep Beta App Review from reading the build as a thin web wrapper
  (guideline 4.2).

---

## 8. Beta plan and go/no-go

1. Web v2 ships → soft launch on r/WebGames and r/jigsawpuzzles. Claude drafts the posts after
   checking each sub's self-promotion rules; the owner posts.
2. TestFlight public link → r/iosgaming, r/ipad, r/TestFlight.
3. **Go** to IAP + App Store when all three hold: **≥ 100 TestFlight installs, D1 ≥ 30%,
   D7 ≥ 12%**. Miss any → another polish cycle before monetising.

---

## 9. Implementation checklist

Each slice is one PR from `main`. **Every PR:** `npm test`, `npm run typecheck`, `npm run build`,
and `npm run test:browser` (a gate, not an extra).

**Slice 2 — Web v2 UI**
- [ ] Investigate B6 (Continue 0/12) and fix if real.
- [ ] Tab shell (`App.tsx`); `Home.tsx` → Today; gear → Settings sheet; tab bar hidden in
      setup / play / first run / card.
- [ ] Photo step: tap advances, segmented source control.
- [ ] Merge `PhotoCrop` into `PuzzleSetup`: grid overlay, More options disclosure, sticky Start,
      id minted on Start.
- [ ] `RuntimeSummary.hintsLeft` with accrual-boundary timeout; `HintButton` shows the count.
- [ ] Sheet detents: peek / default 35% / half / full; board fits above the sheet.
- [ ] `DOCK_QUERY` landscape and ≥ 1024; Tray side setting.
- [ ] `PwaBanner` inline on Today only.
- [ ] Browser specs: three-tap funnel, default detent ~35%, iPad portrait → sheet, iPad landscape →
      dock, Tray side left mirrors, `invariants.spec.ts` with tabs mounted, banner never over a CTA.
      Update `board-page.ts` (`open()`, `reachPicker`) and the Home-hop specs.

**Slice 3 — Traffic + measurement**
- [ ] OG meta and image · card wordmark · `netlify.toml` · `/privacy`
- [ ] `src/telemetry/` + unit tests · Settings toggle · Send feedback row
- [ ] Draft the soft-launch posts.

**Slice 4 — Native**
- [ ] Rebase the shell; bundle id and names
- [ ] `src/platform/` seam; haptics; PHPicker; local notifications
- [ ] Simulator screenshots of the funnel, play, and completion on iPhone and iPad

**Slice 5 — Build and TestFlight**
- [ ] `docs/TESTING-IOS.md`: simulator → your device (select Team) → Archive → Organizer →
      Distribute (the owner clicks upload; Claude never enters Apple credentials) → public link,
      with privacy URL and feedback email.

**Slice 6 — Reddit push** — draft posts; track go/no-go in TelemetryDeck.

---

## 10. Invariants touched, and how they hold

| Invariant | How v2 respects it |
|---|---|
| Board never renders through React | Play is outside the tab tree; `hintsLeft` updates on spend and accrual only. |
| Haptics are an amplifier | Every haptic sits on top of existing visual and audio feedback. |
| No `localStorage` for session state | Telemetry id, Tray side, and opt-out live in IndexedDB. |
| Guided twelve is an ordinary puzzle | Untouched. A skip still writes no completion. B6 may be a leak here — investigate first. |
| Daily is an ordinary puzzle | Today routes to it; no new save path. |
| Colour is never the only signal | The tab badge is a dot plus Today's "not yet played" copy. |
