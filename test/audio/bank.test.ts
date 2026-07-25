/**
 * The sample bank (§08).
 *
 * There are no recorded samples in the repo yet and step 2's gate is that the
 * snap "must feel complete with the device on silent and no vibration" — so the
 * bank is synthesised at unlock time rather than stubbed. Recorded samples drop
 * in behind the same shape later; this is the same seam as `edgePath` in the cut
 * and the settle's two implementations.
 *
 * Synthesis is seeded, so the bank is identical run to run. An unseeded noise
 * burst would make "does this snap sound right?" unanswerable across reloads,
 * which is precisely the question §17 budgets a week to answer.
 */

import { describe, expect, it } from 'vitest';
import { LAYER_MS, VARIANT_DETUNE, synthesiseBank } from '@/audio/bank';
import { VARIANTS } from '@/audio/voices';

const RATE = 48000;
const bank = synthesiseBank(RATE, 1);

describe('shape', () => {
  it('has four round-robin variants of every layer', () => {
    expect(bank.transient).toHaveLength(VARIANTS);
    expect(bank.body).toHaveLength(VARIANTS);
    expect(bank.tail).toHaveLength(VARIANTS);
  });

  it('is an 8ms transient and a 200ms tail, as §08 specifies', () => {
    expect(LAYER_MS.transient).toBe(8);
    expect(LAYER_MS.tail).toBe(200);
    expect(bank.transient[0]!.length).toBe(Math.round((RATE * LAYER_MS.transient) / 1000));
    expect(bank.tail[0]!.length).toBe(Math.round((RATE * LAYER_MS.tail) / 1000));
  });

  it('detunes the variants by ±3%', () => {
    expect(VARIANT_DETUNE).toBeCloseTo(0.03, 10);
  });
});

describe('the samples themselves', () => {
  it('is deterministic, so the snap sounds the same after a reload', () => {
    const again = synthesiseBank(RATE, 1);
    expect([...again.transient[2]!]).toEqual([...bank.transient[2]!]);
  });

  it('gives each variant a different burst, not four copies', () => {
    expect([...bank.transient[0]!]).not.toEqual([...bank.transient[1]!]);
  });

  it('never clips', () => {
    for (const layer of [bank.transient, bank.body, bank.tail]) {
      for (const variant of layer) {
        for (const sample of variant) expect(Math.abs(sample)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('decays to silence, so layers do not stack into a drone', () => {
    for (const layer of [bank.transient, bank.body, bank.tail]) {
      const variant = layer[0]!;
      expect(Math.abs(variant[variant.length - 1]!)).toBeLessThan(0.01);
    }
  });

  it('starts immediately — a transient with a fade-in is not a transient', () => {
    const head = bank.transient[0]!.slice(0, 8);
    expect(Math.max(...[...head].map(Math.abs))).toBeGreaterThan(0.1);
  });
});
