"""Record Rachel's demo journey from the backend routing engine.

Writes src/features/journey-map/fixtures/rachel-plan.<scenario>.json, the
Journey Map's labelled demo replay. Run from the repository root with the
backend virtual environment:

    backend/.venv/Scripts/python frontend/scripts/record_rachel_plan.py

It calls the real `plan_rachel_journey` with the team's fixed scenario files.
Only geocoding is pinned: home and work use the OneMap coordinates recorded
in PS2_REQUIREMENTS.md (verified 18 September 2026), because the mock
geocoder does not know Rachel's addresses. Walking legs use the mock
provider (straight-line distance at 80 m/min, no path geometry), so the map
labels them as approximate. No network call or API key is needed.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.integrations.mock_adapter import MockLocationProvider  # noqa: E402
from app.services.operational_conditions import load_rachel_scenario  # noqa: E402
from app.services.rachel_routing import plan_rachel_journey  # noqa: E402

SGT = timezone(timedelta(hours=8))
DEPARTURE = datetime(2026, 9, 21, 7, 40, tzinfo=SGT)  # a Monday
EVALUATED_AT = datetime(2026, 9, 21, 7, 25, tzinfo=SGT)
SCENARIOS = ["normal", "five-minute-delay", "fifteen-minute-disruption", "planned-change"]
VERIFIED_GEOCODES = {
    "523858": ("858C Tampines Walk, Singapore 523858", 1.35449039932647, 103.9396874423523),
    "049145": ("1 George St, Singapore 049145", 1.285694084848462, 103.8478199704954),
}
OUTPUT_DIR = ROOT / "frontend" / "src" / "features" / "journey-map" / "fixtures"


class VerifiedGeocodeProvider(MockLocationProvider):
    """Mock provider whose geocoder knows Rachel's two verified addresses."""

    def search_address(self, query: str) -> list[dict]:
        for postal_code, (address, latitude, longitude) in VERIFIED_GEOCODES.items():
            if postal_code in query:
                return [{"address": address, "postalCode": postal_code, "latitude": latitude, "longitude": longitude}]
        return []


def main() -> None:
    for scenario_id in SCENARIOS:
        scenario = load_rachel_scenario(scenario_id)
        plan = plan_rachel_journey(VerifiedGeocodeProvider(), scenario, DEPARTURE)
        recording = {
            "recordedWith": "frontend/scripts/record_rachel_plan.py",
            "note": "Demo replay. Routing and timings from the backend MRT graph; geocodes from a verified OneMap lookup; walking legs are straight-line estimates.",
            "evaluatedAt": EVALUATED_AT.isoformat(),
            "plan": plan,
            "conditions": scenario,
        }
        path = OUTPUT_DIR / f"rachel-plan.{scenario_id}.json"
        path.write_text(json.dumps(recording, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Wrote {path.relative_to(ROOT)}: recommended {plan['recommended']['id']}, notify {plan['decision']['shouldNotify']}")


if __name__ == "__main__":
    main()
