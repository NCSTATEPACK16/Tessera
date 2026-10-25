/**
 * Setup — step 2 of v2's three-step funnel (spec §4): the crop, folded in from
 * step 5a's separate screen, then piece count, mode, and everything else
 * behind More options, with Start pinned in the thumb zone.
 *
 * Ported in shape from `TesseraV3Figma/src/App.tsx`'s `NewPuzzleScreen` step 2
 * (the "Configure" half), restyled onto this repo's real `theme.css` tokens —
 * same convention step 5a used for that prototype's step 1. The prototype's
 * step 2 has no actual-size piece preview and no assists section beyond a
 * bare rotation toggle; both are built fresh here per
 * docs/superpowers/specs/2026-08-02-step-5b-puzzle-setup-design.md.
 */

import { useMemo, useState } from 'react';
import type { SnapDifficulty } from '@/board/snap';
import { seedFromPuzzleId } from '@/core/rng';
import type { RotateSteps } from '@/play/photo';
import { MAX_ZOOM, MIN_ZOOM } from '@/play/photo';
import {
  clampGhostOpacity,
  DEFAULT_PUZZLE_CONFIG,
  GHOST_OPACITY_MAX,
  isLowResForCount,
  PIECE_COUNT_LADDER,
  pieceScreenSize,
} from '@/play/setup';
import type { PuzzleConfig, PuzzleMode } from '@/play/setup';
import { ASPECTS, clampCrop, CropCanvas, cropRectOf, finishCrop, INITIAL_CROP } from './CropCanvas';
import type { CropState } from './CropCanvas';
import { Button, Segmented, Toggle } from './kit';

export interface PuzzleSetupResult {
  /** The cropped, downscaled bitmap — a fresh instance; the caller still owns `source`. */
  source: ImageBitmap;
  seed: number;
  puzzleId: string;
  config: PuzzleConfig;
}

export interface PuzzleSetupProps {
  /** The uncropped photo. */
  source: ImageBitmap;
  onConfirm: (result: PuzzleSetupResult) => void;
  onBack: () => void;
}

/**
 * The swatch shows *relative* piece size at a glance — a 50-piece swatch on a
 * dock-sized screen would otherwise be the width of the whole row.
 */
const MAX_SWATCH_PX = 28;

const MODES: { value: PuzzleMode; label: string; sub: string }[] = [
  { value: 'classic', label: 'Classic', sub: '3 hints · timer on' },
  { value: 'zen', label: 'Zen', sub: 'Unlimited hints · no timer' },
];

const TOLERANCES: { value: SnapDifficulty; label: string }[] = [
  { value: 'precise', label: 'Precise' },
  { value: 'standard', label: 'Standard' },
  { value: 'generous', label: 'Generous' },
];

