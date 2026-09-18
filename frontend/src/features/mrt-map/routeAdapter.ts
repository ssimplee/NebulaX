import type { RouteResult } from "@/types/route.types";
import { MRT_SEGMENTS, MRT_STATIONS } from "./topology";

const idByCode = new Map(Array.from(MRT_STATIONS.values()).flatMap((station) =>
  station.codes.map((code) => [code, station.id] as const),
));

/** Read the backend's ordered station steps without inventing a route in the map. */
export function routeStationIds(route: Pick<RouteResult, "steps"> | null | undefined): string[] {
  if (!route) return [];
  const ids: string[] = [];
  for (const step of route.steps) {
    if (step.stationId && MRT_STATIONS.has(step.stationId) && ids[ids.length - 1] !== step.stationId) ids.push(step.stationId);
    if (step.type === "ride") for (const code of step.stations ?? []) {
      const id = MRT_STATIONS.has(code) ? code : idByCode.get(code);
      if (id && ids[ids.length - 1] !== id) ids.push(id);
    }
  }
  return ids;
}

export function routeSegmentIds(stationIds: readonly string[]): Set<string> {
  const pairs = new Set(stationIds.slice(1).map((id, index) =>
    [stationIds[index], id].sort().join(":"),
  ));
  return new Set(MRT_SEGMENTS.filter((segment) => pairs.has([segment.fromStationId, segment.toStationId].sort().join(":"))).map((segment) => segment.id));
}
