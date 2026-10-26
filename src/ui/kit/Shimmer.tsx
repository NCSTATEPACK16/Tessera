/**
 * A skeleton block for something still loading (2026-10-20 modern-look spec
 * §2). The one looping animation in the kit, and it only exists while there is
 * nothing to show yet — never on an idle board.
 */

export function Shimmer({ className = '' }: { className?: string }): React.ReactElement {
  return (
    <div
      aria-hidden
      className={`rounded-[var(--radius-sm)] ${className}`}
      style={{
        background:
          'linear-gradient(90deg, var(--mat-raised) 25%, var(--edge-hair) 50%, var(--mat-raised) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.6s linear infinite',
      }}
    />
  );
}
