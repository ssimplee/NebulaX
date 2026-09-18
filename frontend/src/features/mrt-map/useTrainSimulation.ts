import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { MRT_LINES, MRT_SEGMENTS } from "./topology";
import { advanceTrain, createTrains, type SimulatedTrain } from "./simulation";

const initialTrains = createTrains(MRT_LINES.flatMap((line) => line.branches));
const segmentsByBranch = new Map(MRT_LINES.flatMap((line) => line.branches.map((branch) => [
  branch.id,
  MRT_SEGMENTS.filter((segment) => segment.branchId === branch.id),
] as const)));

export function useTrainSimulation(
  paused: boolean,
  onFrame: (trains: readonly SimulatedTrain[]) => void,
): { trains: readonly SimulatedTrain[]; reducedMotion: boolean } {
  const trains = useRef<SimulatedTrain[]>(initialTrains.map((train) => ({ ...train })));
  const frameCallback = useRef(onFrame);
  frameCallback.current = onFrame;
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    frameCallback.current(trains.current);
    if (paused || reducedMotion) return;
    let frame = 0;
    let previous = 0;
    const tick = (now: number) => {
      frame = 0;
      const elapsed = previous ? now - previous : 0;
      previous = now;
      if (document.visibilityState !== "hidden") {
        trains.current = trains.current.map((train) =>
          advanceTrain(train, elapsed, segmentsByBranch.get(train.branchId) ?? []),
        );
        frameCallback.current(trains.current);
        frame = requestAnimationFrame(tick);
      }
    };
    const onVisibility = () => {
      previous = 0;
      if (document.visibilityState === "hidden") {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      } else if (!frame) frame = requestAnimationFrame(tick);
    };
    document.addEventListener("visibilitychange", onVisibility);
    if (document.visibilityState !== "hidden") frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [paused, reducedMotion]);

  return { trains: trains.current, reducedMotion };
}
