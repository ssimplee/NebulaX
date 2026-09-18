"""Contract tests for Person 1's LTA bus integration."""

import pytest

from app.integrations.lta_bus_client import LTABusClient


class Response:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class Session:
    def __init__(self, payloads):
        self.payloads = list(payloads)
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return Response(self.payloads.pop(0))


def client_with(*payloads):
    client = LTABusClient("test-key", "https://example.invalid")
    client._session = Session(payloads)
    return client


def test_bus_stops_are_paginated_and_normalised():
    first = [
        {"BusStopCode": str(index).zfill(5), "RoadName": "Road", "Description": "Stop", "Latitude": 1.3, "Longitude": 103.8}
        for index in range(500)
    ]
    client = client_with({"value": first}, {"value": []})

    stops = client.get_bus_stops()

    assert len(stops) == 500
    assert stops[0]["busStopCode"] == "00000"
    assert client._session.calls[1][1]["params"]["$skip"] == 500


def test_reference_data_is_cached():
    client = client_with({"value": []})

    client.get_bus_services()
    client.get_bus_services()

    assert len(client._session.calls) == 1


def test_arrival_v3_preserves_eta_load_and_accessibility():
    client = client_with(
        {
            "BusStopCode": "75009",
            "Services": [
                {
                    "ServiceNo": "10",
                    "Operator": "SBST",
                    "NextBus": {
                        "EstimatedArrival": "2026-09-18T08:00:00+08:00",
                        "Monitored": "1",
                        "Load": "LSD",
                        "Feature": "WAB",
                        "Type": "DD",
                    },
                    "NextBus2": {},
                    "NextBus3": {},
                }
            ],
        }
    )

    result = client.get_arrivals("75009")
    bus = result["services"][0]["arrivals"][0]

    assert bus["load"] == "crowded"
    assert bus["wheelchairAccessible"] is True
    assert bus["monitored"] is True
    assert result["sourceType"] == "live"


@pytest.mark.parametrize("code", ["", "1234", "abcde", "123456"])
def test_invalid_bus_stop_code_is_rejected(code):
    with pytest.raises(ValueError):
        LTABusClient("test-key").get_arrivals(code)
