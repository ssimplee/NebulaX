import rawGeoJson from "../../../../data/AmendmenttoMP2014RailStation.geojson?raw";
import stationsJson from "../../../../backend/app/data/stations.json";
import checkedIn from "@/data/stationFootprints.json";
import { MRT_LINES } from "@/features/mrt-map/topology";
import {
  AREA_TOLERANCE,
  NAME_MATCH_MAX_METRES,
  NEAREST_MATCH_MAX_METRES,
  assessCoordinateSystem,
  buildStationFootprints,
  normaliseStationName,
  polygonAreaSquareMetres,
  type CanonicalStation,
  type LonLat,
  type RawFootprintCollection,
} from "./stationFootprints.build";
import { footprintsForStation } from "./stationFootprints";

const raw = JSON.parse(rawGeoJson) as RawFootprintCollection;
const stations = stationsJson as CanonicalStation[];
const mapFeatures = (transform: (point: LonLat) => LonLat): RawFootprintCollection => ({
  ...raw,
  features: raw.features.map((feature) => ({
    ...feature,
    geometry: { ...feature.geometry, coordinates: feature.geometry.coordinates.map((ring) => ring.map(transform)) },
  })),
});

describe("supplied station GeoJSON coordinate system", () => {
  it("declares no CRS, so it has to be inferred", () => {
    expect(raw.crs).toBeUndefined();
    expect(raw.features).toHaveLength(208);
  });

  it("is WGS84 longitude/latitude: every vertex is in Singapore and areas match SHAPE_1.AREA", () => {
    const report = assessCoordinateSystem(raw);
    expect(report.inferredCrs).toBe("EPSG:4326");
    expect(report.maxAreaError).toBeLessThanOrEqual(AREA_TOLERANCE);
    for (const feature of raw.features) {
      const recorded = feature.properties["SHAPE_1.AREA"];
      expect(Math.abs(polygonAreaSquareMetres(feature.geometry.coordinates) - recorded) / recorded).toBeLessThan(AREA_TOLERANCE);
    }
  });

  it("rejects swapped axes and projected (SVY21-style metre) coordinates", () => {
    expect(() => assessCoordinateSystem(mapFeatures(([lon, lat]) => [lat, lon]))).toThrow(/not a Singapore longitude\/latitude/);
    expect(() => assessCoordinateSystem(mapFeatures(([lon, lat]) => [(lon - 103.8) * 111_000 + 28_000, (lat - 1.37) * 111_000 + 38_000]))).toThrow();
  });

  it("rejects geometry whose area no longer matches the recorded area", () => {
    const stretched = mapFeatures(([lon, lat]) => [103.8 + (lon - 103.8) * 1.05, lat]);
    expect(() => assessCoordinateSystem(stretched)).toThrow(/area differs/);
  });
});

describe("station footprint join", () => {
  const built = buildStationFootprints(raw, stations);

  it("matches the checked-in file (run `npm run data:footprints` after changing data)", () => {
    expect(JSON.parse(JSON.stringify(built))).toEqual(checkedIn);
  });

  it("only joins footprints that sit near their canonical station", () => {
    const stationById = new Map(stations.map((station) => [station.id, station]));
    for (const footprint of built.footprints) {
      expect(stationById.has(footprint.stationId)).toBe(true);
      expect(footprint.distanceMetres).toBeLessThanOrEqual(footprint.match === "nearest" ? NEAREST_MATCH_MAX_METRES : NAME_MATCH_MAX_METRES);
    }
  });

  it("accounts for every source feature exactly once", () => {
    const ids = [...built.footprints, ...built.unmatched].map((item) => item.objectId);
    expect(new Set(ids).size).toBe(raw.features.length);
    expect(ids).toHaveLength(raw.features.length);
  });

  it("normalises source naming variants", () => {
    expect(normaliseStationName("SERANGOON INTERCHANGE")).toBe("serangoon");
    expect(normaliseStationName("TAN KAH KEE RAIL STATION")).toBe("tankahkee");
    expect(normaliseStationName("PHOENIX LRT STATION")).toBe("phoenix");
    expect(normaliseStationName(null)).toBe("");
  });

  it("trusts position over a conflicting planning-stage label", () => {
    expect(built.footprints.find((footprint) => footprint.objectId === 723)).toMatchObject({ sourceName: "JALAN BESAR", stationId: "bendemeer", match: "nearest" });
  });

  it("covers Rachel's endpoints and both demo corridors", () => {
    const corridor = (lineId: string, from: string, to: string) => {
      const ids = MRT_LINES.find((line) => line.id === lineId)!.branches[0].stationIds;
      const [a, b] = [ids.indexOf(from), ids.indexOf(to)].sort((x, y) => x - y);
      return ids.slice(a, b + 1);
    };
    const required = new Set([...corridor("EW", "tampines", "raffles-place"), ...corridor("DT", "tampines", "downtown")]);
    const missing = [...required].filter((id) => footprintsForStation(id).length === 0);
    expect(missing).toEqual([]);
  });

  it("returns an empty list for stations built after the 2014 master plan", () => {
    expect(footprintsForStation("punggol-coast")).toEqual([]);
  });
});
