import { MRT_LINES, MRT_STATIONS } from "@/features/mrt-map/topology";
import {
  MAP_LINE_CODES,
  crowdReadingSchema,
  eventGeometrySchema,
  stepGeometrySchema,
  type CrowdReading,
  type MapLineCode,
} from "./geometryContract";
import type {
  CandidateRole,
  JourneyMapModel,
  LegMode,
  LonLat,
  MapEvent,
  MapLeg,
  MapPoint,
  RoleLabels,
} from "./journeyMap.types";
import { SINGAPORE_BOUNDS } from "./stationFootprints.build";

/**
 * The parts of the shared journey snapshot (Member 4's contract.ts) the map
 * reads. Extra keys on steps, events and conditions are the optional geometry
 * proposal and are validated here, not trusted.
 */
export interface SnapshotInput {
  mode: "demo" | "live";
  journey: { origin: MapPoint; destination: MapPoint; departAt?: string };
  conditions: {
    observedAt: string;
    events: ReadonlyArray<{ id: string; kind: "planned" | "unplanned"; title: string; [key: string]: unknown }>;
    [key: string]: unknown;
  };
  candidates: ReadonlyArray<{
    id: string;
    label: string;
    arrivalAt?: string;
    arrivalRange?: { earliest: string; latest: string };
    /** Used when there is no arrival time (for example a station-to-station plan). */
    durationMinutes?: number;
    walkingMinutes?: number;
    steps: ReadonlyArray<{ mode: LegMode; instruction: string; [key: string]: unknown }>;
  }>;
  sources: ReadonlyArray<{ id: string; type: string; observedAt: string; staleAfterSeconds: number }>;
  recommendation: { originalCandidateId: string; recommendedCandidateId: string };
}

const stationPoint = (id: string): LonLat => {
  const station = MRT_STATIONS.get(id)!;
  return [station.longitude, station.latitude];
};

const lastPoint = (path: LonLat[] | null) => (path ? path[path.length - 1] : null);

const inSingapore = ([lon, lat]: LonLat) =>
  lon >= SINGAPORE_BOUNDS.minLongitude && lon <= SINGAPORE_BOUNDS.maxLongitude &&
  lat >= SINGAPORE_BOUNDS.minLatitude && lat <= SINGAPORE_BOUNDS.maxLatitude;

/**
 * Stations from `from` to `to` inclusive along one branch of a line, or null if
 * no branch holds both. Where several branches do (the Circle Line's main loop
 * and its Bayfront link), the shortest stretch wins.
 */
export function stationsBetween(lineCode: MapLineCode, from: string, to: string): string[] | null {
  let best: string[] | null = null;
  for (const branch of MRT_LINES.find((line) => line.id === lineCode)?.branches ?? []) {
    const start = branch.stationIds.indexOf(from);
    const end = branch.stationIds.indexOf(to);
    if (start === -1 || end === -1 || start === end) continue;
    const stretch = start < end ? branch.stationIds.slice(start, end + 1) : branch.stationIds.slice(end, start + 1).reverse();
    if (!best || stretch.length < best.length) best = stretch;
  }
  return best;
}

/** Expand a rail leg's station list (full or endpoints-only) into every station passed. */
function expandRailStations(lineCode: MapLineCode, stationIds: readonly string[]): string[] | null {
  const expanded = [stationIds[0]];
  for (let i = 1; i < stationIds.length; i++) {
    const stretch = stationsBetween(lineCode, stationIds[i - 1], stationIds[i]);
    if (!stretch) return null;
    expanded.push(...stretch.slice(1));
  }
  return expanded;
}

function inferLineCode(stationIds: readonly string[]): MapLineCode | null {
  const fits = MAP_LINE_CODES.filter((code) => expandRailStations(code, stationIds) != null);
  return fits.length === 1 ? fits[0] : null;
}

