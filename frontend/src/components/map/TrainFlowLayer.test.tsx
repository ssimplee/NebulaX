import { act, render } from "@testing-library/react";
import { MRT_SEGMENTS, MRT_STATIONS } from "@/features/mrt-map/topology";
import { createTrains } from "@/features/mrt-map/simulation";
import { MRT_LINES } from "@/features/mrt-map/topology";
import { schematicPosition, TrainFlowLayer } from "./TrainFlowLayer";

const setReducedMotion = (reduced: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes("reduce"), media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
};

describe("schematicPosition", () => {
  const train = createTrains(MRT_LINES.flatMap((line) => line.branches))[0];
  const segment = MRT_SEGMENTS.find((item) => item.branchId === train.branchId && item.index === train.segmentIndex)!;
  const from = MRT_STATIONS.get(segment.fromStationId)!;
  const to = MRT_STATIONS.get(segment.toStationId)!;

  it("puts a train on the straight line between its two stations", () => {
    expect(schematicPosition({ ...train, segmentProgress: 0 })).toMatchObject({ x: from.map_x, y: from.map_y });
    expect(schematicPosition({ ...train, segmentProgress: 1 })).toMatchObject({ x: to.map_x, y: to.map_y });
    const middle = schematicPosition({ ...train, segmentProgress: 0.5 })!;
    expect(middle.x).toBeCloseTo((from.map_x + to.map_x) / 2);
  });

  it("turns the direction chevron round for trains heading back", () => {
    const forward = schematicPosition({ ...train, direction: "forward" })!;
    const reverse = schematicPosition({ ...train, direction: "reverse" })!;
    expect(reverse.angle - forward.angle).toBeCloseTo(180);
  });
});

describe("TrainFlowLayer", () => {
  afterEach(() => setReducedMotion(false));

  it("draws one marker per train, and moves them while running", async () => {
    setReducedMotion(false);
    const { container } = render(<svg><TrainFlowLayer running /></svg>);
    const trains = container.querySelectorAll("#train-flow-layer > g");
    expect(trains.length).toBeGreaterThan(10);
    const before = trains[0].getAttribute("transform");
    await act(() => new Promise((resolve) => setTimeout(resolve, 250)));
    expect(trains[0].getAttribute("transform")).not.toBe(before);
  });

  it("stays still when paused", async () => {
    setReducedMotion(false);
    const { container } = render(<svg><TrainFlowLayer running={false} /></svg>);
    const first = container.querySelector("#train-flow-layer > g")!;
    const before = first.getAttribute("transform");
    await act(() => new Promise((resolve) => setTimeout(resolve, 250)));
    expect(first.getAttribute("transform")).toBe(before);
  });

  it("is not shown at all when the device asks for reduced motion", () => {
    setReducedMotion(true);
    const { container } = render(<svg><TrainFlowLayer running /></svg>);
    expect(container.querySelector("#train-flow-layer")).toBeNull();
  });
});
