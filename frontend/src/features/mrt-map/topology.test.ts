import { STATIONS } from "@/data/stations";
import { MRT_LINES, MRT_SEGMENTS, MRT_STATIONS, MRT_TOPOLOGY_ERRORS, buildSegments, validateTopology } from "./topology";

describe("checked MRT topology", () => {
  it("validates every branch, station, coordinate and accepted ride edge", () => {
    expect(MRT_TOPOLOGY_ERRORS).toEqual([]);
    expect(MRT_SEGMENTS.length).toBeGreaterThan(150);
    expect(MRT_SEGMENTS.every((segment) => segment.travelMinutes > 0)).toBe(true);
    expect(MRT_SEGMENTS.every((segment) => segment.geographicCoordinates.every(([longitude, latitude]) => longitude > 103 && latitude < 2))).toBe(true);
    expect(MRT_SEGMENTS.every((segment) => STATIONS.some((station) => station.id === segment.fromStationId) && STATIONS.some((station) => station.id === segment.toStationId))).toBe(true);
  });

  it("covers every canonical MRT station membership with one shared interchange identity", () => {
    for (const station of MRT_STATIONS.values()) for (const lineId of station.lines) {
      if (!MRT_LINES.some((line) => line.id === lineId)) continue; // BP is LRT.
      expect(MRT_LINES.find((line) => line.id === lineId)?.branches.some((branch) => branch.stationIds.includes(station.id))).toBe(true);
    }
    const raffles = MRT_STATIONS.get("raffles-place");
    expect(raffles?.lines).toEqual(expect.arrayContaining(["NS", "EW"]));
    expect(MRT_LINES.filter((line) => line.branches.some((branch) => branch.stationIds.includes("raffles-place")))).toHaveLength(2);
  });

  it("uses the detailed East West sequence and intentional Changi branch", () => {
    const ew = MRT_LINES.find((line) => line.id === "EW")!.branches[0].stationIds.join(" ");
    expect(ew).toContain("pasir-ris tampines simei tanah-merah");
    expect(MRT_SEGMENTS.some((segment) => segment.lineId === "EW" && segment.fromStationId === "tampines" && segment.toStationId === "tanah-merah")).toBe(false);
    expect(MRT_LINES.find((line) => line.id === "CG")!.branches[0].stationIds).toEqual(["tanah-merah", "expo", "changi-airport"]);
  });

  it("rejects unknown stations, duplicates and transfer-only pairs", () => {
    const bad = [{ ...MRT_LINES[0], branches: [{ ...MRT_LINES[0].branches[0], stationIds: ["jurong-east", "jurong-east", "not-a-station"] }] }];
    expect(validateTopology(bad)).toEqual(expect.arrayContaining([
      expect.stringContaining("repeated jurong-east"),
      expect.stringContaining("unknown station not-a-station"),
    ]));
    expect(() => buildSegments(bad)).toThrow(/Invalid MRT topology/);
    const transferPair = [{ ...MRT_LINES[0], branches: [{ ...MRT_LINES[0].branches[0], stationIds: ["jurong-east", "raffles-place"] }] }];
    expect(validateTopology(transferPair).some((error) => error.includes("no ride edge"))).toBe(true);
  });
});
