/**
 * The pitch ladder (§08).
 *
 * "Walks a pentatonic scale up seven steps and holds at the top. Breaks on a
 * wrong drop or eight idle seconds, resets to root. Off entirely in Zen."
 *
 * The ladder is the only part of the audio system with real logic in it, so it
 * is the only part with real tests. Whether the snap *sounds* right is judged by
 * hand on a silent device, which is a gate but not a test (§08).
 */

import { describe, expect, it } from 'vitest';
import {
  LADDER_IDLE_MS,
  LADDER_TOP,
  PENTATONIC_SEMITONES,
  PitchLadder,
} from '@/audio/ladder';

const semitone = (n: number): number => Math.pow(2, n / 12);

describe('the scale', () => {
  it('is pentatonic, five notes to the octave', () => {
    expect(PENTATONIC_SEMITONES).toHaveLength(5);
    expect(PENTATONIC_SEMITONES[0]).toBe(0);
    for (const step of PENTATONIC_SEMITONES) expect(step).toBeLessThan(12);
  });

  it('holds at seven steps, per §08', () => {
    expect(LADDER_TOP).toBe(7);
    expect(LADDER_IDLE_MS).toBe(8000);
  });
});

describe('climbing', () => {
  it('starts at the root', () => {
    const ladder = new PitchLadder();
    expect(ladder.step).toBe(0);
    expect(ladder.rate).toBe(1);
  });

  it('climbs one scale degree per placement', () => {
    const ladder = new PitchLadder();
    ladder.advance(0);
    expect(ladder.step).toBe(1);
    expect(ladder.rate).toBeCloseTo(semitone(PENTATONIC_SEMITONES[1]!), 10);
  });

  it('crosses the octave rather than repeating the root', () => {
    const ladder = new PitchLadder();
    for (let i = 0; i < 5; i++) ladder.advance(i * 100);
    expect(ladder.step).toBe(5);
    expect(ladder.rate).toBeCloseTo(2, 10);
  });

  it('holds at the top instead of climbing forever', () => {
    // A ladder that kept climbing would be a dog whistle by piece forty.
    const ladder = new PitchLadder();
    for (let i = 0; i < 30; i++) ladder.advance(i * 100);
    expect(ladder.step).toBe(LADDER_TOP);

    const held = ladder.rate;
    ladder.advance(4000);
    expect(ladder.rate).toBe(held);
  });
});

describe('breaking', () => {
  it('resets to the root on a wrong drop', () => {
    const ladder = new PitchLadder();
    ladder.advance(0);
    ladder.advance(100);
    ladder.break(200);
    expect(ladder.step).toBe(0);
    expect(ladder.rate).toBe(1);
  });

  it('resets after eight idle seconds', () => {
    const ladder = new PitchLadder();
    ladder.advance(1000);
    ladder.tick(1000 + LADDER_IDLE_MS);
    expect(ladder.step).toBe(0);
  });

  it('holds the ladder through a shorter pause', () => {
    const ladder = new PitchLadder();
    ladder.advance(1000);
    ladder.tick(1000 + LADDER_IDLE_MS - 1);
    expect(ladder.step).toBe(1);
  });

  it('counts idle time from the last placement, not from the start', () => {
    const ladder = new PitchLadder();
    ladder.advance(1000);
    ladder.tick(5000);
    ladder.advance(6000);
    ladder.tick(12000);
    expect(ladder.step).toBe(2);
  });
});

describe('Zen', () => {
  it('never moves, so nothing is ever measuring you', () => {
    // "Off entirely in Zen" — not quieter, not slower. Absent.
    const ladder = new PitchLadder({ enabled: false });
    ladder.advance(0);
    ladder.advance(100);
    expect(ladder.step).toBe(0);
    expect(ladder.rate).toBe(1);
  });
});
