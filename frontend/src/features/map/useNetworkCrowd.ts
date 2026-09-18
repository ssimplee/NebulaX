import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getOperationalConditions } from "@/services/rachel.api";

export type NetworkCrowdLevel = "low" | "moderate" | "high";

export interface NetworkCrowdReading {
  stationId: string;
  level: NetworkCrowdLevel;
}

export type NetworkCrowd =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; readings: NetworkCrowdReading[]; source: "live" | "forecast" | "simulated" | "mixed"; observedAt: string | null };

/** LTA sends low/moderate/high; the mock provider adds crowded and very crowded, both shown as high. */
const LEVELS: Record<string, NetworkCrowdLevel> = {
  low: "low", l: "low", moderate: "moderate", m: "moderate", high: "high", h: "high", crowded: "high", very_crowded: "high",
};

/**
 * Platform crowding for the Network Map, from the backend's aggregated
 * operational conditions (shared cache with the Journey Map). Never invents
 * readings: a station without one simply has no marker.
 */
export function useNetworkCrowd(enabled: boolean): NetworkCrowd {
  const query = useQuery({
    queryKey: ["operational-conditions"],
    queryFn: getOperationalConditions,
    enabled,
    retry: 1,
    staleTime: 60_000,
  });

  return useMemo((): NetworkCrowd => {
    if (query.isError) return { status: "error" };
    if (!query.data) return { status: "loading" };
    const raw = query.data.crowdReadings ?? [];
    const readings = raw.flatMap((reading) => {
      const level = LEVELS[reading.level];
      return level ? [{ stationId: reading.stationId, level }] : [];
    });
    // Keep one reading per station, preferring the first (real-time is listed before forecast).
    const unique = [...new Map(readings.map((reading) => [reading.stationId, reading])).values()];
    const types = new Set(raw.map((reading) => (reading.sourceType === "forecast" ? "forecast" : reading.sourceType === "simulated" ? "simulated" : "live")));
    const source = types.size === 1 ? [...types][0] as "live" | "forecast" | "simulated" : types.size === 0 ? "live" : "mixed";
    return { status: "ready", readings: unique, source, observedAt: query.data.observedAt ?? null };
  }, [query.data, query.isError]);
}
