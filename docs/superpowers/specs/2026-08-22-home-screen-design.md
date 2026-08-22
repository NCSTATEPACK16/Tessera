# Home screen — a landing moment before the working screen

**Written:** 2026-08-22
**Status:** design, not yet implemented
**Branch context:** built on top of `main` post steps 1–8/Plan 0 and Tracks 1–4 (all merged).
Completion-card work is unmerged but unrelated. This is the first step to touch `App.tsx`'s
top-level routing since step 6 deliberately deferred it (see Decision 1).

## Scope

The design doc is silent on a dedicated landing/home screen — it specifies the Daily hub (§11) and
the Library (5c) as peer screens, reached from each other, with no screen designated "home." Step
6's own spec explicitly punted this: *"Which screen is home is a navigation question that belongs
to whichever step adds real navigation, not to this one."* This is that step.

A `TesseraV3Figma/` Figma Make export (not part of the shipping app) prototyped a `HomeScreen` with
a daily hero card, a week streak strip, an in-progress rail, and a stats footer. This spec adopts
that screen's shape, rebuilt against the real `Screen` union, the real `PhotoPicker`/`Library`/
`DailyHub`/`CollectionWall` components, and the app's actual design tokens (`theme.css`) rather than
the prototype's own inline hex values.

**In scope:** a new `'home'` screen, its component, the mount-effect branch that decides when a
player sees it, a "Browse Photos" / "Upload Yours" split on `PhotoPicker`'s existing source toggle,
and the back-navigation this introduces.

**Explicitly out of scope:**
- A persistent tab bar (Decision 3 rejects it explicitly).
- Any change to `Board`, snap, the tray, or gameplay — this is routing and one new screen.
- Re-litigating the Daily hub, Library, or Collection Wall's own layouts — Home teases them, it
  does not replace or restyle them.

An interactive mockup and the six decisions below were reviewed and answered directly by the
project owner before this doc was written; see the "Decision" line in each section for their call.

---

## Decisions

### 1. Home sits in front of Library, not instead of it

`Screen` gains a member: `'checking' | 'home' | 'daily' | 'library' | 'setup' | 'playing' |
'first-run' | 'wall'`. `Library`, `DailyHub`, `PhotoPicker`, and `CollectionWall` are unchanged as
components — Home is a new peer screen that sits earlier in the mount decision, not a rewrite of
any of them.

### 2. Home never appears before a profile has history

**Decision: confirmed — no exceptions for a fresh profile.**

The mount effect (`App.tsx` ~L400–427) keeps its first-run branch exactly as it is: a truly fresh
profile (`entries.length === 0 && completions === 0 && !firstRunDone`) still gets the guided twelve,
automatically, with no Home screen inserted in front of it. A profile that has skipped or finished
the guided twelve but still has an empty library and zero completions goes straight to `'setup'`
(the picker) — also unchanged.

```
const hasHistory = entries.length > 0 || completions > 0;
setScreen(hasHistory ? 'home' : 'setup');
```

replaces the current

```
setScreen(entries.length > 0 ? 'library' : 'setup');
```

Everything upstream of that line (the first-run branch, the `Promise.all` reads) is untouched.

**Why this is the low-risk cut:** `test/browser/board-page.ts`'s `reachPicker()` races the picker
against the first-run skip button, both reached only from a profile with zero entries and zero
completions. That profile never has history, so it never sees `'home'` — `reachPicker()`, and the
four browser specs that import it directly (`daily`, `library`, `photo-picker`,
`collection-wall.spec.ts`), see no change in the paths they exercise for a fresh reload. Any spec
that instead opens with a *populated* library or an existing completion (if one exists today) will
land on `'home'` where it used to land on `'library'`, and will need a click through Home's "Your
Puzzles" link added to its setup — that audit happens at plan time, not here.

### 3. No persistent tab bar; Home is a single stack frame

**Decision: confirmed — single stack frame.**

Home is reached like every other screen in this app: `setScreen('home')`, no new chrome pattern.
Concretely, this means:

- `Library` needs a way back to Home. It has none today (it's `main`'s current resting screen).
  The simplest fit is the same pattern the app already uses for `CollectionWall`'s `beforeWall` ref
  — a tap target in `Library`'s header (the wordmark, or a new back affordance) sets
  `setScreen('home')`.
- `DailyHub` and `PhotoPicker` already have `onLibrary`/back-ish props; they gain nothing new here
  except that `PhotoPicker`'s "Daily" and "Collection" buttons, and `DailyHub`'s `onLibrary`, keep
  working exactly as they do — Home doesn't intercept any existing screen-to-screen link.
- The Figma prototype's five-tab bottom bar is rejected: it is a second, larger project (every
  screen would need to coexist with permanent chrome none of them were built for), for a benefit
  the project owner didn't ask for.

### 4. "Browse Photos" and "Upload Yours" are two buttons, one screen

**Decision: confirmed — two CTAs into the existing `PhotoPicker`.**

`PhotoPicker` already has a `Source = 'curated' | 'upload'` toggle (`src/ui/PhotoPicker.tsx` L45,
internal state). It gains one new optional prop:

