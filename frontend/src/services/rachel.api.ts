import { apiClient } from "./api";
import type { RachelConditions, RachelPlan } from "@/features/journey-map/fromRachelPlan";

/** Backend scenario ids for the labelled demo replays (backend/app/data/scenarios). */
export type RachelScenarioId = "five-minute-delay" | "fifteen-minute-disruption" | "planned-change";

/** Door-to-door routing geocodes and calls OneMap, so allow more than the default timeout. */
const PLAN_TIMEOUT_MS = 30_000;

/**
 * Rachel's door-to-door plan: live conditions without a scenario, or
 * recalculated under a labelled demo scenario.
 */
export async function getRachelPlan(scenarioId?: RachelScenarioId): Promise<RachelPlan> {
  const response = scenarioId
    ? await apiClient.post<RachelPlan>("/routes/rachel/recalculate", { scenarioId }, { timeout: PLAN_TIMEOUT_MS })
    : await apiClient.post<RachelPlan>("/routes/rachel/plan", {}, { timeout: PLAN_TIMEOUT_MS });
  return response.data;
}

/** Aggregated live alerts, crowding, weather and data quality (Person 1). */
export async function getOperationalConditions(): Promise<RachelConditions> {
  const response = await apiClient.get<RachelConditions>("/operational-conditions");
  return response.data;
}

/** The simulated conditions a demo scenario was planned under. */
export async function getRachelScenarioConditions(scenarioId: RachelScenarioId): Promise<RachelConditions> {
  const response = await apiClient.get<RachelConditions>(`/demo/rachel/${scenarioId}`);
  return response.data;
}
