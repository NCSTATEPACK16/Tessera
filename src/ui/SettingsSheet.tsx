/**
 * The gear on Today opens this (v2 spec §3). Settings is a sheet, not a tab:
 * tabs are peer sections, and this is a handful of preferences. Slice 3 appends
 * the telemetry switch and Send feedback; until then it holds only rows with a
 * real feature behind them — no dead switches (modern-look spec, "don't adopt").
 *
 * "How to play" is a row here rather than a Learn tab: the guided twelve does
 * the teaching, and this is the reminder for someone who skipped it.
 */

import { useEffect, useRef, useState } from 'react';
import type { TraySide } from '@/persist/prefs';
import { Button, Segmented, SettingsGroup, SettingsRow } from './kit';

export interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  traySide: TraySide;
  onTraySide: (side: TraySide) => void;
}

export function SettingsSheet({
  open,
  onClose,
  traySide,
  onTraySide,
}: SettingsSheetProps): React.ReactElement | null {
  const [howToOpen, setHowToOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label="Close settings"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--mat-void)_70%,transparent)]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="relative flex max-h-[88%] w-full max-w-[32rem] flex-col gap-5 overflow-y-auto rounded-t-[var(--radius-lg)] border border-[var(--edge-hair)] bg-[var(--mat-felt)] p-5 shadow-[var(--shadow-raise)] [animation:fade-up_var(--duration-slow)_var(--ease-standard)] md:rounded-[var(--radius-lg)]"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id="settings-title"
            className="m-0 font-display text-5 font-normal text-[var(--ink-primary)]"
          >
            Settings
          </h2>
          <Button ref={closeRef} onClick={onClose}>
            Done
          </Button>
        </div>

        <SettingsGroup title="Tray">
          <SettingsRow label="Tray side" sub="Where the tray docks on a wide screen">
            <Segmented<TraySide>
              value={traySide}
              onChange={onTraySide}
              options={[
                { value: 'left', ariaLabel: 'Tray side: Left', content: 'Left' },
                { value: 'right', ariaLabel: 'Tray side: Right', content: 'Right' },
              ]}
            />
          </SettingsRow>
        </SettingsGroup>

        <SettingsGroup title="Help">
          <button
            type="button"
            aria-expanded={howToOpen}
            aria-controls="how-to-play"
            onClick={() => setHowToOpen((v) => !v)}
            className="touch-target flex items-center justify-between px-4 text-left text-2 text-[var(--ink-primary)]"
          >
            How to play
            <span aria-hidden className="text-[var(--ink-muted)]">
              {howToOpen ? '−' : '+'}
            </span>
          </button>
          {howToOpen && (
            <div
              id="how-to-play"
              className="flex flex-col gap-2 border-t border-[var(--edge-hair)] px-4 py-3 text-2 text-[var(--ink-secondary)]"
            >
              <p className="m-0">
                Pick a photo, choose how many pieces, and start. Pieces wait in the tray; drag one
                onto the mat to work with it.
              </p>
              <p className="m-0">
                Drop a piece near where it belongs and it snaps in. Pieces that fit together join,
                wherever they are, so you can build a corner on the mat and bring it over whole.
              </p>
              <p className="m-0">
                The filters above the tray narrow it to edges or a colour without reordering it.
                Stuck? A hint lights the area where a piece goes.
              </p>
              <p className="m-0">
                There is no way to lose. A piece stays wherever you put it.
              </p>
            </div>
          )}
        </SettingsGroup>
      </div>
    </div>
  );
}
