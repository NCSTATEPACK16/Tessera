/**
 * `navigator.onLine`, kept current. Today's offline row (modernize §4) reads
 * it; the false-positive case (a captive portal reporting online) only costs a
 * row that does not appear, never a blocked control.
 */

import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
