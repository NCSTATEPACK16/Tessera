/**
 * The product entry point, and now the only page.
 *
 * `dev.html` and the step-2 harness were deleted at step 5c, per `CLAUDE.md`'s
 * long-standing marker: the real setup screen and the pause sheet's live
 * settings now carry the snap-tuning dials the harness existed for.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { PwaRegistrar } from './ui/PwaBanner';
import { isNative } from './platform';
// §13's three families, bundled rather than fetched from Google Fonts: a
// render-blocking cross-origin stylesheet held the Capacitor shell on a white
// screen for ~20s, and would hang every offline launch outright. Latin only.
// Instrument Serif "never in chrome" — the completion card is its one use.
import '@fontsource/inter-tight/latin-400.css';
import '@fontsource/inter-tight/latin-500.css';
import '@fontsource/inter-tight/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/instrument-serif/latin-400.css';
import './ui/theme.css';

const root = document.getElementById('root');
if (!root) throw new Error('main: missing #root');

// The worker registers on every screen; its banner renders inline on Today.
// Never inside the Capacitor shell: the app ships its own files, updates come
// through TestFlight, and a cached shell there could only ever be stale.
createRoot(root).render(
  <StrictMode>
    <App />
    {!isNative && <PwaRegistrar />}
  </StrictMode>,
);
