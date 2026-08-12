/**
 * Step 5b's puzzle setup screen — piece count, mode, rotation, and assists,
 * between crop-confirm and the cut starting.
 *
 * Ported in shape from `TesseraV3Figma/src/App.tsx`'s `NewPuzzleScreen` step 2
 * (the "Configure" half), restyled onto this repo's real `theme.css` tokens —
 * same convention step 5a used for that prototype's step 1. The prototype's
 * step 2 has no actual-size piece preview and no assists section beyond a
 * bare rotation toggle; both are built fresh here per
 * docs/superpowers/specs/2026-08-02-step-5b-puzzle-setup-design.md.
 */

import { useState } from 'react';
import type { SnapDifficulty } from '@/board/snap';
import {
  clampGhostOpacity,
  DEFAULT_PUZZLE_CONFIG,
  GHOST_OPACITY_MAX,
  isLowResForCount,
  PIECE_COUNT_LADDER,
  pieceScreenSize,
} from '@/play/setup';
import type { PuzzleConfig, PuzzleMode } from '@/play/setup';

export interface PuzzleSetupProps {
  source: ImageBitmap;
  onConfirm: (config: PuzzleConfig) => void;
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

  // One-shot, not live: this screen is torn down before any resize matters.
  const viewport = { w: window.innerWidth, h: window.innerHeight };

  const handleConfirm = (): void => {
    onConfirm({
      targetCount,
      mode,
      rotation,
      difficulty,
      assists: {
        ghostOpacity: clampGhostOpacity(ghostOpacity),
        edgeHighlight,
        largePieceMode,
      },
    });
  };

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <div>
        <div className="font-[var(--font-display)] text-[28px] text-[var(--ink-primary)]">
          New Puzzle
        </div>
        <div className="mt-1 font-[var(--font-data)] text-[12px] text-[var(--ink-muted)]">
          Step 2 of 2 — Configure
        </div>
      </div>

      <canvas
        ref={(el) => {
          if (!el) return;
          el.width = source.width;
          el.height = source.height;
          const ctx = el.getContext('2d');
          ctx?.clearRect(0, 0, el.width, el.height);
          ctx?.drawImage(source, 0, 0);
        }}
        className="max-h-[160px] w-full rounded-[var(--radius-md)] border border-[var(--edge-hair)] object-cover"
        style={{ aspectRatio: source.width / source.height }}
      />

      <div>
        <div className="mb-2 font-[var(--font-data)] text-[11px] tracking-[0.08em] text-[var(--ink-muted)]">
          PIECE COUNT
        </div>
        <div className="flex gap-2">
          {PIECE_COUNT_LADDER.map((count) => {
            const selected = count === targetCount;
            const swatch = Math.min(pieceScreenSize(source, count, viewport), MAX_SWATCH_PX);
            return (
              <button
                key={count}
                type="button"
                aria-label={`Piece count: ${count}`}
                aria-pressed={selected}
                onClick={() => setTargetCount(count)}
                className={`flex flex-1 flex-col items-center gap-1 rounded-[var(--radius-sm)] py-2 font-[var(--font-data)] text-[12px] ${
                  selected
                    ? 'border-2 border-[var(--accent)] text-[var(--accent)]'
                    : 'border border-[var(--edge-hair)] text-[var(--ink-muted)]'
                }`}
              >
                <div
                  style={{ width: swatch, height: swatch }}
                  className={`rounded-[3px] ${selected ? 'bg-[var(--accent)]' : 'bg-[var(--ink-muted)]'}`}
                />
                {count}
              </button>
            );
          })}
        </div>
        {isLowResForCount(source, targetCount) && (
          // Warns, never blocks. A player who wants a soft 250-piece puzzle of
          // a treasured low-resolution photo is allowed to have one — this
          // only makes sure the softness is not a surprise afterwards.
          <p role="status" className="mt-2 text-[12px] text-[var(--ink-muted)]">
            This photo is a little small for {targetCount} pieces — they may look soft.
          </p>
        )}
      </div>

