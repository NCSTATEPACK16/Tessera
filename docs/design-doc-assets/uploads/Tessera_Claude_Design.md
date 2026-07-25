> **Developer Context for Claude:** Act as a Principal UX/UI Designer. Read this brief and generate the requested deliverables in Section 14. Do not write code yet; focus purely on the visual logic, state management, and component architecture.

# Tessera — Design Brief

> Working title. *Tessera* = the single tile of a mosaic. Placeholder until naming is settled.

**Paste this whole file into Claude Design as the brief.** It pins the direction deliberately; where it leaves an axis open, it says so.

---

## 1. What this is

A photo jigsaw app. You give it any photo — your dog, a wedding, a screenshot of a map — and it becomes a real jigsaw with real weight: pieces you pick up, drag, and *snap* into place with sound and haptics.

Web-first (Netlify), designed for iPad and iPhone touch from day one, eventually shipped as a native iOS/iPadOS app.

**The single job of the interface:** get out of the way of the search-recognize-place loop, and make the moment of placement feel unreasonably good.

## 2. Who's playing

Three real people, in priority order:

| Player | Session | What they need |
|---|---|---|
| **Wind-down solo player** (primary) — 35-65, iPad on the couch, evening | 20-60 min, wants no pressure | Zero friction to start, no timer shoved in their face, pick-up-where-I-left-off that actually works |
| **Habit player** — daily-puzzle-and-coffee type | 5-15 min, same time daily | A streak worth protecting, a fair leaderboard, fast load |
| **Memory-maker** — gifting/nostalgia, uses own photos | Bursty | Their photo looking *beautiful*, and something shareable at the end |

Not designed for: hardcore speed-competitive players. They're welcome, but we don't warp the UX for them.

## 3. The core insight

A physical jigsaw is a **search problem** with a **tactile reward**. Digital versions usually break both:

- They break search by dumping 300 pieces in a scrolling strip you can't read.
- They break the reward by making snap a silent, instant teleport.

So the three things this app must beat everyone at:

