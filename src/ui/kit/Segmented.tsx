/**
 * A row of mutually exclusive options (2026-10-20 modern-look spec §2) — piece
 * count, snap tolerance, aspect. Each option is its own button with its own
 * `aria-label` and `aria-pressed`, exactly the markup the screens had before,
 * so nothing that reads them changes.
 *
 * Selection is shown by border weight and fill as well as colour (§13).
 * `flex-auto`, not `flex-1`: a 0%-basis item reports 0 to the line-breaking
 * step, so a label that doesn't fit would never wrap.
 */

import type { ReactNode } from 'react';

export interface SegmentedOption<T extends string | number> {
  value: T;
  /** Accessible name, e.g. "Snap tolerance: Generous". */
  ariaLabel: string;
  content: ReactNode;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string | number> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** `wrap` lets a long label break onto a second row (the pause sheet's case). */
  wrap?: boolean;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  wrap = false,
}: SegmentedProps<T>): React.ReactElement {
  return (
    <div className={`flex gap-2 ${wrap ? 'flex-wrap' : ''}`}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-label={option.ariaLabel}
            aria-pressed={selected}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={`touch-target ${wrap ? 'flex-auto' : 'flex-1'} rounded-[var(--radius-sm)] px-2 font-[var(--font-data)] text-1 transition-colors duration-[var(--duration-fast)] disabled:opacity-40 ${
              selected
                ? 'border-2 border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]'
                : 'border border-[var(--edge-hair)] text-[var(--ink-muted)]'
            }`}
          >
            {option.content}
          </button>
        );
      })}
    </div>
  );
}
