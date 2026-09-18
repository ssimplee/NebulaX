import L from "leaflet";

/**
 * Where the Journey Map's background comes from. The map component depends on
 * this interface only, so a provider can be swapped by configuration (or a test
 * double) without touching drawing code.
 */
export interface BasemapProvider {
  id: string;
  /** Credits shown under the map. Always includes OpenStreetMap (ODbL requirement). */
  attribution: ReadonlyArray<{ label: string; href: string }>;
  attach(map: L.Map, events: BasemapEvents): Promise<BasemapHandle>;
}

export interface BasemapEvents {
  onLoad(): void;
  onError(): void;
}

export interface BasemapHandle {
  remove(): void;
}

export const OSM_ATTRIBUTION = { label: "© OpenStreetMap contributors", href: "https://www.openstreetmap.org/copyright" } as const;

/** The public OSM tile server forbids application traffic; never use it here. */
const FORBIDDEN_TILE_HOSTS = ["tile.openstreetmap.org"];

/** OpenFreeMap: OSM vector tiles, free public instance, no key or request limit. */
export const OPENFREEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export function vectorBasemap(styleUrl: string, credits: BasemapProvider["attribution"]): BasemapProvider {
  return {
    id: `vector:${styleUrl}`,
    attribution: [...credits, OSM_ATTRIBUTION],
    async attach(map, events) {
      // Loaded on demand: MapLibre is large and needs WebGL, which the
      // Network Map and tests never use.
      const [{ maplibreGL }] = await Promise.all([
        import("@maplibre/maplibre-gl-leaflet"),
        import("maplibre-gl/dist/maplibre-gl.css"),
      ]);
      const layer = maplibreGL({ style: styleUrl, attributionControl: false }).addTo(map);
      const gl = layer.getMaplibreMap();
      gl.on("load", events.onLoad);
      gl.on("error", events.onError);
      // A tile arriving after an error (for example back above ground) clears it.
      gl.on("sourcedata", (event) => { if (event.tile) events.onLoad(); });
      return { remove: () => layer.remove() };
    },
  };
}

export function rasterBasemap(template: string, credits: BasemapProvider["attribution"]): BasemapProvider {
  return {
    id: `raster:${template}`,
    attribution: [...credits, OSM_ATTRIBUTION],
    async attach(map, events) {
      const layer = L.tileLayer(template, { maxZoom: 19, minZoom: 9, crossOrigin: true });
      layer.on("tileload", events.onLoad);
      layer.on("tileerror", events.onError);
      layer.addTo(map);
      return { remove: () => layer.remove() };
    },
  };
}

/** No background at all: routes and stations still draw. Used by tests. */
export const noBasemap: BasemapProvider = {
  id: "none",
  attribution: [OSM_ATTRIBUTION],
  async attach(_map, events) {
    events.onLoad();
    return { remove() {} };
  },
};

interface BasemapEnv {
  /** "none" disables the background (tests, fully offline demos). */
  VITE_MAP_BASEMAP?: string;
  VITE_MAP_STYLE_URL?: string;
  VITE_MAP_TILE_URL?: string;
  VITE_MAP_ATTRIBUTION?: string;
  /** Legacy name for VITE_MAP_TILE_URL. */
  VITE_OSM_TILE_URL?: string;
}

const isForbidden = (url: string) => FORBIDDEN_TILE_HOSTS.some((host) => url.includes(host));

/**
 * Pick the basemap from configuration:
 *  1. VITE_MAP_STYLE_URL: a MapLibre vector style (self-hosted or keyed provider)
 *  2. VITE_MAP_TILE_URL: an OSM-based {z}/{x}/{y} raster template
 *  3. default: OpenFreeMap
 */
export function resolveBasemap(env: BasemapEnv = import.meta.env as BasemapEnv): BasemapProvider {
  if (env.VITE_MAP_BASEMAP === "none") return noBasemap;
  const credit = env.VITE_MAP_ATTRIBUTION ? [{ label: env.VITE_MAP_ATTRIBUTION, href: "" }] : [];
  if (env.VITE_MAP_STYLE_URL) return vectorBasemap(env.VITE_MAP_STYLE_URL, credit);
  const raster = env.VITE_MAP_TILE_URL || env.VITE_OSM_TILE_URL;
  if (raster && isForbidden(raster)) {
    console.warn("Ignoring the public OpenStreetMap tile server; its usage policy forbids application traffic.");
  } else if (raster) return rasterBasemap(raster, credit);
  return vectorBasemap(OPENFREEMAP_STYLE_URL, [
    { label: "OpenFreeMap", href: "https://openfreemap.org" },
    { label: "© OpenMapTiles", href: "https://www.openmaptiles.org/" },
  ]);
}
