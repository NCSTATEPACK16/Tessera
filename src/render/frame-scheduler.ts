/**
 * Frame scheduling and layer invalidation.
 *
 * "On an idle board with no finger down, both layers are still and the app
 * draws nothing at all. That is how the iPad stays cool for a sixty-minute
 * session." (design doc §03)
 *
 * That is a *scheduling* property, not a drawing one — a renderer that redraws
 * an unchanged scene every frame satisfies no part of it. So invalidation is
 * explicit and lives here, isolated from any canvas, which also makes the
 * "idle board schedules nothing" claim directly testable.
 */

export type LayerName = 'mat' | 'static' | 'dynamic' | 'overlay';

export const ALL_LAYERS: readonly LayerName[] = ['mat', 'static', 'dynamic', 'overlay'] as const;

export type RafLike = (callback: (time: number) => void) => number;
export type CancelRafLike = (handle: number) => void;

export interface FrameSchedulerOptions {
  onFrame: (dirty: ReadonlySet<LayerName>, time: number) => void;
  requestFrame?: RafLike;
  cancelFrame?: CancelRafLike;
}

export class FrameScheduler {
  private readonly dirty = new Set<LayerName>();
  private readonly onFrame: FrameSchedulerOptions['onFrame'];
  private readonly requestFrame: RafLike;
  private readonly cancelFrame: CancelRafLike;

  private handle: number | null = null;
  /** Sources holding the loop open — a drag, a spring, a breathing hint glow. */
  private readonly animators = new Set<string>();

  /** Frames actually drawn. Read by tests and the dev harness's HUD. */
  frameCount = 0;

  constructor(options: FrameSchedulerOptions) {
    this.onFrame = options.onFrame;
    this.requestFrame =
      options.requestFrame ?? ((cb) => globalThis.requestAnimationFrame(cb));
    this.cancelFrame =
      options.cancelFrame ?? ((h) => globalThis.cancelAnimationFrame(h));
  }

  /** Mark a layer as needing a redraw and wake the loop if it is asleep. */
  invalidate(...layers: LayerName[]): void {
    for (const layer of layers) this.dirty.add(layer);
    this.wake();
  }

  invalidateAll(): void {
    this.invalidate(...ALL_LAYERS);
  }

  /**
   * Hold the loop open for a continuous source. The dynamic and overlay layers
   * are treated as dirty every frame while any animator is registered.
   */
  startAnimating(source: string): void {
    this.animators.add(source);
    this.wake();
  }

  stopAnimating(source: string): void {
    this.animators.delete(source);
  }

  get isAnimating(): boolean {
    return this.animators.size > 0;
  }

  /** True when a frame is pending. An idle board must report false. */
  get isScheduled(): boolean {
    return this.handle !== null;
  }

  get pending(): ReadonlySet<LayerName> {
    return this.dirty;
  }

  stop(): void {
    if (this.handle !== null) {
      this.cancelFrame(this.handle);
      this.handle = null;
    }
    this.animators.clear();
    this.dirty.clear();
  }

  private wake(): void {
    if (this.handle !== null) return;
    if (this.dirty.size === 0 && this.animators.size === 0) return;
    this.handle = this.requestFrame(this.tick);
  }

  private readonly tick = (time: number): void => {
    this.handle = null;

    if (this.animators.size > 0) {
      this.dirty.add('dynamic');
      this.dirty.add('overlay');
    }

    if (this.dirty.size === 0) return;

    const drawing = new Set(this.dirty);
    this.dirty.clear();
    this.frameCount++;
    this.onFrame(drawing, time);

    // Re-arm only if something still wants frames. An idle board falls through
    // here and stops scheduling entirely.
    this.wake();
  };
}
