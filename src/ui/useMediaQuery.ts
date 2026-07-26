/**
 * Form-factor detection, from CSS rather than from a user-agent string.
 *
 * §06 specifies the tray twice — "iPad landscape: docked right" and "iPhone
 * portrait: a bottom sheet at three detents" — and what actually decides between
 * them is how much room there is, not which device is holding it. A phone in a
 * desktop browser window gets the dock and that is correct.
 */

import { useEffect, useState } from 'react';

/** Below this the tray would eat the mat, so it becomes a sheet over it. */
export const DOCK_QUERY = '(min-width: 768px)';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const update = (): void => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);

  return matches;
}
