---
name: Tessera
description: A photo jigsaw where progress is literally light.
colors:
  mat-void: "#0b0d10"
  mat-deep: "#101318"
  mat-felt: "#15181d"
  mat-raised: "#1e232a"
  edge-hair: "#2c333c"
  edge-hair-light: "#363e49"
  ink-primary: "#edf0f4"
  ink-secondary: "#b9c1cc"
  ink-muted: "#8a929e"
  success: "#5ecfa0"
  warn: "#f0a855"
  danger: "#ff6b6b"
  accent-fallback: "#6fa8ff"
typography:
  display:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontWeight: 400
  ui:
    fontFamily: "Inter Tight, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
  label:
    fontFamily: "Inter Tight, system-ui, sans-serif"
    fontWeight: 500
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
  eyebrow:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    letterSpacing: "0.1em"
rounded:
  sm: "8px"
  md: "14px"
  lg: "22px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "40px"
  "7": "64px"
components:
  button-primary:
    backgroundColor: "{colors.accent-fallback}"
    textColor: "{colors.mat-void}"
    rounded: "{rounded.md}"
    height: "44px"
  button-default:
    backgroundColor: "{colors.mat-raised}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.md}"
    height: "44px"
  sheet:
    backgroundColor: "{colors.mat-raised}"
    rounded: "{rounded.lg}"
---

> **The design doc wins; this is a summary.** `docs/Tessera Design Doc.dc.html` §13 holds the
> locked tokens and `src/ui/theme.css` is their one implementation. When this file disagrees with
> either, this file is wrong. Product context is in `PRODUCT.md`.

## Overview

A quiet, dark gallery surround so the photo owns the palette. The chrome is neutral by design; the
session's accent is extracted from the player's photo at runtime (`--accent`, with
`--accent-dim`/`--accent-glow` derived from it), so `accent-fallback` above is only what an empty
library or a failed extraction shows. Light is the one expressive element, and it lives in the
canvas, never in CSS.

## Colors

- Mat tones (`mat-void` → `mat-raised`) are depth, darkest behind everything, raised for tray,
  sheets and cards. `edge-hair` is every 1px separation.
- Ink: primary for text, secondary for supporting copy, muted for counts and eyebrows.
- `success` / `warn` / `danger` are mode and state hues. **Never the only signal** — a badge always
  carries its word, a danger button its label.
- The accent's WCAG contrast is measured at runtime (`ensureContrast`), not assumed.

## Typography

Seven sizes only: 12 / 14 / 16 / 20 / 28 / 40 / 64, in `rem` so Dynamic Type scales them. Nothing
off-scale ships.

- **Display** (Instrument Serif): puzzle titles, the completion card, the streak number, screen
  titles. Used with restraint.
- **UI** (Inter Tight): everything else, sentence case. 400 body, 500 labels, 600 sparingly.
- **Data** (IBM Plex Mono, tabular): counts and times — must not shift width as they change.
- `.eyebrow`: mono, 12px, uppercase, tracked 0.1em, muted — section labels.

## Layout

Phone portrait first, iPad landscape equally. Three tabs (Today · Puzzles · Collection): a 49pt
bottom bar plus safe area on phone, a centred floating bar at the top at ≥ 768pt, hidden in setup,
play, first run and the card. Touch floor `--touch-min` 44px (60px under Comfort mode, via
`[data-comfort]`); every button reads it.

## Elevation & Depth

Two shadows only: `--shadow-raise` (0 8px 24px rgb(0 0 0 / .35)) for raised surfaces and
`--shadow-accent` (0 4px 20px accent-glow) for the primary action. No glassmorphism, no gradient
meshes, no drop-shadow soup.

## Shapes

Radii 8 / 14 / 22: small for chips, medium for buttons and cards, large for sheets.

## Components

Shared chrome lives in `src/ui/kit/`: `Button` (primary / default / ghost / danger; md / lg; press
scales to 0.96), `Toggle` (switch visual, still `aria-pressed`), `Segmented`, `Badge`,
`SettingsGroup`/`SettingsRow`, `Icon`, `Shimmer`. Use these rather than hand-written class strings.

## Do's and Don'ts

- **Do** use the standard easing `cubic-bezier(0.32, 0.72, 0, 1)` at 120 / 200 / 320ms for chrome.
- **Do** honour `prefers-reduced-motion` (already global in `theme.css`).
- **Don't** animate anything continuously in play chrome — an idle board draws nothing.
- **Don't** add CSS bloom or glow overlays to play; light is the canvas's job.
- **Don't** touch the board, tray chips or group chips — they are canvas.
- **Don't** ship a control with no feature behind it.
- **Don't** use colour as the only signal.
