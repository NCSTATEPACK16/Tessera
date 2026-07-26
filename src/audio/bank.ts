/**
 * The sample bank — synthesised, seeded, three layers deep (§08).
 *
 * Recorded samples will replace this; the shape it hands back will not change,
 * which is the point of building it now. What must not change either way:
 *
 *   transient  8ms of bright filtered noise. This is the contact, and it is the
 *              only layer the pitch ladder ever touches.
 *   body       a felt thump — the mass arriving behind the surface.
 *   tail       200ms of small room. Fixed pitch forever, because the tail is
 *              what tells the ear how big the space is.
 *
 * Seeded because "does this snap sound right?" has to survive a page reload to
 * be answerable at all, and §17 budgets a week on exactly that question.
 */

import { rngFor } from '@/core/rng';
import { VARIANTS } from './voices';

/** §08: an 8ms transient and a 200ms tail. The body sits between them. */
export const LAYER_MS = {
  transient: 8,
  body: 60,
  tail: 200,
} as const;

/** §08: four round-robin samples per layer, ±3% detune. */
export const VARIANT_DETUNE = 0.03;

export interface SampleBank {
  transient: Float32Array[];
  body: Float32Array[];
  tail: Float32Array[];
}

export function synthesiseBank(sampleRate: number, seed = 1): SampleBank {
  const bank: SampleBank = { transient: [], body: [], tail: [] };

  for (let variant = 0; variant < VARIANTS; variant++) {
    // Spread the four variants evenly across ±3% rather than at random, so no
    // two of them land on top of each other.
    const detune = 1 + VARIANT_DETUNE * ((variant / (VARIANTS - 1)) * 2 - 1);
    bank.transient.push(transient(sampleRate, seed, variant, detune));
    bank.body.push(body(sampleRate, seed, variant, detune));
    bank.tail.push(tail(sampleRate, seed, variant, detune));
  }

  return bank;
}

function lengthFor(sampleRate: number, ms: number): number {
  return Math.round((sampleRate * ms) / 1000);
}

/**
 * The ceramic click: noise through a one-pole high-pass, decaying in a couple of
 * milliseconds. No attack ramp at all — a transient with a fade-in is not a
 * transient, it is a swell, and the ear reads it as mush rather than contact.
 */
function transient(sampleRate: number, seed: number, variant: number, detune: number): Float32Array {
  const rng = rngFor(seed, 'audio-transient', variant);
  const out = new Float32Array(lengthFor(sampleRate, LAYER_MS.transient));
  const decay = 420 / detune;
  let previous = 0;

  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    const noise = rng.next() * 2 - 1;
    // One-pole high-pass: the difference of successive samples is bright.
    const bright = noise - previous;
    previous = noise;
    out[i] = clamp(bright * Math.exp(-decay * t) * 0.9 * endFade(i, out.length));
  }
  return out;
}

/** The felt thump — a low sine that arrives with the mass and is gone quickly. */
function body(sampleRate: number, seed: number, variant: number, detune: number): Float32Array {
  const rng = rngFor(seed, 'audio-body', variant);
  const out = new Float32Array(lengthFor(sampleRate, LAYER_MS.body));
  const frequency = 132 * detune * (1 + rng.jitter(0.01));
  const decay = 70;

  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    out[i] = clamp(
      Math.sin(2 * Math.PI * frequency * t) * Math.exp(-decay * t) * 0.8 * endFade(i, out.length),
    );
  }
  return out;
}

/**
 * The room. Exponentially decaying noise, low-passed so it reads as air rather
 * than as hiss, and long enough to place the board somewhere physical.
 */
function tail(sampleRate: number, seed: number, variant: number, detune: number): Float32Array {
  const rng = rngFor(seed, 'audio-tail', variant);
  const out = new Float32Array(lengthFor(sampleRate, LAYER_MS.tail));
  const decay = 26 / detune;
  let filtered = 0;

  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    const noise = rng.next() * 2 - 1;
    filtered += (noise - filtered) * 0.18;
    out[i] = clamp(filtered * Math.exp(-decay * t) * 0.5 * endFade(i, out.length));
  }
  return out;
}

/**
 * Ramp the last few per cent of a buffer to zero.
 *
 * Every layer needs it, the transient most of all: at 8ms its exponential is
 * still at ~4% when the buffer ends, and a buffer that stops mid-swing clicks.
 * That click would play on top of every single snap — 250 times a board — and
 * would be very hard to attribute to the sample rather than to the mix.
 */
function endFade(index: number, length: number): number {
  const window = Math.max(1, Math.floor(length * 0.25));
  const remaining = length - 1 - index;
  return remaining >= window ? 1 : remaining / window;
}

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value));
}
