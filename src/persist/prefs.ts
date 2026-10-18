import { STORE_DAILY, idbGet, idbPut } from './db';

/**
 * Which side the iPad dock sits on (v2 spec §5.3). The two-handed grip puts
 * one thumb on the tray, so a left-handed player wants it on the left.
 *
 * IndexedDB, never `localStorage` (CLAUDE.md): a layout preference is not
 * session state, but it is also not worth a second storage mechanism, and it
 * fails open — unreadable reads as the default side.
 */
export type TraySide = 'left' | 'right';

const TRAY_SIDE_KEY = 'traySide';

export async function loadTraySide(): Promise<TraySide> {
  try {
    const row = await idbGet<{ key: string; side: TraySide }>(STORE_DAILY, TRAY_SIDE_KEY);
    return row?.side === 'left' ? 'left' : 'right';
  } catch {
    return 'right';
  }
}

export async function saveTraySide(side: TraySide): Promise<void> {
  await idbPut(STORE_DAILY, { key: TRAY_SIDE_KEY, side });
}
