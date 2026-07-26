/**
 * The audio engine (§08).
 *
 * Web Audio directly rather than a library, because this needs three things a
 * general-purpose player fights: a sample pool, per-voice pitch shifting on one
 * layer only, and a duck bus.
 *
 * > "A snap that arrives 80ms late is worse than no snap; latency is a design
 * > property here, not an engineering detail."
 *
 * So every sound is a buffer already in memory, started at an absolute context
 * time — never a fetch, never a decode, never a promise on the hot path. The
 * bank is synthesised once at unlock.
 *
 * **The silent switch.** On iOS the hardware silent switch mutes Web Audio and
 * nothing in a web build can change that. That is not a bug to work around, it
 * is the reason §08's gate is what it is: *the snap must feel complete with the
 * device on silent and no vibration.* Audio is an amplifier here, never the
 * carrier. The native build opts into a playback category and gets the sound
 * back; the web build must already be good without it.
 *
 * This file is deliberately thin and has no unit tests — everything with logic
 * in it (the ladder, the voicing rules, the bank) lives next door and is tested
 * there. What is left is wiring, and wiring is judged by ear.
 */

import { synthesiseBank } from './bank';
import type { SampleBank } from './bank';
import { PitchLadder } from './ladder';
import type { SnapLayer, VoiceLayer } from './voices';
import { VARIANTS, mergeChord, roundRobin, snapVoice } from './voices';

export type SoundEvent =
  | 'pickup'
  | 'snap'
  | 'invalidDrop'
  | 'groupMerge'
  | 'edgeFrame'
  | 'hint'
  | 'completion';

export interface AudioEngineOptions {
  /** Zen turns the ladder off entirely and the ambient bed on (§08). */
  zen?: boolean;
}

export interface PlayOptions {
  /** Voices the group-merge chord. */
  clusterSize?: number;
  /** Monotonic ms, for the ladder's idle timeout. */
  nowMs?: number;
}

/** §08: duck the ambient bed 4dB for 300ms under each snap. */
const DUCK_DB = -4;
const DUCK_MS = 300;

const dbToGain = (db: number): number => Math.pow(10, db / 20);

export class AudioEngine {
  private context: AudioContext | null = null;
  private bank: SampleBank | null = null;
  private buffers: Record<SnapLayer, AudioBuffer[]> | null = null;

  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private ambient: GainNode | null = null;

  private readonly ladder: PitchLadder;
  private sequence = 0;

  constructor(private readonly options: AudioEngineOptions = {}) {
    this.ladder = new PitchLadder({ enabled: !options.zen });
  }

  get ready(): boolean {
    return this.context !== null && this.context.state === 'running';
  }

  /** The ladder step, for the HUD while tuning. */
  get ladderStep(): number {
    return this.ladder.step;
  }

  /**
   * Unlock on the first deliberate tap (§08) and build the bank there and then.
   *
   * Called from a real gesture handler or the context never leaves `suspended`
   * on iOS. Everything downstream is synchronous afterwards.
   */
  async unlock(): Promise<void> {
    if (this.context) {
      if (this.context.state === 'suspended') await this.context.resume();
      return;
    }

    const Ctor: typeof AudioContext | undefined =
      globalThis.AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const context = new Ctor();
    this.context = context;

    // Three independent buses, so ambient can duck without touching the snap.
    this.master = context.createGain();
    this.sfx = context.createGain();
    this.ambient = context.createGain();
    this.sfx.connect(this.master);
    this.ambient.connect(this.master);
    this.master.connect(context.destination);
    this.ambient.gain.value = this.options.zen ? 0.5 : 0;

    this.bank = synthesiseBank(context.sampleRate);
    this.buffers = {
      transient: this.bank.transient.map((data) => toBuffer(context, data)),
      body: this.bank.body.map((data) => toBuffer(context, data)),
      tail: this.bank.tail.map((data) => toBuffer(context, data)),
    };

    if (context.state === 'suspended') await context.resume();
  }

  /** Expire the ladder after eight idle seconds. Called from the frame loop. */
  tick(nowMs: number): void {
    this.ladder.tick(nowMs);
  }

