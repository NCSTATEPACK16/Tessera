/**
 * The canonical order (§06).
 *
 * "The tray has one canonical order that never changes unless the player changes
 * it. Filters hide and reveal within that order; they do not reflow it."
 *
 * Two decisions are baked into this file.
 *
 * **It is shuffled, not cut order.** Laying pieces out row-major would reassemble
 * the photograph inside the tray, which hands the player the answer and deletes
 * the search — the search being the game. So the order is deliberately unrelated
 * to where a piece belongs.
 *
 * **The shuffle is seeded**, from the same `rngFor` streams the cut uses. A fresh
 * session therefore needs no stored order at all: the seed reproduces it. §14's
 * `tray.order[]` only ever has to persist an order the *player* changed, which is
 * the difference between a snapshot that stores 250 integers and one that stores
 * nothing.
 */

import { rngFor } from '@/core/rng';
import type { PieceId } from '@/cut/types';

/**
 * A stable shuffle of every piece id.
 *
 * Fisher–Yates drawn from a stream of its own, so adding an unrelated seeded
 * concern later cannot silently reorder every existing tray.
 */
export function canonicalOrder(pieceIds: readonly PieceId[], seed: number): PieceId[] {
  const order = [...pieceIds];
  const rng = rngFor(seed, 'trayOrder', 0);

  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const a = order[i]!;
    order[i] = order[j]!;
    order[j] = a;
  }

  return order;
}

/**
 * Move one piece to just before another, preserving everything else.
 *
 * The only way the canonical order is ever allowed to change: because the player
 * asked. Returns a new array; the caller decides whether to keep it.
 */
export function reorder(order: readonly PieceId[], moved: PieceId, before: PieceId | null): PieceId[] {
  const without = order.filter((id) => id !== moved);
  if (without.length === order.length) return [...order];

  const at = before === null ? without.length : without.indexOf(before);
  if (at < 0) return [...without, moved];

  return [...without.slice(0, at), moved, ...without.slice(at)];
}
