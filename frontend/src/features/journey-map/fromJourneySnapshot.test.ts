import fixture from "./fixtures/rachel-disrupted.geometry.json";
import { fromJourneySnapshot, stationsBetween, type SnapshotInput } from "./fromJourneySnapshot";

const withGeometry = fixture as unknown as SnapshotInput;
const clone = (): SnapshotInput => JSON.parse(JSON.stringify(fixture));

// Keys Member 4's current strict contract accepts; everything else is the proposal.
const CURRENT_KEYS = {
  step: ["mode", "instruction"],
  event: ["id", "kind", "title", "sourceId"],
  conditions: ["observedAt", "events"],
};

/** Today's contract: the same snapshot with every proposed field removed. */
function withoutProposal(): SnapshotInput {
  const snapshot = clone();
  const pick = (value: object, keys: string[]) => Object.fromEntries(Object.entries(value).filter(([key]) => keys.includes(key)));
  return {
    ...snapshot,
    journey: { ...snapshot.journey, origin: { ...snapshot.journey.origin, coordinates: null }, destination: { ...snapshot.journey.destination, coordinates: null } },
    conditions: { ...pick(snapshot.conditions, CURRENT_KEYS.conditions), events: snapshot.conditions.events.map((event) => pick(event, CURRENT_KEYS.event)) } as unknown as SnapshotInput["conditions"],
    candidates: snapshot.candidates.map((candidate) => ({ ...candidate, steps: candidate.steps.map((step) => pick(step, CURRENT_KEYS.step)) as unknown as typeof candidate.steps })),
  };
}

describe("stationsBetween", () => {
  it("walks a branch in either direction, inclusive", () => {
    expect(stationsBetween("EW", "bedok", "paya-lebar")).toEqual(["bedok", "kembangan", "eunos", "paya-lebar"]);
    expect(stationsBetween("EW", "paya-lebar", "bedok")).toEqual(["paya-lebar", "eunos", "kembangan", "bedok"]);
  });

  it("takes the shortest branch when several hold both stations (Circle Line Bayfront link)", () => {
    expect(stationsBetween("CC", "promenade", "bayfront")).toEqual(["promenade", "bayfront"]);
    expect(stationsBetween("CC", "bayfront", "promenade")).toEqual(["bayfront", "promenade"]);
  });

  it("returns null for stations not on one branch of the line", () => {
    expect(stationsBetween("EW", "tampines", "downtown")).toBeNull();
    expect(stationsBetween("DT", "tampines", "tampines")).toBeNull();
  });
});

describe("fromJourneySnapshot with the proposed geometry", () => {
  const model = fromJourneySnapshot(withGeometry);
  const usual = model.candidates.find((candidate) => candidate.id === "disrupted-usual")!;
  const alternative = model.candidates.find((candidate) => candidate.id === "disrupted-alternative")!;

  it("reads the fixture without warnings", () => {
    expect(model.warnings).toEqual([]);
  });

  it("assigns original and recommended roles from the recommendation", () => {
    expect(usual.role).toBe("original");
    expect(alternative.role).toBe("recommended");
  });

  it("marks only the disrupted stretch of the usual EWL ride as affected", () => {
    const rail = usual.legs[1];
    expect(rail.geometrySource).toBe("network-topology");
    const affected = rail.segments.filter((segment) => segment.affectedEventIds.length).map((segment) => `${segment.fromStationId}>${segment.toStationId}`);
    expect(affected).toEqual(["bedok>kembangan", "kembangan>eunos", "eunos>paya-lebar"]);
    expect(rail.segments.filter((segment) => !segment.affectedEventIds.length)).toHaveLength(9);
    expect(rail.affectedEventIds).toEqual(["demo-disrupted-event"]);
  });

  it("locates the affected stretch from the event alone when the step does not list it", () => {
    const snapshot = clone();
    delete (snapshot.candidates[0].steps[1] as Record<string, unknown>).affectedEventIds;
    const rail = fromJourneySnapshot(snapshot).candidates[0].legs[1];
    expect(rail.segments.filter((segment) => segment.affectedEventIds.length)).toHaveLength(3);
    expect(rail.affectedEventIds).toEqual(["demo-disrupted-event"]);
  });

  it("marks the whole leg when a listed event has no located stretch", () => {
    const snapshot = clone();
    delete (snapshot.conditions.events[0] as Record<string, unknown>).affectedSegment;
    const rail = fromJourneySnapshot(snapshot).candidates[0].legs[1];
    expect(rail.segments.every((segment) => segment.affectedEventIds.includes("demo-disrupted-event"))).toBe(true);
  });

  it("expands endpoint-only rail legs along the line", () => {
    const rail = alternative.legs[1];
    expect(rail.lineCode).toBe("DT");
    expect(rail.stationIds[0]).toBe("tampines");
    expect(rail.stationIds[rail.stationIds.length - 1]).toBe("downtown");
    expect(rail.stationIds).toContain("bendemeer");
    expect(rail.affectedEventIds).toEqual([]);
  });

  it("draws door-to-door walks as labelled straight lines when no routed path is supplied", () => {
    for (const candidate of model.candidates) {
      const [first, , last] = candidate.legs;
      expect(first.geometrySource).toBe("straight-line");
      expect(first.path![0]).toEqual(withGeometry.journey.origin.coordinates);
      expect(last.path![last.path!.length - 1]).toEqual(withGeometry.journey.destination.coordinates);
    }
  });

  it("keeps crowd signals separate and labels the demo state", () => {
    expect(model.crowd.map((reading) => `${reading.stationId}:${reading.level}:${reading.signal}`)).toEqual([
      "tampines:high:platform-realtime",
      "downtown:low:platform-forecast",
    ]);
    expect(model.dataState).toMatchObject({ mode: "demo", simulated: true, staleAt: "2026-09-20T23:29:00.000Z" });
  });
});

