/**
 * Step 3 of the cut — draw the edges (design doc §04).
 *
 * "Each interior edge between two vertices is generated once and shared by the
 * two pieces that meet on it — one gets it as drawn, the other as its exact
 * reverse. This is what guarantees pieces physically interlock rather than
 * merely appearing to."
 *
 * The cut-style system is this one signature. Classic ships in MVP; Ribbon,
 * Organic, and Geometric are later implementations of `EdgeStyle` and touch
 * nothing else in the codebase. The interface exists now, with one
 * implementation behind it, exactly as §04 instructs.
 *
 * Deviation from the doc, deliberate: the signature returns a `CubicPath`
 * (plain data) rather than a `Path2D`. Plain data is structurally reversible,
 * comparable in tests, and transferable across the worker boundary; `Path2D` is
 * built from it on the thread that actually draws.
 */

import type { CubicPath, CubicSegment, Point } from '@/core/geom';
import type { Rng } from '@/core/rng';

/** Which side of the edge the knob protrudes toward. */
export type Polarity = 1 | -1;

export interface EdgeStyle {
  readonly id: string;
  /**
   * Generate the edge from `a` to `b`. The knob protrudes toward
   * `polarity × perpendicular(b - a)`.
   */
  edgePath(a: Point, b: Point, polarity: Polarity, rng: Rng): CubicPath;
}

// ---------------------------------------------------------------------------
// Classic tab geometry, in normalised edge space (0,0) → (1,0).
//
// u runs along the edge, v is perpendicular. Both are scaled by the edge vector
// on transform, so protrusion is automatically a fraction of edge length and
// short edges get proportionally smaller knobs — which is what keeps a jittered
// lattice from producing knobs that overwhelm their own piece.
// ---------------------------------------------------------------------------

/** Knob centre along the edge, before jitter. */
const KNOB_CENTRE = 0.5;
/** Knob centre jitter, ± this much. */
const KNOB_CENTRE_JITTER = 0.06;
/** Full neck width. */
const NECK_WIDTH = 0.2;
/** Head radius. Wider than the neck — that difference is the interlock. */
const HEAD_RADIUS = 0.14;
/** Protrusion as a fraction of edge length. */
const PROTRUSION = 0.22;
/** Protrusion jitter, ± this fraction of itself. */
const PROTRUSION_JITTER = 0.1;

/** How far the head's tangent points sit either side of centre. */
const HEAD_TANGENT = HEAD_RADIUS * 0.62;
/** How far the flare control points reach — this is what cuts the undercut. */
const HEAD_FLARE = HEAD_RADIUS * 1.25;
/** Depth of the small dip either side of the neck. Reads as hand-cut. */
const SHOULDER_DIP = 0.05;

export const classicEdgeStyle: EdgeStyle = {
  id: 'classic',

  edgePath(a, b, polarity, rng) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;

    // Transform normalised (u, v) onto the real edge. perp = (-dy, dx), so v is
    // measured in units of edge length without ever computing a square root.
    const at = (u: number, v: number): Point => ({
      x: a.x + dx * u - dy * v,
      y: a.y + dy * u + dx * v,
    });

    const tc = KNOB_CENTRE + rng.jitter(KNOB_CENTRE_JITTER);
    const nw = NECK_WIDTH / 2;
    const h = PROTRUSION * (1 + rng.jitter(PROTRUSION_JITTER)) * polarity;

    const neckL = tc - nw;
    const neckR = tc + nw;

    const segments: CubicSegment[] = [
      // Approach the left shoulder, dipping slightly under the line.
      {
        c1: at(neckL * 0.35, h * 0.03),
        c2: at(neckL - 0.08, -h * SHOULDER_DIP),
        to: at(neckL, 0),
      },
      // Rise up the left neck, flaring past it to cut the undercut.
      {
        c1: at(neckL - 0.02, h * 0.2),
        c2: at(tc - HEAD_FLARE, h * 0.45),
        to: at(tc - HEAD_TANGENT, h * 0.85),
      },
      // Over the head.
      {
        c1: at(tc - HEAD_TANGENT * 1.15, h * 1.24),
        c2: at(tc + HEAD_TANGENT * 1.15, h * 1.24),
        to: at(tc + HEAD_TANGENT, h * 0.85),
      },
      // Down the right neck, mirroring the flare.
      {
        c1: at(tc + HEAD_FLARE, h * 0.45),
        c2: at(neckR + 0.02, h * 0.2),
        to: at(neckR, 0),
      },
      // Depart the right shoulder.
      {
        c1: at(neckR + 0.08, -h * SHOULDER_DIP),
        c2: at(neckR + (1 - neckR) * 0.65, h * 0.03),
        to: at(1, 0),
      },
    ];

    return { start: at(0, 0), segments };
  },
};

/**
 * A boundary edge — the outer frame of the puzzle. Always a straight line, so
 * the assembled result is a true rectangle and edge pieces really do have a
 * flat side (design doc §04, step 3).
 *
 * Expressed as a single cubic with collinear controls so every edge in the
 * system has the same shape of data, and the piece outline never needs to know
 * which of its sides are boundaries.
 */
export function straightEdge(a: Point, b: Point): CubicPath {
  const lerp = (t: number): Point => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  return {
    start: { x: a.x, y: a.y },
    segments: [{ c1: lerp(1 / 3), c2: lerp(2 / 3), to: { x: b.x, y: b.y } }],
  };
}

export const cutStyles: Record<string, EdgeStyle> = {
  classic: classicEdgeStyle,
};

export function resolveCutStyle(id: string): EdgeStyle {
  const style = cutStyles[id];
  if (!style) {
    throw new Error(`unknown cut style "${id}" (have: ${Object.keys(cutStyles).join(', ')})`);
  }
  return style;
}