  play(event: SoundEvent, options: PlayOptions = {}): void {
    if (!this.context || !this.buffers || !this.sfx) return;
    const now = this.context.currentTime;

    switch (event) {
      case 'snap': {
        // The ladder climbs, and only the transient hears about it.
        const rate = this.ladder.advance(options.nowMs ?? 0);
        this.playSnap(snapVoice(rate, roundRobin(this.sequence++, VARIANTS)), now, 1);
        this.duck(now);
        break;
      }
      case 'groupMerge': {
        // A chord instead of a note, voiced wider as the cluster grows.
        const rate = this.ladder.advance(options.nowMs ?? 0);
        const chord = mergeChord(options.clusterSize ?? 2);
        const variant = roundRobin(this.sequence++, VARIANTS);
        for (const interval of chord) {
          this.playSnap(snapVoice(rate * Math.pow(2, interval / 12), variant), now, 0.8);
        }
        this.duck(now);
        break;
      }
      case 'invalidDrop':
        // Neutral, quiet, never a buzzer. Information, not judgement — but the
        // run is over, so the ladder resets.
        this.ladder.break(options.nowMs ?? 0);
        this.playLayer('body', roundRobin(this.sequence++, VARIANTS), now, 0.28, 0.7);
        break;
      case 'pickup':
        // Soft peel: confirms the grab without commenting on it.
        this.playLayer('tail', roundRobin(this.sequence++, VARIANTS), now, 0.16, 1.6);
        break;
      case 'edgeFrame':
        // Longer, lower resonance marking a structural milestone.
        this.playLayer('body', roundRobin(this.sequence++, VARIANTS), now, 0.7, 0.5);
        this.playLayer('tail', 0, now + 0.01, 0.5, 0.7);
        break;
      case 'hint':
        // A rising swell peaking with the glow. Never a chime, or it reads as a
        // penalty for needing help.
        this.playLayer('tail', 1, now, 0.4, 0.6);
        break;
      case 'completion':
        for (const [index, interval] of [0, 7, 12, 16].entries()) {
          this.playLayer('body', roundRobin(index, VARIANTS), now + index * 0.09, 0.8, Math.pow(2, interval / 12));
          this.playLayer('tail', roundRobin(index, VARIANTS), now + index * 0.09, 0.4, 1);
        }
        break;
    }
  }

  /** Reset the run — a new puzzle, or a resumed one. */
  resetLadder(): void {
    this.ladder.reset();
  }

  suspend(): void {
    void this.context?.suspend();
  }

  destroy(): void {
    void this.context?.close();
    this.context = null;
    this.buffers = null;
    this.bank = null;
  }

  // -------------------------------------------------------------------------

  private playSnap(layers: VoiceLayer[], now: number, gain: number): void {
    for (const layer of layers) {
      this.playLayer(
        layer.layer,
        layer.variant,
        now + layer.delayMs / 1000,
        layer.gain * gain,
        layer.rate,
      );
    }
  }

  private playLayer(
    layer: SnapLayer,
    variant: number,
    at: number,
    gain: number,
    rate: number,
  ): void {
    const context = this.context;
    const buffers = this.buffers;
    const bus = this.sfx;
    if (!context || !buffers || !bus) return;

    const buffer = buffers[layer][variant % buffers[layer].length];
    if (!buffer) return;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;

    const amp = context.createGain();
    amp.gain.value = gain;
    source.connect(amp);
    amp.connect(bus);
    source.start(at);
  }

  /** Pull the ambient bed down 4dB under the snap, and let it back up. */
  private duck(now: number): void {
    const ambient = this.ambient;
    if (!ambient || ambient.gain.value === 0) return;
    const resting = this.options.zen ? 0.5 : 0;
    ambient.gain.cancelScheduledValues(now);
    ambient.gain.setValueAtTime(resting * dbToGain(DUCK_DB), now);
    ambient.gain.linearRampToValueAtTime(resting, now + DUCK_MS / 1000);
  }
}

function toBuffer(context: AudioContext, data: Float32Array): AudioBuffer {
  const buffer = context.createBuffer(1, data.length, context.sampleRate);
  buffer.getChannelData(0).set(data);
  return buffer;
}
