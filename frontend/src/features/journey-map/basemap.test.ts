import { OPENFREEMAP_STYLE_URL, OSM_ATTRIBUTION, resolveBasemap } from "./basemap";

describe("resolveBasemap", () => {
  it("defaults to OpenFreeMap with OpenStreetMap attribution", () => {
    const provider = resolveBasemap({});
    expect(provider.id).toBe(`vector:${OPENFREEMAP_STYLE_URL}`);
    expect(provider.attribution).toContainEqual(OSM_ATTRIBUTION);
  });

  it("refuses the public OpenStreetMap tile server", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const url of ["https://tile.openstreetmap.org/{z}/{x}/{y}.png", "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"]) {
      expect(resolveBasemap({ VITE_MAP_TILE_URL: url }).id).toBe(`vector:${OPENFREEMAP_STYLE_URL}`);
      expect(resolveBasemap({ VITE_OSM_TILE_URL: url }).id).toBe(`vector:${OPENFREEMAP_STYLE_URL}`);
    }
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("uses a configured provider and always keeps OpenStreetMap attribution", () => {
    const vector = resolveBasemap({ VITE_MAP_STYLE_URL: "https://maps.example/style.json", VITE_MAP_ATTRIBUTION: "Example Maps" });
    expect(vector.id).toBe("vector:https://maps.example/style.json");
    expect(vector.attribution.map((credit) => credit.label)).toEqual(["Example Maps", OSM_ATTRIBUTION.label]);
    const raster = resolveBasemap({ VITE_MAP_TILE_URL: "https://tiles.example/{z}/{x}/{y}.png" });
    expect(raster.id).toBe("raster:https://tiles.example/{z}/{x}/{y}.png");
    expect(raster.attribution).toContainEqual(OSM_ATTRIBUTION);
  });

  it("can disable the street map for tests and offline demos", () => {
    expect(resolveBasemap({ VITE_MAP_BASEMAP: "none" }).id).toBe("none");
  });
});
