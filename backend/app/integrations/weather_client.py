"""Keyless data.gov.sg weather adapter for commuter decisions."""

from __future__ import annotations

from datetime import datetime, timezone

import requests

_TIMEOUT_SECONDS = 10
_BASE_URL = "https://api-open.data.gov.sg/v2/real-time/api"


class DataGovWeatherClient:
    """Fetch weather products without hiding their different time horizons."""

    ENDPOINTS = {
        "twoHour": "/two-hr-forecast",
        "twentyFourHour": "/twenty-four-hr-forecast",
        "fourDay": "/four-day-outlook",
        "rainfall": "/rainfall",
    }

    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = base_url or _BASE_URL

    def get_commute_weather(self) -> dict:
        """Return immediate weather first; isolate failures per endpoint."""
        products: dict[str, dict] = {}
        errors: list[dict] = []
        for name in ("twoHour", "rainfall", "twentyFourHour"):
            try:
                products[name] = self._get(self.ENDPOINTS[name])
            except requests.RequestException as exc:
                errors.append({"source": f"data_gov_sg:{name}", "error": str(exc)})

        if not products:
            raise requests.ConnectionError("No data.gov.sg weather products available")

        return {
            "products": products,
            "source": "data_gov_sg",
            "sourceType": "live_and_forecast",
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "isStale": False,
            "errors": errors,
        }

    def get_four_day_outlook(self) -> dict:
        return self._get(self.ENDPOINTS["fourDay"])

    def _get(self, endpoint: str) -> dict:
        response = requests.get(
            f"{self._base_url}{endpoint}",
            headers={"accept": "application/json"},
            timeout=_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json()
