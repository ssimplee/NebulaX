"""Person-1 contract tests: live normalisation and deterministic demo data."""

import pytest

from app.integrations.lta_crowd_client import LTACrowdClient
from app.integrations.mock_adapter import MockWeatherProvider
from app.services.operational_conditions import (
    clear_operational_cache,
    get_operational_conditions,
    load_rachel_scenario,
)


@pytest.fixture(autouse=True)
def _clear_source_cache():
    clear_operational_cache()
    yield
    clear_operational_cache()


def _crowd_client() -> LTACrowdClient:
    return LTACrowdClient(account_key="test-key", base_url="https://example.invalid")


def test_realtime_crowd_normalises_and_preserves_provenance():
    records = _crowd_client().normalise_realtime(
        {"value": [{"Station": "EW2", "Start": "2026-09-18T07:30:00+08:00", "CrowdLevel": "h"}]}
    )

    assert records[0]["stationId"] == "tampines"
    assert records[0]["level"] == "crowded"
    assert records[0]["sourceType"] == "live"


def test_forecast_is_not_mislabeled_as_live():
    records = _crowd_client().normalise_forecast(
        {
            "value": [
                {
                    "Station": "EW14",
                    "Interval": [
                        {"Start": "2026-09-18T08:00:00+08:00", "CrowdLevel": "m"}
                    ],
                }
            ]
        }
    )

    assert records[0]["stationId"] == "raffles-place"
    assert records[0]["level"] == "moderate"
    assert records[0]["sourceType"] == "forecast"


def test_unknown_crowd_records_are_skipped():
    assert _crowd_client().normalise_realtime(
        {"value": [{"Station": "UNKNOWN", "CrowdLevel": "NA"}]}
    ) == []


def test_demo_scenarios_encode_official_rachel_boundaries():
    assert load_rachel_scenario("normal")["expected"]["shouldNotify"] is False
    assert load_rachel_scenario("five-minute-delay")["expected"]["shouldNotify"] is False
    assert load_rachel_scenario("fifteen-minute-disruption")["expected"]["shouldNotify"] is True
    assert load_rachel_scenario("planned-change")["serviceAlerts"][0]["kind"] == "planned"


def test_unknown_demo_scenario_is_rejected():
    try:
        load_rachel_scenario("../../secret")
    except ValueError as exc:
        assert "Unknown Rachel scenario" in str(exc)
    else:
        raise AssertionError("unknown scenario should be rejected")


def test_operational_contract_filters_stations(monkeypatch):
    class Crowd:
        def get_all_crowd(self):
            return [
                {"stationId": "tampines", "source": "simulated"},
                {"stationId": "bishan", "source": "simulated"},
            ]

    monkeypatch.setattr("app.integrations.get_crowd_provider", lambda: Crowd())
    monkeypatch.setattr(
        "app.integrations.get_weather_provider", lambda: MockWeatherProvider()
    )
    monkeypatch.setattr("app.services.alert_service.get_active_alerts", lambda: [])

    result = get_operational_conditions(["tampines", "raffles-place"])

    assert [item["stationId"] for item in result["crowdReadings"]] == ["tampines"]
    assert set(result) == {
        "serviceAlerts",
        "crowdReadings",
        "weather",
        "facilityOutages",
        "observedAt",
        "dataQuality",
    }
    assert result["dataQuality"]["simulatedSources"]


def test_operational_contract_surfaces_stale_sources(monkeypatch):
    class Crowd:
        def get_all_crowd(self):
            return [
                {
                    "stationId": "tampines",
                    "source": "lta_datamall",
                    "sourceType": "live",
                    "isStale": True,
                }
            ]

    monkeypatch.setattr("app.integrations.get_crowd_provider", lambda: Crowd())
    monkeypatch.setattr(
        "app.integrations.get_weather_provider", lambda: MockWeatherProvider()
    )
    monkeypatch.setattr("app.services.alert_service.get_active_alerts", lambda: [])

    result = get_operational_conditions()

    assert result["dataQuality"]["staleSources"] == ["lta_datamall"]


def test_operational_sources_are_cached_and_report_health(monkeypatch):
    calls = {"crowd": 0}

    class Crowd:
        def get_all_crowd(self):
            calls["crowd"] += 1
            return [{"stationId": "tampines", "source": "lta_datamall"}]

    monkeypatch.setattr("app.integrations.get_crowd_provider", lambda: Crowd())
    monkeypatch.setattr(
        "app.integrations.get_weather_provider", lambda: MockWeatherProvider()
    )
    monkeypatch.setattr("app.services.alert_service.get_active_alerts", lambda: [])

    get_operational_conditions()
    result = get_operational_conditions()

    assert calls["crowd"] == 1
    assert result["dataQuality"]["providerHealth"]["platform_crowd"]["cached"] is True


def test_failed_refresh_can_return_labelled_stale_data(monkeypatch):
    from app.services import operational_conditions as service

    service._source_cache["crowd"] = (
        0.0,
        [{"stationId": "tampines", "source": "lta_datamall", "isStale": False}],
    )

    class BrokenCrowd:
        def get_all_crowd(self):
            raise RuntimeError("upstream unavailable")

    monkeypatch.setattr("app.integrations.get_crowd_provider", lambda: BrokenCrowd())
    monkeypatch.setattr(
        "app.integrations.get_weather_provider", lambda: MockWeatherProvider()
    )
    monkeypatch.setattr("app.services.alert_service.get_active_alerts", lambda: [])

    result = get_operational_conditions()

    assert result["crowdReadings"][0]["isStale"] is True
    assert result["dataQuality"]["providerHealth"]["platform_crowd"]["available"] is False
    assert result["dataQuality"]["errors"][0]["source"] == "platform_crowd"


def test_demo_scenario_endpoint(client):
    response = client.get("/api/v1/demo/rachel/fifteen-minute-disruption")

    assert response.status_code == 200
    assert response.get_json()["expected"]["shouldNotify"] is True


def test_unknown_demo_scenario_endpoint_returns_404(client):
    response = client.get("/api/v1/demo/rachel/not-real")

    assert response.status_code == 404
    assert response.get_json()["error"] == "unknown_scenario"


def test_operational_conditions_endpoint_uses_stable_contract(client):
    response = client.get(
        "/api/v1/operational-conditions?stationIds=tampines,raffles-place"
    )

    assert response.status_code == 200
    assert set(response.get_json()) == {
        "serviceAlerts",
        "crowdReadings",
        "weather",
        "facilityOutages",
        "observedAt",
        "dataQuality",
    }
