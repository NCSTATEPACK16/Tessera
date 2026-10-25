/**
 * A small mono pill (2026-10-20 modern-look spec §2). The tone is decoration;
 * the word is the signal — a Badge never carries meaning by colour alone (§13).
 */

export type BadgeTone = 'accent' | 'success' | 'warn' | 'muted';

const TONES: Record<BadgeTone, string> = {
  accent: 'var(--accent)',
  success: 'var(--success)',
  warn: 'var(--warn)',
  muted: 'var(--ink-muted)',
};

export function Badge({ label, tone = 'muted' }: { label: string; tone?: BadgeTone }): React.ReactElement {
  const color = TONES[tone];
  return (
    <span
      className="whitespace-nowrap rounded-[var(--radius-sm)] border px-[7px] py-[2px] font-[var(--font-data)] text-1 uppercase tracking-[0.08em]"
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 25%, transparent)`,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}
