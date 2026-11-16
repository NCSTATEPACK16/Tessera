# Session prompt — modernize Tessera for web and TestFlight (for Claude Fable 5.1)

> Paste everything below the line into a new session in `/Users/johnbradner/Documents/ClaudeWork/Tessera`.
> Run it **after** the redundancy and test review (`2026-11-15-fable-redundancy-and-test-review.md`)
> has landed, so its faster gates apply here. Slice 4 (the iOS shell) is on `main` as of PR #20, so
> this work can and must be checked inside the iOS app too.

---

You are the design-and-build lead on **Tessera**, a photo jigsaw where progress is literally
light. It ships as a web app (`tesserapuzzle.netlify.app`, PWA) and is about to go to TestFlight as
a Capacitor iOS app for a public Reddit beta. The engine is strong: deterministic cuts, union-find
snapping, canvas rendering at 60fps. The chrome around it still reads as a capable prototype.
Your job is to make the whole app feel **cohesive, smooth, and professional**, the kind of puzzle
app people screenshot, on iPhone, iPad, and desktop web.

Four headline asks from the owner, plus a general bar:

1. **Redesign Today** (the home tab).
2. **Fonts and typography**: review them and propose a direction.
3. **Modernize the drawer**: the piece tray (bottom sheet on phone, side dock on iPad
   landscape).
4. **A vivid cut animation**: the photo visibly gets cut into pieces.
5. Across every screen: smoother transitions, tighter consistency, nothing that looks generated.

## Read first, in this order

1. `CLAUDE.md`: the invariants. **Every visual idea must survive them.** The ones you'll hit
   most: the board never re-renders through React; an idle board draws nothing; tray lenses are
   filters, never sorts, so the canonical order never reflows; the chip cedes the vertical axis
   (`touch-action: pan-y`); colour is never the only signal; haptics amplify feedback and never
   carry it; there's no lose state and no bounce-back.
2. `docs/Tessera Design Doc.dc.html`: the locked spec (gitignored, local only). **It wins every
   disagreement.** Its tables live in the `<script type="text/x-dc">` block as data. Read §07
   (light), §08 (feedback ladder and parity table), §10 (motion: snap spring 520/26/1, reduced
   motion rules), §13 (tokens), the component and screen-state tables, and the performance rules.
   It already says, about cutting: *"Show pieces materialising onto the mat as they arrive from the
   worker; it turns loading into the first moment of delight."* The cut animation is that
   sentence, built properly.
3. `docs/DESIGN_BRIEF_Tessera.md` (voice, visual thesis), `PRODUCT.md`, `DESIGN.md`.
4. `docs/superpowers/specs/2026-10-18-v2-redesign-design.md` (navigation, the three-tap funnel,
   play-screen real estate, no ads ever, native features) and
   `docs/superpowers/specs/2026-10-20-modern-look-design.md`. Phase 1 (tokens and `src/ui/kit/`)
   shipped. **Phases 2 and 3 are this session**, including the Phase 2 audit table and its
   "Don't adopt" list.
5. `TesseraV3Figma/` (untracked): a Figma Make mock of Home, Library, New Puzzle, Play and a tab
   bar. Take its visual language. Never take its play logic or its five-tab structure; the v2
   spec settled three tabs.

Use the jCodemunch tools for code navigation, as the user's global `CLAUDE.md` requires. Load the
**`impeccable`** skill for the design passes (it has `detect`, critique, and polish modes) and
**`unslop`** for the "doesn't look AI-generated" pass. Use **superpowers:brainstorming** before
the spec. Use Context7 for any library API (Capacitor, Tailwind v4, Motion and the like) instead
of relying on memory.

## The bar

- **One app, not a set of screens.** Shared rhythm (spacing scale, radii, type ramp), shared
  motion vocabulary, and transitions that explain where you came from and where you went.
- **The photo owns the colour.** The chrome stays a quiet dark gallery surround, and the accent is
  extracted per photo (`extractAccent` → `clampToAccentRange` → `ensureContrast`). Never hard-code
  an accent, and measure contrast; don't assume it.
- **Light is the reward.** Bloom, hint glow, and completion live in the canvas
  (`src/render/light.ts`). **Don't** fake them with CSS overlays.
- **Native-feeling on iOS:** safe areas, 44pt targets (60pt in comfort mode via `--touch-min`), no
  hover-only affordances, springs rather than eases for anything the finger moves, haptics on the
  three §08 moments (already wired through `src/platform/`, which is the only place allowed to
  read `Capacitor.isNativePlatform()`).
