// Pure build step for the supplied URA station footprint GeoJSON.
// Shared by scripts/build-station-footprints.ts and the tests, so it must not
// use path aliases or browser/Node APIs.

export type LonLat = [longitude: number, latitude: number];

export interface RawFootprintFeature {
  type: "Feature";
  properties: {
    OBJECTID: number;
    NAME: string | null;
    TYPE: string;
    GRND_LEVEL: string;
    "SHAPE_1.AREA": number;
  };
  geometry: { type: "Polygon"; coordinates: LonLat[][] };
}

export interface RawFootprintCollection {
  type: "FeatureCollection";
  crs?: unknown;
  features: RawFootprintFeature[];
}

export interface CanonicalStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export type FootprintMatch = "name" | "alias" | "nearest";

export interface StationFootprint {
  objectId: number;
  stationId: string;
  sourceName: string | null;
  type: string;
  groundLevel: string;
  match: FootprintMatch;
  /** Footprint centroid to the canonical station point in stations.json. */
  distanceMetres: number;
  centroid: LonLat;
  polygon: LonLat[][];
}

export interface CoordinateSystemReport {
  declaredCrs: null;
  inferredCrs: "EPSG:4326";
  axisOrder: "longitude,latitude";
  featureCount: number;
  bounds: { minLongitude: number; maxLongitude: number; minLatitude: number; maxLatitude: number };
  medianAreaError: number;
  maxAreaError: number;
}

export interface StationFootprintData {
  source: string;
  coordinateSystem: CoordinateSystemReport;
  footprints: StationFootprint[];
  unmatched: Array<{ objectId: number; sourceName: string | null; type: string; reason: string }>;
  stationsWithoutFootprint: string[];
}

/** Generous Singapore envelope; SVY21 metres or swapped axes fall far outside it. */
export const SINGAPORE_BOUNDS = { minLongitude: 103.55, maxLongitude: 104.1, minLatitude: 1.15, maxLatitude: 1.5 };
/** SHAPE_1.AREA was measured in SVY21 square metres; allow for projection scale. */
export const AREA_TOLERANCE = 0.01;
/** Unnamed or placeholder footprints only attach to a station this close. */
export const NEAREST_MATCH_MAX_METRES = 200;
/** A named footprint further than this from its station is rejected as a bad join. */
export const NAME_MATCH_MAX_METRES = 600;

// Planning-stage names and source typos, each checked against the station's
// position by the distance limit above.
export const NAME_ALIASES: Readonly<Record<string, string>> = {
  outram: "outram-park",
  kingabertpark: "king-albert-park",
  bedoktownpark: "bedok-north",
  kallangbahru: "geylang-bahru",
  rivervalley: "fort-canning",
};

// Names that describe a line or project rather than a station.
const PLACEHOLDER_NAMES = new Set(["thomsonline", "tsl", "nsle"]);

