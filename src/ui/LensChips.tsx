/**
 * The lens row and the colour bins (§12's "lens chip").
 *
 * Two rules from §06 are visible here. **All is always one tap from any other
 * lens**, so it is first and never scrolls out of reach. And **Region is
 * disabled rather than hidden** below 1.5× zoom — a control that vanishes
 * teaches nothing, whereas a control that is visibly waiting teaches that
 * zooming in buys something.
 *
 * Colour bins carry a swatch **and a numeral**, because colour is never the only
 * signal.
 */

import { LENSES } from '@/tray/lenses';
import type { Lens } from '@/tray/lenses';
import type { ColourBin } from '@/tray/colour';

const LABEL: Record<Lens, string> = {
  all: 'All',
  edges: 'Edges',
  corners: 'Corners',
  colour: 'Colour',
  region: 'Region',
  recent: 'Recent',
};

export interface LensChipsProps {
  lens: Lens;
  lensArg: number | null;
  counts: Map<Lens, { count: number; enabled: boolean }>;
  bins: readonly ColourBin[];
  binCount: (bin: number) => number;
  onPick: (lens: Lens, arg?: number | null) => void;
}

export function LensChips({
  lens,
  lensArg,
  counts,
  bins,
  binCount,
  onPick,
}: LensChipsProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-[8px]">
      <div className="flex flex-wrap gap-[8px]">
        {LENSES.map((entry) => {
          const meta = counts.get(entry);
          const enabled = meta?.enabled ?? true;
          const active = lens === entry;

          return (
            <button
              key={entry}
              type="button"
              disabled={!enabled}
              aria-pressed={active}
              onClick={() => onPick(entry, entry === 'colour' ? (bins[0]?.index ?? null) : null)}
              title={
                enabled
                  ? undefined
                  : 'Zoom past 1.5× and this shows the pieces that belong in view'
              }
              className={[
                'flex items-center gap-[6px] rounded-[8px] border px-[12px] text-2',
                'min-h-[var(--touch-min)] transition-colors',
                active
                  ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--ink-primary)]'
                  : 'border-[var(--edge-hair)] text-[var(--ink-muted)]',
                enabled ? '' : 'cursor-not-allowed opacity-40',
              ].join(' ')}
            >
              {LABEL[entry]}
              <span className="font-[var(--font-data)] text-1 tabular-nums opacity-70">
                {meta?.count ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {lens === 'colour' && (
        <div className="flex flex-wrap gap-[8px]">
          {bins.map((bin) => (
            <button
              key={bin.index}
              type="button"
              aria-pressed={lensArg === bin.index}
              onClick={() => onPick('colour', bin.index)}
              className={[
                'flex items-center gap-[6px] rounded-[8px] border px-[10px] text-1',
                'min-h-[var(--touch-min)] transition-colors',
                lensArg === bin.index
                  ? 'border-[var(--accent)] text-[var(--ink-primary)]'
                  : 'border-[var(--edge-hair)] text-[var(--ink-muted)]',
              ].join(' ')}
            >
              <span
                aria-hidden
                className="h-[14px] w-[14px] rounded-[4px] border border-[var(--edge-hair)]"
                style={{ background: bin.swatch }}
              />
              {/* The numeral, always. Never the swatch on its own (§06). */}
              <span className="font-[var(--font-data)] tabular-nums">
                {bin.mixed ? 'Mixed' : bin.numeral}
              </span>
              <span className="font-[var(--font-data)] tabular-nums opacity-70">
                {binCount(bin.index)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
