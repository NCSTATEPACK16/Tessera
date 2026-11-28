/**
 * The three-detent bottom sheet (§06, §12).
 *
 * "iPhone portrait: a bottom sheet at three detents — peek (one row of pieces,
 * ~96pt), half, and full — with the lens chips pinned to the sheet header so
 * they are reachable one-handed."
 *
 * The header is pinned rather than scrolled with the content because the whole
 * point of the detents is one-handed reach: a lens chip that scrolls out of the
 * thumb's arc is a lens chip that is not offered.
 *
 * Dragging the handle tracks the finger 1:1 (rubber-banded past the end
 * detents), and a release lands on the detent its velocity points at, settling
 * on a critically damped spring — never a bounce, never a snap-back to where
 * it started, for the same reason a dropped piece stays where it was dropped
 * (modernize spec §5, C1; the physics is `sheet-motion.ts`).
 *
 * The height is written to the element's style, frame by frame, and never held
 * in React state: React renders this component once per detent change, so a
 * drag or a settle cannot re-render the chip grid inside it.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { heightOf, type SheetDetent } from './sheet-detents';
import { releaseTarget, rubberBand, settleSheet } from './sheet-motion';

const DETENTS: readonly SheetDetent[] = ['peek', 'default', 'half', 'full'];
/** Velocity is measured over the last stretch of the drag, not its whole length. */
const VELOCITY_WINDOW_MS = 100;

export interface SheetProps {
  rootRef?: React.Ref<HTMLElement> | undefined;
  detent: SheetDetent;
  onDetent: (detent: SheetDetent) => void;
  /** The title row. Pinned, and the first thing in the sheet after the handle. */
  header: React.ReactNode;
  /**
   * The pinned shelf row (§06), rendered directly under the title and **above**
   * the lens chips.
   *
   * Under the title because that is the only place peek can afford to keep it.
   * `collapseForDrag()` drops the sheet to peek at the exact moment a drag makes
   * the shelf appear, so the shelf is the one thing in this region that has to
   * survive peek — a drop target no finger can reach is not a drop target, no
   * matter how correct `isOverShelf` is about its rectangle. The lens chips
   * clip at peek instead, which is what they already did before the shelf
   * existed, so nothing is lost that was ever there.
   *
   * `undefined`/no node when the shelf has nothing to show; see `shelfVisible`.
   */
  shelf?: React.ReactNode;
  /** Whether `shelf` will actually render a row, so peek can grow to fit it. */
  shelfVisible?: boolean;
  /**
   * §C: the box-lid reference panel, rendered in the same pinned region as
   * `shelf`, after it. Grows/shrinks peek automatically through the existing
   * `ResizeObserver` on `pinned` — no new measurement needed.
   */
  reference?: React.ReactNode;
  /**
   * Whether `reference` is currently rendering its expanded (open) form, so
   * peek can grow to fit it — same reasoning as `shelfVisible`. The panel's
   * collapsed strip is slim enough to leave peek at its floor; the open
   * thumbnail is not, and without this peek stays flat at `PEEK_PX` and the
   * panel is clipped by the sheet's own height.
   */
  referenceVisible?: boolean;
  /** The lens row. Pinned too, but the first thing peek is allowed to clip. */
  lenses: React.ReactNode;
  children: React.ReactNode;
}

