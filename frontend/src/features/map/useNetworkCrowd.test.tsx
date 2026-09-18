import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import * as rachelApi from "@/services/rachel.api";
import { CrowdLegend } from "@/components/map/CrowdLegend";
import { useNetworkCrowd } from "./useNetworkCrowd";

vi.mock("@/services/rachel.api", () => ({ getOperationalConditions: vi.fn() }));
const api = vi.mocked(rachelApi);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.resetAllMocks());

describe("useNetworkCrowd", () => {
  it("uses backend readings on a three-level scale, dropping unknown levels", async () => {
    api.getOperationalConditions.mockResolvedValue({
      observedAt: "2026-09-21T07:24:00+08:00",
      crowdReadings: [
        { stationId: "orchard", level: "crowded", sourceType: "simulated" },
        { stationId: "city-hall", level: "very_crowded", sourceType: "simulated" },
        { stationId: "bugis", level: "moderate", sourceType: "simulated" },
        { stationId: "tampines", level: "low", sourceType: "simulated" },
        { stationId: "bedok", level: "unknown", sourceType: "simulated" },
      ],
    } as never);
    const { result } = renderHook(() => useNetworkCrowd(true), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const ready = result.current as Extract<typeof result.current, { status: "ready" }>;
    expect(ready.readings).toEqual([
      { stationId: "orchard", level: "high" },
      { stationId: "city-hall", level: "high" },
      { stationId: "bugis", level: "moderate" },
      { stationId: "tampines", level: "low" },
    ]);
    expect(ready.source).toBe("simulated");
  });

  it("does not fetch until the layer is shown", () => {
    renderHook(() => useNetworkCrowd(false), { wrapper });
    expect(api.getOperationalConditions).not.toHaveBeenCalled();
  });

  it("reports a failure instead of inventing readings", async () => {
    api.getOperationalConditions.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useNetworkCrowd(true), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("error"), { timeout: 5000 });
  });
});

describe("CrowdLegend", () => {
  it("shows three levels and where the readings came from", () => {
    render(<CrowdLegend crowd={{ status: "ready", readings: [], source: "simulated", observedAt: "2026-09-21T07:24:00+08:00" }} />);
    expect(screen.getByText("Crowd density · Simulated data · 07:24")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Low", "Moderate", "Crowded / high"]);
    expect(screen.getByText("No station readings right now.")).toBeInTheDocument();
  });

  it("says so when crowding is unavailable", () => {
    render(<CrowdLegend crowd={{ status: "error" }} />);
    expect(screen.getByText("Crowd density unavailable")).toBeInTheDocument();
  });
});
