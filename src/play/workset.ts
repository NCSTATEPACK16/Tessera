/**
 * Worksets — §06's pull-out, and the one place the design doc's "island" splits
 * into two objects.
 *
 * §05's island is a **welded** cluster: pieces that snapped together off-board,
 * holding their true relative offsets, produced by `Board.merge` and dragged,
 * rotated and snapped by identical rules. §06's pull-out island is a **loose
 * grid** that deliberately does not hold those offsets.
 *
 * They cannot be one object. A pull-out cluster's internal offsets are wrong by
 * construction, so `snap.ts` — which computes every candidate's error from the
 * dragged cluster's frame — would resolve against false geometry, silently. And
 * dragging one of the twelve would drag all twelve, which is the exact opposite
 * of §06's "immediately workable".
 *
 * So a Workset is a **label over ordinary one-piece clusters**. `snap.ts` and
 * `board.ts` are not aware of this file, and must never become aware of it.
 *
 * **A Workset stores no position.** Its position *is* its members' positions,
 * and its outline is derived from them every frame. A stored group position
 * would be a second source of truth for where things are, and it would disagree
 * with the pieces the first time a member was dragged.
 */

import type { Rect } from '@/core/geom';
import type { PieceId } from '@/cut/types';

/**
 * How far outside its group's box a released piece may sit and still belong.
 *
 * World units, in the same family as snap tolerance and for the same reason: it
 * scales with piece size and never with zoom, so a player who zooms in has not
 * changed what counts as leaving the group.
 */
export const WORKSET_DROP_TOLERANCE = 1.0;

export interface Workset {
  id: number;
  label: string;
  /** Membership, in selection order. */
  pieceIds: PieceId[];
  collapsed: boolean;
}

export class WorksetStore {
  private readonly groups = new Map<number, Workset>();
  private readonly of = new Map<PieceId, number>();
  private nextId = 1;
  private nextLabel = 1;

  /**
   * Group these pieces. Returns the new id, or -1 for a group of fewer than two.
   *
   * A piece already in another Workset leaves it here — membership is exclusive,
   * and the newest intent wins.
   */
  create(pieceIds: readonly PieceId[], label?: string): number {
    if (pieceIds.length < 2) return -1;

    for (const pieceId of pieceIds) this.remove(pieceId);

    const id = this.nextId++;
    this.groups.set(id, {
      id,
      label: label ?? `Set ${this.nextLabel++}`,
      pieceIds: [...pieceIds],
      collapsed: false,
    });
    for (const pieceId of pieceIds) this.of.set(pieceId, id);
    return id;
  }

  get(id: number): Workset | undefined {
    return this.groups.get(id);
  }

  all(): readonly Workset[] {
    return [...this.groups.values()];
  }

  worksetOf(pieceId: PieceId): Workset | undefined {
    const id = this.of.get(pieceId);
    return id === undefined ? undefined : this.groups.get(id);
  }

  /**
   * A piece leaves its group — merged into a cluster, returned to the tray, or
   * dragged clear of the box. All three end the same way, on purpose: there is
   * one exit, so there is one place to get it wrong.
   */
  remove(pieceId: PieceId): void {
    const id = this.of.get(pieceId);
    if (id === undefined) return;

    this.of.delete(pieceId);
    const group = this.groups.get(id);
    if (!group) return;

    group.pieceIds = group.pieceIds.filter((each) => each !== pieceId);
    // A group of one is not a group.
    if (group.pieceIds.length < 2) this.dissolve(id);
  }

  dissolve(id: number): void {
    const group = this.groups.get(id);
    if (!group) return;
    for (const pieceId of group.pieceIds) this.of.delete(pieceId);
    this.groups.delete(id);
  }

  setCollapsed(id: number, collapsed: boolean): void {
    const group = this.groups.get(id);
    if (group) group.collapsed = collapsed;
  }

  rename(id: number, label: string): void {
    const group = this.groups.get(id);
    if (group) group.label = label;
  }

  /**
   * Is this piece inside a collapsed group?
   *
   * Honoured in **two** places or the board disagrees with itself: `scene()` must
   * not draw it and `rebuild()` must not index it. Draw without indexing and the
   * piece cannot be touched; index without drawing and the player grabs
   * something invisible.
   */
  isHidden(pieceId: PieceId): boolean {
    return this.worksetOf(pieceId)?.collapsed ?? false;
  }
}

/** The bounding box of whatever members can be located, or null for none. */
export function worksetBounds(
  pieceIds: readonly PieceId[],
  boxOf: (id: PieceId) => Rect | null,
): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pieceId of pieceIds) {
    const box = boxOf(pieceId);
    if (!box) continue;
    if (box.x < minX) minX = box.x;
    if (box.y < minY) minY = box.y;
    if (box.x + box.w > maxX) maxX = box.x + box.w;
    if (box.y + box.h > maxY) maxY = box.y + box.h;
  }

  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Has this piece been dragged clear of its group?
 *
 * Measured against the group's box grown by `tolerance` on every side. The
 * alternative — permanent membership until dismissed — lets one wandering piece
 * stretch the outline across the whole mat, which reads as a rendering bug
 * rather than as information.
 */
export function escapedBounds(box: Rect, bounds: Rect, tolerance: number): boolean {
  return (
    box.x + box.w < bounds.x - tolerance ||
    box.x > bounds.x + bounds.w + tolerance ||
    box.y + box.h < bounds.y - tolerance ||
    box.y > bounds.y + bounds.h + tolerance
  );
}
