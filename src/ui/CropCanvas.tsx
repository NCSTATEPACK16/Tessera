/**
 * The crop frame, folded into setup (v2 spec §4 step 2). Extracted from step
 * 5a's `PhotoCrop` screen, which it replaces: the same frame, pan, aspect and
 * 90° rotation, now a controlled component so setup owns the state and the
 * piece-grid overlay can follow the count the player is choosing.
 *
 * Rotation is 90-degree increments only — arbitrary-angle rotation would
 * fight the cutter's grid math (`src/cut/grid.ts` assumes an axis-aligned
 * rectangle) and isn't EXIF-safe.
 */

import { useEffect, useMemo, useRef } from 'react';
import { chooseGrid } from '@/cut/grid';
import type { CropRect, Point, RotateSteps } from '@/play/photo';
import {
  clampPan,
  computeCropRect,
  downscaleTarget,
  effectiveSize,
  MAX_ZOOM,
  MIN_ZOOM,
} from '@/play/photo';

export interface CropState {
  aspect: number | 'original';
  rotateSteps: RotateSteps;
  zoom: number;
  pan: Point;
}

export const INITIAL_CROP: CropState = {
  aspect: 'original',
  rotateSteps: 0,
  zoom: MIN_ZOOM,
  pan: { x: 0, y: 0 },
};

export const ASPECTS: { label: string; value: number | 'original' }[] = [
  { label: 'Original', value: 'original' },
  { label: 'Square', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '16:9', value: 16 / 9 },
];

function frameAspectOf(source: ImageBitmap, state: CropState): number {
  return state.aspect === 'original' ? source.width / source.height : state.aspect;
}

/** The part of the (rotated) photo the frame shows, in photo pixels. */
export function cropRectOf(source: ImageBitmap, state: CropState): CropRect {
  return computeCropRect(
    { width: source.width, height: source.height },
    frameAspectOf(source, state),
    state.rotateSteps,
    state.zoom,
    state.pan,
  );
}

/** Re-clamps the pan after zoom, aspect or rotation changed under it. */
export function clampCrop(source: ImageBitmap, state: CropState): CropState {
  const pan = clampPan(
    { width: source.width, height: source.height },
    frameAspectOf(source, state),
    state.rotateSteps,
    state.zoom,
    state.pan,
  );
  return pan.x === state.pan.x && pan.y === state.pan.y ? state : { ...state, pan };
}

function rasterizeCrop(
  source: ImageBitmap,
  rotateSteps: RotateSteps,
  rect: CropRect,
  target: { width: number; height: number },
): ImageBitmap {
  const size = effectiveSize({ width: source.width, height: source.height }, rotateSteps);

  const rotated = new OffscreenCanvas(size.width, size.height);
  const rctx = rotated.getContext('2d');
  if (!rctx) throw new Error('rasterizeCrop: no 2d context');
  rctx.save();
  rctx.translate(size.width / 2, size.height / 2);
  rctx.rotate((rotateSteps * Math.PI) / 2);
  rctx.drawImage(source, -source.width / 2, -source.height / 2);
  rctx.restore();

  const out = new OffscreenCanvas(target.width, target.height);
  const octx = out.getContext('2d');
  if (!octx) throw new Error('rasterizeCrop: no 2d context');
  octx.drawImage(
    rotated,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    target.width,
    target.height,
  );
  return out.transferToImageBitmap();
}

/** The cropped, downscaled bitmap the cutter receives. A fresh instance. */
export function finishCrop(source: ImageBitmap, state: CropState): ImageBitmap {
  const rect = cropRectOf(source, state);
  return rasterizeCrop(source, state.rotateSteps, rect, downscaleTarget(rect.width, rect.height));
}

export interface CropCanvasProps {
  source: ImageBitmap;
  state: CropState;
  onChange: (next: CropState) => void;
  /** The piece count the overlay previews — setup's live choice. */
  gridCount: number;
}

