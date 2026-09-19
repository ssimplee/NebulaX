import { useCallback, useRef } from "react";
import { LINE_COLORS } from "@/data/lineColors";
import { MRT_SEGMENTS, MRT_STATIONS } from "@/features/mrt-map/topology";
import type { SimulatedTrain } from "@/features/mrt-map/simulation";
import { useTrainSimulation } from "@/features/mrt-map/useTrainSimulation";

const segmentByKey = new Map(MRT_SEGMENTS.map((segment) => [`${segment.branchId}:${segment.index}`, segment]));

/** Where a train sits on the schematic map: straight-line interpolation between station points (viewBox units). */
export function schematicPosition(train: SimulatedTrain): { x: number; y: number; angle: number } | null {
  const segment = segmentByKey.get(`${train.branchId}:${train.segmentIndex}`);
  const from = segment && MRT_STATIONS.get(segment.fromStationId);
  const to = segment && MRT_STATIONS.get(segment.toStationId);
  if (!from || !to) return null;
  const x = from.map_x + (to.map_x - from.map_x) * train.segmentProgress;
  const y = from.map_y + (to.map_y - from.map_y) * train.segmentProgress;
  const heading = Math.atan2(to.map_y - from.map_y, to.map_x - from.map_x) * 180 / Math.PI;
  return { x, y, angle: heading + (train.direction === "reverse" ? 180 : 0) };
}

interface Props {
  /** False pauses the trains where they are. */
  running: boolean;
}

/**
 * Illustrative trains running terminus to terminus along every MRT line on the
 * Network Map. Positions are written straight to the SVG each frame (no React
 * re-render). The simulation pauses in background tabs; with reduced motion the
 * layer is not shown at all. Not live train positions.
 */
export function TrainFlowLayer({ running }: Props) {
  const nodes = useRef(new Map<string, SVGGElement>());

  const onFrame = useCallback((trains: readonly SimulatedTrain[]) => {
    for (const train of trains) {
      const node = nodes.current.get(train.id);
      const position = schematicPosition(train);
      if (!node || !position) continue;
      node.setAttribute("transform", `translate(${position.x.toFixed(1)} ${position.y.toFixed(1)}) rotate(${position.angle.toFixed(1)})`);
    }
  }, []);

  const { trains, reducedMotion } = useTrainSimulation(!running, onFrame);
  if (reducedMotion) return null;

  return (
    <g id="train-flow-layer" aria-hidden="true" pointerEvents="none">
      {trains.map((train) => {
        const start = schematicPosition(train);
        return (
          <g
            key={train.id}
            ref={(node) => { if (node) nodes.current.set(train.id, node); else nodes.current.delete(train.id); }}
            transform={start ? `translate(${start.x} ${start.y}) rotate(${start.angle})` : undefined}
            className="mrt-train"
          >
            <circle r={11} fill={LINE_COLORS[train.lineId]} opacity={0.22} className="mrt-train-halo" />
            <circle r={6.5} fill={LINE_COLORS[train.lineId]} stroke="#ffffff" strokeWidth={2.5} />
            {/* Chevron shows the direction of travel. */}
            <path d="M -2 -3 L 2.2 0 L -2 3" fill="none" stroke="#ffffff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        );
      })}
    </g>
  );
}
