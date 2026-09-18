import { MRT_STATIONS } from "@/features/mrt-map/topology";
import type { CrowdReading, MapLineCode } from "./geometryContract";
import type { CandidateRole, JourneyMapModel, LegMode, LonLat, MapCandidate, MapEvent, RoleLabels } from "./journeyMap.types";
import { footprintsForStation } from "./stationFootprints";

// Pure translation from the journey model to what the map draws. No Leaflet
// here, so every visual decision is unit-testable.

export const LINE_NAMES: Record<MapLineCode, string> = {
  NS: "NSL", EW: "EWL", NE: "NEL", CC: "CCL", DT: "DTL", TE: "TEL", CG: "EWL Changi",
};

const CROWD_WORDS = { low: "Low", moderate: "Moderate", high: "High" } as const;
const CROWD_SIGNAL_WORDS = { "platform-realtime": "platform now", "platform-forecast": "platform forecast" } as const;

export interface JourneyLine {
  id: string;
  candidateId: string;
  role: CandidateRole;
  selected: boolean;
  mode: LegMode;
  lineCode: MapLineCode | null;
  affected: boolean;
  approximate: boolean;
  path: LonLat[];
  /** Plain-language description for tooltips and screen readers. */
  description: string;
}

export type JourneyMarkerKind = "origin" | "destination" | "disruption" | "crowd" | "leg" | "route-tag" | "station";

export interface JourneyMarker {
  id: string;
  kind: JourneyMarkerKind;
  position: LonLat;
  /** Short visible text; never rely on the marker's colour alone. */
  text: string;
  description: string;
  candidateId?: string;
  stationId?: string;
  crowdLevel?: CrowdReading["level"];
  legMode?: LegMode;
  /** Disruption markers: a minor delay is drawn less loudly. */
  minor?: boolean;
  /** A one-stop or two-point leg whose label only fits once zoomed in. */
  short?: boolean;
}

export interface JourneyLayers {
  selectedCandidateId: string;
  lines: JourneyLine[];
  markers: JourneyMarker[];
  footprints: Array<{ stationId: string; polygon: LonLat[][] }>;
  /** South-west and north-east corners covering every route, or null when nothing is drawable. */
  bounds: [LonLat, LonLat] | null;
}

const stationName = (id: string) => MRT_STATIONS.get(id)?.name ?? id;
const stationPoint = (id: string): LonLat => {
  const station = MRT_STATIONS.get(id)!;
  return [station.longitude, station.latitude];
};
const midpoint = (path: readonly LonLat[]): LonLat => {
  if (path.length > 2) return path[Math.floor(path.length / 2)];
  return [(path[0][0] + path[path.length - 1][0]) / 2, (path[0][1] + path[path.length - 1][1]) / 2];
};
const isDrawable = (path: readonly LonLat[] | null): path is LonLat[] =>
  path != null && path.length >= 2 && path.some((point) => point[0] !== path[0][0] || point[1] !== path[0][1]);

