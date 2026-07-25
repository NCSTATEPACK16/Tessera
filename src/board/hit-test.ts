/**
 * Hit-testing — spatial hash over piece bounds, then point-in-outline (§03).
 *
 * Two decisions worth stating, because both are the reason pieces are canvas
 * rather than DOM:
 *
 * Never a full scan. At 250 pieces a linear scan per pointer-move is 250
 * point-in-path tests at 60fps while the finger is already doing work. The hash
 * buckets piece bounds into world-unit cells and a query touches the one cell
 * under the point.
 *
 * Never the bounding box. Piece boxes overlap heavily — a knob on one piece sits
 * inside its neighbour's box by design — so a box test picks the wrong piece
 * exactly where players grab, at the tabs. The outline is authoritative.
 *
 * The outline is a sampled polygon rather than a `Path2D`. It is deterministic,
 * testable without a canvas, and transferable, which keeps `Path2D` what
 * `geom.ts` already says it is: a drawing concern, built on the thread that
 * draws. At the sample density used here the error is far under a pixel at 4×
 * zoom, the most the camera allows.
 */

import type { CubicPath, Point } from '@/core/geom';
import { samplePath } from '@/core/geom';

export interface HitPiece {
  id: number;
  /** Bitmap origin in world space. */
  x: number;
  y: number;
  /** Bitmap extent in world units. */
  w: number;
  h: number;
  /** Radians, about the bitmap centre — the same convention the renderer draws with. */
  rot: number;
  /** Outline in world units, relative to the bitmap origin. Pairs of x,y. */
  poly: readonly number[];
  /**
   * Draw order. Higher wins when outlines overlap, so the most recently grabbed
   * piece is the one under the finger. Step 3's "Recent" lens reads the same
   * number.
   */
  pick: number;
}

/** Samples per curve segment. Sub-pixel at 4× zoom, which is the zoom ceiling. */
const SAMPLES_PER_SEGMENT = 10;

/**
 * Flatten a piece outline into world-unit polygon coordinates.
 *
 * `bitmapScale` is pixels per world unit, so this is also the step that gets the
 * bitmap out of the hit-test's vocabulary entirely — nothing downstream knows
 * what resolution the piece was rasterised at.
 */
export function polygonFromPath(
  path: CubicPath,
  bitmapScale: number,
  perSegment = SAMPLES_PER_SEGMENT,
): number[] {
  const points = samplePath(path, perSegment);
  const out: number[] = [];
  for (const p of points) {
    out.push(p.x / bitmapScale, p.y / bitmapScale);
  }
  return out;
}

