# Modern look — adopting the TesseraV3Figma visual language

**Date:** 2026-10-20 · **Branch:** v2-slice-2 · **Source:** `TesseraV3Figma/` (Figma Make export, untracked)

## Context

`TesseraV3Figma/` is a Figma Make mock of the app: Home, Library, New Puzzle, Play, Learn,
Settings, a tab bar and a splash. It shares the design doc's palette, fonts, radii and easing, so
the work is mostly **shared components and layout**, not colour. It is a single-file mock with
static squares for a board and tray — we take its visual language, never its play logic, and we
restyle `src/ui/` in place rather than importing its code.

The design doc (`docs/Tessera Design Doc.dc.html`) still wins every disagreement. Items marked
**Don't adopt** conflict with it.

## Phasing

1. **Tokens + shared components** (this change). New tokens in `theme.css`; new components in
   `src/ui/kit/`; swapped in only where they are drop-in replacements for existing markup. No
   element moves, no screen changes structure, every `aria-label` and `aria-pressed` the browser
   suite selects by is preserved.
2. **Layout, screen by screen** — after the open decisions below are made.
3. **Designs for the screens the mock lacks** — Daily hub, Completion card, Collection wall,
   first-run overlay, upload/HEIC errors, PWA banner. Until then they get phase 1's tokens and
   components so nothing looks left behind.

## 1. Tokens (`src/ui/theme.css`)

| Token | Value | Note |
|---|---|---|
| `--ink-secondary` | `#B9C1CC` | body copy one step below primary |
| `--mat-deep` | `#101318` | recessed wells |
| `--edge-hair-light` | `#363E49` | hover/pressed border |
| `--success` / `--warn` / `--danger` | `#5ECFA0` / `#F0A855` / `#FF6B6B` | Zen, Daily, destructive |
| `--accent-dim` | `color-mix(in srgb, var(--accent) 18%, transparent)` | selected fill — derived from the **live** accent |
| `--accent-glow` | `color-mix(in srgb, var(--accent) 50%, transparent)` | glow — derived, never a fixed rgba |
| `--shadow-raise` | `0 8px 24px rgb(0 0 0 / 0.35)` | cards, sheets |
| `--shadow-accent` | `0 4px 20px var(--accent-glow)` | primary button, hint |
| `.eyebrow` | mono, `text-1`, uppercase, 0.1em tracking, muted | section labels |
| keyframes | `screen-in`, `fade-up`, `shimmer` | one-shot only (shimmer loops, but only while loading) |

Mapping rules for anything taken from the mock:

- **Type** snaps to the seven-step scale; the mock's 9/10/11px → `text-1` (12px is the floor),
  13–15 → `text-2`/`text-3`, 24–26 → `text-5`, 52 → `text-6`. Rem, never px.
- **Radii** 6/10/12/16/20 → `--radius-sm` 8 / `--radius-md` 14 / `--radius-lg` 22.
- **Durations** 0.12/0.15/0.25/0.6s → `--duration-fast` / `-base` / `-slow`.
- **Don't adopt** `--ink-faint #4A5260` as a text colour — ≈2:1 on the mat. Use `--ink-muted`.
- **Don't adopt** the fixed accent. The app extracts it per photo and `ensureContrast` measures it.

## 2. Shared components (`src/ui/kit/`)

| Component | Contract | Replaces |
|---|---|---|
| `Button` | `variant: primary \| default \| ghost \| danger`, `size: md \| lg`; scales 0.96 on press; always `touch-target` | ~20 hand-written class strings |
| `Toggle` | switch visual; **renders a toggle button with `aria-pressed`** (the suite and screen readers already rely on it); hit area stays `--touch-min` (60 under comfort) even though the track is 26px | the "On/Off" text buttons |
| `Segmented` | options + value; each option a button with `aria-pressed` and its own `aria-label` | piece count, snap tolerance, aspect pickers |
| `Badge` | mono pill; `tone: accent \| success \| warn \| muted`; always carries its word, never colour alone | mode text in cards |
| `SettingsGroup` / `SettingsRow` | eyebrow title, grouped rows with hairline dividers, label + sub + trailing control | pause sheet settings, Setup's "More options" |
| `Icon` | SVG: back, pause, lightbulb, plus, grid, home, photo, gear | (adopted in phase 2 — text labels "Pause", "Fit", "Hint" stay until then) |
| `Shimmer` | skeleton block | (adopted in phase 2 — blank thumbnails, cutting wait) |

`PuzzleCard` and the streak week row are phase 2: both change what a card shows.

## 3. Layout (phase 2)

- **Home** — hero: serif light title on a dark gradient, "DAILY · N PIECES" eyebrow, Start pill.
  *Current hero text uses `--mat-void` over a black gradient — a readability bug; fix first.*
  In-progress becomes a horizontal PuzzleCard scroll; streak + collection become stacked cards;
  add a stats strip (pieces placed must be summed from `completions` — nothing stores it today).
- **Library** — serif title; header buttons collapse into the tab bar or an icon row; cards show
  the curated photo's name instead of "15 × 10". **Don't adopt** the "Completed" filter: the
  library is in-progress only and the wall reads `completions` — a Completed tab conflates them.
- **New puzzle** — step indicator, mode cards with icon + subline, preview card with the real
  piece count, toggle rows, sticky Back + Start Cutting footer. **Don't adopt** "Choose this
  photo →": the v2 spec makes a curated tile advance in one tap.
- **Play** — top bar: back, serif name over placed/total, hint and pause icon buttons; a 3px
  progress bar under it (summary-driven). Keep **Fit**. Hint becomes a 52pt circular lightbulb
  with a count badge. **Don't adopt** "∞" in Zen — the counter is absent. **Don't adopt** the CSS
  bloom overlay — light lives in the canvas. **Don't adopt** infinite `glow-breathe`/`bloom-pulse`
  in play chrome — it repaints an idle board every frame.
- **Tray** — restyle only ("tray · N loose" eyebrow, pill lens chips, handle). Dock/sheet, shelf,
  select mode and virtualisation are untouched.
- **Pause** — serif "Paused" header with placed/time, Resume/Leave; live settings below as a
  `SettingsGroup`.

## Open decisions (before phase 2)

1. **Bottom tab bar** (Home · Library · New · Learn · Settings) — a navigation change; alters the
   Home/Library entry rules and `home.spec.ts`.
2. **Global Settings screen** — tray side, comfort, sound, reset data. The mock's Ambient, High
   contrast and Reduce motion switches have no feature behind them (reduced motion follows the
   OS) and must not ship as dead controls.
3. **Learn tab** — additional to the guided twelve, never a replacement. Copy is wrong today
   ("50 curated photos" — there are 30; "12 × 12 = 144" for a 150 rung).
4. **Splash** — no longer than the boot check, or none.
5. **Live Classic timer** — permitted (timer is summary state) but a 1Hz update; not in the app.
6. **About row** — the "MIT licence" line waits on PLAN.md's licensing decision.

## Verification (every phase)

`npm run typecheck`, `npm test`, `npm run test:browser:full`, and a look on an iPad. Phase 1 must
leave every existing browser assertion passing unchanged — it moves no element and renames no label.
