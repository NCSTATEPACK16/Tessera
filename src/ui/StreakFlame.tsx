/**
 * The streak flame (design doc §12's component list).
 *
 * "Never scolds" is behaviour, not decoration: there is no copy here for a
 * broken streak that blames the player, and the at-risk state is phrased as
 * an invitation. The repair *offer* lives in `DailyHub` next to its button —
 * this component only ever states what is true.
 *
 * Colour is never the only signal (`CLAUDE.md`): every pip carries a glyph and
 * a full-sentence label as well as a fill.
 */

import type { DayCell, DayStatus } from '@/daily/streak';

export type StreakTone = 'none' | 'alive' | 'at-risk' | 'broken';

export interface StreakFlameProps {
  streak: number;
  freezes: number;
  tone: StreakTone;
  /** The seven days ending today. Omitted in the compact header form. */
  pips?: readonly DayCell[];
  compact?: boolean;
}

/** One line, stating what is true. Never an admonishment. */
export function streakMessage(tone: StreakTone, streak: number, canRepair: boolean): string {
  if (tone === 'none') return 'Start a streak.';
  if (tone === 'alive') return `${streak} day${streak === 1 ? '' : 's'} in a row.`;
  if (tone === 'at-risk') return 'Play today’s to keep it going.';
  return canRepair
    ? `Your ${streak} day streak ended. Repair it?`
    : 'A new streak starts today.';
}

const PIP_GLYPH: Record<DayStatus, string> = {
  completed: '●',
  frozen: '◇',
  missed: '·',
  today: '○',
  future: '·',
  inactive: '·',
};

const PIP_LABEL: Record<DayStatus, string> = {
  completed: 'completed',
  frozen: 'covered by a freeze',
  missed: 'not played',
  today: 'today, not played yet',
  future: 'still to come',
  inactive: 'before you started',
};

function pipClass(status: DayStatus): string {
  switch (status) {
    case 'completed':
      return 'bg-[var(--accent)] text-[var(--mat-void)]';
    case 'frozen':
      return 'border border-[var(--accent)] text-[var(--accent)]';
    case 'today':
      return 'border border-[var(--ink-primary)] text-[var(--ink-primary)]';
    default:
      return 'border border-[var(--edge-hair)] text-[var(--ink-muted)]';
  }
}

export function StreakFlame({
  streak,
  freezes,
  tone,
  pips,
  compact = false,
}: StreakFlameProps): React.ReactElement {
  if (compact) {
    return (
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true">{tone === 'broken' || tone === 'none' ? '○' : '▲'}</span>
        <span className="font-[var(--font-data)] text-2 tabular-nums">{streak}</span>
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span
          className="font-[var(--font-display)] text-6 leading-none text-[var(--ink-primary)]"
          // §13: the display serif is for the streak number, and tabular so it
          // does not shift width as the count grows.
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {streak}
        </span>
        <span className="font-[var(--font-data)] text-1 text-[var(--ink-muted)]">
          day streak{freezes > 0 ? ` · ${freezes} freeze${freezes === 1 ? '' : 's'}` : ''}
        </span>
      </div>

      {pips && (
        <div className="flex gap-1" role="list" aria-label="This week">
          {pips.map((cell) => (
            <span
              key={cell.dateKey}
              role="listitem"
              aria-label={`${cell.dateKey}: ${PIP_LABEL[cell.status]}`}
              title={`${cell.dateKey}: ${PIP_LABEL[cell.status]}`}
              className={`flex h-[22px] w-[22px] items-center justify-center rounded-[var(--radius-sm)] text-1 leading-none ${pipClass(
                cell.status,
              )}`}
            >
              <span aria-hidden="true">{PIP_GLYPH[cell.status]}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
