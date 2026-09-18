import { MAP_LINE_CODES, type MapLineCode } from "./geometryContract";
import { fromJourneySnapshot, RACHEL_LABELS, type SnapshotInput } from "./fromJourneySnapshot";
import { plannerSteps, type PlannedRoute, type SnapshotStep } from "./fromRoutePlan";
import type { JourneyMapModel, LonLat } from "./journeyMap.types";
import { LINE_NAMES } from "./journeyLayers";
import { decodePolyline } from "./polyline";

// Adapter for the backend's Rachel door-to-door plan
// (POST /api/v1/routes/rachel/plan) plus the scenario conditions it was
// planned under (GET /api/v1/demo/rachel/<scenarioId>). Converts both into the
// shared snapshot shape so they pass the same validation as every other source.

interface GeoJsonLine {
  type: "LineString";
  coordinates: LonLat[];
}

interface RachelRailGeometry {
  accessWalkEncoded?: string;
  accessWalkGeoJson?: GeoJsonLine | null;
  egressWalkEncoded?: string;
  egressWalkGeoJson?: GeoJsonLine | null;
}

/** A OneMap public-transport leg, as normalised by the backend. */
interface RachelTransitLeg {
  mode: string;
  route?: string;
  from?: string;
  to?: string;
  durationMinutes?: number;
  geometry?: string;
}

export interface RachelPlanCandidate {
  id: string;
  totalMinutes: number;
  walkingMinutes: number;
  estimatedArrival: string;
  arrivalRange: { earliest: string; latest: string };
  delayMinutes?: number;
  /** Planner steps for rail candidates; OneMap legs for bus candidates. */
  steps: ReadonlyArray<PlannedRoute["steps"][number] | RachelTransitLeg>;
  geometry: RachelRailGeometry | { legs: string[] };
}

export interface RachelPlan {
  journey: {
    home: { latitude: number; longitude: number };
    work: { latitude: number; longitude: number };
    departureTime: string;
  };
  original: RachelPlanCandidate;
  alternatives: RachelPlanCandidate[];
  recommended: RachelPlanCandidate;
  scenarioId?: string | null;
  sourceType?: string;
}

export interface RachelConditions {
  observedAt?: string;
  serviceAlerts?: ReadonlyArray<{
    id: string;
    kind?: string;
    lineCode?: string;
    stationIds?: string[];
    estimatedDelayMinutes?: number;
    message?: string;
  }>;
  crowdReadings?: ReadonlyArray<{
    stationId: string;
    level: string;
    sourceType?: string;
    observedAt?: string;
    validFrom?: string;
    fetchedAt?: string;
  }>;
}

const isBusCandidate = (candidate: RachelPlanCandidate) => "legs" in candidate.geometry;

/** "DTL → CCL → NSL", "Bus 29", with a suffix when the backend repeats an id. */
function routeLabel(candidate: RachelPlanCandidate, uniqueId: string): string {
  const suffix = uniqueId === candidate.id ? "" : ` ${uniqueId.slice(candidate.id.length).trim()}`;
  if (isBusCandidate(candidate)) return `Bus ${candidate.id.replace(/^BUS-/, "").split("-").join(" + ")}${suffix}`;
  return candidate.id.split("-").map((code) => LINE_NAMES[code as MapLineCode] ?? code).join(" → ") + suffix;
}

const sameCandidate = (a: RachelPlanCandidate, b: RachelPlanCandidate) =>
  a.id === b.id && a.estimatedArrival === b.estimatedArrival && a.totalMinutes === b.totalMinutes;
const withOffset = (value: string | undefined) => (value && /([+-]\d{2}:\d{2}|Z)$/.test(value) ? value : undefined);

/** Prefer an OSM-routed GeoJSON walk, then OneMap's encoded path, else leave it to the straight-line fallback. */
function walkStep(instruction: string, geoJson: GeoJsonLine | null | undefined, encoded: string | undefined): SnapshotStep {
  if (geoJson?.type === "LineString" && geoJson.coordinates.length >= 2) {
    return { mode: "walk", instruction, path: geoJson.coordinates, pathSource: "osm-routed" };
  }
  const decoded = encoded ? decodePolyline(encoded) : null;
  if (decoded && decoded.length >= 2) return { mode: "walk", instruction, path: decoded, pathSource: "onemap-routed" };
  return { mode: "walk", instruction };
}

function railCandidateSteps(candidate: RachelPlanCandidate, alertIdsByLine: ReadonlyMap<string, string[]>): SnapshotStep[] {
  const geometry = candidate.geometry as RachelRailGeometry;
  return [
    walkStep("Walk from home to the station.", geometry.accessWalkGeoJson, geometry.accessWalkEncoded),
    ...plannerSteps(candidate.steps as PlannedRoute["steps"], alertIdsByLine),
    walkStep("Walk from the station to work.", geometry.egressWalkGeoJson, geometry.egressWalkEncoded),
  ];
}