const EARTH_RADIUS_METRES = 6_371_008.8;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export function normaliseStationName(name: string | null | undefined): string {
  return (name ?? "")
    .replace(/\s*(interchange|rail station|mrt station|lrt station|station)\s*$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function distanceMetres([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(a));
}

// Local equirectangular projection: accurate to well under 0.1% at station scale.
function project(ring: LonLat[], originLatitude: number): Array<[number, number]> {
  const scale = Math.cos(toRadians(originLatitude));
  return ring.map(([lon, lat]) => [toRadians(lon) * EARTH_RADIUS_METRES * scale, toRadians(lat) * EARTH_RADIUS_METRES]);
}

function signedRingArea(points: Array<[number, number]>): number {
  let sum = 0;
  for (let i = 0; i < points.length - 1; i++) sum += points[i][0] * points[i + 1][1] - points[i + 1][0] * points[i][1];
  return sum / 2;
}

export function polygonAreaSquareMetres(polygon: LonLat[][]): number {
  const originLatitude = polygon[0][0][1];
  const [outer, ...holes] = polygon.map((ring) => Math.abs(signedRingArea(project(ring, originLatitude))));
  return outer - holes.reduce((total, hole) => total + hole, 0);
}

/** Area-weighted centroid of the outer ring. */
export function polygonCentroid(polygon: LonLat[][]): LonLat {
  const ring = polygon[0];
  let area = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    x += (x0 + x1) * cross;
    y += (y0 + y1) * cross;
  }
  if (area === 0) return ring[0];
  return [x / (3 * area), y / (3 * area)];
}

/**
 * The file declares no CRS. Confirm it is WGS84 longitude/latitude by checking
 * that every vertex lies in Singapore in that axis order, and that the area
 * recomputed from those degrees matches the SVY21 square-metre area recorded
 * in SHAPE_1.AREA. Throws when either check fails.
 */
export function assessCoordinateSystem(collection: RawFootprintCollection): CoordinateSystemReport {
  if (collection.crs != null) throw new Error("Footprint GeoJSON now declares a CRS; review it before rebuilding");
  const bounds = { minLongitude: Infinity, maxLongitude: -Infinity, minLatitude: Infinity, maxLatitude: -Infinity };
  const errors: number[] = [];
  for (const feature of collection.features) {
    if (feature.geometry?.type !== "Polygon") throw new Error(`OBJECTID ${feature.properties.OBJECTID}: expected Polygon geometry`);
    for (const ring of feature.geometry.coordinates) for (const [lon, lat] of ring) {
      if (lon < SINGAPORE_BOUNDS.minLongitude || lon > SINGAPORE_BOUNDS.maxLongitude || lat < SINGAPORE_BOUNDS.minLatitude || lat > SINGAPORE_BOUNDS.maxLatitude) {
        throw new Error(`OBJECTID ${feature.properties.OBJECTID}: [${lon}, ${lat}] is not a Singapore longitude/latitude`);
      }
      bounds.minLongitude = Math.min(bounds.minLongitude, lon);
      bounds.maxLongitude = Math.max(bounds.maxLongitude, lon);
      bounds.minLatitude = Math.min(bounds.minLatitude, lat);
      bounds.maxLatitude = Math.max(bounds.maxLatitude, lat);
    }
    const recorded = feature.properties["SHAPE_1.AREA"];
    const error = Math.abs(polygonAreaSquareMetres(feature.geometry.coordinates) - recorded) / recorded;
    if (!(error <= AREA_TOLERANCE)) throw new Error(`OBJECTID ${feature.properties.OBJECTID}: area differs from SHAPE_1.AREA by ${(error * 100).toFixed(2)}%`);
    errors.push(error);
  }
  errors.sort((a, b) => a - b);
  const round = (value: number) => Number(value.toFixed(6));
  return {
    declaredCrs: null,
    inferredCrs: "EPSG:4326",
    axisOrder: "longitude,latitude",
    featureCount: collection.features.length,
    bounds: {
      minLongitude: round(bounds.minLongitude), maxLongitude: round(bounds.maxLongitude),
      minLatitude: round(bounds.minLatitude), maxLatitude: round(bounds.maxLatitude),
    },
    medianAreaError: round(errors[Math.floor(errors.length / 2)]),
    maxAreaError: round(errors[errors.length - 1]),
  };
}

const roundCoordinate = ([lon, lat]: LonLat): LonLat => [Number(lon.toFixed(6)), Number(lat.toFixed(6))];

export function buildStationFootprints(collection: RawFootprintCollection, stations: readonly CanonicalStation[]): StationFootprintData {
  const coordinateSystem = assessCoordinateSystem(collection);
  const stationByName = new Map(stations.map((station) => [normaliseStationName(station.name), station]));
  const stationById = new Map(stations.map((station) => [station.id, station]));
  const footprints: StationFootprint[] = [];
  const unmatched: StationFootprintData["unmatched"] = [];

  for (const feature of collection.features) {
    const { OBJECTID: objectId, NAME: sourceName, TYPE: type, GRND_LEVEL: groundLevel } = feature.properties;
    const polygon = feature.geometry.coordinates;
    const centroid = polygonCentroid(polygon);
    const key = normaliseStationName(sourceName);
    const reject = (reason: string) => unmatched.push({ objectId, sourceName, type, reason });
    const nearest = () => stations.reduce<CanonicalStation | undefined>((best, candidate) =>
      !best || distanceMetres(centroid, [candidate.longitude, candidate.latitude]) < distanceMetres(centroid, [best.longitude, best.latitude]) ? candidate : best, undefined);

    let station: CanonicalStation | undefined;
    let match: FootprintMatch;
    let limit: number;
    if (stationByName.has(key)) {
      station = stationByName.get(key);
      match = "name";
      limit = NAME_MATCH_MAX_METRES;
    } else if (key in NAME_ALIASES) {
      station = stationById.get(NAME_ALIASES[key]);
      match = "alias";
      limit = NAME_MATCH_MAX_METRES;
    } else if (!key || PLACEHOLDER_NAMES.has(key)) {
      if (type === "LRT") { reject("unnamed LRT footprint; LRT-only stations are outside this dataset"); continue; }
      station = nearest();
      match = "nearest";
      limit = NEAREST_MATCH_MAX_METRES;
    } else {
      reject(type === "LRT" ? "LRT station not in stations.json" : "name not in stations.json");
      continue;
    }
    if (!station) { reject("alias points to an unknown station"); continue; }
    let distance = distanceMetres(centroid, [station.longitude, station.latitude]);
    if (distance > limit && match !== "nearest" && type !== "LRT") {
      // A label far from its namesake is usually a planning-stage name; trust
      // the position, but only when it sits right on another station.
      const named = station;
      station = nearest();
      match = "nearest";
      limit = NEAREST_MATCH_MAX_METRES;
      distance = station ? distanceMetres(centroid, [station.longitude, station.latitude]) : Infinity;
      if (!station || distance > limit) { reject(`${Math.round(distanceMetres(centroid, [named.longitude, named.latitude]))} m from ${named.id} and no station within ${limit} m`); continue; }
    }
    if (distance > limit) { reject(`nearest station ${station.id} is ${Math.round(distance)} m away (limit ${limit} m)`); continue; }
    footprints.push({
      objectId,
      stationId: station.id,
      sourceName,
      type,
      groundLevel,
      match,
      distanceMetres: Math.round(distance),
      centroid: roundCoordinate(centroid),
      polygon: polygon.map((ring) => ring.map(roundCoordinate)),
    });
  }

  footprints.sort((a, b) => a.stationId.localeCompare(b.stationId) || a.objectId - b.objectId);
  unmatched.sort((a, b) => a.objectId - b.objectId);
  const covered = new Set(footprints.map((footprint) => footprint.stationId));
  return {
    source: "URA Master Plan 2014 rail station footprints (AmendmenttoMP2014RailStation.geojson, supplied in the PS2 pack)",
    coordinateSystem,
    footprints,
    unmatched,
    stationsWithoutFootprint: stations.filter((station) => !covered.has(station.id)).map((station) => station.id).sort(),
  };
}
