/**
 * v2 spec §3's tab bar. A phone gets a bottom bar, 49pt plus the home
 * indicator's inset; at 768pt and wider it becomes a centred floating bar on
 * top (the iPadOS 18 pattern). `TabShell` decides which, by order alone — the
 * bar is the same element either way.
 *
 * Selected is an accent icon *and* a primary-ink label, never colour alone
 * (§13). The Today badge is a dot with its own accessible name, never a number.
 */

import { Icon } from './kit';
import { TABS, type Tab } from './tabs';

const LABELS: Record<Tab, string> = { today: 'Today', puzzles: 'Puzzles', collection: 'Collection' };

const ICONS: Record<Tab, () => React.ReactElement> = {
  today: () => <Icon.Home size={22} />,
  puzzles: () => <Icon.Grid size={22} />,
  collection: () => <Icon.Photo size={22} />,
};

export interface TabBarProps {
  active: Tab;
  onSelect: (tab: Tab) => void;
  todayBadge: boolean;
}

export function TabBar({ active, onSelect, todayBadge }: TabBarProps): React.ReactElement {
  return (
    <nav
      aria-label="Tabs"
      className="flex shrink-0 justify-around border-t border-[var(--edge-hair)] bg-[var(--mat-raised)] md:mt-3 md:justify-center md:gap-1 md:self-center md:rounded-full md:border md:p-1 md:shadow-[var(--shadow-raise)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {TABS.map((tab) => {
        const selected = tab === active;
        return (
          <button
            key={tab}
            type="button"
            // The name stays the bare label; the badge is described, not named,
            // so "Today" reads the same with or without the dot.
            aria-label={LABELS[tab]}
            aria-describedby={tab === 'today' && todayBadge ? 'today-badge' : undefined}
            aria-current={selected ? 'page' : undefined}
            onClick={() => onSelect(tab)}
            className={`relative flex min-h-[49px] min-w-[var(--touch-min)] flex-1 flex-col items-center justify-center gap-0.5 text-1 md:flex-none md:flex-row md:gap-2 md:rounded-full md:px-4 md:text-2 ${
              selected
                ? 'text-[var(--ink-primary)] md:bg-[var(--accent-dim)]'
                : 'text-[var(--ink-muted)]'
            }`}
          >
            <span className={selected ? 'text-[var(--accent)]' : undefined}>{ICONS[tab]()}</span>
            <span>{LABELS[tab]}</span>
            {tab === 'today' && todayBadge && (
              <span
                id="today-badge"
                role="img"
                aria-label="Daily not played yet"
                className="absolute right-[calc(50%-18px)] top-2 h-2 w-2 rounded-full bg-[var(--accent)] md:right-2"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