export function Sheet({
  rootRef,
  detent,
  onDetent,
  header,
  shelf,
  shelfVisible = false,
  reference,
  referenceVisible = false,
  lenses,
  children,
}: SheetProps): React.ReactElement {
  const viewport = typeof window === 'undefined' ? 800 : window.innerHeight;
  const section = useRef<HTMLElement | null>(null);
  const origin = useRef<{ y: number; height: number } | null>(null);
  const samples = useRef<{ t: number; h: number }[]>([]);
  const frame = useRef<number | null>(null);
  /** The height on screen right now — what a new drag or settle starts from. */
  const shown = useRef<number | null>(null);
  /** Where the running settle is headed, so a re-render toward it leaves it alone. */
  const aim = useRef<number | null>(null);

  // The handle, the title and the shelf: everything peek is obliged to fit.
  const pinned = useRef<HTMLDivElement>(null);
  const [pinnedPx, setPinnedPx] = useState<number | null>(null);
  // The pinned box plus the lens row: what default must clear before any
  // piece shows. Measured the same way, for the same reasons.
  const chrome = useRef<HTMLDivElement>(null);
  const [chromePx, setChromePx] = useState<number | null>(null);

  useEffect(() => {
    const element = pinned.current;
    const lensRow = chrome.current;
    if (!element || !lensRow) return;

    const read = (): void => {
      const section = element.parentElement;
      if (!section) return;

      // From the section's own top *edge* to the shelf's bottom, not the pinned
      // box's own height. `height` here is a border box, and the section carries
      // a 1px `border-t` — which is exactly how much of the shelf hung off the
      // bottom of the screen the first time this was measured. Anything else
      // ever added above the content, a top padding included, is covered too.
      const top = section.getBoundingClientRect().top;
      const bottom = element.getBoundingClientRect().bottom - top;
      // And the section's bottom padding is the home-indicator inset, which the
      // border box also owes room for. Zero in a desktop browser and ~34px on
      // the device this detent exists for — read, never assumed.
      const inset = Number.parseFloat(getComputedStyle(section).paddingBottom);

      // Rounded up: a region 100.5px tall does not fit in 100, and the whole
      // point of measuring is that the shelf's last row of pixels stays on
      // screen.
      const insetPx = Number.isFinite(inset) ? inset : 0;
      setPinnedPx(Math.ceil(bottom) + insetPx);
      setChromePx(Math.ceil(lensRow.getBoundingClientRect().bottom - top) + insetPx);
    };
    read();
    // Fires when the shelf appears, when it swaps its dashed placeholder for a
    // real chip, and when a rotation rewraps anything above it.
    const observer = new ResizeObserver(read);
    observer.observe(element);
    observer.observe(lensRow);
    return () => observer.disconnect();
  }, []);

  // Either the shelf or the open reference panel is enough on its own to
  // pull peek off its floor — whichever is asking, the measured box is the
  // same `pinnedPx`.
  const growPeek = shelfVisible || referenceVisible;
  const resting = heightOf(detent, viewport, growPeek, pinnedPx, chromePx);
  const heights = DETENTS.map((d) => heightOf(d, viewport, growPeek, pinnedPx, chromePx));
  const peekFloor = heights[0]!;
  const fullCeiling = heights[heights.length - 1]!;

  const setRootRef = useCallback(
    (element: HTMLElement | null) => {
      section.current = element;
      if (typeof rootRef === 'function') rootRef(element);
      else if (rootRef) (rootRef as React.MutableRefObject<HTMLElement | null>).current = element;
    },
    [rootRef],
  );

  const write = (h: number): void => {
    shown.current = h;
    const element = section.current;
    if (element) element.style.height = `${h}px`;
  };

  const stop = (): void => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };

  /** Settle from what is on screen to `target`, seeded with `v` (px/s, + = growing). */
  const settleTo = useCallback((target: number, v: number): void => {
    stop();
    aim.current = target;
    const element = section.current;
    const from = shown.current;
    if (!element || from === null || from === target) {
      write(target);
      return;
    }
    const reduced =
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduced) {
      // §5: reduced motion is a 120ms ease to the detent, no spring.
      element.style.transition = 'height var(--duration-fast) var(--ease-standard)';
      write(target);
      return;
    }
    element.style.transition = 'none';
    let state = { h: from, v };
    let last = performance.now();
    const step = (now: number): void => {
      // Clamped: a backgrounded tab must not integrate one enormous step.
      const dt = Math.min(1 / 30, (now - last) / 1000);
      last = now;
      const next = settleSheet(state, target, dt);
      state = next;
      write(next.h);
      frame.current = next.done ? null : requestAnimationFrame(step);
      if (next.done) aim.current = null;
    };
    frame.current = requestAnimationFrame(step);
  }, []);

  // A detent change from outside — a collapse for a drag, its restore, a
  // remeasure that moves where a detent sits — settles from wherever the
  // sheet is. Layout effect: the first height lands before the first paint.
  useLayoutEffect(() => {
    if (origin.current) return; // under a finger: the release will settle it
    // The release already set off toward this detent, with its own velocity.
    if (aim.current === resting && frame.current !== null) return;
    if (shown.current === null) write(resting);
    else settleTo(resting, 0);
  }, [resting, settleTo]);

  useEffect(() => stop, []);

  return (
    <section
      ref={setRootRef}
      aria-label="Pieces"
      // `overflow-hidden`: `height` here is a fixed, JS-computed detent value
      // and pinned content (`shrink-0`) does not get squeezed to fit it —
      // without clipping, content taller than the current detent spills
      // past the section's own rounded-corner boundary, landing wherever it
      // lands underneath, which once put the select-mode action bar's hit
      // area directly over a piece chip above it (nothing looked wrong on
      // screen; taps just landed on the wrong thing).
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-10 flex flex-col overflow-hidden rounded-t-[22px] border-t border-[var(--edge-hair)] bg-[var(--mat-raised)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Everything peek must fit, in one measured box. */}
      <div ref={pinned} className="shrink-0">
        <div
          role="separator"
          aria-label="Resize the piece tray"
          className="flex h-[28px] shrink-0 cursor-grab items-center justify-center"
          style={{ touchAction: 'none' }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            stop();
            const height = shown.current ?? resting;
            origin.current = { y: event.clientY, height };
            samples.current = [{ t: event.timeStamp, h: height }];
            if (section.current) section.current.style.transition = 'none';
          }}
          onPointerMove={(event) => {
            const start = origin.current;
            if (!start) return;
            const h = rubberBand(start.height + (start.y - event.clientY), peekFloor, fullCeiling);
            write(h);
            samples.current.push({ t: event.timeStamp, h });
            const cutoff = event.timeStamp - VELOCITY_WINDOW_MS;
            while (samples.current.length > 2 && samples.current[0]!.t < cutoff) {
              samples.current.shift();
            }
          }}
          onPointerUp={(event) => {
            if (!origin.current) return;
            origin.current = null;
            const first = samples.current[0];
            const last = samples.current[samples.current.length - 1];
            const span = first && last ? (last.t - first.t) / 1000 : 0;
            // A finger that stopped before lifting has no velocity left.
            const still = last ? event.timeStamp - last.t > VELOCITY_WINDOW_MS : true;
            const v = span > 0 && !still ? (last!.h - first!.h) / span : 0;
            const target = releaseTarget(shown.current ?? resting, v, heights);
            settleTo(target, v);
            const next = DETENTS[heights.indexOf(target)]!;
            if (next !== detent) onDetent(next);
          }}
          onPointerCancel={() => {
            origin.current = null;
            settleTo(resting, 0);
          }}
        >
          <span aria-hidden className="h-[4px] w-[36px] rounded-full bg-[var(--edge-hair)]" />
        </div>

        {/* Pinned, and the shelf's anchor: peek is sized from this box. */}
        <div className="shrink-0 px-[12px]">{header}</div>

        {/* The one thing in the sheet that must survive peek — see `shelf`. */}
        {/* The reference panel sits under the title row that toggles it. */}
        {reference}
        {shelf}
      </div>

      {/* Pinned too, so the lenses stay in the thumb's arc at half and full.
          They are what peek clips, which is what peek did before 3b. */}
      <div ref={chrome} className="shrink-0 px-[12px] pb-[8px] pt-[12px]">
        {lenses}
      </div>

      {children}
    </section>
  );
}
