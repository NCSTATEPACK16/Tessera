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
import './ui/theme.css';

const root = document.getElementById('root');
if (!root) throw new Error('main: missing #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
