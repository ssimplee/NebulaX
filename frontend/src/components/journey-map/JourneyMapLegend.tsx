import { forwardRef, type ReactNode } from "react";
import { CheckCircle2, Crosshair, TriangleAlert } from "lucide-react";
import type { BasemapProvider } from "@/features/journey-map/basemap";
import { LINE_COLORS } from "@/data/lineColors";
import { LINE_NAMES, candidateSummary, eventSummary, formatClock, roleName, walkingMinutes } from "@/features/journey-map/journeyLayers";
import type { JourneyMapModel, MapCandidate, RoleLabels } from "@/features/journey-map/journeyMap.types";
import { LEGEND_ITEMS } from "@/features/journey-map/journeyStyles";

interface Props {
  model: JourneyMapModel;
  selectedCandidateId: string;
  onSelectCandidate?: (candidateId: string) => void;
  onRecenter: () => void;
  attribution: BasemapProvider["attribution"];
  /** Controls placed beside the recenter button, such as a data-mode picker. */
  header?: ReactNode;
  /** Where the data came from and how fresh it is. */
  status?: ReactNode;
}

function Swatch({ color, weight, dash }: { color: string; weight: number; dash?: string }) {
  return (
    <svg width="28" height="10" viewBox="0 0 28 10" aria-hidden="true" className="shrink-0">
      <line x1="2" y1="5" x2="26" y2="5" stroke={color} strokeWidth={weight} strokeDasharray={dash} strokeLinecap="round" />
    </svg>
  );
}

/** Minutes this candidate saves (positive) or costs (negative) against the original. */
function tradeOff(candidate: MapCandidate, original: MapCandidate | undefined, labels: RoleLabels): string | null {
  if (!original || original.id === candidate.id) return null;
  const minutes = candidate.arrivalAt && original.arrivalAt
    ? Math.round((Date.parse(original.arrivalAt) - Date.parse(candidate.arrivalAt)) / 60_000)
    : candidate.durationMinutes != null && original.durationMinutes != null ? original.durationMinutes - candidate.durationMinutes : null;
  if (minutes == null) return null;
  if (minutes === 0) return `same time as ${labels.comparedWith}`;
  return minutes > 0 ? `${minutes} min earlier than ${labels.comparedWith}` : `${-minutes} min later than ${labels.comparedWith}`;
}

/**
 * The card under the map, kept short so the route stays visible on a phone:
 * the decision first, then the routes with their trade-offs. Alerts, extra
 * options and the key fold away. Attribution is always visible here.
 */
