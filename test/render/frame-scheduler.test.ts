/**
 * "On an idle board with no finger down, both layers are still and the app
 * draws nothing at all. That is how the iPad stays cool for a sixty-minute
 * session." (§03)
 *
 * That claim is a scheduling property, so it gets asserted directly rather than
 * assumed. A renderer that redraws an unchanged scene every frame would pass a
 * pixel test and fail the design.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FrameScheduler } from '@/render/frame-scheduler';
import type { LayerName } from '@/render/frame-scheduler';

/** A hand-cranked rAF, so frames advance only when a test says so. */
class FakeRaf {
  private queue = new Map<number, (time: number) => void>();
  private nextHandle = 1;
  private now = 0;

  readonly request = (callback: (time: number) => void): number => {
    const handle = this.nextHandle++;
    this.queue.set(handle, callback);
    return handle;
  };

  readonly cancel = (handle: number): void => {
    this.queue.delete(handle);
  };

  get pending(): number {
    return this.queue.size;
  }

  /** Run everything currently queued. Callbacks may enqueue more. */
  flush(steps = 1): void {
    for (let i = 0; i < steps; i++) {
      const batch = [...this.queue.entries()];
      this.queue.clear();
      this.now += 16.67;
      for (const [, cb] of batch) cb(this.now);
    }
  }
}

describe('FrameScheduler', () => {
  let raf: FakeRaf;
  let painted: ReadonlySet<LayerName>[];
  let scheduler: FrameScheduler;

  beforeEach(() => {
    raf = new FakeRaf();
    painted = [];
    scheduler = new FrameScheduler({
      onFrame: (dirty) => painted.push(new Set(dirty)),
      requestFrame: raf.request,
      cancelFrame: raf.cancel,
    });
  });

  it('schedules nothing until something is invalidated', () => {
    expect(scheduler.isScheduled).toBe(false);
    expect(raf.pending).toBe(0);
  });

  it('goes back to sleep after drawing, and stays asleep', () => {
    scheduler.invalidate('dynamic');
    expect(scheduler.isScheduled).toBe(true);

    raf.flush();
    expect(painted).toHaveLength(1);

    // The point of the test: an idle board re-arms nothing.
    expect(scheduler.isScheduled).toBe(false);
    expect(raf.pending).toBe(0);

    raf.flush(10);
    expect(painted).toHaveLength(1);
    expect(scheduler.frameCount).toBe(1);
  });

  it('coalesces many invalidations into one frame', () => {
    scheduler.invalidate('dynamic');
    scheduler.invalidate('dynamic');
    scheduler.invalidate('overlay');
    scheduler.invalidate('static');

    raf.flush();

    expect(painted).toHaveLength(1);
    expect([...painted[0]!].sort()).toEqual(['dynamic', 'overlay', 'static']);
  });

  it('reports only the layers that were dirty', () => {
    scheduler.invalidate('mat');
    raf.flush();
    expect([...painted[0]!]).toEqual(['mat']);
  });

  it('keeps drawing while an animator is registered', () => {
    scheduler.startAnimating('drag');
    raf.flush(5);

    expect(painted).toHaveLength(5);
    expect(scheduler.isScheduled).toBe(true);
    for (const frame of painted) {
      expect(frame.has('dynamic')).toBe(true);
      expect(frame.has('overlay')).toBe(true);
    }
  });

  it('falls asleep one frame after the last animator stops', () => {
    scheduler.startAnimating('spring');
    raf.flush(3);
    expect(painted).toHaveLength(3);

    scheduler.stopAnimating('spring');
    // One already-queued frame runs, finds nothing dirty, and does not re-arm.
    raf.flush(1);
    const settled = painted.length;

    raf.flush(10);
    expect(painted).toHaveLength(settled);
    expect(scheduler.isScheduled).toBe(false);
  });

  it('keeps running while any animator remains', () => {
    scheduler.startAnimating('drag');
    scheduler.startAnimating('hint-glow');
    raf.flush(2);

    scheduler.stopAnimating('drag');
    expect(scheduler.isAnimating).toBe(true);

    raf.flush(2);
    expect(scheduler.isScheduled).toBe(true);

    scheduler.stopAnimating('hint-glow');
    raf.flush(2);
    expect(scheduler.isScheduled).toBe(false);
  });

  it('is idempotent per animator source', () => {
    scheduler.startAnimating('drag');
    scheduler.startAnimating('drag');
    scheduler.stopAnimating('drag');
    expect(scheduler.isAnimating).toBe(false);
  });

  it('stop() cancels a pending frame and clears state', () => {
    scheduler.invalidate('dynamic');
    scheduler.startAnimating('drag');
    expect(raf.pending).toBe(1);

    scheduler.stop();

    expect(raf.pending).toBe(0);
    expect(scheduler.isScheduled).toBe(false);
    expect(scheduler.isAnimating).toBe(false);

    raf.flush(5);
    expect(painted).toHaveLength(0);
  });

  it('invalidateAll marks the whole stack', () => {
    scheduler.invalidateAll();
    raf.flush();
    expect([...painted[0]!].sort()).toEqual(['dynamic', 'mat', 'overlay', 'static']);
  });

  it('wakes again cleanly after going idle', () => {
    scheduler.invalidate('dynamic');
    raf.flush();
    expect(scheduler.isScheduled).toBe(false);

    scheduler.invalidate('static');
    expect(scheduler.isScheduled).toBe(true);
    raf.flush();

    expect(painted).toHaveLength(2);
    expect([...painted[1]!]).toEqual(['static']);
  });

  it('defaults to the global rAF when none is injected', () => {
    const request = vi.fn().mockReturnValue(7);
    vi.stubGlobal('requestAnimationFrame', request);

    const plain = new FrameScheduler({ onFrame: () => {} });
    plain.invalidate('dynamic');
    expect(request).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
  });
});
