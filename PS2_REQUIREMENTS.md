# Nebula X PS2 — Verified Requirements and Build Plan

This checklist is verified against
`Problem_Statement_2_Specification.docx` in this repository. When this file and
the official specification differ, the official specification wins.

Labels used in this file:

- **Official requirement** — explicitly required by the PS2 specification.
- **Rachel decision** — this team's chosen focus or implementation approach.
- **Optional enhancement** — useful only after the mandatory flow works.

## The mandate

Build a **mobile-first commuter web app** that provides **proactive decision
support** during **planned and unplanned events**, tailored to a specific
commuter.

The app must reach the commuter before the problem where possible, recommend
an action rather than merely display an alert, handle scheduled and unexpected
events, and tailor its recommendation to the selected commuter.

## Selected primary persona: Rachel

This project will focus on **Rachel**, the fixed-schedule commuter. The reason
is that her journey gives us the clearest demonstration of the PS2 mandate:
the app should remain quiet on a normal day, detect when a disruption threatens
her 08:45 arrival deadline, and proactively recommend one useful action.

| Persona | Journey | Decision needs |
|---|---|---|
| Rachel — fixed schedule | Tampines to Raffles Place; leaves 07:40 and must be at her desk by 08:45 | Ignore minor noise, interrupt her when the impact matters, and give a one-line action when a delay threatens her meeting |
| Arjun — multimodal, flexible start | Punggol to one-north; cycles to the LRT and sometimes takes a bus for the whole journey | Prefer comfort and predictability; consider crowding, sheltered routes, cycling and whether a bicycle can be brought |
| Mdm Lim — accessibility constrained | Bedok to Singapore General Hospital for a fortnightly appointment | Door-to-door step-free route, working lifts, sheltered walking, large text, advance planning and a day-before warning |

- [x] Select Rachel as the primary persona and explain why.
- [ ] Confirm the normal door-to-door route from Rachel's home/origin point in
      Tampines to her workplace/destination point at Raffles Place.
- [ ] Define the exact EWL disruption used in the demo.
- [ ] Define the expected original route and revised recommendation.
- [ ] Define and document the team's behaviour for impacts between the two
      official examples: 5 minutes is noise; 15 minutes is material.

Rachel's fixed facts for the demo are:

- Journey: Tampines to Raffles Place
- Normal line: East West Line
- Normal departure: 07:40
- Required arrival: by 08:45
- Five-minute delay: noise; do not interrupt her
- Fifteen-minute delay: material because it risks her meeting
- Product behaviour: notify only when the impact matters and lead with a
  one-line action

The app may retain the other personas as future extensions, but P0 decisions,
ranking, notifications and UX must be evaluated against Rachel first.

## Three mandatory capabilities

A submission missing any one of these is incomplete.

### 1. Route planning

- [ ] Accept an origin, destination and time.
- [ ] Produce an actual route a commuter can follow.
- [ ] Recalculate when conditions change.
- [ ] Route door-to-door, including walking legs at both ends.
- [ ] Support the modes needed by the selected persona.
- [ ] Let disruption, crowding or heavy rain change the recommendation.
- [ ] Explain why the recommendation changed.
- [ ] Show realistic timing and visible uncertainty.

Arjun specifically requires rail, bus, walking and cycling. The other personas
do not automatically require cycling, but still require door-to-door routing.

### 2. GIS on OpenStreetMap

**OpenStreetMap is the required geospatial base.** OneMap may supplement it,
but must not replace it as the base required by the brief.

- [ ] Render the geographic Journey Map using OSM data.
- [ ] Display `© OpenStreetMap contributors` wherever the map or derived OSM
      data appears.
- [ ] Do not use the public OSM tile server for heavy application traffic.
- [ ] Use a suitable tile provider, self-hosted tiles, or a static extract.
- [ ] Cache Overpass results rather than repeatedly querying the public API.
- [ ] Add authoritative LTA layers on top where useful.

Recommended choices:

- Renderer: MapLibre GL JS or Leaflet
- Routing: Valhalla, GraphHopper or OSRM
- Bulk OSM data: Geofabrik Singapore/Malaysia/Brunei extract
- Targeted OSM data: Overpass API during ingestion, with caching

### 3. Visualisation

- [ ] Show the route on the geographic map.
- [ ] Distinguish affected and unaffected route portions.
- [ ] Show the alternative against the original.
- [ ] Show crowding with an immediate three-level scale.
- [ ] Make time and delay trade-offs obvious.
- [ ] Do not rely on colour alone.
- [ ] Use readable type, sufficient contrast and real mobile touch targets.
- [ ] Test in a real phone browser, one-handed and in motion.

