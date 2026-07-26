/**
 * End to end, minus the DOM: finger down, drag, release, placed.
 *
 * Every layer here is tested on its own — hit index, pointer machine, snap,
 * settle, session. This is the one that asserts they are wired to each other the
 * way `BoardControls` wires them, because that wiring is where a coordinate
 * space gets dropped and every unit test still passes.
 *
 * The camera is deliberately at 100 screen pixels per world unit, so a piece is
 * 100px across on screen and 1 unit across in the model. Any place the two are
 * confused shows up as a factor of a hundred rather than as a subtle drift.
 */

import { describe, expect, it } from 'vitest';
import { screenToWorld } from '@/render/camera';
import type { Camera } from '@/render/camera';
import { PointerMachine } from '@/input/pointer';
import { LIFT_PX, PlaySession } from '@/play/session';
import type { SessionPiece } from '@/play/session';
import { buildNeighbourGraph, pieceIdAt } from '@/cut/graph';
import type { CubicPath, Rect } from '@/core/geom';

const COLS = 3;
const ROWS = 2;
const SCALE = 100;
const VIEWPORT = { w: 800, h: 600 };

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
    bitmap: null as unknown as ImageBitmap,
  }));
}

const id = (col: number, row: number): number => pieceIdAt(COLS, col, row);

/** The board, a camera, and a pointer machine wired as `BoardControls` wires them. */
function table() {
  const camera: Camera = { x: COLS / 2, y: ROWS / 2, zoom: SCALE };
  const session = new PlaySession({
    pieces: pieces(),
    boardW: COLS,
    boardH: ROWS,
    pathScale: SCALE,
  });

  // Scatter well clear of the board, as a real session opens.
  for (const piece of session.board.pieces) {
    session.board.moveCluster(session.board.clusterIdOf(piece.id), -4 + piece.id * 1.4, -3);
  }
  session.rebuild();

  const machine = new PointerMachine({
    toWorld: (p) => screenToWorld(camera, VIEWPORT, p),
    pickCluster: (world) => session.pickCluster(world),
    onGrab: (event) => session.grab(event.clusterId),
    onDragTo: (event) => session.dragBy(event.clusterId, event.dx, event.dy),
    onRelease: (event) =>
      session.release(event.clusterId, event.velocity, LIFT_PX / camera.zoom),
    onCameraBegin: () => {},
    onCameraEnd: () => {},
  });

  /** World point → screen pixels, the inverse of what the machine is given. */
  const toScreen = (x: number, y: number) => ({
    x: (x - camera.x) * camera.zoom + VIEWPORT.w / 2,
    y: (y - camera.y) * camera.zoom + VIEWPORT.h / 2,
  });

  const settle = (): void => {
    for (let i = 0; i < 300 && session.animating; i++) session.advance(1000 / 60);
  };

  return { session, machine, toScreen, settle };
}

/** Press on a world point, drag to another, and let go. */
function dragBetween(
  t: ReturnType<typeof table>,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 6,
): void {
  const a = t.toScreen(from.x, from.y);
  const b = t.toScreen(to.x, to.y);
  t.machine.down({ id: 1, x: a.x, y: a.y, t: 0 });
  for (let i = 1; i <= steps; i++) {
    t.machine.move({
      id: 1,
      x: a.x + ((b.x - a.x) * i) / steps,
      y: a.y + ((b.y - a.y) * i) / steps,
      t: i * 16,
    });
  }
  t.machine.up({ id: 1, x: b.x, y: b.y, t: (steps + 1) * 16 });
}

