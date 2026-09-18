import L from "leaflet";
import type { JourneyLayers, JourneyMarker } from "@/features/journey-map/journeyLayers";
import { strokesFor } from "@/features/journey-map/journeyStyles";
import type { LonLat } from "@/features/journey-map/journeyMap.types";

// Imperative Leaflet rendering of the pure JourneyLayers. Kept out of the React
// component so drawing and lifecycle can change independently.

export interface JourneyLayerHandlers {
  onSelectCandidate?: (candidateId: string) => void;
  onSelectStation?: (stationId: string) => void;
}

/** Footprints only help once the map is zoomed in to street level. */
export const FOOTPRINT_MIN_ZOOM = 15;
/** Below this zoom, short-walk labels and crowd words would collide; CSS hides them. */
export const DETAIL_MIN_ZOOM = 13.5;

const toLatLng = ([lon, lat]: LonLat): L.LatLngTuple => [lat, lon];

const MARKER_Z: Record<JourneyMarker["kind"], number> = {
  station: 100, leg: 200, "route-tag": 300, crowd: 400, origin: 500, destination: 500, disruption: 600,
};

const CROWD_BARS = { low: 1, moderate: 2, high: 3 } as const;

function chipElement(marker: JourneyMarker, interactive: boolean): HTMLElement {
  const chip = document.createElement(interactive ? "button" : "span");
  chip.className = [
    "jm-chip",
    `jm-chip--${marker.kind}`,
    marker.crowdLevel && `jm-chip--crowd-${marker.crowdLevel}`,
    marker.legMode && `jm-chip--leg-${marker.legMode}`,
    marker.short && "jm-chip--short",
  ].filter(Boolean).join(" ");
  if (interactive) {
    (chip as HTMLButtonElement).type = "button";
    chip.setAttribute("aria-label", marker.description);
  } else {
    chip.setAttribute("aria-hidden", "true");
  }
  if (marker.crowdLevel) {
    // Three bars filled 1/2/3: the level reads without colour or language.
    const bars = document.createElement("span");
    bars.className = "jm-bars";
    for (let i = 1; i <= 3; i++) {
      const bar = document.createElement("i");
      if (i <= CROWD_BARS[marker.crowdLevel]) bar.className = "is-on";
      bars.append(bar);
    }
    chip.append(bars);
  }
  const text = document.createElement("span");
  text.className = "jm-chip-text";
  text.textContent = marker.text;
  chip.append(text);
  return chip;
}

export function drawJourneyLayers(map: L.Map, layers: JourneyLayers, handlers: JourneyLayerHandlers): () => void {
  const group = L.layerGroup().addTo(map);
  const footprints = L.layerGroup();

  for (const footprint of layers.footprints) {
    L.polygon(footprint.polygon.map((ring) => ring.map(toLatLng)), {
      color: "#334155", weight: 1, fillColor: "#94a3b8", fillOpacity: 0.35, interactive: false,
    }).addTo(footprints);
  }
  const syncFootprints = () => {
    if (map.getZoom() >= FOOTPRINT_MIN_ZOOM) footprints.addTo(map);
    else footprints.remove();
    map.getContainer().classList.toggle("jm-far", map.getZoom() < DETAIL_MIN_ZOOM);
  };
  map.on("zoomend", syncFootprints);
  syncFootprints();

  for (const line of layers.lines) {
    const strokes = strokesFor(line);
    strokes.forEach((stroke, index) => {
      const top = index === strokes.length - 1;
      const polyline = L.polyline(line.path.map(toLatLng), { ...stroke, interactive: top }).addTo(group);
      if (!top) return;
      polyline.bindTooltip(line.description, { sticky: true });
      if (!line.selected && handlers.onSelectCandidate) polyline.on("click", () => handlers.onSelectCandidate!(line.candidateId));
    });
  }

  for (const marker of layers.markers) {
    const onActivate = marker.kind === "route-tag" && marker.candidateId && handlers.onSelectCandidate
      ? () => handlers.onSelectCandidate!(marker.candidateId!)
      : marker.kind === "station" && marker.stationId && handlers.onSelectStation
        ? () => handlers.onSelectStation!(marker.stationId!)
        : null;

    if (marker.kind === "station") {
      const dot = L.circleMarker(toLatLng(marker.position), {
        radius: 6, color: "#0f172a", weight: 3, fillColor: "#ffffff", fillOpacity: 1, interactive: Boolean(onActivate),
      }).addTo(group);
      dot.bindTooltip(marker.text, { direction: "top" });
      if (onActivate) dot.on("click", onActivate);
      continue;
    }

    const element = chipElement(marker, Boolean(onActivate));
    if (onActivate) element.addEventListener("click", (event) => { event.stopPropagation(); onActivate(); });
    L.marker(toLatLng(marker.position), {
      icon: L.divIcon({ className: "jm-chip-anchor", html: element, iconSize: undefined }),
      interactive: Boolean(onActivate),
      keyboard: false,
      zIndexOffset: MARKER_Z[marker.kind],
    }).addTo(group);
  }

  return () => {
    map.off("zoomend", syncFootprints);
    footprints.remove();
    group.remove();
  };
}