## Map decision for this repository

Keep the current schematic Singapore MRT map as an optional **Network Map**.
It is useful for network overview and station selection, but it does **not**
satisfy the mandatory OpenStreetMap GIS capability.

Add a geographic **Journey Map** as the primary decision view. It should show:

- Full door-to-door route
- Walking and, where applicable, cycling legs
- Rail and bus legs
- Actual station/stop coordinates
- Disrupted segment
- Original and recommended alternatives
- Crowd state and weather-exposed or sheltered portions where relevant

The supplied `AmendmenttoMP2014RailStation.geojson` contains 208 station
footprint polygons, not station points. Its `TYPE` field only distinguishes
MRT/LRT/CCL, it does not provide complete line codes, and its CRS must be
confirmed before joining it to other data.

## Required decision flow

1. Load the selected persona, journey, arrival requirement and preferences.
2. Plan the normal door-to-door journey.
3. Inject or replay a clearly labelled planned or unplanned event.
4. Determine whether and how it affects this commuter.
5. Recalculate alternatives using current operational conditions.
6. Rank alternatives for the selected persona.
7. Proactively present one recommended action.
8. Compare it with the original route and explain the trade-off.
9. Display sources, timestamps, uncertainty and simulated-data labels.

An alert banner without a changed recommendation does not meet the mandate.

## API and data plan

### LTA DataMall

Register for a free `AccountKey`, keep it in the backend environment, and
handle `$skip` pagination in batches of 500 where applicable.

Base URL: `https://datamall2.mytransport.sg/ltaodataservice`

| Need | Endpoint/data | Use |
|---|---|---|
| Official train disruption | `TrainServiceAlerts` | Primary feed; parse `AffectedSegments` separately from the `Message` list |
| Bus ETA/load/accessibility | `v3/BusArrival` | Live bus alternatives, crowd/load and wheelchair-accessible bus information |
| Bus graph | `BusStops`, `BusRoutes`, `BusServices` | Stops, route sequence, operating times and frequency |
| Live platform crowding | `PCDRealTime` | Current three-level station crowd signal |
| Forecast crowding | `PCDForecast` | Future crowd signal for proactive recommendations |
| Lift outages | `v2/FacilitiesMaintenance` | Accessibility routing and advance warnings |
| Historical rail demand | `PV/Train` | Monthly baseline only; never present as live crowding |
| Station access | `TrainStationExit`, `CoveredLinkWay`, `CyclingPath` geospatial layers | Authoritative access and shelter overlays |
| Structured disruption updates | `GTFSRealtimeTrainTripUpdates`, if available | Supplement the main feed after validating its schema |

Important rules:

- Maintain explicit mappings because line codes differ between endpoints.
- Platform real-time crowding, platform forecast crowding and bus load are
  separate signals. Never present them as one interchangeable measurement.
- `/PV/Train` uses `YYYYMM` and returns a temporary previous-month data file.
- Label derived train times as estimated unless a supplied source proves they
  are live platform countdowns.

### OpenStreetMap and routing

Use OSM for footways, crossings, stairs, lifts, covered walkways, cycle paths
and door-to-door access legs.

Valhalla or GraphHopper is preferable when multimodal or accessibility costing
is central. OSRM is suitable for simpler walking/cycling calculations but does
not provide the whole public-transport decision engine by itself.

### OneMap

OneMap is allowed alongside OSM for address search, reverse geocoding and
routing support. Keep credentials in the backend. It is supplementary; the
visible GIS base still needs to satisfy the OSM requirement.

### Weather

Use the keyless data.gov.sg weather APIs:

- 2-hour nowcast:
  `https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast`
- 24-hour forecast:
  `https://api-open.data.gov.sg/v2/real-time/api/twenty-four-hr-forecast`
- 4-day outlook:
  `https://api-open.data.gov.sg/v2/real-time/api/four-day-outlook`
- Rainfall observations:
  `https://api-open.data.gov.sg/v2/real-time/api/rainfall`

For Rachel's immediate commute, prioritise the 2-hour nowcast and rainfall
observations. Use the 24-hour forecast for advance advice. The four-day outlook
is lower priority. Heavy rain must affect the recommendation only when it
changes Rachel's walking time, transfer risk, or ability to arrive by 08:45.

### Planned and replayed events

`TrainServiceAlerts` is normally quiet. The specification permits a replayed
or injected major disruption during judging when it is labelled as such. The
app must support both planned events and unplanned disruptions, even though the
final demo only needs to walk through one disruption end to end.

