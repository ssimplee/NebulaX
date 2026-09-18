import { useCallback } from "react";
import { MRT_STATIONS } from "@/features/mrt-map/topology";
import { useJourneyMapModel } from "@/features/journey-map/useJourneyMapModel";
import { STATIONS } from "@/data/stations";
import { useMapStore } from "@/store/mapStore";
import { JourneyMap } from "./JourneyMap";

const mapStationById = new Map(STATIONS.map((station) => [station.id, station]));

interface Props {
  /** Pixels covered by the page's floating search and view controls. */
  topInset?: number;
}

/** Map-tab container: connects app state to the props-only JourneyMap. */
export function JourneyMapView({ topInset = 0 }: Props) {
  const { model, selectedCandidateId, selectCandidate } = useJourneyMapModel();
  const selectStation = useMapStore((state) => state.selectStation);
  const openStation = useCallback((stationId: string) => {
    const station = mapStationById.get(stationId);
    if (station && MRT_STATIONS.has(stationId)) selectStation(station);
  }, [selectStation]);

  return (
    <JourneyMap
      model={model}
      selectedCandidateId={selectedCandidateId}
      onSelectCandidate={selectCandidate}
      onSelectStation={openStation}
      insets={{ top: topInset }}
    />
  );
}
