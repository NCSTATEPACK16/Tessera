/**
 * Step 5a's crop screen — the second half of the setup flow.
 *
 * No prototype to port here: `TesseraV3Figma`'s `NewPuzzleScreen` goes
 * straight from picking a photo to configuring piece count, with no crop
 * step at all. This screen is designed fresh, per
 * docs/superpowers/specs/2026-08-01-step-5a-photo-picker-crop-design.md.
 *
 * Rotation is 90-degree increments only — arbitrary-angle rotation would
 * fight the cutter's grid math (`src/cut/grid.ts` assumes an axis-aligned
 * rectangle) and isn't EXIF-safe.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { chooseGrid } from '@/cut/grid';
import { seedFromPuzzleId } from '@/core/rng';
import type { CropRect, Point, RotateSteps } from '@/play/photo';
import {
  clampPan,
  computeCropRect,
  downscaleTarget,
  effectiveSize,
  MAX_ZOOM,
  MIN_ZOOM,
} from '@/play/photo';

export interface PhotoCropResult {
  source: ImageBitmap;
  seed: number;
  puzzleId: string;
}

export interface PhotoCropProps {
  source: ImageBitmap;
  onConfirm: (result: PhotoCropResult) => void;
  onBack: () => void;
}

const ASPECTS: { label: string; value: number | 'original' }[] = [
  { label: 'Original', value: 'original' },
  { label: 'Square', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '16:9', value: 16 / 9 },
];

/** Purely illustrative — the real count is chosen on the setup screen, step 5b. */
const PREVIEW_TARGET_COUNT = 150;

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

