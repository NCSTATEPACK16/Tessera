# Session prompt — redundancy and test-suite review (for Claude Fable 5.1)

> Paste everything below the line into a new session in `/Users/johnbradner/Documents/ClaudeWork/Tessera`.
> Run it **before** the modernization session (`2026-11-15-fable-modernize-web-and-ios.md`), so
> that session works against the faster gates this one produces.

---

You are reviewing **Tessera**, a photo jigsaw (React + canvas, Vite, Capacitor iOS shell), for
redundancy in its code and its tests. The goal is **faster delivery of code changes without
giving up the guarantees that matter.** Right now a change has to pass `npm test` (~675 vitest
assertions in 46 files), `npm run typecheck`, `npm run build`, and `npm run test:browser` (~125
Playwright tests in 20 specs, about 4 minutes on a quiet machine, 3 projects, 4 workers), plus
`test:browser:full` before every PR. That's too slow for the pace the owner wants, and some of
it is probably duplicated.

This session produces a **report first, then changes only after the owner approves it.**

## Read first, in this order

1. `CLAUDE.md`: the invariants, the coordinate spaces, and especially **Testing posture**. It
   names the load-bearing tests and explains why each exists. Treat every test it names as
   protected unless you can show another test covers the same failure.
2. `handoff.md` and `gh pr list --state all --limit 10`. `PLAN.md` checkboxes lag merges. The
   handoff is the more recent account.
3. `docs/superpowers/specs/2026-10-18-v2-redesign-design.md` §9: the slice checklist, so you know
   what is still coming and don't cut a test that a pending slice depends on.
4. `playwright.config.ts`, `test/browser/board-page.ts`, `.github/workflows/ci.yml`,
   `scripts/check-*.mjs`.

Use the jCodemunch tools for navigation (`plan_turn`, `search_symbols`, `find_references`,
`find_dead_code`, `get_blast_radius`). The user's global `CLAUDE.md` requires it.

## State of the repo when this was written (verify, don't trust)

- `main` is at `92b0bf7` (PR #20, v2 slice 4: the Capacitor iOS shell, `src/platform/` with
  haptics, fonts bundled via `@fontsource`, and `docs/TESTING-IOS.md`). Slices 2 and 4 are merged,
  and slice 3 (`/privacy`, telemetry) is not. Start your own branch from `main`.
- The browser suite has **not** had a clean full run since slice 4. Its last two local runs were
  wrecked by machine load (60s timeouts, no assertion failures). Take your baseline timing on a quiet
  machine before measuring any proposal against it.
- `ios/` is a native project. No test covers it, and CI doesn't build it. Don't propose
  removing anything there. The `isNative` branches in `src/main.tsx` and `src/ui/Today.tsx` are
  live code on iOS even though the web suite never takes them, so `find_dead_code` may wrongly
  flag them as dead.
- There are stale worktrees under `.claude/worktrees/` and `.worktrees/`, including
  `fix-tray-review-bugs`, `native-ios-capacitor-shell`, `step-5a-…` and `step-6-…`. jCodemunch's
  index includes their copies of `src/`, so filter search results to the real `src/` and `test/`.
- The machine is shared with other projects. A browser run measured 40 minutes at load average
  ~790. **Record `uptime` next to every timing you report**, and only compare timings taken at
  similar load.

## Part A — test-suite review

### A1. Inventory

Build a table of every test file, unit and browser, with these columns:

| Column | Meaning |
|---|---|
| file / test | path and test title |
| wall time | measured, from `--reporter=json` (Playwright) and `vitest --reporter=json` |
| guards | the invariant, bug, or behaviour it exists for, in one line; quote the comment if the file says |
| also guarded by | any other test that would fail on the same defect |
| proposal | **keep** · **merge into X** · **delete** · **demote to `@slow`** · **move to unit** |

