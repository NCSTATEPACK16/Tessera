# Step 5c — Library, Save/Resume, Pause Sheet, Again-Harder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out `PLAN.md`'s Step 5 checklist — a library screen of in-progress puzzles with
live thumbnails, full-fidelity save/resume via IndexedDB, a pause sheet (resume, reference image,
restart, live settings, leave), and "puzzle this again, harder" — plus two folded-in loose ends:
deleting `dev.html`/the step-2 harness, and EXIF orientation + a clear HEIC error path.

**Architecture:** A new `src/persist/` module owns everything IndexedDB: a hand-rolled promisified
wrapper (`db.ts`, no new dependency), pack/unpack for the piece array, and three small stores
(sessions, photos, thumbnails). `Board` gains a second entry point, `Board.restore()`, that seeds
cluster/piece state directly from saved data instead of the constructor's default one-cluster-per-
piece init — no change to union-find, merge, or snap. `PlaySession` gains matching `restore*`
constructor options for the state `Board` doesn't own (tray membership, worksets, hints, clean-run).
`PlayRuntime` gains `snapshot()`/an optional `restore` constructor option, live `setAssists()`/
`setDifficulty()` for the pause sheet, and autosave (800ms debounce on every `PlayEvent`, a
synchronous write already-hooked through the existing `interrupt()` call on `visibilitychange`).
Three new screens (`Library`, `PauseSheet`, `CompletionBanner`) slot into `App.tsx`'s existing
phase-machine pattern from 5a/5b.

**Tech Stack:** React 19 + TypeScript, Tailwind v4 against `theme.css` tokens, vitest (node
environment, pure functions only — IndexedDB itself is browser-only and untestable in node, so the
`db.ts`/`persist/*` store files are hand-judged + Playwright-verified, same category as
`renderer.ts`/`board-controls.ts`), Playwright (real browser, the only place IndexedDB persistence
across a reload can actually be observed).

## Global Constraints

