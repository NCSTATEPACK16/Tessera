import { describe, expect, it } from 'vitest';
import {
  FREEZE_EVERY,
  MAX_FREEZES,
  REPAIR_MAX_GAP_DAYS,
  canRepair,
  emptyStreak,
  isDone,
  monthGrid,
  recordCompletion,
  repair,
  settle,
  streakLength,
  weekPips,
} from '@/daily/streak';
import type { StreakState } from '@/daily/streak';
import { addDays } from '@/daily/dates';

/** Play `days` consecutive dailies ending on `lastDay`. */
function playRun(lastDay: string, days: number): StreakState {
  let state = emptyStreak();
  for (let i = days - 1; i >= 0; i--) {
    state = recordCompletion(state, addDays(lastDay, -i)).state;
  }
  return state;
}

describe('streakLength', () => {
  it('is zero on a fresh state', () => {
    expect(streakLength(emptyStreak(), '2026-08-03')).toBe(0);
  });

  it('counts consecutive completed days ending today', () => {
    expect(streakLength(playRun('2026-08-03', 4), '2026-08-03')).toBe(4);
  });

  it('an unplayed today is at risk, not broken', () => {
    // Played through yesterday, nothing today: the streak still stands.
    const state = playRun('2026-08-02', 4);
    expect(streakLength(state, '2026-08-03')).toBe(4);
  });

  it('is zero once a day has been missed outright', () => {
    const state = playRun('2026-08-01', 4);
    expect(streakLength(state, '2026-08-03')).toBe(0);
  });

  it('counts a frozen day as covered', () => {
    const played = playRun('2026-08-02', FREEZE_EVERY);
    // Skip the 3rd; open the app on the 4th and the freeze covers it.
    const settled = settle(played, '2026-08-04').state;
    expect(streakLength(settled, '2026-08-04')).toBe(FREEZE_EVERY + 1);
  });
});

describe('recordCompletion', () => {
  it('earns exactly one freeze at a seven-day streak', () => {
    let state = emptyStreak();
    const earned: boolean[] = [];
    for (let i = FREEZE_EVERY - 1; i >= 0; i--) {
      const result = recordCompletion(state, addDays('2026-08-07', -i));
      state = result.state;
      earned.push(result.freezeEarned);
    }
    expect(earned.filter(Boolean)).toHaveLength(1);
    expect(earned[FREEZE_EVERY - 1]).toBe(true);
    expect(state.freezes).toBe(1);
  });

  it('caps the freeze bank', () => {
    const state = playRun('2026-12-31', FREEZE_EVERY * (MAX_FREEZES + 2));
    expect(state.freezes).toBe(MAX_FREEZES);
  });

  it('is idempotent — completing the same day twice changes nothing', () => {
    const first = recordCompletion(emptyStreak(), '2026-08-03');
    const second = recordCompletion(first.state, '2026-08-03');
    expect(second.alreadyDone).toBe(true);
    expect(second.state.completed).toEqual(first.state.completed);
    expect(second.state.freezes).toBe(first.state.freezes);
  });

  it('reports the streak it just produced', () => {
    const state = playRun('2026-08-02', 3);
    expect(recordCompletion(state, '2026-08-03').streak).toBe(4);
  });
});

describe('settle', () => {
  it('spends a banked freeze on a missed day', () => {
    const played = playRun('2026-08-07', FREEZE_EVERY); // one freeze banked
    const result = settle(played, '2026-08-09'); // the 8th was missed
    expect(result.freezesSpent).toBe(1);
    expect(result.broke).toBe(false);
    expect(result.state.freezes).toBe(0);
    expect(result.state.frozen).toContain('2026-08-08');
    expect(streakLength(result.state, '2026-08-09')).toBe(FREEZE_EVERY + 1);
  });

  it('spends only one freeze no matter how many times it runs in a day', () => {
    // The load-bearing case. The failure is silent and slow: a player who
    // opens the app three times on one day would quietly lose their whole
    // freeze bank, with nothing on screen ever saying so.
    const played = playRun('2026-08-14', FREEZE_EVERY * 2); // two freezes banked
    let state = settle(played, '2026-08-16').state; // the 15th was missed
    const afterFirst = state.freezes;
    state = settle(state, '2026-08-16').state;
    state = settle(state, '2026-08-16').state;
    expect(state.freezes).toBe(afterFirst);
    expect(state.frozen.filter((day) => day === '2026-08-15')).toHaveLength(1);
  });

  it('breaks the streak once the bank is empty', () => {
    const played = playRun('2026-08-03', 3); // no freeze earned yet
    const result = settle(played, '2026-08-05'); // the 4th missed, nothing to spend
    expect(result.broke).toBe(true);
    expect(result.freezesSpent).toBe(0);
    expect(streakLength(result.state, '2026-08-05')).toBe(0);
  });

  it('never spends a freeze on a streak that is already broken', () => {
    const played = playRun('2026-08-03', FREEZE_EVERY + 3); // freeze banked
    // Away for a fortnight — the first gap day eats the freeze and the streak
    // breaks. Coming back later must not burn anything further.
    const broken = settle(played, '2026-08-20');
    expect(broken.broke).toBe(true);
    const before = broken.state.freezes;
    const again = settle(broken.state, '2026-08-25');
    expect(again.freezesSpent).toBe(0);
    expect(again.state.freezes).toBe(before);
  });

  it('never settles today itself — today is still playable', () => {
    const played = playRun('2026-08-07', FREEZE_EVERY);
    const result = settle(played, '2026-08-08'); // today unplayed
    expect(result.freezesSpent).toBe(0);
    expect(result.state.frozen).not.toContain('2026-08-08');
  });

  it('does nothing at all on a state with no completions', () => {
    const result = settle(emptyStreak(), '2026-08-03');
    expect(result.freezesSpent).toBe(0);
    expect(result.broke).toBe(false);
    expect(result.state.completed).toEqual([]);
  });
});

