/**
 * Voicing (§08).
 *
 * The load-bearing rule: **pitch-shift the transient layer only.** "Body and
 * 200ms tail stay at 1.0 — otherwise the room appears to shrink as you get
 * faster." It is the sort of rule that survives exactly as long as nobody
 * refactors the voice builder, so it is asserted directly.
 */

import { describe, expect, it } from 'vitest';
import { mergeChord, roundRobin, snapVoice } from '@/audio/voices';

describe('snapVoice', () => {
  it('is three layers: ceramic transient, felt body, small-room tail', () => {
    const layers = snapVoice(1, 0);
    expect(layers.map((l) => l.layer)).toEqual(['transient', 'body', 'tail']);
  });

  it('pitch-shifts the transient and nothing else', () => {
    const layers = snapVoice(1.5, 0);
    const by = (name: string) => layers.find((l) => l.layer === name)!;

    expect(by('transient').rate).toBe(1.5);
    expect(by('body').rate).toBe(1);
    expect(by('tail').rate).toBe(1);
  });

  it('leads with the transient — the ear is what sells contact (§09)', () => {
    // The transient must not be delayed behind the body; audio leads the visual
    // settle slightly, and a snap that arrives late is worse than none.
    const layers = snapVoice(1, 0);
    expect(layers[0]!.delayMs).toBe(0);
  });

  it('carries the round-robin variant into every layer', () => {
    for (const layer of snapVoice(1, 2)) expect(layer.variant).toBe(2);
  });
});

describe('roundRobin', () => {
  it('cycles through four variants', () => {
    expect([0, 1, 2, 3, 4, 5].map((n) => roundRobin(n, 4))).toEqual([0, 1, 2, 3, 0, 1]);
  });

  it('never returns the same variant twice running', () => {
    let previous = roundRobin(0, 4);
    for (let n = 1; n < 20; n++) {
      const next = roundRobin(n, 4);
      expect(next).not.toBe(previous);
      previous = next;
    }
  });
});

describe('mergeChord', () => {
  it('is a single note for a lone piece', () => {
    expect(mergeChord(1)).toEqual([0]);
  });

  it('voices wider as the cluster grows', () => {
    // "A chord instead of a note, voiced wider as the cluster grows."
    const small = mergeChord(2);
    const large = mergeChord(20);
    expect(large.length).toBeGreaterThan(small.length);
    expect(Math.max(...large)).toBeGreaterThan(Math.max(...small));
  });

  it('stops widening rather than growing without bound', () => {
    expect(mergeChord(60)).toEqual(mergeChord(250));
  });

  it('always starts on the root', () => {
    for (const size of [1, 2, 5, 12, 40]) expect(mergeChord(size)[0]).toBe(0);
  });
});
