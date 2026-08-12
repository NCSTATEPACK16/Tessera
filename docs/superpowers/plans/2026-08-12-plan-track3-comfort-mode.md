# Track 3 — Comfort Mode, Contrast Gates, Dynamic Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** One `comfort` flag that widens control targets to 60pt, exaggerates the lift, floors snap
tolerance at Generous, and damps tremor on the drag path — plus three changes that are not
comfort-gated because every player benefits from them: a real WCAG contrast gate on the extracted
accent, adaptive ghost-underlay opacity, and Dynamic Type support for the seven text tokens.

**Architecture:** `PuzzleAssists.comfort` is the one new piece of state (`src/play/setup.ts`), read
by `PlaySession` (lift, snap floor), `src/input/pointer.ts` (tremor damping), and `App.tsx`/`theme.css`
(a `data-comfort` attribute that retargets the existing `--touch-min` custom property everything
already reads). The contrast gate, adaptive ghost, and Dynamic Type changes touch
`src/render/accent.ts`, `src/render/renderer.ts` + `src/play/runtime.ts`, and `theme.css` +
~144 call sites respectively, and none of the three depend on the comfort flag being on.

**Tech Stack:** TypeScript, React 19, vitest (node env), Playwright, Tailwind v4 (`@theme`).

**Depends on:** nothing from Tracks 4 or 5. Track 4 (step 7) reads `comfort` to offer it by name
during onboarding, but that reference is one-directional — this plan does not touch first-run.

## Explicitly out of scope

**Instrumentation (report §1.1.6) — deferred, not built here.** Supplementary-attempts-per-piece
and time-to-seat are the right objective accessibility metrics, but the obvious wiring routes
per-attempt data through `RuntimeSummary` and breaks *the board never re-renders through React*. If
it lands later, it lands the way `elapsedMs`/`cleanRun` already do — frozen into the summary on the
`complete` event only, never per frame. No task below touches this.

## Global Constraints

- **One flag, one place.** `PuzzleAssists.comfort: boolean`, toggled in `PauseSheet` beside the
  three existing assists. Every comfort-gated behaviour reads it from there — no second source of
  truth.
- **Comfort-gated:** 60pt control targets, `heldLift.scale` 1.06 → 1.20, snap difficulty floored at
  `generous`, tremor damping.
- **Not comfort-gated — every player gets these:** the WCAG contrast gate on `accent`, adaptive
  ghost-underlay opacity, Dynamic Type token conversion.
- **Tremor damping must not delay `MOVE_THRESHOLD_PX` promotion** — the press-to-drag threshold
  check runs on the raw, undamped sample. A damped promotion reads as lag, not steadiness.
