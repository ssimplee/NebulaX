# Smart Commuter Companion

A mobile-first web app that gives commuters proactive, personalised journey
advice during planned and unplanned transport events.

Our selected commuter is **Rachel**, a fixed-schedule traveller who journeys
from Tampines to Raffles Place. She leaves at 7:40am and needs to reach her
desk by 8:45am. The app stays quiet when a small delay does not threaten her
deadline. When conditions create a meaningful impact, it recommends a route
Rachel can follow and explains why the recommendation changed.

## PS2 mandatory capabilities

### 1. Route planning

- Plans Rachel's journey from **858C Tampines Walk** to
  **1 George Street** at a specified departure time.
- Covers the full door-to-door journey, including both walking legs.
- Supports walking, rail, and OneMap bus candidates when available.
- Recalculates when disruption conditions affect the usual route.
- Shows estimated arrival ranges instead of one overconfident time.
- Explains the recommendation using Rachel's 8:45am deadline.

The fixed judging scenario demonstrates a 15-minute EWL disruption. Rachel's
usual route reaches work at an estimated 8:50am. The recommended alternative
reaches work at an estimated 8:37am, which is 13 minutes earlier. These figures
come from the deterministic scenario fixture and routing tests in this
repository.

### 2. GIS on OpenStreetMap

- Uses an OpenStreetMap-based geographic Journey Map.
- Displays `© OpenStreetMap contributors` on the map.
- Uses OpenFreeMap by default and rejects the public
  `tile.openstreetmap.org` server for application traffic.
- Supports OSM-routed walking geometry through an OSRM-compatible adapter.
- Uses the supplied station GeoJSON after coordinate-system validation.

### 3. Visualisation

- Shows the complete route on a geographic map.
- Distinguishes affected and unaffected route sections.
- Shows the recommended alternative against the original route.
- Displays crowding using Low, Moderate, and High labels, icons, and size.
- Makes arrival time, uncertainty, delay, and minutes saved visible.
- Preserves a schematic Network Map for station-level exploration.

## Rachel decision behaviour

| Situation | App behaviour |
|---|---|
| Normal conditions | Keep Rachel's usual route and avoid an unnecessary alert. |
| 5-minute impact | Stay quiet because Rachel's deadline remains protected. |
| 15-minute disruption | Warn Rachel, recalculate the journey, and recommend the viable alternative. |
| Live provider failure | Show an error and offer a clearly labelled recorded replay. |

Live and simulated information are never silently mixed. The interface labels
live, estimated, stale, forecast, and simulated information.

## Run locally on Windows

### Prerequisites

- Python 3.12
- Node.js 20 or later
- npm
- Git

### Backend

Open PowerShell in the repository root:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env -ErrorAction SilentlyContinue
.\.venv\Scripts\python.exe seed.py
.\.venv\Scripts\python.exe run.py
```

The backend runs at `http://localhost:5000`.

For later runs:

```powershell
cd backend
.\.venv\Scripts\python.exe run.py
```

### Frontend

Open a second PowerShell terminal in the repository root:

```powershell
cd frontend
npm install
Copy-Item .env.example .env -ErrorAction SilentlyContinue
npm run dev
```

Open `http://localhost:5173`.

For later runs:

```powershell
cd frontend
npm run dev
```

## Run locally on macOS or Linux

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
python seed.py
python run.py
```

Frontend, in a second terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

## API configuration

The labelled recorded demo does not require external API credentials. Add
credentials to `backend/.env` for live operation.

| Variable | Purpose | Required for recorded demo |
|---|---|---|
| `ONEMAP_EMAIL` | OneMap account email for token creation | No |
| `ONEMAP_PASSWORD` | OneMap account password | No |
| `ONEMAP_TOKEN` | Optional short-lived token instead of account credentials | No |
| `LTA_ACCOUNT_KEY` | LTA DataMall live alerts, crowding, and transport data | No |
| `OSRM_BASE_URL` | Optional approved or self-hosted OSM routing service | No |
| `AI_PROVIDER` | AI provider, or `rule_based` for the local fallback | No |
| `AI_API_KEY` | Optional provider key | No |

Set `DATA_PROVIDER=live` to use configured live providers. Keep
`DATA_PROVIDER=mock` for deterministic local development.

Never commit `.env` files or credentials. Both frontend and backend `.env`
files are ignored by Git.

## Data sources

### LTA DataMall

- `TrainServiceAlerts` supplies official structured train disruption state.
- `PlatformCrowdDensityRealTime` supplies current platform crowding.
- `PlatformCrowdDensityForecast` supplies forecast platform crowding.
- Bus stops, services, routes, and Bus Arrival v3 support bus alternatives.
- The backend normalises inconsistent line and station identifiers.

DataMall requires a free AccountKey. Responses that exceed 500 records are
retrieved using `$skip` pagination.

### OneMap

- Geocodes Rachel's home and workplace.
- Supplies walking and public-transport route candidates.
- Provides routed geometry where available.

### OpenStreetMap

- Provides the required geospatial base.
- Supports walking-route geometry through an OSRM-compatible service.
- Uses OpenFreeMap for the default map style.

### data.gov.sg

- Supplies the 2-hour weather nowcast and rainfall information.
- Weather is displayed with its source and freshness status.

The 15-minute judging scenario demonstrates disruption-responsive routing.
The current demo does not claim that rain alone causes a reroute.

## Application modes

| Mode | Plan source | Condition source | UI treatment |
|---|---|---|---|
| Live | `POST /api/v1/routes/rachel/plan` | `GET /api/v1/operational-conditions` | Live status and timestamps |
| Demo: 5-minute delay | Rachel recalculation endpoint | Labelled scenario fixture | Simulated label; no notification |
| Demo: 15-minute disruption | Rachel recalculation endpoint | Labelled scenario fixture | Original and alternative routes |
| Demo: planned change | Rachel recalculation endpoint | Labelled planned-event fixture | Simulated planned-event label |
| Recorded replay | Checked-in recording | Checked-in recording | Offline simulated-replay label |

A failed live request does not silently load demo data. The commuter chooses
the recorded fallback explicitly.

## Architecture

```text
Mobile or desktop browser
  |
  +-- React 18 + TypeScript + Vite
  |     +-- Network Map
  |     +-- Leaflet/MapLibre Journey Map
  |     +-- Rachel feed and scenario selector
  |     +-- Community and MRT assistant interfaces
  |
  +-- Flask API (/api/v1)
        +-- Rachel decision and ranking service
        +-- Disruption-aware route engine
        +-- OperationalConditions aggregation
        +-- OneMap, LTA DataMall, data.gov.sg, and OSM adapters
        +-- Recorded and deterministic scenario fixtures
        +-- SQLite application data