export function PuzzleSetup({ source, onConfirm, onBack }: PuzzleSetupProps): React.ReactElement {
  const [targetCount, setTargetCount] = useState(DEFAULT_PUZZLE_CONFIG.targetCount);
  const [mode, setMode] = useState<PuzzleMode>(DEFAULT_PUZZLE_CONFIG.mode);
  const [rotation, setRotation] = useState(DEFAULT_PUZZLE_CONFIG.rotation);
  const [difficulty, setDifficulty] = useState<SnapDifficulty>(DEFAULT_PUZZLE_CONFIG.difficulty);
  const [ghostOpacity, setGhostOpacity] = useState(DEFAULT_PUZZLE_CONFIG.assists.ghostOpacity);
  const [edgeHighlight, setEdgeHighlight] = useState(DEFAULT_PUZZLE_CONFIG.assists.edgeHighlight);
  const [largePieceMode, setLargePieceMode] = useState(
    DEFAULT_PUZZLE_CONFIG.assists.largePieceMode,
  );

  const [crop, setCrop] = useState<CropState>(INITIAL_CROP);
  const [moreOpen, setMoreOpen] = useState(false);
  const rect = useMemo(() => cropRectOf(source, crop), [source, crop]);
  // Piece size and the low-resolution warning are about what will be cut —
  // the cropped region, not the whole photo.
  const cropped = { width: rect.width, height: rect.height };
  const updateCrop = (next: Partial<CropState>): void =>
    setCrop((c) => clampCrop(source, { ...c, ...next }));

  // One-shot, not live: this screen is torn down before any resize matters.
  const viewport = { w: window.innerWidth, h: window.innerHeight };

  const handleConfirm = (): void => {
    // Minted here, on Start: backing out and choosing again must never reuse
    // a seed (the browser suite stubs `randomUUID` for exactly this call).
    const puzzleId = crypto.randomUUID();
    const config: PuzzleConfig = {
      targetCount,
      mode,
      rotation,
      difficulty,
      assists: {
        ghostOpacity: clampGhostOpacity(ghostOpacity),
        edgeHighlight,
        largePieceMode,
        // Comfort is toggled later, mid-play, from the pause sheet — not a
        // choice offered at setup.
        comfort: DEFAULT_PUZZLE_CONFIG.assists.comfort,
        referencePanelOpen: DEFAULT_PUZZLE_CONFIG.assists.referencePanelOpen,
      },
    };
    onConfirm({
      source: finishCrop(source, crop),
      seed: seedFromPuzzleId(puzzleId),
      puzzleId,
      config,
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex shrink-0 items-center gap-3 px-5 pb-2"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
      >
        <button
          type="button"
          aria-label="Back to photos"
          onClick={onBack}
          className="touch-target rounded-[var(--radius-md)] border border-[var(--edge-hair)] px-3 text-2 text-[var(--ink-muted)]"
        >
          ← Back
        </button>
        <div className="font-display text-4 text-[var(--ink-primary)]">
          New puzzle
        </div>
      </div>

      {/* iPad: the crop on the left, the choices on the right. */}
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5 md:flex-row md:items-start">
        <div className="flex shrink-0 flex-col gap-2 md:sticky md:top-0 md:w-[60%]">
          <CropCanvas source={source} state={crop} onChange={setCrop} gridCount={targetCount} />
          <p className="text-center font-data text-1 text-[var(--ink-muted)]">
            Drag to frame · pinch to zoom
          </p>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div>
            <div className="eyebrow mb-2">
              PIECE COUNT
            </div>
            <Segmented
              value={targetCount}
              onChange={setTargetCount}
              options={PIECE_COUNT_LADDER.map((count) => {
                const swatch = Math.min(pieceScreenSize(cropped, count, viewport), MAX_SWATCH_PX);
                return {
                  value: count,
                  ariaLabel: `Piece count: ${count}`,
                  content: (
                    <span className="flex flex-col items-center gap-1 py-2">
                      <span
                        style={{ width: swatch, height: swatch }}
                        className={`rounded-[3px] ${count === targetCount ? 'bg-[var(--accent)]' : 'bg-[var(--ink-muted)]'}`}
                      />
                      {count}
                    </span>
                  ),
                };
              })}
            />
            {isLowResForCount(cropped, targetCount) && (
              // Warns, never blocks. A player who wants a soft 250-piece puzzle of
              // a treasured low-resolution photo is allowed to have one — this
              // only makes sure the softness is not a surprise afterwards.
              <p role="status" className="mt-2 text-1 text-[var(--ink-muted)]">
                This photo is a little small for {targetCount} pieces — they may look soft.
              </p>
            )}
          </div>

          <div>
            <div className="eyebrow mb-2">
              MODE
            </div>
            <div className="grid grid-cols-2 gap-2">
              {MODES.map(({ value, label, sub }) => {
                const selected = mode === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-label={`Mode: ${label}`}
                    aria-pressed={selected}
                    onClick={() => setMode(value)}
                    className={`flex flex-col items-center gap-1 rounded-[var(--radius-md)] py-3 ${
                      selected
                        ? 'border-2 border-[var(--accent)]'
                        : 'border border-[var(--edge-hair)]'
                    }`}
                  >
                    <div
                      className={`text-2 ${selected ? 'text-[var(--accent)]' : 'text-[var(--ink-primary)]'}`}
                    >
                      {selected ? `✓ ${label}` : label}
                    </div>
                    <div className="font-data text-1 text-[var(--ink-muted)]">
                      {sub}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            aria-expanded={moreOpen}
            aria-controls="setup-more-options"
            onClick={() => setMoreOpen((open) => !open)}
            className="touch-target flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--edge-hair)] px-3 text-2 text-[var(--ink-primary)]"
          >
            More options
            <span aria-hidden className="text-[var(--ink-muted)]">
              {moreOpen ? '−' : '+'}
            </span>
          </button>

          {moreOpen && (
            <div id="setup-more-options" className="flex flex-col gap-5">
              <div>
                <div className="eyebrow mb-2">
                  FRAME
                </div>
                <Segmented
                  value={crop.aspect}
                  onChange={(aspect) => updateCrop({ aspect })}
                  options={ASPECTS.map(({ label, value }) => ({
                    value,
                    ariaLabel: `Aspect: ${label}`,
                    content: label,
                  }))}
                />
                <div className="mt-2 flex items-center gap-3">
                  {/* CLAUDE.md: 44pt floor — a bare range input's hit area is only as
                      tall as its thin track, so the box is grown, not the track. */}
                  <input
                    type="range"
                    aria-label="Zoom"
                    min={MIN_ZOOM}
                    max={MAX_ZOOM}
                    step={0.01}
                    value={crop.zoom}
                    onChange={(e) => updateCrop({ zoom: Number(e.target.value) })}
                    className="min-h-[var(--touch-min)] flex-1"
                  />
                  <Button
                    aria-label="Rotate 90 degrees"
                    onClick={() =>
                      updateCrop({ rotateSteps: ((crop.rotateSteps + 1) % 4) as RotateSteps })
                    }
                  >
                    Rotate
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--edge-hair)] p-3">
                <div>
                  <div className="text-3 text-[var(--ink-primary)]">Rotation</div>
                  <div className="font-data text-1 text-[var(--ink-muted)]">
                    Pieces can be rotated — significantly harder
                  </div>
                </div>
                <Toggle label="Rotation" on={rotation} onChange={() => setRotation((r) => !r)} />
              </div>

              <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--edge-hair)] p-3">
                <div className="eyebrow">
                  ASSISTS
                </div>

                <div>
                  <div className="mb-1 text-2 text-[var(--ink-primary)]">Snap tolerance</div>
                  <Segmented
                    value={difficulty}
                    onChange={setDifficulty}
                    options={TOLERANCES.map(({ value, label }) => ({
                      value,
                      ariaLabel: `Snap tolerance: ${label}`,
                      content: difficulty === value ? `✓ ${label}` : label,
                    }))}
                  />
                </div>

                <div>
                  <div className="mb-1 flex justify-between text-2 text-[var(--ink-primary)]">
                    <span>Ghost underlay</span>
                    <span className="font-data text-1 text-[var(--ink-muted)]">
                      {Math.round((ghostOpacity / GHOST_OPACITY_MAX) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label="Ghost underlay opacity"
                    min={0}
                    max={GHOST_OPACITY_MAX}
                    step={0.01}
                    value={ghostOpacity}
                    onChange={(e) => setGhostOpacity(Number(e.target.value))}
                    className="min-h-[var(--touch-min)] w-full"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-2 text-[var(--ink-primary)]">Edge highlight</div>
                  <Toggle label="Edge highlight" on={edgeHighlight} onChange={() => setEdgeHighlight((v) => !v)} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-2 text-[var(--ink-primary)]">Large piece mode</div>
                  <Toggle label="Large piece mode" on={largePieceMode} onChange={() => setLargePieceMode((v) => !v)} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sticky, in the thumb zone, and never below the fold (v2 spec B4). */}
      <div
        className="shrink-0 border-t border-[var(--edge-hair)] bg-[var(--mat-void)] px-5 pt-3"
        style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
      >
        <Button variant="primary" size="lg" aria-label="Start cutting" onClick={handleConfirm} className="w-full">
          Start
        </Button>
      </div>
    </div>
  );
}