- **A test that passes at both extremes of the constant it guards is not testing that constant**
  (`CLAUDE.md`'s testing posture). The contrast-gate tests below use a concrete near-miss
  (a saturated blue at the accent clamp's own `L = 0.62` floor computes to a 4.48:1 ratio against
  `--mat-raised` — under the 4.5:1 AA floor by a hair), not a synthetic pass-by-construction case.
- **Constants not measured from real use are flagged as chosen, not measured**, the way `hints.ts`
  and `setup.ts`'s `MIN_PIECE_IMAGE_PX` already are. Revisit on hardware.
- **Colour is never the only signal. Touch target floor 44pt** (60pt under comfort).
- **`npm run test:browser` is a gate, not an optional extra.**
- Commands: `npm test` · `npm run typecheck` · `npm run build` · `npm run test:browser`

---

### Task 1: The comfort flag — control targets, lift, and the snap floor

**Files:**
- Modify: `src/play/setup.ts`, `src/play/session.ts`, `src/play/runtime.ts`, `src/ui/App.tsx`,
  `src/ui/PauseSheet.tsx`, `src/ui/theme.css`
- Test: `test/play/setup.test.ts`, `test/play/session.test.ts`, `test/browser/comfort.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PuzzleAssists.comfort: boolean`; `floorDifficulty(difficulty, comfort): SnapDifficulty`
  in `setup.ts`; `PlaySession.setComfort(comfort: boolean): void`; `PlaySessionOptions.comfort?:
  boolean`. Task 3 (hit-slop) and Task 2 (tremor damping) both read `assists.comfort` via the same
  `App.tsx` state this task wires.

- [ ] **Step 1: Write the failing unit tests**

```ts
// test/play/setup.test.ts — add to the existing file, alongside the DEFAULT_PUZZLE_CONFIG block
import { floorDifficulty } from '@/play/setup';

describe('DEFAULT_PUZZLE_CONFIG', () => {
  it('defaults comfort off, alongside the other three assists', () => {
    expect(DEFAULT_PUZZLE_CONFIG.assists).toEqual({
      ghostOpacity: 0,
      edgeHighlight: false,
      largePieceMode: false,
      comfort: false,
    });
  });
});

describe('floorDifficulty', () => {
  it('leaves difficulty alone when comfort is off', () => {
    expect(floorDifficulty('precise', false)).toBe('precise');
    expect(floorDifficulty('standard', false)).toBe('standard');
  });

  it('floors precise and standard to generous when comfort is on', () => {
    expect(floorDifficulty('precise', true)).toBe('generous');
    expect(floorDifficulty('standard', true)).toBe('generous');
  });

  it('leaves generous alone when comfort is on — it is already at the floor', () => {
    expect(floorDifficulty('generous', true)).toBe('generous');
  });
});
```

```ts
// test/play/session.test.ts — add near the existing heldLift/scene assertions
import { COMFORT_LIFT_SCALE, LIFT_PX, LIFT_SCALE } from '@/play/session';

describe('comfort and the held lift', () => {
  it('scenes at the ordinary lift scale by default', () => {
    const session = /* existing session-construction helper used elsewhere in this file */
      makeSession({});
    session.grab(/* existing grab helper/fixture */ 0);
    expect(session.scene().heldLift).toEqual({ offsetPx: LIFT_PX, scale: LIFT_SCALE });
  });

  it('lifts higher once comfort is set', () => {
    const session = makeSession({});
    session.setComfort(true);
    session.grab(0);
    expect(session.scene().heldLift).toEqual({ offsetPx: LIFT_PX, scale: COMFORT_LIFT_SCALE });
  });

  it('takes comfort from construction too, not only from setComfort', () => {
    const session = makeSession({ comfort: true });
    session.grab(0);
    expect(session.scene().heldLift.scale).toBe(COMFORT_LIFT_SCALE);
  });
});
```

Use whatever session-construction and grab helpers the existing `heldLift`/`scene()` tests in
`test/play/session.test.ts` already call — do not invent new ones; this file has fixtures for
exactly this already (`session.ts:710`'s `heldLift` field is already under test there).

- [ ] **Step 2: Run to verify both fail**

Run: `npx vitest run test/play/setup.test.ts test/play/session.test.ts`
Expected: FAIL — `comfort` is not a key of `PuzzleAssists`, `floorDifficulty` and
`COMFORT_LIFT_SCALE` do not exist.

- [ ] **Step 3: `setup.ts` — the flag and the floor**

```ts
// src/play/setup.ts — extend PuzzleAssists and DEFAULT_PUZZLE_CONFIG
export interface PuzzleAssists {
  ghostOpacity: number;
  edgeHighlight: boolean;
  largePieceMode: boolean;
  /** §C Track 3: one flag, read by the lift, the snap floor, tremor damping, and 60pt targets. */
  comfort: boolean;
}

export const DEFAULT_PUZZLE_CONFIG: PuzzleConfig = {
  targetCount: 150,
  mode: 'classic',
  rotation: false,
  difficulty: 'standard',
  assists: {
    ghostOpacity: 0,
    edgeHighlight: false,
    largePieceMode: false,
    comfort: false,
  },
};

/**
 * Comfort mode floors snap tolerance at Generous — the widest band, never the
 * player's own choice of a tighter one. `generous` is already the floor for
 * itself; nothing below it exists on the ladder.
 */
export function floorDifficulty(difficulty: SnapDifficulty, comfort: boolean): SnapDifficulty {
  return comfort ? 'generous' : difficulty;
}
```

- [ ] **Step 4: `session.ts` — the comfort-scaled lift**

```ts
// src/play/session.ts — near the existing LIFT_PX/LIFT_SCALE constants (line 35-37)
export const LIFT_PX = 8;
export const LIFT_SCALE = 1.06;
/** §C Track 3: comfort mode's exaggerated lift — easier to track by eye and by hand. */
export const COMFORT_LIFT_SCALE = 1.2;
```

Add a `comfort` field, read from options and settable live, in the shape `setDifficulty` (line 293)
already uses:

```ts
// PlaySessionOptions — add alongside the existing `difficulty?: SnapDifficulty`
comfort?: boolean;
```

```ts
// constructor (line 208-213) — after `this.difficulty = options.difficulty ?? 'standard';`
this.comfort = options.comfort ?? false;
```

```ts
// a new private field, next to `private difficulty: SnapDifficulty;`
private comfort: boolean;
```

```ts
// alongside setDifficulty (after line 295)
/** Step 5c's pause sheet toggles this live, same as tolerance and the other assists. */
setComfort(comfort: boolean): void {
  this.comfort = comfort;
}
```

In `scene()` (line 710), replace the hardcoded constants:

```ts
heldLift: { offsetPx: LIFT_PX, scale: this.comfort ? COMFORT_LIFT_SCALE : LIFT_SCALE },
```

- [ ] **Step 5: `runtime.ts` — wire assists.comfort through to the session and the difficulty floor**

```ts
// src/play/runtime.ts — DEFAULT_ASSISTS (line ~53) gains the field
const DEFAULT_ASSISTS: PuzzleAssists = {
  ghostOpacity: 0,
  edgeHighlight: false,
  largePieceMode: false,
  comfort: false,
};
```

In `setAssists` (the method already shown reading `this.renderer.setGhostUnderlay` etc.), add:

```ts
setAssists(assists: PuzzleAssists): void {
  this.liveAssists = assists;
  this.renderer.setGhostUnderlay(this.ghostSource, assists.ghostOpacity);
  this.renderer.setEdgeHighlight(assists.edgeHighlight);
  this.controls?.setMinRelativeZoom(assists.largePieceMode ? REGION_LENS_ZOOM : MIN_ZOOM);
  this.session?.setComfort(assists.comfort);
  this.liveDifficulty = floorDifficulty(this.liveDifficulty, assists.comfort);
  this.session?.setDifficulty(this.liveDifficulty);
  this.render();
}
```

Import `floorDifficulty` from `@/play/setup`. In `start()`, where `PlaySession` is constructed,
pass `comfort: this.liveAssists.comfort` into its options, and floor `this.liveDifficulty` the same
way before the session is built — a puzzle resumed with comfort already on in its saved snapshot
must not open at Precise.

- [ ] **Step 6: `App.tsx` — the `data-comfort` attribute**

Find the existing accent `useEffect` (writes `--accent` etc. onto `document.documentElement`,
around line 865-874) and add a sibling effect right after it, keyed on the live assists state this
file already threads to `PauseSheet` (`liveAssists`):

```ts
// §C Track 3: the one place comfort's 60pt control-target retarget happens.
// `theme.css`'s `--touch-min` is already what every button and `.touch-target`
// element reads (Task 3) — flipping this attribute is the whole mechanism.
useEffect(() => {
  const comfort = (liveAssists ?? playConfig.assists).comfort;
  document.documentElement.toggleAttribute('data-comfort', comfort);
}, [liveAssists, playConfig.assists]);
```

- [ ] **Step 7: `theme.css` — the retarget**

```css
/* §C Track 3: comfort mode retargets the one variable every touch target reads. */
[data-comfort] {
  --touch-min: 60px;
}
```

This alone changes nothing for the ~40 call sites still hardcoding `min-h-[44px]` — that
consolidation is Task 3. The global `button, [role='button']` rule (`theme.css:95-100`) already
reads `var(--touch-min)`, so every plain button widens for free the moment this lands.

- [ ] **Step 8: `PauseSheet.tsx` — the fourth toggle, and disabling the two tolerances it overrides**

Add a fourth assist toggle in the same shape as `edgeHighlight`/`largePieceMode` (after the "Large
piece mode" block, before the closing `</div>` of the settings card):

```tsx
<div className="flex items-center justify-between">
  <div className="text-[13px] text-[var(--ink-primary)]">Comfort mode</div>
  <button
    type="button"
    aria-label="Comfort mode"
    aria-pressed={assists.comfort}
    onClick={() => onAssistsChange({ ...assists, comfort: !assists.comfort })}
    className={`min-h-[44px] min-w-[44px] rounded-[var(--radius-sm)] text-[12px] ${
      assists.comfort
        ? 'border-2 border-[var(--accent)] text-[var(--accent)]'
        : 'border border-[var(--edge-hair)] text-[var(--ink-muted)]'
    }`}
  >
    {assists.comfort ? 'On' : 'Off'}
  </button>
</div>
```

In the `TOLERANCES.map` block, disable Precise and Standard while comfort is on — colour is never
the only signal, so this is `disabled` plus the existing muted-text styling, not a colour change
alone:

```tsx
{TOLERANCES.map(({ value, label }) => {
  const selected = difficulty === value;
  const disabled = assists.comfort && value !== 'generous';
  return (
    <button
      key={value}
      type="button"
      aria-label={`Snap tolerance: ${label}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => onDifficultyChange(value)}
      className={`min-h-[44px] flex-1 rounded-[var(--radius-sm)] text-[11px] disabled:opacity-40 ${
        selected
          ? 'border-2 border-[var(--accent)] text-[var(--accent)]'
          : 'border border-[var(--edge-hair)] text-[var(--ink-muted)]'
      }`}
    >
      {label}
    </button>
  );
})}
```

And force generous immediately when comfort turns on, so the buttons and the live session agree
without waiting for the player to also tap a tolerance:

```tsx
// replace the existing onClick for the new Comfort mode button with:
onClick={() => {
  const comfort = !assists.comfort;
  onAssistsChange({ ...assists, comfort });
  if (comfort) onDifficultyChange('generous');
}}
```

- [ ] **Step 9: Run the unit gates**

Run: `npx vitest run test/play/setup.test.ts test/play/session.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 10: Write the failing browser test**

