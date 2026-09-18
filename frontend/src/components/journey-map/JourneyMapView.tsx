import { useCallback } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { MRT_STATIONS } from "@/features/mrt-map/topology";
import { useJourneyMapModel } from "@/features/journey-map/useJourneyMapModel";
import { STATIONS } from "@/data/stations";
import { useMapStore } from "@/store/mapStore";
import { JourneyFeedSelect } from "./JourneyFeedSelect";
import { JourneyMap } from "./JourneyMap";

const mapStationById = new Map(STATIONS.map((station) => [station.id, station]));

interface Props {
  /** Pixels covered by the page's floating search and view controls. */
  topInset?: number;
}

/** Map-tab container: connects app state and the journey services to the props-only JourneyMap. */
export function JourneyMapView({ topInset = 0 }: Props) {
  const { feed, chooseFeed, hasPlannedJourney, state } = useJourneyMapModel();
  const selectStation = useMapStore((store) => store.selectStation);
  const openStation = useCallback((stationId: string) => {
    const station = mapStationById.get(stationId);
    if (station && MRT_STATIONS.has(stationId)) selectStation(station);
  }, [selectStation]);

  const feedSelect = <JourneyFeedSelect feed={feed} onChange={chooseFeed} hasPlannedJourney={hasPlannedJourney} />;

  if (state.status !== "ready") {
    return (
      <div className="relative flex h-full w-full flex-col justify-end bg-slate-100" style={{ paddingTop: topInset }}>
        <div className="rounded-t-xl border border-b-0 bg-card p-3 shadow-lg md:mx-4 md:mb-4 md:w-[26rem] md:rounded-xl md:border-b">
          {feedSelect}
          {state.status === "loading" ? (
            <p role="status" className="mt-3 flex min-h-11 items-center gap-2 text-sm">
              <Loader2 size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              Loading the journey…
            </p>
          ) : (
            <div role="alert" className="mt-3 text-sm">
              <p className="flex items-start gap-2 font-semibold">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
                Live journey unavailable. {state.message}
              </p>
              <p className="mt-1 text-muted-foreground">No simulated data has been shown in its place.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={state.retry}
                  className="min-h-11 rounded-lg border px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">
                  Try again
                </button>
                <button type="button" onClick={() => chooseFeed("recorded")}
                  className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2">
                  Use recorded demo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <JourneyMap
      model={state.model}
      selectedCandidateId={state.selectedCandidateId}
      onSelectCandidate={state.selectCandidate}
      onSelectStation={openStation}
      insets={{ top: topInset }}
      legendHeader={feedSelect}
    />
  );
}
