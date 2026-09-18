import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { STATIONS, type MapStation } from "@/data/stations";
import { useRouteStore } from "@/store/routeStore";
import { useJourneyStore } from "@/store/journeyStore";
import { useMapStore } from "@/store/mapStore";
import { MRT_LINES, MRT_SEGMENTS, MRT_STATION_LIST, MRT_TOPOLOGY_ERRORS } from "@/features/mrt-map/topology";
import { routeSegmentIds, routeStationIds } from "@/features/mrt-map/routeAdapter";
import { pointAlongCoordinates, type SimulatedTrain } from "@/features/mrt-map/simulation";
import { useTrainSimulation } from "@/features/mrt-map/useTrainSimulation";

const stationById = new Map(STATIONS.map((station) => [station.id, station]));
const segmentByKey = new Map(MRT_SEGMENTS.map((segment) => [`${segment.branchId}:${segment.index}`, segment]));
const tileUrl = import.meta.env.VITE_OSM_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

interface Props {
  visibleLines: ReadonlySet<string>;
  paused: boolean;
}

export function GeographicJourneyMap({ visibleLines, paused }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const trainMarkers = useRef(new Map<string, L.Marker>());
  const [tileError, setTileError] = useState(false);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const selectedStation = useMapStore((state) => state.selectedStation);
  const selectStation = useMapStore((state) => state.selectStation);
  const highlightedRoute = useMapStore((state) => state.highlightedRoute);
  const activeRoute = useJourneyStore((state) => state.activeRoute);
  const plannedRoutes = useRouteStore((state) => state.lastResult?.routes);
  const selectedRouteIndex = useRouteStore((state) => state.selectedRouteIndex);
  const selectedIds = routeStationIds(activeRoute ?? plannedRoutes?.[selectedRouteIndex]);
  const selectedSegments = useMemo(() => routeSegmentIds(selectedIds.length ? selectedIds : highlightedRoute ?? []), [selectedIds.join("|"), highlightedRoute?.join("|")]);
  const originalSegments = useMemo(() => routeSegmentIds(selectedRouteIndex > 0 ? routeStationIds(plannedRoutes?.[0]) : []), [plannedRoutes, selectedRouteIndex]);

  useEffect(() => {
    if (!hostRef.current || MRT_TOPOLOGY_ERRORS.length) return;
    let map: L.Map | null = null;
    let resizeObserver: ResizeObserver | null = null;
    try {
      map = L.map(hostRef.current, { zoomControl: false, attributionControl: false });
      mapRef.current = map;
      const bounds = L.latLngBounds(MRT_STATION_LIST.map((station) => [station.latitude, station.longitude] as L.LatLngTuple));
      const initialJourneyStations = selectedIds.map((id) => MRT_STATION_LIST.find((station) => station.id === id)).filter((station) => station != null);
      const initialBounds = initialJourneyStations.length > 1
        ? L.latLngBounds(initialJourneyStations.map((station) => [station.latitude, station.longitude] as L.LatLngTuple)).pad(0.35)
        : bounds.pad(0.07);
      map.fitBounds(initialBounds, { animate: false, maxZoom: 13 });
      L.control.zoom({ position: "bottomright" }).addTo(map);
      if (import.meta.env.MODE !== "test") {
        const tiles = L.tileLayer(tileUrl, { maxZoom: 19, minZoom: 9, crossOrigin: true });
        tiles.on("tileerror", () => setTileError(true));
        tiles.on("tileload", () => setTileError(false));
        tiles.addTo(map);
      }
      let fittedToMeasuredSize = false;
      resizeObserver = new ResizeObserver((entries) => {
        const size = entries[0]?.contentRect;
        if (!size?.width || !size?.height || !map) return;
        map.invalidateSize(false);
        if (!fittedToMeasuredSize) {
          map.fitBounds(initialBounds, { animate: false, maxZoom: 13 });
          fittedToMeasuredSize = true;
        }
      });
      resizeObserver.observe(hostRef.current);
      setReady(true);
    } catch {
      setMapError("The geographic map could not start. The Network Map is still available.");
    }
    return () => {
      resizeObserver?.disconnect();
      trainMarkers.current.clear();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const layer = L.layerGroup().addTo(map);
    for (const segment of MRT_SEGMENTS) {
      if (!visibleLines.has(segment.lineId)) continue;
      const points = segment.geographicCoordinates.map(([longitude, latitude]) => [latitude, longitude] as L.LatLngTuple);
      L.polyline(points, { color: MRT_LINES.find((line) => line.id === segment.lineId)?.color, weight: 3, opacity: 0.75, interactive: false }).addTo(layer);
      if (originalSegments.has(segment.id)) L.polyline(points, { color: "#111827", weight: 7, dashArray: "6 8", opacity: 0.9, interactive: false }).addTo(layer);
      if (selectedSegments.has(segment.id)) {
        L.polyline(points, { color: "#ffffff", weight: 11, opacity: 0.95, interactive: false }).addTo(layer);
        L.polyline(points, { color: MRT_LINES.find((line) => line.id === segment.lineId)?.color, weight: 7, opacity: 1, interactive: false }).addTo(layer);
      }
    }
    for (const station of MRT_STATION_LIST) {
      if (!station.lines.some((line) => visibleLines.has(line))) continue;
      const target = stationById.get(station.id);
      if (!target) continue;
      const marker = L.circleMarker([station.latitude, station.longitude], {
        radius: station.is_interchange ? 7 : 5,
        color: station.id === selectedStation?.id ? "#1d4ed8" : "#111827",
        weight: station.id === selectedStation?.id ? 4 : 2,
        fillColor: station.is_interchange ? "#ffffff" : MRT_LINES.find((line) => line.id === station.lines.find((id) => visibleLines.has(id)))?.color,
        fillOpacity: 1,
      }).addTo(layer);
      marker.bindTooltip(`${station.name} · ${station.codes.join(" / ")}`, { direction: "top" });
      marker.on("click", () => selectStation(target));
      const element = marker.getElement();
      if (element) {
        element.setAttribute("tabindex", "0");
        element.setAttribute("role", "button");
        element.setAttribute("aria-label", `${station.name} MRT station`);
        element.addEventListener("keydown", (event) => {
          const key = (event as KeyboardEvent).key;
          if (key === "Enter" || key === " ") {
            event.preventDefault();
            selectStation(target);
          }
        });
      }
    }
    return () => { layer.remove(); };
  }, [ready, visibleLines, selectedStation?.id, selectedSegments, originalSegments, selectStation]);

  useEffect(() => {
    const map = mapRef.current;
    const stations = selectedIds.map((id) => MRT_STATION_LIST.find((station) => station.id === id)).filter((station) => station != null);
    if (!map || !ready || stations.length < 2) return;
    map.fitBounds(L.latLngBounds(stations.map((station) => [station.latitude, station.longitude] as L.LatLngTuple)).pad(0.35), { animate: false, maxZoom: 13 });
  }, [ready, selectedIds.join("|")]);

  const renderTrains = useCallback((trains: readonly SimulatedTrain[]) => {
    const map = mapRef.current;
    if (!map) return;
    for (const train of trains) {
      const segment = segmentByKey.get(`${train.branchId}:${train.segmentIndex}`);
      if (!segment) continue;
      const current = trainMarkers.current.get(train.id);
      if (!visibleLines.has(train.lineId)) {
        if (current) { current.remove(); trainMarkers.current.delete(train.id); }
        continue;
      }
      const [longitude, latitude] = pointAlongCoordinates(segment.geographicCoordinates, train.segmentProgress);
      if (current) current.setLatLng([latitude, longitude]);
      else {
        const marker = L.marker([latitude, longitude], {
          interactive: false,
          icon: L.divIcon({ className: "mrt-train-marker", html: `<span aria-hidden="true" style="--train-color:${MRT_LINES.find((line) => line.id === train.lineId)?.color}">▲</span>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
        }).addTo(map);
        trainMarkers.current.set(train.id, marker);
      }
      const node = trainMarkers.current.get(train.id)?.getElement()?.firstElementChild as HTMLElement | null;
      if (node) {
        const coordinates = segment.geographicCoordinates;
        const first = coordinates[0];
        const last = coordinates[coordinates.length - 1];
        const bearing = Math.atan2((last[0] - first[0]) * Math.cos(latitude * Math.PI / 180), last[1] - first[1]) * 180 / Math.PI;
        node.style.transform = `rotate(${bearing + (train.direction === "reverse" ? 180 : 0)}deg)`;
      }
    }
  }, [visibleLines]);
  useTrainSimulation(paused || !ready, renderTrains);

  if (MRT_TOPOLOGY_ERRORS.length) return <div role="alert" className="flex h-full items-center justify-center p-6">Map data could not be validated. Try the classic Network Map.</div>;
  if (mapError) return <div role="alert" className="flex h-full items-center justify-center p-6">{mapError}</div>;
  return <div className="relative h-full w-full bg-slate-100">
    <div ref={hostRef} className="h-full w-full" aria-label="Geographic Journey Map of Singapore MRT stations" />
    {!ready && <div role="status" className="absolute inset-0 flex items-center justify-center bg-card/80">Loading Journey Map…</div>}
    {tileError && <div role="alert" className="absolute bottom-9 left-3 right-14 z-[500] rounded-md border bg-card p-2 text-xs shadow">Map tiles are unavailable. Station positions and route lines remain usable; check your connection.</div>}
    <div className="absolute bottom-1 left-2 z-[500] rounded bg-white/95 px-1.5 py-0.5 text-[10px] text-slate-900">
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">© OpenStreetMap contributors</a>
    </div>
  </div>;
}
