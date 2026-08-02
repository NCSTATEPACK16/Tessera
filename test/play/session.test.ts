/**
 * The play session — where the board, the snap, the settle and the scene meet.
 *
 * The decision this file is really testing: **the model is truth and the settle
 * is presentation.** A snapped cluster merges into the board immediately, and
 * what springs over the next ~120ms is a residual offset the renderer applies.
 * The alternative — merge when the animation ends — means a dropped frame or a
 * backgrounded tab can leave the board disagreeing with itself, and `interrupted`
 * is a first-class state here (§05), so that would happen in the field.
 *
 * The visible consequence is asserted in `keeps a settling piece off the static
 * layer`: placed-but-still-moving pieces draw on the dynamic layer, and arrive
 * on the static one only when they have stopped.
 */

import { describe, expect, it } from 'vitest';
import { BOARD_CLUSTER } from '@/board/board';
import { PlaySession } from '@/play/session';
import type { PlayEvent, SessionPiece } from '@/play/session';
import { buildNeighbourGraph, pieceIdAt } from '@/cut/graph';
import type { CubicPath, Rect } from '@/core/geom';

const COLS = 3;
const ROWS = 2;
const SCALE = 100;

/** A closed unit square, standing in for a real piece outline. */
const squarePath: CubicPath = {
  start: { x: 0, y: 0 },
  segments: [
    { c1: { x: 33, y: 0 }, c2: { x: 66, y: 0 }, to: { x: 100, y: 0 } },
    { c1: { x: 100, y: 33 }, c2: { x: 100, y: 66 }, to: { x: 100, y: 100 } },
    { c1: { x: 66, y: 100 }, c2: { x: 33, y: 100 }, to: { x: 0, y: 100 } },
    { c1: { x: 0, y: 66 }, c2: { x: 0, y: 33 }, to: { x: 0, y: 0 } },
  ],
};

function pieces(): SessionPiece[] {
  const bounds: Rect[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      bounds[pieceIdAt(COLS, col, row)] = { x: col * SCALE, y: row * SCALE, w: SCALE, h: SCALE };
    }
  }
  const graph = buildNeighbourGraph({ cols: COLS, rows: ROWS, bounds, scale: SCALE });

  return bounds.map((b, id) => ({
    id,
    targetX: b.x / SCALE,
    targetY: b.y / SCALE,
    worldW: 1,
    worldH: 1,
    neighbours: graph[id]!,
    path: squarePath,
    isEdge: true,
    // The session only ever passes the bitmap through to the scene.
    bitmap: null as unknown as ImageBitmap,
  }));
}

const id = (col: number, row: number): number => pieceIdAt(COLS, col, row);

function session(onEvent?: (event: PlayEvent) => void): PlaySession {
  const play = new PlaySession({
    pieces: pieces(),
    boardW: COLS,
    boardH: ROWS,
    pathScale: SCALE,
    // These tests are about the mat. The tray has its own file.
    startInTray: false,
    ...(onEvent ? { onEvent } : {}),
  });
  // Scatter, so only the adjacency a test sets up is ever in range.
  for (const piece of play.board.pieces) {
    play.board.moveCluster(play.board.clusterIdOf(piece.id), 50 + piece.id * 4, 50);
  }
  play.rebuild();
  return play;
}

/** Put a piece on the board, and let the session catch up. */
function place(play: PlaySession, pieceId: number): void {
  play.board.merge(play.board.clusterIdOf(pieceId), BOARD_CLUSTER);
  play.rebuild();
}

/** Run every settle to a stop. */
function settle(play: PlaySession): void {
  for (let i = 0; i < 200 && play.animating; i++) play.advance(1000 / 60);
}

describe('scene composition', () => {
  it('separates the board, the mat, and the hand', () => {
    const play = session();
    place(play, id(0, 0));
    const cluster = play.board.clusterIdOf(id(1, 0));
    play.grab(cluster);

    const scene = play.scene();
    expect(scene.placed.map((p) => p.id)).toEqual([id(0, 0)]);
    expect(scene.held.map((p) => p.id)).toEqual([id(1, 0)]);
    expect(scene.loose.some((p) => p.id === id(1, 0))).toBe(false);
    expect(scene.loose.some((p) => p.id === id(2, 0))).toBe(true);
  });

  it('lifts the held cluster above the finger, never under it (§05)', () => {
    const play = session();
    play.grab(play.board.clusterIdOf(id(1, 0)));
    const scene = play.scene();

    expect(scene.heldLift.offsetPx).toBe(8);
    expect(scene.heldLift.scale).toBeCloseTo(1.06, 10);
  });

  it('draws a piece where the board says it is', () => {
    const play = session();
    play.board.moveCluster(play.board.clusterIdOf(id(2, 1)), 4, 5);
    const piece = play.scene().loose.find((p) => p.id === id(2, 1))!;
    expect(piece.x).toBe(4);
    expect(piece.y).toBe(5);
    expect(piece.rot).toBe(0);
  });

  it('names X-Ray candidate sockets only while a cluster is held (§07)', () => {
    const play = session();
    place(play, id(0, 0));
    expect(play.scene().xray).toBeNull();

    play.grab(play.board.clusterIdOf(id(1, 0)));
    expect(play.scene().xray).toEqual(new Set([id(0, 0)]));
  });
});

