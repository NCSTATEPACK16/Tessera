/**
 * The tray boundary (§06) — "the tray is home; the mat is where you work."
 *
 * The load-bearing test is `a full tray draws nothing`. A tray piece's cluster
 * has never been moved, so it is sitting exactly on its own slot; if it ever
 * leaks into the scene, the board renders itself solved on the first frame with
 * no error raised anywhere. Every other assertion here is ordinary, and that one
 * is the reason the file exists.
 */

import { describe, expect, it } from 'vitest';
import { BOARD_CLUSTER } from '@/board/board';
import { PlaySession } from '@/play/session';
import type { PlayEvent, SessionPiece } from '@/play/session';
import { buildNeighbourGraph, pieceIdAt } from '@/cut/graph';
import type { CubicPath, Rect } from '@/core/geom';
import { WORKSET_DROP_TOLERANCE } from '@/play/workset';

const COLS = 3;
const ROWS = 2;
const SCALE = 100;

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

function session(onEvent?: (event: PlayEvent) => void): PlaySession {
  return new PlaySession({
    pieces: pieces(),
    boardW: COLS,
    boardH: ROWS,
    pathScale: SCALE,
    ...(onEvent ? { onEvent } : {}),
  });
}

const id = (col: number, row: number): number => pieceIdAt(COLS, col, row);

describe('the tray boundary', () => {
  it('starts every piece in the tray', () => {
    const play = session();
    expect(play.trayCount).toBe(COLS * ROWS);
    for (const piece of play.board.pieces) expect(play.locationOf(piece.id)).toBe('tray');
  });

  it('a full tray draws nothing — the board must not open solved', () => {
    const scene = session().scene();
    expect(scene.loose).toEqual([]);
    expect(scene.placed).toEqual([]);
    expect(scene.held).toEqual([]);
  });

  it('a full tray cannot be picked up on the mat', () => {
    const play = session();
    // Dead centre of piece (1,0)'s slot: the piece is *there* in the model.
    expect(play.pickCluster({ x: 1.5, y: 0.5 })).toBeNull();
  });

  it('frames the board, not a tray parked on its own slots', () => {
    expect(session().contentBounds()).toEqual({ x: 0, y: 0, w: COLS, h: ROWS });
  });
});

describe('deploy', () => {
  it('moves the piece to the mat, centred under the finger', () => {
    const play = session();
    const pieceId = id(1, 0);

    const clusterId = play.deploy(pieceId, { x: -3, y: -2 });

    expect(clusterId).toBe(play.board.clusterIdOf(pieceId));
    expect(play.locationOf(pieceId)).toBe('mat');
    expect(play.trayCount).toBe(COLS * ROWS - 1);

    const origin = play.board.worldOf(pieceId);
    expect(origin.x).toBeCloseTo(-3.5);
    expect(origin.y).toBeCloseTo(-2.5);
  });

  it('makes the piece drawable and pickable in the same tick', () => {
    const play = session();
    const pieceId = id(2, 1);
    const clusterId = play.deploy(pieceId, { x: 8, y: 8 })!;

    expect(play.scene().loose.map((p) => p.id)).toEqual([pieceId]);
    expect(play.pickCluster({ x: 8, y: 8 })).toBe(clusterId);
  });

  it('announces itself so the tray and the ladder hear about it', () => {
    const events: PlayEvent[] = [];
    const play = session((event) => events.push(event));
    const pieceId = id(0, 0);

    play.deploy(pieceId, { x: -2, y: -2 });
    expect(events).toEqual([{ type: 'deploy', pieceId, clusterId: play.board.clusterIdOf(pieceId) }]);
  });

  it('refuses a piece that is not in the tray', () => {
    const play = session();
    const pieceId = id(0, 1);
    expect(play.deploy(pieceId, { x: 0, y: 0 })).not.toBeNull();
    expect(play.deploy(pieceId, { x: 5, y: 5 })).toBeNull();
  });
});

describe('returnToTray', () => {
  it('takes a single piece back and stops drawing it', () => {
    const play = session();
    const pieceId = id(1, 1);
    const clusterId = play.deploy(pieceId, { x: -4, y: 4 })!;

    expect(play.returnToTray(clusterId)).toBe(true);
    expect(play.locationOf(pieceId)).toBe('tray');
    expect(play.scene().loose).toEqual([]);
    expect(play.pickCluster({ x: -4, y: 4 })).toBeNull();
  });

  it('refuses an island — §06: islands live on the mat, not in the tray', () => {
    const play = session();
    const left = id(0, 0);
    const right = id(1, 0);

    play.deploy(left, { x: -6, y: -6 });
    play.deploy(right, { x: -5, y: -6 });
    const island = play.board.merge(
      play.board.clusterIdOf(left),
      play.board.clusterIdOf(right),
    );

    expect(play.returnToTray(island)).toBe(false);
    expect(play.locationOf(left)).toBe('mat');
  });

  it('refuses the board itself', () => {
    expect(session().returnToTray(BOARD_CLUSTER)).toBe(false);
  });

  it('announces the return', () => {
    const events: PlayEvent[] = [];
    const play = session((event) => events.push(event));
    const pieceId = id(2, 0);
    const clusterId = play.deploy(pieceId, { x: 9, y: 9 })!;

    events.length = 0;
    play.returnToTray(clusterId);
    expect(events).toEqual([{ type: 'return', pieceId, pinned: false }]);
  });
});

