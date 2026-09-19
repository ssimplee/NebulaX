# SGRail — Problem Statement 2 write-up

## Chosen commuter and problem

We built for **Rachel**, a commuter who leaves 858C Tampines Walk at **07:40 SGT** and needs to reach her desk at 1 George Street by **08:45**. Her familiar journey uses the East–West Line (EWL) from Tampines towards Raffles Place. The useful decision is whether a change actually threatens that deadline: on an ordinary morning or with a small delay, she should not be interrupted; when the EWL is materially disrupted, she needs one clear alternative and enough evidence to judge it.

The repeatable judging scenario is an **injected, simulated 15-minute EWL disruption**, not an observed live incident. The app labels the scenario and its data source. A five-minute delay and a normal day provide comparison cases. The [README](README.md) gives the setup commands and exact screens to open.

## How the product works

The **Journey Map** starts with Rachel's home and workplace, includes the walks to and from MRT stations, and compares the affected usual route with alternatives. The backend builds candidates from its MRT route graph, adds walking time and the scenario delay, estimates arrival ranges, and ranks routes against her 08:45 deadline. A major EWL alert causes the planner to seek a route avoiding the affected line. The result appears as a one-line action followed by the original and recommended arrival times, walking and transfer details, uncertainty, and source labels. A five-minute impact keeps Rachel on her usual route and does not trigger a proactive notification.

The geographic Journey Map uses an **OpenStreetMap-based basemap** with visible `© OpenStreetMap contributors` attribution. OneMap can supply address geocoding and walking routes when configured; the map itself does not depend on OneMap tiles. The separate **Network Map** is a schematic for station exploration and shows crowd levels with text and marker size as well as colour.

The frontend is **React, TypeScript and Vite**. A **Flask** API supplies journey plans and operational conditions; **SQLite** holds application data, including seeded station and timing records. Provider adapters can use LTA DataMall, OneMap and data.gov.sg. The default `DATA_PROVIDER=mock` runs the labelled scenario without external credentials. Live data requires the corresponding keys and provider availability. If a Journey Map request fails, the user can explicitly choose a labelled recorded demo; the app does not present that recording as a live result.

Rachel's separate **Journey** screen demonstrates the saved routine, quiet normal/minor states, an in-app inbox and a banner visible on other pages. Its optional AI explanation receives only a frozen structured journey context. If the explanation service is unavailable or returns an invalid response, the screen uses the deterministic reason from the journey snapshot. The core route decision does not require AI.

## Basis for the demo numbers

All times below are **estimates for the supplied scenario**, not measured train arrivals or a claim of predictive accuracy. The planner assumes a **55-minute usual door-to-door baseline** from 07:40, yielding 08:35. It adds the injected delay to that baseline. The alternative comes from the route graph and walking estimates for the same departure. The calculation is implemented in [`backend/app/services/rachel_routing.py`](backend/app/services/rachel_routing.py), with the disruption input in [`backend/app/data/scenarios/rachel_fifteen_minute_disruption.json`](backend/app/data/scenarios/rachel_fifteen_minute_disruption.json).

| Journey Map scenario | Usual-route estimate | Recommended estimate | Decision and calculation |
|---|---:|---:|---|
| Normal day | 08:35 | 08:35 | No injected delay; stay on the usual route. |
| Five-minute delay | 08:40 | 08:40 | 08:35 + 5 minutes remains before 08:45; stay quiet. |
| Fifteen-minute disruption | 08:50 | 08:37 | 08:35 + 15 minutes misses the deadline; the graph-based alternative is **13 minutes earlier** (08:50 − 08:37). |

The planner displays an ETA range by adding and subtracting a heuristic uncertainty of **10% of estimated journey duration, with a three-minute minimum**. This range is not statistically calibrated. The recorded [15-minute Journey Map fixture](frontend/src/features/journey-map/fixtures/rachel-plan.fifteen-minute-disruption.json) preserves the same estimates for an offline/repeatable demonstration.

The **Journey** inbox screen is a separate UX replay with illustrative **08:52 usual**, **08:42 recommended**, and **10 minutes avoided**. Those values test notification behaviour; they are not the Journey Map planner's output and should not be compared as if they came from one calculation.

## Assumptions and known limitations

- Rachel's locations, departure and deadline are fixed for this demo. The 55-minute baseline and MRT graph timings are modelling assumptions, **not live train-arrival predictions**. Walking geometry can be straight-line when a walking router is unavailable.
- Disruption delay and the deadline currently drive the route recommendation. Crowd and weather information can be displayed, but they do **not yet change route ranking**.
- The default operational feed and all injected scenarios are simulated. Live crowding, alerts and address services require credentials and working upstream APIs. Source and freshness labels distinguish live, stale and simulated information where available.
- The `/journey` inbox replay is independent of the Journey Map planner. Its saved routine and recent inbox items live in that browser's local storage; the Rachel flow does not retain raw GPS history. Browser push requires permission and separate configuration.
- Geographic map tiles require a network connection. The route overlay and an explanatory state remain when tiles cannot load. A real-phone browser check and a clean-clone run should be completed before submission; automated and desktop-browser checks alone do not prove those conditions.

The reproducible implementation and remaining requirement checks are in [PS2_REQUIREMENTS.md](PS2_REQUIREMENTS.md). The project includes backend and frontend tests plus a [Rachel end-to-end browser test](frontend/e2e/rachel-flow.spec.ts); the README lists the commands to run them.