```json
{
  "id": "demo-disruption-1",
  "kind": "unplanned_disruption",
  "affectedLines": ["EW"],
  "affectedStationIds": ["station-id"],
  "validFrom": "ISO-8601 timestamp",
  "validTo": "ISO-8601 timestamp",
  "message": "Scenario description",
  "source": "replayed-demo",
  "sourceType": "simulated"
}
```

## Context passed to the recommendation or AI layer

AI is optional. Routing and disruption impact must work deterministically
without an LLM. If AI explains or ranks recommendations, provide structured,
source-backed context rather than asking it to guess.

Any AI feature shown to judges must be demonstrably useful and measurable. A
judge must be able to verify the feature without paying for a model/API call.

```json
{
  "persona": {
    "id": "rachel",
    "mobilityNeeds": [],
    "priorities": [
      "arrive-by-08:45",
      "avoid-unnecessary-interruptions",
      "receive-one-clear-action"
    ],
    "officialDelayExamples": {
      "fiveMinutes": "noise",
      "fifteenMinutes": "material"
    }
  },
  "journey": {
    "origin": {},
    "destination": {},
    "departAt": null,
    "arriveBy": null,
    "currentLeg": null
  },
  "conditions": {
    "serviceAlerts": [],
    "crowdReadings": [],
    "weather": {},
    "facilityOutages": [],
    "observedAt": "ISO-8601 timestamp"
  },
  "candidates": [],
  "dataQuality": {
    "staleSources": [],
    "simulatedSources": [],
    "uncertainties": []
  }
}
```

Prompt rules:

- Recommend only from provided candidate routes.
- Never invent an API result, route, ETA, outage or crowd level.
- State why the recommendation fits the selected persona.
- Lead with one concise, action-oriented sentence and its delay/time trade-off.
- Mention uncertainty and stale or simulated data plainly.
- Never describe estimated, historical, forecast or simulated data as live.
- Do not interrupt when impact is below the persona's threshold.
- Return structured JSON so the UI does not parse uncontrolled prose.
- Fall back to deterministic ranking when the model is unavailable.

Rachel-specific response contract:

```json
{
  "shouldNotify": true,
  "action": "Action generated from the selected candidate route.",
  "reason": "The disruption puts Rachel's 08:45 arrival at risk.",
  "originalArrival": "HH:MM",
  "recommendedArrival": "HH:MM",
  "delayMinutesAvoided": 0,
  "confidence": 0.0,
  "sourceIds": ["alert-id", "route-candidate-id"],
  "warnings": []
}
```

For the official boundary examples, a 5-minute impact returns
`shouldNotify: false`, while a 15-minute impact that threatens the 08:45
arrival returns `shouldNotify: true`. Behaviour between those values is a team
decision and must be documented as such, not presented as an official fact.

## Privacy and operational requirements

- [ ] Document what routine/location data is stored, where and for how long.
- [ ] Do not collect personal data without permission.
- [ ] Never commit credentials; use ignored environment files.
- [ ] Use lawfully obtainable data and document every source.
- [ ] Cache the active journey for underground/no-signal operation.
- [ ] Show stale state honestly while offline.
- [ ] Make clean-machine setup reproducible without payment.

## Prioritised implementation checklist

### P0 — mandatory submission path

- [x] Select Rachel as the primary persona.
- [ ] Finalise Rachel's exact door-to-door endpoints and demo journey.
- [ ] Add OSM geographic Journey Map with attribution.
- [ ] Keep the schematic map as a secondary Network Map.
- [ ] Import and validate the supplied station GeoJSON and its CRS.
- [ ] Add door-to-door access legs.
- [ ] Ingest `TrainServiceAlerts` and normalise identifiers.
- [ ] Make affected graph edges unavailable or more costly.
- [ ] Implement real disruption-aware recalculation.
- [ ] Add the travel modes required by the selected persona.
- [ ] Add weather and crowd signals that change recommendations.
- [ ] Show original versus alternative route, ETA, delay and uncertainty.
- [ ] Create labelled deterministic fixtures for one planned event and one
      unplanned disruption; use one disruption for the final demo.
- [ ] Implement Rachel's saved routine and meaningful-interruption behaviour
      as part of the proactive experience.
- [ ] Verify the full flow on a real phone.
- [ ] Rewrite README for clean-machine setup and the selected persona.

### P1 — high-value improvements

- [ ] In-app proactive notification inbox
- [ ] Web push if reliable within hackathon time
- [ ] Live lift maintenance and step-free routing
- [ ] Cached offline journey and last-known operational state
- [ ] Source/freshness/confidence metadata for operational data
- [ ] Measured evaluation of any AI ranking or extraction feature

