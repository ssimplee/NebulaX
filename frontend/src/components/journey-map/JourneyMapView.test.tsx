import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import normal from "@/features/journey-map/fixtures/rachel-plan.normal.json";
import minor from "@/features/journey-map/fixtures/rachel-plan.five-minute-delay.json";
import disrupted from "@/features/journey-map/fixtures/rachel-plan.fifteen-minute-disruption.json";
import { useJourneyFeedStore } from "@/features/journey-map/journeyFeed";
import { useJourneyStore } from "@/store/journeyStore";
import { useMapStore } from "@/store/mapStore";
import { useRouteStore } from "@/store/routeStore";
import * as rachelApi from "@/services/rachel.api";
import { JourneyMapView } from "./JourneyMapView";

vi.mock("@/services/rachel.api", () => ({
  getRachelPlan: vi.fn(),
  getOperationalConditions: vi.fn(),
  getRachelScenarioConditions: vi.fn(),
}));
const api = vi.mocked(rachelApi);

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const livePlan = () => ({ ...clone(normal.plan), sourceType: "live" });
const liveConditions = {
  observedAt: "2026-09-21T07:24:00+08:00",
  serviceAlerts: [],
  crowdReadings: [{ stationId: "tampines", level: "moderate", sourceType: "live", observedAt: "2026-09-21T07:20:00+08:00" }],
  dataQuality: { staleSources: [], simulatedSources: [], errors: [] },
};
const scenarios = { "five-minute-delay": minor, "fifteen-minute-disruption": disrupted } as const;

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return render(<JourneyMapView />, { wrapper });
}

const routes = () => screen.getByRole("list", { name: "Routes on the map" });
const chooseFeed = (label: string) => fireEvent.change(screen.getByRole("combobox", { name: "Journey data" }), { target: { value: label } });

beforeEach(() => {
  vi.resetAllMocks();
  act(() => {
    useJourneyFeedStore.getState().choose(null);
    useRouteStore.getState().clear();
    useJourneyStore.getState().clearRoute();
    useMapStore.getState().clearHighlights();
  });
  api.getRachelPlan.mockImplementation(async (scenarioId) => (scenarioId ? clone(scenarios[scenarioId as keyof typeof scenarios].plan) : livePlan()) as never);
  api.getOperationalConditions.mockResolvedValue(clone(liveConditions) as never);
  api.getRachelScenarioConditions.mockImplementation(async (scenarioId) => clone(scenarios[scenarioId as keyof typeof scenarios].conditions) as never);
});

describe("JourneyMapView data modes", () => {
  it("opens on Rachel's live plan by default", async () => {
    renderView();
    expect(await screen.findByText(/Live conditions · updated/)).toBeInTheDocument();
    expect(api.getRachelPlan).toHaveBeenCalledWith(undefined);
    expect(api.getOperationalConditions).toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Journey data" })).toHaveValue("live");
    expect(screen.getByText("Times are estimates")).toBeInTheDocument();
    expect(screen.getByText(/Stay on your usual route/)).toBeInTheDocument();
    expect(screen.queryByText(/simulated/i)).not.toBeInTheDocument();
    expect(routes()).toHaveTextContent("Recommended · arrive 08:20");
  });

  it("keeps a five-minute delay quiet", async () => {
    renderView();
    await screen.findByText(/Live conditions · updated/);
    chooseFeed("five-minute-delay");
    expect(await screen.findByText("Demo scenario · simulated")).toBeInTheDocument();
    expect(api.getRachelPlan).toHaveBeenLastCalledWith("five-minute-delay");
    expect(api.getRachelScenarioConditions).toHaveBeenCalledWith("five-minute-delay");
    expect(screen.getByText(/Stay on your usual route/)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Disruptions on the map" })).getByText(/Minor delay: EWL/)).toBeInTheDocument();
  });

  it("shows the original and recommended routes for the fifteen-minute replay", async () => {
    renderView();
    await screen.findByText(/Live conditions · updated/);
    chooseFeed("fifteen-minute-disruption");
    expect(await screen.findByText(/Use DT-CC-NS now/)).toBeInTheDocument();
    expect(routes()).toHaveTextContent("Recommended · arrive 08:37");
    expect(routes()).toHaveTextContent("Usual · arrive 08:35");
    expect(routes()).toHaveTextContent("Passes the disrupted EWL stretch");
    expect(screen.getByText("Demo scenario · simulated")).toBeInTheDocument();
  });

  it("never swaps a failed live request for simulated data, and offers the recording", async () => {
    api.getRachelPlan.mockRejectedValue(new Error("Network Error"));
    renderView();
    const alert = await screen.findByRole("alert", {}, { timeout: 5000 });
    expect(alert).toHaveTextContent("Live journey unavailable");
    expect(alert).toHaveTextContent("No simulated data has been shown in its place.");
    expect(screen.queryByRole("list", { name: "Routes on the map" })).not.toBeInTheDocument();
    fireEvent.click(within(alert).getByRole("button", { name: "Use recorded demo" }));
    expect(await screen.findByText("Demo replay · simulated disruption")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Journey data" })).toHaveValue("recorded");
  });

  it("refuses a live plan built on mock geocoding", async () => {
    api.getRachelPlan.mockResolvedValue({ ...livePlan(), journey: { ...livePlan().journey, home: { ...livePlan().journey.home, postalCode: "238824" } } } as never);
    renderView();
    expect(await screen.findByRole("alert", {}, { timeout: 5000 })).toHaveTextContent("could not locate Rachel's home and work");
  });

  it("shows the route without conditions, and says so, when only the conditions fail", async () => {
    api.getOperationalConditions.mockRejectedValue(new Error("Network Error"));
    renderView();
    expect(await screen.findByText("Live conditions unavailable", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(routes()).toHaveTextContent("Recommended · arrive 08:20");
  });

  it("flags simulated inputs inside a live response", async () => {
    api.getOperationalConditions.mockResolvedValue({ ...clone(liveConditions), dataQuality: { staleSources: ["weather"], simulatedSources: ["simulated"], errors: [] } } as never);
    renderView();
    expect(await screen.findByText("Includes simulated data")).toBeInTheDocument();
    expect(screen.getByText("Stale: weather")).toBeInTheDocument();
  });

  it("prefers the commuter's planned journey when there is one, and can switch to Rachel", async () => {
    act(() => useMapStore.getState().setHighlightedRoute(["tampines", "simei", "tanah-merah"]));
    renderView();
    const select = screen.getByRole("combobox", { name: "Journey data" });
    expect(select).toHaveValue("planned");
    expect(routes()).toHaveTextContent("Highlighted route");
    expect(api.getRachelPlan).not.toHaveBeenCalled();
    chooseFeed("live");
    await waitFor(() => expect(api.getRachelPlan).toHaveBeenCalled());
  });
});
