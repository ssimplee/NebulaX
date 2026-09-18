"""Adapter for an OSRM-compatible routing service backed by OpenStreetMap."""

from __future__ import annotations

import requests


class OSMRoutingClient:
    """Use a configured OSRM deployment; no API key is required."""

    def __init__(self, base_url: str) -> None:
        if not base_url:
            raise ValueError("OSRM_BASE_URL is not configured")
        self._base_url = base_url.rstrip("/")

    def get_walking_route(self, origin: tuple, dest: tuple) -> dict:
        coordinates = f"{origin[1]},{origin[0]};{dest[1]},{dest[0]}"
        response = requests.get(
            f"{self._base_url}/route/v1/foot/{coordinates}",
            params={"overview": "full", "geometries": "geojson", "steps": "true"},
            timeout=10,
        )
        response.raise_for_status()
        payload = response.json()
        routes = payload.get("routes", [])
        if not routes:
            raise LookupError("OSM router returned no walking route")
        route = routes[0]
        instructions = [
            step.get("name") or step.get("maneuver", {}).get("type", "Continue")
            for leg in route.get("legs", [])
            for step in leg.get("steps", [])
        ]
        return {
            "distanceMetres": round(float(route.get("distance", 0))),
            "durationMinutes": max(1, round(float(route.get("duration", 0)) / 60)),
            "instructions": instructions,
            "geometryGeoJson": route.get("geometry"),
            "source": "osm_osrm",
        }
