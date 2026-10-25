/**
 * The one button (2026-10-20 modern-look spec §2). Four variants, two sizes,
 * a press that scales to 0.96 — replacing the hand-written class strings that
 * had drifted apart screen by screen. Always clears `--touch-min`.
 */

import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'default' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'lg';
  /** React 19 passes `ref` as a plain prop; `...rest` carries it to the element. */
  ref?: React.Ref<HTMLButtonElement>;
}

// Primary is a fill with no glow: the 2026-10-25 audit flagged the coloured
// halo on every screen, and the brief says no drop-shadow soup.
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--accent)] text-[var(--mat-void)]',
  default: 'border border-[var(--edge-hair)] bg-[var(--mat-raised)] text-[var(--ink-primary)]',
  ghost: 'border border-[var(--edge-hair)] text-[var(--ink-muted)]',
  danger:
    'border border-[color-mix(in_srgb,var(--danger)_25%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)]',
};

const SIZES = { md: 'px-4 text-2', lg: 'px-5 py-3 text-3' } as const;

export function Button({
  variant = 'default',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}: ButtonProps): React.ReactElement {
  return (
    <button
      type={type}
      className={`touch-target rounded-[var(--radius-md)] transition-transform duration-[var(--duration-fast)] ease-[var(--ease-standard)] active:scale-[0.96] disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    />
  );
}