```ts
// test/browser/comfort.spec.ts
import { expect, test } from '@playwright/test';
import { BoardPage } from './board-page';

test('comfort mode widens every button past 44px', async ({ page }) => {
  const board = new BoardPage(page);
  await board.openFresh();
  await page.getByRole('button', { name: 'Pause' }).click();
  const resume = page.getByRole('button', { name: 'Resume' });
  const before = await resume.boundingBox();
  expect(before?.height).toBeGreaterThanOrEqual(44);
  expect(before?.height).toBeLessThan(60);

  await page.getByRole('button', { name: 'Comfort mode' }).click();
  const after = await resume.boundingBox();
  expect(after?.height).toBeGreaterThanOrEqual(60);
});

test('comfort mode floors snap tolerance and disables the tighter two', async ({ page }) => {
  const board = new BoardPage(page);
  await board.openFresh();
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Snap tolerance: Precise' }).click();
  await expect(page.getByRole('button', { name: 'Snap tolerance: Precise' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: 'Comfort mode' }).click();
  await expect(page.getByRole('button', { name: 'Snap tolerance: Generous' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Snap tolerance: Precise' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Snap tolerance: Standard' })).toBeDisabled();
});
```

Use whatever `Pause` button label/opening mechanism the existing pause-sheet browser specs already
use — if `board-page.ts` has no such helper yet, open the pause sheet the same way those specs do
rather than inventing a second path.

- [ ] **Step 11: Run to verify it fails, then run every gate**

Run: `npm run test:browser -- test/browser/comfort.spec.ts`
Expected: FAIL before Steps 3-8, PASS after.

```bash
npm test && npm run typecheck && npm run build && npm run test:browser
```

- [ ] **Step 12: Commit**

```bash
git add src/play/setup.ts src/play/session.ts src/play/runtime.ts src/ui/App.tsx \
  src/ui/PauseSheet.tsx src/ui/theme.css test/play/setup.test.ts test/play/session.test.ts \
  test/browser/comfort.spec.ts
git commit -m "Track 3: the comfort flag — 60pt targets, exaggerated lift, the snap floor"
```

---

### Task 2: Tremor damping in the pointer machine

**Files:**
- Modify: `src/input/pointer.ts`, `src/input/board-controls.ts`
- Test: `test/input/pointer.test.ts`

**Interfaces:**
- Consumes: `PuzzleAssists.comfort` (Task 1), threaded in by whatever constructs `PointerMachine` in
  `board-controls.ts`.
- Produces: `PointerMachine` gains a constructor option `{ tremorDamping?: boolean }` and a
  `setTremorDamping(enabled: boolean): void`. No other file needs to know the damping exists.

- [ ] **Step 1: Write the failing test**

```ts
// test/input/pointer.test.ts — add a new describe block
import { PointerMachine, MOVE_THRESHOLD_PX } from '@/input/pointer';
// reuse whatever fake PointerHost the existing drag tests in this file already build

describe('tremor damping', () => {
  it('is off by default — a drag delta passes through unchanged', () => {
    const host = makeHost(); // the existing test fixture in this file
    const machine = new PointerMachine(host);
    machine.down({ id: 1, x: 100, y: 100, t: 0 });
    machine.move({ id: 1, x: 100, y: 100, t: 10 }); // promote via LONG_PRESS_MS elsewhere, or:
    machine.move({ id: 1, x: 100 + MOVE_THRESHOLD_PX + 1, y: 100, t: 20 });
    // one more move, now dragging: the raw delta should reach the host verbatim
    machine.move({ id: 1, x: 100 + MOVE_THRESHOLD_PX + 21, y: 100, t: 30 });
    const lastDrag = host.drags.at(-1)!;
    expect(lastDrag.dx).toBeCloseTo(20, 5); // undamped: full 20px world-unit-equivalent delta
  });

  it('smooths a jittery sequence once enabled, without changing net displacement much', () => {
    const host = makeHost();
    const machine = new PointerMachine(host, { tremorDamping: true });
    machine.down({ id: 1, x: 100, y: 100, t: 0 });
    machine.move({ id: 1, x: 100 + MOVE_THRESHOLD_PX + 1, y: 100, t: 10 });
    // A jittery back-and-forth around a rising trend, the shape a tremor produces.
    const samples = [
      { x: 130, y: 102, t: 20 },
      { x: 128, y: 98, t: 30 },
      { x: 134, y: 101, t: 40 },
      { x: 132, y: 99, t: 50 },
      { x: 140, y: 100, t: 60 },
    ];
    for (const s of samples) machine.move({ id: 1, ...s });
    // Damped, the per-move deltas have less variance than the raw jitter did —
    // the low-pass is doing something, not a no-op.
    const raw = [130 - 121, 128 - 130, 134 - 128, 132 - 134, 140 - 132];
    const rawVariance = variance(raw);
    const dampedVariance = variance(host.drags.slice(-5).map((d) => d.dx));
    expect(dampedVariance).toBeLessThan(rawVariance);
  });

  it('does not delay MOVE_THRESHOLD_PX promotion — the press-to-drag check runs on the raw sample', () => {
    const host = makeHost();
    const machine = new PointerMachine(host, { tremorDamping: true });
    machine.down({ id: 1, x: 100, y: 100, t: 0 });
    expect(machine.phase).toBe('pressing');
    machine.move({ id: 1, x: 100 + MOVE_THRESHOLD_PX + 1, y: 100, t: 10 });
    // Promotion must fire on this exact move — a damped promotion reads as lag.
    expect(machine.phase).toBe('dragging');
  });
});

function variance(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
}
```

