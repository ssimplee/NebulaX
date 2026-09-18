import { create } from "zustand";
import type { RachelScenarioId } from "@/services/rachel.api";

/**
 * What the Journey Map shows. One UI, explicit data modes:
 *  - planned: the journey tracked or planned on the Route tab
 *  - live: Rachel's commute with live conditions (the default)
 *  - a backend demo scenario, clearly labelled as simulated
 *  - recorded: the offline recording, offered when live data is unavailable
 */
export type JourneyFeed = "planned" | "live" | RachelScenarioId | "recorded";

export const DEMO_SCENARIOS: ReadonlyArray<{ id: RachelScenarioId; label: string }> = [
  { id: "five-minute-delay", label: "Demo: 5-minute delay" },
  { id: "fifteen-minute-disruption", label: "Demo: 15-minute disruption" },
  { id: "planned-change", label: "Demo: planned change" },
];

export const isScenario = (feed: JourneyFeed): feed is RachelScenarioId => DEMO_SCENARIOS.some((scenario) => scenario.id === feed);

interface JourneyFeedState {
  /** The commuter's explicit choice; null follows the default. */
  choice: JourneyFeed | null;
  choose: (feed: JourneyFeed | null) => void;
}

export const useJourneyFeedStore = create<JourneyFeedState>((set) => ({
  choice: null,
  choose: (feed) => set({ choice: feed }),
}));

/** Rachel's live commute is always the normal default. Other feeds require an explicit choice. */
export function effectiveFeed(choice: JourneyFeed | null, hasPlannedJourney: boolean): JourneyFeed {
  if (choice === "planned" && !hasPlannedJourney) return "live";
  return choice ?? "live";
}
