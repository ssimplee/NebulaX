"""LTA DataMall bus adapters for routing and live arrival decisions."""

from __future__ import annotations

import threading
import time
from datetime import datetime, timezone

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

_BASE_URL = "https://datamall2.mytransport.sg/ltaodataservice"
_PAGE_SIZE = 500
_REFERENCE_TTL_SECONDS = 6 * 60 * 60
_ARRIVAL_TTL_SECONDS = 15
_MAX_PAGES = 100
_LOAD = {"SEA": "low", "SDA": "moderate", "LSD": "crowded"}


class LTABusClient:
    """Fetch paginated bus topology and real-time Bus Arrival v3 data."""

    def __init__(self, account_key: str, base_url: str | None = None) -> None:
        if not account_key:
            raise ValueError("LTA_ACCOUNT_KEY is not configured")
        self._account_key = account_key
        self._base_url = base_url or _BASE_URL
        self._session = requests.Session()
        retry = Retry(
            total=2,
            backoff_factor=0.25,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=frozenset({"GET"}),
        )
        self._session.mount("https://", HTTPAdapter(max_retries=retry))
        self._cache: dict[tuple, tuple[float, object]] = {}
        self._lock = threading.Lock()

    def get_bus_stops(self) -> list[dict]:
        return self._cached_reference("stops", self._load_bus_stops)

    def get_bus_services(self) -> list[dict]:
        return self._cached_reference("services", self._load_bus_services)

    def get_bus_routes(self, service_no: str | None = None) -> list[dict]:
        routes = self._cached_reference("routes", self._load_bus_routes)
        if service_no:
            wanted = service_no.strip().upper()
            return [item for item in routes if item["serviceNo"] == wanted]
        return routes

    def get_arrivals(self, bus_stop_code: str, service_no: str | None = None) -> dict:
        code = bus_stop_code.strip()
        if not (code.isdigit() and len(code) == 5):
            raise ValueError("bus_stop_code must be a 5-digit LTA bus stop code")
        service = service_no.strip().upper() if service_no else None
        key = ("arrivals", code, service)
        cached = self._cache_get(key, _ARRIVAL_TTL_SECONDS)
        if cached is not None:
            return cached
        params = {"BusStopCode": code}
        if service:
            params["ServiceNo"] = service
        payload = self._get("/v3/BusArrival", params)
        fetched_at = datetime.now(timezone.utc).isoformat()
        result = {
            "busStopCode": str(payload.get("BusStopCode", code)),
            "services": [
                self._normalise_arrival_service(item)
                for item in payload.get("Services", [])
                if isinstance(item, dict)
            ],
            "source": "lta_datamall",
            "sourceType": "live",
            "fetchedAt": fetched_at,
            "isStale": False,
        }
        self._cache_set(key, result)
        return result

    def _load_bus_stops(self) -> list[dict]:
        return [
            {
                "busStopCode": str(row.get("BusStopCode", "")),
                "roadName": str(row.get("RoadName", "")),
                "description": str(row.get("Description", "")),
                "latitude": float(row.get("Latitude", 0)),
                "longitude": float(row.get("Longitude", 0)),
            }
            for row in self._get_all("/BusStops")
        ]

    def _load_bus_services(self) -> list[dict]:
        fields = {
            "ServiceNo": "serviceNo", "Operator": "operator", "Direction": "direction",
            "Category": "category", "OriginCode": "originCode", "DestinationCode": "destinationCode",
            "AM_Peak_Freq": "amPeakFrequency", "AM_Offpeak_Freq": "amOffpeakFrequency",
            "PM_Peak_Freq": "pmPeakFrequency", "PM_Offpeak_Freq": "pmOffpeakFrequency",
            "LoopDesc": "loopDescription",
        }
        return [
            {target: row.get(source) for source, target in fields.items()}
            for row in self._get_all("/BusServices")
        ]

    def _load_bus_routes(self) -> list[dict]:
        fields = {
            "ServiceNo": "serviceNo", "Operator": "operator", "Direction": "direction",
            "StopSequence": "stopSequence", "BusStopCode": "busStopCode", "Distance": "distanceKm",
            "WD_FirstBus": "weekdayFirstBus", "WD_LastBus": "weekdayLastBus",
            "SAT_FirstBus": "saturdayFirstBus", "SAT_LastBus": "saturdayLastBus",
            "SUN_FirstBus": "sundayFirstBus", "SUN_LastBus": "sundayLastBus",
        }
        return [
            {target: row.get(source) for source, target in fields.items()}
            for row in self._get_all("/BusRoutes")
        ]

    @staticmethod
    def _normalise_arrival_service(row: dict) -> dict:
        buses = []
        for key in ("NextBus", "NextBus2", "NextBus3"):
            bus = row.get(key)
            if not isinstance(bus, dict) or not bus.get("EstimatedArrival"):
                continue
            buses.append(
                {
                    "estimatedArrival": bus.get("EstimatedArrival"),
                    "monitored": str(bus.get("Monitored", "")) == "1",
                    "latitude": bus.get("Latitude"),
                    "longitude": bus.get("Longitude"),
                    "load": _LOAD.get(str(bus.get("Load", "")).upper(), "unknown"),
                    "wheelchairAccessible": str(bus.get("Feature", "")).upper() == "WAB",
                    "vehicleType": bus.get("Type", ""),
                    "originCode": bus.get("OriginCode", ""),
                    "destinationCode": bus.get("DestinationCode", ""),
                }
            )
        return {
            "serviceNo": str(row.get("ServiceNo", "")),
            "operator": str(row.get("Operator", "")),
            "arrivals": buses,
        }

    def _get_all(self, endpoint: str) -> list[dict]:
        records: list[dict] = []
        for page in range(_MAX_PAGES):
            batch = self._get(endpoint, {"$skip": page * _PAGE_SIZE}).get("value", [])
            if not isinstance(batch, list):
                raise ValueError(f"Unexpected paginated response from {endpoint}")
            records.extend(item for item in batch if isinstance(item, dict))
            if len(batch) < _PAGE_SIZE:
                return records
        raise RuntimeError(f"Pagination safety limit reached for {endpoint}")

    def _get(self, endpoint: str, params: dict | None = None) -> dict:
        response = self._session.get(
            f"{self._base_url}{endpoint}",
            headers={"AccountKey": self._account_key, "accept": "application/json"},
            params=params,
            timeout=10,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError(f"Unexpected response from {endpoint}")
        return payload

    def _cached_reference(self, name: str, loader):
        key = (name,)
        cached = self._cache_get(key, _REFERENCE_TTL_SECONDS)
        if cached is not None:
            return cached
        value = loader()
        self._cache_set(key, value)
        return value

    def _cache_get(self, key: tuple, ttl: int):
        with self._lock:
            entry = self._cache.get(key)
            if entry and time.monotonic() - entry[0] < ttl:
                return entry[1]
        return None

    def _cache_set(self, key: tuple, value) -> None:
        with self._lock:
            self._cache[key] = (time.monotonic(), value)
