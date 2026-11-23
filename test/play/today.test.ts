/**
 * Today's decisions (modernize spec §4). Every state the hero can be in, and
 * which one primary it offers, is decided here so `Today.tsx` only draws.
 */

import { describe, expect, it } from 'vitest';
import type { CompletionRecord } from '@/persist/completions';
import { CURATED_PHOTOS } from '@/play/curated';
import { dailyFor, dailyPuzzleId } from '@/daily/daily';
import {
  collectionSummary,
  formatResetsIn,
  heroModel,
  puzzleTitle,
  streakModel,
} from '@/play/today';

const NINE_41 = (9 * 60 + 41) * 60_000;

function record(overrides: Partial<CompletionRecord> = {}): CompletionRecord {
  return {
    puzzleId: 'p',
    photoId: null,
    thumbnailBlob: new Blob(),
    elapsedMs: 1_458_000,
    pieceCount: 200,
    mode: 'classic',
    cleanRun: true,
    completedAt: 0,
    attribution: null,
    ...overrides,
  };
}

const base = {
  doneToday: false,
  progress: null,
  record: null,
  pieceCount: 200,
  hintsIncluded: 3,
  resetsInMs: NINE_41,
};

describe('heroModel', () => {
  it('not played: Start, filled', () => {
    const hero = heroModel(base);
    expect(hero.state).toBe('unplayed');
    expect(hero.eyebrow).toBe('Daily · 200 pieces');
    expect(hero.line).toBe('3 hints included · new puzzle in 9h 41m');
    expect(hero.action).toEqual({ label: 'Start', variant: 'primary' });
    expect(hero.percent).toBeNull();
  });

  it('in progress: Keep going, filled, with the percentage', () => {
    const hero = heroModel({ ...base, progress: { placed: 76, total: 200 } });
    expect(hero.state).toBe('progress');
    expect(hero.eyebrow).toBe('Daily · 200 pieces');
    expect(hero.line).toBe('76 of 200 placed');
    expect(hero.action).toEqual({ label: 'Keep going', variant: 'primary' });
    expect(hero.percent).toBe(38);
  });

  it('done: See your card, outlined, from the completion row', () => {
    const hero = heroModel({ ...base, doneToday: true, record: record() });
    expect(hero.state).toBe('done');
    expect(hero.eyebrow).toBe('Daily · done');
    expect(hero.line).toBe('200 pieces in 24:18 · clean run');
    expect(hero.action).toEqual({ label: 'See your card', variant: 'outline' });
  });

  it('done without a clean run says nothing about it', () => {
    const hero = heroModel({ ...base, doneToday: true, record: record({ cleanRun: false }) });
    expect(hero.line).toBe('200 pieces in 24:18');
  });

  it('done with no completion row offers no dead button', () => {
    const hero = heroModel({ ...base, doneToday: true, record: null });
    expect(hero.state).toBe('done');
    expect(hero.eyebrow).toBe('Daily · done');
    expect(hero.action).toBeNull();
    expect(hero.line).toBe('New puzzle in 9h 41m');
  });

  it('done wins over a stale progress entry', () => {
    const hero = heroModel({
      ...base,
      doneToday: true,
      record: record(),
      progress: { placed: 10, total: 200 },
    });
    expect(hero.state).toBe('done');
  });
});

describe('formatResetsIn', () => {
  it('hours and minutes, minutes alone under an hour', () => {
    expect(formatResetsIn(NINE_41)).toBe('9h 41m');
    expect(formatResetsIn(12 * 60_000)).toBe('12m');
  });
});

describe('streakModel', () => {
  it('alive, with and without a freeze', () => {
    expect(streakModel('alive', 24, 0)).toEqual({ numeral: 24, line: 'Played today.' });
    expect(streakModel('alive', 24, 1)).toEqual({ numeral: 24, line: 'Played today. 1 freeze saved.' });
    expect(streakModel('alive', 24, 2).line).toBe('Played today. 2 freezes saved.');
  });

  it('at risk is an invitation', () => {
    expect(streakModel('at-risk', 23, 0)).toEqual({ numeral: 23, line: 'Today keeps it going.' });
  });

  it('zero never scolds', () => {
    expect(streakModel('none', 0, 0)).toEqual({ numeral: 0, line: 'Start one today' });
    expect(streakModel('broken', 0, 0)).toEqual({ numeral: 0, line: 'Start one today' });
  });
});

describe('collectionSummary', () => {
  it('the eight newest, and the pieces summed from every completion', () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      record({ puzzleId: `p${i}`, pieceCount: 100 + i }),
    );
    const summary = collectionSummary(records);
    expect(summary.finished).toBe(10);
    expect(summary.piecesPlaced).toBe(1045);
    expect(summary.recent.map((r) => r.puzzleId)).toEqual(
      records.slice(0, 8).map((r) => r.puzzleId),
    );
  });

  it('empty', () => {
    expect(collectionSummary([])).toEqual({ finished: 0, piecesPlaced: 0, recent: [] });
  });
});

describe('puzzleTitle', () => {
  const photo = CURATED_PHOTOS[0]!;

  it('a curated photo by its name', () => {
    expect(puzzleTitle('some-uuid', photo.id)).toBe(photo.name);
  });

  it('a daily saved before snapshots carried a photo id, by its date', () => {
    const date = '2026-11-21';
    const expected = CURATED_PHOTOS.find((p) => p.id === dailyFor(date).photoId)!.name;
    expect(puzzleTitle(dailyPuzzleId(date), null)).toBe(expected);
    expect(puzzleTitle(dailyPuzzleId(date), undefined)).toBe(expected);
  });

  it('an upload', () => {
    expect(puzzleTitle('some-uuid', null)).toBe('Your photo');
  });
});