      <div>
        <div className="mb-2 font-[var(--font-data)] text-[11px] tracking-[0.08em] text-[var(--ink-muted)]">
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
                  className={`text-[13px] ${selected ? 'text-[var(--accent)]' : 'text-[var(--ink-primary)]'}`}
                >
                  {selected ? `✓ ${label}` : label}
                </div>
                <div className="font-[var(--font-data)] text-[10px] text-[var(--ink-muted)]">
                  {sub}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--edge-hair)] p-3">
        <div>
          <div className="text-[15px] text-[var(--ink-primary)]">Rotation</div>
          <div className="font-[var(--font-data)] text-[10px] text-[var(--ink-muted)]">
            Pieces can be rotated — significantly harder
          </div>
        </div>
        <button
          type="button"
          aria-label="Rotation"
          aria-pressed={rotation}
          onClick={() => setRotation((r) => !r)}
          className={`min-h-[44px] min-w-[44px] rounded-[var(--radius-sm)] text-[12px] ${
            rotation
              ? 'border-2 border-[var(--accent)] text-[var(--accent)]'
              : 'border border-[var(--edge-hair)] text-[var(--ink-muted)]'
          }`}
        >
          {rotation ? 'On' : 'Off'}
        </button>
      </div>

      <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--edge-hair)] p-3">
        <div className="font-[var(--font-data)] text-[11px] tracking-[0.08em] text-[var(--ink-muted)]">
          ASSISTS
        </div>

        <div>
          <div className="mb-1 text-[13px] text-[var(--ink-primary)]">Snap tolerance</div>
          <div className="flex gap-2">
            {TOLERANCES.map(({ value, label }) => {
              const selected = difficulty === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-label={`Snap tolerance: ${label}`}
                  aria-pressed={selected}
                  onClick={() => setDifficulty(value)}
                  className={`flex-1 rounded-[var(--radius-sm)] py-2 font-[var(--font-data)] text-[11px] ${
                    selected
                      ? 'border-2 border-[var(--accent)] text-[var(--accent)]'
                      : 'border border-[var(--edge-hair)] text-[var(--ink-muted)]'
                  }`}
                >
                  {selected ? `✓ ${label}` : label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-1 flex justify-between text-[13px] text-[var(--ink-primary)]">
            <span>Ghost underlay</span>
            <span className="font-[var(--font-data)] text-[11px] text-[var(--ink-muted)]">
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
            className="min-h-[44px] w-full"
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="text-[13px] text-[var(--ink-primary)]">Edge highlight</div>
          <button
            type="button"
            aria-label="Edge highlight"
            aria-pressed={edgeHighlight}
            onClick={() => setEdgeHighlight((v) => !v)}
            className={`min-h-[44px] min-w-[44px] rounded-[var(--radius-sm)] text-[12px] ${
              edgeHighlight
                ? 'border-2 border-[var(--accent)] text-[var(--accent)]'
                : 'border border-[var(--edge-hair)] text-[var(--ink-muted)]'
            }`}
          >
            {edgeHighlight ? 'On' : 'Off'}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-[13px] text-[var(--ink-primary)]">Large piece mode</div>
          <button
            type="button"
            aria-label="Large piece mode"
            aria-pressed={largePieceMode}
            onClick={() => setLargePieceMode((v) => !v)}
            className={`min-h-[44px] min-w-[44px] rounded-[var(--radius-sm)] text-[12px] ${
              largePieceMode
                ? 'border-2 border-[var(--accent)] text-[var(--accent)]'
                : 'border border-[var(--edge-hair)] text-[var(--ink-muted)]'
            }`}
          >
            {largePieceMode ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          aria-label="Back to crop"
          onClick={onBack}
          className="rounded-[var(--radius-md)] border border-[var(--edge-hair)] px-4 py-3 text-[15px] text-[var(--ink-muted)]"
        >
          ← Back
        </button>
        <button
          type="button"
          aria-label="Start cutting"
          onClick={handleConfirm}
          className="flex-1 rounded-[var(--radius-md)] bg-[var(--accent)] py-3 text-[15px] text-[var(--mat-void)]"
        >
          Start Cutting
        </button>
      </div>
    </div>
  );
}