describe('release', () => {
  it('merges immediately — the model does not wait for the animation', () => {
    const play = session();
    place(play, id(0, 0));
    const cluster = play.board.clusterIdOf(id(1, 0));
    play.board.moveCluster(cluster, 1.1, 0.05);

    play.release(cluster, { x: 0, y: 0 });

    expect(play.board.isPlaced(id(1, 0))).toBe(true);
    expect(play.board.worldOf(id(1, 0))).toEqual({ x: 1, y: 0 });
  });

  it('keeps a settling piece off the static layer until it stops', () => {
    const play = session();
    place(play, id(0, 0));
    const cluster = play.board.clusterIdOf(id(1, 0));
    play.board.moveCluster(cluster, 1.1, 0.05);
    play.release(cluster, { x: 0, y: 0 });

    const during = play.scene();
    expect(during.placed.map((p) => p.id)).toEqual([id(0, 0)]);
    expect(during.loose.some((p) => p.id === id(1, 0))).toBe(true);
    // ...and it is drawn short of its slot, which is the whole point.
    expect(during.loose.find((p) => p.id === id(1, 0))!.x).not.toBe(1);

    settle(play);

    const after = play.scene();
    expect(after.placed.map((p) => p.id).sort()).toEqual([id(0, 0), id(1, 0)].sort());
    expect(after.loose.some((p) => p.id === id(1, 0))).toBe(false);
  });

  it('comes to rest exactly on the slot', () => {
    const play = session();
    place(play, id(0, 0));
    const cluster = play.board.clusterIdOf(id(1, 0));
    play.board.moveCluster(cluster, 1.1, 0.05);
    play.release(cluster, { x: 0, y: 0 });
    settle(play);

    const piece = play.scene().placed.find((p) => p.id === id(1, 0))!;
    expect(piece.x).toBe(1);
    expect(piece.y).toBe(0);
  });

  it('leaves a missed drop exactly where it was dropped', () => {
    const play = session();
    place(play, id(0, 0));
    const cluster = play.board.clusterIdOf(id(1, 0));
    play.board.moveCluster(cluster, 2.4, 3.7);

    play.release(cluster, { x: 0, y: 0 });

    expect(play.board.isPlaced(id(1, 0))).toBe(false);
    expect(play.scene().loose.find((p) => p.id === id(1, 0))!.x).toBe(2.4);
    expect(play.animating).toBe(false);
  });

  it('stops animating once everything has settled', () => {
    const play = session();
    place(play, id(0, 0));
    const cluster = play.board.clusterIdOf(id(1, 0));
    play.board.moveCluster(cluster, 1.1, 0);
    play.release(cluster, { x: 0, y: 0 });

    expect(play.animating).toBe(true);
    settle(play);
    expect(play.animating).toBe(false);
  });
});