export function PhotoCrop({ source, onConfirm, onBack }: PhotoCropProps): React.ReactElement {
  const originalAspect = source.width / source.height;
  const [aspectChoice, setAspectChoice] = useState<number | 'original'>('original');
  const [rotateSteps, setRotateSteps] = useState<RotateSteps>(0);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragStart = useRef<{ pointerId: number; x: number; y: number; pan: Point } | null>(null);

  const frameAspect = aspectChoice === 'original' ? originalAspect : aspectChoice;

  // Zooming in can make a pan that was valid at a lower zoom fall outside the
  // photo — re-clamp whenever zoom or aspect changes, not only on drag.
  useEffect(() => {
    setPan((p) =>
      clampPan({ width: source.width, height: source.height }, frameAspect, rotateSteps, zoom, p),
    );
  }, [zoom, frameAspect, rotateSteps, source.width, source.height]);

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

  const rect = useMemo(
    () =>
      computeCropRect(
        { width: source.width, height: source.height },
        frameAspect,
        rotateSteps,
        zoom,
        pan,
      ),
    [source.width, source.height, frameAspect, rotateSteps, zoom, pan],
  );

  const grid = useMemo(() => {
    try {
      return chooseGrid({
        imageWidth: rect.width,
        imageHeight: rect.height,
        targetCount: PREVIEW_TARGET_COUNT,
      });
    } catch {
      // Extreme aspect ratios can fall outside chooseGrid's search window —
      // the overlay is illustrative, so skip it rather than block the crop.
      return null;
    }
  }, [rect.width, rect.height]);

  const onFramePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragStart.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, pan };
  };

  const onFramePointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const start = dragStart.current;
    const frameEl = frameRef.current;
    if (!start || start.pointerId !== e.pointerId || !frameEl) return;

    // Screen pixels -> photo pixels: the frame's on-screen width represents
    // `rect.width` photo pixels at the current zoom.
    const screenToPhoto = rect.width / frameEl.getBoundingClientRect().width;
    const dx = (e.clientX - start.x) * screenToPhoto;
    const dy = (e.clientY - start.y) * screenToPhoto;
    // Dragging the photo right moves the visible window left, hence the
    // negation — the same convention the board's camera pan uses.
    const next = clampPan(
      { width: source.width, height: source.height },
      frameAspect,
      rotateSteps,
      zoom,
      { x: start.pan.x - dx, y: start.pan.y - dy },
    );
    setPan(next);
  };

  const onFramePointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (dragStart.current?.pointerId === e.pointerId) dragStart.current = null;
  };

  const handleConfirm = (): void => {
    const target = downscaleTarget(rect.width, rect.height);
    const finalBitmap = rasterizeCrop(source, rotateSteps, rect, target);
    const puzzleId = crypto.randomUUID();
    const seed = seedFromPuzzleId(puzzleId);
    onConfirm({ source: finalBitmap, seed, puzzleId });
  };

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <div>
        <div className="font-[var(--font-display)] text-[28px] text-[var(--ink-primary)]">
          New Puzzle
        </div>
        <div className="mt-1 font-[var(--font-data)] text-[12px] text-[var(--ink-muted)]">
          Step 2 of 2 — Crop &amp; frame
        </div>
      </div>

      <div
        ref={frameRef}
        onPointerDown={onFramePointerDown}
        onPointerMove={onFramePointerMove}
        onPointerUp={onFramePointerUp}
        onPointerCancel={onFramePointerUp}
        className="relative touch-none overflow-hidden rounded-[var(--radius-md)] border border-[var(--edge-hair)]"
        style={{ aspectRatio: frameAspect, background: 'var(--mat-void)' }}
      >
        <canvas
          ref={canvasRef}
          className="absolute left-1/2 top-1/2 max-w-none"
          style={{
            width: `${(source.width / rect.width) * 100}%`,
            // The photo's own translate is expressed as a percentage of the
            // canvas's local (pre-rotation) box, the same basis the width
            // percentage above uses — that keeps the offset self-consistent
            // regardless of rotation. Increasing pan.x moves the crop rect's
            // center right in photo space (see computeCropRect), so the
            // image itself must shift left on screen to keep that new
            // center in the middle of the frame — hence the subtraction.
            transform: `translate(calc(-50% - ${(100 * pan.x) / source.width}%), calc(-50% - ${(100 * pan.y) / source.height}%)) rotate(${rotateSteps * 90}deg)`,
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

      <div className="flex gap-2">
        {ASPECTS.map(({ label, value }) => (
          <button
            key={label}
            type="button"
            aria-label={`Aspect: ${label}`}
            aria-pressed={aspectChoice === value}
            onClick={() => setAspectChoice(value)}
            className={`flex-1 rounded-[var(--radius-sm)] border py-2 font-[var(--font-data)] text-[11px] ${
              aspectChoice === value
                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                : 'border-[var(--edge-hair)] text-[var(--ink-muted)]'
            }`}
          >
            {aspectChoice === value ? '✓ ' : ''}
            {label}
          </button>
        ))}
      </div>

      {/* CLAUDE.md "Hard numbers": touch target 44pt floor, everywhere — a bare
          range input's hit area is only as tall as its (thin) track. Setting
          min-height on the input directly grows the interactive box while
          browsers keep the visible track centered and thin within it, the
          same way a <select>'s box grows without thickening its text. */}
      <input
        type="range"
        aria-label="Zoom"
        min={MIN_ZOOM}
        max={MAX_ZOOM}
        step={0.01}
        value={zoom}
        onChange={(e) => setZoom(Number(e.target.value))}
        className="min-h-[44px] w-full"
      />

      <button
        type="button"
        aria-label="Rotate 90 degrees"
        onClick={() => setRotateSteps((r) => (((r + 1) % 4) as RotateSteps))}
        className="rounded-[var(--radius-sm)] border border-[var(--edge-hair)] py-2 text-[13px] text-[var(--ink-primary)]"
      >
        Rotate
      </button>

      <div className="flex gap-3">
        <button
          type="button"
          aria-label="Back to photo picker"
          onClick={onBack}
          className="rounded-[var(--radius-md)] border border-[var(--edge-hair)] px-4 py-3 text-[15px] text-[var(--ink-muted)]"
        >
          ← Back
        </button>
        <button
          type="button"
          aria-label="Use this photo"
          onClick={handleConfirm}
          className="flex-1 rounded-[var(--radius-md)] bg-[var(--accent)] py-3 text-[15px] text-[var(--mat-void)]"
        >
          Use this photo
        </button>
      </div>
    </div>
  );
}
