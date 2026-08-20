/**
 * The guided twelve (§16).
 *
 * Every number §16 specifies lives here, in one pure file, because the
 * alternative — `useEffect` timers in `App.tsx` — has no unit-test surface at
 * all, and that is exactly how step 3b shipped two defects that reading the
 * code had missed.
 *
 * `fireHint` is an *edge*: true on exactly one tick, ever. A level would
 * re-fire on every frame of a stalled board, and §16 says "once."
 */

export const FIRST_RUN_PIECES = 12;
export const TRAY_REVEAL_AT = 4;
export const HINT_RESCUE_AT = 8;
export const HINT_IDLE_MS = 20_000;

export type FirstRunBeat = 'cold-open' | 'playing' | 'tray-reveal' | 'hint-rescue' | 'complete';

export interface FirstRunInput {
  placed: number;
  total: number;
  msSinceLastPlacement: number;
  skipped: boolean;
}

export interface FirstRunState {
  /** Latched: the tray never un-reveals. */
  trayRevealed: boolean;
  /** Latched: §16's "once". */
  hintFired: boolean;
}

export function firstRunStart(): FirstRunState {
  return { trayRevealed: false, hintFired: false };
}

export function firstRunTick(
  state: FirstRunState,
  input: FirstRunInput,
): { state: FirstRunState; beat: FirstRunBeat; fireHint: boolean } {
  if (input.skipped || input.placed >= input.total) {
    return { state, beat: 'complete', fireHint: false };
  }

  const revealing = !state.trayRevealed && input.placed >= TRAY_REVEAL_AT;
  const trayRevealed = state.trayRevealed || revealing;

  const rescuing =
    !state.hintFired &&
    input.placed >= HINT_RESCUE_AT &&
    input.msSinceLastPlacement >= HINT_IDLE_MS;

  const next: FirstRunState = { trayRevealed, hintFired: state.hintFired || rescuing };

  if (rescuing) return { state: next, beat: 'hint-rescue', fireHint: true };
  if (revealing) return { state: next, beat: 'tray-reveal', fireHint: false };
  if (input.placed === 0) return { state: next, beat: 'cold-open', fireHint: false };
  return { state: next, beat: 'playing', fireHint: false };
}