describe('repair', () => {
  it('is offered only when the streak is actually broken', () => {
    const alive = playRun('2026-08-03', 4);
    expect(canRepair(alive, '2026-08-04')).toBe(false); // at risk, not broken
    const broken = settle(playRun('2026-08-01', 4), '2026-08-04').state;
    expect(canRepair(broken, '2026-08-04')).toBe(true);
  });

  it('restores the streak across the gap', () => {
    const broken = settle(playRun('2026-08-01', 4), '2026-08-04').state;
    const repaired = repair(broken, '2026-08-04');
    expect(streakLength(repaired, '2026-08-04')).toBe(6); // 4 played + 2 repaired
  });

  it('is available once a calendar month, and not twice', () => {
    const broken = settle(playRun('2026-08-01', 4), '2026-08-04').state;
    const repaired = repair(broken, '2026-08-04');
    expect(canRepair(repaired, '2026-08-04')).toBe(false);

    // Break it again inside the same month.
    const brokenAgain = settle(repaired, '2026-08-20').state;
    expect(canRepair(brokenAgain, '2026-08-20')).toBe(false);
    // A new month lifts the once-a-month restriction, but the gap since the
    // last completed day (2026-08-01) is now 31 days — well past
    // REPAIR_MAX_GAP_DAYS. The month reset does not waive the gap cap, so
    // this stays ungrantable. (Caught by running this test against the
    // implementation: the earlier draft expected `true` here, which
    // contradicts "will not resurrect a streak from an absence longer than
    // the cap" below — a gap cap that stops applying just because a month
    // rolled over is not a gap cap.)
    expect(canRepair(brokenAgain, '2026-09-02')).toBe(false);
  });

  it('will not resurrect a streak from an absence longer than the cap', () => {
    const gone = playRun('2026-08-01', 10);
    const later = addDays('2026-08-01', REPAIR_MAX_GAP_DAYS + 2);
    expect(canRepair(settle(gone, later).state, later)).toBe(false);
  });

  it('is never offered to a player who has never completed a daily', () => {
    expect(canRepair(emptyStreak(), '2026-08-03')).toBe(false);
  });

  it('returns the state unchanged when it is not offered', () => {
    const alive = playRun('2026-08-03', 4);
    expect(repair(alive, '2026-08-04')).toEqual(alive);
  });
});

describe('isDone', () => {
  it('answers only for a genuinely completed day', () => {
    const state = settle(playRun('2026-08-07', FREEZE_EVERY), '2026-08-09').state;
    expect(isDone(state, '2026-08-07')).toBe(true);
    expect(isDone(state, '2026-08-08')).toBe(false); // frozen is not played
    expect(isDone(state, '2026-08-09')).toBe(false);
  });
});

describe('weekPips', () => {
  it('is seven days ending today, oldest first', () => {
    const pips = weekPips(playRun('2026-08-03', 3), '2026-08-03');
    expect(pips).toHaveLength(7);
    expect(pips[0]!.dateKey).toBe('2026-07-28');
    expect(pips[6]!.dateKey).toBe('2026-08-03');
  });

  it('labels each day by what actually happened', () => {
    const played = settle(playRun('2026-08-07', FREEZE_EVERY), '2026-08-09').state;
    const byDay = new Map(weekPips(played, '2026-08-09').map((cell) => [cell.dateKey, cell.status]));
    expect(byDay.get('2026-08-07')).toBe('completed');
    expect(byDay.get('2026-08-08')).toBe('frozen');
    expect(byDay.get('2026-08-09')).toBe('today');
  });

  it('never calls a day before the player started "missed"', () => {
    const pips = weekPips(playRun('2026-08-03', 1), '2026-08-03');
    expect(pips[0]!.status).toBe('inactive');
  });
});

describe('monthGrid', () => {
  it('aligns the first day to its weekday and covers the whole month', () => {
    const grid = monthGrid(emptyStreak(), '2026-08', '2026-08-03');
    expect(grid.days).toHaveLength(31);
    // 1 August 2026 is a Saturday — six blanks before it.
    expect(grid.leadingBlanks).toBe(6);
    expect(grid.days[0]!.dateKey).toBe('2026-08-01');
    expect(grid.days[30]!.dateKey).toBe('2026-08-31');
  });

  it('marks days after today as future, never missed', () => {
    const grid = monthGrid(playRun('2026-08-03', 3), '2026-08', '2026-08-03');
    const byDay = new Map(grid.days.map((cell) => [cell.dateKey, cell.status]));
    expect(byDay.get('2026-08-02')).toBe('completed');
    expect(byDay.get('2026-08-03')).toBe('completed');
    expect(byDay.get('2026-08-04')).toBe('future');
    expect(byDay.get('2026-08-31')).toBe('future');
  });

  it('handles a leap February', () => {
    expect(monthGrid(emptyStreak(), '2028-02', '2028-02-10').days).toHaveLength(29);
  });
});
