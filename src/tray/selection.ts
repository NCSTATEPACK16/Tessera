/**
 * The tray's multi-select set (§06).
 *
 * An *ordered* set, because §06 specifies numbered order badges — "selected
 * pieces show a numbered order badge" — and a badge is only meaningful if the
 * order is the one the player built.
 *
 * It holds ids and nothing else. **Selection is over pieces, not over the
 * current view**: a lens change alters what is on screen and must not alter what
 * is selected, or checking the colour bins mid-selection would silently discard
 * the player's work.
 *
 * DOM-free, like every other file in `tray/` with a decision in it.
 */

import type { PieceId } from '@/cut/types';

export class TraySelection {
  private ids: PieceId[] = [];

  get size(): number {
    return this.ids.length;
  }

  /** Selection order — the order the badges count in. */
  get ordered(): readonly PieceId[] {
    return this.ids;
  }

  has(id: PieceId): boolean {
    return this.ids.includes(id);
  }

  /** 1-based badge number, or 0 when the piece is not selected. */
  badgeOf(id: PieceId): number {
    return this.ids.indexOf(id) + 1;
  }

  toggle(id: PieceId): void {
    if (this.has(id)) this.remove(id);
    else this.ids.push(id);
  }

  remove(id: PieceId): void {
    const index = this.ids.indexOf(id);
    if (index >= 0) this.ids.splice(index, 1);
  }

  clear(): void {
    this.ids = [];
  }
}