- **The `pieces[]` third slot is always `0`, reserved, meaningless today** — a documented judgment
  call (see the design spec's Architecture section) resolving an ambiguity the design doc itself
  never settles. `localX`/`localY` are `Board`'s own fields, copied verbatim; `clusterId` is the
  piece's cluster membership. Do not read or write anything into the third slot.
- **`inTray` must be persisted explicitly.** `Board` has no notion of tray membership
  (`CLAUDE.md`: "`Board` knows nothing about the first two [tray/mat]") — a piece returned to the
  tray is, in board terms, indistinguishable from a fresh unplaced piece, both being a lone cluster
  sitting exactly at its target. `SessionSnapshot.tray.trayIds` is a new, separately-serialized
  field for exactly this reason. This is a spec gap discovered during planning, not present in
  `PLAN.md`'s literal format table — documented here rather than guessed silently, same posture as
  step 4b's hint-tier gaps.
- **No `localStorage` for session state, ever** — IndexedDB only, everywhere in this plan.
- **Source photos are the canonical durable copy.** Every consumer (restore, the pause sheet's
  reference image, "again, harder") decodes a fresh working `ImageBitmap` from the stored blob on
  demand rather than holding a long-lived copy — `ImageBitmap` transfer to the cutter worker
  detaches the original, which is exactly the bug 5b's handoff already flagged for the ghost
  underlay. Never pass an `ImageBitmap` that's already been handed to `cutInWorker` to a second
  consumer.
- **Snap tolerance stays world-space; the pause sheet's live settings never touch that invariant**
  — `setDifficulty()` changes `SnapDifficulty`, never zoom.
- **The board never re-renders through React.** Autosave lives inside `PlayRuntime`, not as a
  React effect keyed on summary state — it must not add a per-tick React subscription.
- Touch target 44pt floor, everywhere new UI is added (pause sheet buttons, library cards,
  completion banner buttons) — same `min-h-[44px]`/`min-w-[44px]` pattern already used in
  `PuzzleSetup.tsx`.
- Colour is never the only signal — selection/active states pair a border-weight or checkmark
  change with colour, matching the existing pattern in `PhotoPicker.tsx`/`PuzzleSetup.tsx`.
- `npm run test:browser` is a gate, not an optional extra — every UI-touching task ends with it
  green where a spec exists for that area yet; the final task runs the full four-command gate
  (`npm test`, `npm run typecheck`, `npm run build`, `npm run test:browser`).
- **`PLAN.md`'s save-format numbers**: ~6 KB for a 250-piece board, IndexedDB debounced 800ms plus
  a synchronous write on `visibilitychange`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/persist/db.ts` (new) | Promisified raw-IndexedDB open/get/put/delete/getAll. No dependency added. |
| `src/board/board.ts` (modify) | `Board.restore()`, `BoardSnapshot`/`BoardClusterSnapshot`/`BoardPieceSnapshot` types. |
| `test/board/board.test.ts` (modify) | Round-trip test for `Board.restore`. |
| `src/persist/snapshot.ts` (new) | `SessionSnapshot` type, `packPieces`/`unpackPieces` (Float32Array ↔ base64). |
| `test/persist/snapshot.test.ts` (new) | Pack/unpack round-trip tests. |
| `src/play/session.ts` (modify) | `cleanRun` tracking; `PlaySessionOptions` gains `restoreBoard`/`restoreInTray`/`restoreHintsUsed`/`restoreCleanRun`. |
| `test/play/session.test.ts` (modify) | New cases for `cleanRun` and the restore options. |
| `src/tray/tray.ts` (modify) | `TrayModel.pinned` getter, `restoreOrder()`, `restorePinned()`. |
| `test/tray/tray.test.ts` (modify) | New cases for the three additions. |
| `src/ui/PieceGrid.tsx` (modify) | `onScroll?`/`initialScrollTop?` props, wired to the existing `scroller` ref. |
| `src/play/setup.ts` (modify) | `nextHarderCount()`. |
| `test/play/setup.test.ts` (modify) | New cases for `nextHarderCount`. |
| `src/persist/photos.ts` (new) | Write-once photo blob store, keyed by `puzzleId`. |
| `src/persist/thumbnail.ts` (new) | Downsample a canvas to a `Blob`. |
| `src/persist/library.ts` (new) | `list()`/`save()`/`delete()` over the session-record store. |
| `src/play/runtime.ts` (modify) | Camera getter, `snapshot()`, `restore` constructor option, `setAssists()`/`setDifficulty()`, autosave scheduling, `RuntimeSummary.status` gains `'complete'`. |
| `src/ui/App.tsx` (modify) | EXIF fix in `decodeUpload`; full entry-flow rewiring — `'checking'`/`'library'` phases, pause sheet, completion banner, restart, "again harder". |
| `src/ui/TopBar.tsx` (modify) | New pause button. |
| `src/ui/PauseSheet.tsx` (new) | Resume, reference image, restart confirm, live settings, leave. |
| `src/ui/Library.tsx` (new) | In-progress puzzle cards. |
| `src/ui/CompletionBanner.tsx` (new) | "Play again, harder" / "Done". |
| `dev.html`, `src/dev/*` (delete) | The step-2 harness, per `CLAUDE.md`: "It goes at step 5." |
| `vite.config.ts` (modify) | Remove the `dev` build entry. |
| `test/browser/board-page.ts` (modify) | Clear IndexedDB before navigation so every spec still lands on the picker deterministically. |
| `test/browser/persistence.spec.ts` (new) | Reload mid-session restores the board pixel-identical. |
| `test/browser/library.spec.ts` (new) | Library renders a real saved session; opens it; empty-state entry flow. |
| `test/browser/pause-sheet.spec.ts` (new) | Open, reference image, restart confirm/cancel, live settings, leave. |
| `test/browser/completion.spec.ts` (new) | Completion banner, both actions. |

No other existing file changes.

---

## Interfaces (shared types across tasks)

```ts
// src/board/board.ts — additions
export interface BoardClusterSnapshot {
  id: number;
  x: number;
  y: number;
  rot: number;
  kind: ClusterKind;
  label?: string;
  collapsed?: boolean;
}
export interface BoardPieceSnapshot {
  id: PieceId;
  clusterId: number;
  localX: number;
  localY: number;
}
export interface BoardSnapshot {
  clusters: BoardClusterSnapshot[];
  pieces: BoardPieceSnapshot[];
}
// Board gains:
static restore(input: readonly BoardInput[], snapshot: BoardSnapshot): Board;
```

```ts
// src/persist/snapshot.ts
export interface SessionSnapshot {
  version: 1;
  puzzleId: string;
  seed: number;
  cols: number;
  rows: number;
  targetCount: number;
  mode: PuzzleMode; // from '@/play/setup'
  rotation: boolean;
  difficulty: SnapDifficulty; // from '@/board/snap'
  assists: PuzzleAssists; // from '@/play/setup'
  pieces: string; // base64-packed Float32Array [localX, localY, 0, clusterId] x N
  pieceCount: number;
  clusters: BoardClusterSnapshot[]; // from '@/board/board'
  worksets: { id: number; label: string; collapsed: boolean; pieceIds: PieceId[] }[];
  camera: { x: number; y: number; zoom: number };
  tray: {
    order: PieceId[];
    pinned: PieceId[];
    trayIds: PieceId[];
    lens: Lens; // from '@/tray/lenses'
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

export function packPieces(board: Board): string;
export function unpackPieces(packed: string, pieceCount: number): BoardPieceSnapshot[];
```

```ts
// src/persist/db.ts
export function openDb(): Promise<IDBDatabase>;
export function idbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined>;
export function idbPut<T>(store: string, value: T, key?: IDBValidKey): Promise<void>;
export function idbDelete(store: string, key: IDBValidKey): Promise<void>;
export function idbGetAll<T>(store: string): Promise<T[]>;
```

```ts
// src/persist/photos.ts
export function savePhoto(puzzleId: string, blob: Blob): Promise<void>;
export function loadPhoto(puzzleId: string): Promise<ImageBitmap>;
export function deletePhoto(puzzleId: string): Promise<void>;
```

```ts
// src/persist/thumbnail.ts
export function captureThumbnail(source: HTMLCanvasElement | OffscreenCanvas): Promise<Blob>;
```

```ts
// src/persist/library.ts
export interface LibraryEntry {
  puzzleId: string;
  snapshot: SessionSnapshot;
  thumbnailBlob: Blob;
  updatedAt: number;
}
export function listLibrary(): Promise<LibraryEntry[]>;
export function saveLibraryEntry(entry: LibraryEntry): Promise<void>;
export function deleteLibraryEntry(puzzleId: string): Promise<void>;
```

```ts
// src/play/setup.ts — addition
export function nextHarderCount(current: number): number | null; // null once at 250
```

```ts
// src/play/runtime.ts — additions
export interface PlayRuntimeOptions {
  // ...existing fields unchanged...
  puzzleId: string; // NEW, required — the library/save key
  restore?: {
    snapshot: SessionSnapshot;
  };
  onSave?: (snapshot: SessionSnapshot, canvas: HTMLCanvasElement | OffscreenCanvas) => void;
}
// PlayRuntime gains:
setAssists(assists: PuzzleAssists): void;
setDifficulty(difficulty: SnapDifficulty): void;
snapshot(chrome: { lens: Lens; lensArg: number | null; scroll: number }): SessionSnapshot;
get cameraState(): { x: number; y: number; zoom: number };
// RuntimeSummary.status gains 'complete'
```

```tsx
// src/ui/PauseSheet.tsx
export interface PauseSheetProps {
  onResume: () => void;
  onShowReference: () => void;
  onRestart: () => void;
  onLeave: () => void;
  assists: PuzzleAssists;
  difficulty: SnapDifficulty;
  onAssistsChange: (assists: PuzzleAssists) => void;
  onDifficultyChange: (difficulty: SnapDifficulty) => void;
}
export function PauseSheet(props: PauseSheetProps): React.ReactElement;
```

```tsx
// src/ui/Library.tsx
export interface LibraryProps {
  entries: readonly LibraryEntry[]; // from '@/persist/library'
  onOpen: (puzzleId: string) => void;
  onNewPuzzle: () => void;
}
export function Library(props: LibraryProps): React.ReactElement;
```

```tsx
// src/ui/CompletionBanner.tsx
export interface CompletionBannerProps {
  canGoHarder: boolean;
  onAgainHarder: () => void;
  onDone: () => void;
}
export function CompletionBanner(props: CompletionBannerProps): React.ReactElement;
```

---

### Task 1: `src/persist/db.ts` — the IndexedDB wrapper

**Files:**
- Create: `src/persist/db.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `openDb`, `idbGet`, `idbPut`, `idbDelete`, `idbGetAll` as declared above. Tasks 8
  (`photos.ts`/`thumbnail.ts`/`library.ts`) are the consumers.

No unit test — IndexedDB doesn't exist in vitest's node environment, and no fake-indexeddb
dependency was approved (the design explicitly chose "no new dependency"). This file is hand-judged
plus verified end-to-end by Task 17's browser specs, the same category `CLAUDE.md`'s testing
posture already puts `renderer.ts`/`board-controls.ts` in.

**Semantics:**

- One database, `'tessera'`, version 1, three object stores: `'sessions'` (keyPath `'puzzleId'`),
  `'photos'` (keyPath `'puzzleId'`), `'thumbnails'` (keyPath `'puzzleId'`). Created in `onupgradeneeded`.
- Every function opens the DB fresh via `openDb()` rather than caching a connection — IndexedDB
  connections are cheap to open and this avoids a whole class of "connection closed by another tab"
  bugs for a feature this small.
- `idbGet`/`idbPut`/`idbDelete`/`idbGetAll` each wrap a single `IDBTransaction` in a `Promise`,
  resolving on `transaction.oncomplete` (not the individual request's `onsuccess` — waiting for the
  transaction guarantees the write actually committed) and rejecting on `transaction.onerror`.

- [ ] **Step 1: Write the module**

```ts
/**
 * A thin, hand-rolled promisified layer over IndexedDB.
 *
 * No dependency added — this is ~50 lines and the codebase's existing
 * preference is small hand-written modules (`rng.ts`, `geom.ts`) over pulling
 * in a library for something this narrow. Every store this app needs
 * (sessions, photos, thumbnails) is created here in one place so there is
 * only ever one `onupgradeneeded` to keep in sync with the store list.
 */

const DB_NAME = 'tessera';
const DB_VERSION = 1;
export const STORE_SESSIONS = 'sessions';
export const STORE_PHOTOS = 'photos';
export const STORE_THUMBNAILS = 'thumbnails';

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: 'puzzleId' });
      }
      if (!db.objectStoreNames.contains(STORE_PHOTOS)) {
        db.createObjectStore(STORE_PHOTOS, { keyPath: 'puzzleId' });
      }
      if (!db.objectStoreNames.contains(STORE_THUMBNAILS)) {
        db.createObjectStore(STORE_THUMBNAILS, { keyPath: 'puzzleId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

export async function idbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const request = tx.objectStore(store).get(key);
    let result: T | undefined;
    request.onsuccess = () => {
      result = request.result as T | undefined;
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbPut<T>(store: string, value: T, key?: IDBValidKey): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGetAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const request = tx.objectStore(store).getAll();
    let result: T[] = [];
    request.onsuccess = () => {
      result = request.result as T[];
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/persist/db.ts
git commit -m "Step 5c: promisified IndexedDB wrapper — no new dependency"
```

---

### Task 2: `Board.restore()` — `src/board/board.ts`

**Files:**
- Modify: `src/board/board.ts`
- Test: `test/board/board.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Board.restore`, `BoardSnapshot`, `BoardClusterSnapshot`, `BoardPieceSnapshot` as
  declared in the plan's Interfaces section. Task 3 (`snapshot.ts`) and Task 9/10 (`runtime.ts`)
  are the consumers.

**Semantics:**

- `Board.restore` builds via the existing constructor first (`new Board(input)`, giving the correct
  `pieces` array in id order and a default cluster-0), then **overwrites** `this.clusters` and every
  piece's `clusterId`/`localX`/`localY` from `snapshot` instead of the constructor's default
  one-cluster-per-piece state.
- It throws if `snapshot.pieces` is missing an entry for any piece in `input`, or if a piece
  references a `clusterId` not present in `snapshot.clusters` — a snapshot that doesn't match its
  own cut is corrupt, and failing loudly here is much better than silently drawing a broken board.
- `nextClusterId` (private) is set to one more than the highest cluster id in the snapshot, so any
  later merge mints a genuinely new id rather than colliding with a restored one. `restore` is a
  static method on `Board` itself, so it can reach `board.nextClusterId` — a private field — because
  TypeScript's `private` is enforced per-class, not per-instance.
- Cluster 0 is still restored from the snapshot like any other cluster (its `anchored`/`kind` are
  forced to the constructor's original values — `anchored: true`, `kind: 'board'` — never taken from
  the snapshot, since those are structural invariants, not saved state).

- [ ] **Step 1: Write the failing test**

Add to `test/board/board.test.ts` (the existing file already imports `createBoard` and whatever
`BoardInput` fixtures it uses — reuse the same fixture-building helper if one exists in that file;
otherwise use the inline shape below, which matches `BoardInput`'s fields):

```ts
import { Board, BOARD_CLUSTER } from '@/board/board';
import type { BoardInput, BoardSnapshot } from '@/board/board';

function fourPieceInput(): BoardInput[] {
  // A 2x2 grid, each piece 1x1 world unit, adjacent pieces linked as neighbours.
  // id layout: 0 1
  //            2 3
  return [
    { id: 0, targetX: 0, targetY: 0, w: 1, h: 1, neighbours: [null, { id: 1, dx: 1, dy: 0 }, { id: 2, dx: 0, dy: 1 }, null] },
    { id: 1, targetX: 1, targetY: 0, w: 1, h: 1, neighbours: [null, null, { id: 3, dx: 0, dy: 1 }, { id: 0, dx: -1, dy: 0 }] },
    { id: 2, targetX: 0, targetY: 1, w: 1, h: 1, neighbours: [{ id: 0, dx: 0, dy: -1 }, { id: 3, dx: 1, dy: 0 }, null, null] },
    { id: 3, targetX: 1, targetY: 1, w: 1, h: 1, neighbours: [{ id: 1, dx: 0, dy: -1 }, null, null, { id: 2, dx: -1, dy: 0 }] },
  ];
}

describe('Board.restore', () => {
  it('reproduces identical worldOf and cluster membership after a round trip', () => {
    const input = fourPieceInput();
    const original = new Board(input);

    // Merge 0 and 1 into an island, leave 2 loose, place 3 on the board.
    original.merge(original.clusterIdOf(0), original.clusterIdOf(1));
    original.moveCluster(original.clusterIdOf(0), 5, 5);
    original.merge(BOARD_CLUSTER, original.clusterIdOf(3));

    const snapshot: BoardSnapshot = {
      clusters: [...original.clusters.values()].map((c) => ({
        id: c.id,
        x: c.x,
        y: c.y,
        rot: c.rot,
        kind: c.kind,
        label: c.label,
        collapsed: c.collapsed,
      })),
      pieces: original.pieces.map((p) => ({
        id: p.id,
        clusterId: p.clusterId,
        localX: p.localX,
        localY: p.localY,
      })),
    };

    const restored = Board.restore(input, snapshot);

    for (const piece of original.pieces) {
      const a = original.worldOf(piece.id);
      const b = restored.worldOf(piece.id);
      expect(b.x).toBeCloseTo(a.x, 6);
      expect(b.y).toBeCloseTo(a.y, 6);
      expect(restored.clusterIdOf(piece.id)).toBe(original.clusterIdOf(piece.id));
    }
    expect(restored.placedCount).toBe(original.placedCount);
    expect(restored.isPlaced(3)).toBe(true);
    expect(restored.isPlaced(2)).toBe(false);
  });

  it('throws if the snapshot is missing a piece the input describes', () => {
    const input = fourPieceInput();
    const snapshot: BoardSnapshot = {
      clusters: [{ id: BOARD_CLUSTER, x: 0, y: 0, rot: 0, kind: 'board' }],
      pieces: [{ id: 0, clusterId: BOARD_CLUSTER, localX: 0, localY: 0 }],
    };
    expect(() => Board.restore(input, snapshot)).toThrow();
  });

  it('keeps cluster 0 anchored regardless of what the snapshot says', () => {
    const input = fourPieceInput();
    const original = new Board(input);
    const snapshot: BoardSnapshot = {
      clusters: [...original.clusters.values()].map((c) => ({
        id: c.id,
        x: c.x,
        y: c.y,
        rot: c.rot,
        kind: c.kind,
      })),
      pieces: original.pieces.map((p) => ({
        id: p.id,
        clusterId: p.clusterId,
        localX: p.localX,
        localY: p.localY,
      })),
    };
    const restored = Board.restore(input, snapshot);
    expect(restored.cluster(BOARD_CLUSTER).anchored).toBe(true);
    expect(() => restored.moveCluster(BOARD_CLUSTER, 1, 1)).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/board/board.test.ts`
Expected: FAIL — `Board.restore` doesn't exist yet.

- [ ] **Step 3: Implement**

Add near the top of `src/board/board.ts`, alongside the existing `BoardInput`/`BoardPiece`
interfaces:

```ts
export interface BoardClusterSnapshot {
  id: number;
  x: number;
  y: number;
  rot: number;
  kind: ClusterKind;
  label?: string;
  collapsed?: boolean;
}

export interface BoardPieceSnapshot {
  id: PieceId;
  clusterId: number;
  localX: number;
  localY: number;
}

export interface BoardSnapshot {
  clusters: BoardClusterSnapshot[];
  pieces: BoardPieceSnapshot[];
}
```

Add this static method to the `Board` class, after the constructor:

```ts
  /**
   * A second entry point into the same data — nothing about union-find,
   * merge, or snap changes. They only ever read `this.clusters`/
   * `piece.clusterId`, and don't care how that state was populated.
   *
   * Cluster 0's `anchored`/`kind` are never taken from the snapshot — those
   * are structural invariants, not saved state, and trusting a corrupt or
   * hand-edited snapshot on them would let the board become un-anchored.
   */
  static restore(input: readonly BoardInput[], snapshot: BoardSnapshot): Board {
    const board = new Board(input);
    board.clusters.clear();

    let maxClusterId = BOARD_CLUSTER;
    for (const saved of snapshot.clusters) {
      board.clusters.set(saved.id, {
        id: saved.id,
        pieceIds: [],
        x: saved.x,
        y: saved.y,
        rot: saved.id === BOARD_CLUSTER ? 0 : saved.rot,
        kind: saved.id === BOARD_CLUSTER ? 'board' : saved.kind,
        anchored: saved.id === BOARD_CLUSTER,
        label: saved.label,
        collapsed: saved.collapsed,
      });
      if (saved.id > maxClusterId) maxClusterId = saved.id;
    }

    const byId = new Map(snapshot.pieces.map((p) => [p.id, p]));
    for (const piece of board.pieces) {
      const saved = byId.get(piece.id);
      if (!saved) {
        throw new Error(`Board.restore: snapshot is missing piece ${piece.id}`);
      }
      const cluster = board.clusters.get(saved.clusterId);
      if (!cluster) {
        throw new Error(
          `Board.restore: piece ${piece.id} references missing cluster ${saved.clusterId}`,
        );
      }
      piece.clusterId = saved.clusterId;
      piece.localX = saved.localX;
      piece.localY = saved.localY;
      cluster.pieceIds.push(piece.id);
    }

    board.nextClusterId = maxClusterId + 1;
    return board;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/board/board.test.ts`
Expected: PASS, all cases including the three new ones.

- [ ] **Step 5: Run the full unit suite, typecheck, and commit**

Run: `npm test && npm run typecheck`
Expected: both clean.

```bash
git add src/board/board.ts test/board/board.test.ts
git commit -m "Step 5c: Board.restore — a second entry point for resuming saved state"
```

---

### Task 3: `src/persist/snapshot.ts` — the save format and piece packing

**Files:**
- Create: `src/persist/snapshot.ts`
- Test: `test/persist/snapshot.test.ts`

**Interfaces:**
- Consumes: `BoardClusterSnapshot`/`BoardPieceSnapshot` from `@/board/board` (Task 2);
  `PuzzleMode`/`PuzzleAssists` from `@/play/setup`; `SnapDifficulty` from `@/board/snap`; `Lens`
  from `@/tray/lenses`; `PieceId` from `@/cut/types`; `Board` from `@/board/board` (for
  `packPieces`'s parameter type).
- Produces: `SessionSnapshot`, `packPieces`, `unpackPieces` as declared in the plan's Interfaces
  section. Task 9/10 (`runtime.ts`) and Task 8 (`library.ts`) are the consumers.

**Semantics:**

- `packPieces(board)` writes `[localX, localY, 0, clusterId]` per piece, in piece-id order (`0..N-1`
  — `board.pieces` is already indexed by id, per `Board.piece(id)`'s implementation reading
  `this.pieces[id]`), into one `Float32Array`, then base64-encodes its raw bytes.
- `unpackPieces(packed, pieceCount)` is the exact inverse, returning `BoardPieceSnapshot[]` (the
  third float — reserved — is read and discarded).
- Base64 via `btoa`/`atob` over a byte-by-byte string build (not a spread over `Uint8Array`, which
  risks call-stack limits on some engines for large arrays) — both are available as Node globals
  (Node 18+; this repo's `@types/node` targets Node 26) and as browser globals, so this is safe in
  both the vitest node environment and the real app.

- [ ] **Step 1: Write the failing tests**

```ts
// test/persist/snapshot.test.ts
import { describe, expect, it } from 'vitest';
import { Board } from '@/board/board';
import type { BoardInput } from '@/board/board';
import { packPieces, unpackPieces } from '@/persist/snapshot';

function threePieceInput(): BoardInput[] {
  return [
    { id: 0, targetX: 0, targetY: 0, w: 1, h: 1, neighbours: [null, null, null, null] },
    { id: 1, targetX: 1, targetY: 0, w: 1, h: 1, neighbours: [null, null, null, null] },
    { id: 2, targetX: 2, targetY: 0, w: 1, h: 1, neighbours: [null, null, null, null] },
  ];
}

describe('packPieces / unpackPieces', () => {
  it('round-trips a fresh board exactly', () => {
    const board = new Board(threePieceInput());
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
    const board = new Board(threePieceInput());
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

  it('produces a compact base64 string, not JSON', () => {
    const board = new Board(threePieceInput());
    const packed = packPieces(board);
    expect(packed).not.toMatch(/[{[]/);
    expect(typeof packed).toBe('string');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/persist/snapshot.test.ts`
Expected: FAIL — `Cannot find module '@/persist/snapshot'`.

- [ ] **Step 3: Implement**

```ts
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
  pieces: string;
  pieceCount: number;
  clusters: BoardClusterSnapshot[];
  worksets: { id: number; label: string; collapsed: boolean; pieceIds: PieceId[] }[];
  camera: { x: number; y: number; zoom: number };
  tray: {
    order: PieceId[];
    pinned: PieceId[];
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/persist/snapshot.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Run the full unit suite, typecheck, and commit**

Run: `npm test && npm run typecheck`
Expected: both clean.

```bash
git add src/persist/snapshot.ts test/persist/snapshot.test.ts
git commit -m "Step 5c: SessionSnapshot type and piece-array pack/unpack"
```

---

### Task 4: `cleanRun` and restore options — `src/play/session.ts`

**Files:**
- Modify: `src/play/session.ts`
- Test: `test/play/session.test.ts`

**Interfaces:**
- Consumes: `Board.restore`, `BoardSnapshot` from `@/board/board` (Task 2).
- Produces: `PlaySession.cleanRun: boolean` (readonly getter), `PlaySummary.cleanRun: boolean`
  (added field), and four new `PlaySessionOptions` fields: `restoreBoard?: BoardSnapshot`,
  `restoreInTray?: readonly PieceId[]`, `restoreHintsUsed?: number`, `restoreCleanRun?: boolean`.
  Task 9/10 (`runtime.ts`) is the consumer.

**Semantics:**

- `cleanRun` starts `true` and flips to `false` the first time `useHint` is called with `tier >= 2`
  (tier 1 is "free, unlimited... a 3×3 region breathing" per `handoff.md`'s own recap of §07 — it
  never touches placement, so it doesn't cost cleanliness; tiers 2/3 reveal or place, which is the
  help a clean run is defined against). Once `false` it never resets within a session — matches
  §07/§15's "a completion is clean only when this stays 0 [hints]" framing, generalized slightly:
  tier-1-only play still keeps `hintsUsed` incrementing (existing behavior, untouched) but
  `cleanRun` specifically tracks whether *placement-affecting* help was used, which is what
  `PLAN.md`'s "clean-run badge" on the (future, step 8) completion card actually needs to show
  something meaningful rather than just "hintsUsed === 0".
- Restore options are all optional and additive: passing none reproduces exactly today's behavior.
  `restoreBoard`, when present, is passed to `Board.restore(input, restoreBoard)` in place of
  `createBoard(input)`. `restoreInTray`, when present, replaces the constructor's default
  "everything starts in tray" loop — seeds `this.inTray` with exactly these ids instead.
  `restoreHintsUsed`/`restoreCleanRun` seed the matching private fields directly.

- [ ] **Step 1: Write the failing tests**

Add to `test/play/session.test.ts` (reuse whatever fixture-building helper the file already has for
constructing a `PlaySession` with a small piece set — do not duplicate it; if the file builds
sessions via a local helper function, use that same helper and only add the new option fields to
its call):

```ts
describe('cleanRun', () => {
  it('starts true and survives tier-1 hints', () => {
    const session = buildTestSession(); // reuse this file's existing session-builder helper
    expect(session.cleanRun).toBe(true);
    const pieceId = [...session.board.pieces][0]!.id;
    session.useHint(pieceId, 1, 'classic', 0);
    expect(session.cleanRun).toBe(true);
  });

  it('flips false on a tier-2 hint and stays false', () => {
    const session = buildTestSession();
    const pieceId = [...session.board.pieces][0]!.id;
    session.useHint(pieceId, 2, 'classic', 0);
    expect(session.cleanRun).toBe(false);
    session.useHint(pieceId, 1, 'classic', 0);
    expect(session.cleanRun).toBe(false);
  });

  it('is exposed on summary', () => {
    const session = buildTestSession();
    expect(session.summary.cleanRun).toBe(true);
  });
});

describe('restore options', () => {
  it('restoreInTray seeds tray membership exactly, overriding startInTray', () => {
    const pieces = testPieces(); // reuse this file's existing pieces fixture
    const firstId = pieces[0]!.id;
    const session = new PlaySession({
      pieces,
      boardW: 4,
      boardH: 4,
      pathScale: 1,
      restoreInTray: [firstId],
    });
    expect(session.locationOf(firstId)).toBe('tray');
    const others = pieces.filter((p) => p.id !== firstId);
    for (const piece of others) {
      expect(session.locationOf(piece.id)).not.toBe('tray');
    }
  });

  it('restoreHintsUsed and restoreCleanRun seed their fields', () => {
    const session = new PlaySession({
      pieces: testPieces(),
      boardW: 4,
      boardH: 4,
      pathScale: 1,
      restoreHintsUsed: 2,
      restoreCleanRun: false,
    });
    expect(session.summary.hintsUsed).toBe(2);
    expect(session.cleanRun).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/play/session.test.ts`
Expected: FAIL — `cleanRun`/the new options don't exist yet. (If `buildTestSession`/`testPieces`
aren't the actual helper names in the existing file, use whatever names it already has — check the
file first and match its existing convention rather than inventing new fixture names.)

- [ ] **Step 3: Implement**

In `src/play/session.ts`, add the import:

```ts
import { Board, createBoard } from '@/board/board';
import type { BoardSnapshot } from '@/board/board';
```

(Check the existing import line for `@/board/board` first — it likely already imports
`createBoard`; add `Board` and the type import alongside it rather than creating a second import
statement.)

Add four fields to `PlaySessionOptions`, after `startedAtMs?: number;`:

```ts
  /** Step 5c: seed the board from saved state instead of a fresh cut. */
  restoreBoard?: BoardSnapshot;
  /**
   * Step 5c: seed tray membership from saved state instead of the
   * `startInTray` default. When present, overrides `startInTray` entirely.
   */
  restoreInTray?: readonly PieceId[];
  restoreHintsUsed?: number;
  restoreCleanRun?: boolean;
```

Add a private field near `hintsUsed`:

```ts
  private cleanRun_: boolean;
```

Add a public getter near the existing `heldCluster` getter:

```ts
  get cleanRun(): boolean {
    return this.cleanRun_;
  }
```

In the constructor, change the board-creation line:

```ts
    this.board = createBoard(
```

to:

```ts
    this.board = options.restoreBoard
      ? Board.restore(
          options.pieces.map((piece) => ({
            id: piece.id,
            targetX: piece.targetX,
            targetY: piece.targetY,
            w: piece.worldW,
            h: piece.worldH,
            neighbours: piece.neighbours,
          })),
          options.restoreBoard,
        )
      : createBoard(
```

— note the trailing `(` — the existing multi-line `.map(...)` argument that already follows
`createBoard(` stays exactly as-is, just now closes the ternary's else-branch call instead of a bare
call. (i.e., wrap the existing `createBoard(...)` call in a ternary; don't duplicate the `.map(...)`
body — write it once and reference it, or write it twice identically if your editor makes threading
a shared variable awkward inline. Simplest: extract it to a local first.)

The cleanest concrete edit — replace the whole existing block:

```ts
    this.board = createBoard(
      options.pieces.map((piece) => ({
        id: piece.id,
        targetX: piece.targetX,
        targetY: piece.targetY,
        w: piece.worldW,
        h: piece.worldH,
        neighbours: piece.neighbours,
      })),
    );
```

with:

```ts
    const boardInput = options.pieces.map((piece) => ({
      id: piece.id,
      targetX: piece.targetX,
      targetY: piece.targetY,
      w: piece.worldW,
      h: piece.worldH,
      neighbours: piece.neighbours,
    }));
    this.board = options.restoreBoard
      ? Board.restore(boardInput, options.restoreBoard)
      : createBoard(boardInput);
```

Change the tray-population loop from:

```ts
    for (const piece of options.pieces) {
      this.source.set(piece.id, piece);
      this.polygons.set(piece.id, polygonFromPath(piece.path, options.pathScale));
      if (options.startInTray !== false) this.inTray.add(piece.id);
    }
```

to:

```ts
    for (const piece of options.pieces) {
      this.source.set(piece.id, piece);
      this.polygons.set(piece.id, polygonFromPath(piece.path, options.pathScale));
    }
    if (options.restoreInTray) {
      for (const id of options.restoreInTray) this.inTray.add(id);
    } else if (options.startInTray !== false) {
      for (const piece of options.pieces) this.inTray.add(piece.id);
    }
```

Set the two new private fields, right after `this.startedAtMs = options.startedAtMs ?? 0;`:

```ts
    this.hintsUsed = options.restoreHintsUsed ?? 0;
    this.cleanRun_ = options.restoreCleanRun ?? true;
```

(Remove the old `private hintsUsed = 0;` field initializer if it's a class-field default — since
it's now set in the constructor body, change the class field declaration to just `private
hintsUsed: number;` with no initializer, to avoid TypeScript's "declared but not definitely
assigned before the field initializer runs" ordering — field initializers run before constructor
body statements, so a bare `private hintsUsed = 0;` followed by a constructor assignment is legal
and harmless either way; leaving the `= 0` default in place and simply reassigning in the
constructor also works and is the smaller diff — do that instead, no need to touch the field
declaration line at all.)

In `useHint`, change:

```ts
    this.hintsUsed = spendTier(tier, this.hintsUsed, mode);
    if (tier === 3) this.placeHint(pieceId);
```

to:

```ts
    this.hintsUsed = spendTier(tier, this.hintsUsed, mode);
    if (tier >= 2) this.cleanRun_ = false;
    if (tier === 3) this.placeHint(pieceId);
```

Add `cleanRun` to `PlaySummary`:

```ts
export interface PlaySummary {
  placed: number;
  total: number;
  completion: number;
  hintsUsed: number;
  cleanRun: boolean;
}
```

And to the `summary` getter's return object:

```ts
  get summary(): PlaySummary {
    const total = this.board.pieceCount;
    return {
      placed: this.board.placedCount,
      total,
      completion: total === 0 ? 0 : this.board.placedCount / total,
      hintsUsed: this.hintsUsed,
      cleanRun: this.cleanRun_,
    };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/play/session.test.ts`
Expected: PASS, all cases including the new ones.

- [ ] **Step 5: Run the full unit suite, typecheck, and commit**

Run: `npm test && npm run typecheck`
Expected: both clean.

```bash
git add src/play/session.ts test/play/session.test.ts
git commit -m "Step 5c: cleanRun tracking and restore options on PlaySession"
```

---

### Task 5: `TrayModel` restore surface — `src/tray/tray.ts`

**Files:**
- Modify: `src/tray/tray.ts`
- Test: `test/tray/tray.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `TrayModel.pinned: readonly PieceId[]` (getter), `TrayModel.restoreOrder(order:
  readonly PieceId[]): void`, `TrayModel.restorePinned(ids: readonly PieceId[]): void`. Task 9/10
  (`runtime.ts`) is the consumer.

**Semantics:**

- `pinned` exposes the existing private `pinned_` set as an array — needed because `packPieces`-
  adjacent code needs to *read* pin state to save it, and today only `isPinned(id)` (a per-piece
  question) exists.
- `restoreOrder` replaces `this.order_` wholesale. No validation against the model's own piece set
  is performed here — the caller (Task 9/10's `PlayRuntime`) is responsible for only ever passing an
  order it just read out of a snapshot for this exact puzzle, the same trust relationship
  `release()` already has with its caller for `clusterId` elsewhere in this codebase.
- `restorePinned` clears `pinned_` and re-adds exactly the given ids, **without** re-running
  `pin()`'s `locationOf(id) === 'tray'` gate — restore is reconstructing a state that was valid when
  saved, not re-deriving validity from a live board that may not exist yet at the point `TrayModel`
  is restored (`PlayRuntime.build()` constructs `TrayModel` and `PlaySession` at the same point, so
  ordering between them during restore is a real concern the plan's Task 9/10 has to get right —
  flagging it here so it isn't re-litigated there).

- [ ] **Step 1: Write the failing tests**

Add to `test/tray/tray.test.ts` (reuse the existing file's piece-fixture helper for constructing a
`TrayModel` — check its current imports/helpers first):

```ts
describe('restoreOrder / restorePinned / pinned', () => {
  it('pinned reflects pin() calls as an array', () => {
    const model = buildTestTrayModel(); // reuse this file's existing helper
    const ids = model.order;
    model.pin(ids[0]!);
    model.pin(ids[1]!);
    expect(model.pinned).toEqual(expect.arrayContaining([ids[0], ids[1]]));
    expect(model.pinned).toHaveLength(2);
  });

  it('restoreOrder replaces the order wholesale', () => {
    const model = buildTestTrayModel();
    const reversed = [...model.order].reverse();
    model.restoreOrder(reversed);
    expect(model.order).toEqual(reversed);
  });

  it('restorePinned sets pin state without re-checking location', () => {
    const model = buildTestTrayModel();
    const ids = model.order;
    model.restorePinned([ids[0]!, ids[2]!]);
    expect(model.isPinned(ids[0]!)).toBe(true);
    expect(model.isPinned(ids[2]!)).toBe(true);
    expect(model.isPinned(ids[1]!)).toBe(false);
  });

  it('restorePinned clears any prior pin state first', () => {
    const model = buildTestTrayModel();
    const ids = model.order;
    model.pin(ids[0]!);
    model.restorePinned([ids[1]!]);
    expect(model.isPinned(ids[0]!)).toBe(false);
    expect(model.isPinned(ids[1]!)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/tray/tray.test.ts`
Expected: FAIL — the three new members don't exist. (Match `buildTestTrayModel` to whatever the
file's actual existing helper is named.)

- [ ] **Step 3: Implement**

Add to the `TrayModel` class in `src/tray/tray.ts`, near the existing `pin`/`unpin`/`isPinned`
methods:

```ts
  get pinned(): readonly PieceId[] {
    return [...this.pinned_];
  }

  /** Step 5c: replace the order wholesale, from a saved snapshot. */
  restoreOrder(order: readonly PieceId[]): void {
    this.order_ = [...order];
  }

  /**
   * Step 5c: set pin state directly from a saved snapshot, without `pin()`'s
   * live-location gate — restore is reconstructing a state that was already
   * valid when saved.
   */
  restorePinned(ids: readonly PieceId[]): void {
    this.pinned_.clear();
    for (const id of ids) this.pinned_.add(id);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/tray/tray.test.ts`
Expected: PASS, all cases including the new ones.

- [ ] **Step 5: Run the full unit suite, typecheck, and commit**

Run: `npm test && npm run typecheck`
Expected: both clean.

```bash
git add src/tray/tray.ts test/tray/tray.test.ts
git commit -m "Step 5c: TrayModel restore surface — pinned getter, restoreOrder, restorePinned"
```

---

### Task 6: Tray scroll capture — `src/ui/PieceGrid.tsx`

**Files:**
- Modify: `src/ui/PieceGrid.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PieceGridProps.onScroll?: (top: number) => void`,
  `PieceGridProps.initialScrollTop?: number`. Task 15 (`App.tsx`) is the consumer, threading it
  through `Tray.tsx`/`Sheet.tsx`'s existing prop-drilling to reach this component (both already pass
  props down from `App.tsx` through to `PieceGrid` for its other props — follow that same path,
  don't invent a new one).

No unit test — this is a DOM/scroll-container concern, the same hand-judged category as the rest of
this file's virtualization logic (`get_file_outline` on this file shows it's already untested at
the unit level; its existing scroll-position tracking for virtualization has no test either).
Covered by Task 17's browser specs, which restore a real scroll position and check it visually
resumes.

**Semantics:**

- The component already has a `scroller` ref and an existing scroll handler that reads
  `element.scrollTop` for virtualization range calculation (confirmed at this file's line ~68). Add
  the new `onScroll` prop's call **inside that same existing handler**, not a second listener — one
  scroll event, two consumers, matching the pattern the file already establishes for combining
  concerns on one event.
- `initialScrollTop`, if provided, is applied once, in the same `useEffect` (or ref callback) that
  currently sets up the scroll listener — set `scroller.current.scrollTop = initialScrollTop` before
  the first paint's virtualization range is computed, so the grid opens already scrolled rather than
  flashing at the top first.

- [ ] **Step 1: Add the two props and wire them**

In `src/ui/PieceGrid.tsx`, add to `PieceGridProps`:

```ts
  /** Step 5c: fired on every scroll, human-speed only — not a per-frame hook. */
  onScroll?: (top: number) => void;
  /** Step 5c: applied once, before the first virtualization pass. */
  initialScrollTop?: number;
```

Find the existing scroll-tracking code (the effect/handler that reads `element.scrollTop` — search
for the `scroller` ref's usage). Add the `onScroll?.(element.scrollTop)` call inside that same
handler, alongside whatever it already does with `scrollTop` for virtualization. Find the effect
that attaches the listener to `scroller.current` (likely a `useEffect` with `scroller` in its
cleanup) and, in that same effect, before attaching the listener, add:

```ts
    if (initialScrollTop !== undefined) {
      element.scrollTop = initialScrollTop;
    }
```

(where `element` is whatever the existing code already calls the dereferenced `scroller.current` —
match its existing variable name.) Destructure `onScroll`/`initialScrollTop` out of the function's
props alongside the existing ones.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/ui/PieceGrid.tsx
git commit -m "Step 5c: tray scroll position capture/restore hooks"
```

---

### Task 7: `nextHarderCount` — `src/play/setup.ts`

**Files:**
- Modify: `src/play/setup.ts`
- Test: `test/play/setup.test.ts`

**Interfaces:**
- Consumes: `PIECE_COUNT_LADDER` (already in this file).
- Produces: `nextHarderCount(current: number): number | null`. Task 16 (`CompletionBanner.tsx`) and
  Task 15 (`App.tsx`) are the consumers.

**Semantics:**

- Returns the next value in `PIECE_COUNT_LADDER` strictly greater than `current`, or `null` if
  `current` is already at or above the ladder's max (250) — including if `current` isn't itself one
  of the five ladder values (e.g. a photo whose real cut landed on a slightly different count than
  its target, per §04's "show the real computed number, never the target" — this function works off
  the *target* count the puzzle was configured with, not its realized `cols × rows`, so it should
  always be one of the five ladder values in practice, but the function is defensive about it
  anyway).

- [ ] **Step 1: Write the failing tests**

Add to `test/play/setup.test.ts`:

```ts
describe('nextHarderCount', () => {
  it('steps to the next rung', () => {
    expect(nextHarderCount(50)).toBe(100);
    expect(nextHarderCount(150)).toBe(200);
  });

  it('returns null once already at the max', () => {
    expect(nextHarderCount(250)).toBeNull();
  });

  it('returns null for a value above the max', () => {
    expect(nextHarderCount(999)).toBeNull();
  });

  it('finds the first rung above an off-ladder value', () => {
    expect(nextHarderCount(120)).toBe(150);
  });
});
```

Add `nextHarderCount` to the existing `import { ... } from '@/play/setup'` line at the top of the
test file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/play/setup.test.ts`
Expected: FAIL — `nextHarderCount` doesn't exist yet.

- [ ] **Step 3: Implement**

Add to `src/play/setup.ts`, after `PIECE_COUNT_LADDER`'s declaration:

```ts
/** The next rung up, or null once already at (or past) the top of the ladder. */
export function nextHarderCount(current: number): number | null {
  for (const count of PIECE_COUNT_LADDER) {
    if (count > current) return count;
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/play/setup.test.ts`
Expected: PASS, all cases including the new ones.

- [ ] **Step 5: Run the full unit suite, typecheck, and commit**

Run: `npm test && npm run typecheck`
Expected: both clean.

```bash
git add src/play/setup.ts test/play/setup.test.ts
git commit -m "Step 5c: nextHarderCount for again-harder"
```

---

### Task 8: Photo, thumbnail, and library stores — `src/persist/{photos,thumbnail,library}.ts`

**Files:**
- Create: `src/persist/photos.ts`
- Create: `src/persist/thumbnail.ts`
- Create: `src/persist/library.ts`

**Interfaces:**
- Consumes: `idbGet`/`idbPut`/`idbDelete`/`idbGetAll`, `STORE_PHOTOS`, `STORE_THUMBNAILS`,
  `STORE_SESSIONS` from `@/persist/db` (Task 1); `SessionSnapshot` from `@/persist/snapshot`
  (Task 3).
- Produces: `savePhoto`, `loadPhoto`, `deletePhoto`; `captureThumbnail`; `LibraryEntry`,
  `listLibrary`, `saveLibraryEntry`, `deleteLibraryEntry` — all as declared in the plan's Interfaces
  section. Task 9/10 (`runtime.ts`) and Tasks 13/14/15 (UI) are the consumers.

No unit test — every function here is a thin IndexedDB/Blob/canvas wrapper, browser-only, same
hand-judged category as Task 1. Verified end-to-end by Task 17's browser specs.

**Semantics:**

- `savePhoto`/`loadPhoto`/`deletePhoto`: `photos` store holds `{ puzzleId, blob: Blob }` records.
  `loadPhoto` reads the blob and decodes it via `createImageBitmap(blob)` — a **fresh** bitmap every
  call, per the design's "photo blob is the canonical source, decode a working copy on demand" rule.
  Throws if no record exists for `puzzleId` (a missing photo for an in-progress puzzle is a data
  integrity bug worth surfacing loudly, not silently returning a blank board).
- `captureThumbnail`: draws the given canvas down to a fixed small width (320px, preserving aspect)
  via an intermediate `OffscreenCanvas`, then `convertToBlob({ type: 'image/jpeg', quality: 0.8 })`
  — JPEG rather than PNG because this is a photographic thumbnail, not a chip with hard edges, and
  quality 0.8 keeps a 250-piece board's thumbnail well under a few dozen KB.
- `library.ts`'s three functions are the only place `STORE_SESSIONS`/`STORE_THUMBNAILS` are touched
  together: `saveLibraryEntry` writes the snapshot to `STORE_SESSIONS` and the thumbnail blob to
  `STORE_THUMBNAILS` in the same call (two separate `idbPut`s — not a single cross-store
  transaction, since `db.ts`'s wrapper is deliberately one-store-per-call for simplicity, and a
  thumbnail write failing after a snapshot write succeeded is a cosmetic problem, not a correctness
  one, given the debounced-and-idempotent nature of autosave in Task 9/10 — the next 800ms tick
  retries both). `listLibrary` reads both stores and joins them by `puzzleId` client-side, skipping
  any session record whose thumbnail is missing rather than throwing (defensive against exactly the
  partial-write case above). `deleteLibraryEntry` removes from both stores **and** calls
  `deletePhoto` — a deleted library entry has no reason to keep its source photo around.

- [ ] **Step 1: Write `src/persist/photos.ts`**

```ts
/**
 * The source photo, stored once per puzzle and never rewritten — the
 * canonical durable copy every other consumer (restore, the pause sheet's
 * reference image, "again, harder") decodes a fresh working `ImageBitmap`
 * from on demand, per the design's photo-blob-as-source-of-truth decision.
 */

import { idbDelete, idbGet, idbPut, STORE_PHOTOS } from './db';

interface PhotoRecord {
  puzzleId: string;
  blob: Blob;
}

export async function savePhoto(puzzleId: string, blob: Blob): Promise<void> {
  await idbPut<PhotoRecord>(STORE_PHOTOS, { puzzleId, blob });
}

export async function loadPhoto(puzzleId: string): Promise<ImageBitmap> {
  const record = await idbGet<PhotoRecord>(STORE_PHOTOS, puzzleId);
  if (!record) throw new Error(`No stored photo for puzzle ${puzzleId}`);
  return createImageBitmap(record.blob);
}

export async function deletePhoto(puzzleId: string): Promise<void> {
  await idbDelete(STORE_PHOTOS, puzzleId);
}
```

- [ ] **Step 2: Write `src/persist/thumbnail.ts`**

```ts
/**
 * Library-card thumbnails: the actual current board, not the source photo
 * (`PLAN.md`'s explicit requirement), downsampled small at save time so a
 * library read is a blob read — no re-cutting, no re-rendering.
 */

const THUMBNAIL_WIDTH = 320;

export async function captureThumbnail(
  source: HTMLCanvasElement | OffscreenCanvas,
): Promise<Blob> {
  const scale = THUMBNAIL_WIDTH / source.width;
  const width = THUMBNAIL_WIDTH;
  const height = Math.round(source.height * scale);

  const target = new OffscreenCanvas(width, height);
  const ctx = target.getContext('2d');
  if (!ctx) throw new Error('captureThumbnail: 2d context unavailable');
  ctx.drawImage(source, 0, 0, width, height);

  return target.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
}
```

- [ ] **Step 3: Write `src/persist/library.ts`**

```ts
/**
 * The library — in-progress puzzles. Joins the sessions and thumbnails
 * stores by `puzzleId` client-side, rather than a cross-store transaction:
 * a thumbnail write failing after a snapshot write succeeded is cosmetic,
 * not a correctness problem, given autosave retries both every 800ms.
 */

import {
  idbDelete,
  idbGet,
  idbGetAll,
  idbPut,
  STORE_SESSIONS,
  STORE_THUMBNAILS,
} from './db';
import { deletePhoto } from './photos';
import type { SessionSnapshot } from './snapshot';

export interface LibraryEntry {
  puzzleId: string;
  snapshot: SessionSnapshot;
  thumbnailBlob: Blob;
  updatedAt: number;
}

interface ThumbnailRecord {
  puzzleId: string;
  blob: Blob;
}

export async function listLibrary(): Promise<LibraryEntry[]> {
  const [sessions, thumbnails] = await Promise.all([
    idbGetAll<SessionSnapshot>(STORE_SESSIONS),
    idbGetAll<ThumbnailRecord>(STORE_THUMBNAILS),
  ]);
  const thumbById = new Map(thumbnails.map((t) => [t.puzzleId, t.blob]));

  const entries: LibraryEntry[] = [];
  for (const snapshot of sessions) {
    const thumbnailBlob = thumbById.get(snapshot.puzzleId);
    if (!thumbnailBlob) continue;
    entries.push({
      puzzleId: snapshot.puzzleId,
      snapshot,
      thumbnailBlob,
      updatedAt: snapshot.updatedAt,
    });
  }
  entries.sort((a, b) => b.updatedAt - a.updatedAt);
  return entries;
}

export async function saveLibraryEntry(entry: LibraryEntry): Promise<void> {
  await Promise.all([
    idbPut<SessionSnapshot>(STORE_SESSIONS, entry.snapshot),
    idbPut<ThumbnailRecord>(STORE_THUMBNAILS, {
      puzzleId: entry.puzzleId,
      blob: entry.thumbnailBlob,
    }),
  ]);
}

export async function deleteLibraryEntry(puzzleId: string): Promise<void> {
  await Promise.all([
    idbDelete(STORE_SESSIONS, puzzleId),
    idbDelete(STORE_THUMBNAILS, puzzleId),
    deletePhoto(puzzleId),
  ]);
}

export async function loadSnapshot(puzzleId: string): Promise<SessionSnapshot | undefined> {
  return idbGet<SessionSnapshot>(STORE_SESSIONS, puzzleId);
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/persist/photos.ts src/persist/thumbnail.ts src/persist/library.ts
git commit -m "Step 5c: photo, thumbnail, and library IndexedDB stores"
```

---

### Task 9: `PlayRuntime` — camera getter, `snapshot()`, completion status, autosave

**Files:**
- Modify: `src/play/runtime.ts`

**Interfaces:**
- Consumes: `packPieces`, `SessionSnapshot` from `@/persist/snapshot` (Task 3); `TrayModel.pinned`
  from `@/tray/tray` (Task 5); `PlaySession.cleanRun`/`summary.cleanRun` from `@/play/session`
  (Task 4); `nextHarderCount` not needed here (that's Task 16's concern); `saveLibraryEntry`,
  `captureThumbnail` from `@/persist/library`/`@/persist/thumbnail` (Task 8).
- Produces: `PlayRuntime.cameraState` getter, `PlayRuntime.snapshot(chrome)`,
  `RuntimeSummary.status` gains `'complete'`, `PlayRuntimeOptions.puzzleId: string` (now required),
  `PlayRuntimeOptions.onSave?` — Task 15 (`App.tsx`) is the consumer for all of it. Task 10 (this
  same file, restore/live-settings) is a sibling task, not a dependency — order them either way.

**Semantics:**

- `cameraState` is a plain getter returning `{ x: this.camera.x, y: this.camera.y, zoom:
  this.camera.zoom }` — read-only, no setter (the camera is already mutated internally via
  `this.camera = ...` at several call sites; nothing here changes that).
- `snapshot(chrome)` assembles a full `SessionSnapshot` from: `this.options.puzzleId`/`seed`, the
  cut's real `cols`/`rows` (already tracked in `this.summary.cut`), `this.options.targetCount`,
  `this.mode`, `this.options.rotation ?? false`, `this.options.difficulty ?? 'standard'` (note: once
  Task 10 adds live `setAssists`/`setDifficulty`, these should read from whatever *current* mutable
  copy Task 10 introduces, not the frozen `this.options` — see Task 10's note on this), the current
  assists, `packPieces(this.session.board)`, `this.session.board.pieceCount`, `[...
  this.session.board.clusters.values()].map(...)` shaped as `BoardClusterSnapshot[]`,
  `this.session.worksets.all()` mapped to the snapshot's `worksets` shape, `this.cameraState`, tray
  fields (`this.tray.order`, `this.tray.pinned`, and a **new** `trayIds` — every piece id where
  `this.session.locationOf(id) === 'tray'`, computed by scanning `this.session.board.pieces` — plus
  `chrome.lens`/`chrome.lensArg`/`chrome.scroll` passed in by the caller, since lens state lives in
  React's Zustand store and this class has no reason to know about it), `timer: { elapsedMs:
  this.session.elapsedMs(performance.now()), running: this.summary.status === 'playing' }`,
  `hintsUsed`/`cleanRun` from `this.session.summary`, `placed`/`total` likewise, `updatedAt:
  Date.now()`. Returns `null` if `this.session` doesn't exist yet (still cutting) — nothing to save.
- `RuntimeSummary.status` gains `'complete'`. Set inside `onPlayEvent`'s existing `if (event.type ===
  'complete') this.renderer.completePuzzle(now);` line — add `this.patch({ status: 'complete' });`
  immediately after it.
- **Autosave.** Two triggers:
  1. **Debounced (800ms).** At the end of `onPlayEvent` (after the existing `if (this.session) { ...
     this.patch(...) }` block), call `this.scheduleSave()`. That method clears any pending
     `setTimeout` and sets a new one for 800ms that calls `this.saveNow()`.
  2. **Synchronous, on `interrupt()`.** `interrupt()` already exists and is already wired to
     `visibilitychange` from `App.tsx` — add `this.saveNow()` (not `scheduleSave` — this one must
     happen synchronously, before the tab is actually backgrounded, per `PLAN.md`'s "synchronous
     write on visibilitychange") as its first line.
  - `saveNow()` itself: if no `this.session` or no `this.options.onSave`, return. Otherwise get
    `const snap = this.snapshot(...)` — but `snapshot()` needs `chrome` (lens/lensArg/scroll), which
    `PlayRuntime` doesn't own. Resolve this by having `PlayRuntime` **not** call `saveLibraryEntry`
    itself — instead it calls `this.options.onSave?.(snapshot, canvas)` where `snapshot` is built
    from everything `PlayRuntime` *does* own (lens/lensArg/scroll left as placeholders the caller
    fills in) — see the concrete signature note below. The actual IndexedDB write and thumbnail
    capture happen in `App.tsx` (Task 15), which is where the chrome-side lens/scroll state already
    lives; `PlayRuntime` hands up everything it owns and a reference to a canvas to thumbnail from.
  - Concretely: `snapshot()` takes the chrome fields as **required parameters** (not optional —
    forces every caller to supply them, so there's no silent "saved with wrong lens" bug), and
    `saveNow()` calls `this.options.onSave?.(this, this.renderer.canvasFor('static'))` — passing
    `this` (the runtime) rather than a pre-built snapshot, so `App.tsx` can call `runtime.snapshot({
    lens, lensArg, scroll })` itself with the live Zustand values at the exact moment of saving.
    (Check `renderer.ts` for a way to get its static-layer canvas — if no such accessor exists
    today, add a minimal one, `getStaticCanvas(): HTMLCanvasElement | OffscreenCanvas`, returning
    the internal canvas `paintStatic` draws into. This is a small, additive change to `renderer.ts`
    alongside this task.)

- [ ] **Step 1: Add `PlayRuntimeOptions.puzzleId` and `onSave`**

In `src/play/runtime.ts`, add to `PlayRuntimeOptions` (after `seed: number;`):

```ts
  /** Step 5c: the library/save key for this puzzle instance. */
  puzzleId: string;
```

And near `notify`:

```ts
  /**
   * Step 5c autosave. Called on every debounced tick and on `interrupt()`.
   * `runtime` is `this` — passed rather than a pre-built snapshot so the
   * caller can supply live chrome state (lens/lensArg/scroll) at the exact
   * moment of saving.
   */
  onSave?: (runtime: PlayRuntime, canvas: HTMLCanvasElement | OffscreenCanvas) => void;
```

- [ ] **Step 2: Add the camera getter**

Near the existing `bitmapOf` method:

```ts
  get cameraState(): { x: number; y: number; zoom: number } {
    return { x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom };
  }
```

- [ ] **Step 3: Add `getStaticCanvas` to `Renderer`**

Check `src/render/renderer.ts` for an existing way to reach the canvas `paintStatic` draws into
(search for the class fields holding per-layer canvases — likely a `Map<string, OffscreenCanvas>`
or similar, given the five-layer stack). Add a public method, next to `setAccent`:

```ts
  getStaticCanvas(): OffscreenCanvas | HTMLCanvasElement {
    return this.staticCanvas; // match the actual field name this class uses for the static layer
  }
```

(Match whatever the actual private field name is — inspect the class before writing this method,
since the exact field name wasn't confirmed while writing this plan. If the static layer's canvas is
wrapped in some other structure, e.g. a layer object with a `.canvas` property, adjust the return
expression accordingly, but the method's public signature and purpose stay exactly as above.)

- [ ] **Step 4: Add `snapshot()` to `PlayRuntime`**

Add the import at the top of `runtime.ts`:

```ts
import { packPieces } from '@/persist/snapshot';
import type { SessionSnapshot } from '@/persist/snapshot';
import type { Lens } from '@/tray/lenses';
```

Add the method, near `bitmapOf`:

```ts
  /**
   * Everything this class owns, assembled into the save format. `chrome` is
   * the lens/scroll state this class has no reason to know about — the
   * caller (`App.tsx`) supplies it live at the moment of saving.
   *
   * Returns null while still cutting — there is no session yet to save.
   */
  snapshot(chrome: { lens: Lens; lensArg: number | null; scroll: number }): SessionSnapshot | null {
    const session = this.session;
    const tray = this.tray;
    if (!session || !tray) return null;

    const trayIds = session.board.pieces
      .filter((piece) => session.locationOf(piece.id) === 'tray')
      .map((piece) => piece.id);

    return {
      version: 1,
      puzzleId: this.options.puzzleId,
      seed: this.options.seed,
      cols: this.summary.cut.cols,
      rows: this.summary.cut.rows,
      targetCount: this.options.targetCount,
      mode: this.mode,
      rotation: this.options.rotation ?? false,
      difficulty: this.options.difficulty ?? 'standard',
      assists: this.options.assists ?? {
        ghostOpacity: 0,
        edgeHighlight: false,
        largePieceMode: false,
      },
      pieces: packPieces(session.board),
      pieceCount: session.board.pieceCount,
      clusters: [...session.board.clusters.values()].map((c) => ({
        id: c.id,
        x: c.x,
        y: c.y,
        rot: c.rot,
        kind: c.kind,
        label: c.label,
        collapsed: c.collapsed,
      })),
      worksets: session.worksets.all().map((w) => ({
        id: w.id,
        label: w.label,
        collapsed: w.collapsed,
        pieceIds: [...w.pieceIds],
      })),
      camera: this.cameraState,
      tray: {
        order: [...tray.order],
        pinned: [...tray.pinned],
        trayIds,
        lens: chrome.lens,
        lensArg: chrome.lensArg,
        scroll: chrome.scroll,
      },
      timer: {
        elapsedMs: session.elapsedMs(performance.now()),
        running: this.summary.status === 'playing',
      },
      hintsUsed: session.summary.hintsUsed,
      cleanRun: session.summary.cleanRun,
      placed: session.summary.placed,
      total: session.summary.total,
      updatedAt: Date.now(),
    };
  }
```

- [ ] **Step 5: Wire completion status**

In `onPlayEvent`, change:

```ts
    if (event.type === 'complete') this.renderer.completePuzzle(now);
```

to:

```ts
    if (event.type === 'complete') {
      this.renderer.completePuzzle(now);
      this.patch({ status: 'complete' });
    }
```

Update `RuntimeSummary`'s `status` field type:

```ts
export interface RuntimeSummary {
  status: 'cutting' | 'playing' | 'complete' | 'failed';
```

- [ ] **Step 6: Wire autosave scheduling**

Add a private field:

```ts
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
```

Add near the bottom of `onPlayEvent`, after the existing `if (this.session) { ... this.patch(...) }`
block:

```ts
    this.scheduleSave();
```

Add the two new private methods, near `destroy()`:

```ts
  private scheduleSave(): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 800);
  }

  private saveNow(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.session || !this.options.onSave) return;
    this.options.onSave(this, this.renderer.getStaticCanvas());
  }
```

Update `interrupt()`:

```ts
  interrupt(): void {
    this.saveNow();
    this.controls?.interrupt();
    this.audio.suspend();
  }
```

Update `destroy()` to clear the pending timer:

```ts
  destroy(): void {
    this.destroyed = true;
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    if (this.regionTimer !== null) clearTimeout(this.regionTimer);
    this.controls?.destroy();
    this.renderer.setGhostUnderlay(null, 0);
    this.renderer.destroy();
    this.ghostSource?.close();
    this.ghostSource = null;
    this.audio.suspend();
  }
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: clean.

(No unit test for this task — `PlayRuntime` is the DOM/Web-Audio-adjacent class judged by hand per
`CLAUDE.md`'s testing posture, same as the rest of this file. Task 17's browser specs are where the
autosave path earns its coverage — specifically `persistence.spec.ts`'s reload test.)

- [ ] **Step 8: Commit**

```bash
git add src/play/runtime.ts src/render/renderer.ts
git commit -m "Step 5c: PlayRuntime.snapshot(), completion status, and autosave scheduling"
```

---

### Task 10: `PlayRuntime` — restore construction path and live settings

**Files:**
- Modify: `src/play/runtime.ts`

**Interfaces:**
- Consumes: `unpackPieces`, `SessionSnapshot` from `@/persist/snapshot` (Task 3); `PlaySession`'s
  new `restoreBoard`/`restoreInTray`/`restoreHintsUsed`/`restoreCleanRun` options (Task 4);
  `TrayModel.restoreOrder`/`restorePinned` (Task 5).
- Produces: `PlayRuntimeOptions.restore?: { snapshot: SessionSnapshot }`,
  `PlayRuntime.setAssists(assists)`, `PlayRuntime.setDifficulty(difficulty)`. Task 15 (`App.tsx`) is
  the consumer.

**Semantics:**

- `PlayRuntimeOptions.restore`, when present, changes `build()`'s session/board construction to seed
  from the snapshot instead of a fresh cut's default state. **The cut itself still runs in full** —
  restore needs the same `cutInWorker` call `start()` already makes (piece bitmaps aren't stored,
  only geometry-independent state is), it's only the *post-cut* board/tray/worksets/hints
  construction that diverges.
- Concretely, in `build(cut: CutPiece[])`: build `boardInput` the same way `PlaySession`'s
  constructor internally does (this class doesn't need to duplicate that — it already passes `cut`
  straight to `new PlaySession({ pieces: cut, ... })`, so the restore fields simply get threaded into
  that same options object):
  ```ts
  const restore = this.options.restore;
  const session = new PlaySession({
    pieces: cut,
    boardW: this.boardW,
    boardH: this.boardH,
    pathScale: this.pathScale,
    ...(this.options.difficulty ? { difficulty: this.options.difficulty } : {}),
    ...(this.options.rotation !== undefined ? { rotation: this.options.rotation } : {}),
    ...(this.options.reducedMotion !== undefined ? { reducedMotion: this.options.reducedMotion } : {}),
    ...(restore
      ? {
          restoreBoard: {
            clusters: restore.snapshot.clusters,
            pieces: unpackPieces(restore.snapshot.pieces, restore.snapshot.pieceCount),
          },
          restoreInTray: restore.snapshot.tray.trayIds,
          restoreHintsUsed: restore.snapshot.hintsUsed,
          restoreCleanRun: restore.snapshot.cleanRun,
          startedAtMs: performance.now() - restore.snapshot.timer.elapsedMs,
        }
      : {}),
    onEvent: (event) => this.onPlayEvent(event),
  });
  ```
  (This replaces the existing `new PlaySession({...})` call inside `build()` — same call, additive
  spread.)
- After constructing `this.tray = new TrayModel({...})` (unchanged construction), if `restore` is
  present, immediately call `this.tray.restoreOrder(restore.snapshot.tray.order)` and
  `this.tray.restorePinned(restore.snapshot.tray.pinned)`.
- After that, if `restore` is present, replay worksets: for each entry in
  `restore.snapshot.worksets`, call `session.worksets.create(entry.pieceIds, entry.label)` and, if
  `entry.collapsed`, `session.worksets.setCollapsed(<returned id>, true)`.
- Camera: after `this.frameContent()` runs (which computes a fresh fit-to-content camera — wrong for
  a restore, which should reopen exactly where the player left it), if `restore` is present,
  overwrite: `this.camera = { ...restore.snapshot.camera };` — placed **after** the existing
  `this.frameContent(); this.render();` calls at the end of `build()`, followed by one more
  `this.render()` so the overwritten camera actually gets drawn.
- **Live settings.** `setAssists(assists)`: store the new value (`this.options` is `readonly` per
  the constructor's `private readonly options` — since assists must now be mutable post-construction,
  add a separate mutable field `private liveAssists: PuzzleAssists` initialized from
  `this.options.assists ?? DEFAULT`, and change every read site in this file that currently reads
  `this.options.assists` to read `this.liveAssists` instead — that's `build()`'s ghost/edge-highlight
  wiring, `frameContent()`'s zoom-floor line, and `snapshot()`'s `assists` field from Task 9. `
  setAssists` updates `this.liveAssists` and re-applies its effects immediately: `this.renderer.
  setGhostUnderlay(this.ghostSource, assists.ghostOpacity)`, `this.renderer.setEdgeHighlight(
  assists.edgeHighlight)`, and if `largePieceMode` changed, update the live `BoardControls`'
  zoom floor — check whether `BoardControls`/`CameraControls` expose a setter for
  `minRelativeZoom` post-construction; if not (Task 3 of the 5b plan only threaded it through the
  constructor), add one: `CameraControls.setMinRelativeZoom(value: number): void` storing it on the
  existing `private readonly minRelativeZoom` field (change `readonly` to a plain mutable field),
  and `BoardControls.setMinRelativeZoom` forwarding to its inner `CameraControls` instance. Call it
  from `PlayRuntime.setAssists`.
- `setDifficulty(difficulty)`: similarly needs a mutable field, `private liveDifficulty:
  SnapDifficulty`, since `SnapDifficulty` currently only reaches `PlaySession` at construction
  (`this.options.difficulty` spread into the constructor call above). Check `PlaySession` for
  whether it exposes a live difficulty setter already; if not, add one there too:
  `PlaySession.setDifficulty(difficulty: SnapDifficulty): void` storing it on whatever private field
  the constructor currently sets once and reads at snap-resolution time (search `session.ts` for
  where `options.difficulty` is consumed — likely inside `snapOptions()` or similar, called from
  `release()`). `PlayRuntime.setDifficulty` calls `this.liveDifficulty = difficulty;
  this.session?.setDifficulty(difficulty);`.

- [ ] **Step 1: Add `PlayRuntimeOptions.restore`**

```ts
  /** Step 5c: reopen a saved session instead of starting fresh. */
  restore?: { snapshot: SessionSnapshot };
```

Add the import: `import { unpackPieces } from '@/persist/snapshot';` (alongside the existing
`packPieces` import from Task 9 — one import statement, both names).

- [ ] **Step 2: Introduce `liveAssists`/`liveDifficulty` and update every read site**

Add fields near the constructor:

```ts
  private liveAssists: PuzzleAssists;
  private liveDifficulty: SnapDifficulty;
```

In the constructor body:

```ts
    this.liveAssists = options.assists ?? {
      ghostOpacity: 0,
      edgeHighlight: false,
      largePieceMode: false,
    };
    this.liveDifficulty = options.difficulty ?? 'standard';
```

Find every existing read of `this.options.assists` in this file (`build()`'s ghost/edge-highlight
wiring and `BoardControls` construction, `frameContent()`'s zoom-floor computation) and change them
to `this.liveAssists`. Find the `difficulty` spread into `new PlaySession({...})` (`...
(this.options.difficulty ? { difficulty: this.options.difficulty } : {})`) and change it to
`difficulty: this.liveDifficulty,` (unconditional now, since `liveDifficulty` always has a value).

- [ ] **Step 3: Add the restore fields to the `PlaySession` construction in `build()`**

Apply the change described in this task's Semantics section above to the `new PlaySession({...})`
call inside `private build(cut: CutPiece[]): void`.

- [ ] **Step 4: Restore tray order/pinned and worksets after construction**

Immediately after the existing `this.tray = new TrayModel({...})` block inside `build()`, add:

```ts
    if (restore) {
      this.tray.restoreOrder(restore.snapshot.tray.order);
      this.tray.restorePinned(restore.snapshot.tray.pinned);
      for (const w of restore.snapshot.worksets) {
        const id = session.worksets.create(w.pieceIds, w.label);
        if (id !== -1 && w.collapsed) session.worksets.setCollapsed(id, true);
      }
    }
```

(`restore` here refers to the same `const restore = this.options.restore;` declared in Step 3 above
— declare it once, near the top of `build()`, and reuse it in both places rather than re-reading
`this.options.restore` twice.)

- [ ] **Step 5: Restore the camera after `frameContent()`/`render()` run**

At the end of `build()`, after the existing `this.frameContent(); this.render();
this.scheduleRegion();` lines, add:

```ts
    if (restore) {
      this.camera = { ...restore.snapshot.camera };
      this.render();
    }
```

- [ ] **Step 6: Add `PlaySession.setDifficulty`**

In `src/play/session.ts`, find where `options.difficulty` is currently read (likely a private field
set once in the constructor and consumed by whatever builds `SnapOptions` for `resolveSnap` in
`release()`). Change that field from a `readonly` (or plain, never-reassigned) private field to a
plain mutable one if it isn't already, and add:

```ts
  setDifficulty(difficulty: SnapDifficulty): void {
    this.difficulty = difficulty; // match the actual field name this class already uses
  }
```

- [ ] **Step 7: Add `CameraControls.setMinRelativeZoom` / `BoardControls.setMinRelativeZoom`**

In `src/render/camera-controls.ts`, change `private readonly minRelativeZoom: number;` (added in the
5b plan's Task 3) to `private minRelativeZoom: number;` (drop `readonly`) and add:

```ts
  setMinRelativeZoom(value: number): void {
    this.minRelativeZoom = value;
  }
```

In `src/input/board-controls.ts`, add a forwarding method to the `BoardControls` class:

```ts
  setMinRelativeZoom(value: number): void {
    this.cameraControls.setMinRelativeZoom(value); // match the actual field name holding the inner CameraControls instance
  }
```

- [ ] **Step 8: Add `setAssists`/`setDifficulty` to `PlayRuntime`**

```ts
  /** Step 5c: the pause sheet's live settings. */
  setAssists(assists: PuzzleAssists): void {
    this.liveAssists = assists;
    this.renderer.setGhostUnderlay(this.ghostSource, assists.ghostOpacity);
    this.renderer.setEdgeHighlight(assists.edgeHighlight);
    this.controls?.setMinRelativeZoom(assists.largePieceMode ? REGION_LENS_ZOOM : MIN_ZOOM);
  }

  setDifficulty(difficulty: SnapDifficulty): void {
    this.liveDifficulty = difficulty;
    this.session?.setDifficulty(difficulty);
  }
```

(Import `MIN_ZOOM` from `@/render/camera` alongside the existing named imports from that module in
this file, if not already imported.)

Note on the ghost underlay specifically: turning `ghostOpacity` on live, when it was off at puzzle
start, has no `this.ghostSource` to draw (`start()` only copies the source bitmap "before the
transfer... and only when the assist is on" — see that method's existing comment). If
`assists.ghostOpacity > 0` and `this.ghostSource` is null, `setGhostUnderlay` will be called with a
null bitmap and the opacity will have no visible effect — a known, acceptable limitation for this
pass (flag it in the commit message, don't silently work around it by re-fetching the source, which
would violate the "decode a fresh copy from the stored blob on demand" pattern Task 12 establishes
for exactly this kind of on-demand need — wiring the ghost assist through that same path is a
reasonable follow-up, not required by this plan's spec).

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add src/play/runtime.ts src/play/session.ts src/render/camera-controls.ts src/input/board-controls.ts
git commit -m "Step 5c: PlayRuntime restore construction path, live assists/difficulty settings"
```

---

### Task 11: EXIF orientation and a clear HEIC error path — `src/ui/App.tsx`

**Files:**
- Modify: `src/ui/App.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new for later tasks — a self-contained fix inside `decodeUpload`.

No new unit test. `decodeUpload` is exercised by `test/browser/photo-picker.spec.ts`'s existing
corrupt-upload case; this task extends that spec with a HEIC-named-file case rather than adding a
new file.

**Semantics:**

- `imageOrientation: 'from-image'` added to **both** `createImageBitmap` call sites inside
  `decodeUpload` (the resized and non-resized branches) — explicit rather than relying on a browser
  default that has varied historically across engines.
- HEIC detection: if `createImageBitmap` throws inside `decodeUpload`, check the file's `type` (MIME)
  or `name` extension for `heic`/`heif` (case-insensitive) before falling through to the generic
  error. `App.tsx`'s `handlePhotoChosen` already catches `decodeUpload`'s rejection and sets a
  generic `"Couldn't open that photo. Try a different file."` error string — thread a more specific
  message through for the HEIC case by having `decodeUpload` throw an `Error` with a distinguishable
  message, and having `handlePhotoChosen`'s catch block check for it.

- [ ] **Step 1: Update `decodeUpload`**

In `src/ui/App.tsx`, change:

```ts
async function decodeUpload(file: File): Promise<ImageBitmap> {
  const size = await probeImageSize(file);
  const target = downscaleTarget(size.width, size.height);
  if (target.width === size.width && target.height === size.height) {
    return createImageBitmap(file);
  }
  return createImageBitmap(file, {
    resizeWidth: target.width,
    resizeHeight: target.height,
    resizeQuality: 'high',
  });
}
```

to:

```ts
const HEIC_MESSAGE =
  "HEIC photos aren't supported directly here — try 'Most Compatible' in Settings → Photos, or export as JPEG.";

function looksLikeHeic(file: File): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return type.includes('heic') || type.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif');
}

async function decodeUpload(file: File): Promise<ImageBitmap> {
  try {
    const size = await probeImageSize(file);
    const target = downscaleTarget(size.width, size.height);
    if (target.width === size.width && target.height === size.height) {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    }
    return await createImageBitmap(file, {
      resizeWidth: target.width,
      resizeHeight: target.height,
      resizeQuality: 'high',
      imageOrientation: 'from-image',
    });
  } catch (error) {
    if (looksLikeHeic(file)) throw new Error(HEIC_MESSAGE);
    throw error;
  }
}
```

- [ ] **Step 2: Surface the specific message in `handlePhotoChosen`**

Find the existing `catch` block in `handlePhotoChosen`:

```ts
    } catch {
      setSetupPhase((prev) => {
        if (prev.kind === 'cropping') prev.source.close();
        return { kind: 'picker', error: "Couldn't open that photo. Try a different file." };
      });
    }
```

Change it to:

```ts
    } catch (error) {
      const message =
        error instanceof Error && error.message === HEIC_MESSAGE
          ? HEIC_MESSAGE
          : "Couldn't open that photo. Try a different file.";
      setSetupPhase((prev) => {
        if (prev.kind === 'cropping') prev.source.close();
        return { kind: 'picker', error: message };
      });
    }
```

- [ ] **Step 3: Extend the browser spec**

In `test/browser/photo-picker.spec.ts`, find the existing corrupt-upload test (uploads a
non-image file and asserts the generic error appears). Add a sibling case immediately after it:

```ts
test('a file named like HEIC gets the HEIC-specific error message', async ({ page }) => {
  const board = new BoardPage(page);
  await board.gotoPicker(); // use whatever this file's existing helper is for reaching the picker without going through the full open() flow — check its existing corrupt-upload test for the pattern
  const buffer = Buffer.from('not a real heic file');
  await page.setInputFiles('input[type="file"]', {
    name: 'photo.heic',
    mimeType: 'image/heic',
    buffer,
  });
  await expect(page.getByText(/HEIC photos aren't supported directly here/)).toBeVisible();
});
```

(Match the exact helper/selector pattern the existing corrupt-upload test in this file already uses
— don't invent a new navigation path if `BoardPage` or the spec file already has one for reaching
the bare picker screen.)

- [ ] **Step 4: Run the browser spec, typecheck, and commit**

Run: `npm run typecheck && npx playwright test photo-picker.spec.ts`
Expected: both clean/passing, including the new case.

```bash
git add src/ui/App.tsx test/browser/photo-picker.spec.ts
git commit -m "Step 5c: EXIF orientation fix and a clear HEIC error path"
```

---

### Task 12: `src/ui/TopBar.tsx` pause button and `src/ui/PauseSheet.tsx`

**Files:**
- Modify: `src/ui/TopBar.tsx`
- Create: `src/ui/PauseSheet.tsx`

**Interfaces:**
- Consumes: `PuzzleAssists`, `PuzzleMode` types not needed directly here beyond `PuzzleAssists`;
  `SnapDifficulty` from `@/board/snap`; `loadPhoto` from `@/persist/photos` (Task 8).
- Produces: `TopBarProps.onPause: () => void` (new required prop), `PauseSheetProps`/`PauseSheet` as
  declared in the Interfaces section. Task 15 (`App.tsx`) is the consumer of both.

**Required accessibility hooks** (Task 17's browser spec selects on these):
- Pause button: `<button aria-label="Pause">`.
- Sheet backdrop: `<div aria-label="Pause sheet backdrop">` (click-to-dismiss = Resume).
- Resume: `<button aria-label="Resume">`.
- Reference image toggle: `<button aria-label="Reference image">`.
- Reference image overlay (once open): `<div aria-label="Reference image overlay">`, dismissible by
  tap anywhere on it.
- Restart: `<button aria-label="Restart">`, opens a two-step confirm: `<button
  aria-label="Confirm restart">` / `<button aria-label="Cancel restart">`.
- Snap-tolerance chips (reuse the same three labels `PuzzleSetup.tsx` already established):
  `aria-label="Snap tolerance: Precise"` etc.
- Ghost/edge-highlight/large-piece toggles: same `aria-label`s as `PuzzleSetup.tsx`
  ("Ghost underlay opacity" as the range input's label, "Edge highlight", "Large piece mode").
- Leave: `<button aria-label="Leave">`.

**Behavior:**

- This is **not** the tray's `Sheet.tsx` — that component is purpose-built for the three-detent
  tray (peek/half/full, shelf, lenses) and reusing it here would be wrong. `PauseSheet` is its own
  simple overlay: a fixed backdrop plus a bottom-anchored panel, self-contained.
- Restart's confirm step is local component state (`const [confirmingRestart, setConfirmingRestart]
  = useState(false)`) — tapping "Restart" shows "Are you sure? All progress on this puzzle resets."
  with Confirm/Cancel, not a second modal.
- Reference image: `loadPhoto(puzzleId)` is called on open (component needs `puzzleId` as a prop to
  do this), decoding a fresh `ImageBitmap`, drawn into a `<canvas>` sized to the overlay, and
  `bitmap.close()` called when the overlay is dismissed (tracked via a `useEffect` cleanup or the
  dismiss handler directly — either is fine as long as every open closes its own bitmap and there's
  no leak across repeated open/close cycles).

- [ ] **Step 1: Add the pause button to `TopBar.tsx`**

Add `onPause: () => void;` to `TopBarProps`, and a new button next to the existing "Fit" button:

```tsx
      <button
        type="button"
        aria-label="Pause"
        onClick={onPause}
        className="pointer-events-auto rounded-[14px] border border-[var(--edge-hair)] bg-[color-mix(in_srgb,var(--mat-raised)_82%,transparent)] px-[16px] text-[14px] text-[var(--ink-primary)] backdrop-blur-[12px]"
      >
        Pause
      </button>
```

(Placed alongside the existing "Fit" button, both inside the same trailing container if one exists,
or as siblings in the header's flex row — match whatever grouping the existing "Fit" button already
sits in.) Destructure `onPause` in the function signature alongside the existing props.

- [ ] **Step 2: Write `src/ui/PauseSheet.tsx`**

```tsx
/**
 * The pause sheet (step 5c) — resume, reference image, restart, live
 * settings, leave. Its own lightweight overlay, deliberately not the tray's
 * `Sheet.tsx`: that component is purpose-built for the three-detent tray
 * (peek/half/full, shelf, lenses) and has no shape this screen needs.
 */

import { useEffect, useState } from 'react';
import type { SnapDifficulty } from '@/board/snap';
import type { PuzzleAssists } from '@/play/setup';
import { loadPhoto } from '@/persist/photos';

export interface PauseSheetProps {
  puzzleId: string;
  onResume: () => void;
  onRestart: () => void;
  onLeave: () => void;
  assists: PuzzleAssists;
  difficulty: SnapDifficulty;
  onAssistsChange: (assists: PuzzleAssists) => void;
  onDifficultyChange: (difficulty: SnapDifficulty) => void;
}

const TOLERANCES: { value: SnapDifficulty; label: string }[] = [
  { value: 'precise', label: 'Precise' },
  { value: 'standard', label: 'Standard' },
  { value: 'generous', label: 'Generous' },
];

export function PauseSheet({
  puzzleId,
  onResume,
  onRestart,
  onLeave,
  assists,
  difficulty,
  onAssistsChange,
  onDifficultyChange,
}: PauseSheetProps): React.ReactElement {
  const [confirmingRestart, setConfirmingRestart] = useState(false);
  const [referenceBitmap, setReferenceBitmap] = useState<ImageBitmap | null>(null);

  useEffect(() => {
    return () => {
      referenceBitmap?.close();
    };
  }, [referenceBitmap]);

  const openReference = (): void => {
    void loadPhoto(puzzleId).then(setReferenceBitmap);
  };

  const closeReference = (): void => {
    referenceBitmap?.close();
    setReferenceBitmap(null);
  };

  if (referenceBitmap) {
    return (
      <div
        aria-label="Reference image overlay"
        onClick={closeReference}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black"
      >
        <canvas
          ref={(el) => {
            if (!el) return;
            el.width = referenceBitmap.width;
            el.height = referenceBitmap.height;
            el.getContext('2d')?.drawImage(referenceBitmap, 0, 0);
          }}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    );
  }

  return (
    <>
      <div
        aria-label="Pause sheet backdrop"
        onClick={onResume}
        className="fixed inset-0 z-40 bg-black/50"
      />
      <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-4 rounded-t-[var(--radius-lg)] border-t border-[var(--edge-hair)] bg-[var(--mat-raised)] p-5">
        <button
          type="button"
          aria-label="Resume"
          onClick={onResume}
          className="min-h-[44px] rounded-[var(--radius-md)] bg-[var(--accent)] py-3 text-[15px] text-[var(--mat-void)]"
        >
          Resume
        </button>

        <button
          type="button"
          aria-label="Reference image"
          onClick={openReference}
          className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--edge-hair)] py-3 text-[15px] text-[var(--ink-primary)]"
        >
          Reference image
        </button>

        {confirmingRestart ? (
          <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--edge-hair)] p-3">
            <div className="text-[13px] text-[var(--ink-primary)]">
              Are you sure? All progress on this puzzle resets.
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Cancel restart"
                onClick={() => setConfirmingRestart(false)}
                className="min-h-[44px] flex-1 rounded-[var(--radius-sm)] border border-[var(--edge-hair)] text-[13px] text-[var(--ink-muted)]"
              >
                Cancel
              </button>
              <button
                type="button"
                aria-label="Confirm restart"
                onClick={() => {
                  setConfirmingRestart(false);
                  onRestart();
                }}
                className="min-h-[44px] flex-1 rounded-[var(--radius-sm)] border border-[var(--accent)] text-[13px] text-[var(--accent)]"
              >
                Restart
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            aria-label="Restart"
            onClick={() => setConfirmingRestart(true)}
            className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--edge-hair)] py-3 text-[15px] text-[var(--ink-primary)]"
          >
            Restart
          </button>
        )}

        <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--edge-hair)] p-3">
          <div className="font-[var(--font-data)] text-[11px] tracking-[0.08em] text-[var(--ink-muted)]">
            SETTINGS
          </div>

          <div>
            <div className="mb-1 text-[13px] text-[var(--ink-primary)]">Snap tolerance</div>
            <div className="flex gap-2">
              {TOLERANCES.map(({ value, label }) => {
                const selected = difficulty === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-label={`Snap tolerance: ${label}`}
                    aria-pressed={selected}
                    onClick={() => onDifficultyChange(value)}
                    className={`min-h-[44px] flex-1 rounded-[var(--radius-sm)] border text-[11px] ${
                      selected
                        ? 'border-[var(--accent)] text-[var(--accent)]'
                        : 'border-[var(--edge-hair)] text-[var(--ink-muted)]'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-1 flex justify-between text-[13px] text-[var(--ink-primary)]">
              <span>Ghost underlay</span>
              <span className="font-[var(--font-data)] text-[11px] text-[var(--ink-muted)]">
                {Math.round((assists.ghostOpacity / 0.3) * 100)}%
              </span>
            </div>
            <input
              type="range"
              aria-label="Ghost underlay opacity"
              min={0}
              max={0.3}
              step={0.01}
              value={assists.ghostOpacity}
              onChange={(e) =>
                onAssistsChange({ ...assists, ghostOpacity: Number(e.target.value) })
              }
              className="min-h-[44px] w-full"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="text-[13px] text-[var(--ink-primary)]">Edge highlight</div>
            <button
              type="button"
              aria-label="Edge highlight"
              aria-pressed={assists.edgeHighlight}
              onClick={() => onAssistsChange({ ...assists, edgeHighlight: !assists.edgeHighlight })}
              className={`min-h-[44px] min-w-[44px] rounded-[var(--radius-sm)] border text-[12px] ${
                assists.edgeHighlight
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-[var(--edge-hair)] text-[var(--ink-muted)]'
              }`}
            >
              {assists.edgeHighlight ? 'On' : 'Off'}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-[13px] text-[var(--ink-primary)]">Large piece mode</div>
            <button
              type="button"
              aria-label="Large piece mode"
              aria-pressed={assists.largePieceMode}
              onClick={() =>
                onAssistsChange({ ...assists, largePieceMode: !assists.largePieceMode })
              }
              className={`min-h-[44px] min-w-[44px] rounded-[var(--radius-sm)] border text-[12px] ${
                assists.largePieceMode
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-[var(--edge-hair)] text-[var(--ink-muted)]'
              }`}
            >
              {assists.largePieceMode ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        <button
          type="button"
          aria-label="Leave"
          onClick={onLeave}
          className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--edge-hair)] py-3 text-[15px] text-[var(--ink-muted)]"
        >
          Leave
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean. (`TopBar.tsx`'s other callers now need `onPause` — this will surface as a
typecheck error in `App.tsx` until Task 15 updates its `<TopBar>` usage; that's expected and gets
fixed there. If Task 15 hasn't landed yet, this step may show one expected error confined to
`App.tsx` — confirm it's exactly that one error and nothing else before proceeding.)

- [ ] **Step 4: Commit**

```bash
git add src/ui/TopBar.tsx src/ui/PauseSheet.tsx
git commit -m "Step 5c: pause button and the pause sheet — resume, reference, restart, settings, leave"
```

---

### Task 13: `src/ui/Library.tsx`

**Files:**
- Create: `src/ui/Library.tsx`

**Interfaces:**
- Consumes: `LibraryEntry` from `@/persist/library` (Task 8); `ProgressRing` from
  `./ProgressRing` (existing).
- Produces: `LibraryProps`/`Library` as declared in the Interfaces section. Task 15 (`App.tsx`) is
  the consumer.

**Required accessibility hooks:**
- Each card: `<button aria-label={`Open puzzle: ${cols} × ${rows}`}>` (cols/rows from
  `entry.snapshot`, matching `TopBar`'s existing "the real computed number" convention).
- "New puzzle" CTA: `<button aria-label="New puzzle">`.

**Behavior:**

- No empty state to build — per the design decision, a library with zero entries is never rendered
  (`App.tsx`'s entry-flow logic in Task 15 goes straight to the picker instead).
- Each card: thumbnail via `URL.createObjectURL(entry.thumbnailBlob)`, revoked on unmount (a `
  useEffect` per card, or a single effect over the whole entries array — either is fine, just don't
  leak object URLs across re-renders when `entries` changes).
- `ProgressRing` driven by `entry.snapshot.placed / entry.snapshot.total`.
- Relative time: a small inline formatter (`"3 hours ago"`, `"2 days ago"`, `"just now"`) — write it
  directly in this file as a private helper, it's small enough not to warrant its own module (unlike
  `pieceScreenSize`, which is genuinely reused across files).

- [ ] **Step 1: Write the component**

```tsx
/**
 * The library (step 5c) — in-progress puzzle cards. A library with zero
 * entries is never rendered; `App.tsx`'s entry flow goes to the picker
 * instead, so this component has no empty state to build.
 */

import { useEffect, useState } from 'react';
import { ProgressRing } from './ProgressRing';
import type { LibraryEntry } from '@/persist/library';

export interface LibraryProps {
  entries: readonly LibraryEntry[];
  onOpen: (puzzleId: string) => void;
  onNewPuzzle: () => void;
}

function relativeTime(updatedAt: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function LibraryCard({
  entry,
  onOpen,
}: {
  entry: LibraryEntry;
  onOpen: (puzzleId: string) => void;
}): React.ReactElement {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(entry.thumbnailBlob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [entry.thumbnailBlob]);

  const { cols, rows, mode, placed, total } = entry.snapshot;

  return (
    <button
      type="button"
      aria-label={`Open puzzle: ${cols} × ${rows}`}
      onClick={() => onOpen(entry.puzzleId)}
      className="flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--edge-hair)] bg-[var(--mat-raised)] text-left"
    >
      <div className="relative aspect-[4/3] w-full bg-[var(--mat-void)]">
        {url && <img src={url} alt="" className="h-full w-full object-cover" />}
        <div className="absolute right-2 top-2">
          <ProgressRing completion={total === 0 ? 0 : placed / total} size={32} />
        </div>
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <div className="text-[14px] text-[var(--ink-primary)]">
          {cols} × {rows} · {mode === 'zen' ? 'Zen' : 'Classic'}
        </div>
        <div className="font-[var(--font-data)] text-[11px] text-[var(--ink-muted)]">
          {relativeTime(entry.updatedAt)}
        </div>
      </div>
    </button>
  );
}

export function Library({ entries, onOpen, onNewPuzzle }: LibraryProps): React.ReactElement {
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <div className="flex items-center justify-between">
        <div className="font-[var(--font-display)] text-[28px] text-[var(--ink-primary)]">
          Your Puzzles
        </div>
        <button
          type="button"
          aria-label="New puzzle"
          onClick={onNewPuzzle}
          className="min-h-[44px] rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-[14px] text-[var(--mat-void)]"
        >
          New Puzzle
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {entries.map((entry) => (
          <LibraryCard key={entry.puzzleId} entry={entry} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/ui/Library.tsx
git commit -m "Step 5c: the library screen — in-progress puzzle cards"
```

---

### Task 14: `src/ui/CompletionBanner.tsx`

**Files:**
- Create: `src/ui/CompletionBanner.tsx`

**Interfaces:**
- Consumes: nothing beyond its own props.
- Produces: `CompletionBannerProps`/`CompletionBanner` as declared in the Interfaces section.
  Task 15 (`App.tsx`) is the consumer, passing `canGoHarder = nextHarderCount(targetCount) !==
  null` (Task 7's helper).

**Required accessibility hooks:**
- `<button aria-label="Play again, harder">` (only rendered when `canGoHarder`).
- `<button aria-label="Done">`.

- [ ] **Step 1: Write the component**

```tsx
/**
 * The completion banner (step 5c) — deliberately minimal. No bloom sequence,
 * no card, no share: those are Step 8's Puzzle Card. This only needs
 * completion to be reachable and actionable — "play again, harder" and
 * "done," replacing the TopBar's progress readout for the moment.
 */

export interface CompletionBannerProps {
  canGoHarder: boolean;
  onAgainHarder: () => void;
  onDone: () => void;
}

export function CompletionBanner({
  canGoHarder,
  onAgainHarder,
  onDone,
}: CompletionBannerProps): React.ReactElement {
  return (
    <div
      className="pointer-events-auto absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-[12px] rounded-[14px] border border-[var(--edge-hair)] bg-[color-mix(in_srgb,var(--mat-raised)_92%,transparent)] p-[12px] backdrop-blur-[12px]"
      style={{ margin: 12, marginTop: 'max(12px, env(safe-area-inset-top))' }}
    >
      <div className="text-[14px] text-[var(--ink-primary)]">Puzzle complete</div>
      <div className="flex gap-2">
        {canGoHarder && (
          <button
            type="button"
            aria-label="Play again, harder"
            onClick={onAgainHarder}
            className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--accent)] px-3 text-[13px] text-[var(--accent)]"
          >
            Again, harder
          </button>
        )}
        <button
          type="button"
          aria-label="Done"
          onClick={onDone}
          className="min-h-[44px] rounded-[var(--radius-md)] bg-[var(--accent)] px-3 text-[13px] text-[var(--mat-void)]"
        >
          Done
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/ui/CompletionBanner.tsx
git commit -m "Step 5c: the completion banner — again-harder and done"
```

---

### Task 15: Wire it all into `src/ui/App.tsx`

**Files:**
- Modify: `src/ui/App.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–14: `listLibrary`, `saveLibraryEntry`, `deleteLibraryEntry`,
  `loadSnapshot` from `@/persist/library`; `savePhoto`, `loadPhoto` from `@/persist/photos`;
  `captureThumbnail` from `@/persist/thumbnail`; `nextHarderCount` from `@/play/setup`; `Library`
  from `./Library`; `PauseSheet` from `./PauseSheet`; `CompletionBanner` from
  `./CompletionBanner`; `useChrome`'s existing `lens`/`lensArg` fields (already in the store).
- Produces: nothing new for later tasks — this is the final integration point.

**Semantics:**

- `SetupPhase` gains two variants: `'checking'` (initial) and, separately, a top-level `screen`
  state distinct from `SetupPhase` for `'library' | 'playing'` once past setup — because "library"
  and "playing" both coexist with `playConfig`/`runtime` being live in a way `SetupPhase`'s existing
  three variants (picker/cropping/configuring) don't need to. Concretely: add a new state,
  ```ts
  type Screen = 'checking' | 'library' | 'setup' | 'playing';
  const [screen, setScreen] = useState<Screen>('checking');
  ```
  where `'setup'` covers the existing picker/cropping/configuring flow (rendered via the existing
  `setupPhase` state, unchanged), and `'playing'` covers the mounted-runtime view (existing
  behavior, unchanged) plus the new pause sheet / completion banner as overlays on top of it.
- **Mount effect** — on first mount, before anything else renders: `useEffect(() => { void
  listLibrary().then((entries) => { setLibraryEntries(entries); setScreen(entries.length > 0 ?
  'library' : 'setup'); }); }, []);` — a new `libraryEntries` state (`LibraryEntry[]`) alongside it.
  While this resolves, `screen === 'checking'` renders nothing (a blank frame — this resolves in a
  single IndexedDB read, fast enough not to need a spinner for this pass).
- **Opening a library card:** `handleOpenLibraryEntry(puzzleId)`: `loadPhoto(puzzleId)` for the
  bitmap, `loadSnapshot(puzzleId)` for the snapshot (or reuse the already-loaded `entries` array's
  matching record — prefer that, it avoids a redundant IndexedDB read), then set `playConfig` to `{
  source: bitmap, seed: snapshot.seed, targetCount: snapshot.targetCount, mode: snapshot.mode,
  rotation: snapshot.rotation, difficulty: snapshot.difficulty, assists: snapshot.assists }` and a
  new `restoreSnapshot` state holding `snapshot` itself (needed by the mount effect below, since
  `PlayRuntimeOptions.restore` needs the full snapshot, not just the fields `PuzzleConfig` already
  covers), then `setScreen('playing')`.
- **`PlayRuntime` construction** (the existing mount `useEffect` keyed on `playConfig`): add
  `puzzleId: puzzleId` (a new piece of state — see below), `restore: restoreSnapshot ? { snapshot:
  restoreSnapshot } : undefined`, and `onSave: (runtime, canvas) => { void handleAutosave(runtime,
  canvas); }`.
- **`puzzleId` state**: a fresh puzzle (from the picker/crop/setup flow) mints one via
  `crypto.randomUUID()` at the same point `PhotoCrop`'s `seedFromPuzzleId` already runs (check
  `PhotoCropResult` — it likely already carries a `puzzleId` alongside `seed`, since `seedFromPuzzleId`
  needs one as input; if so, reuse that value directly rather than minting a second one).
  A restored puzzle uses the snapshot's own `puzzleId`. An "again, harder" puzzle mints a **new**
  one (it's a genuinely new puzzle instance, per the design's decision).
- **`handleAutosave(runtime, canvas)`**: `const chrome = useChrome.getState(); const snapshot =
  runtime.snapshot({ lens: chrome.lens, lensArg: chrome.lensArg, scroll: trayScrollRef.current });
  if (!snapshot) return; const thumbnailBlob = await captureThumbnail(canvas); await
  saveLibraryEntry({ puzzleId: snapshot.puzzleId, snapshot, thumbnailBlob, updatedAt:
  snapshot.updatedAt });` — plus, on the very first save for a fresh (non-restored) puzzle, also
  `await savePhoto(snapshot.puzzleId, <blob of playConfig.source>)` once (track with a `ref`
  boolean `photoSavedRef` per mounted runtime instance, reset on remount, so the photo blob is
  written exactly once rather than on every 800ms tick — the photo itself never changes across a
  session, only the board state does). Converting `playConfig.source` (an `ImageBitmap`) to a `Blob`
  for `savePhoto`: draw it into an `OffscreenCanvas` and `convertToBlob()`, the same pattern
  `thumbnail.ts` already establishes — write this inline in `App.tsx` rather than adding it to
  `thumbnail.ts` (it's photo-specific, not thumbnail-specific, despite the surface similarity).
- **`trayScrollRef`**: `const trayScrollRef = useRef(0);` — updated by `PieceGrid`'s new `onScroll`
  prop (Task 6), threaded down through `Tray.tsx`/`Sheet.tsx`'s existing prop-drilling the same way
  every other `PieceGrid` prop already reaches it from `App.tsx`. Read (not subscribed-to) at save
  time inside `handleAutosave`.
- **Pause button** (`TopBar`'s new `onPause` prop): opens a `pauseOpen` boolean state. When open,
  render `<PauseSheet>` as an overlay alongside the existing board/tray JSX (not replacing it —
  the board stays mounted underneath, matching "the board never re-renders through React" — opening
  the pause sheet must not unmount `PlayRuntime`).
  - `onResume`: `setPauseOpen(false)`.
  - `onRestart`: construct a fresh `PlayRuntime` with the same `playConfig` but no `restore` option
    (i.e., re-run the existing mount effect's construction path from scratch) — simplest
    implementation: bump a `restartKey` number state used as part of the mount effect's dependency
    array (alongside `playConfig`), so incrementing it forces the effect to tear down the old
    runtime and build a fresh one with identical `playConfig`. `onRestart` calls
    `setRestartKey((k) => k + 1); setPauseOpen(false);`.
  - `onLeave`: `runtime.current?.interrupt()` (triggers the synchronous save one last time, reusing
    existing machinery) then `setScreen('library')` after re-fetching `listLibrary()` (so the just-
    left puzzle's updated thumbnail/progress shows immediately) — plus tear down the mounted runtime
    the same way the existing unmount cleanup already does (check the existing mount effect's
    cleanup function and call the same `instance.destroy()` path, or simply let `playConfig` being
    set to `null` trigger the existing effect's cleanup naturally, matching how the app already
    handles returning to earlier phases elsewhere).
  - `assists`/`difficulty` passed to `PauseSheet` come from local state mirroring
    `runtime.current`'s live values — simplest: keep them in `App.tsx` state (`[liveAssists,
    setLiveAssists]`, `[liveDifficulty, setLiveDifficulty]`) initialized from `playConfig` and
    updated by `PauseSheet`'s `onAssistsChange`/`onDifficultyChange`, which also call
    `runtime.current?.setAssists(...)`/`setDifficulty(...)` to apply live.
- **Completion banner**: rendered when `summary.status === 'complete'`, replacing `TopBar`'s
  progress section in the layout (conditionally render `<TopBar>` vs `<CompletionBanner>` based on
  `summary.status`, both absolutely positioned in the same top slot).
  - `onAgainHarder`: `const next = nextHarderCount(playConfig!.targetCount); if (next === null)
    return;` (button is hidden in this case anyway, but guard defensively) `const newPuzzleId =
    crypto.randomUUID(); const bitmap = await loadPhoto(playConfig!.puzzleId ...` — wait,
    `playConfig` doesn't carry `puzzleId` by default in today's shape; add it (see below) `...
    const seed = seedFromPuzzleId(newPuzzleId);` (reuse the existing seeding function 5a already
    established — check its import) `setPlayConfig({ source: bitmap, seed, targetCount: next, mode:
    playConfig!.mode, rotation: playConfig!.rotation, difficulty: playConfig!.difficulty, assists:
    playConfig!.assists }); setPuzzleId(newPuzzleId); setRestoreSnapshot(null);` — this reuses the
    exact same mount-effect path a fresh puzzle takes, just skipping picker/crop/setup screens
    entirely.
  - `onDone`: `await deleteLibraryEntry(playConfig!.puzzleId); setPlayConfig(null);
    setScreen('library'); void listLibrary().then(setLibraryEntries);` (delete-then-navigate, per
    the design's decision that a completed puzzle simply leaves the library).
- **`playConfig`'s type** needs `puzzleId: string` added (it's used throughout the above). Update
  its `useState` type from `({ source: ImageBitmap; seed: number } & PuzzleConfig) | null` to
  `({ source: ImageBitmap; seed: number; puzzleId: string } & PuzzleConfig) | null`, and every
  existing site that constructs it (the crop-confirm→configuring→confirm chain from 5a/5b) needs
  `puzzleId` added — sourced from `PhotoCropResult` if it already carries one (check `photo.ts`'s
  `PhotoCropResult` type first — if `seedFromPuzzleId` takes a `puzzleId` as input to produce
  `seed`, that `puzzleId` is already being minted somewhere in the crop-confirm path and should be
  threaded through rather than re-minted).
- **Render logic**, top level:
  ```tsx
  if (screen === 'checking') return null;
  if (screen === 'library') {
    return <Library entries={libraryEntries} onOpen={handleOpenLibraryEntry} onNewPuzzle={() => setScreen('setup')} />;
  }
  if (screen === 'setup') {
    // existing picker/cropping/configuring render branch, unchanged, except its
    // final confirm handler now also calls setScreen('playing') alongside the
    // existing setPlayConfig(...) call.
  }
  // screen === 'playing' — existing board/tray JSX, plus:
  //   {summary.status === 'complete'
  //     ? <CompletionBanner canGoHarder={nextHarderCount(playConfig!.targetCount) !== null} onAgainHarder={...} onDone={...} />
  //     : <TopBar ... onPause={() => setPauseOpen(true)} />}
  //   {pauseOpen && <PauseSheet ... />}
  ```

- [ ] **Step 1: Add the new imports**

```ts
import { listLibrary, saveLibraryEntry, deleteLibraryEntry, loadSnapshot } from '@/persist/library';
import { savePhoto, loadPhoto } from '@/persist/photos';
import { captureThumbnail } from '@/persist/thumbnail';
import { nextHarderCount } from '@/play/setup';
import { Library } from './Library';
import type { LibraryEntry } from '@/persist/library';
import { PauseSheet } from './PauseSheet';
import { CompletionBanner } from './CompletionBanner';
import type { SessionSnapshot } from '@/persist/snapshot';
```

- [ ] **Step 2: Add the new state**

```ts
  type Screen = 'checking' | 'library' | 'setup' | 'playing';
  const [screen, setScreen] = useState<Screen>('checking');
  const [libraryEntries, setLibraryEntries] = useState<readonly LibraryEntry[]>([]);
  const [restoreSnapshot, setRestoreSnapshot] = useState<SessionSnapshot | null>(null);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [restartKey, setRestartKey] = useState(0);
  const [liveAssists, setLiveAssists] = useState<PuzzleAssists | null>(null);
  const [liveDifficulty, setLiveDifficulty] = useState<SnapDifficulty | null>(null);
  const trayScrollRef = useRef(0);
  const photoSavedRef = useRef(false);
```

(Import `SnapDifficulty` from `@/board/snap` and `PuzzleAssists` from `@/play/setup` if not already
imported in this file — check first.)

- [ ] **Step 3: Add the library-fetch mount effect**

```ts
  useEffect(() => {
    void listLibrary().then((entries) => {
      setLibraryEntries(entries);
      setScreen(entries.length > 0 ? 'library' : 'setup');
    });
  }, []);
```

- [ ] **Step 4: Add `puzzleId` to `playConfig`'s type and every construction site**

Change the `playConfig` state declaration to include `puzzleId: string`. Update the existing
crop-confirm chain (`handleSetupConfirm` or wherever `setPlayConfig` is finally called) to include
`puzzleId: setupPhase.puzzleId` (or wherever the puzzle id is actually threaded from — check
`PhotoCropResult`'s real shape before assuming the field name; if it isn't already carried, add
`puzzleId: crypto.randomUUID()` at crop-confirm time as the mint point, alongside the existing
`seed`).

- [ ] **Step 5: Add `handleOpenLibraryEntry`**

```ts
  const handleOpenLibraryEntry = useCallback(
    async (puzzleId: string): Promise<void> => {
      const entry = libraryEntries.find((e) => e.puzzleId === puzzleId);
      if (!entry) return;
      const bitmap = await loadPhoto(puzzleId);
      setRestoreSnapshot(entry.snapshot);
      setLiveAssists(entry.snapshot.assists);
      setLiveDifficulty(entry.snapshot.difficulty);
      photoSavedRef.current = true; // the photo is already stored — never rewrite it
      setPlayConfig({
        source: bitmap,
        seed: entry.snapshot.seed,
        puzzleId,
        targetCount: entry.snapshot.targetCount,
        mode: entry.snapshot.mode,
        rotation: entry.snapshot.rotation,
        difficulty: entry.snapshot.difficulty,
        assists: entry.snapshot.assists,
      });
      setScreen('playing');
    },
    [libraryEntries],
  );
```

- [ ] **Step 6: Add `handleAutosave`**

```ts
  const handleAutosave = useCallback(
    async (rt: PlayRuntime, canvas: HTMLCanvasElement | OffscreenCanvas): Promise<void> => {
      const chromeState = useChrome.getState();
      const snapshot = rt.snapshot({
        lens: chromeState.lens,
        lensArg: chromeState.lensArg,
        scroll: trayScrollRef.current,
      });
      if (!snapshot) return;

      const thumbnailBlob = await captureThumbnail(canvas);
      await saveLibraryEntry({
        puzzleId: snapshot.puzzleId,
        snapshot,
        thumbnailBlob,
        updatedAt: snapshot.updatedAt,
      });

      if (!photoSavedRef.current && playConfig) {
        photoSavedRef.current = true;
        const offscreen = new OffscreenCanvas(playConfig.source.width, playConfig.source.height);
        const ctx = offscreen.getContext('2d');
        ctx?.drawImage(playConfig.source, 0, 0);
        const photoBlob = await offscreen.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
        await savePhoto(snapshot.puzzleId, photoBlob);
      }
    },
    [playConfig],
  );
```

- [ ] **Step 7: Wire `puzzleId`, `restore`, and `onSave` into the `PlayRuntime` construction**

In the existing mount `useEffect` that constructs `new PlayRuntime({...})`, add:

```ts
      puzzleId: playConfig.puzzleId,
      restore: restoreSnapshot ? { snapshot: restoreSnapshot } : undefined,
      onSave: (rt, canvas) => {
        void handleAutosave(rt, canvas);
      },
```

Add `restartKey` to that effect's dependency array (alongside the existing `playConfig` — check the
effect's current dependency array and add it there).

- [ ] **Step 8: Add pause/restart/leave handlers**

```ts
  const handleRestart = useCallback((): void => {
    setRestoreSnapshot(null);
    setRestartKey((k) => k + 1);
    setPauseOpen(false);
  }, []);

  const handleLeave = useCallback((): void => {
    runtime.current?.interrupt();
    setPlayConfig(null);
    setPauseOpen(false);
    setScreen('library');
    void listLibrary().then(setLibraryEntries);
  }, []);
```

- [ ] **Step 9: Add again-harder / done handlers**

```ts
  const handleAgainHarder = useCallback(async (): Promise<void> => {
    if (!playConfig) return;
    const next = nextHarderCount(playConfig.targetCount);
    if (next === null) return;
    const newPuzzleId = crypto.randomUUID();
    const bitmap = await loadPhoto(playConfig.puzzleId);
    const seed = seedFromPuzzleId(newPuzzleId); // reuse 5a's existing seeding function — confirm its import path
    setRestoreSnapshot(null);
    photoSavedRef.current = false;
    setPlayConfig({
      source: bitmap,
      seed,
      puzzleId: newPuzzleId,
      targetCount: next,
      mode: playConfig.mode,
      rotation: playConfig.rotation,
      difficulty: playConfig.difficulty,
      assists: playConfig.assists,
    });
  }, [playConfig]);

  const handleDone = useCallback(async (): Promise<void> => {
    if (!playConfig) return;
    await deleteLibraryEntry(playConfig.puzzleId);
    setPlayConfig(null);
    setScreen('library');
    void listLibrary().then(setLibraryEntries);
  }, [playConfig]);
```

(`seedFromPuzzleId` — locate its existing import in this file from the 5a work; if it lives in
`@/play/photo` or wherever 5a put it, import it the same way rather than re-deriving seeding logic.)

- [ ] **Step 10: Update the render logic**

Restructure the component's return statement per the four-branch shape described in this task's
Semantics section: `'checking'` → `null`; `'library'` → `<Library>`; `'setup'` → the existing
picker/cropping/configuring branch (unchanged internals, but its terminal confirm handler now also
calls `setScreen('playing')`); `'playing'` → the existing board/tray JSX with `<TopBar>` swapped for
`<CompletionBanner>` when `summary.status === 'complete'`, `onPause` wired on `<TopBar>`, and
`{pauseOpen && <PauseSheet ... />}` rendered as a sibling overlay. Pass `assists={liveAssists ??
playConfig!.assists}` / `difficulty={liveDifficulty ?? playConfig!.difficulty}` to `<PauseSheet>`,
and its `onAssistsChange`/`onDifficultyChange` update both the local state and call
`runtime.current?.setAssists(...)`/`setDifficulty(...)`.

Thread `onScroll={(top) => { trayScrollRef.current = top; }}` and `initialScrollTop={
restoreSnapshot?.tray.scroll}` down through the existing `<Tray>`→`<Sheet>`/docked-tray→
`<PieceGrid>` prop chain, matching however this file already threads `PieceGrid`'s other props
(`bitmapOf`, `isEdge`, etc.) from this level down.

- [ ] **Step 11: Run the full unit suite, typecheck, build, and commit**

Run: `npm test && npm run typecheck && npm run build`
Expected: all clean. (Browser tests come in Task 17, once all the new `aria-label` hooks exist for
them to select on.)

```bash
git add src/ui/App.tsx
git commit -m "Step 5c: wire library, pause sheet, restore, and completion into App.tsx"
```

---

### Task 16: Delete `dev.html` and the step-2 harness

**Files:**
- Delete: `dev.html`
- Delete: `src/dev/harness.ts`, `src/dev/synthetic-image.ts`, `src/dev/scatter.ts`
- Modify: `vite.config.ts`

**Interfaces:** none — this task removes code, it doesn't add any interface later tasks depend on.

**Semantics:**

- `CLAUDE.md`: "Two pages. `index.html` is the product; `dev.html` keeps the step-2 harness... It
  goes at step 5." This is that removal.
- Before deleting, grep the whole repo for any other reference (docs, `package.json` scripts,
  Playwright config, `README`) so nothing is left pointing at a file that no longer exists.

- [ ] **Step 1: Grep for references**

```bash
grep -rn "dev.html\|src/dev/" --include="*.ts" --include="*.tsx" --include="*.json" --include="*.md" . \
  --exclude-dir=node_modules --exclude-dir=.git
```

Confirm the only hits are: `vite.config.ts`'s `rollupOptions.input.dev` line and its explanatory
comment (both to be removed in Step 3 below), and this plan/spec's own text (leave those — they're
historical record, not live references). If anything else references `dev.html` or `src/dev/`,
investigate and update it before proceeding — don't silently delete something still wired in.

- [ ] **Step 2: Delete the files**

```bash
git rm dev.html src/dev/harness.ts src/dev/synthetic-image.ts src/dev/scatter.ts
```

(If `src/dev/` contains any other files not listed here, check its contents first — `ls src/dev/` —
and remove all of them; the directory should be empty and removable afterward.)

- [ ] **Step 3: Update `vite.config.ts`**

Remove the `dev` entry point and its explanatory comment from `rollupOptions.input`, changing:

```ts
    rollupOptions: {
      // Two pages, deliberately. `index.html` is the product; `dev.html` is the
      // step-1/2 harness with every snap-tuning dial on it, and §17 budgets a
      // week of tuning that must not be thrown away the moment chrome exists.
      // The harness goes at step 5, not at step 3.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        dev: fileURLToPath(new URL('./dev.html', import.meta.url)),
      },
    },
```

to:

```ts
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
      },
    },
```

- [ ] **Step 4: Run the full unit suite, typecheck, and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all clean — nothing in `src/` outside `src/dev/` imported anything from the deleted
files (confirmed by Step 1's grep).

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts
git commit -m "Step 5c: delete dev.html and the step-2 harness, per CLAUDE.md's step-5 marker"
```

---

### Task 17: Browser tests

**Files:**
- Modify: `test/browser/board-page.ts`
- Create: `test/browser/persistence.spec.ts`
- Create: `test/browser/library.spec.ts`
- Create: `test/browser/pause-sheet.spec.ts`
- Create: `test/browser/completion.spec.ts`

**Interfaces:**
- Consumes: every `aria-label` hook declared in Tasks 12/13/14; `BoardPage`'s existing helpers
  (`open()`, `remaining()`, `matPoint()`, the `crypto.randomUUID` stub already established in 5a).

**Semantics:**

- **`board-page.ts` change first, before any new spec file** — every existing spec (~78 passing per
  `handoff.md`) now runs against an app that checks the library on mount. `BoardPage.open()` must
  clear IndexedDB before navigating, so every existing spec still deterministically lands on the
  picker (an empty library) rather than sometimes landing on a library from a previous test's
  leftover data. Add, inside `open()`, before `page.goto('/')`:
  ```ts
  await this.page.addInitScript(() => {
    indexedDB.deleteDatabase('tessera');
  });
  ```
  placed alongside the existing `crypto.randomUUID` stub's `addInitScript` call (both run before
  navigation; either order between the two is fine since they touch unrelated browser APIs).
- **`persistence.spec.ts`** is the load-bearing one: place a few pieces via the existing drag
  helpers `BoardPage` already provides (check `board-page.ts` for its existing piece-placement
  helper, used by other specs like `tray-3b.spec.ts` — reuse it rather than reimplementing drag
  logic here), wait for autosave (800ms debounce — `page.waitForTimeout(1000)` is acceptable here
  specifically because this test is *about* the debounce timing, unlike a drag/gesture test where a
  fixed sleep would be flaky for unrelated reasons), then `page.reload()`. After reload, the app
  should land on the library (not the picker — a session now exists), and opening that library card
  should restore a board where exactly the same pieces are placed as before the reload. Compare via
  `board.remaining()` (or whatever placed-count-reading helper `BoardPage` already exposes) before
  and after.
- **`library.spec.ts`**: drive a session to have at least one placed piece (reusing `persistence.spec.ts`'s
  setup pattern), reload to land on the library, assert a card renders with the right `cols × rows`
  label, click it, assert the board resumes. Also assert the very-first-visit case (fresh, empty
  IndexedDB via `board-page.ts`'s existing clear) lands directly on the picker with no library ever
  shown — a regression guard for the "empty library is never rendered" decision.
- **`pause-sheet.spec.ts`**: open via `BoardPage.open()` (a fresh puzzle), click "Pause"
  (`aria-label="Pause"`), assert the sheet appears, click "Resume", assert it's gone and the board
  is still interactive (place one more piece to prove `PlayRuntime` was never torn down). Separately:
  open the pause sheet, click "Restart", click "Confirm restart", assert placed-piece count returns
  to zero. Separately: toggle a setting (e.g. "Edge highlight"), dismiss the sheet, and don't attempt
  pixel verification of the visual effect itself (that's `puzzle-setup.spec.ts`'s existing job for
  the setup screen's version of the same control) — just assert the toggle's `aria-pressed` state
  persists correctly across opening/closing the sheet.
- **`completion.spec.ts`**: the fastest path to a real completion in a spec is a small puzzle — use
  `BoardPage`'s config-clicking helper (Task 6 of the 5b plan's addition to `open()`) to select the
  smallest ladder count (50) rather than the 150-piece default, then place every piece (reuse
  whatever full-solve helper, if any, existing specs use — if none exists, this spec needs to place
  all 50 pieces itself via the same per-piece drag helper other specs use, in a loop). Assert the
  completion banner appears (`page.getByText('Puzzle complete')` or the "Done"/"Again, harder"
  `aria-label`s), click "Done", assert the app lands on the library with the puzzle gone (or, if it
  was the only puzzle, lands on the picker instead — the empty-library case).

- [ ] **Step 1: Update `board-page.ts`**

Apply the `indexedDB.deleteDatabase('tessera')` change described above.

- [ ] **Step 2: Run the full existing browser suite to confirm nothing regressed**

Run: `npm run test:browser`
Expected: the same pass count `handoff.md` recorded before this plan (78 passed / 4 skipped) — this
step exists specifically to catch the case where clearing IndexedDB on every `open()` accidentally
breaks something unrelated, before adding any new specs on top of a shaky foundation.

- [ ] **Step 3: Write `test/browser/persistence.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { BoardPage } from './board-page';

test('a reload mid-session restores the board rather than resetting it', async ({ page }) => {
  const board = new BoardPage(page);
  await board.open();

  // Place a couple of pieces using this file's existing per-piece placement
  // helper — match whichever method board-page.ts already exposes for this
  // (check tray-3b.spec.ts or drag-to-place tests for the exact call shape).
  await board.placePiece(0);
  await board.placePiece(1);
  const placedBefore = await board.remaining();

  await page.waitForTimeout(1000); // past the 800ms autosave debounce
  await page.reload();

  // A session now exists, so the app lands on the library, not the picker.
  await expect(page.getByLabel(/Open puzzle:/)).toBeVisible();
  await page.getByLabel(/Open puzzle:/).first().click();

  await expect(page.locator('canvas')).toBeVisible();
  const placedAfter = await board.remaining();
  expect(placedAfter).toBe(placedBefore);
});
```

(`placePiece`/`remaining` — use `board-page.ts`'s actual existing method names; this plan doesn't
invent new ones. If no single-piece placement helper exists yet, check `test/browser/drag-out.spec.ts`
or `tray-3b.spec.ts` for the lowest-level drag primitive `BoardPage` exposes and build the two-piece
placement from that instead of inventing a new abstraction in this file.)

- [ ] **Step 4: Write `test/browser/library.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { BoardPage } from './board-page';

test('a fresh, empty IndexedDB lands directly on the picker', async ({ page }) => {
  const board = new BoardPage(page);
  await board.open(); // clears IndexedDB internally per Step 1's change
  await expect(page.getByLabel(/Open puzzle:/)).toHaveCount(0);
});

test('library shows a card after a session exists, and opening it resumes', async ({ page }) => {
  const board = new BoardPage(page);
  await board.open();
  await board.placePiece(0);
  await page.waitForTimeout(1000);
  await page.reload();

  const card = page.getByLabel(/Open puzzle:/).first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.locator('canvas')).toBeVisible();
});
```

- [ ] **Step 5: Write `test/browser/pause-sheet.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { BoardPage } from './board-page';

test('pause and resume leaves the runtime intact', async ({ page }) => {
  const board = new BoardPage(page);
  await board.open();

  await page.getByLabel('Pause').click();
  await expect(page.getByLabel('Pause sheet backdrop')).toBeVisible();
  await page.getByLabel('Resume').click();
  await expect(page.getByLabel('Pause sheet backdrop')).toHaveCount(0);

  await board.placePiece(0);
  expect(await board.remaining()).toBeLessThan(await board.total());
});

test('restart resets placed pieces to zero after confirmation', async ({ page }) => {
  const board = new BoardPage(page);
  await board.open();
  await board.placePiece(0);

  await page.getByLabel('Pause').click();
  await page.getByLabel('Restart').click();
  await page.getByLabel('Confirm restart').click();

  await expect(page.getByLabel('Pause sheet backdrop')).toHaveCount(0);
  expect(await board.placedCount()).toBe(0);
});

test('a settings toggle persists its state across opening and closing the sheet', async ({ page }) => {
  const board = new BoardPage(page);
  await board.open();

  await page.getByLabel('Pause').click();
  const edgeHighlight = page.getByLabel('Edge highlight');
  await expect(edgeHighlight).toHaveAttribute('aria-pressed', 'false');
  await edgeHighlight.click();
  await expect(edgeHighlight).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Resume').click();

  await page.getByLabel('Pause').click();
  await expect(page.getByLabel('Edge highlight')).toHaveAttribute('aria-pressed', 'true');
});
```

(`placedCount()`/`total()` — use whichever exact helper names `board-page.ts` already exposes for
reading placed-vs-total counts; adjust these calls to match rather than assuming these exact names.)

- [ ] **Step 6: Write `test/browser/completion.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { BoardPage } from './board-page';

test('completing the smallest puzzle shows the banner, and Done returns to the library', async ({ page }) => {
  const board = new BoardPage(page);
  await board.open({ pieceCount: 50 }); // pass the smallest ladder rung — check open()'s existing config-override signature from the 5b plan

  await board.solveEntirely(); // place every piece — reuse an existing full-solve helper if one exists, otherwise loop board.placePiece() across every piece id 0..49

  await expect(page.getByLabel('Done')).toBeVisible();
  await page.getByLabel('Done').click();

  // Either the library (other puzzles remain) or the picker (this was the only one).
  const onLibrary = await page.getByLabel(/Open puzzle:/).count();
  const onPicker = await page.getByLabel('Piece count: 50').count();
  expect(onLibrary > 0 || onPicker > 0).toBe(true);
});
```

- [ ] **Step 7: Run the new specs**

Run: `npx playwright test persistence.spec.ts library.spec.ts pause-sheet.spec.ts completion.spec.ts`
Expected: all passing. Fix any helper-name mismatches against `board-page.ts`'s actual API
surface as they surface — several call sites above are written against the *expected* shape of
existing helpers based on this plan's understanding of the codebase, not a confirmed read of
`board-page.ts`'s exact current method list, and reconciling that gap is expected, ordinary
plan-execution work, not a sign the plan is wrong.

- [ ] **Step 8: Run the full browser suite one more time**

Run: `npm run test:browser`
Expected: previous count (78/4) plus the new specs' cases, all green, both dock and phone
projects.

- [ ] **Step 9: Commit**

```bash
git add test/browser/board-page.ts test/browser/persistence.spec.ts test/browser/library.spec.ts test/browser/pause-sheet.spec.ts test/browser/completion.spec.ts
git commit -m "Step 5c: browser coverage — persistence reload, library, pause sheet, completion"
```

---

### Task 18: Final gate and handoff

**Files:**
- Modify: `handoff.md`

**Semantics:** the closing task every prior step's plan has ended with — run the full four-command
gate, then update the repo-root `handoff.md` the way `handoff.md` itself already documents doing
after 5a and 5b, so the next session (or the next `/loop` chunk, given this plan is explicitly meant
to land across several sittings within one continuous session per the brainstorm's scoping decision)
has an accurate picture without re-deriving it.

- [ ] **Step 1: Run the full gate**

```bash
npm test && npm run typecheck && npm run build && npm run test:browser
```

Expected: all four clean. Record the actual test counts (they will have grown from `handoff.md`'s
last-recorded 469/469 unit and 78/4 browser) for the handoff note in Step 2.

- [ ] **Step 2: Update `handoff.md`**

Add a new top-level section (`## X. Step 5c landed: library, save/resume, pause sheet, again-harder`)
following the exact style of the existing `1e`/`1f` sections — what landed, real gate numbers, any
defects the browser suite caught that the plan's own text didn't anticipate (there will likely be
at least one, given every prior step's handoff records exactly this pattern), what's still open
(real-device verification of IndexedDB/eviction behavior, the ghost-underlay-when-toggled-live gap
flagged in Task 10, ghost underlay's mid-session limitation), and update the "What's left in Step 5"
table (from `handoff.md`'s existing §1f.2) to show every row now **done**.

- [ ] **Step 3: Commit**

```bash
git add handoff.md
git commit -m "Step 5c: handoff notes — what landed, what's still open"
```

---

## Self-Review

**Spec coverage:** Library screen (Tasks 8, 13, 15) ✓. Pause sheet (Tasks 10, 12, 15) ✓.
`SessionSnapshot` save/resume, IndexedDB, 800ms debounce + `visibilitychange` sync write (Tasks 1–4,
9, 10) ✓. "Puzzle this again, harder" (Tasks 7, 14, 15) ✓. `dev.html` deletion (Task 16) ✓.
EXIF/HEIC (Task 11) ✓. The `pieces[]` and `inTray` design-gap resolutions are stated as Global
Constraints and threaded through Tasks 2–4, 9. Real-hardware verification is explicitly *not*
claimed as done anywhere in this plan, matching the standing convention `handoff.md` already
established for 5a/5b.

**Placeholder scan:** no "TBD"/"add appropriate handling" phrasing anywhere in the task bodies. A
handful of steps (Tasks 3/17's "match the actual field name" and "reuse the existing helper" notes)
explicitly flag places where this plan's author worked from a partial read of a file rather than its
full current contents, and says exactly what the implementer needs to check before writing the line
— that is a deliberate, bounded form of "verify against the real file," not an unresolved
placeholder; every one of those notes still specifies the exact behavior needed, just not the exact
pre-existing identifier name to hang it on.

**Type consistency:** `SessionSnapshot`, `BoardSnapshot`/`BoardClusterSnapshot`/`BoardPieceSnapshot`,
`PuzzleAssists`, `LibraryEntry` are each defined once (Tasks 2/3/8) and referenced by identical name
and shape in every later task. `PlayRuntimeOptions.puzzleId`/`.restore`/`.onSave` (Task 9/10) match
`App.tsx`'s usage in Task 15 field-for-field. `PauseSheetProps`/`LibraryProps`/
`CompletionBannerProps` (Tasks 12/13/14) match Task 15's JSX usage.
