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
      {/* Comfort mode's 60pt rows can outgrow a short viewport where the 44pt
          layout always fit — max-height plus scroll, never an overflow that
          pushes Resume or Leave off-screen with no way to reach them. */}
      <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90vh] flex-col gap-4 overflow-y-auto rounded-t-[var(--radius-lg)] border-t border-[var(--edge-hair)] bg-[var(--mat-raised)] p-5">
        <button
          type="button"
          aria-label="Resume"
          onClick={onResume}
          className="touch-target rounded-[var(--radius-md)] bg-[var(--accent)] py-3 text-3 text-[var(--mat-void)]"
        >
          Resume
        </button>

        <button
          type="button"
          aria-label="Reference image"
          onClick={openReference}
          className="touch-target rounded-[var(--radius-md)] border border-[var(--edge-hair)] py-3 text-3 text-[var(--ink-primary)]"
        >
          Reference image
        </button>

        {confirmingRestart ? (
          <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--edge-hair)] p-3">
            <div className="text-2 text-[var(--ink-primary)]">
              Are you sure? All progress on this puzzle resets.
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Cancel restart"
                onClick={() => setConfirmingRestart(false)}
                className="touch-target flex-1 rounded-[var(--radius-sm)] border border-[var(--edge-hair)] text-2 text-[var(--ink-muted)]"
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
                className="touch-target flex-1 rounded-[var(--radius-sm)] border-2 border-[var(--accent)] text-2 text-[var(--accent)]"
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
            className="touch-target rounded-[var(--radius-md)] border border-[var(--edge-hair)] py-3 text-3 text-[var(--ink-primary)]"
          >
            Restart
          </button>
        )}

        <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--edge-hair)] p-3">
          <div className="font-[var(--font-data)] text-1 tracking-[0.08em] text-[var(--ink-muted)]">
            SETTINGS
          </div>

          <div>
            <div className="mb-1 text-2 text-[var(--ink-primary)]">Snap tolerance</div>
            {/* Dynamic Type at 200% can outgrow three flex-1 labels on a phone
                width — wrap rather than clip; flex-1 still fills a row that
                has room, and a wrapped row is still every button at 60pt. */}
            <div className="flex flex-wrap gap-2">
              {TOLERANCES.map(({ value, label }) => {
                const selected = difficulty === value;
                // Comfort mode floors tolerance at Generous — the tighter two
                // are disabled, not just re-coloured, while it is on.
                const disabled = assists.comfort && value !== 'generous';
                return (
                  <button
                    key={value}
                    type="button"
                    aria-label={`Snap tolerance: ${label}`}
                    aria-pressed={selected}
                    disabled={disabled}
                    onClick={() => onDifficultyChange(value)}
                    // Border weight as well as colour: colour is never the
                    // only signal (§13).
                    className={`touch-target flex-1 rounded-[var(--radius-sm)] text-1 disabled:opacity-40 ${
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
            <div className="mb-1 flex justify-between text-2 text-[var(--ink-primary)]">
              <span>Ghost underlay</span>
              <span className="font-[var(--font-data)] text-1 tabular-nums text-[var(--ink-muted)]">
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
              className="min-h-[var(--touch-min)] w-full"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="text-2 text-[var(--ink-primary)]">Edge highlight</div>
            <button
              type="button"
              aria-label="Edge highlight"
              aria-pressed={assists.edgeHighlight}
              onClick={() => onAssistsChange({ ...assists, edgeHighlight: !assists.edgeHighlight })}
              className={`touch-target rounded-[var(--radius-sm)] text-1 ${
                assists.edgeHighlight
                  ? 'border-2 border-[var(--accent)] text-[var(--accent)]'
                  : 'border border-[var(--edge-hair)] text-[var(--ink-muted)]'
              }`}
            >
              {assists.edgeHighlight ? 'On' : 'Off'}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-2 text-[var(--ink-primary)]">Large piece mode</div>
            <button
              type="button"
              aria-label="Large piece mode"
              aria-pressed={assists.largePieceMode}
              onClick={() =>
                onAssistsChange({ ...assists, largePieceMode: !assists.largePieceMode })
              }
              className={`touch-target rounded-[var(--radius-sm)] text-1 ${
                assists.largePieceMode
                  ? 'border-2 border-[var(--accent)] text-[var(--accent)]'
                  : 'border border-[var(--edge-hair)] text-[var(--ink-muted)]'
              }`}
            >
              {assists.largePieceMode ? 'On' : 'Off'}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-2 text-[var(--ink-primary)]">Comfort mode</div>
            <button
              type="button"
              aria-label="Comfort mode"
              aria-pressed={assists.comfort}
              onClick={() => {
                const comfort = !assists.comfort;
                onAssistsChange({ ...assists, comfort });
                if (comfort) onDifficultyChange('generous');
              }}
              className={`touch-target rounded-[var(--radius-sm)] text-1 ${
                assists.comfort
                  ? 'border-2 border-[var(--accent)] text-[var(--accent)]'
                  : 'border border-[var(--edge-hair)] text-[var(--ink-muted)]'
              }`}
            >
              {assists.comfort ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        <button
          type="button"
          aria-label="Leave"
          onClick={onLeave}
          className="touch-target rounded-[var(--radius-md)] border border-[var(--edge-hair)] py-3 text-3 text-[var(--ink-muted)]"
        >
          Leave
        </button>
      </div>
    </>
  );
}
