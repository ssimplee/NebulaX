"""Door-to-door and decision-boundary tests for Rachel's commute."""

from app.integrations.mock_adapter import MockLocationProvider
from app.services.operational_conditions import load_rachel_scenario
from app.services.rachel_routing import plan_rachel_journey


class LocationProvider:
    def search_address(self, query):
        if "523858" in query:
            return [{"address": "858C TAMPINES WALK", "postalCode": "523858", "latitude": 1.355, "longitude": 103.94}]
        return [{"address": "1 GEORGE STREET", "postalCode": "049145", "latitude": 1.284, "longitude": 103.85}]

    def get_walking_route(self, origin, dest):
        return {"distanceMetres": 600, "durationMinutes": 8, "instructions": [], "geometry": "encoded"}


class LocationProviderWithBus(LocationProvider):
    def get_public_transport_routes(self, origin, dest, departure, mode, max_itineraries):
        return [
            {
                "totalMinutes": 55,
                "walkingMinutes": 10,
                "transfers": 1,
                "estimatedArrival": "2026-09-18T08:35:00+08:00",
                "hasRealTimeLegs": False,
                "legs": [
                    {"mode": "bus", "route": "BUS 23", "geometry": "encoded-bus"}
                ],
            }
        ]


def test_rachel_plan_is_door_to_door_and_map_ready():
    result = plan_rachel_journey(LocationProvider())

    assert result["journey"]["home"]["postalCode"] == "523858"
    assert result["journey"]["work"]["postalCode"] == "049145"
    assert result["original"]["geometry"]["rail"]["type"] == "LineString"
    assert result["original"]["geometry"]["accessWalkMinutes"] == 8
    assert result["original"]["geometry"]["egressWalkMinutes"] == 8
    assert result["original"]["walkingMinutes"] == 16
    assert result["alternatives"]


def test_mock_provider_supports_rachel_demo_without_onemap_credentials():
    result = plan_rachel_journey(MockLocationProvider())

    assert result["journey"]["home"]["postalCode"] == "523858"
    assert result["journey"]["work"]["postalCode"] == "049145"


def test_five_minutes_stays_quiet():
    scenario = load_rachel_scenario("five-minute-delay")

    result = plan_rachel_journey(LocationProvider(), scenario)

    assert result["decision"]["shouldNotify"] is False
    assert result["decision"]["originalArrival"].endswith("08:40:00+08:00")
    assert result["recommended"]["id"] == "EW"


def test_fifteen_minutes_notifies_and_avoids_affected_ewl():
    scenario = load_rachel_scenario("fifteen-minute-disruption")

    result = plan_rachel_journey(LocationProvider(), scenario)

    assert result["decision"]["shouldNotify"] is True
    assert result["recommended"]["id"] != "EW"
    assert "EW" not in result["recommended"]["id"].split("-")
    assert result["decision"]["originalArrival"].endswith("08:50:00+08:00")
    assert result["decision"]["recommendedArrival"] < result["decision"]["originalArrival"]
    assert result["decision"]["delayMinutesAvoided"] > 0
    assert result["decision"]["tradeOffs"]["extraMinutes"] < 0


def test_rachel_endpoint_uses_shared_contract(client, monkeypatch):
    monkeypatch.setattr("app.integrations.get_location_provider", lambda: LocationProvider())

    response = client.post(
        "/api/v1/routes/rachel/plan",
        json={"scenarioId": "fifteen-minute-disruption"},
    )

    assert response.status_code == 200
    assert response.get_json()["decision"]["shouldNotify"] is True


def test_bus_itinerary_is_exposed_as_an_alternative():
    result = plan_rachel_journey(
        LocationProviderWithBus(), load_rachel_scenario("fifteen-minute-disruption")
    )

    bus = next(item for item in result["alternatives"] if item["id"].startswith("BUS-"))
    assert bus["provenanceIds"] == ["onemap:pt-bus", "lta:bus-reference"]
    assert bus["geometry"]["legs"] == ["encoded-bus"]
    assert bus["confidence"]["score"] == 0.6
    assert bus["confidence"]["historicallyCalibrated"] is False


def test_when_all_routes_are_late_earliest_arrival_beats_fewer_transfers():
    result = plan_rachel_journey(
        LocationProviderWithBus(), load_rachel_scenario("fifteen-minute-disruption")
    )

    recommended_latest = result["recommended"]["arrivalRange"]["latest"]
    assert recommended_latest == min(
        item["arrivalRange"]["latest"] for item in result["alternatives"]
    )


def test_rachel_endpoint_accepts_explicit_departure_time(client, monkeypatch):
    monkeypatch.setattr("app.integrations.get_location_provider", lambda: LocationProvider())

    response = client.post(
        "/api/v1/routes/rachel/plan",
        json={"departureTime": "2026-09-19T07:30:00+08:00"},
    )

    assert response.status_code == 200
    assert response.get_json()["journey"]["departureTime"] == "2026-09-19T07:30:00+08:00"
