/**
 * The progress ring (§12): sizes 20 / 32 / 64, arc drawn in the session accent.
 *
 * SVG rather than canvas because it is chrome, and §03 is explicit that chrome
 * is "plain DOM, fully accessible, never inside the canvas". The arc carries an
 * accessible value so the percentage is available without reading a shape.
 */

export interface ProgressRingProps {
  /** 0–1. */
  completion: number;
  size?: 20 | 32 | 64;
}

export function ProgressRing({ completion, size = 32 }: ProgressRingProps): React.ReactElement {
  const stroke = size <= 20 ? 2 : size <= 32 ? 3 : 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, completion));

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-label="Puzzle progress"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--edge-hair)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
        // From twelve o'clock, which is the only start position that reads as
        // "filling up" rather than "sweeping".
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset var(--duration-slow) var(--ease-standard)' }}
      />
    </svg>
  );
}
