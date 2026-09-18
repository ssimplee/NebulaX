import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MapViewToolbar } from "@/components/map/MapViewToolbar";
import { MapPage } from "@/pages/MapPage";
import { useMapStore } from "@/store/mapStore";
import { useJourneyFeedStore } from "@/features/journey-map/journeyFeed";

beforeEach(() => {
  window.localStorage.setItem("sgrail.map-intro-seen", "1");
  useMapStore.getState().selectStation(null);
  useMapStore.getState().clearHighlights();
  useJourneyFeedStore.getState().choose(null);
});

describe("map view integration", () => {
  it("switches between the Network Map and Journey Map", () => {
    const onViewChange = vi.fn();
    render(<MapViewToolbar view="network" onViewChange={onViewChange} />);
    expect(screen.getByRole("button", { name: "Network Map" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Journey Map" }));
    expect(onViewChange).toHaveBeenCalledWith("journey");
  });

  it("preserves the selected journey across Network and Journey views", async () => {
    useMapStore.getState().setHighlightedRoute(["tampines", "simei", "tanah-merah"]);
    useJourneyFeedStore.getState().choose("planned");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(<QueryClientProvider client={queryClient}><MemoryRouter><MapPage /></MemoryRouter></QueryClientProvider>);
    expect(screen.getByRole("img", { name: "Singapore MRT network map" })).toHaveAttribute("src", "/mrt/singapore-mrt-map.png");
    expect(container.querySelector("[data-station-id='tampines']")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Journey Map" }));
    expect(await screen.findByRole("link", { name: "© OpenStreetMap contributors" }, { timeout: 5000 })).toBeVisible();
    expect(useMapStore.getState().highlightedRoute).toEqual(["tampines", "simei", "tanah-merah"]);
    fireEvent.click(screen.getByRole("button", { name: "Network Map" }));
    expect(screen.getByRole("img", { name: "Singapore MRT network map" })).toBeInTheDocument();
  });
});