describe('events', () => {
  it('reports a snap, with the size the merge chord is voiced by', () => {
    const events: PlayEvent[] = [];
    const play = session((event) => events.push(event));
    place(play, id(0, 0));
    const cluster = play.board.clusterIdOf(id(1, 0));
    play.board.moveCluster(cluster, 1.05, 0);
    play.release(cluster, { x: 0, y: 0 });

    const snap = events.find((e) => e.type === 'snap')!;
    expect(snap).toMatchObject({ type: 'snap', placed: true, mergedSize: 2 });
  });

  it('carries a seam rect when the snap resolved against a real neighbour (§07)', () => {
    const events: PlayEvent[] = [];
    const play = session((event) => events.push(event));
    place(play, id(0, 0));
    const cluster = play.board.clusterIdOf(id(1, 0));
    play.board.moveCluster(cluster, 1.05, 0);
    play.release(cluster, { x: 0, y: 0 });

    const snap = events.find((e) => e.type === 'snap')!;
    expect(snap).toMatchObject({ type: 'snap' });
    if (snap.type !== 'snap') throw new Error('unreachable');
    expect(snap.seam).not.toBeNull();
    expect(snap.seam!.w).toBeGreaterThan(0);
    expect(snap.seam!.h).toBeGreaterThan(0);
  });

  it('carries no seam when the first piece resolves against the board frame itself', () => {
    // The board-frame exception (§05) has no neighbour piece to draw a seam
    // between — it is the one absolute-position test in the codebase, and it
    // fires only because cluster 0 starts empty.
    const events: PlayEvent[] = [];
    const play = session((event) => events.push(event));
    const cluster = play.board.clusterIdOf(id(0, 0));
    play.board.moveCluster(cluster, 0.02, 0);
    play.release(cluster, { x: 0, y: 0 });

    const snap = events.find((e) => e.type === 'snap')!;
    expect(snap).toMatchObject({ type: 'snap', placed: true });
    if (snap.type !== 'snap') throw new Error('unreachable');
    expect(snap.seam).toBeNull();
  });

  it('reports a miss, which is what resets the pitch ladder', () => {
    const events: PlayEvent[] = [];
    const play = session((event) => events.push(event));
    const cluster = play.board.clusterIdOf(id(1, 0));
    play.board.moveCluster(cluster, 30, 30);
    play.release(cluster, { x: 0, y: 0 });

    expect(events.map((e) => e.type)).toEqual(['miss']);
  });

  it('announces the grab', () => {
    const events: PlayEvent[] = [];
    const play = session((event) => events.push(event));
    play.grab(play.board.clusterIdOf(id(1, 0)));
    expect(events[0]).toMatchObject({ type: 'grab' });
  });

  it('announces completion exactly once, when the last piece lands', () => {
    const events: PlayEvent[] = [];
    const play = session((event) => events.push(event));
    for (const piece of [...play.board.pieces]) {
      const cluster = play.board.clusterIdOf(piece.id);
      if (cluster === BOARD_CLUSTER) continue;
      play.board.moveCluster(cluster, piece.targetX, piece.targetY);
      play.release(cluster, { x: 0, y: 0 });
    }

    expect(play.board.isComplete).toBe(true);
    expect(events.filter((e) => e.type === 'complete')).toHaveLength(1);
  });
});

describe('hit-testing', () => {
  it('picks a loose piece under the point', () => {
    const play = session();
    play.board.moveCluster(play.board.clusterIdOf(id(2, 1)), 4, 5);
    play.rebuild();
    expect(play.pickCluster({ x: 4.5, y: 5.5 })).toBe(play.board.clusterIdOf(id(2, 1)));
  });

  it('picks nothing on a placed piece, so a finger on the board pans', () => {
    // The board is anchored; one finger on it means camera, not a stuck drag.
    const play = session();
    place(play, id(0, 0));
    expect(play.pickCluster({ x: 0.5, y: 0.5 })).toBeNull();
  });

  it('follows a piece as it is dragged', () => {
    const play = session();
    const cluster = play.board.clusterIdOf(id(1, 0));
    play.board.moveCluster(cluster, 4, 4);
    play.dragBy(cluster, 3, 0);

    expect(play.pickCluster({ x: 7.5, y: 4.5 })).toBe(cluster);
    expect(play.pickCluster({ x: 4.5, y: 4.5 })).toBeNull();
  });
});

describe('the path scale guard', () => {
  // The outline arrives in *image* pixels and the world is measured in piece
  // widths, so the conversion between them is a number that has to be carried
  // correctly through three files. Get it wrong and the polygons come out tens
  // of times too large, sitting off the corner of the pieces they describe —
  // and the only symptom is that nothing on the board can be picked up, with no
  // error anywhere. That silence is what this guard exists to break.
  const options = {
    pieces: pieces(),
    boardW: COLS,
    boardH: ROWS,
    pathScale: SCALE,
  };

  it('accepts a scale that matches the pieces', () => {
    expect(() => new PlaySession(options)).not.toThrow();
  });

  it('rejects a device pixel ratio passed where the outline scale belongs', () => {
    expect(() => new PlaySession({ ...options, pathScale: 2 })).toThrow(/pathScale/);
  });

  it('rejects a scale that shrinks the outline to nothing', () => {
    expect(() => new PlaySession({ ...options, pathScale: SCALE * 50 })).toThrow(/pathScale/);
  });
});

describe('contentBounds', () => {
  it('covers the board and every loose piece, so the opening view shows both', () => {
    // Fitting the board alone would open on an empty frame with every piece
    // off-screen, because a fresh board has all of them out on the mat.
    const play = session();
    play.board.moveCluster(play.board.clusterIdOf(id(0, 0)), -6, -4);
    play.board.moveCluster(play.board.clusterIdOf(id(2, 1)), 9, 7);

    const bounds = play.contentBounds();
    expect(bounds.x).toBeLessThanOrEqual(-6);
    expect(bounds.y).toBeLessThanOrEqual(-4);
    expect(bounds.x + bounds.w).toBeGreaterThanOrEqual(10);
    expect(bounds.y + bounds.h).toBeGreaterThanOrEqual(8);
  });

  it('never reports less than the board itself', () => {
    const play = session();
    for (const piece of play.board.pieces) {
      play.board.moveCluster(play.board.clusterIdOf(piece.id), 1, 1);
    }
    const bounds = play.contentBounds();
    expect(bounds.x).toBeLessThanOrEqual(0);
    expect(bounds.y).toBeLessThanOrEqual(0);
    expect(bounds.x + bounds.w).toBeGreaterThanOrEqual(COLS);
    expect(bounds.y + bounds.h).toBeGreaterThanOrEqual(ROWS);
  });
});

