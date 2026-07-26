/**
 * Voicing — what actually gets played for an event (§08).
 *
 * The snap is three layers, and they do different jobs: an 8ms ceramic transient
 * for contact, a felt body for weight, a 200ms small-room tail for place. Only
 * the transient is ever pitch-shifted. Shift the body and the tail with it and
 * the room appears to shrink as the player gets faster — the tail is what tells
 * the ear how big the space is, so it has to stay put.
 *
 * Round-robin exists for the same reason it exists in every footstep system:
 * four identical samples in a row is a machine gun, and a 250-piece board plays
 * this sound 250 times.
 */

export type SnapLayer = 'transient' | 'body' | 'tail';

export interface VoiceLayer {
  layer: SnapLayer;
  /** Playback rate. 1 for everything except the transient (§08). */
  rate: number;
  /** Which of the round-robin variants to play. */
  variant: number;
  /** Milliseconds after the trigger. The transient is always first. */
  delayMs: number;
  gain: number;
}

/** §08: four samples per layer. */
export const VARIANTS = 4;

/**
 * The three-layer snap.
 *
 * `rate` comes from the pitch ladder and applies to the transient alone. The
 * body follows a hair behind the transient because that is what a real object
 * does — the click is the surface, the thud is the mass arriving.
 */
export function snapVoice(rate: number, variant: number): VoiceLayer[] {
  return [
    { layer: 'transient', rate, variant, delayMs: 0, gain: 1 },
    { layer: 'body', rate: 1, variant, delayMs: 4, gain: 0.7 },
    { layer: 'tail', rate: 1, variant, delayMs: 6, gain: 0.35 },
  ];
}

/** Cycle the variant index. Deterministic, so a replayed session sounds the same. */
export function roundRobin(sequence: number, count = VARIANTS): number {
  return ((sequence % count) + count) % count;
}

/**
 * Semitone offsets for a group merge — "a chord instead of a note, voiced wider
 * as the cluster grows".
 *
 * It widens with the size of what just joined and then stops, because past a
 * point a wider chord is not more triumphant, only muddier.
 */
export function mergeChord(clusterSize: number): number[] {
  const intervals = [0, 7, 12, 16, 19];
  const voices = Math.min(intervals.length, 1 + Math.floor(Math.log2(Math.max(clusterSize, 1))));
  return intervals.slice(0, voices);
}
