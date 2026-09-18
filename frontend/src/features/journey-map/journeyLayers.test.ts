import fixture from "./fixtures/rachel-disrupted.geometry.json";
import { fromJourneySnapshot, type SnapshotInput } from "./fromJourneySnapshot";
import { buildJourneyLayers, candidateSummary, eventSummary } from "./journeyLayers";
import { strokesFor } from "./journeyStyles";

const model = fromJourneySnapshot(fixture as unknown as SnapshotInput);

describe("buildJourneyLayers", () => {
  const layers = buildJourneyLayers(model);

  it("selects the recommended candidate by default and draws it last", () => {
    expect(layers.selectedCandidateId).toBe("disrupted-alternative");
    expect(layers.lines[layers.lines.length - 1].candidateId).toBe("disrupted-alternative");
  });

  it("splits the usual EWL ride into unaffected, affected, unaffected stretches", () => {
    const rail = layers.lines.filter((line) => line.candidateId === "disrupted-usual" && line.mode === "rail");
    expect(rail.map((line) => [line.affected, line.description])).toEqual([
      [false, "Usual: EWL Tampines to Bedok"],
      [true, "Usual: EWL Bedok to Paya Lebar, disrupted"],
      [false, "Usual: EWL Paya Lebar to Raffles Place"],
    ]);
  });

  it("includes both door-to-door walks, marked approximate", () => {
    const walks = layers.lines.filter((line) => line.mode === "walk");
    expect(walks).toHaveLength(4);
    expect(walks.every((line) => line.approximate)).toBe(true);
  });

  it("labels legs of the selected route in text, not colour", () => {
    const legs = layers.markers.filter((marker) => marker.kind === "leg").map((marker) => marker.text);
    expect(legs).toEqual(["Walk · 10 min (approx. path)", "DTL · 44 min", "Walk · 8 min (approx. path)"]);
    expect(layers.markers.filter((marker) => marker.kind === "leg").map((marker) => marker.short)).toEqual([true, false, true]);
  });

  it("tags the other route with its arrival for comparison", () => {
    expect(layers.markers.find((marker) => marker.kind === "route-tag")).toMatchObject({ candidateId: "disrupted-usual", text: "Usual · arrive 08:52" });
  });

  it("marks the disruption with a text label and delay", () => {
    expect(layers.markers.find((marker) => marker.kind === "disruption")).toMatchObject({
      text: "Disrupted EWL · +15 min",
      description: expect.stringContaining("between Bedok and Paya Lebar"),
    });
  });

  it("shows crowding as words with the signal named", () => {
    const crowd = layers.markers.filter((marker) => marker.kind === "crowd");
    expect(crowd.map((marker) => marker.text)).toEqual(["High crowd", "Low crowd"]);
    expect(crowd[0].description).toContain("platform now");
    expect(crowd[1].description).toContain("platform forecast");
  });

  it("adds start/end markers, key-station footprints and bounds covering the whole trip", () => {
    expect(layers.markers.filter((marker) => marker.kind === "origin" || marker.kind === "destination")).toHaveLength(2);
    expect(new Set(layers.footprints.map((footprint) => footprint.stationId))).toEqual(new Set(["tampines", "raffles-place", "downtown"]));
    const [[west, south], [east, north]] = layers.bounds!;
    expect(west).toBeLessThanOrEqual(103.851062);
    expect(east).toBeGreaterThanOrEqual(103.9453);
    expect(south).toBeLessThanOrEqual(1.2794);
    expect(north).toBeGreaterThanOrEqual(1.3545);
  });

  it("switches emphasis when the usual route is selected", () => {
    const switched = buildJourneyLayers(model, "disrupted-usual");
    expect(switched.lines[switched.lines.length - 1].candidateId).toBe("disrupted-usual");
    expect(switched.markers.find((marker) => marker.kind === "route-tag")?.candidateId).toBe("disrupted-alternative");
  });

  it("draws only the recommended and original routes unless another option is picked", () => {
    const withExtra = { ...model, candidates: [...model.candidates, { ...model.candidates[1], id: "extra", role: "other" as const }] };
    expect(buildJourneyLayers(withExtra).lines.some((line) => line.candidateId === "extra")).toBe(false);
    expect(buildJourneyLayers(withExtra, "extra").lines.some((line) => line.candidateId === "extra")).toBe(true);
  });

  it("falls back to the recommendation for an unknown selection", () => {
    expect(buildJourneyLayers(model, "nope").selectedCandidateId).toBe("disrupted-alternative");
  });
});

describe("candidateSummary", () => {
  it("uses duration when there is no arrival time", () => {
    expect(candidateSummary({ ...model.candidates[1], arrivalAt: null, durationMinutes: 34 }, model.labels)).toBe("Recommended · 34 min");
  });

  it("summarises located events in one line", () => {
    expect(eventSummary(model.events[0])).toBe("Disruption: EWL Bedok–Paya Lebar · +15 min");
    expect(eventSummary({ ...model.events[0], stationIds: [] })).toBeNull();
  });
});

describe("strokesFor", () => {
  const layers = buildJourneyLayers(model, "disrupted-usual");
  const byDescription = (text: string) => layers.lines.find((line) => line.description.includes(text))!;

  it("gives every visual state a distinct dash pattern, not just a colour", () => {
    const signature = (text: string) => strokesFor(byDescription(text)).map((stroke) => stroke.dashArray ?? "solid").join("|");
    const selectedClear = signature("EWL Tampines to Bedok");
    const selectedAffected = signature("Bedok to Paya Lebar");
    const other = signature("Recommended: DTL");
    const walk = signature("Usual: Walk");
    expect(new Set([selectedClear, selectedAffected, other, walk]).size).toBe(4);
  });
});
