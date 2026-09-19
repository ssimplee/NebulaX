# SGRail — Smart Commuter Companion

SGRail is a mobile-first web app for commuters facing planned and unplanned MRT
disruptions. It focuses on **Rachel**, who travels from 858C Tampines Walk to
1 George Street, leaves at **07:40**, and needs to reach her desk by **08:45**.
The app keeps a minor delay quiet and recommends an alternative when her usual
journey risks missing that deadline.

The main judging flow uses a **clearly labelled simulated EWL disruption** so
it can be repeated even when there is no real service alert. It does not
present replayed data as live.

## How this addresses Problem Statement 2

| Required capability | Where to see it |
|---|---|
| Route planning | **Map → Journey Map** shows Rachel's home-to-work journey, both walking legs, the usual rail route, and a revised route under the disruption. Arrival estimates include a range. |
| GIS on OpenStreetMap | **Journey Map** places the route on an OpenStreetMap-based geographic map with visible `© OpenStreetMap contributors` attribution. The separate **Network Map** is a schematic for station exploration. |
| Visualisation | **Journey Map** compares the affected usual route with the recommendation, including ETA, delay saved, and walking time. **Network Map** shows three crowd levels using text and marker size as well as colour. |

The interface also has an in-app journey inbox, a one-line recommendation,
source labels, and loading, error and offline states.

The React and TypeScript frontend calls a Flask API. The API combines an MRT
route graph, location and operational-data adapters, and SQLite application
data; the geographic map uses Leaflet and MapLibre.

## Run on a clean machine

You need Python 3.12, Node.js 20 or later, and npm. Run the backend and
frontend in **separate terminals**, starting in the repository root. The
default `DATA_PROVIDER=mock` runs the labelled demo without external API keys.

**Windows PowerShell — backend:**

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
.\.venv\Scripts\python.exe seed.py
.\.venv\Scripts\python.exe run.py
```

**Windows PowerShell — frontend, in another terminal from the repository root:**

```powershell
cd frontend
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm run dev
```

Open `http://localhost:5173`. To check the mobile layout on a real phone,
connect it to the same Wi-Fi network and open the **Network** URL printed by
Vite. The Flask API runs on port 5000 and Vite proxies `/api` requests to it.

On later runs, start `backend/run.py` with the virtual-environment Python and
run `npm run dev` in `frontend`. **Do not copy `.env.example` over an existing
`.env`** or repeat `seed.py` just to restart the app.

On macOS or Linux, use `python3.12 -m venv .venv`,
`.venv/bin/python -m pip install -r requirements.txt`,
`test -f .env || cp .env.example .env`, `.venv/bin/python seed.py`, and
`.venv/bin/python run.py` in `backend`. Use `npm ci`, the same guarded copy
command, and `npm run dev` in `frontend`.

## Five-minute judging walkthrough

1. Open **Map → Network Map**. Select Tampines and enable **Crowd density**.
   Point out the three-level legend and its source label. In the default setup
   it says **Simulated data**.
2. Switch to **Journey Map**. Select **Demo: 5-minute delay**. Rachel can stay
   on her usual route; the estimated arrival is **08:40**, before her **08:45**
   deadline.
3. Select **Demo: 15-minute disruption**. The usual EWL journey is estimated
   to arrive at **08:50**. The alternative is estimated at **08:37**,
   **13 minutes earlier**. Show both routes, their arrival ranges and walking legs,
   the affected portion, the one-line action, and the OpenStreetMap attribution.
4. Select **Demo: planned change** to show that a scheduled event can also be
   replayed. Every demo scenario is labelled simulated.
5. For the notification interaction, open `http://localhost:5173/journey`.
   Save Rachel's morning routine, try the **5-minute delay** and confirm the
   inbox stays empty, then try the **15-minute disruption** and confirm the
   one-line advice and unread inbox item. Open **Map** to see the proactive
   banner. This inbox flow is a separate illustrative replay; its ETA figures
   differ from the routed Journey Map demo.

If a journey request fails, the Journey Map shows an error and offers
**Use recorded demo**. That recording is explicitly labelled as a simulated
replay.

## Data and limitations

- The default demo uses mock operational conditions and injected scenario
  alerts. Live LTA DataMall crowd and disruption data requires
  `DATA_PROVIDER=live` and `LTA_ACCOUNT_KEY` in `backend/.env`; OneMap address
  and walking services require OneMap credentials. Keep these keys out of Git.
  Weather comes from data.gov.sg in live mode.
- The geographic basemap uses OpenFreeMap's OSM-based style by default and
  needs internet access for map tiles. If tiles cannot load, the route overlay
  and status message remain available.
- Rail travel times are estimates built from the project's MRT graph and a
  fixed Rachel baseline, **not live train-arrival predictions**. Walking legs
  may use straight-line geometry when no walking router is configured.
- The current route decision responds to the disruption delay and Rachel's
  arrival deadline. Crowd and weather can be displayed but do not yet change
  the selected route.
- The `/journey` notification replay is a separate UX fixture, not the live
  output of the Journey Map planner. Its routine and up to 20 inbox entries
  are stored in that browser until cleared; this feature does not keep raw
  GPS history.

## Verify the implementation

From `backend`, run `.\.venv\Scripts\python.exe -m pytest -q` on Windows or
`.venv/bin/python -m pytest -q` on macOS/Linux. From `frontend`, run `npm test`
and `npm run build`. The Playwright journey-flow checks are in
`frontend/e2e/rachel-flow.spec.ts` and can be run with `npm run test:e2e` after
installing Playwright's Chromium browser.

The source brief is [Problem Statement 2](Problem_Statement_2_Specification.docx).
The detailed requirement mapping and remaining work are in
[PS2 requirements](PS2_REQUIREMENTS.md).
