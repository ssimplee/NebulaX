import type { MRTBranch, MRTSegment } from "./topology";

export interface SimulatedTrain {
  id: string;
  lineId: MRTBranch["lineId"];
  branchId: string;
  direction: "forward" | "reverse";
  segmentIndex: number;
  segmentProgress: number;
  status: "moving" | "dwelling";
  dwellElapsedMs: number;
}

export interface SimulationConfig {
  millisecondsPerTravelMinute: number;
  dwellMs: number;
  maxFrameMs: number;
}

export const DEMO_SIMULATION: SimulationConfig = {
  millisecondsPerTravelMinute: 3000,
  dwellMs: 650,
  maxFrameMs: 2000,
};

export function createTrains(branches: MRTBranch[]): SimulatedTrain[] {
  return branches.flatMap((branch) => {
    const count = branch.isMainBranch && branch.stationIds.length > 5 ? 2 : 1;
    return Array.from({ length: count }, (_, index) => ({
      id: `${branch.id}-${index}`,
      lineId: branch.lineId,
      branchId: branch.id,
      direction: index === 0 ? "forward" as const : "reverse" as const,
      segmentIndex: Math.floor((branch.stationIds.length - 2) * (index === 0 ? 0.25 : 0.75)),
      segmentProgress: index === 0 ? 0.25 : 0.75,
      status: "moving" as const,
      dwellElapsedMs: 0,
    }));
  });
}

/** Pure clock step. Background gaps are capped so returning to the tab never teleports a train. */
export function advanceTrain(
  train: SimulatedTrain,
  elapsedMs: number,
  segments: readonly MRTSegment[],
  config: SimulationConfig = DEMO_SIMULATION,
  running = true,
): SimulatedTrain {
  if (!running || elapsedMs <= 0 || !Number.isFinite(elapsedMs)) return train;
  const result = { ...train };
  let remaining = Math.min(elapsedMs, config.maxFrameMs);
  let iterations = 0;
  while (remaining > 0 && iterations++ < 100) {
    const segment = segments[result.segmentIndex];
    if (!segment || segment.branchId !== result.branchId || segment.lineId !== result.lineId) return train;
    if (result.status === "dwelling") {
      const step = Math.min(remaining, config.dwellMs - result.dwellElapsedMs);
      result.dwellElapsedMs += step;
      remaining -= step;
      if (result.dwellElapsedMs >= config.dwellMs) {
        result.dwellElapsedMs = 0;
        result.status = "moving";
      }
      continue;
    }
    const duration = Math.max(1, segment.travelMinutes * config.millisecondsPerTravelMinute);
    const distanceToEnd = result.direction === "forward" ? 1 - result.segmentProgress : result.segmentProgress;
    const step = Math.min(remaining, distanceToEnd * duration);
    result.segmentProgress = Math.max(0, Math.min(1, result.segmentProgress + (result.direction === "forward" ? 1 : -1) * step / duration));
    remaining -= step;
    if (step + 0.000001 < distanceToEnd * duration) break;
    result.status = "dwelling";
    result.dwellElapsedMs = 0;
    if (result.direction === "forward") {
      if (result.segmentIndex < segments.length - 1) {
        result.segmentIndex++;
        result.segmentProgress = 0;
      } else {
        result.direction = "reverse";
        result.segmentProgress = 1;
      }
    } else if (result.segmentIndex > 0) {
      result.segmentIndex--;
      result.segmentProgress = 1;
    } else {
      result.direction = "forward";
      result.segmentProgress = 0;
    }
  }
  return result;
}

export function pointAlongCoordinates(coordinates: readonly [number, number][], progress: number): [number, number] {
  if (coordinates.length < 2) throw new Error("A train path needs two coordinates");
  const distances = coordinates.slice(1).map((point, index) => {
    const previous = coordinates[index];
    const longitudeScale = Math.cos(((point[1] + previous[1]) / 2) * Math.PI / 180);
    return Math.hypot((point[0] - previous[0]) * longitudeScale, point[1] - previous[1]);
  });
  const total = distances.reduce((sum, value) => sum + value, 0);
  let distance = Math.max(0, Math.min(1, progress)) * total;
  for (let index = 0; index < distances.length; index++) {
    if (distance <= distances[index] || index === distances.length - 1) {
      const fraction = distances[index] ? distance / distances[index] : 0;
      return [
        coordinates[index][0] + (coordinates[index + 1][0] - coordinates[index][0]) * fraction,
        coordinates[index][1] + (coordinates[index + 1][1] - coordinates[index][1]) * fraction,
      ];
    }
    distance -= distances[index];
  }
  return [...coordinates[coordinates.length - 1]] as [number, number];
}
