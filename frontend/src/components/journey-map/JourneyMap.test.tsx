import { act, fireEvent, render, screen, within } from "@testing-library/react";
import fixture from "@/features/journey-map/fixtures/rachel-disrupted.geometry.json";
import { fromJourneySnapshot, type SnapshotInput } from "@/features/journey-map/fromJourneySnapshot";
import { noBasemap, type BasemapProvider } from "@/features/journey-map/basemap";
import { fromRoutePlan } from "@/features/journey-map/fromRoutePlan";
import { JourneyMap } from "./JourneyMap";

const model = fromJourneySnapshot(fixture as unknown as SnapshotInput);
const liveModel = { ...model, dataState: { ...model.dataState, mode: "live" as const, simulated: false, staleAt: "2020-01-01T00:00:00.000Z" } };

const failingBasemap: BasemapProvider = {
  id: "failing",
  attribution: noBasemap.attribution,
  async attach(_map, events) {
    events.onError();
    return { remove() {} };
  },
};

describe("JourneyMap", () => {
  it("shows OpenStreetMap attribution and labels the replay as not live", () => {
    render(<JourneyMap model={model} basemap={noBasemap} />);
    expect(screen.getByRole("link", { name: "© OpenStreetMap contributors" })).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
    expect(screen.getByText("Demo replay · not live")).toBeInTheDocument();
  });

  it("compares the recommended and usual routes with their time trade-off", () => {
    render(<JourneyMap model={model} basemap={noBasemap} />);
    const routes = within(screen.getByRole("list", { name: "Routes on the map" })).getAllByRole("button");
    expect(routes[0]).toHaveTextContent("Recommended · arrive 08:42");
    expect(routes[0]).toHaveTextContent("10 min earlier than usual");
    expect(routes[0]).toHaveAttribute("aria-pressed", "true");
    expect(routes[1]).toHaveTextContent("Usual · arrive 08:52");
  });

  it("keeps extra options folded and off the map until one is picked", () => {
    const withExtra = { ...model, candidates: [...model.candidates, { ...model.candidates[1], id: "extra", label: "Extra route", role: "other" as const }] };
    const { container, rerender } = render(<JourneyMap model={withExtra} basemap={noBasemap} />);
    expect(within(screen.getByRole("list", { name: "Routes on the map" })).getAllByRole("button")).toHaveLength(2);
    expect(within(screen.getByRole("list", { name: "More route options" })).getByRole("button")).toHaveTextContent("Extra route");
    const tagsBefore = container.querySelectorAll(".jm-chip--route-tag").length;
    rerender(<JourneyMap model={withExtra} basemap={noBasemap} selectedCandidateId="extra" />);
    expect(within(screen.getByRole("list", { name: "Routes on the map" })).getAllByRole("button")).toHaveLength(3);
    expect(screen.queryByRole("list", { name: "More route options" })).not.toBeInTheDocument();
    expect(container.querySelectorAll(".jm-chip--route-tag").length).toBe(tagsBefore + 1);
  });

  it("lists the located disruption in text, not only as a map label", () => {
    render(<JourneyMap model={model} basemap={noBasemap} />);
    expect(within(screen.getByRole("list", { name: "Disruptions on the map" })).getByText("⚠ Disruption: EWL Bedok–Paya Lebar · +15 min")).toBeInTheDocument();
  });

  it("uses planner wording for Route tab options", () => {
    const route = (minutes: number, line: string, stations: string[]) => ({ totalMinutes: minutes, steps: [
      { type: "board" as const, stationId: stations[0], line },
      { type: "ride" as const, stations: stations.slice(1), minutes },
      { type: "alight" as const, stationId: stations[stations.length - 1] },
    ] });
    const planned = fromRoutePlan({ source: "computed", computedAt: new Date().toISOString(), routes: [route(10, "EW", ["tampines", "simei"]), route(14, "DT", ["tampines", "tampines-west"])] }, 0);
    render(<JourneyMap model={planned} basemap={noBasemap} />);
    const list = screen.getByRole("list", { name: "Routes on the map" });
    expect(list).toHaveTextContent("Selected · 10 min");
    expect(list).not.toHaveTextContent(/usual|Recommended/);
    const more = screen.getByRole("list", { name: "More route options" });
    expect(more).toHaveTextContent("Option 2 · 14 min");
    expect(more).toHaveTextContent("4 min later than option 1");
  });

  it("draws the disruption, crowd and walk labels as text on the map", () => {
    const { container } = render(<JourneyMap model={model} basemap={noBasemap} />);
    const chips = [...container.querySelectorAll(".jm-chip")].map((chip) => chip.textContent);
    expect(chips).toEqual(expect.arrayContaining(["Disrupted EWL · +15 min", "High crowd", "Low crowd", "Start", "End", "DTL · 44 min"]));
    expect(container.querySelectorAll("path.leaflet-interactive").length).toBeGreaterThan(0);
  });

  it("lets the commuter switch the emphasised route from the legend or the map", () => {
    const onSelectCandidate = vi.fn();
    const { container } = render(<JourneyMap model={model} basemap={noBasemap} onSelectCandidate={onSelectCandidate} />);
    fireEvent.click(within(screen.getByRole("list", { name: "Routes on the map" })).getByRole("button", { name: /Usual · arrive 08:52/ }));
    expect(onSelectCandidate).toHaveBeenLastCalledWith("disrupted-usual");
    fireEvent.click(container.querySelector("button.jm-chip--route-tag")!);
    expect(onSelectCandidate).toHaveBeenCalledTimes(2);
  });

  it("reports a failed street map without hiding the route", () => {
    const { container } = render(<JourneyMap model={model} basemap={failingBasemap} />);
    return screen.findByText("Street map unavailable · route still shown").then(() => {
      expect(container.querySelectorAll(".jm-chip").length).toBeGreaterThan(0);
    });
  });

  it("says when it is offline and when live data is stale", () => {
    render(<JourneyMap model={liveModel} basemap={noBasemap} />);
    expect(screen.getByText("May be out of date · updated 07:24")).toBeInTheDocument();
    act(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText("Offline · showing journey from 07:24")).toBeInTheDocument();
    act(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
      window.dispatchEvent(new Event("online"));
    });
  });

  it("keeps an embedded map still until the commuter chooses to move it", () => {
    render(<JourneyMap model={model} basemap={noBasemap} cooperativeGestures />);
    fireEvent.click(screen.getByRole("button", { name: "Move map" }));
    expect(screen.getByRole("button", { name: "Done moving" })).toBeInTheDocument();
  });

  it("warns when nothing can be drawn", () => {
    const empty = fromJourneySnapshot({ ...(fixture as unknown as SnapshotInput), journey: { ...fixture.journey, origin: { label: "x", coordinates: null }, destination: { label: "y", coordinates: null } } as SnapshotInput["journey"], candidates: fixture.candidates.map((candidate) => ({ ...candidate, steps: candidate.steps.map((step) => ({ mode: step.mode, instruction: step.instruction })) })) as SnapshotInput["candidates"] });
    render(<JourneyMap model={empty} basemap={noBasemap} />);
    expect(screen.getByText("No route shape available")).toBeInTheDocument();
  });
});
