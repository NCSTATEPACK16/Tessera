/**
 * The save format's piece packing (§14 / `PLAN.md`'s save-format table).
 *
 * The load-bearing property: a packed board, unpacked, hands `Board.restore`
 * exactly the numbers it was given. A drift here is silent — the board just
 * reopens slightly wrong, with nothing to explain it.
 */

import { describe, expect, it } from 'vitest';
import { Board, createBoard } from '@/board/board';
import type { BoardInput } from '@/board/board';
import { packPieces, unpackPieces } from '@/persist/snapshot';
import type { SessionSnapshot } from '@/persist/snapshot';
import { WorksetStore } from '@/play/workset';

function threePieceInput(): BoardInput[] {
  return [
    { id: 0, targetX: 0, targetY: 0, w: 1, h: 1, neighbours: [null, null, null, null] },
    { id: 1, targetX: 1, targetY: 0, w: 1, h: 1, neighbours: [null, null, null, null] },
    { id: 2, targetX: 2, targetY: 0, w: 1, h: 1, neighbours: [null, null, null, null] },
  ];
}

describe('packPieces / unpackPieces', () => {
  it('round-trips a fresh board exactly', () => {
    const board = createBoard(threePieceInput());
    const packed = packPieces(board);
    const unpacked = unpackPieces(packed, board.pieceCount);

    expect(unpacked).toHaveLength(3);
    for (const piece of board.pieces) {
      const saved = unpacked.find((p) => p.id === piece.id)!;
      expect(saved.localX).toBeCloseTo(piece.localX, 5);
      expect(saved.localY).toBeCloseTo(piece.localY, 5);
      expect(saved.clusterId).toBe(piece.clusterId);
    }
  });

  it('round-trips a board with merges and non-zero local offsets', () => {
    const board = createBoard(threePieceInput());
    board.merge(board.clusterIdOf(0), board.clusterIdOf(1));
    board.moveCluster(board.clusterIdOf(0), 12.5, -3.25);

    const packed = packPieces(board);
    const unpacked = unpackPieces(packed, board.pieceCount);

    for (const piece of board.pieces) {
      const saved = unpacked.find((p) => p.id === piece.id)!;
      expect(saved.localX).toBeCloseTo(piece.localX, 4);
      expect(saved.localY).toBeCloseTo(piece.localY, 4);
      expect(saved.clusterId).toBe(piece.clusterId);
    }
  });

  it('survives a Board.restore round trip', () => {
    const input = threePieceInput();
    const board = createBoard(input);
    board.merge(board.clusterIdOf(0), board.clusterIdOf(1));
    board.moveCluster(board.clusterIdOf(0), 4.5, 7.25);

    const pieces = unpackPieces(packPieces(board), board.pieceCount);
    const clusters = [...board.clusters.values()].map((c) => ({
      id: c.id,
      x: c.x,
      y: c.y,
      rot: c.rot,
      kind: c.kind,
    }));
    const restored = Board.restore(input, { clusters, pieces });

    for (const piece of board.pieces) {
      const a = board.worldOf(piece.id);
      const b = restored.worldOf(piece.id);
      expect(b.x).toBeCloseTo(a.x, 4);
      expect(b.y).toBeCloseTo(a.y, 4);
    }
  });

  it('produces a compact base64 string, not JSON', () => {
    const board = createBoard(threePieceInput());
    const packed = packPieces(board);
    expect(packed).not.toMatch(/[{[]/);
    expect(typeof packed).toBe('string');
  });
});

describe('worksets in the save format', () => {
  it('restores a snapshot written before collapse was removed', () => {
    // Exactly the shape 5c and step 6 wrote. `PlayRuntime.restore` replays a
    // workset with `WorksetStore.create(pieceIds, label)` — it never reads
    // `collapsed` off the saved entry, so the extra key must be ignored, not
    // rejected: §14, "losing progress is unforgivable."
    const legacy = {
      id: 1,
      label: 'the roof',
      collapsed: true,
      pieceIds: [3, 4],
    } as unknown as SessionSnapshot['worksets'][number];

    const store = new WorksetStore();
    const id = store.create(legacy.pieceIds, legacy.label);

    expect(store.get(id)?.label).toBe('the roof');
    expect(store.get(id)?.pieceIds).toEqual([3, 4]);
    expect(store.get(id)).not.toHaveProperty('collapsed');
  });

  it('the type carries no collapsed field', () => {
    const written: SessionSnapshot['worksets'][number] = {
      id: 1,
      label: 'the roof',
      pieceIds: [3, 4],
    };
    expect(written).not.toHaveProperty('collapsed');
  });
});
