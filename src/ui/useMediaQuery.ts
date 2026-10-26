/**
 * Form-factor detection, from CSS rather than from a user-agent string.
 *
 * §06 specifies the tray twice — "iPad landscape: docked right" and "iPhone
 * portrait: a bottom sheet at three detents" — and what actually decides between
 * them is how much room there is, not which device is holding it. A phone in a
 * desktop browser window gets the dock and that is correct.
 */

import { useEffect, useState } from 'react';

/**
 * v2 spec §5.3: the dock only in landscape and only from 1024pt. In iPad
 * portrait a 340pt dock took ~41% of the board's width; the sheet does not.
 */
export const DOCK_QUERY = '(orientation: landscape) and (min-width: 1024px)';

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
