import { DEMO_SCENARIOS, type JourneyFeed } from "@/features/journey-map/journeyFeed";

interface Props {
  feed: JourneyFeed;
  onChange: (feed: JourneyFeed) => void;
  hasPlannedJourney: boolean;
}

/** One control for every data mode, so live and demo share the same map and card. */
export function JourneyFeedSelect({ feed, onChange, hasPlannedJourney }: Props) {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold">
      <span className="shrink-0">{feed === "planned" ? "Your journey" : "Rachel's commute"}</span>
      <select
        value={feed}
        onChange={(event) => onChange(event.target.value as JourneyFeed)}
        className="min-h-11 min-w-0 flex-1 rounded-lg border bg-card px-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        aria-label="Journey data"
      >
        {hasPlannedJourney && <option value="planned">Your planned route</option>}
        <option value="live">Live</option>
        {DEMO_SCENARIOS.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.label}</option>)}
        <option value="recorded">Demo: recorded replay (offline)</option>
      </select>
    </label>
  );
}