export function CropCanvas({
  source,
  state,
  onChange,
  gridCount,
}: CropCanvasProps): React.ReactElement {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Every pointer down on the frame: one pans, two pinch. */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | { kind: 'pan'; x: number; y: number; pan: Point }
    | { kind: 'pinch'; distance: number; zoom: number }
    | null
  >(null);

  const frameAspect = frameAspectOf(source, state);
  const rect = useMemo(() => cropRectOf(source, state), [source, state]);

  // The source bitmap is drawn once per `source` change, not on every render —
  // an inline ref callback would re-run `drawImage` (a full, undownscaled
  // decode) on every pointermove during a drag.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    el.width = source.width;
    el.height = source.height;
    const ctx = el.getContext('2d');
    ctx?.clearRect(0, 0, el.width, el.height);
    ctx?.drawImage(source, 0, 0);
  }, [source]);

  const grid = useMemo(() => {
    try {
      return chooseGrid({
        imageWidth: rect.width,
        imageHeight: rect.height,
        targetCount: gridCount,
      });
    } catch {
      // Extreme aspect ratios can fall outside chooseGrid's search window —
      // the overlay is illustrative, so skip it rather than block the crop.
      return null;
    }
  }, [rect.width, rect.height, gridCount]);

  const distance = (): number => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  const begin = (): void => {
    if (pointers.current.size >= 2) {
      gesture.current = {
        kind: 'pinch',
        distance: distance(),
        zoom: state.zoom,
      };
    } else {
      const [only] = [...pointers.current.values()];
      gesture.current = only ? { kind: 'pan', x: only.x, y: only.y, pan: state.pan } : null;
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    begin();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const frameEl = frameRef.current;
    if (!g || !frameEl) return;

    if (g.kind === 'pinch') {
      if (g.distance === 0) return;
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, g.zoom * (distance() / g.distance)));
      onChange(clampCrop(source, { ...state, zoom }));
      return;
    }

    // Screen pixels -> photo pixels: the frame's on-screen width represents
    // `rect.width` photo pixels at the current zoom. Dragging the photo right
    // moves the visible window left, hence the negation — the same convention
    // the board's camera pan uses.
    const screenToPhoto = rect.width / frameEl.getBoundingClientRect().width;
    const pan = {
      x: g.pan.x - (e.clientX - g.x) * screenToPhoto,
      y: g.pan.y - (e.clientY - g.y) * screenToPhoto,
    };
    onChange(clampCrop(source, { ...state, pan }));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    pointers.current.delete(e.pointerId);
    // A pinch that drops to one finger continues as a pan from where it is.
    begin();
  };

  return (
    // `shrink-0` and a max height: a bare flex child with only an `aspectRatio`
    // and an absolutely-positioned canvas has no intrinsic min-height, so a
    // height-constrained column would squash it to a thin strip of the photo.
    <div
      ref={frameRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      aria-label="Crop: drag to reposition, pinch to zoom"
      className="relative mx-auto w-full shrink-0 touch-none overflow-hidden rounded-[var(--radius-md)] border border-[var(--edge-hair)]"
      style={{
        aspectRatio: frameAspect,
        maxHeight: '48vh',
        maxWidth: `calc(48vh * ${frameAspect})`,
        background: 'var(--mat-void)',
      }}
    >
      <canvas
        ref={canvasRef}
        data-testid="crop-source-aspect"
        className="absolute left-1/2 top-1/2 max-w-none"
        style={{
          width: `${(source.width / rect.width) * 100}%`,
          // The photo's own translate is a percentage of the canvas's local
          // (pre-rotation) box, the same basis the width uses, which keeps the
          // offset self-consistent under rotation. Increasing pan.x moves the
          // crop rect's centre right in photo space, so the image shifts left.
          transform: `translate(calc(-50% - ${(100 * state.pan.x) / source.width}%), calc(-50% - ${(100 * state.pan.y) / source.height}%)) rotate(${state.rotateSteps * 90}deg)`,
        }}
      />
      {grid && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          {Array.from({ length: grid.cols - 1 }, (_, i) => (
            <line
              key={`v${i}`}
              x1={`${((i + 1) / grid.cols) * 100}%`}
              y1="0"
              x2={`${((i + 1) / grid.cols) * 100}%`}
              y2="100%"
              stroke="rgba(255,255,255,0.35)"
              strokeWidth={1}
            />
          ))}
          {Array.from({ length: grid.rows - 1 }, (_, i) => (
            <line
              key={`h${i}`}
              x1="0"
              y1={`${((i + 1) / grid.rows) * 100}%`}
              x2="100%"
              y2={`${((i + 1) / grid.rows) * 100}%`}
              stroke="rgba(255,255,255,0.35)"
              strokeWidth={1}
            />
          ))}
        </svg>
      )}
    </div>
  );
}
