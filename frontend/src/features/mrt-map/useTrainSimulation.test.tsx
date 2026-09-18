import { render } from "@testing-library/react";
import { useTrainSimulation } from "./useTrainSimulation";

function Probe({ paused = false }: { paused?: boolean }) {
  useTrainSimulation(paused, () => {});
  return <span>simulation</span>;
}

describe("train animation lifecycle", () => {
  const originalMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  it("cancels the shared animation frame on unmount", () => {
    const request = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(17);
    const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const { unmount } = render(<Probe />);
    expect(request).toHaveBeenCalledOnce();
    unmount();
    expect(cancel).toHaveBeenCalledWith(17);
  });

  it("does not animate while paused or when reduced motion is requested", () => {
    const request = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(17);
    const paused = render(<Probe paused />);
    expect(request).not.toHaveBeenCalled();
    paused.unmount();
    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-reduced-motion"), media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    const reduced = render(<Probe />);
    expect(request).not.toHaveBeenCalled();
    reduced.unmount();
  });

  it("stops scheduling frames while the browser tab is hidden", () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const request = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(23);
    const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const { unmount } = render(<Probe />);
    expect(request).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(request).toHaveBeenCalledOnce();
    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(cancel).toHaveBeenCalledWith(23);
    unmount();
  });
});
