import { describe, expect, it } from 'vitest';
import { hashString, mulberry32, rngFor, seedFromPuzzleId } from '@/core/rng';

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 32 }, () => a.next());
    const seqB = Array.from({ length: 32 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('differs across seeds', () => {
    const a = Array.from({ length: 16 }, mulberry32(1).next);
    const b = Array.from({ length: 16 }, mulberry32(2).next);
    expect(a).not.toEqual(b);
  });

  it('stays inside [0, 1)', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 5000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('jitters symmetrically about zero', () => {
    const rng = mulberry32(7);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const j = rng.jitter(0.12);
      expect(Math.abs(j)).toBeLessThanOrEqual(0.12);
      sum += j;
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.005);
  });
});

describe('rngFor', () => {
  it('gives a stream that depends only on (seed, kind, id)', () => {
    const a = rngFor(42, 'edge', 'h:3,4');
    const b = rngFor(42, 'edge', 'h:3,4');
    expect(a.next()).toBe(b.next());
  });

  it('is independent of draw order — the property interlock depends on', () => {
    // Draw from an unrelated stream in between; the edge stream must not move.
    const first = rngFor(42, 'edge', 'h:3,4').next();

    const noise = rngFor(42, 'lattice', '9,9');
    for (let i = 0; i < 100; i++) noise.next();

    const second = rngFor(42, 'edge', 'h:3,4').next();
    expect(second).toBe(first);
  });

  it('separates concerns — same id under different kinds does not collide', () => {
    const edge = rngFor(42, 'edge', '1,1').next();
    const lattice = rngFor(42, 'lattice', '1,1').next();
    expect(edge).not.toBe(lattice);
  });

  it('separates ids within a concern', () => {
    const a = rngFor(42, 'edge', 'h:1,1').next();
    const b = rngFor(42, 'edge', 'v:1,1').next();
    expect(a).not.toBe(b);
  });

  it('changes wholesale with the seed', () => {
    const a = rngFor(1, 'edge', 'h:1,1').next();
    const b = rngFor(2, 'edge', 'h:1,1').next();
    expect(a).not.toBe(b);
  });
});

describe('hashString / seedFromPuzzleId', () => {
  it('is stable and unsigned', () => {
    expect(hashString('tessera')).toBe(hashString('tessera'));
    expect(hashString('tessera')).toBeGreaterThanOrEqual(0);
  });

  it('maps a puzzle id to a stable seed', () => {
    expect(seedFromPuzzleId('harbour-june')).toBe(seedFromPuzzleId('harbour-june'));
    expect(seedFromPuzzleId('harbour-june')).not.toBe(seedFromPuzzleId('dog'));
  });
});
