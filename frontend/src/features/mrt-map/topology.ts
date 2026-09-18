import stationsJson from "../../../../backend/app/data/stations.json";
import graphJson from "../../../../backend/app/data/graph.json";
import { LINE_COLORS } from "@/data/lineColors";

export type MRTLineId = "NS" | "EW" | "NE" | "CC" | "DT" | "TE" | "CG";
export type Coordinate = [longitude: number, latitude: number];

export interface MRTStation {
  id: string;
  name: string;
  codes: string[];
  lines: string[];
  map_x: number;
  map_y: number;
  latitude: number;
  longitude: number;
  is_interchange: boolean;
}

export interface MRTBranch {
  id: string;
  lineId: MRTLineId;
  stationIds: string[];
  isMainBranch: boolean;
  terminus: "reverse";
}

export interface MRTLine {
  id: MRTLineId;
  name: string;
  color: string;
  branches: MRTBranch[];
}

export interface MRTSegment {
  id: string;
  lineId: MRTLineId;
  branchId: string;
  index: number;
  fromStationId: string;
  toStationId: string;
  travelMinutes: number;
  schematicPath: string;
  geographicCoordinates: [Coordinate, Coordinate];
}

type GraphEdge = {
  from: { station_id: string; line_code: string };
  to: { station_id: string; line_code: string };
  type: string;
  travel_minutes: number;
};

const stations = stationsJson as MRTStation[];
const graphEdges = graphJson.edges as GraphEdge[];

// Reviewed operating order. Numeric station codes were used to prepare this
// checked-in definition, but no runtime sorting or graph traversal makes tracks.
const definitions: Array<[MRTLineId, string, Array<[string, string, boolean]>]> = [
  ["NS", "North South", [["ns-main", "jurong-east bukit-batok bukit-gombak choa-chu-kang yew-tee kranji marsiling woodlands admiralty sembawang canberra yishun khatib yio-chu-kang ang-mo-kio bishan braddell toa-payoh novena newton orchard somerset dhoby-ghaut city-hall raffles-place marina-bay marina-south-pier", true]]],
  ["EW", "East West", [["ew-main", "pasir-ris tampines simei tanah-merah bedok kembangan eunos paya-lebar aljunied kallang lavender bugis city-hall raffles-place tanjong-pagar outram-park tiong-bahru redhill queenstown commonwealth buona-vista dover clementi jurong-east chinese-garden lakeside boon-lay joo-koon pioneer tuas-crescent tuas-west-road tuas-link", true]]],
  ["NE", "North East", [["ne-main", "harbourfront outram-park chinatown clarke-quay dhoby-ghaut little-india farrer-park boon-keng potong-pasir woodleigh serangoon kovan hougang buangkok sengkang punggol punggol-coast", true]]],
  ["CC", "Circle", [
    ["cc-main", "dhoby-ghaut bras-basah esplanade promenade nicoll-highway stadium mountbatten dakota paya-lebar macpherson tai-seng bartley serangoon lorong-chuan bishan marymount caldecott botanic-gardens farrer-road holland-village buona-vista one-north kent-ridge haw-par-villa pasir-panjang labrador-park telok-blangah harbourfront keppel cantonment prince-edward-road marina-bay bayfront", true],
    ["cc-bayfront-link", "promenade bayfront", false],
  ]],
  ["DT", "Downtown", [["dt-main", "bukit-panjang cashew hillview hume beauty-world king-albert-park sixth-avenue tan-kah-kee botanic-gardens stevens newton little-india rochor bugis promenade bayfront downtown telok-ayer chinatown fort-canning bencoolen jalan-besar bendemeer geylang-bahru mattar macpherson ubi kaki-bukit bedok-north bedok-reservoir tampines-west tampines tampines-east upper-changi expo", true]]],
  ["TE", "Thomson East Coast", [["te-main", "woodlands-north woodlands woodlands-south springleaf lentor mayflower bright-hill upper-thomson caldecott stevens napier orchard-boulevard orchard great-world havelock outram-park maxwell shenton-way marina-bay gardens-by-the-bay tanjong-rhu katong-park tanjong-katong marine-parade marine-terrace siglap bayshore", true]]],
  ["CG", "Changi Airport", [["cg-main", "tanah-merah expo changi-airport", true]]],
];

export const MRT_LINES: MRTLine[] = definitions.map(([id, name, branches]) => ({
  id,
  name,
  color: LINE_COLORS[id],
  branches: branches.map(([branchId, stationIds, isMainBranch]) => ({
    id: branchId,
    lineId: id,
    stationIds: stationIds.split(" "),
    isMainBranch,
    terminus: "reverse",
  })),
}));

export const MRT_STATIONS = new Map(stations.map((station) => [station.id, station]));

// Keep this empty unless a reviewed, documented station pair is missing from
// graph.json. Transfer edges can never satisfy the ride-edge check.
export const MISSING_RIDE_EDGE_ALLOWLIST: Readonly<Record<string, number>> = {};