```ts
interface PhotoPickerProps {
  // ...existing props
  initialSource?: Source; // defaults to 'curated' if omitted
}
```

Home's "Browse Photos" sets `setScreen('setup')` with `initialSource: 'curated'`; "Upload Yours"
does the same with `'upload'`. `App.tsx` needs a small piece of state (or a ref, matching the
`originScreen`/`beforeWall` pattern already in the file) to carry that choice from the tap to the
`<PhotoPicker>` render. No new screen, no new step in the existing curated/upload flow — this only
saves a returning player the one tap PhotoPicker's own toggle already requires.

### 5. A "Continue" card appears only when exactly one puzzle is in progress

**Decision: confirmed — singular case only.**

When `libraryEntries.length === 1`, Home shows a compact "Continue [puzzle]" card under the header,
tapping it calls the same `handleOpenLibraryEntry` `Library`'s own cards use. When there are zero
in-progress puzzles, the card is omitted (nothing to continue). **When there are two or more, the
card is also omitted** — Home doesn't try to pick a "most recent" among several, since that's
already `Library`'s job and guessing wrong would send a player to the wrong puzzle. The "Your
Puzzles (N)" link below the CTAs is always present when `libraryEntries.length > 0`, regardless of
count, and is the way to reach any of them including the singular case.

### 6. The collection/streak teaser stays a teaser

**Decision: confirmed — teaser depth, not an embedded wall.**

Two small cards, side by side: a `StreakFlame`-derived card (flame glyph, count, week pips — reusing
`StreakFlame`'s non-compact rendering, not a new component) and a Collection card showing the three
most recently completed puzzles' thumbnails plus a completion count, linking to `openCollection()`
(existing helper) exactly as `Library`'s and `PhotoPicker`'s own "Collection" buttons do. No new
wall-rendering logic — both teasers read data `App.tsx` already loads (`completions`, `streak`) and
hand off to screens that already exist.

For a profile with `completions === 0` but `libraryEntries.length > 0` (has history via an
in-progress puzzle, never finished one), the Collection teaser is replaced with a single quiet card
— *"Your collection starts here. Finish a puzzle to light the first tile."* — matching `Library`'s
own convention of never presenting an apologetic empty state (`Library.tsx`'s own doc comment: *"A
first-time player never sees an empty shelf apologising to them"*). The Streak teaser follows the
same rule if `streak.completed.length === 0`.

---

## Component contract

```ts
interface HomeProps {
  dailyPreview: { title: string; photoUrl: string; pieceCount: number; resetsInMs: number; hintsIncluded: number };
  continuing: LibraryEntry | null;       // set only when libraryEntries.length === 1
  libraryCount: number;                  // for "Your Puzzles (N)"; 0 hides the link entirely
  streak: number;
  streakTone: StreakTone;
  weekPips: readonly DayCell[];          // from `@/daily/streak`, same shape StreakFlame already takes
  completions: readonly CompletionRecord[]; // last 3, for the teaser tiles; empty array is the empty-state case
  onDaily: () => void;
  onContinue: (puzzleId: string) => void;
  onLibrary: () => void;
  onBrowsePhotos: () => void;            // setScreen('setup'), initialSource: 'curated'
  onUploadYours: () => void;             // setScreen('setup'), initialSource: 'upload'
  onCollection: () => void;              // openCollection()
}
```

No prop here is new *data* — everything Home needs is already computed in `App.tsx` for `Library`'s
and `DailyHub`'s own props (`libraryEntries`, `completions`, `streak`, `streakLength`,
`streakTone`). Home is a new arrangement of existing state, not a new read path.

## Mockup fidelity note

The reviewed mockup's daily hero card uses the actual `mountain-lake-reflection.jpg` curated asset
(`assets/curated/mountain-lake-reflection.jpg`, also `FIRST_RUN_PHOTO_ID` in `App.tsx`) so the
photo shown matches a real puzzle rather than a placeholder gradient. This was a fidelity request
for the review artifact, not a new requirement on the implementation: the real Home screen's daily
hero already has a real thumbnail/photo available to it, the same way `DailyHub` and `Library`
render real thumbnails today (`todaysEntry.thumbnailBlob`, `entry.thumbnailBlob`) — no new
asset-loading logic is needed.

## Testing

- Unit: none of `board.ts`, `snap.ts`, or the tray change. If `Home`'s "which teaser/card shows"
  logic (Decisions 5 and 6's conditionals) grows any real branching, it's pure and testable the same
  way `first-run.ts`'s coach is — a plain function from `(libraryEntries, completions, streak)` to
  what Home should render, not embedded as JSX conditionals only.
- Browser: a new `test/browser/home.spec.ts` covering the entry decision itself — a profile with one
  in-progress puzzle lands on Home and shows the Continue card; a profile with zero history still
  lands on `'setup'` or `'first-run'` exactly as before (regression coverage for Decision 2); each
  CTA reaches the screen it claims to. Existing specs that open with pre-existing library state (if
  any, beyond the always-fresh `BoardPage.open()`) get audited for a new Home hop — that audit is a
  plan-time task, not a design-time claim.
