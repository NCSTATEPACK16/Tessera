/**
 * Step 9's two trigger rules — install-prompt timing and the idle warning —
 * pulled out as pure functions so the "after the second completion" and
 * "7 days idle" thresholds are asserted directly rather than only reachable
 * by driving a real `beforeinstallprompt` event through a browser test.
 */

/** §17: "Make 'add to home screen' a real prompt after the second completion." */
export const INSTALL_PROMPT_MIN_COMPLETIONS = 2;

/** §17: "Warn at 7 days idle." */
export const IDLE_WARNING_DAYS = 7;

export function shouldOfferInstall(completions: number, isStandalone: boolean): boolean {
  return !isStandalone && completions >= INSTALL_PROMPT_MIN_COMPLETIONS;
}

/** `null` means no recorded activity yet — nothing to lose, so no warning. */
export function shouldWarnIdle(lastActivityAt: number | null, nowMs: number): boolean {
  if (lastActivityAt === null) return false;
  return nowMs - lastActivityAt >= IDLE_WARNING_DAYS * 24 * 60 * 60 * 1000;
}

/** Newest of every timestamp this profile has recorded, or `null` for a fresh one. */
export function lastActivityAt(
  libraryUpdatedAt: readonly number[],
  completionCompletedAt: readonly number[],
): number | null {
  const all = [...libraryUpdatedAt, ...completionCompletedAt];
  return all.length === 0 ? null : Math.max(...all);
}