describe('worksets', () => {
  /** Three ids that are not graph neighbours of each other, laid out apart. */
  const pulled = () => [id(0, 0), id(2, 0), id(1, 1)];
  const spread = [
    { x: 20, y: 20 },
    { x: 24, y: 20 },
    { x: 28, y: 20 },
  ];

  it('pull-out groups pieces without merging them', () => {
    const play = session();
    const group = play.pullOut(pulled(), spread);

    expect(group).toBeGreaterThan(0);
    // Three separate clusters, not one. A merge here is the silent bug this
    // whole file exists to catch.
    const [a, b] = pulled();
    expect(play.board.clusterIdOf(a!)).not.toBe(play.board.clusterIdOf(b!));
    expect(play.locationOf(a!)).toBe('mat');
    expect(play.worksets.get(group)?.pieceIds).toHaveLength(3);
  });

  it('a piece merged into the board leaves its workset', () => {
    const play = session();
    const group = play.pullOut(pulled(), spread);
    const [a] = pulled();

    // Drop it exactly on its own slot: the board frame bootstraps cluster 0, so
    // this places it.
    const piece = play.board.piece(a!);
    const cluster = play.board.clusterIdOf(a!);
    play.grab(cluster);
    play.board.moveCluster(cluster, piece.targetX, piece.targetY);
    play.release(cluster, { x: 0, y: 0 });

    expect(play.board.isPlaced(a!)).toBe(true);
    expect(play.worksets.worksetOf(a!)).toBeUndefined();
    expect(play.worksets.get(group)?.pieceIds).not.toContain(a);
  });

  it('a merge onto a fellow group member empties both sides, not just the dragged one', () => {
    // §06's "membership ends on merge" (CLAUDE.md) has to hold for the
    // stationary side of a snap too. `release()` captures `pieceIds` from the
    // *dragged* cluster before `applySnap` runs; if the workset cleanup loops
    // over that stale list instead of the survivor's actual membership, the
    // piece it merged into — still a workset member — never leaves, and the
    // group's containing outline is left stretching over half a welded island.
    const play = session();
    const members = [id(0, 0), id(1, 0), id(2, 0), id(0, 1), id(1, 1)];
    const [a, b, c, d, e] = members;
    const origins = [
      { x: 20, y: 20 },
      { x: 24, y: 20 },
      { x: 28, y: 20 },
      { x: 20, y: 24 },
      { x: 24, y: 24 },
    ];
    const group = play.pullOut(members, origins);

    // a and b are graph neighbours (targets (0,0) and (1,0)): drag a to sit
    // exactly one unit left of b's current position so resolveSnap finds a
    // real candidate against a fellow workset member, not the board.
    const clusterA = play.board.clusterIdOf(a!);
    const bWorld = play.board.worldOf(b!);
    play.grab(clusterA);
    play.board.moveCluster(clusterA, bWorld.x - 1, bWorld.y);
    play.release(clusterA, { x: 0, y: 0 });

    // Confirms the snap branch actually ran, not the miss branch.
    expect(play.board.clusterIdOf(a!)).toBe(play.board.clusterIdOf(b!));
    expect(play.board.isPlaced(a!)).toBe(false);

    // Both sides of the merge left the group...
    expect(play.worksets.worksetOf(a!)).toBeUndefined();
    expect(play.worksets.worksetOf(b!)).toBeUndefined();
    // ...and the group shrank to exactly the three untouched members.
    expect(play.worksets.get(group)?.pieceIds).toHaveLength(3);
    expect(play.worksets.get(group)?.pieceIds).toEqual(expect.arrayContaining([c, d, e]));
  });

  it('a piece released well clear of its group leaves it (the miss branch)', () => {
    const play = session();
    const group = play.pullOut(pulled(), spread);
    const [a, b, c] = pulled();

    // c is the rightmost of the other two members, at spread[2]; its box's right
    // edge is the reference point for "outside the group". Multiplying the
    // tolerance rather than adding a literal keeps this meaningful if
    // WORKSET_DROP_TOLERANCE is retuned.
    const rightEdge = spread[2]!.x + 1;
    const farAway = rightEdge + WORKSET_DROP_TOLERANCE * 5;

    const cluster = play.board.clusterIdOf(a!);
    play.grab(cluster);
    // Far from both its own slot and the other two members, so resolveSnap
    // finds no candidate: release() must take the miss branch, which is the
    // only branch the proximity rule runs in.
    play.board.moveCluster(cluster, farAway, spread[2]!.y);
    play.release(cluster, { x: 0, y: 0 });

    // Confirms the miss branch, not the snap branch, actually ran.
    expect(play.board.isPlaced(a!)).toBe(false);
    expect(play.worksets.worksetOf(a!)).toBeUndefined();
    expect(play.worksets.get(group)?.pieceIds).toEqual(expect.arrayContaining([b, c]));
    expect(play.worksets.get(group)?.pieceIds).not.toContain(a);
  });

  it('a piece released just within tolerance of its group stays in it', () => {
    const play = session();
    const group = play.pullOut(pulled(), spread);
    const [a, b, c] = pulled();

    const rightEdge = spread[2]!.x + 1;
    // Outside the others' box, but by less than the tolerance — the companion
    // to the escape test above. Without this, a test could pass with the
    // tolerance set to zero: only this one makes the slack load-bearing.
    const justInside = rightEdge + WORKSET_DROP_TOLERANCE / 2;

    const cluster = play.board.clusterIdOf(a!);
    play.grab(cluster);
    play.board.moveCluster(cluster, justInside, spread[2]!.y);
    play.release(cluster, { x: 0, y: 0 });

    // Confirms the miss branch, not the snap branch, actually ran.
    expect(play.board.isPlaced(a!)).toBe(false);
    expect(play.worksets.worksetOf(a!)?.id).toBe(group);
    expect(play.worksets.get(group)?.pieceIds).toEqual(expect.arrayContaining([a, b, c]));
  });

  it('a pinned return puts the piece back in the tray, flagged', () => {
    const seen: string[] = [];
    const play = session((event) => {
      if (event.type === 'return') seen.push(`${event.pieceId}:${event.pinned}`);
    });

    const a = id(0, 0);
    const cluster = play.deploy(a, { x: 20, y: 20 })!;
    play.returnToTray(cluster, true);

    expect(play.locationOf(a)).toBe('tray');
    expect(seen).toEqual([`${a}:true`]);
  });
});

