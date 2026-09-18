import { fireEvent, render, screen } from "@testing-library/react";
import "@/i18n";
import * as alertsHook from "@/features/alerts/useServiceAlerts";
import type { ServiceAlert } from "@/services/alerts.api";
import { AlertBanner, ServiceAlertsButton } from "./AlertBanner";

vi.mock("@/features/alerts/useServiceAlerts", () => ({ useServiceAlerts: vi.fn() }));
const useServiceAlerts = vi.mocked(alertsHook.useServiceAlerts);

const alert = (overrides: Partial<ServiceAlert>): ServiceAlert => ({
  status: 2, severity: "major", lineCode: "NE", ltaLine: "NEL", direction: "HarbourFront",
  stationIds: [], stationCodes: [], freePublicBusStationIds: ["a", "b"], freeMrtShuttleStationIds: [],
  message: "No train service between Dhoby Ghaut and HarbourFront.", createdAt: "2026-09-19 01:00:00", source: "simulated",
  ...overrides,
} as ServiceAlert);

const withAlerts = (alerts: ServiceAlert[]) =>
  useServiceAlerts.mockReturnValue({ data: { alerts, source: "simulated", retrievedAt: "2026-09-19T01:00:00+08:00" } } as never);

beforeEach(() => vi.resetAllMocks());

describe("ServiceAlertsButton", () => {
  it("shows only a count until opened, then the full details", () => {
    withAlerts([alert({}), alert({ lineCode: "EW", severity: "minor", message: "Trains are moving slower than usual.", createdAt: "2026-09-19 01:05:00", freePublicBusStationIds: [] })]);
    render(<ServiceAlertsButton />);
    const button = screen.getByRole("button", { name: /Service disruption: 2 service alerts/ });
    expect(button).toHaveTextContent("2");
    expect(screen.queryByText(/No train service/)).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.getByText(/No train service between Dhoby Ghaut/)).toBeInTheDocument();
    expect(screen.getByText(/Trains are moving slower/)).toBeInTheDocument();
    expect(screen.getByText("Free bus rides at 2 affected stations")).toBeInTheDocument();
  });

  it("renders nothing during normal service", () => {
    withAlerts([]);
    const { container } = render(<ServiceAlertsButton />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("AlertBanner", () => {
  it("is a one-line strip that expands on request", () => {
    withAlerts([alert({ severity: "minor", lineCode: "EW", message: "Slower trains." })]);
    render(<AlertBanner />);
    const toggle = screen.getByRole("button", { name: /Service delay · 1 service alert/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Slower trains/)).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Slower trains/)).toBeInTheDocument();
  });

  it("can be dismissed", () => {
    withAlerts([alert({})]);
    const { container } = render(<AlertBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss alert" }));
    expect(container).toBeEmptyDOMElement();
  });
});
