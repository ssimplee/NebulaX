import { MRT_LINES } from "@/features/mrt-map/topology";

interface Props {
  view: "network" | "journey";
  onViewChange: (view: "network" | "journey") => void;
  visibleLines: ReadonlySet<string>;
  onToggleLine: (lineId: string) => void;
  paused: boolean;
  onTogglePause: () => void;
  reducedMotion: boolean;
  hasSelectedRoute: boolean;
  hasOriginalRoute: boolean;
  routeFreshness?: string | null;
}

export function MapViewToolbar({ view, onViewChange, visibleLines, onToggleLine, paused, onTogglePause, reducedMotion, hasSelectedRoute, hasOriginalRoute, routeFreshness }: Props) {
  return <div className="absolute left-3 right-3 top-20 z-[600] flex flex-wrap items-start gap-2 text-xs md:left-4">
    <div role="group" aria-label="Map view" className="flex rounded-lg border bg-card p-1 shadow-md">
      {(["network", "journey"] as const).map((option) => <button key={option} type="button" onClick={() => onViewChange(option)}
        aria-pressed={view === option} className={`min-h-10 rounded-md px-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 ${view === option ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent"}`}>
        {option === "network" ? "Network" : "Journey"}
      </button>)}
    </div>
    {view === "journey" && <><div className="flex items-center gap-2 rounded-lg border bg-card px-2 py-1 shadow-md">
      <span className="font-semibold text-foreground">Train movement · Demo</span>
      <button type="button" onClick={onTogglePause} disabled={reducedMotion}
        className="min-h-10 rounded-md border px-3 font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
        aria-label={paused ? "Resume simulated trains" : "Pause simulated trains"}>
        {reducedMotion ? "Still" : paused ? "Resume" : "Pause"}
      </button>
    </div>
    <details className="max-w-full rounded-lg border bg-card p-2 shadow-md">
      <summary className="min-h-8 cursor-pointer font-semibold text-foreground">Lines & legend</summary>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {MRT_LINES.map((line) => <label key={line.id} className="flex min-h-9 items-center gap-2 whitespace-nowrap text-foreground">
          <input type="checkbox" checked={visibleLines.has(line.id)} onChange={() => onToggleLine(line.id)} aria-label={`${line.name} line`} />
          <span className="h-1 w-5 rounded" style={{ backgroundColor: line.color }} aria-hidden="true" />
          {line.id}
        </label>)}
      </div>
      <p className="mt-2 text-muted-foreground">Hollow station = interchange. Arrow in train dot = travel direction.</p>
      {hasSelectedRoute && <p className="mt-1 text-muted-foreground">Thick solid line = selected journey.</p>}
      {hasOriginalRoute && <p className="mt-1 text-muted-foreground">Black dashed line = original route.</p>}
      <p className="mt-1 text-muted-foreground">Lines join station coordinates and approximate geography; they are not surveyed tracks.</p>
      {routeFreshness && <p className="mt-1 text-muted-foreground">Route data: {routeFreshness}</p>}
    </details>
    <span role="status" className="sr-only">Train movement {reducedMotion ? "is still because reduced motion is enabled" : paused ? "paused" : "running as a demo"}.</span></>}
  </div>;
}
