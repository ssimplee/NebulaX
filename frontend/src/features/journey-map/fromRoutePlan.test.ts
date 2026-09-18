import type { RoutePlanResponse } from "@/types/route.types";
import { fromRoutePlan, fromStationSequence, splitIntoLineRuns } from "./fromRoutePlan";

// Shape produced by backend/app/services/route_formatter.py.
const plan: RoutePlanResponse = {
  source: "computed",
  computedAt: "2026-09-21T07:20:00+08:00",
  routes: [
    {
      totalMinutes: 38, walkingMinutes: 0, stops: 12, transfers: 0, estimatedFare: null, crowdEstimate: null, dataFreshness: null,
      lastTrainWarnings: [], accessibilityWarnings: [],
      serviceAlerts: [{ status: 2, severity: "major", lineCode: "EW", ltaLine: "EWL", message: "Delays on EWL", createdAt: "2026-09-21T07:00:00+08:00", source: "simulated" }],
      steps: [
        { type: "board", station: "Tampines", stationId: "tampines", line: "EW", direction: "Tuas Link", instruction: "Board EW Line towards Tuas Link" },
        { type: "ride", stations: ["EW3", "EW4", "EW5", "EW6", "EW7", "EW8", "EW9", "EW10", "EW11", "EW12", "EW13", "EW14"], stops: 12, minutes: 36 },
        { type: "alight", station: "Raffles Place", stationId: "raffles-place" },
      ],
    },
    {
      totalMinutes: 44, walkingMinutes: 3, stops: 13, transfers: 1, estimatedFare: null, crowdEstimate: null, dataFreshness: null,
      lastTrainWarnings: [], accessibilityWarnings: [],
      steps: [
        { type: "board", station: "Tampines", stationId: "tampines", line: "DT", instruction: "Board DT Line" },
        { type: "ride", stations: ["DT31", "DT30", "DT29", "DT28", "DT27", "DT26"], stops: 6, minutes: 12 },
        { type: "transfer", station: "MacPherson", stationId: "macpherson", fromLine: "DT", toLine: "CC", walkMinutes: 3, instruction: "Transfer to CC Line" },
        { type: "board", station: "MacPherson", stationId: "macpherson", line: "CC", instruction: "Board CC Line" },
        { type: "ride", stations: ["CC11", "CC12"], stops: 2, minutes: 4 },
        { type: "alight", station: "Serangoon", stationId: "serangoon" },
      ],
    },
  ],
};

describe("fromRoutePlan", () => {
  it("converts planner steps into rail and transfer legs without warnings", () => {
    const model = fromRoutePlan(plan, 1);
    expect(model.warnings).toEqual([]);
    const [first, second] = model.candidates;
    expect(first).toMatchObject({ role: "original", durationMinutes: 38, arrivalAt: null });
    expect(second.role).toBe("recommended");
    expect(first.legs[0]).toMatchObject({ mode: "rail", lineCode: "EW", minutes: 36 });
    expect(first.legs[0].stationIds).toHaveLength(13);
    expect(second.legs.map((leg) => `${leg.mode}:${leg.lineCode ?? "-"}`)).toEqual(["rail:DT", "walk:-", "rail:CC"]);
  });

  it("marks legs on a line with a service alert as affected and labels planner data as estimated", () => {
    const model = fromRoutePlan(plan, 0);
    expect(model.candidates[0].legs[0].affectedEventIds).toEqual(["alert-1"]);
    expect(model.candidates[1].legs[0].affectedEventIds).toEqual([]);
    expect(model.dataState).toMatchObject({ mode: "live", simulated: false });
  });

  it("names planner roles as options, not Rachel's usual route", () => {
    expect(fromRoutePlan(plan, 1).labels).toEqual({ recommended: "Selected", original: "Option 1", comparedWith: "option 1" });
    expect(() => fromRoutePlan({ ...plan, routes: [] }, 0)).toThrow("at least one route");
  });

  it("treats mock planner output as simulated", () => {
    expect(fromRoutePlan({ ...plan, source: "mock" }, 0).dataState.simulated).toBe(true);
  });
});

describe("fromStationSequence", () => {
  it("splits a highlighted route at interchanges", () => {
    expect(splitIntoLineRuns(["tampines", "simei", "tanah-merah", "expo"]).map((run) => run.lineCode)).toEqual(["EW", "CG"]);
    const model = fromStationSequence(["tampines", "simei", "tanah-merah"], "2026-09-21T07:20:00+08:00");
    expect(model.warnings).toEqual([]);
    expect(model.candidates[0].legs[0].stationIds).toEqual(["tampines", "simei", "tanah-merah"]);
    expect(model.labels.recommended).toBe("Highlighted route");
  });
});
