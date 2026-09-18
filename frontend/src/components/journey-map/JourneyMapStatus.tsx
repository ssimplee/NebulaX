import { AlertTriangle, Calculator, CloudOff, Clock, FlaskConical, Loader2, Radio } from "lucide-react";
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
  const toneClass = tone === "warn" ? "border-amber-700 bg-amber-50 text-amber-950" : "border-slate-300 bg-slate-50 text-slate-800";
  return <li className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneClass}`}>{icon}{children}</li>;
}

/** Honest state of the map and its data: demo, offline, stale, background failure. */
export function JourneyMapStatus({ dataState, basemapStatus, online, now, hasDrawableRoute }: Props) {
  const updated = formatClock(dataState.observedAt);
  const stale = now > Date.parse(dataState.staleAt);
  return (
    <ul aria-live="polite" aria-label="Map status" className="flex flex-wrap gap-1">
      {dataState.feed === "recorded" && <Chip tone="info" icon={<FlaskConical size={14} aria-hidden="true" />}>Demo replay · simulated disruption</Chip>}
      {dataState.feed === "demo-scenario" && <Chip tone="info" icon={<FlaskConical size={14} aria-hidden="true" />}>Demo scenario · simulated</Chip>}
      {!dataState.feed && dataState.simulated && <Chip tone="info" icon={<FlaskConical size={14} aria-hidden="true" />}>Demo replay · not live</Chip>}
      {dataState.feed === "live" && !dataState.conditionsUnavailable && <Chip tone="info" icon={<Radio size={14} aria-hidden="true" />}>Live conditions · updated {updated}</Chip>}
      {dataState.feed === "live" && dataState.conditionsUnavailable && <Chip tone="warn" icon={<AlertTriangle size={14} aria-hidden="true" />}>Live conditions unavailable</Chip>}
      {dataState.includesSimulated && <Chip tone="warn" icon={<FlaskConical size={14} aria-hidden="true" />}>Includes simulated data</Chip>}
      {(dataState.staleSources?.length ?? 0) > 0 && <Chip tone="warn" icon={<Clock size={14} aria-hidden="true" />}>Stale: {dataState.staleSources!.join(", ")}</Chip>}
      {dataState.estimatedTimes && <Chip tone="info" icon={<Calculator size={14} aria-hidden="true" />}>Times are estimates</Chip>}
      {!online && <Chip tone="warn" icon={<CloudOff size={14} aria-hidden="true" />}>Offline · showing journey from {updated}</Chip>}
      {online && stale && !dataState.simulated && <Chip tone="warn" icon={<Clock size={14} aria-hidden="true" />}>May be out of date · updated {updated}</Chip>}
      {basemapStatus === "loading" && <Chip tone="info" icon={<Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}>Loading map…</Chip>}
      {basemapStatus === "error" && <Chip tone="warn" icon={<AlertTriangle size={14} aria-hidden="true" />}>Street map unavailable · route still shown</Chip>}
      {!hasDrawableRoute && <Chip tone="warn" icon={<AlertTriangle size={14} aria-hidden="true" />}>No route shape available</Chip>}
    </ul>
  );
}