describe("fromJourneySnapshot with today's contract", () => {
  const model = fromJourneySnapshot(withoutProposal());

  it("only adds fields the current contract does not have", () => {
    for (const candidate of fixture.candidates) for (const step of candidate.steps) {
      expect(Object.keys(step)).toEqual(expect.arrayContaining(CURRENT_KEYS.step));
    }
  });

  it("draws nothing it cannot support and explains why", () => {
    for (const candidate of model.candidates) for (const leg of candidate.legs) {
      expect(leg.path).toBeNull();
      expect(leg.geometrySource).toBe("unavailable");
    }
    expect(model.warnings).toContain("Candidate disrupted-usual step 2: rail leg has no stationIds");
    expect(model.warnings).toContain("Candidate disrupted-usual step 1: walk leg has no ends to draw between");
  });
});

describe("fromJourneySnapshot rejects bad geometry without failing the snapshot", () => {
  it("treats a snapshot without source freshness as out of date instead of crashing", () => {
    const snapshot = { ...clone(), sources: [] };
    const model = fromJourneySnapshot(snapshot);
    expect(model.dataState.staleAt).toBe(new Date(snapshot.conditions.observedAt).toISOString());
    expect(model.warnings).toContain("No source freshness supplied; data is shown as out of date");
  });

  it("ignores swapped-axis and out-of-Singapore paths, falling back to a straight line", () => {
    const swapped = clone();
    Object.assign(swapped.candidates[0].steps[0], { path: [[1.353, 103.94], [1.35, 103.94]], pathSource: "osm-routed" });
    const swappedModel = fromJourneySnapshot(swapped);
    expect(swappedModel.warnings).toContain("Candidate disrupted-usual step 1: ignored invalid geometry fields");
    expect(swappedModel.candidates[0].legs[0].geometrySource).toBe("straight-line");

    const elsewhere = clone();
    Object.assign(elsewhere.candidates[0].steps[0], { path: [[0, 0], [0.1, 0.1]], pathSource: "osm-routed" });
    const elsewhereModel = fromJourneySnapshot(elsewhere);
    expect(elsewhereModel.warnings).toContain("Candidate disrupted-usual step 1: path is outside Singapore; check [longitude, latitude] order");
    expect(elsewhereModel.candidates[0].legs[0].geometrySource).toBe("straight-line");
  });

  it("uses a routed walking path when supplied", () => {
    const snapshot = clone();
    const path = [[103.9406, 1.353059], [103.9425, 1.3535], [103.9453, 1.3545]];
    Object.assign(snapshot.candidates[0].steps[0], { path, pathSource: "osm-routed" });
    expect(fromJourneySnapshot(snapshot).candidates[0].legs[0]).toMatchObject({ path, geometrySource: "routed" });
  });

  it("rejects rail legs that do not follow the stated line", () => {
    const snapshot = clone();
    Object.assign(snapshot.candidates[1].steps[1], { lineCode: "EW" });
    const model = fromJourneySnapshot(snapshot);
    expect(model.candidates[1].legs[1].geometrySource).toBe("unavailable");
    expect(model.warnings).toContain("Candidate disrupted-alternative step 2: stations do not follow EW");
  });

  it("drops unknown event references and invalid crowd readings", () => {
    const snapshot = clone();
    Object.assign(snapshot.candidates[1].steps[0], { affectedEventIds: ["no-such-event"] });
    (snapshot.conditions.crowd as unknown[]).push({ stationId: "tampines", level: "crushed", signal: "platform-realtime", sourceId: "x", observedAt: "2026-09-21T07:24:00+08:00" });
    const model = fromJourneySnapshot(snapshot);
    expect(model.candidates[1].legs[0].affectedEventIds).toEqual([]);
    expect(model.crowd).toHaveLength(2);
    expect(model.warnings).toEqual(expect.arrayContaining(["Candidate disrupted-alternative step 1: unknown event no-such-event", "Ignored an invalid crowd reading"]));
  });
});
