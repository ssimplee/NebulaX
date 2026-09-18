"""Tests for LTA lift-maintenance normalisation."""

from app.integrations.lta_facilities_client import LTAFacilitiesClient


class Response:
    def raise_for_status(self):
        return None

    def json(self):
        return {
            "value": [
                {
                    "Line": "NEL",
                    "StationCode": "NE12",
                    "StationName": "Serangoon",
                    "LiftID": "B1L01",
                    "LiftDesc": "Exit B Street level - Concourse",
                }
            ]
        }


def test_facility_maintenance_is_normalised(monkeypatch):
    monkeypatch.setattr(
        "app.integrations.lta_facilities_client.requests.get",
        lambda *args, **kwargs: Response(),
    )

    outage = LTAFacilitiesClient("test-key").get_outages()[0]

    assert outage["lineCode"] == "NE"
    assert outage["stationCode"] == "NE12"
    assert outage["liftId"] == "B1L01"
    assert outage["sourceType"] == "live"
