import { CROWD_COLORS } from "@/data/lineColors";

export type CrowdLevel = "low" | "moderate" | "high";

/** Size grows with the level, so the scale reads without colour. */
const SIZES: Record<CrowdLevel, { glow: number; dot: number }> = {
  low: { glow: 9, dot: 3 },
  moderate: { glow: 13, dot: 5 },
  high: { glow: 18, dot: 7 },
};

interface CrowdMarkerProps {
  /** SVG viewBox x coordinate of the station */
  cx: number;
  /** SVG viewBox y coordinate of the station */
  cy: number;
  /** Crowd density level */
  level: CrowdLevel;
  /** Station name for accessibility */
  stationName?: string;
}

/**
 * Colour-coded glowing circle rendered on the SVG overlay to indicate
 * crowd density at a station.
 *
 * Uses a radial gradient to create a soft glow effect that fades out,
 * making the heatmap overlay visually distinct from station hit targets.
 *
 * Validates: Requirements 3.8, 3.9, 15.1, 15.2
 */
export function CrowdMarker({ cx, cy, level, stationName }: CrowdMarkerProps) {
  const color = CROWD_COLORS[level] ?? CROWD_COLORS.low;
  const gradientId = `crowd-glow-${cx}-${cy}`;

  return (
    <g aria-label={stationName ? `${stationName}: ${level} crowd` : undefined}>
      <defs>
        <radialGradient id={gradientId}>
          <stop offset="0%" stopColor={color} stopOpacity={0.8} />
          <stop offset="60%" stopColor={color} stopOpacity={0.4} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>
      {/* Outer glow */}
      <circle
        cx={cx}
        cy={cy}
        r={SIZES[level].glow}
        fill={`url(#${gradientId})`}
        pointerEvents="none"
      />
      {/* Inner solid dot */}
      <circle
        cx={cx}
        cy={cy}
        r={SIZES[level].dot}
        fill={color}
        opacity={0.9}
        pointerEvents="none"
      />
    </g>
  );
}
