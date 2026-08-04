# Step 6 — Daily and streak (local-only)

**Written:** 2026-08-03
**Status:** design, not yet implemented
**Branch context:** built on top of `step-5b-puzzle-setup`, which now also carries all of step 5c
(library, `SessionSnapshot` save/resume, pause sheet, again-harder, `dev.html` deletion, EXIF/HEIC).
5b's PR is merged (#8); 5c's commits are on the branch and not yet PR'd — see `handoff.md` §1f.3.

## Scope

`PLAN.md`'s Step 6, and the design doc's screen 11 ("Daily hub — not started · in progress · done
today · streak with freezes · streak broken with repair offer · month calendar") and its
"Streak flame" component ("count, freeze pips, at-risk state, broken with repair offer. Never
scolds").

- Deterministic daily puzzle: the same `(photoId, pieceCount, seed)` for everyone, from the date
  alone. Resets 00:00 **local**.
- A Daily hub screen: today's card, streak flame, week pips, month calendar of completions.
- Streak with freezes: one freeze earned per 7-day streak, auto-spent on a missed day; one manual
  repair per month.
- Daily completion increments the streak, and the completion banner says so.
- **No leaderboard tab** — `PLAN.md` and the design doc both say v1 ships streak-only.

**Explicitly out of scope, by decision:**

- **Supabase, Edge Functions, accounts, timezone-on-the-server, server-side streak validation.**
  `PLAN.md` describes streak logic in an Edge Function; the project owner scoped this pass to
  local-only. "Play stays account-free forever" holds, and everything here is IndexedDB. The
  server-side move is a later step, and §14's conflict rule ("the snapshot with more placed pieces
  always wins") is what it will need — not anything this pass builds.
- **Pre-seeding daily puzzles months ahead.** `PLAN.md` asks for that because it assumes a server
  table. A closed-form function of the date needs no table and cannot have a missing day, which
  satisfies the requirement it was protecting ("a missing day must never break the hub") more
  strongly than pre-seeding does.
- The full completion card, collection wall, and share (Step 8). This pass touches
  `CompletionBanner` only to add the streak line.

---

## Decisions

### 1. The daily is an ordinary puzzle with a deterministic id

`puzzleId = 'daily-' + dateKey` (e.g. `daily-2026-08-03`), `seed = seedFromPuzzleId(puzzleId)`.

Everything 5c built then applies unchanged: the daily autosaves through the same
`PlayRuntime.snapshot()` path, stores its photo blob and thumbnail under the same keys, resumes
through the same `Board.restore`, and is deleted on "Done" by the same `deleteLibraryEntry`. **No
new persistence path for in-progress dailies exists or should exist.** The only genuinely new
durable state is the streak record.

### 2. Entry flow is unchanged; the hub is a peer screen

`App.tsx`'s mount check keeps 5c's rule exactly — library if any entry exists, otherwise the picker.
The hub is reached from a **`StreakFlame` button in the `Library` header** and a **"Today's puzzle"
link in the `PhotoPicker` header** (so a first-run player, who never sees the library, can still
reach it).

Making the hub the app's root was considered and rejected: the "an empty library never apologises to
a first-time player" rule is load-bearing, already covered by `library.spec.ts`, and the design doc
specifies the hub as *a screen*, not as home. Which screen is home is a navigation question that
belongs to whichever step adds real navigation, not to this one. A useful side effect: `BoardPage`'s
entry walk in `test/browser/board-page.ts` needs no change at all, for the first step since 5a.

### 3. Today's daily lives on the hub; a past daily is an ordinary library card

`Library` filters out exactly one entry — the one whose `puzzleId` is `dailyPuzzleId(today)` — so the
in-progress daily is not offered in two places at once. Yesterday's unfinished daily is no longer
"today's" and appears in the library as a normal in-progress puzzle.

The alternative (deleting stale dailies) was rejected: it silently destroys a player's progress, and
this product has no lose state.

### 4. Photo selection is a closed form, and never repeats two days running

```
N     = CURATED_PHOTOS.length (6)
day   = whole days since 1970-01-01, from the date key's Y/M/D via Date.UTC
cycle = floor(day / N)
rot   = floor(rngFor(DAILY_STREAM_SEED, 'dailyPhotoCycle', cycle).next() * N)
raw(k)= (day * STEP + rot) % N,  STEP = 5
```

`STEP = 5` is coprime with `N = 6`, so within a cycle consecutive days can never land on the same
photo. Only a cycle boundary can collide, and one lookback fixes it: if `raw(k) === raw(k-1)`, use
`(raw(k) + 1) % N`. That lookback is well-founded rather than recursive — two consecutive days can
never both be cycle boundaries when `N ≥ 2`, and `STEP ≢ 1 (mod N)` rules out the one case where a
bumped predecessor could collide forward. **This is a testable property, not a hope:** no repeat over
400 consecutive days.

`rngFor` with its own `'dailyPhotoCycle'` stream, per `CLAUDE.md`'s per-concern PRNG invariant.
`DAILY_STREAM_SEED` is a fixed constant, not a per-user value — "same `(imageId, pieceCount, seed)`
for everyone" is the requirement.

**Note for shipping:** the curated set is still six procedurally-drawn scenes, not real photographs
(§1e of `handoff.md`). A six-photo daily rota repeats every six days. That is a content problem, not
an architecture one — `CURATED_PHOTOS` growing to fifty makes this good with no code change — but it
should not ship at six.

### 5. Piece count has a weekly rhythm

`DAILY_COUNT_BY_WEEKDAY = [150, 100, 100, 150, 150, 200, 200]`, indexed Sunday..Saturday: light
midweek, heavier at the weekend. The doc says nothing about daily counts, so this is a judgment call,
flagged as such in the code. Every value is on `PIECE_COUNT_LADDER`.

The daily is **Classic, rotation off, standard tolerance, no assists** — a fixed configuration, since
the whole point is that everyone plays the same puzzle. There is no setup screen in the daily flow.

### 6. The streak state, and what "generous" means numerically

```ts
interface StreakState {
  version: 1;
  completed: string[];        // ascending, unique date keys
  frozen: string[];           // days a freeze or a repair covered
  freezes: number;            // banked, unspent
  lastRepairMonth: string | null;   // 'YYYY-MM'
  settledThrough: string | null;    // the last day `settle` walked to
}
```

A day counts toward the streak if it is in `completed` **or** in `frozen`. `settledThrough` is what
stops a second app-open on the same day from spending a second freeze on the same gap.

| Constant | Value | Why |
|---|---|---|
| `FREEZE_EVERY` | 7 | `PLAN.md`: one freeze earned per 7-day streak |
| `MAX_FREEZES` | 3 | Not in any doc. A cap so a long streak cannot become unbreakable — judgment call |
| `REPAIR_MAX_GAP_DAYS` | 7 | Not in any doc. A repair covers up to a week away; longer and one tap would resurrect a streak the player did not have — judgment call |

`settle(state, today)` runs on hub open: it walks each day from `settledThrough` (or the last
completed day) up to *yesterday*, spending a banked freeze on any uncovered day, and **stops at the
first day it cannot cover** — the streak is broken there, and no further freezes are wasted on it.
Today is never settled; it is still playable.

`streakLength` counts back from today if today is covered, otherwise from yesterday. **A day that has
not been played yet does not break the streak** — it is the at-risk state, not the broken one.

### 7. Copy never scolds

The design doc's Streak flame component says so outright, and §15 names a broken streak the #1 churn
event. So:

- At risk (today unplayed): "Play today's to keep it going." Never "don't lose your streak".
- Broken, repairable: "Your 12-day streak ended. Repair it?" with a **Repair streak** button.
- Broken, not repairable this month: "Your 12-day streak ended. A new one starts today." No apology,
  no guilt, no mention of the repair that is unavailable.
- Zero streak, never played: "Start a streak." The empty state is an invitation (§ the library's
  same rule).

### 8. Colour is never the only signal

`CLAUDE.md` invariant. Week pips and month-calendar cells carry a glyph as well as a fill — `●`
completed, `◇` frozen, `·` missed — and every cell has a full text `aria-label` ("3 August:
completed"). The month grid is a `<table>` with real day-of-week headers, not a `div` grid.

---

## Module layout

```
src/daily/
  dates.ts    localDateKey, parseDateKey, addDays, daysSinceEpoch, weekdayOf,
              monthKeyOf, daysInMonth, compareDateKeys — pure, UTC arithmetic
  daily.ts    dailyPuzzleId / isDailyPuzzleId / dailyDateKeyOf / dailyFor —
              the closed-form date → (photo, count, seed)
  streak.ts   StreakState, emptyStreak, settle, recordCompletion, streakLength,
              canRepair, repair, weekPips, monthGrid — all pure

src/persist/
  daily.ts    loadStreak() / saveStreak() over a new `daily` object store

src/ui/
  DailyHub.tsx      the screen
  StreakFlame.tsx   count, freeze pips, at-risk / broken / repair states
  MonthCalendar.tsx the month grid
```

`src/daily/` is DOM-free and therefore fully vitest-covered, which is this codebase's line between
"tested" and "judged by hand". `src/persist/daily.ts` is IndexedDB and has no unit surface — it is
covered by the browser spec, exactly as the rest of `src/persist/` is.

**`db.ts` goes to `DB_VERSION = 2`** with a fourth store, `daily`. The existing `onupgradeneeded`
already guards every `createObjectStore` with a `contains` check, so the bump is purely additive and
an existing player's sessions, photos, and thumbnails survive it. That property is worth an explicit
assertion in the browser spec, because getting it wrong deletes every in-progress puzzle a real
player has.

## Testing

**Vitest** — `test/daily/dates.test.ts`, `test/daily/daily.test.ts`, `test/daily/streak.test.ts`:

- Date keys are local, not UTC. The failing-in-production case is a player at UTC-5 at 21:00, whose
  `toISOString().slice(0,10)` is already tomorrow — the daily would flip three hours early.
- `addDays` across a month boundary, a year boundary, and a leap day.
- No photo repeat across 400 consecutive days; the same date always yields the same puzzle.
- Streak: a clean run of 7 earns exactly one freeze; a missed day auto-spends it; a second missed day
  with an empty bank breaks the streak; settling twice in one day spends only one freeze; repair
  works once per calendar month and not twice; a gap longer than `REPAIR_MAX_GAP_DAYS` is not
  repairable; an unplayed today is at-risk, not broken.

The load-bearing one is **"settling twice in one day spends only one freeze"** — the failure is
silent and slow: a player who opens the app three times on a Monday quietly loses their whole freeze
bank, and nothing on screen ever says so.

**Playwright** — `test/browser/daily.spec.ts`:

- The hub is reachable from the library and from the picker.
- "Start today's" goes straight to a board with no picker, crop, or setup screen in between.
- The daily is deterministic: reload, reopen, and the same grid comes back.
- An in-progress daily shows on the hub as "Continue today's" and is **not** duplicated as a library
  card.
- Completing a daily takes the streak from 0 to 1 and the banner says so.
- The `DB_VERSION` 1 → 2 upgrade preserves an existing session record.

**Real-hardware check:** the standing gate, open since 5a. Nothing in this pass is gesture-sensitive,
so it is a lighter one than 5b's — but the month calendar's 44pt touch floor on a phone is a real
question Chromium will answer wrong.

## Open questions carried forward

- **Six curated photos is a six-day rota.** Tracked as content, per §4 above.
- **Local time is trivially cheatable** — a player can set the clock forward and play a week of
  dailies. Deliberately unaddressed: with no accounts and no leaderboard there is nothing to cheat
  *for*, and the server-side validation `PLAN.md` specifies belongs with the Edge Function that is
  out of scope here.
- **Streak history is unbounded.** `completed` grows by one string a day; ten years is 3650 strings,
  well under a hundred kilobytes. Not worth pruning, and pruning would break the month calendar for
  past months if it is ever made scrollable.
