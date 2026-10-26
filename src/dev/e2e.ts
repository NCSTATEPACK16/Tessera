/**
 * The browser suite's dev-only hook. Never reaches production: every import of
 * this file sits behind `import.meta.env.DEV`, which Vite folds to `false` in a
 * build, and `scripts/check-bundle-budget.mjs` fails the build if `__tessera`
 * survives into `dist/` anyway.
 *
 * Two things, both about cost rather than coverage:
 *
 * - **`?e2e` boots straight onto a board** — the first curated photo, the
 *   default crop, the requested count and mode — skipping picker and setup.
 *   The specs that are *about* that flow still walk it (`BoardPage.open`).
 * - **`window.__tessera.place(n)`** auto-places pieces through the real Tier-3
 *   path (`PlayRuntime.e2ePlace`). A spec still places the *last* piece by
 *   hand, so `complete`, the card, and save-then-delete fire from a real
 *   gesture.
 */

import type { PuzzleMode } from '@/play/setup';
import type { PlayRuntime, RuntimeSummary } from '@/play/runtime';

export interface E2eStart {
  targetCount: number;
  mode: PuzzleMode;
}

/** The fixed id the suite has always stubbed `randomUUID` to, so geometry matches. */
export const E2E_PUZZLE_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

/** `?e2e&pieces=50&mode=zen` → a start, or null when the flag is absent. */
export function parseE2eStart(search: string): E2eStart | null {
  const params = new URLSearchParams(search);
  if (!params.has('e2e')) return null;
  const pieces = Number(params.get('pieces') ?? '50');
  return {
    targetCount: Number.isFinite(pieces) && pieces > 0 ? pieces : 50,
    mode: params.get('mode') === 'classic' ? 'classic' : 'zen',
  };
}

export interface E2eHook {
  /** Auto-place up to `n` unplaced pieces. Returns how many were placed. */
  place(n: number): number;
  /** Place everything except the last `leave` pieces. */
  placeAllBut(leave: number): number;
  summary(): RuntimeSummary | null;
  /**
   * The cut has fully streamed in and nothing is mid-spring. A gesture started
   * before this competes with rasterising and settling for the main thread,
   * and a 450ms select-hold can fire before the drag's first move arrives.
   */
  idle(): boolean;
  /** Client-space centres of the loose pieces on the mat. */
  loosePoints(): { id: number; x: number; y: number }[];
}

declare global {
  interface Window {
    __tessera?: E2eHook;
  }
}

export function installE2eHook(
  getRuntime: () => PlayRuntime | null,
  getSummary: () => RuntimeSummary | null,
): void {
  window.__tessera = {
    place: (n) => getRuntime()?.e2ePlace(n) ?? 0,
    placeAllBut: (leave) => {
      const summary = getSummary();
      if (!summary) return 0;
      return getRuntime()?.e2ePlace(summary.total - summary.placed - leave) ?? 0;
    },
    summary: getSummary,
    idle: () => {
      const runtime = getRuntime();
      const summary = getSummary();
      if (!runtime || !summary) return false;
      const { done, total } = summary.cut;
      return total > 0 && done === total && !runtime.animating;
    },
    loosePoints: () => getRuntime()?.e2eLoosePoints() ?? [],
  };
}
