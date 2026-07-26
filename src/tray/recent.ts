/**
 * The Recent lens's memory (§06) — "the last twenty pieces you touched but did
 * not place. Quietly fixes the 'I had it a second ago' moment."
 *
 * A bounded set with eviction, deliberately **not** an ordered list the lens
 * reads out. If Recent presented pieces newest-first it would be a sort, and §06
 * is explicit that lenses hide and reveal within the canonical order and never
 * reflow it. So this answers only "is this piece recent?", and the lens walks the
 * canonical order asking.
 */

import type { PieceId } from '@/cut/types';

/** §06 says twenty. */
export const RECENT_LIMIT = 20;

export class RecentPieces {
  /** Insertion-ordered, so the oldest entry is the first key. */
  private readonly ring = new Set<PieceId>();

  constructor(private readonly limit = RECENT_LIMIT) {}

  get size(): number {
    return this.ring.size;
  }

  has(id: PieceId): boolean {
    return this.ring.has(id);
  }

  /** Touched: dragged out of the tray, or picked up on the mat. */
  touch(id: PieceId): void {
    // Re-inserting moves it to the back of the eviction queue, so the piece you
    // keep fiddling with is the last one forgotten.
    this.ring.delete(id);
    this.ring.add(id);

    while (this.ring.size > this.limit) {
      const oldest = this.ring.values().next();
      if (oldest.done) break;
      this.ring.delete(oldest.value);
    }
  }

  /** Placed. It is on the board now — "did not place" no longer describes it. */
  forget(id: PieceId): void {
    this.ring.delete(id);
  }

  clear(): void {
    this.ring.clear();
  }

  /** A read-only view for the lens. Membership only; order is not meaningful. */
  get ids(): ReadonlySet<PieceId> {
    return this.ring;
  }
}
