/**
 * The chrome's icon set (2026-10-20 modern-look spec §2), drawn from the
 * TesseraV3Figma mock. Stroke icons in `currentColor`, so they take the
 * button's ink. Always `aria-hidden`: the button carrying one owns the
 * accessible name, and every name the browser suite selects by stays a label.
 */

import type { ReactNode } from 'react';

function Svg({ size = 22, children }: { size?: number; children: ReactNode }): React.ReactElement {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export interface IconProps {
  size?: number;
}

export const Icon = {
  Back: ({ size = 20 }: IconProps) => (
    <Svg size={size}>
      <polyline points="15 18 9 12 15 6" />
    </Svg>
  ),
  Pause: ({ size = 18 }: IconProps) => (
    <Svg size={size}>
      <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" />
    </Svg>
  ),
  /** Fit: four corner brackets — frame the whole board. */
  Fit: ({ size = 18 }: IconProps) => (
    <Svg size={size}>
      <polyline points="4 9 4 4 9 4" />
      <polyline points="15 4 20 4 20 9" />
      <polyline points="20 15 20 20 15 20" />
      <polyline points="9 20 4 20 4 15" />
    </Svg>
  ),
  /** Zoom in: a lens with a plus. */
  ZoomIn: ({ size = 18 }: IconProps) => (
    <Svg size={size}>
      <circle cx="11" cy="11" r="6.5" />
      <line x1="20" y1="20" x2="15.6" y2="15.6" />
      <line x1="11" y1="8" x2="11" y2="14" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </Svg>
  ),
  /** Zoom out: a lens with a minus. */
  ZoomOut: ({ size = 18 }: IconProps) => (
    <Svg size={size}>
      <circle cx="11" cy="11" r="6.5" />
      <line x1="20" y1="20" x2="15.6" y2="15.6" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </Svg>
  ),
  Lightbulb: ({ size = 20 }: IconProps) => (
    <Svg size={size}>
      <line x1="9" y1="18" x2="15" y2="18" />
      <line x1="10" y1="22" x2="14" y2="22" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14" />
    </Svg>
  ),
  Plus: ({ size = 24 }: IconProps) => (
    <Svg size={size}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </Svg>
  ),
  Home: ({ size = 22 }: IconProps) => (
    <Svg size={size}>
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </Svg>
  ),
  Grid: ({ size = 22 }: IconProps) => (
    <Svg size={size}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Svg>
  ),
  /** The shelf's label: a pushpin, head up. */
  Pin: ({ size = 14 }: IconProps) => (
    <Svg size={size}>
      <path d="M9 3h6l-1 6 3 3H7l3-3-1-6z" />
      <line x1="12" y1="12" x2="12" y2="21" />
    </Svg>
  ),
  Photo: ({ size = 22 }: IconProps) => (
    <Svg size={size}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </Svg>
  ),
  Check: ({ size = 14 }: IconProps) => (
    <Svg size={size}>
      <polyline points="20 6 9 17 4 12" />
    </Svg>
  ),
  /** A freeze: the streak pip that a freeze covered (modernize §4). */
  Snowflake: ({ size = 10 }: IconProps) => (
    <Svg size={size}>
      <line x1="12" y1="2" x2="12" y2="22" />
      <line x1="3.3" y1="7" x2="20.7" y2="17" />
      <line x1="3.3" y1="17" x2="20.7" y2="7" />
    </Svg>
  ),
  Offline: ({ size = 18 }: IconProps) => (
    <Svg size={size}>
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M8.5 16.5a5 5 0 017 0" />
      <path d="M5 13a10 10 0 015.2-2.8" />
      <path d="M19 13a10 10 0 00-2.3-1.6" />
      <path d="M2 8.8a15 15 0 014.2-2.6" />
      <path d="M22 8.8A15 15 0 0011 5" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </Svg>
  ),
  Gear: ({ size = 22 }: IconProps) => (
    <Svg size={size}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </Svg>
  ),
};