describe('a piece from the mat to the board', () => {
  it('places it, and lands it on the exact slot', () => {
    const t = table();
    const piece = t.session.board.piece(id(1, 0));
    const start = t.session.board.worldOf(piece.id);

    // Grab the middle of the piece, drop it a little short of its slot.
    dragBetween(
      t,
      { x: start.x + 0.5, y: start.y + 0.5 },
      { x: piece.targetX + 0.5 + 0.08, y: piece.targetY + 0.5 - 0.05 },
    );

    expect(t.session.board.isPlaced(piece.id)).toBe(true);
    t.settle();
    expect(t.session.board.worldOf(piece.id)).toEqual({ x: 1, y: 0 });
  });

  it('springs from where it was dropped rather than teleporting', () => {
    const t = table();
    const piece = t.session.board.piece(id(1, 0));
    const start = t.session.board.worldOf(piece.id);

    dragBetween(
      t,
      { x: start.x + 0.5, y: start.y + 0.5 },
      { x: piece.targetX + 0.5 + 0.1, y: piece.targetY + 0.5 },
    );

    // Placed in the model, still short of the slot on screen.
    const drawn = t.session.scene().loose.find((p) => p.id === piece.id)!;
    expect(drawn.x).toBeGreaterThan(1);
    expect(t.session.animating).toBe(true);
  });

  it('leaves a piece dropped outside tolerance exactly where it fell', () => {
    const t = table();
    const piece = t.session.board.piece(id(1, 0));
    const start = t.session.board.worldOf(piece.id);
    const missBy = 0.55;

    dragBetween(
      t,
      { x: start.x + 0.5, y: start.y + 0.5 },
      { x: piece.targetX + 0.5 + missBy, y: piece.targetY + 0.5 },
    );
    t.settle();

    expect(t.session.board.isPlaced(piece.id)).toBe(false);
    expect(t.session.board.worldOf(piece.id).x).toBeCloseTo(piece.targetX + missBy, 6);
  });

  it('joins two pieces into an island that then drags as one', () => {
    const t = table();
    const left = t.session.board.piece(id(0, 0));
    const right = t.session.board.piece(id(1, 0));

    // Bring the right-hand piece up against the left-hand one, out on the mat.
    const leftWorld = t.session.board.worldOf(left.id);
    const rightWorld = t.session.board.worldOf(right.id);
    dragBetween(
      t,
      { x: rightWorld.x + 0.5, y: rightWorld.y + 0.5 },
      { x: leftWorld.x + 1.5 + 0.06, y: leftWorld.y + 0.5 + 0.04 },
    );
    t.settle();

    const island = t.session.board.clusterIdOf(left.id);
    expect(t.session.board.clusterIdOf(right.id)).toBe(island);

    // Now drag the island by its left-hand piece; both must move together.
    const before = t.session.board.worldOf(right.id);
    const grabAt = t.session.board.worldOf(left.id);
    dragBetween(
      t,
      { x: grabAt.x + 0.5, y: grabAt.y + 0.5 },
      { x: grabAt.x + 0.5 + 2, y: grabAt.y + 0.5 + 1 },
    );
    t.settle();

    const after = t.session.board.worldOf(right.id);
    expect(after.x).toBeCloseTo(before.x + 2, 6);
    expect(after.y).toBeCloseTo(before.y + 1, 6);
  });
});

describe('what a finger on the board does', () => {
  it('pans rather than dragging, once a piece is placed there', () => {
    const t = table();
    const piece = t.session.board.piece(id(1, 0));
    t.session.board.moveCluster(t.session.board.clusterIdOf(piece.id), 1, 0);
    t.session.release(t.session.board.clusterIdOf(piece.id), { x: 0, y: 0 });
    t.settle();

    const centre = t.toScreen(1.5, 0.5);
    t.machine.down({ id: 1, x: centre.x, y: centre.y, t: 0 });
    t.machine.move({ id: 1, x: centre.x + 40, y: centre.y, t: 16 });

    expect(t.machine.phase).toBe('camera');
    expect(t.session.board.worldOf(piece.id)).toEqual({ x: 1, y: 0 });
  });

  it('lets go of a piece the moment a second finger lands, unplaced', () => {
    const t = table();
    const piece = t.session.board.piece(id(1, 0));
    const start = t.session.board.worldOf(piece.id);
    const a = t.toScreen(start.x + 0.5, start.y + 0.5);

    t.machine.down({ id: 1, x: a.x, y: a.y, t: 0 });
    t.machine.move({ id: 1, x: a.x + 40, y: a.y, t: 16 });
    const held = t.session.board.worldOf(piece.id);

    t.machine.down({ id: 2, x: a.x + 200, y: a.y, t: 24 });

    expect(t.machine.phase).toBe('camera');
    expect(t.session.heldCluster).toBeNull();
    expect(t.session.board.worldOf(piece.id)).toEqual(held);
  });
});
