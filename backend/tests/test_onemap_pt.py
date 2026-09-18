"""Tests for OneMap public-transport normalization."""

from app.integrations.onemap_client import OneMapClient


def test_public_transport_itinerary_normalisation():
    item = {
        "duration": 3600,
        "walkTime": 600,
        "transfers": 1,
        "startTime": 1789688400000,
        "endTime": 1789692000000,
        "legs": [
            {
                "mode": "BUS",
                "route": "SBST BUS 10",
                "duration": 1800,
                "distance": 12000,
                "realTime": True,
                "from": {"name": "A"},
                "to": {"name": "B"},
                "legGeometry": {"points": "encoded"},
            }
        ],
    }

    result = OneMapClient._normalise_pt_itinerary(item)

    assert result["totalMinutes"] == 60
    assert result["walkingMinutes"] == 10
    assert result["legs"][0]["mode"] == "bus"
    assert result["legs"][0]["geometry"] == "encoded"
    assert result["hasRealTimeLegs"] is True
