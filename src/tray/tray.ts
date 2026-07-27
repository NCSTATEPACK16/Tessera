/**
 * The tray model (§06) — everything the tray decides, with none of the DOM.
 *
 * It owns three things: the canonical order, the colour bins, and what has been
 * touched recently. It owns *no* positions — where a piece actually is stays
 * with `PlaySession`, which is why `locationOf` is injected rather than
 * duplicated. One source of truth for "where is this piece" is worth an
 * indirection; two would be a class of bug that only shows up after a drag.
 *
 * It also owns no *selection*. Which lens is active is chrome state and lives in
 * the store React renders from; this class is asked. Holding it in both places
 * would mean a component either writing to the model during render or rendering
 * from a lens the player has already changed.
 *
 * Kept DOM-free for the same reason `PointerMachine` is: vitest runs in a node
 * environment here, so DOM-free is the same word as tested.
 */

import type { Rect } from '@/core/geom';
import type { PieceId } from '@/cut/types';
import { binByColour } from './colour';
import type { ColourBin } from './colour';
import { LENSES, visible } from './lenses';
import type { Lens, LensPiece, LensView, PieceLocation } from './lenses';
import { canonicalOrder, reorder } from './order';
import { RecentPieces } from './recent';

/** What the tray needs from the cut. A structural subset of `CutPiece`. */
export interface TrayPiece {
  id: PieceId;
  isEdge: boolean;
  isCorner: boolean;
  meanColor: readonly [number, number, number];
  colorVariance: number;
  targetX: number;
  targetY: number;
  worldW: number;
  worldH: number;
}

export interface TrayModelOptions {
  pieces: readonly TrayPiece[];
  /** The puzzle seed. The order and the bins are both derived from it. */
  seed: number;
  /** Asked, never cached — `PlaySession` is the authority. */
  locationOf: (id: PieceId) => PieceLocation;
}

export interface LensCount {
  lens: Lens;
  count: number;
  enabled: boolean;
}

export class TrayModel {
  private order_: PieceId[];
  private readonly bins_: ColourBin[];
  private readonly binOf: ReadonlyMap<PieceId, number>;
  private readonly recent_ = new RecentPieces();
  private readonly pinned_ = new Set<PieceId>();
  private readonly source = new Map<PieceId, TrayPiece>();

  constructor(private readonly options: TrayModelOptions) {
    for (const piece of options.pieces) this.source.set(piece.id, piece);

    this.order_ = canonicalOrder(
      options.pieces.map((piece) => piece.id),
      options.seed,
    );

    // Computed once, per §06: "computed once at cut time and cached".
    const binning = binByColour(options.pieces, options.seed);
    this.bins_ = binning.bins;
    this.binOf = binning.binOf;
  }

  get order(): readonly PieceId[] {
    return this.order_;
  }

  get bins(): readonly ColourBin[] {
    return this.bins_;
  }

  /** A piece was picked up. Feeds the Recent lens. */
  touch(id: PieceId): void {
    this.recent_.touch(id);
  }

  /** A piece landed on the board. "Touched but did not place" stops applying. */
  place(id: PieceId): void {
    this.recent_.forget(id);
    this.pinned_.delete(id);
  }

  /** The player dragged a chip somewhere else in the tray (§06's one exception). */
  moveInOrder(moved: PieceId, before: PieceId | null): void {
    this.order_ = reorder(this.order_, moved, before);
  }

  /**
   * Pin to the shelf (§06): "drag a piece there to say I am working on this one."
   *
   * An attribute of a tray piece, never a fourth location — a piece is still in
   * exactly one of `tray`, `mat`, or placed, and `PlaySession` remains the sole
   * authority on which.
   */
  pin(id: PieceId): void {
    if (this.locationOf(id) === 'tray') this.pinned_.add(id);
  }

  unpin(id: PieceId): void {
    this.pinned_.delete(id);
  }

  isPinned(id: PieceId): boolean {
    return this.pinned_.has(id);
  }

  /**
   * The shelf, in canonical order.
   *
   * Canonical and not pin order, deliberately: the shelf is a smaller tray, and
   * the muscle memory §06 is protecting does not stop applying because there are
   * four chips instead of two hundred.
   */
  get pinned(): PieceId[] {
    return this.order_.filter(
      (id) => this.pinned_.has(id) && this.options.locationOf(id) === 'tray',
    );
  }

  /** The ids a lens reveals, in canonical order. */
  visible(lens: Lens, arg: number | null, region: Rect | null): PieceId[] {
    return visible(this.order_, this.lensPieces(), lens, arg, this.view(region));
  }

  /** Per-lens counts for the chip row (§12: "filter pill … with count"). */
  lensCounts(region: Rect | null): LensCount[] {
    const pieces = this.lensPieces();
    const view = this.view(region);
    return LENSES.map((lens) => ({
      lens,
      count: visible(this.order_, pieces, lens, null, view).length,
      enabled: lens !== 'region' || view.region !== null,
    }));
  }

  /** How many tray pieces sit in one colour bin. Drives the bin chips. */
  binCount(bin: number, region: Rect | null): number {
    return visible(this.order_, this.lensPieces(), 'colour', bin, this.view(region)).length;
  }

  locationOf(id: PieceId): PieceLocation {
    return this.options.locationOf(id);
  }

  pieceOf(id: PieceId): TrayPiece | undefined {
    return this.source.get(id);
  }

  isEdge(id: PieceId): boolean {
    return this.source.get(id)?.isEdge ?? false;
  }

  colourBinOf(id: PieceId): number {
    return this.binOf.get(id) ?? -1;
  }

  // -------------------------------------------------------------------------

  private view(region: Rect | null): LensView {
    return { region, recent: this.recent_.ids, pinned: this.pinned_ };
  }

  /**
   * Project the cut's pieces into what the lenses want, resolving location now.
   *
   * Rebuilt per call rather than cached: it is 250 object literals on a lens
   * change or a chrome render, never on a drag frame, and a stale location here
   * would draw a chip for a piece that is sitting on the mat.
   */
  private lensPieces(): Map<PieceId, LensPiece> {
    const out = new Map<PieceId, LensPiece>();
    for (const piece of this.source.values()) {
      out.set(piece.id, {
        id: piece.id,
        location: this.options.locationOf(piece.id),
        isEdge: piece.isEdge,
        isCorner: piece.isCorner,
        colourBin: this.binOf.get(piece.id) ?? -1,
        targetX: piece.targetX,
        targetY: piece.targetY,
        worldW: piece.worldW,
        worldH: piece.worldH,
      });
    }
    return out;
  }
}