const edgeKey = (lineId: string, a: string, b: string) =>
  `${lineId}:${[a, b].sort().join(":")}`;

export function validateTopology(
  lines: MRTLine[] = MRT_LINES,
  stationMap: ReadonlyMap<string, MRTStation> = MRT_STATIONS,
  edges: GraphEdge[] = graphEdges,
): string[] {
  const errors: string[] = [];
  const lineIds = new Set<string>();
  const branchIds = new Set<string>();
  const accepted = new Set<string>();
  if (stationMap.size !== stations.length) errors.push("Canonical station IDs are not unique");
  for (const line of lines) {
    if (lineIds.has(line.id)) errors.push(`Duplicate line ${line.id}`);
    lineIds.add(line.id);
    for (const branch of line.branches) {
      if (branchIds.has(branch.id)) errors.push(`Duplicate branch ${branch.id}`);
      branchIds.add(branch.id);
      if (branch.lineId !== line.id) errors.push(`${branch.id}: wrong line`);
      if (branch.stationIds.length < 2) errors.push(`${branch.id}: fewer than two stations`);
      branch.stationIds.forEach((id, index) => {
        const station = stationMap.get(id);
        if (!station) { errors.push(`${branch.id}: unknown station ${id}`); return; }
        if (!station.lines.includes(line.id)) errors.push(`${branch.id}: ${id} is not on ${line.id}`);
        if (!Number.isFinite(station.map_x) || !Number.isFinite(station.map_y)) errors.push(`${id}: invalid schematic coordinates`);
        if (!Number.isFinite(station.latitude) || !Number.isFinite(station.longitude) || station.latitude < 1.1 || station.latitude > 1.6 || station.longitude < 103.5 || station.longitude > 104.2) errors.push(`${id}: invalid Singapore coordinates`);
        if (index === 0) return;
        const previous = branch.stationIds[index - 1];
        if (previous === id) errors.push(`${branch.id}: repeated ${id}`);
        const key = edgeKey(line.id, previous, id);
        accepted.add(key);
        if (!edges.some((edge) => edge.type === "ride" && edge.from.line_code === line.id && edge.to.line_code === line.id && edgeKey(line.id, edge.from.station_id, edge.to.station_id) === key && edge.travel_minutes > 0) && !(key in MISSING_RIDE_EDGE_ALLOWLIST)) {
          errors.push(`${branch.id}: no ride edge for ${previous} → ${id}`);
        }
      });
    }
  }
  for (const requiredLine of ["NS", "EW", "NE", "CC", "DT", "TE", "CG"]) {
    if (!lineIds.has(requiredLine)) errors.push(`Missing MRT line ${requiredLine}`);
  }
  for (const station of stationMap.values()) for (const lineId of station.lines) {
    if (!lineIds.has(lineId)) continue; // BP is LRT, outside this MRT map.
    if (!lines.some((line) => line.id === lineId && line.branches.some((branch) => branch.stationIds.includes(station.id)))) {
      errors.push(`${station.id}: missing from ${lineId} topology`);
    }
  }
  for (const key of Object.keys(MISSING_RIDE_EDGE_ALLOWLIST)) if (!accepted.has(key)) errors.push(`Unused ride-edge allowlist entry ${key}`);
  return errors;
}

export function buildSegments(lines: MRTLine[] = MRT_LINES): MRTSegment[] {
  const errors = validateTopology(lines);
  if (errors.length) throw new Error(`Invalid MRT topology:\n${errors.join("\n")}`);
  return lines.flatMap((line) => line.branches.flatMap((branch) => branch.stationIds.slice(1).map((toStationId, index) => {
    const fromStationId = branch.stationIds[index];
    const from = MRT_STATIONS.get(fromStationId)!;
    const to = MRT_STATIONS.get(toStationId)!;
    const key = edgeKey(line.id, fromStationId, toStationId);
    const edge = graphEdges.find((item) => item.type === "ride" && item.from.line_code === line.id && item.to.line_code === line.id && edgeKey(line.id, item.from.station_id, item.to.station_id) === key);
    return {
      id: `${branch.id}:${index}`,
      lineId: line.id,
      branchId: branch.id,
      index,
      fromStationId,
      toStationId,
      travelMinutes: edge?.travel_minutes ?? MISSING_RIDE_EDGE_ALLOWLIST[key],
      schematicPath: `M ${from.map_x} ${from.map_y} L ${to.map_x} ${to.map_y}`,
      geographicCoordinates: [[from.longitude, from.latitude], [to.longitude, to.latitude]],
    };
  })));
}

export const MRT_TOPOLOGY_ERRORS = validateTopology();
export const MRT_SEGMENTS = MRT_TOPOLOGY_ERRORS.length ? [] : buildSegments();
export const MRT_STATION_LIST = stations.filter((station) => MRT_LINES.some((line) => station.lines.includes(line.id)));
