import { CROWD_COLORS } from "@/data/lineColors";
import type { NetworkCrowd } from "@/features/map/useNetworkCrowd";

const CROWD_LEVELS = [
  { key: "low", label: "Low", size: 6 },
  { key: "moderate", label: "Moderate", size: 10 },
  { key: "high", label: "Crowded / high", size: 14 },
] as const;

const SOURCE_LABELS = {
  live: "Live platform crowding",
  forecast: "Forecast platform crowding",
  simulated: "Simulated data",
  mixed: "Live and forecast readings",
} as const;

function formatTime(iso: string | null): string | null {
  if (!iso || !Number.isFinite(Date.parse(iso))) return null;
  return new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

/**
 * Legend for the Network Map crowd layer: three levels shown by size as well as
 * colour, and an honest label for where the readings came from.
 *
 * Validates: Requirements 15.1, 15.2
 */
export function CrowdLegend({ crowd }: { crowd: NetworkCrowd }) {
  const time = crowd.status === "ready" ? formatTime(crowd.observedAt) : null;
  const heading = crowd.status === "loading"
    ? "Crowd density · loading…"
    : crowd.status === "error"
      ? "Crowd density unavailable"
      : `Crowd density · ${SOURCE_LABELS[crowd.source]}${time ? ` · ${time}` : ""}`;

  return (
    <div
      className="pointer-events-auto rounded-lg bg-card/90 p-3 shadow-md border border-border backdrop-blur-sm"
      role="region"
      aria-label="Crowd density legend"
    >
      <p className="mb-2 text-xs font-semibold text-foreground" aria-live="polite">{heading}</p>
      {crowd.status === "ready" && crowd.readings.length === 0 && (
        <p className="mb-2 text-xs text-muted-foreground">No station readings right now.</p>
      )}
      <ul className="flex flex-col gap-1.5">
        {CROWD_LEVELS.map(({ key, label, size }) => (
          <li key={key} className="flex items-center gap-2">
            <span className="grid w-4 place-items-center" aria-hidden="true">
              <span className="inline-block rounded-full" style={{ backgroundColor: CROWD_COLORS[key], width: size, height: size }} />
            </span>
            <span className="text-xs text-muted-foreground">{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
