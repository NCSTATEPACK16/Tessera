/**
 * The light system's intensity math (§07): pure functions, no canvas, so the
 * four jobs' numbers from `PLAN.md`'s table are checked directly rather than
 * by eye. `test/render/light.test.ts` is this feature's version of
 * `interlock.test.ts` — the constants are the spec.
 */

import { describe, expect, it } from 'vitest';
import {
  COMPLETION_HOLD_MS,
  COMPLETION_RAMP_MS,
  COMPLETION_SETTLE_INTENSITY,
  EDGE_FRAME_TRACE_MS,
  HINT_GLOW_BREATHE_END_MS,
  HINT_GLOW_BREATH_LOW,
  HINT_GLOW_DECAY_END_MS,
  HINT_GLOW_PEAK,
  HINT_GLOW_RISE_MS,
  MERGE_SEAM_DURATION_MS,
  MERGE_SEAM_PEAK,
  PROGRESS_BLOOM_PEAK,
  completionIntensity,
  edgeFrameProgress,
  hintGlowIntensity,
  mergeSeamIntensity,
  progressBloomIntensity,
} from '@/render/light';

describe('progressBloomIntensity', () => {
  it('is zero at zero completion and peaks at 0.9, not 1.0', () => {
    expect(progressBloomIntensity(0)).toBe(0);
    expect(progressBloomIntensity(1)).toBeCloseTo(PROGRESS_BLOOM_PEAK, 5);
  });

  it('scales linearly with completion', () => {
    expect(progressBloomIntensity(0.5)).toBeCloseTo(PROGRESS_BLOOM_PEAK / 2, 5);
  });

  it('clamps out-of-range completion rather than overshooting', () => {
    expect(progressBloomIntensity(-0.2)).toBe(0);
    expect(progressBloomIntensity(1.4)).toBeCloseTo(PROGRESS_BLOOM_PEAK, 5);
  });
});

describe('hintGlowIntensity', () => {
  it('is silent before the hint fires', () => {
    expect(hintGlowIntensity(-10)).toBe(0);
  });

  it('rises from 0 toward the peak during the rise window', () => {
    expect(hintGlowIntensity(0)).toBeCloseTo(0, 5);
    expect(hintGlowIntensity(HINT_GLOW_RISE_MS - 1)).toBeCloseTo(HINT_GLOW_PEAK, 1);
    expect(hintGlowIntensity(HINT_GLOW_RISE_MS / 2)).toBeGreaterThan(0);
    expect(hintGlowIntensity(HINT_GLOW_RISE_MS / 2)).toBeLessThan(HINT_GLOW_PEAK);
  });

  it('breathes between the low and the peak, never outside that band', () => {
    for (let t = HINT_GLOW_RISE_MS; t < HINT_GLOW_BREATHE_END_MS; t += 25) {
      const value = hintGlowIntensity(t);
      expect(value).toBeGreaterThanOrEqual(HINT_GLOW_BREATH_LOW - 1e-6);
      expect(value).toBeLessThanOrEqual(HINT_GLOW_PEAK + 1e-6);
    }
  });

  it('takes two full breaths across the breathing window, not one', () => {
    // A single-breath curve would be monotonic across the window; two breaths
    // means the value comes back down to the low before rising again.
    const samples: number[] = [];
    for (let t = HINT_GLOW_RISE_MS; t <= HINT_GLOW_BREATHE_END_MS; t += 10) {
      samples.push(hintGlowIntensity(t));
    }
    let descents = 0;
    for (let i = 1; i < samples.length; i++) {
      const current = samples[i]!;
      const previous = samples[i - 1]!;
      if (current < previous - 1e-9) descents++;
    }
    // Two breaths means the curve descends across roughly half the samples.
    expect(descents).toBeGreaterThan(samples.length / 4);
  });

  it('decays to exactly zero by the end of the decay window, and stays there', () => {
    expect(hintGlowIntensity(HINT_GLOW_DECAY_END_MS)).toBe(0);
    expect(hintGlowIntensity(HINT_GLOW_DECAY_END_MS + 500)).toBe(0);
  });
});

describe('mergeSeamIntensity', () => {
  it('is silent before it fires and after it ends', () => {
    expect(mergeSeamIntensity(-1)).toBe(0);
    expect(mergeSeamIntensity(MERGE_SEAM_DURATION_MS)).toBe(0);
    expect(mergeSeamIntensity(MERGE_SEAM_DURATION_MS + 50)).toBe(0);
  });

  it('reaches its peak of 0.7 within the duration, then feathers to nothing', () => {
    const samples: number[] = [];
    for (let t = 0; t < MERGE_SEAM_DURATION_MS; t += 5) samples.push(mergeSeamIntensity(t));
    const peak = Math.max(...samples);
    expect(peak).toBeCloseTo(MERGE_SEAM_PEAK, 1);

    const peakIndex = samples.indexOf(peak);
    // Short-lived: it attacks fast and spends most of the duration feathering out.
    expect(peakIndex).toBeLessThan(samples.length / 2);
  });
});

describe('edgeFrameProgress', () => {
  it('has drawn nothing before it fires', () => {
    expect(edgeFrameProgress(-1)).toBe(0);
  });

  it('reaches the full perimeter exactly at the trace duration, and stays there', () => {
    expect(edgeFrameProgress(EDGE_FRAME_TRACE_MS)).toBeCloseTo(1, 5);
    expect(edgeFrameProgress(EDGE_FRAME_TRACE_MS + 400)).toBeCloseTo(1, 5);
  });

  it('is linear, not eased — halfway through time is halfway around the border', () => {
    expect(edgeFrameProgress(EDGE_FRAME_TRACE_MS / 2)).toBeCloseTo(0.5, 5);
  });
});

describe('completionIntensity', () => {
  it('ramps from 0 to 1 over the ramp window', () => {
    expect(completionIntensity(0)).toBeCloseTo(0, 5);
    expect(completionIntensity(COMPLETION_RAMP_MS)).toBeCloseTo(1, 5);
  });

  it('holds at 1 for the hold window', () => {
    expect(completionIntensity(COMPLETION_RAMP_MS + COMPLETION_HOLD_MS / 2)).toBe(1);
  });

  it('settles to 0.85 after the hold, and stays there — the glow never turns off', () => {
    const end = COMPLETION_RAMP_MS + COMPLETION_HOLD_MS;
    expect(completionIntensity(end + 1)).toBeCloseTo(COMPLETION_SETTLE_INTENSITY, 5);
    expect(completionIntensity(end + 10_000)).toBeCloseTo(COMPLETION_SETTLE_INTENSITY, 5);
  });
});
