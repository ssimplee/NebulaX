import { useCallback, useEffect, useRef, useState } from "react";
import { TransformContainer, type MapViewHandle } from "./TransformContainer";
import { SVGOverlay } from "./SVGOverlay";
import { CrowdLegend } from "./CrowdLegend";
import { CalibrationMode } from "./CalibrationMode";
import { NearestStationInfo } from "./NearestStationInfo";
import { LocationErrorCard } from "./LocationErrorCard";
import { useMapStore } from "@/store/mapStore";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useNetworkCrowd } from "@/features/map/useNetworkCrowd";
import { STATIONS } from "@/data/stations";
import type { MapStation } from "@/data/stations";
import type { StationCrowdData } from "./SVGOverlay";
import { useCurrentLocation } from "@/features/geolocation/useCurrentLocation";
import { findNearestStations } from "@/features/geolocation/geolocation.utils";
import type { NearestStation } from "@/features/geolocation/geolocation.types";

/**
 * Vertical offset for the floating location cards. The map fills the page and
 * MapPage puts the search bar at top-4, so cards start below it.
 */
const LOCATION_CARD_POSITION = "top-20";

export function MRTMapComponent() {
  const selectedStation = useMapStore((state) => state.selectedStation);
  const selectStation = useMapStore((state) => state.selectStation);
  const crowdLayerActive = useMapStore((state) => state.crowdLayerActive);
  const toggleCrowdLayer = useMapStore((state) => state.toggleCrowdLayer);
  const crowd = useNetworkCrowd(crowdLayerActive);
  const crowdData: StationCrowdData[] | undefined = crowdLayerActive && crowd.status === "ready" ? crowd.readings : undefined;
  const showStationLabels = useMapStore((state) => state.showStationLabels);
  const trainsRunning = useMapStore((state) => state.trainsRunning);
  const toggleTrains = useMapStore((state) => state.toggleTrains);
  const reducedMotion = usePrefersReducedMotion();
  const toggleStationLabels = useMapStore((state) => state.toggleStationLabels);

  const {
    location,
    status: locationStatus,
    error: locationError,
    requestLocation,
    clearLocation,
  } = useCurrentLocation();

  const [nearest, setNearest] = useState<NearestStation | null>(null);
  const mapViewRef = useRef<MapViewHandle | null>(null);

  const handleStationSelect = useCallback(
    (station: MapStation) => {
      // Toggle: deselect if already selected, otherwise select
      selectStation(
        selectedStation?.id === station.id ? null : station,
      );
    },
    [selectedStation, selectStation],
  );

  // Resolve each GPS fix to the closest station by real-world distance.
  // The map is schematic, so the raw fix has nowhere honest to be drawn —
  // the nearest station is the only thing we can point at.
  useEffect(() => {
    if (!location) {
      setNearest(null);
      return;
    }
    setNearest(findNearestStations(location, STATIONS, 1)[0] ?? null);
  }, [location]);

  // Centre on the result. Keyed on the object rather than the station id so a
  // refresh that lands on the same station still re-centres the map.
  useEffect(() => {
    if (!nearest) return;
    mapViewRef.current?.focusOnPoint(nearest.station.x, nearest.station.y);
  }, [nearest]);

  const handleViewDetails = useCallback(() => {
    if (nearest) selectStation(nearest.station);
  }, [nearest, selectStation]);

  return (
    <div className="relative h-full w-full min-h-0">
      <TransformContainer
        ref={mapViewRef}
        className="relative h-full w-full overflow-hidden bg-background"
        crowdLayerActive={crowdLayerActive}
        onToggleCrowd={toggleCrowdLayer}
        stationLabelsActive={showStationLabels}
        onToggleStationLabels={toggleStationLabels}
        trainsRunning={trainsRunning}
        onToggleTrains={toggleTrains}
        reducedMotion={reducedMotion}
        onLocateMe={requestLocation}
        isLocating={locationStatus === "requesting"}
      >
        <div
          className="relative w-[1600px] h-[1000px]"
        >
          <img src="/mrt/singapore-mrt-map.png" alt="Singapore MRT network map" className="absolute inset-0 h-full w-full select-none object-contain" draggable={false} />
          <SVGOverlay onStationSelect={handleStationSelect} selectedStationId={selectedStation?.id ?? null}
            crowdLayerActive={crowdLayerActive} crowdData={crowdData}
            nearestStationId={nearest?.station.id ?? null} showStationLabels={showStationLabels}
            showTrains={!reducedMotion} trainsRunning={trainsRunning} />
        </div>
      </TransformContainer>

      {/* Nearest station card — shown once a fix resolves to a station */}
      {nearest && location && (
        <NearestStationInfo
          className={LOCATION_CARD_POSITION}
          nearestStation={nearest}
          accuracy={location.accuracy}
          onRefresh={requestLocation}
          onViewDetails={handleViewDetails}
          onManualSelect={clearLocation}
          onDismiss={clearLocation}
        />
      )}

      {/* Failure feedback — denied, timed out, unsupported, outside Singapore */}
      {locationError && (
        <LocationErrorCard
          className={LOCATION_CARD_POSITION}
          message={locationError}
          onDismiss={clearLocation}
          onRetry={
            locationStatus === "unsupported" ? undefined : requestLocation
          }
        />
      )}

      {/* Bottom-left: what the moving trains are, and the crowd legend when shown */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-col items-start gap-2">
        {!reducedMotion && (
          <p className="flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-sm backdrop-blur-sm">
            <span className="relative flex size-2" aria-hidden="true">
              <span className={trainsRunning ? "absolute inline-flex size-full animate-ping rounded-full bg-primary/60 motion-reduce:animate-none" : "hidden"} />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            Illustrative train movement · not live
          </p>
        )}
        {crowdLayerActive && <CrowdLegend crowd={crowd} />}
      </div>

      {/* Dev-only calibration overlay */}
      <CalibrationMode />
    </div>
  );
}