describe('placement through the tray', () => {
  it('a deployed piece still places, and reports placed thereafter', () => {
    const play = session();
    const pieceId = id(0, 0);
    const clusterId = play.deploy(pieceId, { x: -5, y: -5 })!;

    // Drop it on its own slot: the board frame bootstraps an empty cluster 0.
    play.board.moveCluster(clusterId, 0, 0);
    play.release(clusterId, { x: 0, y: 0 });

    expect(play.locationOf(pieceId)).toBe('placed');
    expect(play.board.placedCount).toBe(1);
  });

  it('never snaps to a piece that is still in the tray', () => {
    // The failure this guards is silent and total. A tray piece has never been
    // moved, so its cluster is parked on its own solved slot — which makes it
    // the *best* neighbour for anything dropped where it belongs. Without
    // `SnapOptions.eligible` the first placement of every puzzle merges with a
    // tray piece instead of the board: no error, nothing drawn differently, and
    // the tray and the board silently disagree about who owns that piece.
    const play = session();
    const pieceId = id(0, 0);
    const neighbour = id(1, 0);
    const clusterId = play.deploy(pieceId, { x: -5, y: -5 })!;

    play.board.moveCluster(clusterId, 0, 0);
    play.release(clusterId, { x: 0, y: 0 });

    expect(play.board.isPlaced(pieceId)).toBe(true);
    expect(play.locationOf(neighbour)).toBe('tray');
    expect(play.board.isPlaced(neighbour)).toBe(false);
    expect(play.trayCount).toBe(COLS * ROWS - 1);
  });

  it('the cascade does not drag tray pieces onto the board either', () => {
    const play = session();
    const left = id(0, 0);
    const right = id(1, 0);

    // Place the left piece for real, then drop the middle one beside it. Its
    // other neighbours are all still in the tray, sitting on their own slots.
    const leftCluster = play.deploy(left, { x: -5, y: -5 })!;
    play.board.moveCluster(leftCluster, 0, 0);
    play.release(leftCluster, { x: 0, y: 0 });

    const rightCluster = play.deploy(right, { x: -5, y: -5 })!;
    play.board.moveCluster(rightCluster, 1, 0);
    play.release(rightCluster, { x: 0, y: 0 });

    expect(play.board.placedCount).toBe(2);
    expect(play.locationOf(id(2, 0))).toBe('tray');
    expect(play.locationOf(id(1, 1))).toBe('tray');
  });
});
