/**
 * The month calendar of completions (design doc screen 11).
 *
 * A real table, because a calendar without column semantics is an unlabelled
 * list of numbers to a screen reader. Every cell states its own status in
 * words (`CLAUDE.md`: colour is never the only signal), and cells clear the
 * 44pt touch floor even though nothing here is tappable — a 20px grid is
 * unreadable on a phone whether or not you can press it.
 */

import { parseDateKey } from '@/daily/dates';
import type { DayStatus, MonthGrid } from '@/daily/streak';

export interface MonthCalendarProps {
  grid: MonthGrid;
  /** e.g. "August 2026". Formatted by the caller, which owns the locale. */
  label: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const STATUS_LABEL: Record<DayStatus, string> = {
  completed: 'completed',
  frozen: 'covered by a freeze',
  missed: 'not played',
  today: 'today',
  future: 'still to come',
  inactive: 'before you started',
};

const STATUS_GLYPH: Record<DayStatus, string> = {
  completed: '●',
  frozen: '◇',
  missed: '',
  today: '',
  future: '',
  inactive: '',
};

function cellClass(status: DayStatus): string {
  switch (status) {
    case 'completed':
      return 'bg-[var(--accent)]/20 text-[var(--accent)]';
    case 'frozen':
      return 'border border-[var(--accent)] text-[var(--accent)]';
    case 'today':
      return 'border border-[var(--ink-primary)] text-[var(--ink-primary)]';
    case 'missed':
      return 'text-[var(--ink-muted)]';
    default:
      return 'text-[var(--ink-muted)]/50';
  }
}

export function MonthCalendar({ grid, label }: MonthCalendarProps): React.ReactElement {
  const blanks = Array.from({ length: grid.leadingBlanks }, (_, i) => i);
  const cells = [...blanks.map(() => null), ...grid.days];
  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <table className="w-full border-separate border-spacing-1" aria-label={`Completions, ${label}`}>
      <caption className="pb-2 text-left font-[var(--font-data)] text-1 text-[var(--ink-muted)]">
        {label}
      </caption>
      <thead>
        <tr>
          {WEEKDAYS.map((day) => (
            <th
              key={day}
              scope="col"
              className="font-[var(--font-data)] text-1 font-normal text-[var(--ink-muted)]"
            >
              <span aria-hidden="true">{day[0]}</span>
              <span className="sr-only">{day}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week, index) => (
          <tr key={index}>
            {week.map((cell, column) =>
              cell === null ? (
                <td key={`blank-${column}`} />
              ) : (
                <td
                  key={cell.dateKey}
                  aria-label={`${cell.dateKey}: ${STATUS_LABEL[cell.status]}`}
                  className={`h-[44px] min-w-[44px] rounded-[var(--radius-sm)] text-center align-middle font-[var(--font-data)] text-1 tabular-nums ${cellClass(
                    cell.status,
                  )}`}
                >
                  <span aria-hidden="true">
                    {parseDateKey(cell.dateKey).day}
                    {STATUS_GLYPH[cell.status] && (
                      <span className="ml-0.5 text-1">{STATUS_GLYPH[cell.status]}</span>
                    )}
                  </span>
                </td>
              ),
            )}
            {/* Pad the last week so the final row keeps its column widths. */}
            {week.length < 7 &&
              Array.from({ length: 7 - week.length }, (_, i) => <td key={`pad-${i}`} />)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
