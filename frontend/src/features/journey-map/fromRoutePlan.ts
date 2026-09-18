import { MRT_STATIONS } from "@/features/mrt-map/topology";
import type { RouteResult } from "@/types/route.types";
import { MAP_LINE_CODES, type MapLineCode } from "./geometryContract";
import { fromJourneySnapshot, stationsBetween, type SnapshotInput } from "./fromJourneySnapshot";
import type { JourneyMapModel } from "./journeyMap.types";

// The route planner is station-to-station: it has no door-to-door walk legs,
// so none are drawn. Its step format is converted into the shared snapshot
// shape so there is a single validation and geometry path.

export type SnapshotStep = SnapshotInput["candidates"][number]["steps"][number];

/** The planner fields the map reads; both route stores' route types satisfy it. */
export type PlannedRoute = Pick<RouteResult, "steps" | "totalMinutes" | "serviceAlerts">;
export interface PlannedRoutes {
  routes: readonly PlannedRoute[];
  source: string;
  computedAt: string;
}

const idByCode = new Map(Array.from(MRT_STATIONS.values()).flatMap((station) => station.codes.map((code) => [code, station.id] as const)));
/** A stations.json id from either an id or an LTA station code. */
export const resolveStation = (value: string | undefined) => (value && MRT_STATIONS.has(value) ? value : value ? idByCode.get(value) : undefined);

/** Convert planner board/ride/transfer/alight steps into rail and transfer legs. */
export function plannerSteps(plannerSteps: PlannedRoute["steps"], alertIdsByLine: ReadonlyMap<string, string[]>): SnapshotStep[] {
  const steps: SnapshotStep[] = [];
  let rail: { mode: "rail"; instruction: string; minutes: number; lineCode?: string; stationIds: string[]; affectedEventIds: string[] } | null = null;
  const closeRail = () => {
    if (rail) steps.push(rail);
    rail = null;
  };
  for (const step of plannerSteps) {
    if (step.type === "board") {
      closeRail();
      const line = step.line && (MAP_LINE_CODES as readonly string[]).includes(step.line) ? step.line : undefined;
      rail = {
        mode: "rail",
        instruction: step.instruction ?? `Board the ${step.line} line at ${step.station}`,
        minutes: 0,
        lineCode: line,
        stationIds: [resolveStation(step.stationId)].filter((id): id is string => Boolean(id)),
        affectedEventIds: alertIdsByLine.get(step.line ?? "") ?? [],
      };
      if (!line) delete rail.lineCode;
    } else if (step.type === "ride" && rail) {
      for (const code of step.stations ?? []) {
        const id = resolveStation(code);
        if (id && rail.stationIds[rail.stationIds.length - 1] !== id) rail.stationIds.push(id);
      }
      rail.minutes += step.minutes ?? 0;
    } else if (step.type === "transfer") {
      closeRail();
      steps.push({ mode: "walk", instruction: step.instruction ?? `Transfer at ${step.station}`, minutes: step.walkMinutes ?? 0 });
    } else if (step.type === "alight") {
      closeRail();
    }
  }
  closeRail();
  return steps;
}

/**
 * Map model for the Route tab's planned options. The first option is shown as
 * the original and the selected option as the recommendation, matching the
 * route list's ordering.
 */
export function fromRoutePlan(plan: PlannedRoutes, selectedIndex: number): JourneyMapModel {
  if (!plan.routes.length) throw new Error("fromRoutePlan needs at least one route");
  const alerts = plan.routes.flatMap((route) => route.serviceAlerts ?? []);
  const uniqueAlerts = [...new Map(alerts.map((alert) => [`${alert.lineCode}:${alert.message}`, alert])).values()];
  const events = uniqueAlerts.map((alert, index) => ({ id: `alert-${index + 1}`, kind: "unplanned" as const, title: alert.message, sourceId: "route-planner" }));
  const alertIdsByLine = new Map<string, string[]>();
  uniqueAlerts.forEach((alert, index) => alertIdsByLine.set(alert.lineCode, [...(alertIdsByLine.get(alert.lineCode) ?? []), events[index].id]));

  const candidates = plan.routes.map((route, index) => ({
    id: `route-${index + 1}`,
    label: `Option ${index + 1}`,
    durationMinutes: route.totalMinutes,
    steps: plannerSteps(route.steps, alertIdsByLine),
  }));
  const selected = candidates[Math.min(Math.max(selectedIndex, 0), candidates.length - 1)];
  const firstStation = plan.routes[0]?.steps.find((step) => step.type === "board")?.station ?? "Start";
  const lastStation = [...(plan.routes[0]?.steps ?? [])].reverse().find((step) => step.type === "alight")?.station ?? "End";

  return fromJourneySnapshot({
    mode: plan.source === "mock" ? "demo" : "live",
    journey: { origin: { label: firstStation, coordinates: null }, destination: { label: lastStation, coordinates: null } },
    conditions: { observedAt: plan.computedAt, events },
    candidates,
    // Planner times come from a static network graph: estimated, never live.
    sources: [{ id: "route-planner", type: plan.source === "mock" ? "simulated" : "estimated", observedAt: plan.computedAt, staleAfterSeconds: 15 * 60 }],
    recommendation: { originalCandidateId: candidates[0].id, recommendedCandidateId: selected.id },
  }, { recommended: "Selected", original: "Option 1", comparedWith: "option 1" });
}

const adjacentOn = (lineCode: string, a: string, b: string) => stationsBetween(lineCode as MapLineCode, a, b)?.length === 2;

/** Split a station sequence into single-line runs, changing line only where the current one stops fitting. */
export function splitIntoLineRuns(stationIds: readonly string[]): Array<{ lineCode: MapLineCode; stationIds: string[] }> {
  const runs: Array<{ lineCode: MapLineCode; stationIds: string[] }> = [];
  for (let i = 1; i < stationIds.length; i++) {
    const [a, b] = [stationIds[i - 1], stationIds[i]];
    const current = runs[runs.length - 1];
    if (current && current.stationIds[current.stationIds.length - 1] === a && adjacentOn(current.lineCode, a, b)) {
      current.stationIds.push(b);
      continue;
    }
    const lineCode = MAP_LINE_CODES.find((code) => adjacentOn(code, a, b));
    if (lineCode) runs.push({ lineCode, stationIds: [a, b] });
  }
  return runs;
}

/** Map model for a bare station sequence, such as a route highlighted from the assistant. */
export function fromStationSequence(stationIds: readonly string[], observedAt: string): JourneyMapModel {
  const first = MRT_STATIONS.get(stationIds[0]);
  const last = MRT_STATIONS.get(stationIds[stationIds.length - 1]);
  const steps: SnapshotStep[] = splitIntoLineRuns(stationIds).map((run) => ({
    mode: "rail", instruction: `Ride the ${run.lineCode} line`, lineCode: run.lineCode, stationIds: run.stationIds,
  }));
  return fromJourneySnapshot({
    mode: "live",
    journey: { origin: { label: first?.name ?? "Start", coordinates: null }, destination: { label: last?.name ?? "End", coordinates: null } },
    conditions: { observedAt, events: [] },
    candidates: [{ id: "highlighted", label: "Highlighted route", steps: steps.length ? steps : [{ mode: "rail", instruction: "Highlighted MRT route" }] }],
    sources: [{ id: "highlight", type: "estimated", observedAt, staleAfterSeconds: 15 * 60 }],
    recommendation: { originalCandidateId: "highlighted", recommendedCandidateId: "highlighted" },
  }, { recommended: "Highlighted route", original: "Highlighted route", comparedWith: "the highlighted route" });
}
