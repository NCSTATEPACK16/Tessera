/**
 * Today's two compact cards (modernize spec §4): the streak, which leads into
 * the daily hub, and the collection, which leads into the Collection tab.
 *
 * Shape carries every meaning here, never colour alone (§13): a played day is
 * a filled pip, a freeze is a dashed pip with a snowflake, today is a ring, and
 * each pip has a full-sentence accessible name besides.
 */

import { useEffect, useState } from 'react';
import type { CompletionRecord } from '@/persist/completions';
import type { DateKey } from '@/daily/dates';
import { weekdayOf } from '@/daily/dates';
import type { DayCell } from '@/daily/streak';
import { PIP_LABEL } from './StreakFlame';
import { Icon } from './kit';

/** An object URL for a blob, revoked when the blob changes or the owner unmounts. */
export function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url;
}

const WEEKDAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

const CARD =
  'flex min-h-[168px] flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--edge-hair)] bg-[var(--mat-raised)] p-4 text-left transition-transform duration-[var(--duration-fast)] ease-[var(--ease-standard)] active:scale-[0.98]';

function pipShape(cell: DayCell): string {
  if (cell.status === 'completed') return 'border-[var(--ink-secondary)] bg-[var(--ink-secondary)]';
  if (cell.status === 'frozen') return 'border-dashed border-[var(--ink-secondary)] text-[var(--ink-secondary)]';
  return 'border-[var(--edge-hair-light)]';
}

export function WeekPips({
  pips,
  today,
}: {
  pips: readonly DayCell[];
  today: DateKey;
}): React.ReactElement {
  return (
    <div role="list" aria-label="This week" className="mt-auto grid grid-cols-7 gap-[2px] pt-3">
      {pips.map((cell) => {
        const isToday = cell.dateKey === today;
        return (
          <div
            key={cell.dateKey}
            role="listitem"
            aria-label={`${isToday ? 'Today' : cell.dateKey}: ${PIP_LABEL[cell.status]}`}
            className={`flex flex-col items-center gap-1 text-1 ${
              isToday ? 'text-[var(--ink-primary)]' : 'text-[var(--ink-muted)]'
            }`}
          >
            <span
              aria-hidden="true"
              className={`grid h-[14px] w-[14px] place-items-center rounded-full border-[1.5px] ${pipShape(cell)} ${
                // Today is a ring around whatever the day is — played or not.
                isToday ? 'outline outline-2 outline-offset-1 outline-[var(--accent)]' : ''
              }`}
            >
              {cell.status === 'frozen' && <Icon.Snowflake size={9} />}
            </span>
            <span aria-hidden="true">{WEEKDAY_LETTER[weekdayOf(cell.dateKey)]}</span>
          </div>
        );
      })}
    </div>
  );
}

export function StreakCard({
  numeral,
  line,
  pips,
  today,
  onOpen,
}: {
  numeral: number;
  line: string;
  pips: readonly DayCell[];
  today: DateKey;
  onOpen: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      aria-label={`Daily streak: ${numeral} day${numeral === 1 ? '' : 's'}. ${line}. Open the daily`}
      onClick={onOpen}
      className={CARD}
    >
      <span
        className="font-display text-6 leading-none text-[var(--ink-primary)]"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {numeral}
      </span>
      <span className="text-2 text-[var(--ink-secondary)]">day streak</span>
      <span className="meta text-[var(--ink-secondary)]">{line}</span>
      <WeekPips pips={pips} today={today} />
    </button>
  );
}

function MosaicTile({ entry }: { entry: CompletionRecord }): React.ReactElement {
  const url = useObjectUrl(entry.thumbnailBlob);
  return (
    <span className="block aspect-square overflow-hidden rounded-[4px] bg-[var(--mat-deep)]">
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
    </span>
  );
}

export function CollectionCard({
  finished,
  piecesPlaced,
  recent,
  onOpen,
}: {
  finished: number;
  piecesPlaced: number;
  recent: readonly CompletionRecord[];
  onOpen: () => void;
}): React.ReactElement {
  const slots = Array.from({ length: 8 - recent.length }, (_, i) => i);
  return (
    <button
      type="button"
      aria-label={`Collection: ${finished} finished`}
      onClick={onOpen}
      className={CARD}
    >
      <span aria-hidden="true" className="mb-2 grid w-full max-w-[208px] grid-cols-4 gap-[3px]">
        {recent.map((entry) => (
          <MosaicTile key={entry.puzzleId} entry={entry} />
        ))}
        {slots.map((i) => (
          <span
            key={i}
            className="block aspect-square rounded-[4px] border border-dashed border-[var(--edge-hair-light)]"
          />
        ))}
      </span>
      {finished === 0 ? (
        <span className="text-2 text-[var(--ink-secondary)]">Finished puzzles hang here.</span>
      ) : (
        <>
          <span className="text-2 text-[var(--ink-secondary)]">
            <span
              className="font-display text-5 text-[var(--ink-primary)]"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {finished}
            </span>{' '}
            finished
          </span>
          <span className="meta text-[var(--ink-secondary)]">
            {piecesPlaced.toLocaleString()} pieces placed
          </span>
        </>
      )}
    </button>
  );
}
