# Modernize phase a — type roles and tokens — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pairing B's type roles are defined once in `theme.css` and enforced by a test; the Today hero's scrim is the measured constant; buttons are pills.

**Architecture:** Roles become two CSS classes (`.eyebrow`, `.meta`) and a token or two. A node-side vitest scans `src/ui/**/*.tsx` and fails on mono outside an allowlist of sanctioned sites, and on off-scale tracking/weight — the machine-checkable form of "mono only for eyebrows and ticking numerals". The scrim alpha lives in a pure TS module with a contrast test, and Today reads its gradient from there.

**Tech Stack:** Tailwind v4 (`@theme`), React 19, Vitest (node), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-modernize-design.md` §3, §4 (scrim), §9 C2/C7/C8, §11 row a.

## Global Constraints

- Families unchanged: Inter Tight, IBM Plex Mono, Instrument Serif; all via `@fontsource`, no CDN.
- Type scale unchanged: `--text-1`…`--text-7` = 12 14 16 20 28 40 64, in rem.
- Pairing B: mono (`--font-data`) for eyebrows (tracked caps), *ticking* numerals (live `n / N`, timers), lens counts and the order numeral (spec §5 keeps both); everything else Inter Tight. Static metadata = Inter Tight 14 `tabular-nums`.
- Scrim: `rgb(8 9 11 / 0.82)` from the bottom to the eyebrow line, fading to 0 over the last 64px. Ink-secondary over pure white under it ≥ 4.5:1 (measured 6.7:1).
- Buttons: radius 999 (C8). Touch floor `--touch-min` unchanged.
- Gates: `npm test`, `npm run typecheck`, `npm run test:browser:smoke` per change; `npm run test:browser` (src/ui changed) and `npm run test:browser:full` (end of phase) before the PR.

## Review Focus

- Dynamic Type at 200%: `.meta` must stay rem-based so `dynamic-type.spec` still scales — Task 1 uses `var(--text-2)`.
- An unlayered class outranking a utility colour (Today's existing comment): `.meta` sets no colour, so callers' `text-[var(--ink-*)]` keeps working — Task 1 step 3.
- 12px → 14px metadata wrapping on a 402pt phone (PuzzleSetup rows, Settings sublines): checked by screenshot in Task 1 step 6.
- The hero scrim on a dark photo: higher alpha only darkens, never lowers contrast — no test needed beyond the white case.
- Pill buttons in Segmented/Toggle: those keep their own radius; only `kit/Button` and `Badge` change — Task 3.

**Deferred to the phase that redesigns each surface (ruling):** default body 14 → 16 and serif puzzle names (spec §3) touch layout on every screen; they land with Today (b), the top bar and tray (c), and phase-3 screens (e), where each surface is re-laid out anyway. Motion spring constants land with their consumers (c, d).

---

### Task 1: type roles — `.meta`, eyebrow tracking, and the role test

**Files:**
- Modify: `src/ui/theme.css` (tokens + `.meta`)
- Modify: every `src/ui/**/*.tsx` site listed below
- Create: `test/ui/type-roles.test.ts`

**Interfaces:**
- Produces: CSS `--tracking-eyebrow: 0.1em` (in `@theme`), `.eyebrow` reads it; `.meta { font-family: var(--font-ui); font-size: var(--text-2); font-variant-numeric: tabular-nums; }` — no colour.

Site mapping (`font-data text-1 …` → `meta …`, keeping each site's colour class):
Today 78, 139 · Library 71 · PauseSheet 166 · PhotoPicker 81, 202 · DailyHub 147 · StreakFlame 78, 94 · PuzzleSetup 137, 202, 266, 294 · CompletionCard 91 · CollectionWall 68 · kit/Settings 35 · Tray 187.
Controls to Inter Tight `text-2` (drop `font-data`): PhotoPicker 93, 106 · kit/Segmented 48 · App 1473 (group-name input).
Strays: PhotoPicker 134 `font-data text-1 uppercase tracking-wide …` → `eyebrow`; Badge `tracking-[0.08em]` → `tracking-[var(--tracking-eyebrow)]`; Tray 186 `font-medium` → removed. PieceChip 157 ("mat") → `text-1` without `font-data` (fits the 56px chip).
Mono stays at: TopBar (live `n / N`), LensChips (counts), PieceChip 152 (order numeral), MonthCalendar (phase e), Badge, `.eyebrow`.

- [ ] **Step 1: Write the failing test** `test/ui/type-roles.test.ts`: read every `.tsx` under `src/ui` (node `fs`), and assert

```ts
const MONO_ALLOWED = new Set(['TopBar.tsx', 'LensChips.tsx', 'PieceChip.tsx', 'MonthCalendar.tsx', 'kit/Badge.tsx']);
it('mono appears only at sanctioned sites (pairing B)', () => {
  expect(filesUsing(/\bfont-data\b|var\(--font-data\)/).filter((f) => !MONO_ALLOWED.has(f))).toEqual([]);
});
it('PieceChip uses mono only for the order numeral', () => {
  expect(countIn('PieceChip.tsx', /\bfont-data\b/)).toBe(1);
});
it('no off-scale tracking or weight', () => {
  expect(filesUsing(/\btracking-(wide|wider|widest|tight|\[0)/)).toEqual([]);
  expect(filesUsing(/\bfont-(medium|semibold|bold)\b/)).toEqual([]);
});
```

- [ ] **Step 2: Run** `npx vitest run test/ui/type-roles.test.ts` — expected FAIL listing Today, Library, PauseSheet, PhotoPicker, … and PhotoPicker/Badge/Tray for the strays.
- [ ] **Step 3: Add the tokens and `.meta`** to `theme.css` (below `.eyebrow`, with a comment naming pairing B and the spec).
- [ ] **Step 4: Migrate the sites** per the mapping.
- [ ] **Step 5: Run** the test, `npm test`, `npm run typecheck` — expected PASS.
- [ ] **Step 6: Look.** Screenshot Today, Puzzle setup, Pause sheet, Settings at 402 × 874 and compare with the baseline; no new wraps or clipped rows.
- [ ] **Step 7: Run** `npm run test:browser:smoke` — 14 pass.
- [ ] **Step 8: Commit** — `Type roles (pairing B): .meta for static metadata, mono only where it ticks`

---

### Task 2: the hero scrim is a measured constant

**Files:**
- Create: `src/ui/scrim.ts`
- Create: `test/ui/scrim.test.ts`
- Modify: `src/ui/Today.tsx:127` (the scrim `div`)

**Interfaces:**
- Consumes: `contrastRatio(a, b)` from `@/render/accent`.
- Produces: `HERO_SCRIM_RGB: readonly [8, 9, 11]`, `HERO_SCRIM_ALPHA = 0.82`, `HERO_SCRIM_FADE_PX = 64`, `heroScrimBackground(): string` (the CSS gradient), `scrimContrastOverWhite(ink: readonly [number, number, number], alpha?: number): number`.

- [ ] **Step 1: Write the failing test:**

```ts
const INK_SECONDARY = [0xb9, 0xc1, 0xcc] as const;
const INK_MUTED = [0x8a, 0x92, 0x9e] as const;
it('keeps --ink-secondary at AA over a pure white photo', () => {
  expect(scrimContrastOverWhite(INK_SECONDARY)).toBeGreaterThanOrEqual(4.5);
});
it('is guarding a real number: 0.70 would fail', () => {
  expect(scrimContrastOverWhite(INK_SECONDARY, 0.7)).toBeLessThan(4.5);
});
it('is why --ink-muted never goes on the hero', () => {
  expect(scrimContrastOverWhite(INK_MUTED)).toBeLessThan(4.5);
});
it('renders the gradient from the constants', () => {
  expect(heroScrimBackground()).toContain('rgb(8 9 11 / 0.82)');
  expect(heroScrimBackground()).toContain('calc(100% - 64px)');
});
```

- [ ] **Step 2: Run** `npx vitest run test/ui/scrim.test.ts` — FAIL, module missing.
- [ ] **Step 3: Implement `src/ui/scrim.ts`** — composite the scrim over white per channel (`c × (1 − α) + scrim × α`), then `contrastRatio`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Use it in Today:** the scrim `div` drops its `bg-gradient-to-t from-… via-… to-transparent` classes and takes `style={{ background: heroScrimBackground() }}`, padding top 72px (`pt-[72px]` is off-scale; use `pt-7` = 64px plus the existing gap — ruling if it reads short).
- [ ] **Step 6: Run** `npm test`, `npm run typecheck`, smoke.
- [ ] **Step 7: Commit** — `Today: the hero scrim is a measured constant (6.7:1 over white)`

---

### Task 3: pill buttons

**Files:**
- Modify: `src/ui/theme.css` (`--radius-pill: 999px` in `@theme`)
- Modify: `src/ui/kit/Button.tsx`, `src/ui/kit/Badge.tsx`

- [ ] **Step 1:** Add to `type-roles.test.ts` (rename the describe to "chrome tokens"): `it('Button and Badge are pills (C8)', …)` asserting both files contain `rounded-[var(--radius-pill)]` and neither contains `radius-md` / `radius-sm`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3:** Token + swap the radius class in both files; update Button's doc comment (C8, spec date).
- [ ] **Step 4: Run** `npm test`, typecheck, smoke — PASS. Screenshot Today and Puzzle setup at 402pt.
- [ ] **Step 5: Commit** — `Kit: buttons and badges are pills (C8)`

---

### Task 4: gates and PR

- [ ] `npm run build` + `node scripts/check-bundle-budget.mjs`; `npm run test:browser`; `npm run test:browser:full`.
- [ ] Final whole-branch review (fresh reviewer), fix pass per executing-plans.
- [ ] Push `claude/modernize-a` (stacked on PR 0's branch) and open PR "Modernize a: type roles (pairing B), measured scrim, pill buttons" against `main`, noting it stacks on #22. Owner check: read Today and the setup screen at arm's length on the phone.
