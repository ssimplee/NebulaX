"""Tests for the configurable OSM/OSRM walking adapter."""

from app.integrations.osm_routing_client import OSMRoutingClient


class Response:
    def raise_for_status(self):
        return None

    def json(self):
        return {
            "routes": [
                {
                    "distance": 620.4,
                    "duration": 480,
                    "geometry": {"type": "LineString", "coordinates": [[103.9, 1.3], [103.91, 1.31]]},
                    "legs": [{"steps": [{"name": "Tampines Walk"}]}],
                }
            ]
        }


def test_osm_route_uses_lon_lat_order_and_returns_geojson(monkeypatch):
    captured = {}

    def fake_get(url, **kwargs):
        captured["url"] = url
        return Response()

    monkeypatch.setattr("app.integrations.osm_routing_client.requests.get", fake_get)
    result = OSMRoutingClient("https://router.example").get_walking_route(
        (1.3, 103.9), (1.31, 103.91)
    )

    assert "103.9,1.3;103.91,1.31" in captured["url"]
    assert result["durationMinutes"] == 8
    assert result["geometryGeoJson"]["type"] == "LineString"
    assert result["source"] == "osm_osrm"