```

The frontend keeps the selected data mode consistent across the route plan and
operational conditions. This prevents live plans from being paired with
simulated alerts.

## Five-minute judging flow

1. Open **Map** and show the **Network Map**.
2. Select Tampines, enable **Crowd density**, and show source labelling.
3. Open the alert control when an active alert exists.
4. Switch to **Journey Map** and show Rachel's live door-to-door route.
5. Point out both walking legs, ETA range, crowd scale, and OSM attribution.
6. Select **Demo: 5-minute delay** and show that the app stays quiet.
7. Select **Demo: 15-minute disruption**.
8. Compare the affected usual route with the recommended alternative.
9. Point out 8:50am versus 8:37am and the 13-minute improvement.
10. Briefly show Community and the MRT-focused assistant.

If live services fail, select **Demo: recorded replay (offline)** and state
that it is simulated.

## Supporting features

- Interactive MRT Network Map and station search
- Station information, first and last train times, and operating-state checks
- Three-level Network Map crowd layer with source and observation time
- Service-alert panel with affected line and official or simulated source
- Community incident reports, moderation, voting, and reporter reliability
- MRT-focused assistant with a rule-based fallback
- Accessible labels, non-colour status cues, and mobile touch targets

The generic MRT Route page and the separate Rachel development page are hidden
from production navigation. The PS2 journey runs through **Map**, then
**Journey Map**.

## Privacy and resilience

- API credentials stay in ignored environment files.
- Demo fixtures contain no secret keys.
- Journey sources include timestamps and staleness thresholds.
- Failed live requests produce an honest error state.
- A recorded replay keeps the judging flow reproducible without payment.
- The app caches selected user and journey state locally where required.

Rachel is a supplied problem-statement persona. Her fixed demo addresses and
routine are used only for this scenario.

## Verification

Backend tests:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```

Frontend tests and build:

```powershell
cd frontend
npm test
npm run build
```

Verified locally:

- 282 backend tests pass.
- 200 frontend tests pass.
- The production frontend build succeeds.
- The test suite proves the 5-minute quiet boundary.
- The test suite proves the 15-minute reroute and notification.
- The test suite checks live/demo separation, source labels, OSM attribution,
  and the recorded fallback.

## Assumptions and known limitations

- The current product is intentionally optimised for Rachel. It is not yet a
  general door-to-door planner for every commuter.
- Rail timing uses an estimated, calibrated Rachel baseline. It is never
  labelled as a live train-arrival prediction.
- Walking geometry falls back to a labelled straight-line approximation when
  a routing provider does not return a path.
- A real disruption may not occur during judging. The app therefore includes
  labelled planned and unplanned scenario replays.
- Live crowd and weather availability depends on upstream services and valid
  credentials.
- Historical ETA calibration remains future work.
- A physical-phone rehearsal is still required before final submission.

## Repository guide

- `backend/app/services/rachel_routing.py`: Rachel's door-to-door planning and
  deterministic recommendation logic
- `backend/app/services/operational_conditions.py`: alerts, crowding, weather,
  source, freshness, and scenario aggregation
- `frontend/src/components/journey-map/`: geographic Journey Map UI
- `frontend/src/features/journey-map/`: route adapters, map models, and fixtures
- `frontend/src/components/map/`: Network Map and shared map controls
- `PS2_REQUIREMENTS.md`: verified requirement mapping and team backlog
- `OLD_README.md`: previous repository documentation retained for reference

## Submission evidence

The judges can verify the three mandatory capabilities directly in the running
app:

1. **Route planning:** change from Live to the 15-minute disruption and inspect
   the revised door-to-door journey.
2. **GIS:** inspect the Journey Map and its OpenStreetMap attribution.
3. **Visualisation:** compare the affected original route, recommended
   alternative, crowd level, ETA range, and delay saving on a phone screen.

The full source problem statement is stored as
`Problem_Statement_2_Specification.docx`.