Known starting points (check each one, don't assume):

- `home.spec.ts` (4 tests) predates the three-tab shell. `Home.tsx` became `Today`, and
  `tabs.spec.ts` (8 tests) now covers the shell. Likely overlap.
- `tray.spec.ts` (11) vs `tray-3b.spec.ts` (18, 554 lines): find any assertions made twice.
- `library.spec.ts` (2), `reference-panel.spec.ts` (1), `golden-cut.spec.ts` (1): each boots a
  browser for very little. Can they fold into a neighbouring spec's existing setup?
- `first-run.spec.ts` (10 tests, 323 lines): which tests are about the coach, and which re-test
  play mechanics that other specs already cover?
- `dynamic-type.spec.ts` and `comfort.spec.ts` both test target sizes at scale.
- Browser tests that assert pure logic (a computed value, a string) belong in vitest instead.
  Vitest runs in node, so "DOM-free is the same word as tested". Move them there.
- Unit files over 400 lines (`session.test.ts` 684, `pointer.test.ts` 435, `snap.test.ts` 424,
  `board.test.ts` 380, `tray-deploy.test.ts` 375): look for table-driven duplicates and
  copy-pasted setup.

### A2. Protected tests (do not propose deleting these)

These are from `CLAUDE.md`. A merge that keeps their assertion intact is fine.

- `test/cut/interlock.test.ts`: tabs exactly reverse their sockets, determinism from the seed.
- `test/tray/lenses.test.ts`: every lens's output is a subsequence of the canonical order.
- `test/play/tray-deploy.test.ts`: the tray never leaks into the scene.
- The forest case in `test/tray/colour.test.ts`.
- `test/play/workset.test.ts`: a piece is in at most one Workset, and membership ends on merge.
- `test/browser/invariants.spec.ts`: the board never re-renders through React, and an idle board
  draws nothing.
- The end-to-end streak test in `daily.spec.ts`, which was mutation-checked against
  `recordCompletion`.
- `scripts/check-bundle-budget.mjs` (`__tessera` must never reach `dist/`) and
  `scripts/check-pwa-build.mjs`.

### A3. Proof rule for every deletion or merge

`CLAUDE.md` says that **a test that passes at both extremes of the constant it is guarding is not
testing that constant.** The reverse applies here: before you call test X redundant with test Y,
**break the code X guards and show that Y fails.** Record the mutation you made and Y's failure
line in the report. "They look similar" is not evidence. If Y doesn't catch it, X stays.

### A4. Making the gate faster (proposals, with a measured number for each)

- **A tiered gate.** A fast **smoke** tier (`@smoke`, target under 60s) that runs on every change:
  boot, the three-tap funnel, one drag-and-snap, a solve to the card, and both invariants. The
  current `test:browser` becomes the pre-PR tier, and `:full` (with `@slow`) runs in CI only.
  Write down exactly which tests make up `@smoke` and why each one is there.
- **Changed-files selection.** A script that maps changed `src/` paths to the specs that exercise
  them, falling back to the full suite for any path it doesn't know. Only propose this if the map
  can be kept honest (for example, generated from coverage) rather than maintained by hand.
- **The `timing` project runs serially before the others start** (`dependencies: ['timing']`).
  Measure what that costs. The mutation-count assertions need a quiet CPU, but do they need to
  block the dock and phone projects?
- **Sharding in CI** (`--shard`) across 2–3 jobs, and whether `retries: 1` is hiding flakes.
- **Cheaper setup.** Count `BoardPage.open()` cut-and-boot cycles per spec. A shared
  `storageState` or a fixture-level warm board may remove most of them.
- **Vitest:** `--pool=threads`, isolation settings, and which files dominate the run.

For each proposal, give its **before and after wall time (with `uptime`)** and the risk it adds.

## Part B — code redundancy review

Report, don't fix, until approved:

- **Dead code.** Run `find_dead_code` / `get_dead_code_v2` across `src/`. Confirm each hit with
  `find_references` before listing it. Check especially for leftovers from the Home→Today and
  Library-header changes, the deleted `dev.html` harness, and Plan 0's removal of workset
  collapse (`isHidden`).
- **Duplicated UI markup.** Find hand-written class strings that `src/ui/kit/` (`Button`,
  `Toggle`, `Segmented`, `Badge`, `SettingsGroup/Row`) now replaces. Phase 1 of the modern-look
  spec swapped in only the drop-in cases.
- **`src/ui/App.tsx` (1,583 lines) and `src/play/runtime.ts` (1,150 lines).** Propose seams that
  would shrink them without crossing an invariant. Above all, **the board must never re-render
  through React**, and `runtime.ts` is the one place play events fan out to audio, light, and
  (on slice 4) haptics. Name the extraction, the files it creates, and the blast radius
  (`get_blast_radius`).
- **Duplicated logic** between `src/` and `scripts/`, between `persist/` modules, and between the
  daily and library save paths. There must be **no** second save path for dailies (`CLAUDE.md`).
- **Repo hygiene.** Stale worktrees and branches that are fully merged (`git branch --merged
  main`), and `test-results/` / `dist/` not ignored. List these and **don't delete anything**.
  Removing a worktree or branch is the owner's call.

## Deliverables

1. `docs/superpowers/specs/2026-11-15-redundancy-and-test-review.md`: the inventory table, the
   mutation evidence for each proposed removal, the gate proposals with measured times, and the
   code-redundancy findings. Rank everything by **minutes saved per week** against **risk**.
2. Stop and ask the owner which proposals to take. Use `AskUserQuestion` with the top
   recommendations pre-selected.
3. Then implement the approved items on a branch from `main`, one commit per proposal, so any one
   can be reverted. After each commit, run the (new) gate. At the end, run
   `npm run test:browser:full` on a quiet machine, and report the before/after suite time and the
   pass counts.

## Never

- Delete a test you haven't mutation-checked against its claimed duplicate.
- Weaken `invariants.spec.ts`, raise a timeout, or add a `retry` to make something pass.
- Change product behaviour, design, or copy. That's the modernization session's job.
- Push to `main`, or remove branches and worktrees.
- Edit `docs/Tessera Design Doc.dc.html`, `docs/DESIGN_BRIEF_Tessera.md`, or `PLAN.md`. They're the
  owner's sources of truth.