/** Rachel's words: the app recommends a change from her usual journey. */
export const RACHEL_LABELS: RoleLabels = { recommended: "Recommended", original: "Usual", comparedWith: "usual" };

export function fromJourneySnapshot(snapshot: SnapshotInput, labels: RoleLabels = RACHEL_LABELS): JourneyMapModel {
  const warnings: string[] = [];
  const knownEventIds = new Set(snapshot.conditions.events.map((event) => event.id));

  const events: MapEvent[] = snapshot.conditions.events.map((event) => {
    const parsed = eventGeometrySchema.safeParse(event);
    const geometry = parsed.success ? parsed.data : {};
    if (!parsed.success) warnings.push(`Event ${event.id}: ignored invalid geometry fields`);
    const segment = geometry.affectedSegment;
    const span = segment ? stationsBetween(segment.lineCode, segment.fromStationId, segment.toStationId) : null;
    if (segment && !span) warnings.push(`Event ${event.id}: ${segment.fromStationId} and ${segment.toStationId} are not on one ${segment.lineCode} branch`);
    return {
      id: event.id,
      kind: event.kind,
      title: event.title,
      lineCode: segment?.lineCode ?? null,
      stationIds: span ?? [],
      delayMinutes: geometry.delayMinutes ?? null,
    };
  });

  const coveredPairs = (lineCode: MapLineCode, a: string, b: string) =>
    events.filter((event) => event.lineCode === lineCode && event.stationIds.includes(a) && event.stationIds.includes(b)).map((event) => event.id);

  const candidates = snapshot.candidates.map((candidate) => {
    const legs: MapLeg[] = candidate.steps.map((step, index) => {
      const where = `Candidate ${candidate.id} step ${index + 1}`;
      const parsed = stepGeometrySchema.safeParse(step);
      if (!parsed.success) warnings.push(`${where}: ignored invalid geometry fields`);
      const geometry = parsed.success ? parsed.data : {};
      const listedEvents = (geometry.affectedEventIds ?? []).filter((eventId) => {
        if (!knownEventIds.has(eventId)) warnings.push(`${where}: unknown event ${eventId}`);
        return knownEventIds.has(eventId);
      });
      const leg: MapLeg = {
        index,
        mode: step.mode,
        instruction: step.instruction,
        minutes: geometry.minutes ?? null,
        lineCode: null,
        stationIds: [],
        segments: [],
        path: null,
        geometrySource: "unavailable",
        affectedEventIds: listedEvents,
      };

      if (step.mode === "rail") {
        const listed = geometry.stationIds;
        if (!listed) { warnings.push(`${where}: rail leg has no stationIds`); return leg; }
        const unknown = listed.filter((id) => !MRT_STATIONS.has(id));
        if (unknown.length) { warnings.push(`${where}: unknown stations ${unknown.join(", ")}`); return leg; }
        const lineCode = geometry.lineCode ?? inferLineCode(listed);
        const stationIds = lineCode ? expandRailStations(lineCode, listed) : null;
        if (!lineCode || !stationIds) { warnings.push(`${where}: stations do not follow ${geometry.lineCode ?? "a single line"}`); return leg; }
        leg.lineCode = lineCode;
        leg.stationIds = stationIds;
        // A listed event with a located stretch on this line only marks that
        // stretch; one without a location can only mark the whole leg.
        const unlocated = listedEvents.filter((eventId) => {
          const event = events.find((item) => item.id === eventId)!;
          return event.lineCode !== lineCode || event.stationIds.length === 0;
        });
        leg.segments = stationIds.slice(1).map((toStationId, i) => {
          const fromStationId = stationIds[i];
          const affectedEventIds = [...new Set([...unlocated, ...coveredPairs(lineCode, fromStationId, toStationId)])];
          return { fromStationId, toStationId, path: [stationPoint(fromStationId), stationPoint(toStationId)], affectedEventIds };
        });
        leg.path = stationIds.map(stationPoint);
        leg.geometrySource = "network-topology";
        leg.affectedEventIds = [...new Set([...listedEvents, ...leg.segments.flatMap((segment) => segment.affectedEventIds)])];
        return leg;
      }

      if (geometry.lineCode || geometry.stationIds) warnings.push(`${where}: lineCode/stationIds ignored on a ${step.mode} leg`);
      if (geometry.path) {
        if (geometry.path.every(inSingapore)) {
          leg.path = geometry.path;
          leg.geometrySource = geometry.pathSource === "straight-line" ? "straight-line" : "routed";
        } else warnings.push(`${where}: path is outside Singapore; check [longitude, latitude] order`);
      }
      return leg;
    });

    // Walk legs without a routed path fall back to a labelled straight line
    // between their neighbours. Bus legs are never invented.
    legs.forEach((leg, index) => {
      if (leg.mode !== "walk" || leg.path) return;
      const start = index === 0 ? snapshot.journey.origin.coordinates : lastPoint(legs[index - 1].path);
      const end = index === legs.length - 1 ? snapshot.journey.destination.coordinates : legs[index + 1].path?.[0] ?? null;
      if (start && end && inSingapore(start) && inSingapore(end)) {
        leg.path = [start, end];
        leg.geometrySource = "straight-line";
      } else warnings.push(`Candidate ${candidate.id} step ${index + 1}: walk leg has no ends to draw between`);
    });

    const role: CandidateRole = candidate.id === snapshot.recommendation.recommendedCandidateId ? "recommended"
      : candidate.id === snapshot.recommendation.originalCandidateId ? "original" : "other";
    const departAt = snapshot.journey.departAt ? Date.parse(snapshot.journey.departAt) : NaN;
    const durationMinutes = candidate.durationMinutes
      ?? (candidate.arrivalAt && Number.isFinite(departAt) ? Math.round((Date.parse(candidate.arrivalAt) - departAt) / 60_000) : null);
    return {
      id: candidate.id,
      label: candidate.label,
      role,
      arrivalAt: candidate.arrivalAt ?? null,
      arrivalRange: candidate.arrivalRange ?? null,
      durationMinutes,
      walkingMinutes: candidate.walkingMinutes ?? null,
      legs,
    };
  });

  const crowd: CrowdReading[] = [];
  const rawCrowd = snapshot.conditions.crowd;
  if (rawCrowd !== undefined && !Array.isArray(rawCrowd)) warnings.push("conditions.crowd is not a list");
  for (const reading of Array.isArray(rawCrowd) ? rawCrowd : []) {
    const parsed = crowdReadingSchema.safeParse(reading);
    if (parsed.success && MRT_STATIONS.has(parsed.data.stationId)) crowd.push(parsed.data);
    else warnings.push("Ignored an invalid crowd reading");
  }

  // With no usable source freshness, treat the data as stale from the moment it was observed.
  const sourceStaleTimes = snapshot.sources.map((source) => Date.parse(source.observedAt) + source.staleAfterSeconds * 1000).filter(Number.isFinite);
  const staleAt = sourceStaleTimes.length ? Math.min(...sourceStaleTimes) : Date.parse(snapshot.conditions.observedAt);
  if (!sourceStaleTimes.length) warnings.push("No source freshness supplied; data is shown as out of date");
  return {
    origin: snapshot.journey.origin,
    destination: snapshot.journey.destination,
    candidates,
    originalCandidateId: snapshot.recommendation.originalCandidateId,
    recommendedCandidateId: snapshot.recommendation.recommendedCandidateId,
    labels,
    events,
    crowd,
    dataState: {
      mode: snapshot.mode,
      observedAt: snapshot.conditions.observedAt,
      staleAt: new Date(Number.isFinite(staleAt) ? staleAt : 0).toISOString(),
      simulated: snapshot.mode === "demo" || snapshot.sources.some((source) => source.type === "simulated"),
    },
    warnings,
  };
}
