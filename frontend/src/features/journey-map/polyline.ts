import type { LonLat } from "./journeyMap.types";

/**
 * Decode an encoded polyline (the Google format OneMap's routing service
 * returns) into [longitude, latitude] pairs. Returns null for malformed input.
 */
export function decodePolyline(encoded: string, precision = 5): LonLat[] | null {
  const factor = 10 ** precision;
  const points: LonLat[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  const nextValue = (): number | null => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) return null;
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) return null;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    const dLat = nextValue();
    const dLon = nextValue();
    if (dLat == null || dLon == null) return null;
    latitude += dLat;
    longitude += dLon;
    points.push([longitude / factor, latitude / factor]);
  }
  return points;
}
