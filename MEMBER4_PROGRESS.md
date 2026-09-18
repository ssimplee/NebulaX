# Member 4 progress — Rachel experience

Owner: Member 4. Branch: `aless-part`.

This file records what Member 4 implemented and how to verify it. The current
journey replay is deliberately labelled as simulated. It does not claim that
its routes, disruptions or travel times are live.

## P0 implementation status

- [x] Rachel's saved morning routine: Tampines → Raffles Place, leave 07:40,
  arrive at the desk by 08:45.
- [x] Quiet normal-day state with no inbox notification.
- [x] Quiet five-minute minor-impact state with `shouldNotify: false`.
- [x] Action-first disrupted and planned-work states.
- [x] Original and recommended arrival, delay avoided, confidence description,
  arrival range, warnings and source freshness.
- [x] Labelled normal, minor, disrupted and planned replay controls.
- [x] In-app inbox with unread, mark-read, dismiss, deduplication and a limit of
  20 stored entries.
- [x] Proactive in-app banner on other screens for a saved journey update.
- [x] Saved state is local to the browser and can be cleared. This feature does
  not store raw GPS or location history.
- [x] Strict shared snapshot and explanation schemas in TypeScript and Python.
- [x] Only the validated structured journey snapshot is sent for explanation.
  Chat history, credentials and raw location history are excluded.
- [x] AI output can reword only the deterministic reason. Any changed fact,
  extra field, invalid schema or new numeric claim falls back to Member 2's
  deterministic explanation.
- [x] The explanation endpoint works without an API key. Optional provider calls
  require the separate `RACHEL_AI_ENABLED=true` switch.
- [x] Mobile layout, 48 px controls, visible keyboard focus, high contrast and
  reduced-motion preference support.
- [x] Unit, contract, backend and mobile/desktop end-to-end tests.

## Live integration handoffs

The replay is complete and testable, but these items require the other members'
final interfaces before this can be called a live commuter recommendation:

- [ ] Member 1: replace the labelled replay events and source metadata with the
  agreed planned/unplanned fixtures or live operational data.
- [ ] Member 2: provide a live impact/routing endpoint that returns the snapshot
  contract in `frontend/src/features/rachel/contract.ts`, including candidate
  IDs, `shouldNotify`, confidence semantics and the deterministic reason. Set
  `VITE_RACHEL_IMPACT_URL` to that endpoint after integration.
- [ ] Member 3: pass the geographic `JourneyMap` into `JourneyComparison` using
  the same candidate IDs and selected candidate ID.
- [ ] Whole team: approve what happens between the supplied five-minute quiet
  example and fifteen-minute action example. The code does not invent a hidden
  ten-minute rule.

Until `VITE_RACHEL_IMPACT_URL` is configured, the page automatically stays in
labelled demo mode and never presents the replay as live information.

## Automated verification completed on 18 September 2026

- Frontend unit/component tests: **89 passed** in 13 test files.
- Production TypeScript/Vite build: **passed** (one existing bundle-size warning).
- Playwright end-to-end tests: **4 passed** — the full normal → disruption →
  recommendation flow and the quiet five-minute flow on mobile and desktop.
- Backend tests: **247 passed**. Existing SQLAlchemy/datetime deprecation
  warnings remain; no test failed.
- Visual check: normal and disrupted states inspected at desktop and 393 × 851
  mobile viewport. The action appears first, controls remain reachable, and the
  fixed bottom navigation does not cover the active content.

## Run the project in VS Code

Open two VS Code terminals from `C:\Users\aless\NebulaX_Project`.

Terminal 1 — backend:

```powershell
cd backend
.\.venv\Scripts\python.exe run.py
```

Terminal 2 — frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173/journey`.

## Manual acceptance check

1. Confirm the page says **Labelled demo replay**, shows Tampines → Raffles
   Place, 07:40 and 08:45, and starts with **0 unread**.
2. Confirm the normal state says no action is needed and does not interrupt you.
3. Select **Save morning routine**.
4. Select **5-minute delay**. Confirm `Keep your usual journey` appears and the
   inbox remains **0 unread**.
5. Select **15-minute disruption**. Confirm the first message says to use the
   DTL alternative, with usual arrival **08:52**, recommended arrival **08:42**,
   and **10 min** delay avoided. The inbox should show **1 unread**.
6. Expand **Sources and freshness**. Confirm the source is labelled **Demo
   replay**, not official or live.
7. Select **View recommended journey**. Confirm the recommended candidate and
   its steps open and the inbox becomes **0 unread**.
8. Select the disruption again after resetting, then navigate to **Map**. Confirm
   the proactive journey banner appears outside the Journey page.
9. Return to Journey, expand **Why this advice?**, and request an explanation.
   With AI disabled or unavailable, confirm the deterministic explanation is
   used and no journey facts change.
10. Select **Reset replay and inbox**. Confirm the normal state and empty inbox
    return.

## Repeat the automated checks

Frontend:

```powershell
cd C:\Users\aless\NebulaX_Project\frontend
npm test
npm run build
npx playwright install chromium   # first time only
npm run test:e2e
```

Backend:

```powershell
cd C:\Users\aless\NebulaX_Project\backend
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pytest -q --basetemp=.pytest-tmp
```

## P1 scope not started

- [ ] Web push after the in-app flow is accepted.
- [ ] Concise multilingual recommendation templates.
- [ ] Notification-usefulness analytics without raw location history.