### P2 — only after the mandatory flow works

- [ ] Community report reputation and image moderation
- [ ] General AI chat beyond the selected journey
- [ ] Broad profile statistics
- [ ] Additional animations and nonessential visual polish

## Four-person parallel delivery backlog

The team should first agree on the shared contracts below, then work in four
parallel streams. Each stream owns different directories to reduce merge
conflicts. Work through the backlog from top to bottom within each stream.

### Shared contract freeze — whole team, first 60–90 minutes

- [ ] Agree on Rachel's exact door-to-door origin and destination coordinates.
- [ ] Agree on the unplanned disruption replay: affected EWL segment, start
      time, expected delay and expected recommendation.
- [ ] Agree on one planned-event fixture, such as scheduled works or an early
      closure, and its expected recommendation.
- [ ] Freeze TypeScript/Python shapes for `JourneyRequest`, `RouteCandidate`,
      `OperationalConditions`, `Recommendation` and `DataProvenance`.
- [ ] Add checked-in planned/unplanned fixtures and expected result fixtures.
- [ ] Assign one integration owner for final merges; do not let every member
      independently change shared schemas.
- [ ] Agree on branch names: `feature/rachel-data`, `feature/rachel-routing`,
      `feature/rachel-map`, and `feature/rachel-experience`.

### Member 1 — Data and disruption ingestion

Primary ownership: `backend/app/integrations/`, new ingestion scripts, and
operational-data tests.

#### P0 tasks

- [x] Correct and harden `TrainServiceAlerts` ingestion.
- [x] Normalise LTA line codes, station codes, direction and affected segments.
- [x] Create labelled Rachel fixtures for an EWL disruption and a planned
      service change.
- [x] Implement `PCDRealTime` and `PCDForecast` adapters.
- [x] Integrate data.gov.sg weather forecasts.
- [x] Emit consistent source type, timestamps, staleness and simulated flags.
- [x] Provide one aggregated `OperationalConditions` service for Member 2.
- [x] Add contract tests using recorded fixtures; tests must not require a live
      API or secret.

Current verification (18 September 2026): the LTA AccountKey successfully
returned and normalised 32 EWL crowd readings, the backend loads
`backend/.env` from either the repository root or backend directory, and all
266 backend tests pass. Live-provider failures are not
replaced with simulated alerts, and operational records now carry source type,
fetch time and staleness state for the aggregated quality summary.

#### P1 tasks

- [x] Add bus stop, route, service and Bus Arrival v3 ingestion.
- [x] Add retry, caching, pagination and provider-health status.
- [x] Add lift-maintenance ingestion if time remains.

Bus reference endpoints use `$skip` pagination, retry transient HTTP failures
and cache slow-changing topology for six hours. Bus Arrival v3 is cached for
15 seconds. Operational sources expose provider health, use source-appropriate
TTL caches, and return explicitly stale last-known data when a refresh fails.
Live verification returned 22 services at Tampines Bus Interchange (`75009`)
and four current facilities-maintenance records.

#### Handoff

Deliver a documented function/API that accepts the journey time and returns
normalised alerts, crowd and weather conditions without UI-specific fields.

### Member 2 — Door-to-door routing and Rachel decision engine

Primary ownership: `backend/app/services/`, route schemas/endpoints and backend
routing tests.

#### P0 tasks

- [ ] Extend the route request from station-to-station to door-to-door points.
- [ ] Integrate an OSM routing engine or adapter for walking access legs.
- [ ] Make affected rail edges unavailable or apply disruption delay costs.
- [ ] Replace the pass-through `/routes/recalculate` behaviour with genuine
      condition-aware recalculation.
- [ ] Produce the original route plus at least one viable alternative.
- [ ] Calculate ETA ranges and expose uncertainty.
- [ ] Implement deterministic Rachel ranking: protect the 08:45 arrival first,
      then minimise transfers/walking among routes that arrive on time.
- [ ] Implement the official boundary examples: 5-minute impact stays quiet;
      15-minute impact produces a recommendation. Document behaviour between
      those values as a product decision.
- [ ] Return `shouldNotify`, action, reason, original/recommended arrivals,
      trade-offs and provenance IDs.
- [ ] Add unit and scenario tests proving 5 minutes stays quiet and 15 minutes
      produces a recommendation.

#### P1 tasks

- [ ] Add normal bus alternatives once Member 1 exposes bus data.
- [ ] Add historical calibration and better confidence scoring.

#### Handoff

