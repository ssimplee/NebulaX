interface Props {
  view: "network" | "journey";
  onViewChange: (view: "network" | "journey") => void;
}

/** Switch between the schematic Network Map and the geographic Journey Map. */
export function MapViewToolbar({ view, onViewChange }: Props) {
  return <div className="absolute left-3 top-20 z-[700] text-xs md:left-4">
    <div role="group" aria-label="Map view" className="flex rounded-lg border bg-card p-1 shadow-md">
      {(["network", "journey"] as const).map((option) => <button key={option} type="button" onClick={() => onViewChange(option)}
        aria-pressed={view === option} className={`min-h-11 rounded-md px-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 ${view === option ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent"}`}>
        {option === "network" ? "Network Map" : "Journey Map"}
      </button>)}
    </div>
  </div>;
}
