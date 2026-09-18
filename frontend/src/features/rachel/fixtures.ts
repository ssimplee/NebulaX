import normal from "./fixtures/normal.json";
import minor from "./fixtures/minor.json";
import disrupted from "./fixtures/disrupted.json";
import planned from "./fixtures/planned.json";
import { snapshotSchema, type JourneySnapshot, type ScenarioId, type SavedRoutine } from "./contract";

const fixtures = { normal, minor, disrupted, planned };
export function replaySnapshot(scenario: ScenarioId): JourneySnapshot {
  return snapshotSchema.parse(JSON.parse(JSON.stringify(fixtures[scenario])));
}
export const DEFAULT_ROUTINE: SavedRoutine = {
  id: "rachel-morning",
  origin: normal.journey.origin,
  destination: normal.journey.destination,
  departTime: "07:40", arriveByTime: "08:45", timeZone: "Asia/Singapore",
};
