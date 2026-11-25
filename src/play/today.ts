/**
 * Today's decisions (modernize spec §4) — DOM-free, so tested.
 *
 * Which state the hero is in, which one primary it offers, what the streak and
 * collection cards say, and what a puzzle is called. `Today.tsx` only draws
 * what these return: the same split as `DailyHub`, where every state is a prop
 * combination decided in one place.
 */

import type { CompletionRecord } from '@/persist/completions';
import type { DayCell, StreakTone } from '@/daily/streak';
import { dailyDateKeyOf, dailyFor } from '@/daily/daily';
import { curatedPhotoById } from './curated';
import { formatElapsed } from './card';

export type HeroState = 'unplayed' | 'progress' | 'done';

export interface HeroInput {
  doneToday: boolean;
  /** Today's daily, saved and unfinished; null when there is none. */
  progress: { placed: number; total: number } | null;
  /** Today's daily's completion row, when it is done and the row is loaded. */
  record: CompletionRecord | null;
  pieceCount: number;
  hintsIncluded: number;
  resetsInMs: number;
}

export interface HeroAction {
  label: 'Start' | 'Keep going' | 'See your card';
  /** Outline, not ghost: ghost's ink is `--ink-muted`, which never goes on the hero. */
  variant: 'primary' | 'outline';
}

export interface HeroModel {
  state: HeroState;
  eyebrow: string;
  line: string;
  /** Null only when done with no completion row to reopen — never a dead button. */
  action: HeroAction | null;
  /** Whole percent, in progress only. */
  percent: number | null;
}

export function formatResetsIn(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function heroModel(input: HeroInput): HeroModel {
  const eyebrow = `Daily · ${input.pieceCount} pieces`;
  const resets = formatResetsIn(input.resetsInMs);

  // Done wins. A finished daily is deleted from the library after its
  // completion is written, but DailyHub's "Play it again" starts a fresh entry
  // under the same id, so progress beside `doneToday` is a real replay. Today
  // still shows the finish; the replay stays reachable through the hub.
  if (input.doneToday) {
    const r = input.record;
    return {
      state: 'done',
      eyebrow: 'Daily · done',
      line: r
        ? `${r.pieceCount} pieces in ${formatElapsed(r.elapsedMs)}${r.cleanRun ? ' · clean run' : ''}`
        : `New puzzle in ${resets}`,
      action: r ? { label: 'See your card', variant: 'outline' } : null,
      percent: null,
    };
  }

  if (input.progress) {
    const { placed, total } = input.progress;
    return {
      state: 'progress',
      eyebrow,
      line: `${placed} of ${total} placed`,
      action: { label: 'Keep going', variant: 'primary' },
      percent: total === 0 ? 0 : Math.round((placed / total) * 100),
    };
  }

  return {
    state: 'unplayed',
    eyebrow,
    line: `${input.hintsIncluded} hints included · new puzzle in ${resets}`,
    action: { label: 'Start', variant: 'primary' },
    percent: null,
  };
}

/** One line, stating what is true; zero is an invitation, never a scolding. */
export function streakModel(
  tone: StreakTone,
  streak: number,
  freezes: number,
): { numeral: number; line: string } {
  if (tone === 'alive') {
    const saved = freezes > 0 ? ` ${freezes} freeze${freezes === 1 ? '' : 's'} saved.` : '';
    return { numeral: streak, line: `Played today.${saved}` };
  }
  if (tone === 'at-risk') return { numeral: streak, line: 'Today keeps it going.' };
  return { numeral: 0, line: 'Start one today' };
}

/** Today's collection card shows this many of the newest finishes. */
export const MOSAIC_TILES = 8;

/** From `completions` only — the wall's store, newest first as stored. */
export function collectionSummary(records: readonly CompletionRecord[]): {
  finished: number;
  piecesPlaced: number;
  recent: readonly CompletionRecord[];
} {
  return {
    finished: records.length,
    piecesPlaced: records.reduce((sum, r) => sum + r.pieceCount, 0),
    recent: records.slice(0, MOSAIC_TILES),
  };
}

/**
 * A puzzle's name for the rail. A snapshot saved before it carried `photoId`
 * still names a daily, from the date in its id.
 */
export function puzzleTitle(puzzleId: string, photoId: string | null | undefined): string {
  const id = photoIdOf(puzzleId, photoId);
  return (id ? curatedPhotoById(id)?.name : undefined) ?? 'Your photo';
}

/**
 * The photo a puzzle was cut from. A daily saved before snapshots carried
 * `photoId` recovers it from the date in its own id — never from today's daily,
 * which names yesterday's resumed board after the wrong photo and credits the
 * wrong photographer (§15).
 */
export function photoIdOf(puzzleId: string, photoId: string | null | undefined): string | null {
  if (photoId) return photoId;
  const dateKey = dailyDateKeyOf(puzzleId);
  return dateKey ? dailyFor(dateKey).photoId : null;
}

/**
 * The streak card's accessible name. The card is a button, so the pips inside
 * it are presentational and their own names are never read: the week they
 * draw is summarised here instead.
 */
export function streakCardLabel(numeral: number, line: string, pips: readonly DayCell[]): string {
  const played = pips.filter((c) => c.status === 'completed').length;
  const frozen = pips.filter((c) => c.status === 'frozen').length;
  const week =
    played === 0 && frozen === 0
      ? 'none played yet'
      : [`${played} played`, ...(frozen > 0 ? [`${frozen} covered by a freeze`] : [])].join(', ');
  const sentence = line.replace(/\.$/, '');
  return `Daily streak: ${numeral} day${numeral === 1 ? '' : 's'}. ${sentence}. This week: ${week}. Open the daily`;
}
