import { describe, expect, it } from 'vitest';
import {
  FIRST_RUN_PIECES,
  HINT_IDLE_MS,
  HINT_RESCUE_AT,
  TRAY_REVEAL_AT,
  firstRunStart,
  firstRunTick,
  type FirstRunInput,
} from '@/play/first-run';

const input = (over: Partial<FirstRunInput> = {}): FirstRunInput => ({
  placed: 0,
  total: FIRST_RUN_PIECES,
  msSinceLastPlacement: 0,
  skipped: false,
  ...over,
});

describe('the numbers §16 specifies', () => {
  it('is twelve pieces', () => {
    expect(FIRST_RUN_PIECES).toBe(12);
  });
  it('reveals the tray at four and rescues at eight, after twenty seconds', () => {
    expect(TRAY_REVEAL_AT).toBe(4);
    expect(HINT_RESCUE_AT).toBe(8);
    expect(HINT_IDLE_MS).toBe(20_000);
  });
});

describe('the cold open', () => {
  it('opens on the one line of copy', () => {
    expect(firstRunTick(firstRunStart(), input()).beat).toBe('cold-open');
  });

  it('drops the copy on the first placement — nothing is explained', () => {
    let s = firstRunStart();
    const out = firstRunTick(s, input({ placed: 1 }));
    expect(out.beat).toBe('playing');
  });
});

describe('the tray reveal', () => {
  it('fires at exactly four placed', () => {
    let s = firstRunStart();
    expect(firstRunTick(s, input({ placed: 3 })).beat).toBe('playing');
    expect(firstRunTick(s, input({ placed: 4 })).beat).toBe('tray-reveal');
  });

  // The tray must not un-reveal. Once it is on screen, taking it away would
  // be a worse tutorial than never showing it.
  it('is latched — a later beat never takes the tray back', () => {
    let s = firstRunStart();
    let out = firstRunTick(s, input({ placed: 4 }));
    s = out.state;
    out = firstRunTick(s, input({ placed: 5 }));
    expect(out.beat).not.toBe('cold-open');
    expect(out.beat).toBe('playing');
  });
});

describe('the hint rescue', () => {
  it('does not fire before eight placed, however long the player stalls', () => {
    let s = firstRunStart();
    s = firstRunTick(s, input({ placed: 4 })).state;
    const out = firstRunTick(s, input({ placed: 7, msSinceLastPlacement: 60_000 }));
    expect(out.fireHint).toBe(false);
  });

  it('does not fire at eight until twenty seconds have passed', () => {
    let s = firstRunStart();
    s = firstRunTick(s, input({ placed: 4 })).state;
    const out = firstRunTick(s, input({ placed: 8, msSinceLastPlacement: 19_999 }));
    expect(out.fireHint).toBe(false);
  });

  it('fires at eight placed after twenty seconds', () => {
    let s = firstRunStart();
    s = firstRunTick(s, input({ placed: 4 })).state;
    const out = firstRunTick(s, input({ placed: 8, msSinceLastPlacement: HINT_IDLE_MS }));
    expect(out.fireHint).toBe(true);
    expect(out.beat).toBe('hint-rescue');
  });

  // §16: "fires tier 1 unprompted, once." An edge, not a level — a level
  // would re-fire on every frame of a stalled board.
  it('fires exactly once, ever', () => {
    let s = firstRunStart();
    s = firstRunTick(s, input({ placed: 4 })).state;
    let out = firstRunTick(s, input({ placed: 8, msSinceLastPlacement: HINT_IDLE_MS }));
    expect(out.fireHint).toBe(true);
    s = out.state;

    out = firstRunTick(s, input({ placed: 8, msSinceLastPlacement: HINT_IDLE_MS + 16 }));
    expect(out.fireHint).toBe(false);

    // Nor after a further stall later in the puzzle.
    out = firstRunTick(out.state, input({ placed: 10, msSinceLastPlacement: 90_000 }));
    expect(out.fireHint).toBe(false);
  });
});

describe('completion and skip', () => {
  it('completes when every piece is placed', () => {
    let s = firstRunStart();
    s = firstRunTick(s, input({ placed: 4 })).state;
    const out = firstRunTick(s, input({ placed: FIRST_RUN_PIECES }));
    expect(out.beat).toBe('complete');
  });

  it('skip ends it from any beat, and never fires a hint on the way out', () => {
    let s = firstRunStart();
    const out = firstRunTick(s, input({ placed: 8, msSinceLastPlacement: 60_000, skipped: true }));
    expect(out.beat).toBe('complete');
    expect(out.fireHint).toBe(false);
  });
});
