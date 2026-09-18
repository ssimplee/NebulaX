import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MapViewToolbar } from "@/components/map/MapViewToolbar";
import { MapPage } from "@/pages/MapPage";
import { MRT_LINES } from "./topology";
import { useMapStore } from "@/store/mapStore";

const allLines = new Set(MRT_LINES.map((line) => line.id));

beforeEach(() => {
  window.localStorage.setItem("sgrail.map-intro-seen", "1");
  useMapStore.getState().selectStation(null);
  useMapStore.getState().clearHighlights();
});

describe("map view integration", () => {
  it("shows Journey controls only in the Journey view", () => {
    const onTogglePause = vi.fn();
    const props = { onViewChange: () => {}, visibleLines: allLines, onToggleLine: () => {}, paused: false,
      onTogglePause, reducedMotion: false, hasSelectedRoute: false, hasOriginalRoute: false };
    const { rerender } = render(<MapViewToolbar view="network" {...props} />);
    expect(screen.queryByText("Train movement · Demo")).not.toBeInTheDocument();
    expect(screen.queryByText("Lines & legend")).not.toBeInTheDocument();
    rerender(<MapViewToolbar view="journey" {...props} />);
    expect(screen.getByText("Train movement · Demo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pause simulated trains" }));
    expect(onTogglePause).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText("Lines & legend"));
    expect(screen.getAllByRole("checkbox")).toHaveLength(7);
  });

  it("preserves the selected journey across Network and Journey views", async () => {
    useMapStore.getState().setHighlightedRoute(["tampines", "simei", "tanah-merah"]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(<QueryClientProvider client={queryClient}><MemoryRouter><MapPage /></MemoryRouter></QueryClientProvider>);
    expect(screen.getByRole("img", { name: "Singapore MRT network map" })).toHaveAttribute("src", "/mrt/singapore-mrt-map.png");
    expect(container.querySelector("[data-station-id='tampines']")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Journey" }));
    expect(await screen.findByRole("link", { name: "© OpenStreetMap contributors" })).toBeVisible();
    expect(useMapStore.getState().highlightedRoute).toEqual(["tampines", "simei", "tanah-merah"]);
    fireEvent.click(screen.getByRole("button", { name: "Network" }));
    expect(screen.getByRole("img", { name: "Singapore MRT network map" })).toBeInTheDocument();
  });
});
