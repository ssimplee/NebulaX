import { MRT_LINES, MRT_SEGMENTS } from "./topology";
import { advanceTrain, createTrains, pointAlongCoordinates, type SimulationConfig } from "./simulation";

const branch = MRT_LINES.find((line) => line.id === "CG")!.branches[0];
const segments = MRT_SEGMENTS.filter((segment) => segment.branchId === branch.id);
const config: SimulationConfig = { millisecondsPerTravelMinute: 100, dwellMs: 20, maxFrameMs: 10000 };

describe("simulated train clock", () => {
  it("moves, dwells, crosses the next segment and reverses at a terminus", () => {
    const initial = { ...createTrains([branch])[0], segmentIndex: 0, segmentProgress: 0 };
    const first = advanceTrain(initial, segments[0].travelMinutes * 100, segments, config);
    expect(first).toMatchObject({ segmentIndex: 1, segmentProgress: 0, status: "dwelling", direction: "forward" });
    const departed = advanceTrain(first, 20, segments, config);
    expect(departed.status).toBe("moving");
    const terminus = advanceTrain(departed, segments[1].travelMinutes * 100, segments, config);
    expect(terminus).toMatchObject({ segmentIndex: 1, segmentProgress: 1, status: "dwelling", direction: "reverse" });
    const reverse = advanceTrain(terminus, 120, segments, config);
    expect(reverse.segmentProgress).toBeLessThan(1);
    expect(reverse.segmentProgress).toBeGreaterThanOrEqual(0);
    expect(reverse.branchId).toBe(branch.id);
  });

  it("pauses deterministically and caps background frame gaps", () => {
    const initial = { ...createTrains([branch])[0], segmentIndex: 0, segmentProgress: 0 };
    expect(advanceTrain(initial, 10000, segments, config, false)).toBe(initial);
    expect(advanceTrain(initial, 1000000, segments, { ...config, maxFrameMs: 30 }).segmentProgress).toBeLessThan(1);
    expect(advanceTrain(initial, NaN, segments, config)).toBe(initial);
    expect(advanceTrain({ ...initial, branchId: "other" }, 100, segments, config)).toMatchObject({ branchId: "other", segmentProgress: 0 });
  });

  it("interpolates along every point of a geographic line", () => {
    expect(pointAlongCoordinates([[0, 0], [1, 0], [1, 1]], 0.25)[0]).toBeCloseTo(0.5, 2);
    expect(pointAlongCoordinates([[0, 0], [1, 0], [1, 1]], 0.75)[1]).toBeCloseTo(0.5, 2);
  });
});
