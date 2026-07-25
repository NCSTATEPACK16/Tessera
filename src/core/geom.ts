/**
 * Geometry primitives and the three coordinate spaces.
 *
 * Conflating spaces is where snap-tolerance bugs come from, so they are named:
 *
 *   image  — source pixels, after EXIF rotation and downscale to max 2560px.
 *            The cutter reads this space and nothing else does.
 *   world  — the mat. Origin at the board's top-left, unit = one piece width.
 *            All piece positions, all cluster transforms, and — critically —
 *            all snap tolerance live here, so zoom never changes difficulty.
 *   screen — CSS pixels after the camera transform. Only the renderer and the
 *            hit-test entry point know this space exists.
 *
 * `Camera` is the only world→screen mapping in the codebase. Nothing else converts.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A cubic Bézier segment, stated by its three trailing control points. */
export interface CubicSegment {
  c1: Point;
  c2: Point;
  to: Point;
}

/**
 * A path as a start point plus a chain of cubic segments.
 *
 * Deliberately plain data rather than a `Path2D`: it is structurally
 * reversible, comparable in tests, and transferable out of a worker. `Path2D`
 * is built from it at the last possible moment, on the thread that draws.
 */
export interface CubicPath {
  start: Point;
  segments: CubicSegment[];
}

export function reversePoint(p: Point): Point {
  return { x: p.x, y: p.y };
}

/**
 * Reverse a cubic path exactly.
 *
 * This is what guarantees interlock. An interior edge is generated once in a
 * canonical direction; the piece that traverses it the other way gets this
 * exact reversal, so the two outlines coincide to the last float rather than
 * merely appearing to (design doc §04, step 3).
 */
export function reverseCubicPath(path: CubicPath): CubicPath {
  const segments: CubicSegment[] = [];
  let cursor = path.start;

  // Walk forward collecting each segment's true start, then emit backwards with
  // the control points swapped.
  const starts: Point[] = [];
  for (const seg of path.segments) {
    starts.push(cursor);
    cursor = seg.to;
  }

  for (let i = path.segments.length - 1; i >= 0; i--) {
    const seg = path.segments[i]!;
    segments.push({ c1: seg.c2, c2: seg.c1, to: starts[i]! });
  }

  return { start: cursor, segments };
}

/** Evaluate a cubic Bézier at t. */
export function cubicAt(p0: Point, c1: Point, c2: Point, p1: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p1.y,
  };
}

/** Sample a whole path at `perSegment` points per segment, endpoints included. */
export function samplePath(path: CubicPath, perSegment = 16): Point[] {
  const out: Point[] = [path.start];
  let cursor = path.start;
  for (const seg of path.segments) {
    for (let i = 1; i <= perSegment; i++) {
      out.push(cubicAt(cursor, seg.c1, seg.c2, seg.to, i / perSegment));
    }
    cursor = seg.to;
  }
  return out;
}

/**
 * Exact bounding box of a path.
 *
 * Solved rather than sampled. Sampling under-reports — a finer sample always
 * finds a point outside a coarser sample's box — and these bounds size the
 * piece bitmap, so under-reporting clips the tip of a knob. Bleed would usually
 * hide that, which is exactly what makes it a bad bug to have.
 *
 * A cubic's extrema are the roots of its derivative, a quadratic per axis, so
 * the exact answer is cheaper than sampling as well as correct.
 */
export function pathBounds(path: CubicPath): Rect {
  let minX = path.start.x;
  let minY = path.start.y;
  let maxX = path.start.x;
  let maxY = path.start.y;

  const include = (x: number, y: number): void => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  let cursor = path.start;
  for (const seg of path.segments) {
    include(seg.to.x, seg.to.y);
    for (const t of cubicExtrema(cursor.x, seg.c1.x, seg.c2.x, seg.to.x)) {
      const p = cubicAt(cursor, seg.c1, seg.c2, seg.to, t);
      include(p.x, p.y);
    }
    for (const t of cubicExtrema(cursor.y, seg.c1.y, seg.c2.y, seg.to.y)) {
      const p = cubicAt(cursor, seg.c1, seg.c2, seg.to, t);
      include(p.x, p.y);
    }
    cursor = seg.to;
  }

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Parameters in (0, 1) where a cubic's derivative vanishes, on one axis.
 *
 * With A = c1-p0, B = c2-c1, C = p1-c2, the derivative is proportional to
 * (A - 2B + C)t² + 2(B - A)t + A.
 */
function cubicExtrema(p0: number, c1: number, c2: number, p1: number): number[] {
  const a = c1 - p0;
  const b = c2 - c1;
  const c = p1 - c2;

  const qa = a - 2 * b + c;
  const qb = 2 * (b - a);
  const qc = a;

  const roots: number[] = [];
  const keep = (t: number): void => {
    if (Number.isFinite(t) && t > 0 && t < 1) roots.push(t);
  };

  if (Math.abs(qa) < 1e-12) {
    // Degenerates to linear.
    if (Math.abs(qb) > 1e-12) keep(-qc / qb);
    return roots;
  }

  const disc = qb * qb - 4 * qa * qc;
  if (disc < 0) return roots;

  const root = Math.sqrt(disc);
  keep((-qb + root) / (2 * qa));
  keep((-qb - root) / (2 * qa));
  return roots;
}

/** Concatenate paths that already share endpoints, into one closed outline. */
export function joinPaths(paths: CubicPath[]): CubicPath {
  if (paths.length === 0) throw new Error('joinPaths: nothing to join');
  const first = paths[0]!;
  const segments: CubicSegment[] = [...first.segments];
  for (let i = 1; i < paths.length; i++) {
    segments.push(...paths[i]!.segments);
  }
  return { start: first.start, segments };
}

export function toPath2D(path: CubicPath): Path2D {
  const p = new Path2D();
  p.moveTo(path.start.x, path.start.y);
  for (const seg of path.segments) {
    p.bezierCurveTo(seg.c1.x, seg.c1.y, seg.c2.x, seg.c2.y, seg.to.x, seg.to.y);
  }
  p.closePath();
  return p;
}

export function translatePath(path: CubicPath, dx: number, dy: number): CubicPath {
  const move = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });
  return {
    start: move(path.start),
    segments: path.segments.map((s) => ({ c1: move(s.c1), c2: move(s.c2), to: move(s.to) })),
  };
}
