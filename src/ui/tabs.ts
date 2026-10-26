/**
 * v2 spec §3: three tabs, peer sections, never actions. Which screen belongs
 * to which tab is the whole decision; `TabBar` only draws it. Every screen
 * that maps to `null` — setup, play, the first run, the boot check — hides the
 * bar, and play is mounted outside the tab tree entirely, so switching tabs
 * never touches `PlayRuntime`.
 */

export type Tab = 'today' | 'puzzles' | 'collection';

export const TABS: readonly Tab[] = ['today', 'puzzles', 'collection'];

/** The screen a tab lands on. Today's daily hub is a push within it. */
export const TAB_SCREEN = { today: 'home', puzzles: 'library', collection: 'wall' } as const;

export function tabOf(screen: string): Tab | null {
  switch (screen) {
    case 'home':
    case 'daily':
      return 'today';
    case 'library':
      return 'puzzles';
    case 'wall':
      return 'collection';
    default:
      return null;
  }
}
