/**
 * The pause sheet (step 5c) — resume, reference image, restart, live
 * settings, leave.
 *
 * Its own lightweight overlay, deliberately not the tray's `Sheet.tsx`: that
 * component is purpose-built for the three-detent tray (peek/half/full, shelf,
 * lenses) and has no shape this screen needs.
 *
 * It renders *over* a still-mounted board. Opening it must never unmount
 * `PlayRuntime` — the board never re-renders through React, and a pause that
 * tore down the runtime would rebuild the whole cut on resume.
 */

import { useEffect, useState } from 'react';
import type { SnapDifficulty } from '@/board/snap';
import type { PuzzleAssists } from '@/play/setup';
import { GHOST_OPACITY_MAX } from '@/play/setup';
import { loadPhoto } from '@/persist/photos';

export interface PauseSheetProps {
  puzzleId: string;
  onResume: () => void;
  onRestart: () => void;
  onLeave: () => void;
  assists: PuzzleAssists;
  difficulty: SnapDifficulty;
  onAssistsChange: (assists: PuzzleAssists) => void;
  onDifficultyChange: (difficulty: SnapDifficulty) => void;
}

const TOLERANCES: { value: SnapDifficulty; label: string }[] = [
  { value: 'precise', label: 'Precise' },
  { value: 'standard', label: 'Standard' },
  { value: 'generous', label: 'Generous' },
];

export function PauseSheet({
  puzzleId,
  onResume,
  onRestart,
  onLeave,
  assists,
  difficulty,
  onAssistsChange,
  onDifficultyChange,
}: PauseSheetProps): React.ReactElement {
  const [confirmingRestart, setConfirmingRestart] = useState(false);
  const [referenceBitmap, setReferenceBitmap] = useState<ImageBitmap | null>(null);

  // Every open closes its own bitmap. `ImageBitmap` backing stores are
  // off-heap and GC does not reclaim them promptly, so repeated open/close
  // cycles would otherwise accumulate a full-size photo each time.
  useEffect(() => {
    return () => {
      referenceBitmap?.close();
    };
  }, [referenceBitmap]);

  const openReference = (): void => {
    // A fresh decode from the stored blob, never a shared bitmap: the working
    // copy was transferred to the cutter worker and is detached by now.
    void loadPhoto(puzzleId).then(setReferenceBitmap);
  };

  const closeReference = (): void => {
    referenceBitmap?.close();
    setReferenceBitmap(null);
  };

  if (referenceBitmap) {
    return (
      <div
        aria-label="Reference image overlay"
        onClick={closeReference}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black"
      >
        <canvas
          ref={(el) => {
            if (!el) return;
            el.width = referenceBitmap.width;
            el.height = referenceBitmap.height;
            el.getContext('2d')?.drawImage(referenceBitmap, 0, 0);
          }}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    );
  }

  return (
    <>
      <div
        aria-label="Pause sheet backdrop"
        onClick={onResume}
        className="fixed inset-0 z-40 bg-black/50"
      />
      <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-4 rounded-t-[var(--radius-lg)] border-t border-[var(--edge-hair)] bg-[var(--mat-raised)] p-5">
        <button
          type="button"
          aria-label="Resume"
          onClick={onResume}
          className="min-h-[44px] rounded-[var(--radius-md)] bg-[var(--accent)] py-3 text-[15px] text-[var(--mat-void)]"
        >
          Resume
        </button>

        <button
          type="button"
          aria-label="Reference image"
          onClick={openReference}
          className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--edge-hair)] py-3 text-[15px] text-[var(--ink-primary)]"
        >
          Reference image
        </button>

        {confirmingRestart ? (
          <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--edge-hair)] p-3">
            <div className="text-[13px] text-[var(--ink-primary)]">
              Are you sure? All progress on this puzzle resets.
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Cancel restart"
                onClick={() => setConfirmingRestart(false)}
                className="min-h-[44px] flex-1 rounded-[var(--radius-sm)] border border-[var(--edge-hair)] text-[13px] text-[var(--ink-muted)]"
              >
                Cancel
              </button>
              <button
                type="button"
                aria-label="Confirm restart"
                onClick={() => {
                  setConfirmingRestart(false);
                  onRestart();
                }}
                className="min-h-[44px] flex-1 rounded-[var(--radius-sm)] border-2 border-[var(--accent)] text-[13px] text-[var(--accent)]"
              >
                Restart
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            aria-label="Restart"
            onClick={() => setConfirmingRestart(true)}
            className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--edge-hair)] py-3 text-[15px] text-[var(--ink-primary)]"
          >
            Restart
          </button>
        )}

        <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--edge-hair)] p-3">
          <div className="font-[var(--font-data)] text-[11px] tracking-[0.08em] text-[var(--ink-muted)]">
            SETTINGS
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
                    onClick={() => onDifficultyChange(value)}
                    // Border weight as well as colour: colour is never the
                    // only signal (§13).
                    className={`min-h-[44px] flex-1 rounded-[var(--radius-sm)] text-[11px] ${
                      selected
                        ? 'border-2 border-[var(--accent)] text-[var(--accent)]'
                        : 'border border-[var(--edge-hair)] text-[var(--ink-muted)]'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-1 flex justify-between text-[13px] text-[var(--ink-primary)]">
              <span>Ghost underlay</span>
              <span className="font-[var(--font-data)] text-[11px] tabular-nums text-[var(--ink-muted)]">
                {Math.round((assists.ghostOpacity / GHOST_OPACITY_MAX) * 100)}%
              </span>
            </div>
            <input
              type="range"
              aria-label="Ghost underlay opacity"
              min={0}
              max={GHOST_OPACITY_MAX}
              step={0.01}
              value={assists.ghostOpacity}
              onChange={(e) =>
                onAssistsChange({ ...assists, ghostOpacity: Number(e.target.value) })
              }
              className="min-h-[44px] w-full"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="text-[13px] text-[var(--ink-primary)]">Edge highlight</div>
            <button
              type="button"
              aria-label="Edge highlight"
              aria-pressed={assists.edgeHighlight}
              onClick={() => onAssistsChange({ ...assists, edgeHighlight: !assists.edgeHighlight })}
              className={`min-h-[44px] min-w-[44px] rounded-[var(--radius-sm)] text-[12px] ${
                assists.edgeHighlight
                  ? 'border-2 border-[var(--accent)] text-[var(--accent)]'
                  : 'border border-[var(--edge-hair)] text-[var(--ink-muted)]'
              }`}
            >
              {assists.edgeHighlight ? 'On' : 'Off'}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-[13px] text-[var(--ink-primary)]">Large piece mode</div>
            <button
              type="button"
              aria-label="Large piece mode"
              aria-pressed={assists.largePieceMode}
              onClick={() =>
                onAssistsChange({ ...assists, largePieceMode: !assists.largePieceMode })
              }
              className={`min-h-[44px] min-w-[44px] rounded-[var(--radius-sm)] text-[12px] ${
                assists.largePieceMode
                  ? 'border-2 border-[var(--accent)] text-[var(--accent)]'
                  : 'border border-[var(--edge-hair)] text-[var(--ink-muted)]'
              }`}
            >
              {assists.largePieceMode ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        <button
          type="button"
          aria-label="Leave"
          onClick={onLeave}
          className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--edge-hair)] py-3 text-[15px] text-[var(--ink-muted)]"
        >
          Leave
        </button>
      </div>
    </>
  );
}
