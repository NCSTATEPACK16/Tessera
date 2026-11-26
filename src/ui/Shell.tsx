/**
 * The tab shell (v2 spec §3; extracted from `App.tsx` in modernize phase b).
 * Today, Puzzles, Collection and the daily hub render inside it; setup, play,
 * the first run and the card render outside it, so the bar is hidden there by
 * construction and switching tabs never touches `PlayRuntime`.
 *
 * It also carries Today's accent (modernize §2): the daily photo's colour,
 * set on this root rather than on `:root`, so the play screen's extracted
 * accent — which `App` writes to the document — is untouched by it.
 */

import type { ReactNode } from 'react';
import type { TraySide } from '@/persist/prefs';
import { SettingsSheet } from './SettingsSheet';
import { TabBar } from './TabBar';
import type { Tab } from './tabs';

export interface ShellProps {
  activeTab: Tab;
  todayBadge: boolean;
  onSelectTab: (tab: Tab) => void;
  /** A hex colour; the daily's accent through `accentFromDominant`. */
  accent: string;
  settings: {
    open: boolean;
    onClose: () => void;
    traySide: TraySide;
    onTraySide: (side: TraySide) => void;
  };
  children: ReactNode;
}

export function Shell({
  activeTab,
  todayBadge,
  onSelectTab,
  accent,
  settings,
  children,
}: ShellProps): React.ReactElement {
  return (
    <div
      className="flex h-full w-full flex-col bg-[var(--mat-void)]"
      data-accent-scope=""
      style={{ '--accent': accent, '--color-accent': accent } as React.CSSProperties}
    >
      {/* At `md` the bar floats over the bottom of this scroller, so the last
          row clears it: the pill's 49pt plus its 16pt inset and a gutter. */}
      <main
        className="min-h-0 flex-1 overflow-y-auto md:pb-24"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {children}
      </main>
      <TabBar active={activeTab} todayBadge={todayBadge} onSelect={onSelectTab} />
      <SettingsSheet
        open={settings.open}
        onClose={settings.onClose}
        traySide={settings.traySide}
        onTraySide={settings.onTraySide}
      />
    </div>
  );
}
