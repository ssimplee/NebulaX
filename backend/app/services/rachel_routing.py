"""Deterministic door-to-door routing and decision support for Rachel."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.services.route_engine import ROUTE_GRAPH, find_routes
from app.services.route_formatter import compute_route_summary, format_route_steps

SGT = timezone(timedelta(hours=8))
HOME_ADDRESS = "858C Tampines Walk, Singapore 523858"
WORK_ADDRESS = "1 George St, Singapore 049145"
ORIGIN_STATION_ID = "tampines"
DESTINATION_STATION_ID = "raffles-place"
ARRIVAL_HOUR = 8
ARRIVAL_MINUTE = 45
# The route graph currently under-counts Rachel's familiar EWL journey because
# it models the rail path but not the full observed door-to-door baseline.  The
# PS2 persona fixes that routine at 07:40 -> 08:35 (55 minutes).  Disruption
# impact must be added to this baseline, otherwise a "15-minute delay" merely
# produces the normal 08:35 arrival and can recommend a slower alternative.
RACHEL_USUAL_TOTAL_MINUTES = 55
_STATIONS_PATH = Path(__file__).resolve().parents[1] / "data" / "stations.json"


def _station(station_id: str) -> dict:
    stations = json.loads(_STATIONS_PATH.read_text(encoding="utf-8"))
    return next(item for item in stations if item["id"] == station_id)


def _geocode_one(provider, address: str, postal_code: str) -> dict:
    results = provider.search_address(postal_code) or provider.search_address(address)
    if not results:
        raise LookupError(f"OneMap could not geocode {address}")
    exact = next(
        (item for item in results if str(item.get("postalCode", "")) == postal_code),
        results[0],
    )
    return {
        "address": exact.get("address") or address,
        "postalCode": exact.get("postalCode") or postal_code,
        "latitude": float(exact["latitude"]),
        "longitude": float(exact["longitude"]),
        "source": "onemap",
    }


def _geometry_for_path(path: list[tuple[str, str]]) -> dict:
    stations = json.loads(_STATIONS_PATH.read_text(encoding="utf-8"))
    by_id = {item["id"]: item for item in stations}
    coordinates: list[list[float]] = []
    previous = None
    for station_id, _line in path:
        if station_id == previous:
            continue
        item = by_id[station_id]
        coordinates.append([item["longitude"], item["latitude"]])
        previous = station_id
    return {"type": "LineString", "coordinates": coordinates}


def _walking_route(provider, origin: tuple, dest: tuple) -> dict:
    """Prefer a configured OSM router, with OneMap as the live fallback."""
    from app.config import BaseConfig

    if BaseConfig.OSRM_BASE_URL:
        try:
            from app.integrations.osm_routing_client import OSMRoutingClient

            return OSMRoutingClient(BaseConfig.OSRM_BASE_URL).get_walking_route(origin, dest)
        except Exception:
            pass
    return provider.get_walking_route(origin, dest)


def _candidate(
    path,
    access: dict,
    egress: dict,
    departure: datetime,
    delay: int = 0,
    minimum_base_minutes: int = 0,
) -> dict:
    steps = format_route_steps(path)
    rail = compute_route_summary(path, steps)
    calculated_base = access["durationMinutes"] + rail["totalMinutes"] + egress["durationMinutes"]
    total = max(calculated_base, minimum_base_minutes) + delay
    arrival = departure + timedelta(minutes=total)
    uncertainty = max(3, round(total * 0.1))
    return {
        "id": "-".join(dict.fromkeys(node[1] for node in path)),
        "totalMinutes": total,
        "railMinutes": rail["totalMinutes"],
        "walkingMinutes": access["durationMinutes"] + egress["durationMinutes"],
        "transfers": rail["transfers"],
        "estimatedArrival": arrival.isoformat(),
        "arrivalRange": {
            "earliest": (arrival - timedelta(minutes=uncertainty)).isoformat(),
            "latest": (arrival + timedelta(minutes=uncertainty)).isoformat(),
        },
        "uncertaintyMinutes": uncertainty,
        "delayMinutes": delay,
        "steps": steps,
        "geometry": {
            "accessWalkMinutes": access["durationMinutes"],
            "accessWalkEncoded": access.get("geometry", ""),
            "accessWalkGeoJson": access.get("geometryGeoJson"),
            "rail": _geometry_for_path(path),
            "egressWalkMinutes": egress["durationMinutes"],
            "egressWalkEncoded": egress.get("geometry", ""),
            "egressWalkGeoJson": egress.get("geometryGeoJson"),
        },
        "provenanceIds": [f"{access.get('source', 'onemap')}:walk", "internal:mrt-graph"],
        "confidence": {
            "level": "medium",
            "score": 0.7,
            "basis": "Walking route plus estimated MRT graph timings; uncertainty range applied.",
            "historicallyCalibrated": False,
        },
    }


def _bus_candidates(provider, home: dict, work: dict, departure: datetime) -> list[dict]:
    get_routes = getattr(provider, "get_public_transport_routes", None)
    if not callable(get_routes):
        return []
    try:
        routes = get_routes(
            (home["latitude"], home["longitude"]),
            (work["latitude"], work["longitude"]),
            departure,
            mode="bus",
            max_itineraries=3,
        )
    except Exception:
        return []
    candidates = []
    for index, route in enumerate(routes):
        total = int(route["totalMinutes"])
        uncertainty = max(5, round(total * 0.15))
        arrival = datetime.fromisoformat(route["estimatedArrival"])
        bus_services = [
            leg["route"] for leg in route.get("legs", []) if leg.get("mode") == "bus" and leg.get("route")
        ]
        candidates.append(
            {
                "id": "BUS-" + ("-".join(bus_services) or str(index + 1)),
                "totalMinutes": total,
                "railMinutes": 0,
                "walkingMinutes": int(route.get("walkingMinutes", 0)),
                "transfers": int(route.get("transfers", 0)),
                "estimatedArrival": arrival.isoformat(),
                "arrivalRange": {
                    "earliest": (arrival - timedelta(minutes=uncertainty)).isoformat(),
                    "latest": (arrival + timedelta(minutes=uncertainty)).isoformat(),
                },
                "uncertaintyMinutes": uncertainty,
                "delayMinutes": 0,
                "steps": route.get("legs", []),
                "geometry": {"legs": [leg.get("geometry", "") for leg in route.get("legs", [])]},
                "provenanceIds": ["onemap:pt-bus", "lta:bus-reference"],
                "confidence": {
                    "level": "high" if route.get("hasRealTimeLegs") else "medium",
                    "score": 0.8 if route.get("hasRealTimeLegs") else 0.6,
                    "basis": (
                        "OneMap itinerary includes real-time transport legs."
                        if route.get("hasRealTimeLegs")
                        else "OneMap scheduled itinerary; live arrival validation not available for every leg."
                    ),
                    "historicallyCalibrated": False,
                },
            }
        )
    return candidates


def plan_rachel_journey(provider, scenario: dict | None = None, departure: datetime | None = None) -> dict:
    """Plan and rank Rachel's fixed commute, optionally under a scenario."""
    departure = departure or datetime.now(SGT).replace(hour=7, minute=40, second=0, microsecond=0)
    if departure.tzinfo is None:
        departure = departure.replace(tzinfo=SGT)
    arrival_goal = departure.replace(hour=ARRIVAL_HOUR, minute=ARRIVAL_MINUTE)

    home = _geocode_one(provider, HOME_ADDRESS, "523858")
    work = _geocode_one(provider, WORK_ADDRESS, "049145")
    origin_station = _station(ORIGIN_STATION_ID)
    destination_station = _station(DESTINATION_STATION_ID)
    access = _walking_route(
        provider,
        (home["latitude"], home["longitude"]),
        (origin_station["latitude"], origin_station["longitude"]),
    )
    egress = _walking_route(
        provider,
        (destination_station["latitude"], destination_station["longitude"]),
        (work["latitude"], work["longitude"]),
    )

    alerts = (scenario or {}).get("serviceAlerts", [])
    delay = max((int(item.get("estimatedDelayMinutes", 0)) for item in alerts), default=0)
    affected_lines = {item.get("lineCode") for item in alerts if item.get("severity") == "major"}

    original_path = find_routes(
        ROUTE_GRAPH, ORIGIN_STATION_ID, DESTINATION_STATION_ID, "FASTEST", max_routes=1
    )[0][0]
    original = _candidate(
        original_path,
        access,
        egress,
        departure,
        delay,
        minimum_base_minutes=RACHEL_USUAL_TOTAL_MINUTES,
    )
    alternative_paths = find_routes(
        ROUTE_GRAPH,
        ORIGIN_STATION_ID,
        DESTINATION_STATION_ID,
        "FASTEST",
        avoid_lines=sorted(line for line in affected_lines if line),
        max_routes=3,
    )
    alternatives = [
        _candidate(path, access, egress, departure)
        for path, _cost in alternative_paths
        if path != original_path
    ]
    if not alternatives:
        alternatives = [
            _candidate(path, access, egress, departure)
            for path, _cost in find_routes(
                ROUTE_GRAPH, ORIGIN_STATION_ID, DESTINATION_STATION_ID, "FASTEST", max_routes=3
            )[1:]
        ]

    alternatives.extend(_bus_candidates(provider, home, work, departure))

    # Always rank the original alongside alternatives.  This prevents the app
    # from recommending a reroute that is worse than simply staying put.
    candidates = [original, *alternatives]
    def rank_key(item):
        latest = datetime.fromisoformat(item["arrivalRange"]["latest"])
        late_minutes = max(0, (latest - arrival_goal).total_seconds() / 60)
        return (
            late_minutes > 0,
            late_minutes,
            item["transfers"],
            item["walkingMinutes"],
            item["totalMinutes"],
        )

    candidates.sort(key=rank_key)
    recommended = candidates[0]
    original_arrival = datetime.fromisoformat(original["estimatedArrival"])
    should_notify = original_arrival > arrival_goal
    if not should_notify:
        # Rachel checks no app on an ordinary day.  A route that ranks slightly
        # better is not a recommendation unless her usual journey is at risk.
        recommended = original
    recommended_arrival = datetime.fromisoformat(recommended["estimatedArrival"])
    minutes_avoided = max(
        0,
        round((original_arrival - recommended_arrival).total_seconds() / 60),
    )
    action = (
        f"Use {recommended['id']} now; estimated arrival {recommended_arrival.astimezone(SGT).strftime('%H:%M')}."
        if should_notify and recommended["id"] != original["id"]
        else "Stay on your usual route; no alternative improves the projected arrival."
        if should_notify
        else "Stay on your usual route; the current impact is within Rachel's tolerance."
    )

    if should_notify:
        reason = (
            f"The disruption moves Rachel's projected arrival to "
            f"{original_arrival.astimezone(SGT).strftime('%H:%M')}, after her 08:45 deadline."
        )
    else:
        reason = (
            f"The estimated {delay}-minute impact keeps Rachel's projected arrival at "
            f"{original_arrival.astimezone(SGT).strftime('%H:%M')}, within her 08:45 deadline."
        )

    return {
        "personaId": "rachel",
        "journey": {
            "home": home,
            "work": work,
            "originStationId": ORIGIN_STATION_ID,
            "destinationStationId": DESTINATION_STATION_ID,
            "departureTime": departure.isoformat(),
            "arriveBy": arrival_goal.isoformat(),
        },
        "original": original,
        "alternatives": alternatives,
        "recommended": recommended,
        "decision": {
            "shouldNotify": should_notify,
            "action": action,
            "reason": reason,
            "originalArrival": original["estimatedArrival"],
            "recommendedArrival": recommended["estimatedArrival"],
            "delayMinutesAvoided": minutes_avoided,
            "tradeOffs": {
                "extraMinutes": recommended["totalMinutes"] - original["totalMinutes"],
                "extraTransfers": recommended["transfers"] - original["transfers"],
            },
            "provenanceIds": sorted(set(original["provenanceIds"] + recommended["provenanceIds"])),
        },
        "scenarioId": (scenario or {}).get("id"),
        "sourceType": (scenario or {}).get("sourceType", "live"),
    }
