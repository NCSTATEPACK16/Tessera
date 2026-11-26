/**
 * A subtree with its own accent. `Shell` puts the daily's accent on its root;
 * a portal to `document.body` (the reopened card) leaves that subtree in the
 * DOM, so it reads the accent from this context and re-applies the same scope
 * on its own root. `[data-accent-scope]` in `theme.css` re-derives the tokens
 * built from `--accent`, which would otherwise resolve against `:root`'s.
 */

import { createContext, type CSSProperties } from 'react';

export const AccentContext = createContext<string | null>(null);

/** The attribute and style that make an element an accent scope. */
export function accentScope(accent: string | null): {
  'data-accent-scope'?: '';
  style?: CSSProperties;
} {
  if (!accent) return {};
  return {
    'data-accent-scope': '',
    style: { '--accent': accent, '--color-accent': accent } as CSSProperties,
  };
}
