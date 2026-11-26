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
  /** §16 Track 4: a single opacity beat on mount — the guided twelve's tray reveal only. */
  pulse?: boolean;
  /**
   * The dock wraps; the sheet scrolls sideways. The dock has the height to
   * spare and no thumb arc to keep a row inside; the sheet has neither.
   */
  wrap: boolean;
}

/**
 * A 36px pill whose hit area is still the touch floor: the pseudo-element
 * extends it vertically to `--touch-min` (44pt, 60 in comfort mode), and a
 * wrapped row's gap is exactly that difference, so two rows' targets meet
 * rather than overlap.
 */
const PILL = [
  // `min-h-0!`: the global `button` floor would otherwise make every pill 44px.
  'relative flex h-[36px] min-h-0! shrink-0 items-center gap-[6px] rounded-full px-3 transition-colors',
  "after:absolute after:inset-x-0 after:inset-y-[calc((36px-var(--touch-min))/2)] after:content-['']",
].join(' ');
const ACTIVE =
  'bg-[color-mix(in_srgb,var(--color-accent-tray)_22%,transparent)] ring-1 ring-[var(--accent)] text-[var(--ink-primary)]';
const INACTIVE = 'bg-[var(--mat-felt)] text-[var(--ink-muted)]';

function rowClass(wrap: boolean): string {
  return wrap
    ? 'flex flex-wrap gap-x-[8px] gap-y-[calc(var(--touch-min)-36px)]'
    : '-mx-[12px] flex gap-[8px] overflow-x-auto px-[12px] py-[calc((var(--touch-min)-36px)/2)] [scrollbar-width:none]';
}

export function LensChips({
  lens,
  lensArg,
  counts,
  bins,
  binCount,
  onPick,
  pulse = false,
  wrap,
}: LensChipsProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-[8px]">
      {/* The sheet keeps one row that scrolls sideways: a wrapped second row
          cost the phone sheet a whole chip row of pieces (v2 spec §5.2). */}
      <div
        className={`${rowClass(wrap)} ${pulse ? 'lens-chip-pulse' : ''}`}
        style={wrap ? undefined : { touchAction: 'pan-x' }}
      >
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
                PILL,
                'text-2',
                active ? ACTIVE : INACTIVE,
                enabled ? '' : 'cursor-not-allowed opacity-40',
              ].join(' ')}
            >
              {LABEL[entry]}
              <span className="font-data text-1 tabular-nums opacity-70">
                {meta?.count ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {lens === 'colour' && (
        <div className={rowClass(wrap)} style={wrap ? undefined : { touchAction: 'pan-x' }}>
          {bins.map((bin) => (
            <button
              key={bin.index}
              type="button"
              aria-pressed={lensArg === bin.index}
              onClick={() => onPick('colour', bin.index)}
              className={[PILL, 'text-1', lensArg === bin.index ? ACTIVE : INACTIVE].join(' ')}
            >
              <span
                aria-hidden
                className="h-[14px] w-[14px] rounded-[4px] border border-[var(--edge-hair)]"
                style={{ background: bin.swatch }}
              />
              {/* The numeral, always. Never the swatch on its own (§06). */}
              <span className="font-data tabular-nums">
                {bin.mixed ? 'Mixed' : bin.numeral}
              </span>
              <span className="font-data tabular-nums opacity-70">
                {binCount(bin.index)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
