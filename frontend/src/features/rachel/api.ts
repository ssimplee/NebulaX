import { apiClient } from "@/services/api";
import { frozenExplanationContext, snapshotSchema, validateExplanation, type JourneySnapshot, type SavedRoutine } from "./contract";

export const impactEndpoint = import.meta.env.VITE_RACHEL_IMPACT_URL as string | undefined;
export const explanationEndpoint = (import.meta.env.VITE_RACHEL_EXPLANATION_URL as string | undefined) || "/assistant/explain-journey";

export async function fetchJourneyImpact(routine: SavedRoutine, signal: AbortSignal): Promise<JourneySnapshot> {
  if (!impactEndpoint) throw new Error("Journey service is not configured");
  const { data } = await apiClient.post(impactEndpoint, { schemaVersion: 1, routine }, { signal });
  return snapshotSchema.parse(data);
}

export async function explainJourney(snapshot: JourneySnapshot, signal: AbortSignal) {
  const context = frozenExplanationContext(snapshot);
  try {
    const { data } = await apiClient.post(explanationEndpoint, { context }, { signal, timeout: 8000 });
    const explanation = validateExplanation(data.explanation, context);
    if (!explanation) return { reason: snapshot.recommendation.reason, enhanced: false };
    return { reason: explanation.reason, enhanced: data.mode === "ai" };
  } catch {
    return { reason: snapshot.recommendation.reason, enhanced: false };
  }
}
