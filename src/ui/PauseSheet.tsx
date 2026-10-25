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
import { Button, Segmented, Toggle } from './kit';

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
        <Button variant="primary" size="lg" aria-label="Resume" onClick={onResume}>
          Resume
        </Button>

        <Button size="lg" aria-label="Reference image" onClick={openReference}>
          Reference image
        </Button>

        {confirmingRestart ? (
          <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--edge-hair)] p-3">
            <div className="text-2 text-[var(--ink-primary)]">
              Are you sure? All progress on this puzzle resets.
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                aria-label="Cancel restart"
                onClick={() => setConfirmingRestart(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                aria-label="Confirm restart"
                onClick={() => {
                  setConfirmingRestart(false);
                  onRestart();
                }}
                className="flex-1"
              >
                Restart
              </Button>
            </div>
          </div>
        ) : (
          <Button size="lg" aria-label="Restart" onClick={() => setConfirmingRestart(true)}>
            Restart
          </Button>
        )}

        <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--edge-hair)] p-3">
          <div className="eyebrow">SETTINGS</div>

          <div>
            <div className="mb-1 text-2 text-[var(--ink-primary)]">Snap tolerance</div>
            <Segmented
              wrap
              value={difficulty}
              onChange={onDifficultyChange}
              options={TOLERANCES.map(({ value, label }) => ({
                value,
                ariaLabel: `Snap tolerance: ${label}`,
                content: label,
                // Comfort mode floors tolerance at Generous — the tighter two
                // are disabled, not just re-coloured, while it is on.
                disabled: assists.comfort && value !== 'generous',
              }))}
            />
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
            <Toggle
              label="Edge highlight"
              on={assists.edgeHighlight}
              onChange={() => onAssistsChange({ ...assists, edgeHighlight: !assists.edgeHighlight })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="text-2 text-[var(--ink-primary)]">Large piece mode</div>
            <Toggle
              label="Large piece mode"
              on={assists.largePieceMode}
              onChange={() => onAssistsChange({ ...assists, largePieceMode: !assists.largePieceMode })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="text-2 text-[var(--ink-primary)]">Comfort mode</div>
            <Toggle
              label="Comfort mode"
              on={assists.comfort}
              onChange={() => {
                const comfort = !assists.comfort;
                onAssistsChange({ ...assists, comfort });
                if (comfort) onDifficultyChange('generous');
              }}
            />
          </div>
        </div>

        <Button variant="ghost" size="lg" aria-label="Leave" onClick={onLeave}>
          Leave
        </Button>
      </div>
    </>
  );
}