function busCandidateSteps(candidate: RachelPlanCandidate): SnapshotStep[] {
  const encodedLegs = (candidate.geometry as { legs: string[] }).legs;
  return (candidate.steps as RachelTransitLeg[]).map((leg, index) => {
    const decoded = encodedLegs[index] ? decodePolyline(encodedLegs[index]) : null;
    const path = decoded && decoded.length >= 2 ? { path: decoded, pathSource: "onemap-routed" as const } : {};
    const minutes = leg.durationMinutes != null ? { minutes: leg.durationMinutes } : {};
    const between = [leg.from, leg.to].filter(Boolean).join(" to ");
    if (leg.mode === "walk") return { mode: "walk", instruction: `Walk${between ? ` ${between}` : ""}`, ...minutes, ...path };
    if (leg.mode === "bus") return { mode: "bus", instruction: `Bus ${leg.route ?? ""}${between ? ` ${between}` : ""}`.trim(), ...minutes, ...path };
    // Rail legs inside a OneMap itinerary carry no station IDs, so they cannot be drawn on the network.
    return { mode: "rail", instruction: `Train${leg.route ? ` ${leg.route}` : ""}${between ? ` ${between}` : ""}`, ...minutes };
  });
}

export function fromRachelPlan(plan: RachelPlan, conditions: RachelConditions = {}, evaluatedAt = new Date().toISOString()): JourneyMapModel {
  const simulated = plan.sourceType === "simulated";

  const alerts = conditions.serviceAlerts ?? [];
  const events = alerts.map((alert) => {
    const stations = alert.stationIds ?? [];
    const locatable = alert.lineCode && (MAP_LINE_CODES as readonly string[]).includes(alert.lineCode) && stations.length >= 2;
    return {
      id: alert.id,
      kind: alert.kind === "planned" ? "planned" as const : "unplanned" as const,
      title: alert.message ?? "Service alert",
      sourceId: "rachel-conditions",
      ...(locatable ? { affectedSegment: { lineCode: alert.lineCode, fromStationId: stations[0], toStationId: stations[stations.length - 1] } } : {}),
      ...(alert.estimatedDelayMinutes != null ? { delayMinutes: alert.estimatedDelayMinutes } : {}),
    };
  });
  const alertIdsByLine = new Map<string, string[]>();
  for (const alert of alerts) {
    if (alert.lineCode) alertIdsByLine.set(alert.lineCode, [...(alertIdsByLine.get(alert.lineCode) ?? []), alert.id]);
  }

  // The backend can return the same route id twice (for example two DT-CC-NS
  // paths); the map selects by id, so make each one unique.
  const planned = [plan.original, ...plan.alternatives];
  const seen = new Map<string, number>();
  const ids = planned.map((candidate) => {
    const count = (seen.get(candidate.id) ?? 0) + 1;
    seen.set(candidate.id, count);
    return count === 1 ? candidate.id : `${candidate.id} (option ${count})`;
  });
  const recommendedIndex = Math.max(0, planned.findIndex((candidate) => sameCandidate(candidate, plan.recommended)));

  const candidates = planned.map((candidate, index) => ({
    id: ids[index],
    label: routeLabel(candidate, ids[index]),
    arrivalAt: candidate.estimatedArrival,
    arrivalRange: candidate.arrivalRange,
    walkingMinutes: candidate.walkingMinutes,
    steps: isBusCandidate(candidate) ? busCandidateSteps(candidate) : railCandidateSteps(candidate, alertIdsByLine),
  }));

  const conditionsObservedAt = withOffset(conditions.observedAt) ?? evaluatedAt;
  const crowd = (conditions.crowdReadings ?? []).map((reading) => ({
    stationId: reading.stationId,
    level: reading.level,
    signal: reading.sourceType === "forecast" ? "platform-forecast" : "platform-realtime",
    sourceId: "rachel-conditions",
    observedAt: withOffset(reading.observedAt) ?? withOffset(reading.validFrom) ?? withOffset(reading.fetchedAt) ?? conditionsObservedAt,
  }));

  const home: LonLat = [plan.journey.home.longitude, plan.journey.home.latitude];
  const work: LonLat = [plan.journey.work.longitude, plan.journey.work.latitude];
  const snapshot: SnapshotInput = {
    mode: simulated ? "demo" : "live",
    journey: { origin: { label: "Home", coordinates: home }, destination: { label: "Work", coordinates: work }, departAt: plan.journey.departureTime },
    conditions: { observedAt: conditionsObservedAt, events, crowd },
    candidates,
    sources: [
      // Routing uses the static MRT graph: estimated, never live.
      { id: "rachel-plan", type: simulated ? "simulated" : "estimated", observedAt: evaluatedAt, staleAfterSeconds: 5 * 60 },
      { id: "rachel-conditions", type: simulated ? "simulated" : "official", observedAt: conditionsObservedAt, staleAfterSeconds: 5 * 60 },
    ],
    recommendation: { originalCandidateId: ids[0], recommendedCandidateId: ids[recommendedIndex] },
  };
  return fromJourneySnapshot(snapshot, RACHEL_LABELS);
}
