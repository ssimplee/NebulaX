"""Operational-condition endpoints shared with routing and demo clients."""

from flask import Blueprint, jsonify, request

from app.services.operational_conditions import (
    get_operational_conditions,
    load_rachel_scenario,
)

operations_bp = Blueprint("operations", __name__)


@operations_bp.route("/operational-conditions", methods=["GET"])
def operational_conditions():
    station_ids = [
        value.strip()
        for value in request.args.get("stationIds", "").split(",")
        if value.strip()
    ]
    return jsonify(get_operational_conditions(station_ids or None))


@operations_bp.route("/demo/rachel/<scenario_id>", methods=["GET"])
def rachel_scenario(scenario_id: str):
    try:
        return jsonify(load_rachel_scenario(scenario_id))
    except ValueError as exc:
        return jsonify({"error": "unknown_scenario", "message": str(exc)}), 404
