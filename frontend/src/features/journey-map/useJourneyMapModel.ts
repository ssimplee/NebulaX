import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useJourneyStore } from "@/store/journeyStore";
import { useMapStore } from "@/store/mapStore";
import { useRouteStore } from "@/store/routeStore";
import { getOperationalConditions, getRachelPlan, getRachelScenarioConditions } from "@/services/rachel.api";
import rachelRecording from "./fixtures/rachel-plan.fifteen-minute-disruption.json";
import { fromRachelPlan, type RachelConditions, type RachelPlan } from "./fromRachelPlan";
import { fromRoutePlan, fromStationSequence } from "./fromRoutePlan";
import type { JourneyMapModel } from "./journeyMap.types";
import { effectiveFeed, isScenario, useJourneyFeedStore, type JourneyFeed } from "./journeyFeed";

/**
 * Rachel's recorded replay: the backend's plan for the team's fifteen-minute
 * EWL scenario, recorded by frontend/scripts/record_rachel_plan.py. Shown only
 * when chosen, or offered when live data cannot be loaded.
 */
export const RACHEL_DEMO_MODEL = fromRachelPlan(
  rachelRecording.plan as unknown as RachelPlan,
  rachelRecording.conditions as RachelConditions,
  { evaluatedAt: rachelRecording.evaluatedAt, feed: "recorded" },
);

/** Postal codes of Rachel's verified home and work; anything else means the backend fell back to mock geocoding. */
const RACHEL_POSTAL_CODES = { home: "523858", work: "049145" };

export type JourneyMapState =
  | { status: "loading" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "ready"; model: JourneyMapModel; selectedCandidateId: string | null; selectCandidate: (candidateId: string) => void };

export interface JourneyMapSelection {
  feed: JourneyFeed;
  chooseFeed: (feed: JourneyFeed) => void;
  hasPlannedJourney: boolean;
  state: JourneyMapState;
}

type RachelResult =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string; retry: () => void }
  | { status: "ready"; model: JourneyMapModel };

function describeError(error: unknown): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "You are offline.";
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status) return `The journey service returned an error (${status}).`;
  return "The journey service could not be reached.";
}

/** Plan and conditions for one Rachel feed, always from the same mode so live and simulated data never mix. */
function useRachelJourney(feed: JourneyFeed): RachelResult {
  const scenario = isScenario(feed) ? feed : undefined;
  const enabled = feed === "live" || scenario !== undefined;
  const plan = useQuery({
    queryKey: ["rachel-plan", scenario ?? "live"],
    queryFn: () => getRachelPlan(scenario),
    enabled,
    retry: 1,
    staleTime: 60_000,
  });
  const conditions = useQuery({
    queryKey: scenario ? ["rachel-scenario-conditions", scenario] : ["operational-conditions"],
    queryFn: () => (scenario ? getRachelScenarioConditions(scenario) : getOperationalConditions()),
    enabled,
    retry: 1,
    staleTime: 60_000,
  });
  const { refetch: refetchPlan } = plan;
  const { refetch: refetchConditions } = conditions;
  const retry = useCallback(() => { void refetchPlan(); void refetchConditions(); }, [refetchPlan, refetchConditions]);

  return useMemo((): RachelResult => {
    if (!enabled) return { status: "idle" };
    if (plan.isPending || conditions.isPending) return { status: "loading" };
    if (plan.isError) return { status: "error", message: describeError(plan.error), retry };
    // A demo scenario is meaningless without the conditions it simulates.
    if (scenario && conditions.isError) return { status: "error", message: describeError(conditions.error), retry };
    const journey = plan.data.journey as RachelPlan["journey"] & { home: { postalCode?: string }; work: { postalCode?: string } };
    if (journey.home.postalCode !== RACHEL_POSTAL_CODES.home || journey.work.postalCode !== RACHEL_POSTAL_CODES.work) {
      return {
        status: "error",
        message: "The journey service could not locate Rachel's home and work. It is probably running without OneMap credentials.",
        retry,
      };
    }
    return {
      status: "ready",
      model: fromRachelPlan(plan.data, conditions.data ?? {}, {
        evaluatedAt: new Date(plan.dataUpdatedAt).toISOString(),
        feed: scenario ? "demo-scenario" : "live",
        conditionsUnavailable: conditions.isError,
      }),
    };
  }, [enabled, scenario, retry, plan.data, plan.isPending, plan.isError, plan.error, plan.dataUpdatedAt,
    conditions.data, conditions.isPending, conditions.isError, conditions.error]);
}

/**
 * What the Journey Map shows. The commuter picks a feed; by default that is the
 * journey tracked or planned on the Route tab when there is one, otherwise
 * Rachel's live commute. A failed live request is reported, never silently
 * replaced by simulated data.
 */
export function useJourneyMapModel(): JourneyMapSelection {
  const activeRoute = useJourneyStore((state) => state.activeRoute);
  const plan = useRouteStore((state) => state.lastResult);
  const selectedRouteIndex = useRouteStore((state) => state.selectedRouteIndex);
  const setSelectedRouteIndex = useRouteStore((state) => state.setSelectedRouteIndex);
  const highlightedRoute = useMapStore((state) => state.highlightedRoute);
  const choice = useJourneyFeedStore((state) => state.choice);
  const chooseFeed = useJourneyFeedStore((state) => state.choose);
  const [pickedCandidate, setPickedCandidate] = useState<string | null>(null);

  const highlightKey = highlightedRoute?.join("|") ?? "";
  const plannedModel = useMemo((): JourneyMapModel | null => {
    const computedAt = new Date().toISOString();
    if (activeRoute) return fromRoutePlan({ routes: [activeRoute], source: "computed", computedAt }, 0);
    if (plan?.routes.length) return fromRoutePlan(plan, selectedRouteIndex);
    if (highlightedRoute && highlightedRoute.length > 1) return fromStationSequence(highlightedRoute, computedAt);
    return null;
    // highlightKey stands in for highlightedRoute, whose array identity changes on every store write.
  }, [activeRoute, plan, selectedRouteIndex, highlightKey]);

  const feed = effectiveFeed(choice, plannedModel != null);
  const rachel = useRachelJourney(feed);

  // A different feed has different candidates; start from its recommendation.
  useEffect(() => setPickedCandidate(null), [feed]);

  const plannerSelectable = feed === "planned" && Boolean(plan?.routes.length) && !activeRoute;
  const selectCandidate = useCallback((candidateId: string) => {
    if (!plannerSelectable) {
      setPickedCandidate(candidateId);
      return;
    }
    const index = Number(candidateId.replace("route-", "")) - 1;
    if (Number.isInteger(index) && index >= 0) setSelectedRouteIndex(index);
  }, [plannerSelectable, setSelectedRouteIndex]);

  let state: JourneyMapState;
  if (feed === "planned" && plannedModel) {
    state = { status: "ready", model: plannedModel, selectedCandidateId: plannerSelectable ? `route-${selectedRouteIndex + 1}` : null, selectCandidate };
  } else if (feed === "recorded") {
    state = { status: "ready", model: RACHEL_DEMO_MODEL, selectedCandidateId: pickedCandidate, selectCandidate };
  } else if (rachel.status === "ready") {
    state = { status: "ready", model: rachel.model, selectedCandidateId: pickedCandidate, selectCandidate };
  } else if (rachel.status === "error") {
    state = rachel;
  } else {
    state = { status: "loading" };
  }

  return { feed, chooseFeed, hasPlannedJourney: plannedModel != null, state };
}
