# Product

<!-- impeccable:product-schema 1 -->

> **The design doc wins; this is a summary.** Sources of truth, in order:
> `docs/Tessera Design Doc.dc.html` (locked UI/UX spec), `docs/DESIGN_BRIEF_Tessera.md` (product
> intent and voice), `PLAN.md`, and for the v2 UI `docs/superpowers/specs/2026-10-18-v2-redesign-design.md`.
> The first three are gitignored and local only. When this file disagrees with any of them, this
> file is wrong.

## Platform

web — a PWA designed for iPad and iPhone touch first. A native iOS/iPadOS build is planned (v2 slice 4); until then this is mobile web, not native.

## Users

- **Wind-down solo player (primary).** 35–65, iPad on the couch in the evening, 20–60 minutes. Wants zero friction to start, no timer in their face, and resume that actually works.
- **Habit player.** Daily puzzle with coffee, 5–15 minutes. Wants a streak worth protecting and a fast load.
- **Memory-maker.** Uses their own photos, bursty. Wants the photo to look beautiful and something to share at the end.

Not designed for speed-competitive players; they are welcome, the UX is not warped for them.

## Product Purpose

A photo jigsaw: any photo becomes a real jigsaw with pieces you pick up, drag and snap into place. The interface's single job is to get out of the way of the search–recognise–place loop and make the moment of placement feel unreasonably good.

## Positioning

- **Progress is literally light.** The board starts as a dark mat; the assembled image emits light onto it, growing with completion. The same light carries hints and the completion payoff.
- **The photo colours the app.** The session accent is extracted from the photo; the chrome is neutral so the photo owns the palette.
- **The tray is a superpower.** Lenses (edges, colour bins, region) filter without ever reordering.
- **The snap is the product.** Layered audio and a sprung settle; it must feel complete on a silent device with no vibration.

## Operating Context

Three tabs — Today · Puzzles · Collection — with a gear on Today opening a Settings sheet. Today holds the daily puzzle (same photo and count for everyone, resets 00:00 local) and a Continue card. A new puzzle is three taps: photo → setup (crop, count, mode) → board. Play has no visible timer and no Back; leaving lives in the pause sheet. Finishing produces a Puzzle Card and a tile on the collection wall. A first-time player gets a guided twelve-piece puzzle, skippable.

## Capabilities and Constraints

- Modes shipped: Classic, Zen (the flagship, not "easy mode"), Daily. Others are designed, not built.
- Piece ceiling 250; snap tolerance Precise / Standard / Generous; Comfort mode raises touch targets to 60pt.
- **No lose state anywhere**, no bounce-back on a failed drop.
- **Colour is never the only signal.**
- **Motion in play is locked**: spring stiffness 520 / damping 26, lift 1.06, an idle board draws nothing, `prefers-reduced-motion` honoured. Nothing in play chrome may animate continuously.
- The board, tray chips and group chips are canvas, not DOM — design tooling must not touch them.
- Touch target floor 44pt everywhere.
- No ads. No account gate before play. Any monetisation would be photo packs and cut styles, never hints.
- Open: About/licence row waits on the licensing decision in `PLAN.md`.

## Brand Commitments

- Name: Tessera (a single tile of a mosaic).
- Voice: plain, warm, never cute. Sentence case. Active verbs. No exclamation marks on completion. ✅ "Pick a photo", "Keep going". ❌ "Let's get puzzling!", "Oops!", "Submit".

## Evidence on Hand

- Thirty curated photographs ship with the app (the curated picker).
- A web beta is live at tesserapuzzle.netlify.app.
- No testimonials, metrics, press or leaderboard data exist; do not fabricate any.
