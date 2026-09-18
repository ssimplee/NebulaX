import { MAP_LINE_CODES, type MapLineCode } from "./geometryContract";
import { fromJourneySnapshot, RACHEL_LABELS, type SnapshotInput } from "./fromJourneySnapshot";
import { plannerSteps, resolveStation, type PlannedRoute, type SnapshotStep } from "./fromRoutePlan";
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
  accessWalkMinutes?: number;
  accessWalkEncoded?: string;
  accessWalkGeoJson?: GeoJsonLine | null;
  egressWalkMinutes?: number;
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
  decision?: { shouldNotify: boolean; action: string; reason: string };
  scenarioId?: string | null;
  sourceType?: string;
}

export interface RachelConditions {
  observedAt?: string;
  serviceAlerts?: ReadonlyArray<{
    /** Scenario alerts carry an id; live LTA alerts do not. */
    id?: string;
    kind?: string;
    lineCode?: string;
    stationIds?: string[];
    /** Live alerts locate themselves by LTA station code instead of stationIds. */
    stationCodes?: string[];
    severity?: string;
    sourceType?: string;
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
  dataQuality?: {
    staleSources?: string[];
    simulatedSources?: string[];
    errors?: ReadonlyArray<{ source: string; error: string | null }>;
  };
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
function walkStep(instruction: string, minutes: number | undefined, geoJson: GeoJsonLine | null | undefined, encoded: string | undefined): SnapshotStep {
  const duration = minutes != null ? { minutes } : {};
  if (geoJson?.type === "LineString" && geoJson.coordinates.length >= 2) {
    return { mode: "walk", instruction, ...duration, path: geoJson.coordinates, pathSource: "osm-routed" };
  }
  const decoded = encoded ? decodePolyline(encoded) : null;
  if (decoded && decoded.length >= 2) return { mode: "walk", instruction, ...duration, path: decoded, pathSource: "onemap-routed" };
  return { mode: "walk", instruction, ...duration };
}

function railCandidateSteps(candidate: RachelPlanCandidate, alertIdsByLine: ReadonlyMap<string, string[]>): SnapshotStep[] {
  const geometry = candidate.geometry as RachelRailGeometry;
  return [
    walkStep("Walk from 858C Tampines Walk to Tampines MRT.", geometry.accessWalkMinutes, geometry.accessWalkGeoJson, geometry.accessWalkEncoded),
    ...plannerSteps(candidate.steps as PlannedRoute["steps"], alertIdsByLine),
    walkStep("Walk from Raffles Place MRT to 1 George Street.", geometry.egressWalkMinutes, geometry.egressWalkGeoJson, geometry.egressWalkEncoded),
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

export interface RachelPlanOptions {
  /** When the plan was fetched or recorded; drives freshness. */
  evaluatedAt?: string;
  /** Live services, a backend demo scenario or a recorded replay. */
  feed?: "live" | "demo-scenario" | "recorded";
  /** Live conditions failed to load; show the plan without them, and say so. */
  conditionsUnavailable?: boolean;
}

/** Crowded and very crowded (mock) or high (LTA) all display as the top of the three levels. */
const CROWD_LEVELS: Record<string, "low" | "moderate" | "high"> = {
  low: "low", l: "low", moderate: "moderate", m: "moderate", high: "high", h: "high", crowded: "high", very_crowded: "high",
};

export function fromRachelPlan(plan: RachelPlan, conditions: RachelConditions = {}, options: RachelPlanOptions = {}): JourneyMapModel {
  const evaluatedAt = options.evaluatedAt ?? new Date().toISOString();
  const feed = options.feed ?? (plan.sourceType === "simulated" ? "demo-scenario" : "live");
  const simulated = feed !== "live";
  const planned = [plan.original, ...plan.alternatives];
  const plannerStepsOf = (candidate: RachelPlanCandidate) =>
    (isBusCandidate(candidate) ? [] : candidate.steps) as PlannedRoute["steps"];

  // Only alerts on lines this journey could use are relevant to Rachel.
  const linesUsed = new Set(planned.flatMap((candidate) => plannerStepsOf(candidate).flatMap((step) => (step.line ? [step.line] : []))));
  const alerts = (conditions.serviceAlerts ?? [])
    .map((alert, index) => ({ ...alert, id: alert.id ?? `alert-${index + 1}` }))
    .filter((alert) => !alert.lineCode || linesUsed.has(alert.lineCode));
  const events = alerts.map((alert) => {
    const listed = alert.stationIds?.length
      ? alert.stationIds
      : (alert.stationCodes ?? []).map(resolveStation).filter((id): id is string => Boolean(id));
    const locatable = alert.lineCode && (MAP_LINE_CODES as readonly string[]).includes(alert.lineCode) && listed.length >= 2;
    return {
      id: alert.id,
      kind: alert.kind === "planned" ? "planned" as const : "unplanned" as const,
      title: alert.message ?? "Service alert",
      sourceId: "rachel-conditions",
      ...(locatable ? { affectedSegment: { lineCode: alert.lineCode, fromStationId: listed[0], toStationId: listed[listed.length - 1] } } : {}),
      ...(alert.estimatedDelayMinutes != null ? { delayMinutes: alert.estimatedDelayMinutes } : {}),
      ...(alert.severity === "major" || alert.severity === "minor" ? { severity: alert.severity } : {}),
    };
  });
  const alertIdsByLine = new Map<string, string[]>();
  for (const alert of alerts) {
    if (alert.lineCode) alertIdsByLine.set(alert.lineCode, [...(alertIdsByLine.get(alert.lineCode) ?? []), alert.id]);
  }

  // The backend can return the same route id twice (for example two DT-CC-NS
  // paths); the map selects by id, so make each one unique.
  const seen = new Map<string, number>();
  const ids = planned.map((candidate) => {
    const count = (seen.get(candidate.id) ?? 0) + 1;
    seen.set(candidate.id, count);
    return count === 1 ? candidate.id : `${candidate.id} (option ${count})`;
  });
  // The decision is what Rachel is told. When it says stay (shouldNotify false),
  // emphasise her usual route even if the ranking preferred another; that
  // option stays available for comparison.
  const quiet = plan.decision?.shouldNotify === false;
  const recommendedIndex = quiet ? 0 : Math.max(0, planned.findIndex((candidate) => sameCandidate(candidate, plan.recommended)));

  const candidates = planned.map((candidate, index) => ({
    id: ids[index],
    label: routeLabel(candidate, ids[index]),
    arrivalAt: candidate.estimatedArrival,
    arrivalRange: candidate.arrivalRange,
    walkingMinutes: candidate.walkingMinutes,
    steps: isBusCandidate(candidate) ? busCandidateSteps(candidate) : railCandidateSteps(candidate, alertIdsByLine),
  }));

  // Crowding only where Rachel boards, changes or alights: the whole-network feed would bury the route.
  const keyStations = new Set(planned.flatMap((candidate) => plannerStepsOf(candidate).flatMap((step) =>
    step.stationId && (step.type === "board" || step.type === "transfer" || step.type === "alight") ? [step.stationId] : [])));
  const conditionsObservedAt = withOffset(conditions.observedAt) ?? evaluatedAt;
  const crowdReadings = (conditions.crowdReadings ?? []).filter((reading) => keyStations.has(reading.stationId));
  const crowd = crowdReadings.map((reading) => ({
    stationId: reading.stationId,
    level: CROWD_LEVELS[reading.level] ?? reading.level,
    signal: reading.sourceType === "forecast" ? "platform-forecast" : "platform-realtime",
    sourceId: "rachel-conditions",
    observedAt: withOffset(reading.observedAt) ?? withOffset(reading.validFrom) ?? withOffset(reading.fetchedAt) ?? conditionsObservedAt,
  }));

  const quality = conditions.dataQuality;
  const includesSimulated = feed === "live" && (
    (quality?.simulatedSources?.length ?? 0) > 0
    || alerts.some((alert) => alert.sourceType === "simulated")
    || crowdReadings.some((reading) => reading.sourceType === "simulated"));

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
  const model = fromJourneySnapshot(snapshot, RACHEL_LABELS);
  return {
    ...model,
    decision: plan.decision ? { shouldNotify: plan.decision.shouldNotify, action: plan.decision.action, reason: plan.decision.reason } : null,
    dataState: {
      ...model.dataState,
      feed,
      estimatedTimes: true,
      staleSources: quality?.staleSources ?? [],
      conditionsUnavailable: options.conditionsUnavailable ?? false,
      includesSimulated,
    },
  };
}