Deliver stable `/routes/plan`, `/routes/recalculate`, and journey-impact
responses matching the frozen shared contracts. The decision must work without
an LLM.

### Member 3 — OSM Journey Map and route visualisation

Primary ownership: new geographic-map components, map data transforms and
frontend map tests. Avoid editing the existing schematic map except to add the
view switch.

#### P0 tasks

- [ ] Add MapLibre GL JS or Leaflet with an approved OSM-based tile source.
- [ ] Show visible `© OpenStreetMap contributors` attribution.
- [ ] Import/normalise the supplied station GeoJSON and confirm its CRS.
- [ ] Render Rachel's full door-to-door route.
- [ ] Visually distinguish affected and unaffected portions.
- [ ] Overlay the original and recommended alternatives together.
- [ ] Show walking legs and rail legs with text/icon differences, not colour
      alone.
- [ ] Add the three-level crowd visual treatment.
- [ ] Add a clear Network Map/Journey Map switch and preserve the old map.
- [ ] Fit the route cleanly on a phone without hiding the recommendation card.
- [ ] Add map loading, failure and offline/stale states.

#### P1 tasks

- [ ] Add bus legs/stops when Member 2 exposes multimodal candidates.
- [ ] Add sheltered-walk and weather exposure overlays.
- [ ] Cache required map/journey assets for the demo route.

#### Handoff

Deliver a `JourneyMap` that consumes route candidates and conditions only
through typed props; it must not independently call LTA APIs.

### Member 4 — Rachel UX, proactive notification and AI explanation

Primary ownership: Rachel journey screens, recommendation components, state,
accessibility, AI prompt/context integration and end-to-end frontend tests.

#### P0 tasks

- [ ] Create Rachel's saved-journey state: Tampines → Raffles Place, 07:40,
      arrive by 08:45.
- [ ] Build the normal-day state with no unnecessary interruption.
- [ ] Build the disrupted state with a one-line action first.
- [ ] Show original/recommended arrival, delay avoided, confidence and source
      freshness beneath the action.
- [ ] Add a replay control for the labelled judging scenario.
- [ ] Build an in-app proactive notification/inbox flow.
- [ ] Ensure the UI respects `shouldNotify: false` for minor impact.
- [ ] Pass only the frozen structured context to the AI assistant.
- [ ] Validate AI output against the response schema and fall back to Member
      2's deterministic reason when unavailable or invalid.
- [ ] Make the flow usable one-handed with adequate type, contrast and touch
      targets.
- [ ] Add an end-to-end test for normal day → disruption → recommendation.

#### P1 tasks

- [ ] Add web push only after the in-app flow is reliable.
- [ ] Add concise multilingual recommendation templates.
- [ ] Add analytics for notification usefulness without storing raw location
      history.

#### Handoff

Deliver the complete Rachel interaction flow while treating route results and
operational conditions as inputs, not recomputing them in the frontend.

### Integration checkpoints

#### Checkpoint 1 — contracts and fixtures

- All four streams can load the same Rachel journey and planned/unplanned
  event fixtures.
- Frontend can develop against fixture JSON before backend endpoints are ready.

#### Checkpoint 2 — vertical slice

- Member 1's replay alert reaches Member 2.
- Member 2 returns original and revised route candidates.
- Member 3 renders both routes.
- Member 4 shows the correct proactive action.

#### Checkpoint 3 — mandatory-capability review

- Door-to-door route works.
- OSM map and attribution are visible.
- Original versus alternative is readable on a real phone.
- Five-minute impact stays quiet.
- Fifteen-minute impact warns Rachel and preserves the 08:45 goal where a
  viable alternative exists.
- Every simulated or stale value is labelled.

#### Checkpoint 4 — submission rehearsal

- Fresh clone and README setup succeed.
- Demo does not depend on a real disruption or paid AI call.
- One team member can complete the full journey demonstration without opening
  developer tools.
- The team can defend one verifiable claim for each judging criterion.

## Judging and deliverables

Judging weights:

- Problem Fit: 40%
- Technical Execution: 35%
- Ease of Use: 25%

Required deliverables:

1. Runnable mobile-first web app covering all three mandatory capabilities.
2. Short write-up naming the persona, architecture, assumptions and known
   limitations, with evidence for measurable claims.
3. Demo of one real commuter journey through one real or labelled replayed
   disruption.

## Definition of done

The MVP is ready when a judge can follow the README on a clean machine, open
the app on a real phone, load the selected persona's journey, replay a
disruption, and see a sourced geographic recommendation that changes the route
for a persona-specific reason.
