import { LINE_COLORS } from "@/data/lineColors";
import type { JourneyLine } from "./journeyLayers";

export interface StrokeStyle {
  color: string;
  weight: number;
  opacity: number;
  dashArray?: string;
  lineCap?: "round" | "butt";
}

/**
 * Strokes for one journey line, bottom first. Each state has a pattern as well
 * as a colour so the map still reads without colour vision:
 *  - selected route: thick solid line with a white casing
 *  - other routes: thinner, grey and long-dashed
 *  - disrupted stretch: dark casing with a dotted "broken" core, plus a text marker
 *  - walking: short dots; bus: long dashes
 */
export function strokesFor(line: JourneyLine): StrokeStyle[] {
  const lineColor = (line.lineCode && LINE_COLORS[line.lineCode]) || "#334155";
  if (!line.selected) {
    const muted: StrokeStyle = { color: "#64748b", weight: line.mode === "rail" ? 5 : 3, opacity: 0.85, dashArray: "10 8" };
    return line.affected ? [{ color: "#7f1d1d", weight: 8, opacity: 0.55 }, muted] : [muted];
  }
  if (line.mode === "walk") {
    return [
      { color: "#ffffff", weight: 8, opacity: 0.9, lineCap: "round" },
      { color: "#0f172a", weight: 4, opacity: 1, dashArray: "1 9", lineCap: "round" },
    ];
  }
  if (line.mode === "bus") {
    return [{ color: "#ffffff", weight: 10, opacity: 0.9 }, { color: "#0f172a", weight: 5, opacity: 1, dashArray: "14 6" }];
  }
  if (line.affected) {
    return [
      { color: "#7f1d1d", weight: 13, opacity: 0.95 },
      { color: lineColor, weight: 7, opacity: 1 },
      { color: "#ffffff", weight: 3, opacity: 1, dashArray: "2 10", lineCap: "round" },
    ];
  }
  return [{ color: "#ffffff", weight: 11, opacity: 0.95 }, { color: lineColor, weight: 7, opacity: 1 }];
}

/** Legend entries describe the same patterns in words. */
export const LEGEND_ITEMS = [
  { key: "selected", label: "Selected route (solid, in its line colour)", sample: { color: "#0f172a", weight: 6, dash: undefined } },
  { key: "other", label: "Other route (dashed)", sample: { color: "#64748b", weight: 4, dash: "6 4" } },
  { key: "affected", label: "Disrupted stretch (broken line)", sample: { color: "#7f1d1d", weight: 6, dash: "2 4" } },
  { key: "walk", label: "Walk (dotted)", sample: { color: "#0f172a", weight: 3, dash: "1 5" } },
] as const;