- **Calm.** No infinite animation in play chrome (it would break "idle draws nothing"), no glow
  halos on buttons (the audit dropped `--shadow-accent`), no purple gradients, no emoji labels, no
  drop-shadow soup, and no dead controls. If a switch has no feature behind it, it doesn't ship.

## 1. Today (`src/ui/Today.tsx`)

Today is the first screen of every session after the guided twelve. Right now it's a stack of
cards. Redesign it so the reason to play is obvious in one glance:

- **Hero:** today's daily photo, large, with the serif title and a mono eyebrow (`DAILY · N
  PIECES`) on a real scrim (B7 fixed a 1.0:1 caption once already, so keep the contrast measured).
  One primary action. If the daily is in progress, show its live progress (thumbnail and ring)
  instead of "Start".
- **Continue:** in-progress puzzles as a horizontal card rail with the live board thumbnail, %
  ring, and the curated photo's name (not "15 × 10"). Cards come from the library store, and the
  library holds in-progress puzzles only.
- **Streak and collection** as compact cards that lead into the Daily hub and the Collection tab.
- **A stats strip** is optional. "Pieces placed" doesn't exist yet and would have to be summed from
  `completions`; nothing new may be stored in `localStorage`.
- Empty, first-visit, and offline states all designed, not left as defaults.
- The PWA install/update banner stays inline on Today, on the web only. It's hidden on native
  through `isNative`.
- **Known bug to fix while you're here:** on a 402pt-wide phone, the guided twelve's board frame
  and its scattered pieces are clipped off the left edge, on the web and in the iOS shell alike,
  and **Fit** doesn't recover them. It's the first thing every TestFlight tester sees.

## 2. Fonts and typography

The locked families are **Inter Tight** (UI), **IBM Plex Mono** (data and eyebrows), and
**Instrument Serif** (display; the design doc says "never in chrome", so check where v2 uses it
and whether that's still right). They're bundled via `@fontsource`, latin subsets, imported in
`src/main.tsx` (PR #20). Don't go back to a Google Fonts `<link>`: it held the iOS shell on a white screen
for about 20 seconds.

- Audit the type ramp in use against the seven-step scale in `theme.css`. Find every size,
  weight, and tracking that's off-scale. Tailwind v4 once compiled `font-[var(--font-display)]` to
  a *weight*, so verify the computed styles in the browser, not just the classes.
- If you believe a different pairing would read as more premium, **propose it with rendered
  comparisons** (the same three screens in both, on phone and iPad) and the bundle-size delta.
  Font families are a design-doc §13 decision, so changing them is the **owner's call**. Present
  it, don't apply it.
- Numerals: tabular figures for counters, timers, and progress, so they don't jitter as they
  change.

## 3. The drawer (tray)

Files: `src/ui/Tray.tsx`, `Sheet.tsx`, `sheet-detents.ts`, `PieceGrid.tsx`, `PieceChip.tsx`,
`LensChips.tsx`, `Shelf.tsx`, `SelectionBar.tsx`, `useTrayDrag.ts`, and
`src/input/tray-drag.ts`.

Modernize how it **looks and moves**. Keep how it **behaves**:

- **Look:** a refined sheet surface (material, handle, hairlines), pill lens chips with counts,
  the "tray · N loose" eyebrow, better chip framing for a piece bitmap (each chip is the real
  piece shape, not a square crop), and a clear pinned shelf. Edge pieces keep the corner-notch
  glyph, and colour bins keep their numeral next to the swatch.
- **Move:** detents (peek / default 35% / half / full) on a spring with velocity-aware snapping;
  a chip lifts on press; a piece dragged out of the tray hands off seamlessly to the canvas lift
  (scale 1.06, 8pt above the finger, never under it); returning to the tray animates home. iPad
  landscape dock, left or right per the Tray side setting.
- **Do not change:** virtualisation (only ~70 of 250 chips are mounted), the canonical order and
  the lens-is-a-filter rule, `touch-action: pan-y` with horizontal drag-out on touch, the 450ms
  select-hold and 120ms long-press, and the one-location rule (tray / mat / placed). Pinning stays
  an attribute. The tray must not re-render per frame during a board drag:
  `invariants.spec.ts` counts mutations inside it.

## 4. The cut animation

The moment between **Start** and the first drag. Today the worker cuts (budget: under 1.2s on an
iPhone 12, up to 250 pieces), streams batches to `PlayRuntime` via `onPieces(batch, done, total)`,
and the board appears.

Design it as a short, vivid sequence the player wants to watch, then build it:

- The **whole photo** appears on the mat, framed.
- **Cut lines trace across it.** Use the real lattice and tab geometry from the deterministic cut,
  so the lines the player watches are exactly the edges they'll assemble. They draw with light,
  in the accent, consistent with §07.
- **Pieces separate.** Each lifts and drifts to its starting place (the tray, or for the guided
  twelve its `firstRunScatter` position on the mat), arriving as batches stream in, so the
  animation hides cut latency instead of adding to it.
- **Audio:** a soft cut texture rising to a settle, built from the existing synthesised bank in
  `src/audio/` (no sample files). **Haptics on native:** a light rhythm under the cut lines, at
  most. They amplify and never carry.

Hard constraints:

- **Canvas only**, drawn by the renderer from scene state. React gets one summary flag at most.
  The main thread never blocks, and cutting stays in the worker.
- **Never lengthen time-to-play.** Set a total ceiling (propose one, about 1.2–1.6s), make it
  tappable to skip, and have it never run on a restore. A resumed puzzle opens exactly where the
  player left it.
- **Reduced motion:** a short cross-fade from photo to pieces, with light and audio kept, per
  §10's rule.
- **Idle draws nothing afterwards.** Every animation source retires itself, as
  `completePuzzle()` already does.
- Performance at **250 pieces on an iPhone 12-class device**: 60fps sustained. Piece bitmaps are
  rasterised once at `min(dpr, 2)`. Don't re-raster per frame for the effect.
- The board model stays truth. Pieces belong to the tray/mat from the moment the cut returns, and
  the animation is presentation over that, like the snap settle.

## 5. Everything else

- **Screen transitions** between tabs, into setup, into play, and into the card. Use one
  vocabulary (`screen-in`, `fade-up` exist in `theme.css`), and honour reduced motion.
- **Phase 3 of the modern-look spec:** Daily hub, Completion card, Collection wall, the first-run
  overlay, the upload/HEIC error states, and the Settings sheet get real designs, not just phase
  1's tokens. Fix the deferred calendar numerals (2.4:1).
- **Play chrome:** the top bar per the modern-look spec (serif name, placed/total, hint and pause
  icon buttons, a 3px summary-driven progress bar, Fit kept). The Hint button becomes a circular
  lightbulb with a count badge, and Zen shows no counter.
- **Consistency sweep:** replace any remaining hand-rolled buttons, toggles and segmented
  controls with `src/ui/kit/`. Unify empty and loading states with `Shimmer`. Copy follows the
  brief's voice: invitations, never apologies.

## Process

1. **Brainstorm, then spec.** Write
   `docs/superpowers/specs/2026-11-15-modernize-design.md`: direction, per-screen designs, motion
   specs (durations and springs with numbers), the cut-animation storyboard frame by frame, and an
   explicit list of anything that conflicts with the design doc, for the owner to rule on.
2. **Show before building.** Render the redesigned Today, the tray, and a cut-animation
   storyboard as visual comps (Figma via the Figma MCP, or static HTML in the browser pane),
   phone and iPad. **Get the owner's approval** on direction before touching `src/`.
3. **Plan** with superpowers:writing-plans. Use phased PRs from `main`, each shippable on its own:
   (a) typography and tokens, (b) Today, (c) the tray, (d) the cut animation, (e) transitions and
   the phase 3 screens.
4. **Build and verify each PR:** `npm run typecheck`, `npm test`, the browser gate (per the
   redundancy review's new tiers, or `npm run test:browser` if that hasn't landed),
   `test:browser:full` before the PR, `impeccable detect` on every DOM screen, and screenshots
   from the **iOS Simulator on iPhone and iPad** (`npm run build && npx cap sync ios`, then
   build the `App` scheme; see `docs/TESTING-IOS.md`) plus the web at phone and desktop widths.
   New behaviour gets a browser test through the `__tessera` hook. **The suite never plays a
   puzzle to reach a state.**
5. Snap and drag **feel** can't be tested. List exactly what the owner should try on a real
   iPhone and iPad for each PR.

## Never

- Re-render the board, or the tray per frame, through React. Never add an infinite animation to
  the play screen.
- Change snap tolerance, spring constants, the cut geometry, or any hard number in `CLAUDE.md`'s
  table without the owner changing the design doc first.
- Add ads, rewarded hints, dark patterns, a lose state, or a bounce-back.
- Store session state in `localStorage`, add a second save path for dailies, or put a completed
  puzzle in the library.
- Ship a control with nothing behind it, or use colour as the only signal.
- Load fonts or scripts from a CDN at runtime (offline launches and the iOS shell need everything
  bundled).
- Edit the design doc, the brief, or `PLAN.md`. Propose changes in the spec, and the owner makes
  them.
