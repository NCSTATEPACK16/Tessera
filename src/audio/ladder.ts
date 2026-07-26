/**
 * The pitch ladder (§08).
 *
 * Successive placements walk a pentatonic scale up seven steps and hold there.
 * The hold matters: a ladder that kept climbing would be a dog whistle by piece
 * forty, and the point of the ladder is to reward a run, not to measure one.
 *
 * It breaks on a wrong drop or on eight idle seconds — which is the humane part.
 * The ladder is the only thing in the app that keeps any kind of score, and it
 * resets itself quietly rather than announcing that you stopped.
 *
 * Off entirely in Zen. Not quieter, not slower: absent.
 */

/** Major pentatonic. No semitone is dissonant against any other, at any pace. */
export const PENTATONIC_SEMITONES = [0, 2, 4, 7, 9] as const;

/** §08: up seven steps, then hold. */
export const LADDER_TOP = 7;

/** §08: eight idle seconds resets to root. */
export const LADDER_IDLE_MS = 8000;

export interface PitchLadderOptions {
  /** False in Zen. */
  enabled?: boolean;
}

export class PitchLadder {
  private readonly enabled: boolean;
  private current = 0;
  private lastAdvanceMs = 0;

  constructor(options: PitchLadderOptions = {}) {
    this.enabled = options.enabled ?? true;
  }

  get step(): number {
    return this.current;
  }

  /** Playback rate for the transient layer — and only that layer (§08). */
  get rate(): number {
    return rateForStep(this.current);
  }

  /** A good placement. Returns the rate to play this snap at. */
  advance(nowMs: number): number {
    if (!this.enabled) return 1;
    this.lastAdvanceMs = nowMs;
    if (this.current < LADDER_TOP) this.current++;
    return this.rate;
  }

  /** A wrong drop. Neutral information, never a buzzer — but the run is over. */
  break(nowMs = 0): void {
    this.current = 0;
    this.lastAdvanceMs = nowMs;
  }

  /** Called from the frame loop; expires the ladder after eight idle seconds. */
  tick(nowMs: number): void {
    if (!this.enabled || this.current === 0) return;
    if (nowMs - this.lastAdvanceMs >= LADDER_IDLE_MS) this.current = 0;
  }

  reset(): void {
    this.current = 0;
    this.lastAdvanceMs = 0;
  }
}

/** Scale degree → playback rate, wrapping into higher octaves past five steps. */
export function rateForStep(step: number): number {
  const octave = Math.floor(step / PENTATONIC_SEMITONES.length);
  const degree = PENTATONIC_SEMITONES[step % PENTATONIC_SEMITONES.length]!;
  return Math.pow(2, (degree + octave * 12) / 12);
}