Adapt `makeHost()` to whatever the existing drag-test fixture in `test/input/pointer.test.ts` is
named — this file already exercises `onGrab`/`onDragTo`/`onRelease` for the un-damped machine, so a
fixture recording `onDragTo` calls into a `drags: DragEvent[]` array almost certainly already
exists; extend it rather than duplicating it.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/input/pointer.test.ts`
Expected: FAIL — the constructor takes no second argument, `setTremorDamping` does not exist.

- [ ] **Step 3: Implement the one-pole low-pass and dead-zone**

```ts
// src/input/pointer.ts — near MOVE_THRESHOLD_PX/LONG_PRESS_MS
/**
 * Comfort mode's tremor damping (§C Track 3): a one-pole low-pass on the drag
 * path, plus a dead-zone that swallows sub-pixel jitter outright. Chosen, not
 * measured — revisit on hardware, the way `hints.ts` flags its escalation
 * thresholds.
 *
 * Applied only to samples already in the `dragging` phase — `move()`'s
 * `MOVE_THRESHOLD_PX` promotion check (line ~182) reads the *raw* sample
 * unconditionally, so damping can never delay the press-to-drag transition.
 */
const TREMOR_LOW_PASS_ALPHA = 0.35;
const TREMOR_DEAD_ZONE_PX = 1.5;
```

Add a constructor option and a live setter:

```ts
export interface PointerMachineOptions {
  tremorDamping?: boolean;
}

export class PointerMachine {
  // ...existing fields...
  private tremorDamping: boolean;
  /** The low-pass's running estimate, in screen px, reset on every new drag. */
  private smoothed: Point | null = null;

  constructor(
    private readonly host: PointerHost,
    options: PointerMachineOptions = {},
  ) {
    this.tremorDamping = options.tremorDamping ?? false;
  }

