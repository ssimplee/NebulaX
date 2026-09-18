import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Hand } from "lucide-react";
import { resolveBasemap, type BasemapProvider } from "@/features/journey-map/basemap";
import { buildJourneyLayers } from "@/features/journey-map/journeyLayers";
import type { JourneyMapModel } from "@/features/journey-map/journeyMap.types";
import { useNow } from "@/hooks/useNow";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { drawJourneyLayers } from "./drawJourneyLayers";
import { JourneyMapLegend } from "./JourneyMapLegend";
import { JourneyMapStatus, type BasemapStatus } from "./JourneyMapStatus";

export interface JourneyMapProps {
  /** Everything to draw. The map never fetches operational data itself. */
  model: JourneyMapModel;
  /** Candidate to emphasise; defaults to the recommendation. */
  selectedCandidateId?: string | null;
  onSelectCandidate?: (candidateId: string) => void;
  onSelectStation?: (stationId: string) => void;
  /** Screen space covered by overlays outside this component, in pixels. */
  insets?: { top?: number; bottom?: number };
  /**
   * For a map inside a scrolling page: one-finger drags scroll the page until
   * the user explicitly unlocks the map.
   */
  cooperativeGestures?: boolean;
  /** Injectable for other providers or tests; defaults to configuration. */
  basemap?: BasemapProvider;
  className?: string;
}

const SINGAPORE_CENTRE: L.LatLngTuple = [1.3521, 103.8198];
const EDGE_PADDING = 24;

export function JourneyMap({
  model, selectedCandidateId, onSelectCandidate, onSelectStation, insets, cooperativeGestures = false, basemap, className,
}: JourneyMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const [mapError, setMapError] = useState(false);
  const [basemapStatus, setBasemapStatus] = useState<BasemapStatus>("loading");
  const [legendHeight, setLegendHeight] = useState(0);
  const [unlocked, setUnlocked] = useState(!cooperativeGestures);
  const provider = useMemo(() => basemap ?? resolveBasemap(), [basemap]);
  const layers = useMemo(() => buildJourneyLayers(model, selectedCandidateId), [model, selectedCandidateId]);
  const online = useOnlineStatus();
  const now = useNow();
  const topInset = insets?.top ?? 0;
  const bottomInset = (insets?.bottom ?? 0) + legendHeight;

  // Map lifecycle.
  useEffect(() => {
    if (!hostRef.current) return;
    let created: L.Map;
    try {
      created = L.map(hostRef.current, { zoomControl: false, attributionControl: false, zoomSnap: 0.25, minZoom: 10, maxZoom: 18 })
        .setView(SINGAPORE_CENTRE, 11);
    } catch {
      setMapError(true);
      return;
    }
    const observer = new ResizeObserver(() => created.invalidateSize(false));
    observer.observe(hostRef.current);
    setMap(created);
    return () => {
      observer.disconnect();
      created.remove();
      setMap(null);
    };
  }, []);

  // Background tiles.
  useEffect(() => {
    if (!map) return;
    let cancelled = false;
    let handle: { remove(): void } | null = null;
    setBasemapStatus("loading");
    provider.attach(map, {
      onLoad: () => { if (!cancelled) setBasemapStatus("ready"); },
      onError: () => { if (!cancelled) setBasemapStatus("error"); },
    }).then((attached) => {
      if (cancelled) attached.remove();
      else handle = attached;
    }).catch(() => { if (!cancelled) setBasemapStatus("error"); });
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, [map, provider]);

  // Gesture policy: cooperative maps stay still until unlocked.
  useEffect(() => {
    if (!map) return;
    for (const handler of [map.dragging, map.touchZoom, map.scrollWheelZoom]) {
      if (unlocked) handler.enable(); else handler.disable();
    }
  }, [map, unlocked]);

  // Keep the fit padding in step with the legend card.
  useEffect(() => {
    const legend = legendRef.current;
    if (!legend) return;
    const observer = new ResizeObserver(() => setLegendHeight(legend.offsetHeight));
    observer.observe(legend);
    setLegendHeight(legend.offsetHeight);
    return () => observer.disconnect();
  }, []);

  // Route drawing.
  useEffect(() => {
    if (!map) return;
    return drawJourneyLayers(map, layers, { onSelectCandidate, onSelectStation });
  }, [map, layers, onSelectCandidate, onSelectStation]);

  const fitRoute = useCallback(() => {
    if (!map || !layers.bounds) return;
    const [[west, south], [east, north]] = layers.bounds;
    map.fitBounds([[south, west], [north, east]], {
      paddingTopLeft: [EDGE_PADDING, topInset + EDGE_PADDING],
      paddingBottomRight: [EDGE_PADDING, bottomInset + EDGE_PADDING],
      maxZoom: 15,
      animate: false,
    });
  }, [map, layers.bounds, topInset, bottomInset]);

  // Refit when the route or the page's overlays change, and once the legend is
  // first measured. Not when the legend merely grows (opening the key): that
  // would throw away the commuter's own zoom and pan.
  const boundsKey = layers.bounds?.flat().join(",");
  const legendMeasured = legendHeight > 0;
  useEffect(fitRoute, [map, boundsKey, topInset, insets?.bottom, legendMeasured]);

  if (mapError) {
    return <div role="alert" className="flex h-full items-center justify-center p-6 text-center">The Journey Map could not start. Your route steps are still listed on the Route tab.</div>;
  }

  return (
    <div className={`relative h-full w-full overflow-hidden bg-slate-100 ${className ?? ""}`}>
      <div ref={hostRef} className="h-full w-full" role="region" aria-label="Journey Map: your routes on a street map" />

      <div className="pointer-events-none absolute inset-x-3 z-[500]" style={{ top: topInset + 8 }}>
        <JourneyMapStatus dataState={model.dataState} basemapStatus={basemapStatus} online={online} now={now} hasDrawableRoute={layers.lines.length > 0} />
      </div>

      {!unlocked && (
        <button type="button" onClick={() => setUnlocked(true)}
          className="absolute right-3 z-[500] flex min-h-11 items-center gap-1.5 rounded-full border bg-card px-3 text-sm font-semibold shadow-md focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ top: topInset + 44 }}>
          <Hand size={16} aria-hidden="true" /> Move map
        </button>
      )}
      {unlocked && cooperativeGestures && (
        <button type="button" onClick={() => setUnlocked(false)}
          className="absolute right-3 z-[500] min-h-11 rounded-full border bg-card px-3 text-sm font-semibold shadow-md focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ top: topInset + 44 }}>
          Done moving
        </button>
      )}

      <div className="pointer-events-none absolute inset-x-0 z-[600] md:inset-x-auto md:left-4 md:w-[26rem]" style={{ bottom: insets?.bottom ?? 0 }}>
        <JourneyMapLegend ref={legendRef} model={model} selectedCandidateId={layers.selectedCandidateId}
          onSelectCandidate={onSelectCandidate} onRecenter={fitRoute} attribution={provider.attribution} />
      </div>
    </div>
  );
}
