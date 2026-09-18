"""Stable Person-1 handoff contract for operational journey conditions."""

from __future__ import annotations

import json
import threading
import time
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path


_SCENARIO_DIR = Path(__file__).resolve().parents[1] / "data" / "scenarios"
_CACHE_TTLS = {"crowd": 60, "weather": 120, "facilities": 300}
_source_cache: dict[str, tuple[float, object]] = {}
_cache_lock = threading.Lock()


def clear_operational_cache() -> None:
    """Clear provider caches; primarily used by tests and config changes."""
    with _cache_lock:
        _source_cache.clear()


def _mark_stale(value):
    stale = deepcopy(value)
    items = stale if isinstance(stale, list) else [stale]
    for item in items:
        if isinstance(item, dict):
            item["isStale"] = True
    return stale


def _read_source(name: str, loader, empty):
    """Read a provider with TTL caching and stale-on-error fallback."""
    now = time.monotonic()
    with _cache_lock:
        cached = _source_cache.get(name)
        if cached and now - cached[0] < _CACHE_TTLS[name]:
            return deepcopy(cached[1]), {"available": True, "cached": True, "stale": False}, None
    try:
        value = loader()
    except Exception as exc:
        if cached:
            return _mark_stale(cached[1]), {"available": False, "cached": True, "stale": True}, str(exc)
        return empty, {"available": False, "cached": False, "stale": False}, str(exc)
    with _cache_lock:
        _source_cache[name] = (now, deepcopy(value))
    return value, {"available": True, "cached": False, "stale": False}, None


def get_operational_conditions(station_ids: list[str] | None = None) -> dict:
    """Aggregate providers without exposing their raw response formats."""
    from app.integrations import (
        get_crowd_provider,
        get_facility_provider,
        get_weather_provider,
    )
    from app.services.alert_service import alert_provider_health, get_active_alerts

    errors: list[dict] = []
    simulated_sources: list[str] = []
    stale_sources: list[str] = []
    provider_health: dict[str, dict] = {}

    try:
        service_alerts = get_active_alerts()
        provider_health["train_service_alerts"] = alert_provider_health()
        if not provider_health["train_service_alerts"]["available"]:
            errors.append({"source": "train_service_alerts", "error": provider_health["train_service_alerts"]["error"]})
    except Exception as exc:
        service_alerts = []
        errors.append({"source": "train_service_alerts", "error": str(exc)})

    try:
        crowd, provider_health["platform_crowd"], error = _read_source(
            "crowd", lambda: get_crowd_provider().get_all_crowd(), []
        )
        if error:
            errors.append({"source": "platform_crowd", "error": error})
        if station_ids:
            wanted = set(station_ids)
            crowd = [item for item in crowd if item.get("stationId") in wanted]
    except Exception as exc:
        crowd = []
        errors.append({"source": "platform_crowd", "error": str(exc)})

    try:
        weather, provider_health["weather"], error = _read_source(
            "weather", lambda: get_weather_provider().get_commute_weather(), {}
        )
        if error:
            errors.append({"source": "weather", "error": error})
    except Exception as exc:
        weather = {}
        errors.append({"source": "weather", "error": str(exc)})

    try:
        facility_outages, provider_health["facilities_maintenance"], error = _read_source(
            "facilities", lambda: get_facility_provider().get_outages(), []
        )
        if error:
            errors.append({"source": "facilities_maintenance", "error": error})
    except Exception as exc:
        facility_outages = []
        errors.append({"source": "facilities_maintenance", "error": str(exc)})

    for item in [*service_alerts, *crowd, weather, *facility_outages]:
        if not isinstance(item, dict):
            continue
        source = str(item.get("source", "unknown"))
        if item.get("sourceType") == "simulated" or source == "simulated":
            simulated_sources.append(source)
        if item.get("isStale") is True:
            stale_sources.append(source)

    return {
        "serviceAlerts": service_alerts,
        "crowdReadings": crowd,
        "weather": weather,
        "facilityOutages": facility_outages,
        "observedAt": datetime.now(timezone.utc).isoformat(),
        "dataQuality": {
            "staleSources": sorted(set(stale_sources)),
            "simulatedSources": sorted(set(simulated_sources)),
            "errors": errors,
            "providerHealth": provider_health,
        },
    }


def load_rachel_scenario(scenario_id: str) -> dict:
    """Load an allow-listed deterministic fixture by public scenario ID."""
    allowed = {
        "normal": "rachel_normal.json",
        "five-minute-delay": "rachel_five_minute_delay.json",
        "fifteen-minute-disruption": "rachel_fifteen_minute_disruption.json",
        "planned-change": "rachel_planned_change.json",
    }
    filename = allowed.get(scenario_id)
    if filename is None:
        raise ValueError(f"Unknown Rachel scenario: {scenario_id}")
    return json.loads((_SCENARIO_DIR / filename).read_text(encoding="utf-8"))
