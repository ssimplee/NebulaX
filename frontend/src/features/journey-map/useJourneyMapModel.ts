import { useCallback, useMemo, useState } from "react";
import { useJourneyStore } from "@/store/journeyStore";
import { useMapStore } from "@/store/mapStore";
import { useRouteStore } from "@/store/routeStore";
import rachelDisrupted from "./fixtures/rachel-disrupted.geometry.json";
import { fromJourneySnapshot, type SnapshotInput } from "./fromJourneySnapshot";
import { fromRoutePlan, fromStationSequence } from "./fromRoutePlan";
import type { JourneyMapModel } from "./journeyMap.types";

export type JourneyMapSource = "active" | "planned" | "highlighted" | "demo";

export interface JourneyMapSelection {
  model: JourneyMapModel;
  source: JourneyMapSource;
  selectedCandidateId: string | null;
  selectCandidate: (candidateId: string) => void;
}

/** Rachel's labelled replay, used until the live impact endpoint is connected. */
export const RACHEL_DEMO_MODEL = fromJourneySnapshot(rachelDisrupted as unknown as SnapshotInput);

/**
 * Chooses what the Map tab's Journey view shows, in priority order: the journey
 * being tracked, the Route tab's planned options, a highlighted route, then
 * Rachel's demo replay. Keeps store access out of the presentational map.
 */
export function useJourneyMapModel(): JourneyMapSelection {
  const activeRoute = useJourneyStore((state) => state.activeRoute);
  const plan = useRouteStore((state) => state.lastResult);
  const selectedRouteIndex = useRouteStore((state) => state.selectedRouteIndex);
  const setSelectedRouteIndex = useRouteStore((state) => state.setSelectedRouteIndex);
  const highlightedRoute = useMapStore((state) => state.highlightedRoute);
  const [demoSelection, setDemoSelection] = useState<string | null>(null);
  const highlightKey = highlightedRoute?.join("|") ?? "";

  const selection = useMemo((): Omit<JourneyMapSelection, "selectCandidate"> => {
    const computedAt = new Date().toISOString();
    if (activeRoute) {
      return { model: fromRoutePlan({ routes: [activeRoute], source: "computed", computedAt }, 0), source: "active", selectedCandidateId: null };
    }
    if (plan?.routes.length) {
      return { model: fromRoutePlan(plan, selectedRouteIndex), source: "planned", selectedCandidateId: `route-${selectedRouteIndex + 1}` };
    }
    if (highlightedRoute && highlightedRoute.length > 1) {
      return { model: fromStationSequence(highlightedRoute, computedAt), source: "highlighted", selectedCandidateId: null };
    }
    return { model: RACHEL_DEMO_MODEL, source: "demo", selectedCandidateId: demoSelection };
  }, [activeRoute, plan, selectedRouteIndex, highlightKey, demoSelection]);

  const selectCandidate = useCallback((candidateId: string) => {
    if (selection.source === "planned") {
      const index = Number(candidateId.replace("route-", "")) - 1;
      if (Number.isInteger(index) && index >= 0) setSelectedRouteIndex(index);
    } else if (selection.source === "demo") {
      setDemoSelection(candidateId);
    }
  }, [selection.source, setSelectedRouteIndex]);

  return { ...selection, selectCandidate };
}
