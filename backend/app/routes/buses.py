"""Bus topology and live-arrival endpoints for the routing engine."""

from flask import Blueprint, current_app, jsonify, request

from app.integrations.lta_bus_client import LTABusClient

buses_bp = Blueprint("buses", __name__)
_client: LTABusClient | None = None


def _bus_client() -> LTABusClient:
    global _client
    if _client is None:
        _client = LTABusClient(current_app.config.get("LTA_ACCOUNT_KEY", ""))
    return _client


@buses_bp.get("/bus/stops")
def bus_stops():
    return jsonify({"stops": _bus_client().get_bus_stops()})


@buses_bp.get("/bus/services")
def bus_services():
    return jsonify({"services": _bus_client().get_bus_services()})


@buses_bp.get("/bus/routes")
def bus_routes():
    return jsonify({"routes": _bus_client().get_bus_routes(request.args.get("serviceNo"))})


@buses_bp.get("/bus/stops/<bus_stop_code>/arrivals")
def bus_arrivals(bus_stop_code: str):
    return jsonify(_bus_client().get_arrivals(bus_stop_code, request.args.get("serviceNo")))