/** Even-odd crossing test. Polygon is pairs of x,y, implicitly closed. */
export function pointInPolygon(poly: readonly number[], x: number, y: number): boolean {
  let inside = false;
  const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i * 2]!;
    const yi = poly[i * 2 + 1]!;
    const xj = poly[j * 2]!;
    const yj = poly[j * 2 + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export interface HitIndexOptions {
  /** Cell edge in world units. One piece width is the natural choice. */
  cellSize?: number;
}

export class HitIndex {
  private readonly cellSize: number;
  private readonly pieces = new Map<number, HitPiece>();
  private readonly cells = new Map<number, number[]>();
  /** Which cells each piece occupies, so a move can unbucket it cheaply. */
  private readonly occupied = new Map<number, number[]>();

  constructor(options: HitIndexOptions = {}) {
    this.cellSize = options.cellSize ?? 1;
  }

  rebuild(pieces: readonly HitPiece[]): void {
    this.pieces.clear();
    this.cells.clear();
    this.occupied.clear();
    for (const piece of pieces) this.update(piece);
  }

  /** Insert, or re-bucket a piece that has moved. Called per dragged piece. */
  update(piece: HitPiece): void {
    this.unbucket(piece.id);
    this.pieces.set(piece.id, piece);

    const keys: number[] = [];
    const b = rotatedBounds(piece);
    const minCol = Math.floor(b.minX / this.cellSize);
    const maxCol = Math.floor(b.maxX / this.cellSize);
    const minRow = Math.floor(b.minY / this.cellSize);
    const maxRow = Math.floor(b.maxY / this.cellSize);

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const key = cellKey(col, row);
        let bucket = this.cells.get(key);
        if (!bucket) {
          bucket = [];
          this.cells.set(key, bucket);
        }
        bucket.push(piece.id);
        keys.push(key);
      }
    }
    this.occupied.set(piece.id, keys);
  }

  remove(id: number): void {
    this.unbucket(id);
    this.pieces.delete(id);
  }

  get size(): number {
    return this.pieces.size;
  }

  /** Ids whose bounds touch the point's cell. The cheap half of a hit test. */
  candidatesAt(p: Point): number[] {
    const key = cellKey(Math.floor(p.x / this.cellSize), Math.floor(p.y / this.cellSize));
    return [...(this.cells.get(key) ?? [])];
  }

  /** The topmost piece whose outline contains the point, or null for bare mat. */
  pick(p: Point): HitPiece | null {
    const candidates = this.candidatesAt(p);
    if (candidates.length === 0) return null;

    let best: HitPiece | null = null;
    for (const id of candidates) {
      const piece = this.pieces.get(id);
      if (!piece) continue;
      if (best && (piece.pick < best.pick || (piece.pick === best.pick && piece.id < best.id))) {
        continue;
      }
      const local = toLocal(piece, p);
      if (pointInPolygon(piece.poly, local.x, local.y)) best = piece;
    }
    return best;
  }

  private unbucket(id: number): void {
    const keys = this.occupied.get(id);
    if (!keys) return;
    for (const key of keys) {
      const bucket = this.cells.get(key);
      if (!bucket) continue;
      const at = bucket.indexOf(id);
      if (at >= 0) bucket.splice(at, 1);
      if (bucket.length === 0) this.cells.delete(key);
    }
    this.occupied.delete(id);
  }
}

/**
 * World point → the piece's own frame, undoing the rotation about its centre.
 *
 * Rotation is applied about the bitmap centre because that is what the renderer
 * does; if the two ever disagree, pieces would be picked slightly off where they
 * are drawn, which reads as "the snap is inaccurate" rather than as a hit-test
 * bug.
 */
function toLocal(piece: HitPiece, p: Point): Point {
  const cx = piece.x + piece.w / 2;
  const cy = piece.y + piece.h / 2;
  const dx = p.x - cx;
  const dy = p.y - cy;

  if (piece.rot === 0) return { x: dx + piece.w / 2, y: dy + piece.h / 2 };

  const cos = Math.cos(piece.rot);
  const sin = Math.sin(piece.rot);
  return {
    x: dx * cos + dy * sin + piece.w / 2,
    y: -dx * sin + dy * cos + piece.h / 2,
  };
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Axis-aligned bounds of the piece box after rotation. Conservative on purpose. */
function rotatedBounds(piece: HitPiece): Bounds {
  if (piece.rot === 0) {
    return { minX: piece.x, minY: piece.y, maxX: piece.x + piece.w, maxY: piece.y + piece.h };
  }
  const cos = Math.abs(Math.cos(piece.rot));
  const sin = Math.abs(Math.sin(piece.rot));
  const w = piece.w * cos + piece.h * sin;
  const h = piece.w * sin + piece.h * cos;
  const cx = piece.x + piece.w / 2;
  const cy = piece.y + piece.h / 2;
  return { minX: cx - w / 2, minY: cy - h / 2, maxX: cx + w / 2, maxY: cy + h / 2 };
}

/**
 * Pack a signed cell coordinate pair into one number.
 *
 * A string key would allocate on every pointer-move; this is the same trick the
 * spatial hash uses in the hot path of every physics engine.
 */
function cellKey(col: number, row: number): number {
  return (col << 16) ^ (row & 0xffff);
}