describe('progress', () => {
  it('reports completion as a fraction, for the bloom and the HUD', () => {
    const play = session();
    expect(play.summary.completion).toBe(0);
    place(play, id(0, 0));
    expect(play.summary.completion).toBeCloseTo(1 / (COLS * ROWS), 10);
    expect(play.summary.placed).toBe(1);
    expect(play.summary.total).toBe(COLS * ROWS);
  });
});

describe('elapsedMs', () => {
  it('measures from the start timestamp passed at construction', () => {
    const play = new PlaySession({
      pieces: pieces(),
      boardW: COLS,
      boardH: ROWS,
      pathScale: SCALE,
      startInTray: false,
      startedAtMs: 1000,
    });

    expect(play.elapsedMs(1000)).toBe(0);
    expect(play.elapsedMs(6500)).toBe(5500);
  });

  it('never goes negative, for a clock read before the recorded start', () => {
    const play = session();
    expect(play.elapsedMs(-100)).toBe(0);
  });
});

describe('useHint (§07)', () => {
  it('tier 1 is free, unlimited, moves nothing, and only announces itself', () => {
    const events: PlayEvent[] = [];
    const play = session((event) => events.push(event));

    const ok = play.useHint(id(1, 0), 1, 'classic', 0);

    expect(ok).toBe(true);
    expect(play.summary.hintsUsed).toBe(0);
    expect(events).toEqual([{ type: 'hint', tier: 1 }]);
    // Still scattered — a hint at tier 1 never touches the model.
    expect(play.board.isPlaced(id(1, 0))).toBe(false);
  });

  it('tier 2 costs 1 and announces itself, but still moves nothing', () => {
    const play = session();
    const ok = play.useHint(id(1, 0), 2, 'classic', 0);

    expect(ok).toBe(true);
    expect(play.summary.hintsUsed).toBe(1);
    expect(play.board.isPlaced(id(1, 0))).toBe(false);
  });

  it('tier 3 costs 2 (not 1+2) and auto-places with the real snap path', () => {
    const events: PlayEvent[] = [];
    const play = session((event) => events.push(event));

    const ok = play.useHint(id(1, 0), 3, 'classic', 0);

    expect(ok).toBe(true);
    expect(play.summary.hintsUsed).toBe(2);
    expect(play.board.isPlaced(id(1, 0))).toBe(true);
    // The same `release()` path a real drop takes: a 'snap' event, not a
    // diminished stand-in.
    expect(events.some((e) => e.type === 'snap')).toBe(true);
    expect(events.some((e) => e.type === 'hint' && e.tier === 3)).toBe(true);
  });

  it('tier 3 places a piece still in the tray, not only ones already on the mat', () => {
    const play = new PlaySession({
      pieces: pieces(),
      boardW: COLS,
      boardH: ROWS,
      pathScale: SCALE,
      // Default startInTray: true.
    });

    play.useHint(id(0, 1), 3, 'classic', 0);

    expect(play.board.isPlaced(id(0, 1))).toBe(true);
    expect(play.locationOf(id(0, 1))).toBe('placed');
  });

  it('refuses a tier the economy cannot afford, and spends nothing', () => {
    const play = session();
    // 3 hints available in Classic at t=0; tier 3 costs 2, so two tier-3
    // hints in a row is 4 — the second must be refused.
    expect(play.useHint(id(1, 0), 3, 'classic', 0)).toBe(true);
    const before = play.summary.hintsUsed;

    const ok = play.useHint(id(2, 0), 3, 'classic', 0);

    expect(ok).toBe(false);
    expect(play.summary.hintsUsed).toBe(before);
    expect(play.board.isPlaced(id(2, 0))).toBe(false);
  });

  it('never spends in Zen, however many tier-3 hints fire', () => {
    const play = session();
    play.useHint(id(1, 0), 3, 'zen', 0);
    play.useHint(id(2, 0), 3, 'zen', 0);

    expect(play.summary.hintsUsed).toBe(0);
    expect(play.board.isPlaced(id(1, 0))).toBe(true);
    expect(play.board.isPlaced(id(2, 0))).toBe(true);
  });

  it('a puzzle finished with any hint used is not a clean run (§15)', () => {
    const play = session();
    expect(play.summary.hintsUsed).toBe(0);
    play.useHint(id(1, 0), 2, 'classic', 0);
    expect(play.summary.hintsUsed).toBeGreaterThan(0);
  });
});
