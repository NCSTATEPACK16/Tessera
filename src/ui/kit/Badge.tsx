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

export function Badge({
  label,
  tone = 'muted',
  icon,
}: {
  label: string;
  tone?: BadgeTone;
  /** A glyph before the word — shape alongside colour, never instead of the word. */
  icon?: React.ReactNode;
}): React.ReactElement {
  const color = TONES[tone];
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-[var(--radius-pill)] border px-[7px] py-[2px] font-data text-1 uppercase tracking-[var(--tracking-eyebrow)]"
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 25%, transparent)`,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
    >
      {icon}
      {label}
    </span>
  );
}
