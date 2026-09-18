"""OneMap API client implementing the LocationProvider protocol.

Provides address search, reverse geocoding, nearby transport, and walking
route functionality backed by Singapore's OneMap API.

Falls back to MockLocationProvider on any connection error or timeout.

Validates: Requirements 30.1, 30.2, 30.3, 30.4, 30.5, 30.6
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

import requests
from requests.exceptions import ConnectionError, Timeout, RequestException

logger = logging.getLogger(__name__)

_BASE_URL = "https://www.onemap.gov.sg/api"
_REQUEST_TIMEOUT = 10  # seconds


class OneMapClient:
    """OneMap API adapter with token caching and automatic fallback.

    Implements the LocationProvider protocol. On any network failure,
    delegates to MockLocationProvider to ensure the app stays functional.
    """

    def __init__(
        self,
        email: str | None = None,
        password: str | None = None,
        token: str | None = None,
        base_url: str | None = None,
    ) -> None:
        self._token: str | None = token or os.getenv("ONEMAP_TOKEN", "") or None
        self._token_expiry: datetime | None = None
        self._email = email if email is not None else os.getenv("ONEMAP_EMAIL", "")
        self._password = password if password is not None else os.getenv("ONEMAP_PASSWORD", "")
        self._base_url = base_url or _BASE_URL

    # ------------------------------------------------------------------
    # Token management
    # ------------------------------------------------------------------

    def _ensure_token(self) -> None:
        """Authenticate and cache the access token until it expires."""
        now = datetime.now(tz=timezone.utc)

        if self._token and (self._token_expiry is None or now < self._token_expiry):
            return

        if not self._email or not self._password:
            raise ValueError("OneMap credentials or ONEMAP_TOKEN are required")

        url = f"{self._base_url}/auth/post/getToken"
        payload = {"email": self._email, "password": self._password}

        resp = requests.post(url, json=payload, timeout=_REQUEST_TIMEOUT)
        resp.raise_for_status()

        data = resp.json()
        self._token = data["access_token"]

        # OneMap returns expiry as a Unix timestamp string
        expiry_ts = float(data["expiry_timestamp"])
        self._token_expiry = datetime.fromtimestamp(expiry_ts, tz=timezone.utc)

        logger.info("OneMap token refreshed, expires at %s", self._token_expiry.isoformat())

    # ------------------------------------------------------------------
    # Public API methods
    # ------------------------------------------------------------------

    def search_address(self, query: str) -> list[dict]:
        """Search for addresses matching query string.

        Uses the public elastic search endpoint (no auth required).
        Falls back to MockLocationProvider on error.
        """
        try:
            self._ensure_token()
            url = f"{self._base_url}/common/elastic/search"
            params = {
                "searchVal": query,
                "returnGeom": "Y",
                "getAddrDetails": "Y",
            }

            resp = requests.get(
                url,
                params=params,
                headers={"Authorization": self._token},
                timeout=_REQUEST_TIMEOUT,
            )
            resp.raise_for_status()

            data = resp.json()
            results = data.get("results", [])

            return [
                {
                    "address": r.get("ADDRESS", ""),
                    "latitude": float(r.get("LATITUDE", 0)),
                    "longitude": float(r.get("LONGITUDE", 0)),
                    "postalCode": r.get("POSTAL", ""),
                    "buildingName": r.get("BUILDING", None) or None,
                }
                for r in results
            ]

        except (ConnectionError, Timeout, RequestException) as exc:
            logger.warning("OneMap search_address failed, falling back to mock: %s", exc)
            return self._fallback().search_address(query)

    def reverse_geocode(self, lat: float, lng: float) -> dict | None:
        """Return address info for a coordinate pair.

        Requires authentication token.
        Falls back to MockLocationProvider on error.
        """
        try:
            self._ensure_token()

            url = f"{self._base_url}/privateapi/commonsvc/revgeocode"
            params = {
                "location": f"{lat},{lng}",
            }

            resp = requests.get(url, params=params, headers={"Authorization": self._token}, timeout=_REQUEST_TIMEOUT)
            resp.raise_for_status()

            data = resp.json()
            results = data.get("GeocodeInfo", [])

            if not results:
                return None

            r = results[0]
            # OneMap may return "NIL" for empty fields
            building = r.get("BUILDINGNAME", None)
            if building == "NIL":
                building = None

            return {
                "address": r.get("BLOCK", "") + " " + r.get("ROAD", ""),
                "latitude": lat,
                "longitude": lng,
                "postalCode": r.get("POSTALCODE", ""),
                "buildingName": building,
            }

        except (ConnectionError, Timeout, RequestException) as exc:
            logger.warning("OneMap reverse_geocode failed, falling back to mock: %s", exc)
            return self._fallback().reverse_geocode(lat, lng)

    def get_walking_route(self, origin: tuple, dest: tuple) -> dict:
        """Return walking route between two (lat, lng) tuples.

        Supports barrier-free route option via routeType=walk.
        Requires authentication token.
        Falls back to MockLocationProvider on error.
        """
        try:
            self._ensure_token()

            url = f"{self._base_url}/public/routingsvc/route"
            params = {
                "start": f"{origin[0]},{origin[1]}",
                "end": f"{dest[0]},{dest[1]}",
                "routeType": "walk",
            }

            resp = requests.get(url, params=params, headers={"Authorization": self._token}, timeout=_REQUEST_TIMEOUT)
            resp.raise_for_status()

            data = resp.json()
            route_info = data.get("route_summary", {})

            total_distance = float(route_info.get("total_distance", 0))
            total_time = int(route_info.get("total_time", 0))
            duration_minutes = max(1, round(total_time / 60))

            # Parse route instructions
            instructions = []
            for step in data.get("route_instructions", []):
                if isinstance(step, list) and len(step) > 1:
                    instructions.append(step[1])
                elif isinstance(step, dict):
                    instructions.append(step.get("instruction", ""))

            if not instructions:
                instructions = [
                    f"Walk {round(total_distance)}m to destination "
                    f"(approx. {duration_minutes} min)"
                ]

            return {
                "distanceMetres": round(total_distance),
                "durationMinutes": duration_minutes,
                "instructions": instructions,
                "geometry": data.get("route_geometry", ""),
                "source": "onemap",
            }

        except (ConnectionError, Timeout, RequestException) as exc:
            logger.warning("OneMap get_walking_route failed, falling back to mock: %s", exc)
            return self._fallback().get_walking_route(origin, dest)

    def get_public_transport_routes(
        self,
        origin: tuple[float, float],
        dest: tuple[float, float],
        departure: datetime,
        mode: str = "bus",
        max_itineraries: int = 3,
    ) -> list[dict]:
        """Return normalized OneMap public-transport itineraries."""
        self._ensure_token()
        params = {
            "start": f"{origin[0]},{origin[1]}",
            "end": f"{dest[0]},{dest[1]}",
            "routeType": "pt",
            "date": departure.strftime("%m-%d-%Y"),
            "time": departure.strftime("%H:%M:%S"),
            "mode": mode,
            "maxWalkDistance": "1500",
            "numItineraries": str(max(1, min(max_itineraries, 3))),
        }
        response = requests.get(
            f"{self._base_url}/public/routingsvc/route",
            params=params,
            headers={"Authorization": self._token},
            timeout=20,
        )
        response.raise_for_status()
        itineraries = response.json().get("plan", {}).get("itineraries", [])
        return [self._normalise_pt_itinerary(item) for item in itineraries]

    @staticmethod
    def _normalise_pt_itinerary(item: dict) -> dict:
        def timestamp(value) -> str:
            return datetime.fromtimestamp(float(value) / 1000, tz=timezone.utc).isoformat()

        legs = []
        for leg in item.get("legs", []):
            mode = str(leg.get("mode", "")).lower()
            legs.append(
                {
                    "mode": mode,
                    "route": str(leg.get("route", "")),
                    "from": (leg.get("from") or {}).get("name", ""),
                    "to": (leg.get("to") or {}).get("name", ""),
                    "durationMinutes": round(float(leg.get("duration", 0)) / 60),
                    "distanceMetres": round(float(leg.get("distance", 0))),
                    "geometry": (leg.get("legGeometry") or {}).get("points", ""),
                    "realTime": bool(leg.get("realTime", False)),
                }
            )
        return {
            "totalMinutes": round(float(item.get("duration", 0)) / 60),
            "walkingMinutes": round(float(item.get("walkTime", 0)) / 60),
            "transfers": int(item.get("transfers", 0)),
            "estimatedDeparture": timestamp(item.get("startTime", 0)),
            "estimatedArrival": timestamp(item.get("endTime", 0)),
            "legs": legs,
            "hasRealTimeLegs": any(leg["realTime"] for leg in legs),
            "source": "onemap",
            "sourceType": "estimated",
        }

    def get_nearby_transport(self, lat: float, lng: float) -> list[dict]:
        """Return nearby MRT stations for a coordinate.

        Uses the theme query endpoint for MRT station data.
        Requires authentication token.
        Falls back to MockLocationProvider on error.
        """
        try:
            self._ensure_token()

            url = f"{self._base_url}/public/nearbysvc/getNearestMrtStops"
            params = {"lat": lat, "lng": lng, "dist": 5000}

            resp = requests.get(url, params=params, headers={"Authorization": self._token}, timeout=_REQUEST_TIMEOUT)
            resp.raise_for_status()

            data = resp.json()
            features = data.get("SrchResults", [])

            # First entry is metadata, skip it
            stations = []
            for item in features:
                if isinstance(item, dict) and "LatLng" in item:
                    latlng = item["LatLng"].split(",")
                    if len(latlng) == 2:
                        slat = float(latlng[0])
                        slng = float(latlng[1])
                        # Calculate distance
                        from app.utils.haversine import haversine_distance
                        dist = haversine_distance(lat, lng, slat, slng)
                        stations.append({
                            "id": item.get("NAME", "").lower().replace(" ", "-"),
                            "name": item.get("NAME", ""),
                            "distanceMetres": round(dist),
                            "type": "MRT",
                        })

            # Sort by distance and return nearest 5
            stations.sort(key=lambda x: x["distanceMetres"])
            return stations[:5]

        except (ConnectionError, Timeout, RequestException) as exc:
            logger.warning("OneMap get_nearby_transport failed, falling back to mock: %s", exc)
            return self._fallback().get_nearby_transport(lat, lng)

    # ------------------------------------------------------------------
    # Barrier-free route support
    # ------------------------------------------------------------------

    def get_barrier_free_route(self, origin: tuple, dest: tuple) -> dict:
        """Return a barrier-free walking route between two (lat, lng) tuples.

        This is a specialised walking route that avoids stairs and other
        barriers, useful for wheelchair users. Falls back to standard
        walking route if barrier-free is not available.
        """
        try:
            self._ensure_token()

            url = f"{self._base_url}/bfa/routingsvc/route"
            params = {
                "start": f"{origin[0]},{origin[1]}",
                "end": f"{dest[0]},{dest[1]}",
                "routeType": "walk",
            }

            resp = requests.get(url, params=params, headers={"Authorization": self._token}, timeout=_REQUEST_TIMEOUT)
            resp.raise_for_status()

            data = resp.json()
            route_info = data.get("route_summary", {})

            total_distance = float(route_info.get("total_distance", 0))
            total_time = int(route_info.get("total_time", 0))
            duration_minutes = max(1, round(total_time / 60))

            instructions = []
            for step in data.get("route_instructions", []):
                if isinstance(step, list) and len(step) > 1:
                    instructions.append(step[1])
                elif isinstance(step, dict):
                    instructions.append(step.get("instruction", ""))

            if not instructions:
                instructions = [
                    f"Walk {round(total_distance)}m (barrier-free route, "
                    f"approx. {duration_minutes} min)"
                ]

            return {
                "distanceMetres": round(total_distance),
                "durationMinutes": duration_minutes,
                "instructions": instructions,
                "barrierFree": True,
            }

        except (ConnectionError, Timeout, RequestException) as exc:
            logger.warning(
                "OneMap barrier-free route failed, falling back to mock: %s", exc
            )
            return self._fallback().get_walking_route(origin, dest)

    # ------------------------------------------------------------------
    # Fallback
    # ------------------------------------------------------------------

    @staticmethod
    def _fallback():
        """Return MockLocationProvider instance for fallback."""
        from app.integrations.mock_adapter import MockLocationProvider
        return MockLocationProvider()
