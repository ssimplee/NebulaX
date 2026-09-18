"""LTA MRT lift-maintenance adapter."""

from __future__ import annotations

from datetime import datetime, timezone

import requests

from app.integrations.lta_mapping import map_line_code


class LTAFacilitiesClient:
    def __init__(self, account_key: str, base_url: str | None = None) -> None:
        if not account_key:
            raise ValueError("LTA_ACCOUNT_KEY is not configured")
        self._account_key = account_key
        self._base_url = base_url or "https://datamall2.mytransport.sg/ltaodataservice"

    def get_outages(self) -> list[dict]:
        response = requests.get(
            f"{self._base_url}/v2/FacilitiesMaintenance",
            headers={"AccountKey": self._account_key, "accept": "application/json"},
            timeout=10,
        )
        response.raise_for_status()
        payload = response.json()
        rows = payload.get("value", []) if isinstance(payload, dict) else []
        fetched_at = datetime.now(timezone.utc).isoformat()
        return [
            {
                "lineCode": map_line_code(str(row.get("Line", ""))),
                "ltaLine": str(row.get("Line", "")).strip().upper(),
                "stationCode": str(row.get("StationCode", "")).strip().upper(),
                "stationName": str(row.get("StationName", "")).strip(),
                "liftId": str(row.get("LiftID", "")).strip(),
                "description": str(row.get("LiftDesc", "")).strip(),
                "source": "lta_datamall",
                "sourceType": "live",
                "fetchedAt": fetched_at,
                "isStale": False,
            }
            for row in rows
            if isinstance(row, dict)
        ]