export function formatClock(iso: string): string {
  if (!Number.isFinite(Date.parse(iso))) return "unknown time";
  return new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

/** Total walking minutes: the source's figure, else the sum when every walk leg states one. */
export function walkingMinutes(candidate: MapCandidate): number | null {
  if (candidate.walkingMinutes != null) return candidate.walkingMinutes;
  const walks = candidate.legs.filter((leg) => leg.mode === "walk");
  if (!walks.length || walks.some((leg) => leg.minutes == null)) return null;
  return walks.reduce((total, leg) => total + (leg.minutes ?? 0), 0);
}

export function roleName(candidate: MapCandidate, labels: RoleLabels): string {
  return candidate.role === "recommended" ? labels.recommended : candidate.role === "original" ? labels.original : candidate.label;
}

const eventWord = (event: MapEvent) => (event.kind === "planned" ? "Planned works" : event.severity === "minor" ? "Minor delay" : "Disrupted");

/** One-line summary of a located event, for the legend and screen readers. */
export function eventSummary(event: MapEvent): string | null {
  if (!event.lineCode || event.stationIds.length < 2) return null;
  const from = stationName(event.stationIds[0]);
  const to = stationName(event.stationIds[event.stationIds.length - 1]);
  const delay = event.delayMinutes != null ? ` · +${event.delayMinutes} min` : "";
  const word = event.kind === "planned" ? "Planned works" : event.severity === "minor" ? "Minor delay" : "Disruption";
  return `${word}: ${LINE_NAMES[event.lineCode]} ${from}–${to}${delay}`;
}

/** One-line headline for a candidate: role, then arrival or duration. */
export function candidateSummary(candidate: MapCandidate, labels: RoleLabels): string {
  const role = roleName(candidate, labels);
  if (candidate.arrivalAt) return `${role} · arrive ${formatClock(candidate.arrivalAt)}`;
  return candidate.durationMinutes != null ? `${role} · ${candidate.durationMinutes} min` : role;
}

function legText(mode: LegMode, lineCode: MapLineCode | null, minutes: number | null, approximate: boolean): string {
  const time = minutes != null ? ` · ${minutes} min` : "";
  if (mode === "walk") return `Walk${time}${approximate ? " (approx. path)" : ""}`;
  if (mode === "bus") return `Bus${time}`;
  return `${lineCode ? LINE_NAMES[lineCode] : "Train"}${time}`;
}

export function buildJourneyLayers(model: JourneyMapModel, selectedCandidateId?: string | null): JourneyLayers {
  const selectedId = model.candidates.some((candidate) => candidate.id === selectedCandidateId)
    ? selectedCandidateId!
    : model.recommendedCandidateId;
  // Only the comparison that matters is drawn: recommended against original,
  // plus any other option the commuter picked. Unselected first so the
  // selected route sits on top.
  const ordered = model.candidates
    .filter((candidate) => candidate.role !== "other" || candidate.id === selectedId)
    .sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId));
  const lines: JourneyLine[] = [];
  const markers: JourneyMarker[] = [];
  const allPoints: LonLat[] = [];
  const keyStations = new Set<string>();

  for (const candidate of ordered) {
    const selected = candidate.id === selectedId;
    const tag = roleName(candidate, model.labels);
    // Assigned inside the forEach below, which TypeScript cannot follow.
    let longestRail = null as LonLat[] | null;

    candidate.legs.forEach((leg) => {
      if (!isDrawable(leg.path)) return;
      allPoints.push(...leg.path);
      const approximate = leg.geometrySource !== "routed";
      const base = { candidateId: candidate.id, role: candidate.role, selected, mode: leg.mode, lineCode: leg.lineCode, approximate };

      if (leg.mode === "rail" && leg.segments.length) {
        keyStations.add(leg.stationIds[0]);
        keyStations.add(leg.stationIds[leg.stationIds.length - 1]);
        if (!longestRail || leg.path.length > longestRail.length) longestRail = leg.path;
        // Merge consecutive segments with the same affected state into one line.
        let run: { affected: boolean; stations: string[] } | null = null;
        const flush = () => {
          if (!run) return;
          const from = stationName(run.stations[0]);
          const to = stationName(run.stations[run.stations.length - 1]);
          const lineName = leg.lineCode ? LINE_NAMES[leg.lineCode] : "Train";
          lines.push({
            ...base,
            id: `${candidate.id}:${leg.index}:${lines.length}`,
            affected: run.affected,
            path: run.stations.map(stationPoint),
            description: `${tag}: ${lineName} ${from} to ${to}${run.affected ? ", disrupted" : ""}`,
          });
        };
        for (const segment of leg.segments) {
          const affected = segment.affectedEventIds.length > 0;
          if (run && run.affected === affected) run.stations.push(segment.toStationId);
          else {
            flush();
            run = { affected, stations: [segment.fromStationId, segment.toStationId] };
          }
        }
        flush();
      } else {
        lines.push({
          ...base,
          id: `${candidate.id}:${leg.index}`,
          affected: leg.affectedEventIds.length > 0,
          path: leg.path,
          description: `${tag}: ${leg.instruction}${approximate ? " (straight-line approximation)" : ""}`,
        });
      }

      if (selected) {
        markers.push({
          id: `leg:${candidate.id}:${leg.index}`,
          kind: "leg",
          position: midpoint(leg.path),
          text: legText(leg.mode, leg.lineCode, leg.minutes, leg.mode === "walk" && approximate),
          description: leg.instruction,
          candidateId: candidate.id,
          legMode: leg.mode,
          short: leg.path.length <= 2,
        });
      }
    });

    if (!selected && longestRail) {
      markers.push({
        id: `tag:${candidate.id}`,
        kind: "route-tag",
        // A third of the way along: the midpoint tends to sit in the city
        // centre, where the selected route's own leg labels already are.
        position: longestRail[Math.floor((longestRail.length - 1) / 3)],
        text: candidateSummary(candidate, model.labels),
        description: `${candidateSummary(candidate, model.labels)}. Select to compare.`,
        candidateId: candidate.id,
      });
    }
  }

  const { origin, destination } = model;
  if (origin.coordinates) {
    allPoints.push(origin.coordinates);
    markers.push({ id: "origin", kind: "origin", position: origin.coordinates, text: "Start", description: `Start: ${origin.label}` });
  }
  if (destination.coordinates) {
    allPoints.push(destination.coordinates);
    markers.push({ id: "destination", kind: "destination", position: destination.coordinates, text: "End", description: `End: ${destination.label}` });
  }

  for (const event of model.events) {
    if (event.stationIds.length < 2 || !event.lineCode) continue;
    const from = stationName(event.stationIds[0]);
    const to = stationName(event.stationIds[event.stationIds.length - 1]);
    const delay = event.delayMinutes != null ? ` · +${event.delayMinutes} min` : "";
    markers.push({
      id: `event:${event.id}`,
      kind: "disruption",
      position: midpoint(event.stationIds.map(stationPoint)),
      text: `${eventWord(event)} ${LINE_NAMES[event.lineCode]}${delay}`,
      minor: event.kind !== "planned" && event.severity === "minor",
      description: `${event.title}. Affects ${LINE_NAMES[event.lineCode]} between ${from} and ${to}${delay}.`,
    });
  }

  for (const reading of model.crowd) {
    markers.push({
      id: `crowd:${reading.stationId}:${reading.signal}`,
      kind: "crowd",
      position: stationPoint(reading.stationId),
      text: `${CROWD_WORDS[reading.level]} crowd`,
      description: `${stationName(reading.stationId)}: ${CROWD_WORDS[reading.level].toLowerCase()} crowding (${CROWD_SIGNAL_WORDS[reading.signal]}, observed ${formatClock(reading.observedAt)})`,
      stationId: reading.stationId,
      crowdLevel: reading.level,
    });
  }

  for (const stationId of keyStations) {
    markers.push({ id: `station:${stationId}`, kind: "station", position: stationPoint(stationId), text: stationName(stationId), description: `${stationName(stationId)} MRT station`, stationId });
  }

  const bounds = allPoints.length
    ? [
      [Math.min(...allPoints.map((p) => p[0])), Math.min(...allPoints.map((p) => p[1]))],
      [Math.max(...allPoints.map((p) => p[0])), Math.max(...allPoints.map((p) => p[1]))],
    ] as [LonLat, LonLat]
    : null;

  return {
    selectedCandidateId: selectedId,
    lines,
    markers,
    footprints: [...keyStations].flatMap((stationId) => footprintsForStation(stationId).map((footprint) => ({ stationId, polygon: footprint.polygon }))),
    bounds,
  };
}
