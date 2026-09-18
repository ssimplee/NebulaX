import recording from "./fixtures/rachel-plan.fifteen-minute-disruption.json";
import plannedRecording from "./fixtures/rachel-plan.planned-change.json";
import minorRecording from "./fixtures/rachel-plan.five-minute-delay.json";
import { fromRachelPlan, type RachelConditions, type RachelPlan } from "./fromRachelPlan";
import { buildJourneyLayers } from "./journeyLayers";
import { decodePolyline } from "./polyline";
import { RACHEL_DEMO_MODEL } from "./useJourneyMapModel";

const plan = recording.plan as unknown as RachelPlan;
const conditions = recording.conditions as RachelConditions;
const clonePlan = (): RachelPlan => JSON.parse(JSON.stringify(plan));

describe("decodePolyline", () => {
  it("decodes the reference encoded polyline to [longitude, latitude]", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]]);
  });

  it("rejects malformed input", () => {
    expect(decodePolyline("_p~iF~ps|U_")).toBeNull();
    expect(decodePolyline(" ")).toBeNull();
  });
});

describe("fromRachelPlan with the recorded fifteen-minute scenario", () => {
  const model = fromRachelPlan(plan, conditions, { evaluatedAt: recording.evaluatedAt, feed: "recorded" });

  it("converts without warnings and keeps it labelled as a demo", () => {
    expect(model.warnings).toEqual([]);
    expect(model.dataState).toMatchObject({ mode: "demo", simulated: true });
  });

  it("uses the team's verified home and work as door-to-door ends", () => {
    expect(model.origin).toEqual({ label: "Home", coordinates: [103.9396874423523, 1.35449039932647] });
    expect(model.destination).toEqual({ label: "Work", coordinates: [103.8478199704954, 1.285694084848462] });
  });

  it("keeps every candidate, with unique ids, and the backend's recommendation", () => {
    const ids = model.candidates.map((candidate) => candidate.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(["EW", "DT-CC-NS", "DT-NE-NS", "DT-CC-NS (option 2)"]);
    expect(model.originalCandidateId).toBe("EW");
    expect(model.recommendedCandidateId).toBe("DT-CC-NS");
    expect(model.candidates.map((candidate) => candidate.label)).toEqual(["EWL", "DTL → CCL → NSL", "DTL → NEL → NSL", "DTL → CCL → NSL (option 2)"]);
  });

  it("marks the scenario's EWL stretch on the usual route and leaves the alternative clear", () => {
    expect(model.events).toEqual([expect.objectContaining({ id: "demo-ewl-major", lineCode: "EW", delayMinutes: 15 })]);
    const usualRail = model.candidates[0].legs.find((leg) => leg.mode === "rail")!;
    expect(usualRail.segments.every((segment) => segment.affectedEventIds.includes("demo-ewl-major"))).toBe(true);
    const recommended = model.candidates[1];
    expect(recommended.legs.flatMap((leg) => leg.affectedEventIds)).toEqual([]);
  });

  it("draws the recommended DT → CC → NS route, including the Circle Line's Bayfront link", () => {
    const rails = model.candidates[1].legs.filter((leg) => leg.mode === "rail");
    expect(rails.map((leg) => leg.lineCode)).toEqual(["DT", "CC", "NS"]);
    expect(rails[1].stationIds).toEqual(expect.arrayContaining(["promenade", "bayfront", "marina-bay"]));
    expect(rails[1].stationIds).not.toContain("harbourfront");
    expect(model.candidates[1].walkingMinutes).toBe(14);
  });

  it("walks from home and to work as labelled straight lines when no path was returned", () => {
    for (const candidate of model.candidates) {
      const [first, last] = [candidate.legs[0], candidate.legs[candidate.legs.length - 1]];
      expect(first).toMatchObject({ mode: "walk", geometrySource: "straight-line" });
      expect(first.instruction).toBe("Walk from 858C Tampines Walk to Tampines MRT.");
      expect(first.minutes).toBeGreaterThan(0);
      expect(first.path![0]).toEqual(model.origin.coordinates);
      expect(last.instruction).toBe("Walk from Raffles Place MRT to 1 George Street.");
      expect(last.minutes).toBeGreaterThan(0);
      expect(last.path![last.path!.length - 1]).toEqual(model.destination.coordinates);
    }
  });

  it("is the demo the Journey Map shows", () => {
    expect(RACHEL_DEMO_MODEL.recommendedCandidateId).toBe("DT-CC-NS");
    expect(buildJourneyLayers(RACHEL_DEMO_MODEL).lines.length).toBeGreaterThan(0);
  });
});

describe("fromRachelPlan with live-style geometry and conditions", () => {
  it("uses OSM GeoJSON walks, then OneMap encoded walks", () => {
    const withGeometry = clonePlan();
    const home: [number, number] = [plan.journey.home.longitude, plan.journey.home.latitude];
    Object.assign(withGeometry.original.geometry, {
      accessWalkGeoJson: { type: "LineString", coordinates: [home, [103.942, 1.3548], [103.9453, 1.3545]] },
      egressWalkEncoded: "yqoFmopyRsA_A",
    });
    const usual = fromRachelPlan(withGeometry, conditions, { evaluatedAt: recording.evaluatedAt, feed: "recorded" }).candidates[0];
    expect(usual.legs[0]).toMatchObject({ geometrySource: "routed" });
    expect(usual.legs[0].path).toHaveLength(3);
    expect(usual.legs[usual.legs.length - 1]).toMatchObject({ geometrySource: "routed" });
  });

  it("draws bus itineraries from their encoded legs and never invents their rail legs", () => {
    const withBus = clonePlan();
    withBus.alternatives.push({
      ...plan.alternatives[0],
      id: "BUS-69",
      steps: [
        { mode: "walk", from: "Home", to: "Tampines Int", durationMinutes: 4 },
        { mode: "bus", route: "69", from: "Tampines Int", to: "Bedok", durationMinutes: 20 },
        { mode: "subway", route: "EW", from: "Bedok", to: "Raffles Place", durationMinutes: 20 },
      ],
      geometry: { legs: ["yqoFmopyRsA_A", "yqoFmopyRlCnH", ""] },
    });
    const model = fromRachelPlan(withBus, conditions, { evaluatedAt: recording.evaluatedAt, feed: "recorded" });
    const bus = model.candidates[model.candidates.length - 1];
    expect(bus.label).toBe("Bus 69");
    expect(bus.legs.map((leg) => `${leg.mode}:${leg.geometrySource}`)).toEqual(["walk:routed", "bus:routed", "rail:unavailable"]);
    expect(model.warnings).toEqual(["Candidate BUS-69 step 3: rail leg has no stationIds"]);
  });

  it("labels live data, keeps crowd to Rachel's stations and normalises it to three levels", () => {
    const live = { ...clonePlan(), sourceType: "live" };
    const model = fromRachelPlan(live, {
      observedAt: "2026-09-21T07:24:00+08:00",
      serviceAlerts: [],
      crowdReadings: [
        { stationId: "tampines", level: "very_crowded", sourceType: "live", observedAt: "2026-09-21T07:20:00+08:00" },
        { stationId: "raffles-place", level: "moderate", sourceType: "forecast", validFrom: "2026-09-21T08:30:00+08:00" },
        { stationId: "bugis", level: "high", sourceType: "live" },
      ],
      dataQuality: { staleSources: ["weather"], simulatedSources: [] },
    }, { evaluatedAt: "2026-09-21T07:25:00+08:00" });
    expect(model.dataState).toMatchObject({ mode: "live", simulated: false, feed: "live", estimatedTimes: true, staleSources: ["weather"], includesSimulated: false });
    expect(model.crowd.map((reading) => `${reading.stationId}:${reading.level}:${reading.signal}`)).toEqual([
      "tampines:high:platform-realtime",
      "raffles-place:moderate:platform-forecast",
    ]);
    expect(model.warnings).toEqual([]);
    expect(model.events).toEqual([]);
  });

  it("locates live alerts by LTA station code, names them, and ignores lines Rachel never uses", () => {
    const live = { ...clonePlan(), sourceType: "live" };
    const model = fromRachelPlan(live, {
      serviceAlerts: [
        { lineCode: "EW", stationIds: [], stationCodes: ["EW13", "EW14"], severity: "minor", sourceType: "simulated", message: "Slower trains between City Hall and Raffles Place" },
        { lineCode: "TE", stationIds: [], stationCodes: ["TE1", "TE2"], severity: "major", message: "Not on Rachel's routes" },
      ],
      dataQuality: { simulatedSources: ["simulated"] },
    }, { evaluatedAt: "2026-09-21T07:25:00+08:00" });
    expect(model.events).toEqual([expect.objectContaining({ id: "alert-1", lineCode: "EW", severity: "minor", stationIds: ["city-hall", "raffles-place"] })]);
    const usualRail = model.candidates[0].legs.find((leg) => leg.mode === "rail")!;
    expect(usualRail.segments.filter((segment) => segment.affectedEventIds.length).map((segment) => `${segment.fromStationId}>${segment.toStationId}`)).toEqual(["city-hall>raffles-place"]);
    expect(model.dataState.includesSimulated).toBe(true);
    expect(buildJourneyLayers(model).markers.find((marker) => marker.kind === "disruption")).toMatchObject({ text: "Minor delay EWL", minor: true });
  });

  it("flags live conditions that failed to load instead of hiding it", () => {
    const model = fromRachelPlan({ ...clonePlan(), sourceType: "live" }, {}, { conditionsUnavailable: true });
    expect(model.dataState).toMatchObject({ feed: "live", conditionsUnavailable: true });
  });

  it("lets the commuter pick a bus itinerary and draws it", () => {
    const withBus = clonePlan();
    withBus.alternatives.push({
      ...plan.alternatives[0],
      id: "BUS-23",
      steps: [{ mode: "walk", durationMinutes: 4 }, { mode: "bus", route: "23", from: "Tampines Int", to: "Raffles Place", durationMinutes: 50 }],
      geometry: { legs: ["yqoFmopyRsA_A", "yqoFmopyRlCnH"] },
    });
    const model = fromRachelPlan(withBus, conditions, { evaluatedAt: recording.evaluatedAt, feed: "recorded" });
    expect(buildJourneyLayers(model).lines.some((line) => line.candidateId === "BUS-23")).toBe(false);
    const picked = buildJourneyLayers(model, "BUS-23");
    expect(picked.lines.filter((line) => line.candidateId === "BUS-23").map((line) => line.mode)).toEqual(["walk", "bus"]);
    expect(picked.markers.filter((marker) => marker.kind === "leg").map((marker) => marker.text)).toContain("Bus · 50 min");
  });

  it("treats a planned change as planned works", () => {
    const model = fromRachelPlan(plan, { serviceAlerts: [{ id: "demo-ewl-planned", kind: "planned", lineCode: "EW", stationIds: ["tampines", "raffles-place"], message: "Planned EWL change" }] }, { evaluatedAt: recording.evaluatedAt, feed: "recorded" });
    expect(model.events[0]).toMatchObject({ kind: "planned", lineCode: "EW" });
    expect(buildJourneyLayers(model).markers.find((marker) => marker.kind === "disruption")?.text).toBe("Planned works EWL");
  });

  it("keeps Rachel on her usual route when the decision says stay, even if the ranking preferred another", () => {
    const model = fromRachelPlan(plannedRecording.plan as unknown as RachelPlan, plannedRecording.conditions as RachelConditions, { feed: "demo-scenario" });
    expect(model.decision).toMatchObject({ shouldNotify: false });
    expect(model.recommendedCandidateId).toBe(model.originalCandidateId);
    expect(model.candidates.map((candidate) => candidate.id)).toContain("DT-CC-NS");
  });

  it("marks a five-minute delay as minor and stays quiet", () => {
    const model = fromRachelPlan(minorRecording.plan as unknown as RachelPlan, minorRecording.conditions as RachelConditions, { feed: "demo-scenario" });
    expect(model.decision?.shouldNotify).toBe(false);
    expect(model.events[0]).toMatchObject({ severity: "minor", delayMinutes: 5 });
    expect(model.dataState.feed).toBe("demo-scenario");
  });
});