export const JourneyMapLegend = forwardRef<HTMLDivElement, Props>(function JourneyMapLegend(
  { model, selectedCandidateId, onSelectCandidate, onRecenter, attribution, header, status }, ref,
) {
  const original = model.candidates.find((candidate) => candidate.id === model.originalCandidateId);
  const approximate = model.candidates.some((candidate) => candidate.legs.some((leg) => leg.geometrySource !== "routed" && leg.path));
  const orderedCandidates = [...model.candidates].sort((a, b) => Number(b.role === "recommended") - Number(a.role === "recommended"));
  // The recommendation, the original and any picked option stay visible; the rest fold away.
  const isMain = (candidate: MapCandidate) => candidate.role !== "other" || candidate.id === selectedCandidateId;
  const mainCandidates = orderedCandidates.filter(isMain);
  const moreCandidates = orderedCandidates.filter((candidate) => !isMain(candidate));
  const eventLines = model.events.map(eventSummary).filter((line): line is string => line != null);

  const renderCandidate = (candidate: MapCandidate) => {
    const selected = candidate.id === selectedCandidateId;
    const delta = tradeOff(candidate, original, model.labels);
    const range = candidate.arrivalRange ? `${formatClock(candidate.arrivalRange.earliest)}–${formatClock(candidate.arrivalRange.latest)}` : null;
    const walking = walkingMinutes(candidate);
    const mainLine = candidate.legs.find((leg) => leg.mode === "rail" && leg.lineCode)?.lineCode;
    const affectedLeg = candidate.legs.find((leg) => leg.affectedEventIds.length);
    const affectingEvent = model.events.find((event) => affectedLeg?.affectedEventIds.includes(event.id));
    const lineName = affectedLeg?.lineCode ? LINE_NAMES[affectedLeg.lineCode] : "this route";
    const warning = !affectedLeg ? null
      : affectingEvent?.kind === "planned" ? `Passes planned works on ${lineName}`
        : affectingEvent?.severity === "minor" ? `Passes a minor delay on ${lineName}`
          : `Passes the disrupted ${lineName} stretch`;
    const swatch = selected ? { ...LEGEND_ITEMS[0].sample, color: (mainLine && LINE_COLORS[mainLine]) || "#334155" } : LEGEND_ITEMS[1].sample;
    const detail = [
      candidate.label !== roleName(candidate, model.labels) ? candidate.label : null,
      range,
      delta,
    ].filter(Boolean).join(" · ");
    return (
      <li key={candidate.id}>
        <button
          type="button"
          aria-pressed={selected}
          onClick={() => onSelectCandidate?.(candidate.id)}
          disabled={!onSelectCandidate}
          aria-description={walking != null ? `${walking} minutes walking` : undefined}
          className={`flex min-h-11 w-full items-center gap-2 rounded-lg border px-2 py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 ${selected ? "border-slate-900 bg-slate-50" : "border-transparent"}`}
        >
          <Swatch {...swatch} />
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-tight">{candidateSummary(candidate, model.labels)}</span>
            {detail && <span className="block truncate text-xs text-muted-foreground">{detail}</span>}
            {warning && <span className="block text-xs font-semibold text-red-900">⚠ {warning}</span>}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div ref={ref} className="pointer-events-auto rounded-t-xl border border-b-0 bg-card/95 px-3 pb-2 pt-2 text-card-foreground shadow-lg backdrop-blur md:rounded-xl md:border-b">
      <div className="mb-1.5 flex items-center gap-2">
        <div className="min-w-0 flex-1">{header}</div>
        <button type="button" onClick={onRecenter} aria-label="Show the whole route"
          className="grid size-11 shrink-0 place-items-center rounded-lg border bg-card focus-visible:outline-2 focus-visible:outline-offset-2">
          <Crosshair size={20} aria-hidden="true" />
        </button>
      </div>
      {status && <div className="mb-1.5">{status}</div>}

      {model.decision && (
        model.decision.shouldNotify ? (
          <div role="status" className="mb-1.5 rounded-lg border border-red-900/40 bg-red-50 px-2 py-1.5 text-red-950">
            <p className="flex items-start gap-1.5 text-sm font-bold"><TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />{model.decision.action}</p>
            <p className="pl-6 text-xs">{model.decision.reason}</p>
          </div>
        ) : (
          <p role="status" className="mb-1.5 flex items-center gap-1.5 rounded-lg border border-green-800/40 bg-green-50 px-2 py-1.5 text-sm font-semibold text-green-950">
            <CheckCircle2 size={18} className="shrink-0" aria-hidden="true" />{model.decision.action}
          </p>
        )
      )}

      <ul className="flex flex-col gap-1" aria-label="Routes on the map">
        {mainCandidates.map(renderCandidate)}
      </ul>

      <div className="mt-1 flex flex-wrap gap-x-4 text-xs">
        {moreCandidates.length > 0 && (
          <details className="min-w-0">
            <summary className="flex min-h-8 cursor-pointer items-center font-semibold">More options ({moreCandidates.length})</summary>
            <ul className="mt-1 flex flex-col gap-1" aria-label="More route options">
              {moreCandidates.map(renderCandidate)}
            </ul>
          </details>
        )}
        <details className="min-w-0">
          <summary className="flex min-h-8 cursor-pointer items-center font-semibold">{eventLines.length ? `Alerts (${eventLines.length}) & map key` : "Map key"}</summary>
          {eventLines.length > 0 && (
            <ul aria-label="Disruptions on the map" className="mt-1 flex flex-col gap-0.5 font-semibold text-red-900">
              {eventLines.map((line) => <li key={line}>⚠ {line}</li>)}
            </ul>
          )}
          <ul className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {LEGEND_ITEMS.map((item) => <li key={item.key} className="flex items-center gap-2"><Swatch {...item.sample} />{item.label}</li>)}
            <li className="flex items-center gap-2"><span className="jm-bars" aria-hidden="true"><i className="is-on" /><i /><i /></span>Crowding: 1 bar low, 2 moderate, 3 high</li>
          </ul>
          {approximate && <p className="mt-1 text-muted-foreground">Rail lines join station positions and walks without a routed path are straight lines: both are approximate.</p>}
        </details>
      </div>

      <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
        {attribution.map((credit, index) => (
          <span key={credit.label}>
            {index > 0 && " · "}
            {credit.href ? <a href={credit.href} target="_blank" rel="noreferrer" className="underline">{credit.label}</a> : credit.label}
          </span>
        ))}
        {" · Station outlines: URA Master Plan 2014"}
      </p>
    </div>
  );
});
