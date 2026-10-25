/**
 * An on/off control drawn as a switch (2026-10-20 modern-look spec §2).
 *
 * Still a toggle *button* with `aria-pressed`, not `role="switch"`: screen
 * readers announce both, and the browser suite asserts `aria-pressed` on every
 * assist. The thumb's position is the non-colour signal (§13); the hit area is
 * the whole `touch-target`, so the 26px track never shrinks what a finger can
 * land on — 44pt, or 60 under comfort.
 */

export interface ToggleProps {
  on: boolean;
  onChange: () => void;
  /** The accessible name — the row's visible label says the same thing. */
  label: string;
  disabled?: boolean;
}

export function Toggle({ on, onChange, label, disabled = false }: ToggleProps): React.ReactElement {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
      onClick={onChange}
      className="touch-target flex items-center justify-end disabled:opacity-40"
    >
      <span
        aria-hidden
        className={`flex h-[26px] w-[44px] items-center rounded-full p-[3px] transition-colors duration-[var(--duration-base)] ${
          on ? 'bg-[var(--accent)]' : 'bg-[var(--edge-hair)]'
        }`}
      >
        <span
          className={`h-[20px] w-[20px] rounded-full bg-[var(--ink-primary)] shadow-[0_1px_4px_rgb(0_0_0/0.3)] transition-transform duration-[var(--duration-base)] ease-[var(--ease-standard)] ${
            on ? 'translate-x-[18px]' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  );
}