1. **The tray is a superpower, not a compromise.** A physical puzzle can't sort itself by colour. Ours can. Filter by edge pieces, cluster by dominant colour, filter to "pieces that belong in the region I'm looking at." This is the feature that makes digital *better* than cardboard.
2. **Sub-Assemblies (Islands) are native.** Allow users to multi-select pieces in the tray to drag them out as a locked, temporary cluster on the side of the mat. *(Note for Claude: Physical puzzle players often build distinct elements—like a face or a sign—outside the main frame. Digital trays shouldn't just sort; they should facilitate building these floating clusters.)*
3. **The snap is the product.** Layered audio, haptics, a piece that overshoots by two pixels and settles, neighbours that ripple outward. Budget real time for this.

## 4. Reference points to study

Study these for the specific lesson, not to copy the look:

**In-category**
- *Jigsaw Explorer* (web) — the performance bar. Big piece counts in a browser, custom photo upload. Utilitarian visually; we beat it on feel.
- *Magic Jigsaw Puzzles* — tray sorting and library scale done at volume. Learn the sorting, reject the ad-cluttered chrome.
- *Kristanix / Jigsaw Puzzle Real* — piece handling and rotation mechanics.
- *Puzzle Page* — the daily-habit loop. One puzzle a day, ritualised.

**Out-of-category, for polish**
- *Monument Valley* — sound, motion, and UI as one cohesive material. Nothing is decoration.
- *Alto's Odyssey* — ambient audio bed + haptics. Calm can still feel premium.
- *Threes!* — sound as a **feedback ladder**: pitch rises with your combo. Steal this directly.
- *Apple Photos "Memories"* — how to frame someone's own photo so it lands emotionally.
- *Liberty Puzzles* (physical, wooden) — whimsy piece shapes. Our long-term cut-style inspiration.

## 5. Visual direction

### The thesis
**You are bringing a picture back into the light.**

The board starts as a dark, unlit mat holding scattered fragments. As you assemble, the completed area of the image *emits light onto the mat around it* — a soft bloom that grows with completion percentage. At 100% the whole surface is lit. Progress is literally illumination, which means the same visual language serves the hint system (a glow) and the completion payoff (full bloom). One idea, three jobs.

### Signature element
**The photo colours the app.** On load, extract the 3 dominant colours from the source photo and drive the session's accent, the bloom hue, and the tray highlight from them.

*Crucial color rule:* Apply a luminance/saturation threshold to the extracted colours. *(Note for Claude: If a photo is muddy or gray, raw hex codes will look like a dull stain against a dark mode background. Programmatically bumping saturation and lightness ensures the bloom genuinely reads as "light" in the UI.)*

A photo of a beach gives you a warm sand-and-teal session; a night city gives you cyan and amber. The chrome is neutral by design so the photo owns the palette. Every puzzle looks like a different app in the best way.

### Palette
Neutral base, always. Photos need a quiet gallery surround — this is a real photographic constraint, not a mood choice.

| Token | Hex | Use |
|---|---|---|
| `--mat-void` | `#0B0D10` | Deepest ground, behind everything |
| `--mat-felt` | `#15181D` | The puzzle mat surface |
| `--mat-raised` | `#1E232A` | Tray, sheets, cards |
| `--edge-hair` | `#2C333C` | 1px separations, piece slot outlines |
| `--ink-primary` | `#EDF0F4` | Text |
| `--ink-muted` | `#8A929E` | Secondary text, counts |
| `--accent-*` | *extracted from photo* | Accent, bloom, focus ring, streak flame |

Fallback accent when extraction fails or on the empty library: `#6FA8FF` (cool, recedes, won't fight any photo).

Ship four mat finishes as a setting: **Felt** (default, above), **Linen** (light mode — `#E8E4DC` ground, for bright rooms and accessibility), **Walnut**, **Slate**.

### Typography

- **Display** — `Instrument Serif` (or `Gambarino` if you want more edge). Used with restraint: puzzle titles, the completion card, the streak number. Gives the "your memory as an artefact" register. Never in UI chrome.
- **UI / body** — `Inter Tight`. Tight tracking at small sizes, sentence case everywhere.
- **Data** — `IBM Plex Mono`, tabular figures, for timers, piece counts, leaderboard times. Timers must not shift width as they tick.

Type scale: 12 / 14 / 16 / 20 / 28 / 40 / 64. Weights: 400 body, 500 UI labels, 600 sparingly.

### Motion
Restrained everywhere except the snap.

- Standard easing `cubic-bezier(0.32, 0.72, 0, 1)`, 180-240ms for UI.
- **Snap** is the exception: piece travels to slot in ~90ms. **Design this using Spring Physics (high stiffness, moderate damping) instead of standard CSS easing.** *(Note for Claude: Because web iOS lacks vibration API support, visual feedback must carry the tactile illusion. A cubic-bezier curve feels floaty, whereas a spring model provides an aggressive, satisfying physical settlement.)* Neighbouring placed pieces get a 1px outward ripple, staggered 20ms from the contact point.
- Group merge (two clusters joining): both clusters flash their outline once, then the seam light-bleeds.
- Respect `prefers-reduced-motion`: kill the ripple and bounce, keep the colour/light change so feedback is never lost.

### Depth & materials
Pieces are physical objects: a picked-up piece lifts (scale 1.06, shadow spreads and softens, ~8px offset from the finger — never *under* the finger). Placed pieces sit flush with a 1px inner bevel highlight on the top-left edge. The tray is a raised surface with a subtle top-edge light catch. No glassmorphism, no gradient meshes, no drop-shadow soup.

---

## 6. Screens to design

Deliver each with the states listed. **Screen 6 is the hero** — design it first and best.

1. **First run** — one screen, two taps to a puzzle. No account, no tutorial wall. "Pick a photo" primary, "Try today's puzzle" secondary. Show a live sample puzzle assembling itself behind the copy.
2. **Library / Home** — puzzles in progress (with % ring and thumbnail showing actual current state), completed, and a prominent "New puzzle" affordance. *States: empty (invitation, not apology), 1-2 items, 30+ items with search.*
3. **Photo source** — device photos, camera, sample gallery, and (later) URL. Then **crop & frame**: aspect selector, rotate, and a live preview of the piece grid overlaid so they see what they're committing to.
4. **Puzzle setup** — piece count ladder, mode, cut style, assists. Must show a *preview of actual piece size* at each count, not just a number. "300" means nothing; a rendered piece next to a thumb does.
5. **Board — play.** The centrepiece. Needs: mat, camera (pinch/pan) with zoom indicator, the tray, progress ring, timer (dismissible), hint button, pause. Introduce an **"X-Ray Focus"** state when dragging a piece on smaller touch targets. *(Note for Claude: Fingers dragging pieces on mobile obscure the grid. Dimming the contrast of already-placed pieces that don't share a connecting edge with the held piece reduces visual noise and draws the eye to the relevant sockets.)* *States: default, zoomed in on a region, dragging a piece (X-Ray Focus active), tray expanded to half-sheet, tray sorted by colour, one-handed iPhone reach layout, iPad landscape layout with tray docked right.*
6. **Board — hint active.** ⭐ The glow moment. A tapped piece's destination *region* on the board breathes with light. Design the light: it should read as the same light the assembled image emits, dialled up. Show tier 1 (region glow) and tier 2 (exact slot outlined, piece leaning toward it).
7. **Board — group merge** — the celebration beat when two clusters join.
8. **Pause sheet** — resume, reference image, restart, settings, leave. Reference image view is important: full-bleed photo, tap to dismiss.
9. **Completion → Puzzle Card** — the shareable artefact. Photo, time, piece count, date, mode, clean-run badge. This is where the display serif earns its keep. Then: share, save to photos, new puzzle, "puzzle this again harder."
10. **Daily hub** — today's puzzle, streak with flame/freeze count, a month calendar of completions, yesterday's leaderboard.
11. **Leaderboard** — today / all-time / friends. Show hints used as a column and a clean-run marker rather than disqualifying anyone.
12. **Profile & stats** — total pieces placed (a satisfyingly large number), fastest times by count, favourite mode, longest streak.
13. **Settings** — audio (master/SFX/ambient sliders), haptics, assists (ghost underlay opacity, snap tolerance, edge highlight), accessibility, mat finish, account.
14. **Achievements / collection** — badges, and completed puzzles as a mosaic wall.

Also deliver: **component inventory** (button tiers, sheet, slider, toggle, piece chip, progress ring, streak flame, toast, empty state, loading skeleton) and the **token sheet** as CSS custom properties.

---

## 7. Game modes

MVP ships **Classic, Daily, Zen**. The rest are designed now, built later, so nothing has to be retrofitted.

| Mode | Rules | Why it exists |
|---|---|---|
| **Classic** | Timer runs, hints cost, leaderboard-eligible | The default competitive-ish baseline |
| **Zen** | No timer, unlimited hints, ambient audio bed, no pitch ladder | The primary mode for the wind-down player. Do not treat it as "easy mode" — treat it as the flagship |
| **Daily** | Same curated photo and piece count for everyone, resets 00:00 local, one attempt | The habit engine |
| **Rotation** | Pieces spawn at random 90° increments; two-finger twist or long-press dial to rotate | The real difficulty jump, more than piece count |
| **Fog** | Only a lit region of the board is visible; it follows your progress | Forces methodical assembly, gorgeous with the light thesis |
| **Blind** | No reference image available, ever | For experts. Pairs brutally with Rotation |
| **Rush** | 3 min, score by pieces placed, **algorithmic piece feed** | The 5-minute-queue mode. *(Note for Claude: An endless random feed introduces too much RNG in a time crunch. The game must algorithmically feed pieces guaranteed to connect to the current cluster to keep players in a state of flow.)* |
| **Drift** | Loose pieces slowly drift on the mat like a real table getting bumped | Novelty; low priority |
| **Album** | One photo album → a series of linked puzzles with a completion mosaic | The memory-maker's mode. Strong gifting/sharing hook |
| **Duo** | Two players, one board, live (Supabase Realtime) or pass-and-play | Post-launch, but design the board so a second cursor can exist |

## 8. Difficulty & piece system

**Piece counts** are targets, not exact — the grid is computed from image aspect ratio so pieces stay roughly square. A 3:2 photo at "100" might be 12×8 = 96. Show the real number.

`12 · 24 · 48 · 100 · 200 · 300 · 500 · 1000`

Below 48 is for kids and taster sessions. 100-300 is the centre of gravity. 500+ needs the tray filters to be excellent or it's unplayable on a phone.

**Cut styles** (MVP: Classic only)
- **Classic tab** — the standard knob-and-socket, alternating.
- **Ribbon** — long thin interlocks, harder.
- **Organic** — wobbling irregular outlines, no two alike.
- **Geometric** — triangles/hexes, no tabs, snap on shared edges.
- **Whimsy** — occasional silhouette pieces (a cat, a star) as collectibles. Delightful; expensive; later.

**Assists** — settings, not hints, and never leaderboard-affecting:
- Ghost underlay: 0-30% opacity of the full image beneath the board.
- Edge highlight: edge pieces tinted in the tray.
- Snap tolerance: Precise / Standard / Generous. Default Standard ≈ 28% of piece width. Older hands and small screens need Generous — make it easy to find.

## 9. Hint system

Three tiers plus a settings-level assist. Never a buzzer, never a punishment.

- **Tier 1 — Warm** (free, unlimited, all modes). Tap a loose piece → its destination *region* (a ~3×3 piece area) on the board breathes with light for 3s. Tells you *where to look*, not where to click. This is the mode you described and it should be the default hint button behaviour.
- **Tier 2 — Guide** (costs 1). Exact slot outlines; the piece lifts slightly and leans toward it like it's being pulled.
- **Tier 3 — Place** (costs 2). Auto-places one piece with the full snap juice. Use when genuinely stuck.

**Economy:** 3 hints per puzzle in Classic, +1 per 10 minutes of play, unlimited in Zen. Never sell hints in a way that makes the game feel gated — if there's ever monetisation, sell photo packs and cut styles, not relief from frustration.

**Leaderboard interaction:** record hints used, mark 0-hint runs with a "clean" badge. Don't disqualify. Shame is bad retention.

## 10. Audio & haptics

The most under-designed part of every competitor. Spec it properly.

**Snap — three layers, mixed together**
1. Transient: a short ceramic/wood click (~8ms attack).
2. Body: a felt thud giving it weight.
3. Tail: 200ms of small-room reverb so the mat feels like a physical space.

Round-robin 4 samples per layer with ±3% pitch randomisation, or it machine-guns on fast play.

**The pitch ladder (steal from *Threes!*)** — consecutive correct placements walk up a pentatonic scale. Break on a wrong drop or 8 seconds idle, reset to root. It converts a slow search game into something with rhythm without adding any time pressure. **Off in Zen.**

*Technical Audio Constraint:* Apply the pitch shift *only* to the transient layer (the click), keeping the body and tail at a constant playback rate. *(Note for Claude: The Web Audio API changes pitch by altering playback rate, which would shorten our 200ms reverb tail and change the perceived acoustic size of the room. Separating the pitch shift preserves the physical weight of the drop.)*

**Everything else**
- Pickup: a soft peel.
- Invalid drop: dull muted tap. Neutral. Not a failure sound.
- Group merge: a chord instead of a single note, pitched by cluster size.
- Edge frame completed: a distinct "frame lock."
- Completion: a sustained chord resolving to the tonic, then a camera-shutter click as the Puzzle Card generates.
- Ambient: a low bed per mat finish, ducked ~4dB under snaps. Off by default on Classic, on by default in Zen.

**Buses:** master / SFX / ambient, independent sliders.

**Haptics** (native only — see the constraint below): light impact on pickup, medium on snap, success notification on group merge, heavy + success on completion.

> ⚠️ **Constraint to design around:** iOS Safari does not support the web Vibration API. On the web build, haptics are absent on iPhone/iPad. The audio and visual feedback therefore has to carry the full weight of the snap on web, and haptics become a genuine reason the native app feels better. Don't design a snap that *depends* on vibration.

## 11. Accessibility

Non-negotiable floor:
- Light (Linen) mat for low-vision and bright-room use.
- Generous snap tolerance and a large-piece mode (cap at 48 pieces, bigger touch targets).
- Colour is never the only signal — the edge-piece highlight also uses a corner marker.
- `prefers-reduced-motion` respected (keep the light, drop the bounce).
- Full-screen reference image always one tap away.
- One-handed iPhone layout: hint, tray, and pause all reachable in the bottom third.
- No-fail by design. There is no lose state anywhere in this app.

## 12. Progression & retention

- **Streaks** on the Daily. Earn one **freeze** per 7-day streak (auto-spends on a missed day), plus one manual repair per month. Generous on purpose — a broken streak is the #1 churn event.
- **Total pieces placed** as the headline lifetime stat. It gets absurdly large and people love it.
- **Badges** for real accomplishments (first 1000-piece, 30-day streak, a clean Blind+Rotation run), not participation.
- **The collection wall** — every completed puzzle as a tile in a growing mosaic. This is the emotional retention hook, stronger than any leaderboard.

## 13. Copy voice

Plain, warm, never cute. Sentence case. Active verbs.

- ✅ "Pick a photo" / "Keep going" / "Today's puzzle is ready"
- ❌ "Let's get puzzling!" / "Oops! Something went wrong" / "Submit"

Empty library: *"Any photo works. Start with one you like looking at."*
Failed image load: *"That image couldn't be read. Try a JPEG or PNG under 20 MB."*
Completion: the display serif, the photo, and the time. No exclamation marks.

## 14. Non-goals for the design pass

Don't design: multiplayer lobbies, an in-app store, social feeds, user accounts as a gate before play, or an ad slot. If monetisation happens it's photo packs and cut styles, and it can be designed later without touching the board.

---

## What to hand back

1. The screens in §6 with their listed states, iPad landscape **and** iPhone portrait.
2. Token sheet as CSS custom properties, matching §5.
3. Component inventory.
4. The snap and hint-glow moments as motion specs — timing, easing, layer order. These two interactions matter more than any static screen.