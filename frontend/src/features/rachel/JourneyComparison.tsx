import type { ReactNode } from "react";
import { ArrowRight, Footprints, TrainFront, BusFront } from "lucide-react";
import type { JourneySnapshot } from "./contract";

export const clockLabel = (value: string) => new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
}).format(new Date(value));

export interface JourneyComparisonProps {
  snapshot: JourneySnapshot;
  selectedCandidateId: string | null;
  onSelectCandidate: (id: string) => void;
  /** Member 3 can supply JourneyMap here with the same candidates and selected ID. */
  map?: ReactNode;
}

export function JourneyComparison({ snapshot, selectedCandidateId, onSelectCandidate, map }: JourneyComparisonProps) {
  return (
    <section className="rachel-panel" aria-labelledby="journey-options-title" id="journey-options">
      <div className="rachel-section-heading"><h2 id="journey-options-title">Compare your journey</h2><ArrowRight size={20} aria-hidden="true" /></div>
      <p className="rachel-muted">Arrival includes the walks at both ends. All times are Singapore time.</p>
      {map}
      <div className="rachel-options">
        {snapshot.candidates.map((candidate) => {
          const recommended = candidate.id === snapshot.recommendation.recommendedCandidateId;
          const selected = candidate.id === selectedCandidateId;
          return (
            <article key={candidate.id} className={`rachel-option ${selected ? "is-selected" : ""}`}>
              <span className={`rachel-tag ${recommended ? "rachel-tag-green" : ""}`}>{recommended ? "Recommended" : "Usual route with current conditions"}</span>
              <h3>{candidate.label}</h3>
              <p><strong className="rachel-time">{clockLabel(candidate.arrivalAt)}</strong> estimated arrival</p>
              <p className="rachel-muted">Expected range {clockLabel(candidate.arrivalRange.earliest)}–{clockLabel(candidate.arrivalRange.latest)}</p>
              <p className="rachel-muted">{candidate.walkingMinutes} min walking · {candidate.transfers} transfers</p>
              <button className="rachel-button rachel-button-secondary" aria-pressed={selected} onClick={() => onSelectCandidate(candidate.id)}>
                {selected ? "Journey steps shown" : `View steps: ${candidate.label}`}
              </button>
              {selected && <ol className="rachel-steps" aria-label={`${candidate.label} steps`}>
                {candidate.steps.map((step, index) => {
                  const Icon = step.mode === "walk" ? Footprints : step.mode === "bus" ? BusFront : TrainFront;
                  return <li key={index}><Icon size={20} aria-hidden="true" /><div><strong>{step.mode === "walk" ? "Walk" : step.mode === "bus" ? "Bus" : "Train"}</strong><p>{step.instruction}</p></div></li>;
                })}
              </ol>}
            </article>
          );
        })}
      </div>
      {!map && <p className="rachel-muted rachel-map-note">Geographic route preview is not available in this version. {snapshot.mode === "demo" ? "These replay steps are illustrative, not navigation instructions." : "Check the supplied journey steps and source information."}</p>}
    </section>
  );
}
