/**
 * The top bar's lines (modernize spec §5). The count is **the real computed
 * number, never the target** (§04) — "200" lands on 17 × 12 = 204, and showing
 * 200 would be a small lie the player can check.
 */

export interface TopBarInput {
  status: 'cutting' | 'playing' | 'complete' | 'failed';
  placed: number;
  total: number;
  cut: { done: number; total: number };
}

export interface TopBarModel {
  /** The mono line under the name. */
  count: string;
  /** 0–1, for the progress line. Empty while the cut is still streaming in. */
  progress: number;
}

export function topBarModel({ status, placed, total, cut }: TopBarInput): TopBarModel {
  // While the cut streams in, the count is already the real one: the player
  // (and anything reading the bar) sees n / N from the first frame it exists.
  // The cut's own progress is the board's to show (spec §6), not this line's.
  if (status === 'cutting') {
    return { count: total > 0 ? `${placed} / ${total}` : 'Cutting', progress: 0 };
  }
  if (status === 'failed') return { count: 'The cut failed', progress: 0 };
  return { count: `${placed} / ${total}`, progress: total > 0 ? placed / total : 0 };
}
