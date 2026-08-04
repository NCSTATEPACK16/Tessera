/**
 * The save format (`PLAN.md` §14 / the design doc's "Save format" section),
 * and the piece-array packing it specifies.
 *
 * The `pieces[]` third slot ("rot") is a documented judgment call: the model
 * has no independent per-piece rotation — only clusters rotate — so it is
 * always 0 and carries no meaning today. See
 * docs/superpowers/specs/2026-08-02-step-5c-library-persist-pause-design.md
 * for the full reasoning. `clusters[]` remains the sole source of truth for
 * position, rotation, kind, label, and collapsed state.
 */

import type { Board, BoardClusterSnapshot, BoardPieceSnapshot } from '@/board/board';
import type { PieceId } from '@/cut/types';
import type { SnapDifficulty } from '@/board/snap';
import type { PuzzleAssists, PuzzleMode } from '@/play/setup';
import type { Lens } from '@/tray/lenses';

export interface SessionSnapshot {
  version: 1;
  puzzleId: string;
  seed: number;
  cols: number;
  rows: number;
  targetCount: number;
  mode: PuzzleMode;
  rotation: boolean;
  difficulty: SnapDifficulty;
  assists: PuzzleAssists;
  /** base64-packed Float32Array of [localX, localY, 0, clusterId] per piece. */
  pieces: string;
  pieceCount: number;
  clusters: BoardClusterSnapshot[];
  worksets: { id: number; label: string; pieceIds: PieceId[] }[];
  camera: { x: number; y: number; zoom: number };
  tray: {
    order: PieceId[];
    pinned: PieceId[];
    /**
     * Persisted explicitly: `Board` knows nothing about the tray, so a piece
     * returned to the tray is indistinguishable in board terms from a fresh
     * unplaced one. Without this field, resuming would deploy the whole tray.
     */
    trayIds: PieceId[];
    lens: Lens;
    lensArg: number | null;
    scroll: number;
  };
  timer: { elapsedMs: number; running: boolean };
  hintsUsed: number;
  cleanRun: boolean;
  placed: number;
  total: number;
  updatedAt: number;
}

function bytesToBase64(bytes: Uint8Array): string {
  // Byte-by-byte rather than a spread over the array: a 250-piece board is
  // 4000 bytes, and `String.fromCharCode(...bytes)` risks a call-stack limit
  // on some engines the moment that grows.
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function packPieces(board: Board): string {
  const floats = new Float32Array(board.pieceCount * 4);
  for (const piece of board.pieces) {
    const i = piece.id * 4;
    floats[i] = piece.localX;
    floats[i + 1] = piece.localY;
    floats[i + 2] = 0;
    floats[i + 3] = piece.clusterId;
  }
  return bytesToBase64(new Uint8Array(floats.buffer));
}

export function unpackPieces(packed: string, pieceCount: number): BoardPieceSnapshot[] {
  const bytes = base64ToBytes(packed);
  const floats = new Float32Array(bytes.buffer, bytes.byteOffset, pieceCount * 4);
  const pieces: BoardPieceSnapshot[] = [];
  for (let id = 0; id < pieceCount; id++) {
    const i = id * 4;
    pieces.push({
      id,
      localX: floats[i]!,
      localY: floats[i + 1]!,
      clusterId: Math.round(floats[i + 3]!),
    });
  }
  return pieces;
}
