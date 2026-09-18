"""LTA DataMall platform crowd-density adapter.

The two platform crowd endpoints answer different questions:
``PCDRealTime`` is an observation while ``PCDForecast`` is a forecast.  This
adapter keeps that distinction visible in every normalised record.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

logger = logging.getLogger(__name__)

_SGT = timezone(timedelta(hours=8))
_TIMEOUT_SECONDS = 10
_LINES = ("CCL", "CEL", "CGL", "DTL", "EWL", "NEL", "NSL", "TEL")
_LEVELS = {
    "l": "low",
    "low": "low",
    "m": "moderate",
    "moderate": "moderate",
    "h": "crowded",
    "high": "crowded",
    "crowded": "crowded",
}


def _station_code_map() -> dict[str, str]:
    data_path = Path(__file__).resolve().parents[1] / "data" / "stations.json"
    stations = json.loads(data_path.read_text(encoding="utf-8"))
    return {
        code.upper(): station["id"]
        for station in stations
        for code in station.get("codes", [])
    }


class LTACrowdClient:
    """Read and normalise LTA's real-time and forecast crowd signals."""

    def __init__(self, account_key: str, base_url: str | None = None) -> None:
        self._account_key = account_key
        self._base_url = base_url or "https://datamall2.mytransport.sg/ltaodataservice"
        self._code_to_id = _station_code_map()

    def get_station_crowd(self, station_id: str) -> dict:
        readings = self.get_all_crowd()
        for reading in readings:
            if reading.get("stationId") == station_id:
                return reading
        raise LookupError(f"No live LTA crowd reading for {station_id}")

    def get_all_crowd(self) -> list[dict]:
        readings: dict[str, dict] = {}
        for line in _LINES:
            try:
                payload = self._get("/PCDRealTime", {"TrainLine": line})
                for item in self.normalise_realtime(payload):
                    readings[item["stationId"]] = item
            except requests.RequestException as exc:
                logger.warning("LTA real-time crowd unavailable for %s: %s", line, exc)
        if not readings:
            raise requests.ConnectionError("No LTA real-time crowd data available")
        return list(readings.values())

    def get_forecast(self, train_line: str) -> list[dict]:
        payload = self._get("/PCDForecast", {"TrainLine": train_line.upper()})
        return self.normalise_forecast(payload)

    def _get(self, endpoint: str, params: dict) -> dict:
        response = requests.get(
            f"{self._base_url}{endpoint}",
            headers={"AccountKey": self._account_key, "accept": "application/json"},
            params=params,
            timeout=_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json()

    def normalise_realtime(self, payload: dict) -> list[dict]:
        fetched_at = datetime.now(tz=_SGT).isoformat()
        result: list[dict] = []
        for record in self._records(payload):
            station_code = str(record.get("Station", "")).upper()
            station_id = self._code_to_id.get(station_code)
            level = _LEVELS.get(str(record.get("CrowdLevel", "")).lower())
            if not station_id or not level:
                continue
            result.append(
                {
                    "stationId": station_id,
                    "stationCode": station_code,
                    "level": level,
                    "confidence": 1.0,
                    "source": "lta_datamall",
                    "sourceType": "live",
                    "observedAt": str(record.get("Start", "")) or fetched_at,
                    "fetchedAt": fetched_at,
                    "isStale": False,
                }
            )
        return result

    def normalise_forecast(self, payload: dict) -> list[dict]:
        fetched_at = datetime.now(tz=_SGT).isoformat()
        result: list[dict] = []
        for parent in self._records(payload):
            station_code = str(parent.get("Station", "")).upper()
            station_id = self._code_to_id.get(station_code)
            intervals = parent.get("Interval") or parent.get("Intervals") or [parent]
            if isinstance(intervals, dict):
                intervals = [intervals]
            for interval in intervals if isinstance(intervals, list) else []:
                if not station_id or not isinstance(interval, dict):
                    continue
                level = _LEVELS.get(str(interval.get("CrowdLevel", "")).lower())
                if not level:
                    continue
                result.append(
                    {
                        "stationId": station_id,
                        "stationCode": station_code,
                        "level": level,
                        "confidence": 0.7,
                        "source": "lta_datamall",
                        "sourceType": "forecast",
                        "validFrom": str(interval.get("Start", "")),
                        "fetchedAt": fetched_at,
                        "isStale": False,
                    }
                )
        return result

    @staticmethod
    def _records(payload: dict) -> list[dict]:
        value = payload.get("value", []) if isinstance(payload, dict) else []
        if isinstance(value, dict):
            value = value.get("value", value.get("Stations", []))
        return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []
