/**
 * Chrome state, and nothing else.
 *
 * **The board never re-renders through React.** Piece positions update at 60fps
 * and must not touch this store; React reads derived summary state only —
 * progress, the active lens, the tray's shape. Everything in here changes at
 * human speed or not at all.
 *
 * One field needs watching. `regionUnlocked` is derived from zoom, and zoom
 * changes on every frame of a pinch. It is published **only when the boolean
 * crosses the 1.5× gate**, never on the zoom value itself — otherwise a
 * two-finger gesture would re-render the entire tray sixty times a second, which
 * is exactly the failure this whole architecture exists to prevent. The same
 * discipline applies to `regionRevision`: it ticks when the camera settles, not
 * while it moves.
 */

import { create } from 'zustand';
import type { PieceId } from '@/cut/types';
import type { Lens } from '@/tray/lenses';

/** §06's three detents on iPhone: one row of pieces, half, full. */
export type SheetDetent = 'peek' | 'half' | 'full';

/** §06: docked right on iPad, 300–380pt, resizable by its inner edge. */
export const TRAY_MIN_WIDTH = 300;
export const TRAY_MAX_WIDTH = 380;

export interface ChromeState {
  status: 'cutting' | 'playing' | 'failed';
  /** The real computed number, never the target (§04). */
  cut: { done: number; total: number; cols: number; rows: number };

  placed: number;
  total: number;

  lens: Lens;
  /** The colour bin, when the lens is Colour. Null otherwise. */
  lensArg: number | null;

  /** Bumped when the visible world rectangle has settled somewhere new. */
  regionRevision: number;
  regionUnlocked: boolean;

  trayWidth: number;
  detent: SheetDetent;
  /** Restored when the drag ends, so the mat is never obscured mid-drag (§06). */
  detentBeforeDrag: SheetDetent | null;

  /** Select mode (§06). Chrome state — the board knows nothing about it. */
  selecting: boolean;
  selectedCount: number;
  /** Pinned piece ids, in canonical order. Republished when the tray bumps. */
  shelf: PieceId[];

  setStatus: (status: ChromeState['status']) => void;
  setCut: (cut: Partial<ChromeState['cut']>) => void;
  setProgress: (placed: number, total: number) => void;
  setLens: (lens: Lens, arg?: number | null) => void;
  setRegionUnlocked: (unlocked: boolean) => void;
  bumpRegion: () => void;
  setTrayWidth: (width: number) => void;
  setDetent: (detent: SheetDetent) => void;
  collapseForDrag: () => void;
  restoreAfterDrag: () => void;
  setSelecting: (selecting: boolean) => void;
  setSelectedCount: (count: number) => void;
  setShelf: (shelf: PieceId[]) => void;
}

export const useChrome = create<ChromeState>((set) => ({
  status: 'cutting',
  cut: { done: 0, total: 0, cols: 0, rows: 0 },

  placed: 0,
  total: 0,

  lens: 'all',
  lensArg: null,

  regionRevision: 0,
  regionUnlocked: false,

  trayWidth: 340,
  detent: 'half',
  detentBeforeDrag: null,

  selecting: false,
  selectedCount: 0,
  shelf: [],

  setStatus: (status) => set({ status }),
  setCut: (cut) => set((state) => ({ cut: { ...state.cut, ...cut } })),
  setProgress: (placed, total) => set({ placed, total }),

  setLens: (lens, arg = null) => set({ lens, lensArg: lens === 'colour' ? arg : null }),

  setRegionUnlocked: (unlocked) =>
    set((state) => {
      if (state.regionUnlocked === unlocked) return state;
      // Falling below the gate while the Region lens is active would leave the
      // tray empty with no explanation. Drop back to All, which §06 says is
      // always one tap from anywhere anyway.
      if (!unlocked && state.lens === 'region') return { regionUnlocked: false, lens: 'all' };
      return { regionUnlocked: unlocked };
    }),

  bumpRegion: () => set((state) => ({ regionRevision: state.regionRevision + 1 })),

  setTrayWidth: (width) =>
    set({ trayWidth: Math.min(TRAY_MAX_WIDTH, Math.max(TRAY_MIN_WIDTH, Math.round(width))) }),

  setDetent: (detent) => set({ detent, detentBeforeDrag: null }),

  collapseForDrag: () =>
    set((state) =>
      state.detent === 'peek'
        ? state
        : { detent: 'peek', detentBeforeDrag: state.detentBeforeDrag ?? state.detent },
    ),

  restoreAfterDrag: () =>
    set((state) =>
      state.detentBeforeDrag === null
        ? state
        : { detent: state.detentBeforeDrag, detentBeforeDrag: null },
    ),

  setSelecting: (selecting) => set({ selecting }),
  setSelectedCount: (selectedCount) => set({ selectedCount }),
  setShelf: (shelf) => set({ shelf }),
}));
