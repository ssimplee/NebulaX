import { AlertTriangle, CloudOff, Clock, FlaskConical, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { formatClock } from "@/features/journey-map/journeyLayers";
import type { MapDataState } from "@/features/journey-map/journeyMap.types";

export type BasemapStatus = "loading" | "ready" | "error";

interface Props {
  dataState: MapDataState;
  basemapStatus: BasemapStatus;
  online: boolean;
  now: number;
  hasDrawableRoute: boolean;
}

function Chip({ tone, icon, children }: { tone: "info" | "warn"; icon: ReactNode; children: ReactNode }) {
  const toneClass = tone === "warn" ? "border-amber-700 bg-amber-50 text-amber-950" : "border-slate-400 bg-white text-slate-900";
  return <li className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold shadow-sm ${toneClass}`}>{icon}{children}</li>;
}

/** Honest state of the map and its data: demo, offline, stale, background failure. */
export function JourneyMapStatus({ dataState, basemapStatus, online, now, hasDrawableRoute }: Props) {
  const updated = formatClock(dataState.observedAt);
  const stale = now > Date.parse(dataState.staleAt);
  return (
    <ul aria-live="polite" aria-label="Map status" className="pointer-events-none flex flex-wrap gap-1.5">
      {dataState.simulated && <Chip tone="info" icon={<FlaskConical size={14} aria-hidden="true" />}>Demo replay · not live</Chip>}
      {!online && <Chip tone="warn" icon={<CloudOff size={14} aria-hidden="true" />}>Offline · showing journey from {updated}</Chip>}
      {online && stale && !dataState.simulated && <Chip tone="warn" icon={<Clock size={14} aria-hidden="true" />}>May be out of date · updated {updated}</Chip>}
      {basemapStatus === "loading" && <Chip tone="info" icon={<Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}>Loading map…</Chip>}
      {basemapStatus === "error" && <Chip tone="warn" icon={<AlertTriangle size={14} aria-hidden="true" />}>Street map unavailable · route still shown</Chip>}
      {!hasDrawableRoute && <Chip tone="warn" icon={<AlertTriangle size={14} aria-hidden="true" />}>No route shape available</Chip>}
    </ul>
  );
}
