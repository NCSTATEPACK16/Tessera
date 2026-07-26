/**
 * The product entry point.
 *
 * The dev harness lives at `/dev.html` and keeps every snap-tuning dial from
 * step 2 — §17 budgets a week on that tuning and it is not thrown away the
 * moment chrome exists. It goes at step 5, when the real setup screen lands.
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
