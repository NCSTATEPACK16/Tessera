/**
 * Grouped settings rows (2026-10-20 modern-look spec §2): an eyebrow title over
 * a raised panel whose rows are split by hairlines. Used by the pause sheet and
 * Setup's "More options"; a global Settings screen would reuse it.
 */

import type { ReactNode } from 'react';

export function SettingsGroup({ title, children }: { title: string; children: ReactNode }): React.ReactElement {
  return (
    <section className="flex flex-col gap-2">
      <div className="eyebrow">{title}</div>
      <div className="flex flex-col divide-y divide-[var(--edge-hair)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--edge-hair)] bg-[var(--mat-raised)]">
        {children}
      </div>
    </section>
  );
}

export interface SettingsRowProps {
  label: ReactNode;
  sub?: ReactNode;
  /** A control on the right — a Toggle, a value. Omit for a stacked row. */
  trailing?: ReactNode;
  /** A control below the label — a Segmented, a slider. */
  children?: ReactNode;
}

export function SettingsRow({ label, sub, trailing, children }: SettingsRowProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-2 text-[var(--ink-primary)]">{label}</div>
          {sub && <div className="font-[var(--font-data)] text-1 text-[var(--ink-muted)]">{sub}</div>}
        </div>
        {trailing}
      </div>
      {children}
    </div>
  );
}