  setTremorDamping(enabled: boolean): void {
    this.tremorDamping = enabled;
  }
```

Reset `this.smoothed` to `null` everywhere a drag begins — `beginDrag()` (line 233-241) and
`adopt()` (line 130-143, the tray hand-off) — by setting `this.smoothed = { x: pressedAt.x, y:
pressedAt.y }` (or the adopted sample's coordinates) at the same point `this.lastDrag` is set.

In `move()` (line 172-194), damp the incoming sample before it becomes `to`, leaving the
`MOVE_THRESHOLD_PX` check above it untouched:

```ts
move(sample: PointerSample): void {
  const tracked = this.pointers.get(sample.id);
  if (!tracked) return;
  tracked.x = sample.x;
  tracked.y = sample.y;
  tracked.t = sample.t;

  if (sample.id !== this.activeId) return;

  if (this.phase_ === 'pressing' && this.pressedAt) {
    // Unconditionally the raw sample — damping must never delay promotion.
    const moved = Math.hypot(sample.x - this.pressedAt.x, sample.y - this.pressedAt.y);
    if (moved < MOVE_THRESHOLD_PX) return;
    this.beginDrag();
  }

  if (this.phase_ !== 'dragging' || !this.lastDrag || this.pressedCluster === null) return;

  this.history.push({ x: sample.x, y: sample.y, t: sample.t });

  const damped = this.tremorDamping ? this.dampen({ x: sample.x, y: sample.y }) : sample;

  const from = this.host.toWorld(this.lastDrag);
  const to = this.host.toWorld({ x: damped.x, y: damped.y });
  this.lastDrag = { x: damped.x, y: damped.y };
  this.host.onDragTo({ clusterId: this.pressedCluster, dx: to.x - from.x, dy: to.y - from.y });
}

/** The one-pole low-pass plus dead-zone. `this.smoothed` is reset per-drag in `beginDrag`/`adopt`. */
private dampen(raw: Point): Point {
  if (!this.smoothed) {
    this.smoothed = raw;
    return raw;
  }
  const dx = raw.x - this.smoothed.x;
  const dy = raw.y - this.smoothed.y;
  if (Math.hypot(dx, dy) < TREMOR_DEAD_ZONE_PX) return this.smoothed;
  this.smoothed = {
    x: this.smoothed.x + dx * TREMOR_LOW_PASS_ALPHA,
    y: this.smoothed.y + dy * TREMOR_LOW_PASS_ALPHA,
  };
  return this.smoothed;
}
```

Add `this.smoothed = { x: this.pressedAt.x, y: this.pressedAt.y };` at the top of `beginDrag()`
(right after the `if` guard), and the equivalent using `sample` at the top of `adopt()`.

- [ ] **Step 4: Wire the option through `board-controls.ts`**

Find where `board-controls.ts` constructs `new PointerMachine(host)` and pass
`{ tremorDamping: assists.comfort }` (or wherever the live assists value reaches that constructor —
if `BoardControls` is constructed once and assists change later, add a `setTremorDamping` pass-through
method on `BoardControls` itself that forwards to the underlying `PointerMachine`, called from
`PlayRuntime.setAssists` (Task 1, Step 5) alongside the existing `setMinRelativeZoom` call).

- [ ] **Step 5: Run the tests and every gate**

Run: `npx vitest run test/input/pointer.test.ts`
Expected: PASS.

```bash
npm test && npm run typecheck && npm run build && npm run test:browser
```

- [ ] **Step 6: Commit**

```bash
git add src/input/pointer.ts src/input/board-controls.ts src/play/runtime.ts test/input/pointer.test.ts
git commit -m "Track 3: tremor damping — a one-pole low-pass, never delaying MOVE_THRESHOLD_PX"
```

---

### Task 3: Hit-slop as a policy — the `.touch-target` consolidation

**Files:**
- Modify: `src/ui/theme.css`, and every `src/ui/*.tsx` file using `min-h-[44px]`/`min-w-[44px]`
  (currently ~40 occurrences across the files grepped in this session: `PauseSheet.tsx`,
  `DailyHub.tsx`, `Library.tsx`, `PhotoPicker.tsx`, `CompletionCard.tsx`, `CollectionWall.tsx`, and
  others under `src/ui/`)
- Test: `test/browser/comfort.spec.ts` (extends Task 1's file)

**Interfaces:**
- Consumes: `--touch-min` (already retargeted by Task 1, Step 7).
- Produces: a `.touch-target` utility class. No new exports.

**Why this is its own task:** Task 1's `[data-comfort] { --touch-min: 60px; }` only widens elements
that *read* `var(--touch-min)`. The global `button, [role='button']` rule already does. The ~40
`min-h-[44px]`/`min-w-[44px]` literals scattered through the codebase do not — they are Tailwind
utilities compiling straight to `min-height: 44px`, a fixed value that wins the cascade over the
custom-property-driven rule and stays 44px under comfort regardless. Editing all ~40 by hand is
exactly the "107 edits" the spec calls out; replacing them with one class that reads the variable is
the one-time fix.

- [ ] **Step 1: Add the utility**

```css
/* src/ui/theme.css — near the existing --touch-min definition (:root, line 73) */
.touch-target {
  min-height: var(--touch-min);
  min-width: var(--touch-min);
}
```

- [ ] **Step 2: Audit the literal occurrences**

Run: `grep -rln 'min-h-\[44px\]\|min-w-\[44px\]' src/ui/*.tsx`

For each match, replace `min-h-[44px]` with `touch-target` in the element's `className`, and drop
any accompanying `min-w-[44px]` on the same element (the utility already sets both). Where an
element has `min-h-[44px] flex-1 ...` (a button meant to grow to fill a row, e.g. `PauseSheet.tsx`'s
tolerance buttons), keep `flex-1` — `.touch-target`'s `min-width` is a floor, not a fixed width, so
it does not fight `flex-1`'s growth.

Concretely, in `src/ui/PauseSheet.tsx` (8 occurrences per the source read this session):

```tsx
// before
className="min-h-[44px] rounded-[var(--radius-md)] bg-[var(--accent)] py-3 text-[15px] text-[var(--mat-void)]"
// after
className="touch-target rounded-[var(--radius-md)] bg-[var(--accent)] py-3 text-[15px] text-[var(--mat-void)]"
```

```tsx
// before (the tolerance buttons — min-h and flex-1 coexist)
className={`min-h-[44px] flex-1 rounded-[var(--radius-sm)] text-[11px] disabled:opacity-40 ${...}`}
// after
className={`touch-target flex-1 rounded-[var(--radius-sm)] text-[11px] disabled:opacity-40 ${...}`}
```

```tsx
// before (min-h AND min-w together, e.g. the edge-highlight/comfort toggles)
className={`min-h-[44px] min-w-[44px] rounded-[var(--radius-sm)] text-[12px] ${...}`}
// after
className={`touch-target rounded-[var(--radius-sm)] text-[12px] ${...}`}
```

Repeat the same substitution pattern in every other file the grep found. This is mechanical —
apply the three patterns above verbatim per match, do not restyle anything else on the element.

- [ ] **Step 3: Confirm nothing still hardcodes it**

Run: `grep -rl 'min-h-\[44px\]\|min-w-\[44px\]' src/ui/*.tsx`
Expected: no output.

- [ ] **Step 4: Extend the browser test**

```ts
// test/browser/comfort.spec.ts — add
test('comfort mode widens the pause sheet\'s reference-image and restart buttons too', async ({
  page,
}) => {
  const board = new BoardPage(page);
  await board.openFresh();
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Comfort mode' }).click();
  const restart = page.getByRole('button', { name: 'Restart' });
  const box = await restart.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(60);
});
```

- [ ] **Step 5: Run every gate**

```bash
npm test && npm run typecheck && npm run build && npm run test:browser
```

- [ ] **Step 6: Commit**

```bash
git add src/ui/theme.css src/ui/*.tsx test/browser/comfort.spec.ts
git commit -m "Track 3: .touch-target — one variable-driven class instead of ~40 hardcoded 44px minimums"
```

---

### Task 4: The WCAG contrast gate on `accent.ts`

**Files:**
- Modify: `src/render/accent.ts`
- Test: `test/render/accent.test.ts`

**Interfaces:**
- Consumes: `okLabToSrgb`, `srgbToOkLab` from `@/tray/colour` (already imported).
- Produces: `contrastRatio(a: readonly [number, number, number], b: readonly [number, number,
  number]): number`, `ensureContrast(lab: OkLab, against: readonly [number, number, number],
  minRatio: number): OkLab`, `MAT_RAISED_RGB`, `WCAG_MIN_CONTRAST`. `extractAccent`'s `accent` token
  (not `accentBloom`/`accentTray` — those drive a light/glow effect, not text or border colour, so
  they stay on `clampToAccentRange` alone) now passes through `ensureContrast` as a second pass.

- [ ] **Step 1: Write the failing tests**

```ts
// test/render/accent.test.ts — add
import { contrastRatio, ensureContrast, MAT_RAISED_RGB, WCAG_MIN_CONTRAST } from '@/render/accent';

describe('contrastRatio', () => {
  it('is 1 for two identical colours', () => {
    expect(contrastRatio([100, 100, 100], [100, 100, 100])).toBeCloseTo(1, 5);
  });

  it('is 21 for pure black against pure white — the WCAG maximum', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1);
  });

  it('is symmetric — argument order does not matter', () => {
    const a: [number, number, number] = [10, 200, 90];
    const b: [number, number, number] = [230, 20, 40];
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 6);
  });
});

describe('ensureContrast', () => {
  it('confirms the near-miss: a saturated blue at the clamp\'s own L floor fails 4.5:1 against --mat-raised', () => {
    // hue 240deg, L 0.62, chroma 0.16 — the clamp's own permitted extreme.
    // Hand-computed this session: contrastRatio comes out to ~4.478, just under
    // WCAG_MIN_CONTRAST. This is the case clampToAccentRange alone cannot catch.
    const nearMiss: OkLab = { L: 0.62, a: Math.cos((240 * Math.PI) / 180) * 0.16, b: Math.sin((240 * Math.PI) / 180) * 0.16 };
    const rgb = okLabToSrgb(nearMiss);
    expect(contrastRatio(rgb, MAT_RAISED_RGB)).toBeLessThan(WCAG_MIN_CONTRAST);
  });

  it('walks lightness up until the near-miss clears the WCAG floor', () => {
    const nearMiss: OkLab = { L: 0.62, a: Math.cos((240 * Math.PI) / 180) * 0.16, b: Math.sin((240 * Math.PI) / 180) * 0.16 };
    const fixed = ensureContrast(nearMiss, MAT_RAISED_RGB, WCAG_MIN_CONTRAST);
    expect(contrastRatio(okLabToSrgb(fixed), MAT_RAISED_RGB)).toBeGreaterThanOrEqual(
      WCAG_MIN_CONTRAST - 1e-6,
    );
    expect(fixed.L).toBeGreaterThan(nearMiss.L);
  });

  it('leaves an already-compliant colour untouched', () => {
    const bright: OkLab = { L: 0.78, a: 0.02, b: 0.02 }; // near the clamp's own light end
    const before = contrastRatio(okLabToSrgb(bright), MAT_RAISED_RGB);
    expect(before).toBeGreaterThanOrEqual(WCAG_MIN_CONTRAST);
    const after = ensureContrast(bright, MAT_RAISED_RGB, WCAG_MIN_CONTRAST);
    expect(after).toEqual(bright);
  });

  it('never throws and returns its best effort even for an unreachable target', () => {
    const impossible: OkLab = { L: 0.62, a: 0, b: 0 };
    expect(() => ensureContrast(impossible, MAT_RAISED_RGB, 21)).not.toThrow();
  });
});

describe('extractAccent', () => {
  it('always meets the WCAG floor against --mat-raised, at a near-black and a near-white photo', () => {
    // CLAUDE.md: a test that passes at both extremes of the constant it guards
    // is not testing that constant — so this asserts the actual measured ratio,
    // not just that extraction returns *something*.
    const nearBlack = Array.from({ length: 12 }, (_, i) => flat(i, [5, 5, 8]));
    const nearWhite = Array.from({ length: 12 }, (_, i) => flat(i, [250, 248, 245]));
    for (const pieces of [nearBlack, nearWhite]) {
      const tokens = extractAccent(pieces, 1);
      const rgb = tokens.accent.match(/[0-9a-f]{2}/gi)!.map((h) => parseInt(h, 16)) as [
        number,
        number,
        number,
      ];
      expect(contrastRatio(rgb, MAT_RAISED_RGB)).toBeGreaterThanOrEqual(WCAG_MIN_CONTRAST - 1e-6);
    }
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/render/accent.test.ts`
Expected: FAIL — `contrastRatio`, `ensureContrast`, `MAT_RAISED_RGB`, `WCAG_MIN_CONTRAST` do not exist.

- [ ] **Step 3: Implement**

```ts
// src/render/accent.ts — add near the existing CLAMP_L/CLAMP_C constants

/**
 * `--mat-raised` (#1E232A, theme.css), not `--mat-void` — the accent sits on
 * both as either text/border colour or a light background, and raised is the
 * harder of the two to clear: it is lighter than void, so it costs more
 * contrast, not less. Passing against raised passes against void for free.
 */
export const MAT_RAISED_RGB: [number, number, number] = [30, 35, 42];
/** WCAG 2.1 AA, normal text. */
export const WCAG_MIN_CONTRAST = 4.5;
const CONTRAST_L_STEP = 0.01;
const CONTRAST_L_MAX = 0.95;

function relativeLuminance(rgb: readonly [number, number, number]): number {
  const linear = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
}

/** WCAG 2.1 contrast ratio, 1 (identical) to 21 (black on white). Symmetric. */
export function contrastRatio(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The second pass, after `clampToAccentRange`: walk OKLab lightness upward
 * until the colour actually clears `minRatio` against `against`, rather than
 * assuming the clamp's L/C band is always enough — it is not (see the
 * near-miss test in `accent.test.ts`, a real value the clamp alone permits).
 * Hue and chroma magnitude are held fixed; only L moves. Never throws — an
 * unreachable ratio returns the best L found, the same never-block posture
 * `extractAccent` already keeps for every other failure mode here.
 */
export function ensureContrast(
  lab: OkLab,
  against: readonly [number, number, number],
  minRatio: number,
): OkLab {
  let candidate = lab;
  for (let L = lab.L; L <= CONTRAST_L_MAX; L += CONTRAST_L_STEP) {
    candidate = { ...lab, L };
    if (contrastRatio(okLabToSrgb(candidate), against) >= minRatio) return candidate;
  }
  return candidate;
}
```

In `extractAccent` (the final return), gate only the `accent` token:

```ts
const accent = ensureContrast(clampToAccentRange(ranked[0]!), MAT_RAISED_RGB, WCAG_MIN_CONTRAST);
const bloom = ensureHueSeparation(accent, clampToAccentRange(ranked[1] ?? ranked[0]!));
const tray = clampToAccentRange(ranked[2] ?? ranked[1] ?? ranked[0]!);
```

(`bloom` already derives its hue-separation from `accent`, so passing the contrast-corrected value
through unchanged is a one-line reorder of the existing three lines, not new logic.)

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/render/accent.test.ts`
Expected: PASS, including the near-miss case actually failing before correction and passing after.

- [ ] **Step 5: Run every gate and commit**

```bash
npm test && npm run typecheck && npm run build && npm run test:browser
git add src/render/accent.ts test/render/accent.test.ts
git commit -m "Track 3: a measured WCAG contrast gate on accent, not just an assumed clamp range"
```

---

### Task 5: Adaptive ghost-underlay opacity

**Files:**
- Modify: `src/render/accent.ts`, `src/render/renderer.ts`, `src/play/runtime.ts`
- Test: `test/render/accent.test.ts`

**Interfaces:**
- Consumes: `CutPiece.meanColor`, `CutPiece.targetX/targetY/worldW/worldH` (already on every piece
  post-cut — no second pixel pass).
- Produces: `adaptiveGhostOpacity(base: number, meanColor: readonly [number, number, number]):
  number` in `accent.ts`. `Renderer.setGhostUnderlay` gains a third parameter,
  `slots?: readonly GhostSlot[] | null`, replacing the single full-canvas draw with a per-slot one
  when slots are supplied.

- [ ] **Step 1: Write the failing unit test**

```ts
// test/render/accent.test.ts — add
import { adaptiveGhostOpacity } from '@/render/accent';

describe('adaptiveGhostOpacity', () => {
  it('boosts opacity for a near-black slot, past the base value', () => {
    const boosted = adaptiveGhostOpacity(0.2, [5, 5, 5]);
    expect(boosted).toBeGreaterThan(0.2);
  });

  it('leaves a near-white slot at the base value — no boost needed there', () => {
    expect(adaptiveGhostOpacity(0.2, [250, 250, 250])).toBeCloseTo(0.2, 5);
  });

  it('is monotonic — a darker slot never gets less boost than a lighter one, same base', () => {
    const dark = adaptiveGhostOpacity(0.2, [10, 10, 10]);
    const mid = adaptiveGhostOpacity(0.2, [128, 128, 128]);
    const light = adaptiveGhostOpacity(0.2, [240, 240, 240]);
    expect(dark).toBeGreaterThanOrEqual(mid);
    expect(mid).toBeGreaterThanOrEqual(light);
  });

  it('never exceeds the adaptive ceiling regardless of how dark the slot is', () => {
    expect(adaptiveGhostOpacity(0.3, [0, 0, 0])).toBeLessThanOrEqual(0.55);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/render/accent.test.ts`
Expected: FAIL — `adaptiveGhostOpacity` does not exist.

- [ ] **Step 3: Implement the pure function**

```ts
// src/render/accent.ts — add near extractAccent
/**
 * Step 5b's ghost underlay is a single dimmed copy of the source photo drawn
 * under placed pieces (`renderer.ts`'s `paintStatic`). A uniform alpha reads
 * as invisible over the photo's own dark regions against `--mat-void`'s
 * near-black — this boosts opacity per slot from that slot's own mean colour,
 * using the pixel data cut already sampled (`CutPiece.meanColor`), so it costs
 * no second pass over the image. Chosen, not measured — revisit on hardware.
 */
const GHOST_ADAPTIVE_CEILING = 0.55;
const GHOST_BOOST_LIGHTNESS_FLOOR = 0.7;

export function adaptiveGhostOpacity(base: number, meanColor: readonly [number, number, number]): number {
  const L = srgbToOkLab(meanColor).L;
  const boost = Math.max(0, GHOST_BOOST_LIGHTNESS_FLOOR - L);
  return Math.min(GHOST_ADAPTIVE_CEILING, base + boost * base);
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run test/render/accent.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire per-slot ghost drawing in the renderer**

```ts
// src/render/renderer.ts — near the existing ghostBitmap/ghostOpacity fields
export interface GhostSlot {
  x: number;
  y: number;
  w: number;
  h: number;
  alpha: number;
}
```

```ts
private ghostBitmap: ImageBitmap | null = null;
private ghostOpacity = 0;
private ghostSlots: readonly GhostSlot[] | null = null;
```

```ts
setGhostUnderlay(
  bitmap: ImageBitmap | null,
  opacity: number,
  slots: readonly GhostSlot[] | null = null,
): void {
  this.ghostBitmap = bitmap;
  this.ghostOpacity = opacity;
  this.ghostSlots = slots;
}
```

In `paintStatic` (the block currently doing one `ctx.drawImage(this.ghostBitmap, 0, 0,
this.scene.boardW, this.scene.boardH)` under a single `globalAlpha`), replace it:

```ts
if (this.ghostBitmap && this.ghostOpacity > 0) {
  ctx.save();
  if (this.ghostSlots && this.ghostSlots.length > 0) {
    // Per-slot alpha (Track 3): source rect in the bitmap's own pixel space,
    // dest rect in world units — same px-per-world-unit ratio `pathScale`
    // already names for piece outlines, computed once here since the ghost
    // bitmap's natural size and the board's world size are both constant for
    // the puzzle's lifetime.
    const pxPerUnit = this.ghostBitmap.width / this.scene.boardW;
    for (const slot of this.ghostSlots) {
      if (slot.alpha <= 0) continue;
      ctx.globalAlpha = slot.alpha;
      ctx.drawImage(
        this.ghostBitmap,
        slot.x * pxPerUnit,
        slot.y * pxPerUnit,
        slot.w * pxPerUnit,
        slot.h * pxPerUnit,
        slot.x,
        slot.y,
        slot.w,
        slot.h,
      );
    }
  } else {
    ctx.globalAlpha = this.ghostOpacity;
    ctx.drawImage(this.ghostBitmap, 0, 0, this.scene.boardW, this.scene.boardH);
  }
  ctx.restore();
}
```

The `else` branch is the pre-Track-3 behaviour, kept as the fallback for a caller that never builds
slots (there is none after Step 6, but it keeps `setGhostUnderlay(bitmap, opacity)` — two
arguments — a valid call, rather than a breaking signature change).

- [ ] **Step 6: Build the slot list in `PlayRuntime`**

Wherever `start()` and `setAssists()` currently call `this.renderer.setGhostUnderlay(this.ghostSource,
assists.ghostOpacity)`, build the slots from `cut` (the `CutPiece[]` already in scope in `start()`;
`setAssists` needs the same array kept on `this` — add `private cutPieces: CutPiece[] = [];`, set it
once in `start()` right after cutting completes, next to where `this.ghostSource` is assigned):

```ts
private ghostSlots(assists: PuzzleAssists): GhostSlot[] | null {
  if (assists.ghostOpacity <= 0 || this.cutPieces.length === 0) return null;
  return this.cutPieces.map((piece) => ({
    x: piece.targetX,
    y: piece.targetY,
    w: piece.worldW,
    h: piece.worldH,
    alpha: adaptiveGhostOpacity(assists.ghostOpacity, piece.meanColor),
  }));
}
```

Replace every `this.renderer.setGhostUnderlay(this.ghostSource, assists.ghostOpacity)` call with:

```ts
this.renderer.setGhostUnderlay(this.ghostSource, assists.ghostOpacity, this.ghostSlots(assists));
```

Import `adaptiveGhostOpacity` and `GhostSlot` (from `@/render/renderer`) at the top of `runtime.ts`.

- [ ] **Step 7: Run every gate and commit**

The per-slot canvas drawing itself is the DOM-touching half and is judged by hand and by the
existing `test/browser/invariants.spec.ts`/visual specs, per `CLAUDE.md`'s stated split — no new
canvas-pixel test is added here; the pure boost function above is the tested half.

```bash
npm test && npm run typecheck && npm run build && npm run test:browser
git add src/render/accent.ts src/render/renderer.ts src/play/runtime.ts test/render/accent.test.ts
git commit -m "Track 3: adaptive ghost opacity — per-slot, from CutPiece.meanColor, no second pixel pass"
```

---

### Task 6: Dynamic Type — rem tokens and the class migration

**Files:**
- Modify: `src/ui/theme.css`, every `src/ui/*.tsx` file with `text-[Npx]` classes (144 occurrences
  counted this session across 11 distinct px values: 8, 10, 11, 12, 13, 14, 15, 16, 24, 28, 40)
- Install: `@axe-core/playwright` (devDependency)
- Test: `test/browser/dynamic-type.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `--text-1` … `--text-7` in rem instead of px. No new exports — this is a token and
  class-name change only.

**The mapping — round up to the nearest token, never down:** Dynamic Type only ever needs text to
get *bigger*; shrinking any existing text during this migration would be an unrelated regression
riding along with an accessibility fix, and the reviewer would have no way to tell the two apart
in a diff. Every one of the 144 occurrences maps by this table:

| Current px | → Tailwind class | Token (rem, 16px root) |
|---|---|---|
| 8, 10, 11, 12 | `text-1` | `--text-1: 0.75rem` (12px) |
| 13, 14 | `text-2` | `--text-2: 0.875rem` (14px) |
| 15, 16 | `text-3` | `--text-3: 1rem` (16px) |
| 24 | `text-5` | `--text-5: 1.75rem` (28px) |
| 28 | `text-5` | `--text-5: 1.75rem` (28px) |
| 40 | `text-6` | `--text-6: 2.5rem` (40px) |

(No occurrence of 20px or 64px was found this session — `text-4`/`text-7` exist in the token scale
already and need no call-site changes.)

- [ ] **Step 1: Convert the tokens**

```css
/* src/ui/theme.css — @theme block, replace the seven --text-N lines */
--text-1: 0.75rem;   /* 12px */
--text-2: 0.875rem;  /* 14px */
--text-3: 1rem;      /* 16px */
--text-4: 1.25rem;   /* 20px */
--text-5: 1.75rem;   /* 28px */
--text-6: 2.5rem;    /* 40px */
--text-7: 4rem;       /* 64px */
```

- [ ] **Step 2: Migrate every call site**

Run: `grep -rln 'text-\[' src/ui/*.tsx` to get the file list (11 files per this session's audit).
For each match, replace the arbitrary class using the mapping table above — e.g.
`text-[13px]` → `text-2`, `text-[28px]` → `text-5`. Where a `text-[Npx]` sits alongside other
classes in a template string, replace only that token, leaving everything else untouched:

```tsx
// before (src/ui/PauseSheet.tsx)
className="mb-1 text-[13px] text-[var(--ink-primary)]"
// after
className="mb-1 text-2 text-[var(--ink-primary)]"
```

Apply the same substitution, file by file, for all 144 occurrences.

- [ ] **Step 3: Confirm nothing still hardcodes a px text size**

Run: `grep -rl 'text-\[[0-9]*px\]' src/ui/*.tsx`
Expected: no output.

- [ ] **Step 4: Install the accessibility scanner**

```bash
npm install -D @axe-core/playwright
```

This is a devDependency for one Playwright assertion, not a runtime addition — the same
no-new-dependency posture the project already set aside once for `vite-plugin-pwa` (build-time), and
narrower here: test-only, never shipped in `dist/`.

- [ ] **Step 5: Write the failing browser test**

```ts
// test/browser/dynamic-type.spec.ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { BoardPage } from './board-page';

test('nothing clips at 200% text zoom', async ({ page }) => {
  const board = new BoardPage(page);
  await board.openFresh();
  // Browser text zoom, not page zoom: rem-based tokens follow this; px-based
  // ones would not have, which is the whole point of this migration.
  await page.emulateMedia({});
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '32px'; // 200% of the 16px root
  });
  await page.getByRole('button', { name: 'Pause' }).click();

  const results = await new AxeBuilder({ page })
    .include('[aria-label="Pause sheet backdrop"] ~ div')
    .analyze();
  const clipping = results.violations.filter((v) => v.id === 'scrollable-region-focusable' || v.id === 'target-size');
  expect(clipping).toEqual([]);

  // No text node runs past its container's right edge — the direct, visible
  // signal a token-based clip check exists to catch.
  const overflowing = await page.evaluate(() => {
    const sheet = document.querySelector('[aria-label="Pause sheet backdrop"]')?.nextElementSibling;
    if (!sheet) return [];
    const bad: string[] = [];
    for (const el of sheet.querySelectorAll('*')) {
      if (el.scrollWidth > el.clientWidth + 1) bad.push(el.className);
    }
    return bad;
  });
  expect(overflowing).toEqual([]);
});
```

- [ ] **Step 6: Run to verify it fails, then run every gate**

Run: `npm run test:browser -- test/browser/dynamic-type.spec.ts`
Expected: FAIL before Steps 1-2 land (px tokens do not scale with root font size, so nothing about
this test can fail meaningfully until the tokens are rem — run it once against the pre-migration
tree to confirm it currently reports overflow, then again after).

```bash
npm test && npm run typecheck && npm run build && npm run test:browser
```

- [ ] **Step 7: Commit**

```bash
git add src/ui/theme.css src/ui/*.tsx package.json package-lock.json test/browser/dynamic-type.spec.ts
git commit -m "Track 3: Dynamic Type — rem tokens, the text-[Npx] migration, and an axe clip check"
```

---

### Task 7: Bookkeeping

**Files:** `PLAN.md`, `CLAUDE.md`, `handoff.md`

- [ ] **Step 1: Tick `PLAN.md`'s Track 3 line** in the tracks table this spec response added, annotated
      with what landed.

- [ ] **Step 2: `CLAUDE.md`**

Add to the Hard numbers or Invariants section:

```markdown
- **Comfort mode is one flag, read in three places.** `PuzzleAssists.comfort` drives the 60pt
  control-target retarget (`data-comfort` → `--touch-min`), the exaggerated held-piece lift, the
  snap-tolerance floor at Generous, and tremor damping — never a second flag for any one of them.
- **The accent's WCAG contrast is measured, not assumed.** `clampToAccentRange`'s L/C band does not
  guarantee 4.5:1 against `--mat-raised` at every hue — `ensureContrast` is the pass that actually
  checks and corrects. A photo whose dominant colour is a saturated blue at the clamp's own lightness
  floor is a real failing case, not a hypothetical one.
```

- [ ] **Step 3: Handoff section**, in the established shape — what landed, the judgment calls (which
      tokens the contrast gate covers vs. not; adaptive ghost opacity as always-on rather than
      comfort-gated, and why), and the real-hardware gate: **whether 60pt targets and the damped
      drag actually read as comfort rather than sluggishness on an iPad with an assistive-touch
      user**, which only a device can answer.

- [ ] **Step 4: Commit**

```bash
git add PLAN.md CLAUDE.md handoff.md
git commit -m "Track 3: handoff notes, PLAN ticks, and the two new invariants"
```

---

## Definition of done

- [ ] `npm test`, `npm run typecheck`, `npm run build` clean.
- [ ] `npm run test:browser` green on dock and phone.
- [ ] Comfort mode widens every button to 60pt, including the ~40 previously-hardcoded ones.
- [ ] Comfort mode lifts a held piece further, floors snap tolerance at Generous (and disables the
      tighter two in the UI), and damps drag jitter without delaying drag promotion.
- [ ] `extractAccent`'s `accent` token clears 4.5:1 against `--mat-raised` for every photo, including
      the hand-verified near-miss case.
- [ ] Ghost-underlay opacity is visibly stronger over dark photo regions than light ones.
- [ ] All 144 `text-[Npx]` call sites read from the seven rem tokens; nothing clips at 200% text.
- [ ] Judged on real hardware: does comfort mode read as comfortable, not merely bigger?
