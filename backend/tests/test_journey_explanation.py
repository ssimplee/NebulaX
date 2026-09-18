"""Member 4 journey explanation boundary and deterministic fallback tests."""
import json
from pathlib import Path


def fixture(name="disrupted"):
    path = Path(__file__).parents[2] / "frontend" / "src" / "features" / "rachel" / "fixtures" / f"{name}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def test_explanation_works_without_ai_key(client):
    response = client.post("/api/v1/assistant/explain-journey", json={"context": fixture()})
    assert response.status_code == 200
    body = response.get_json()
    assert body["mode"] == "deterministic"
    assert body["explanation"]["snapshotId"] == "rachel-disrupted-v1"
    assert body["explanation"]["shouldNotify"] is True


def test_explanation_rejects_inconsistent_decision(client):
    context = fixture()
    context["recommendation"]["delayMinutesAvoided"] = 99
    response = client.post("/api/v1/assistant/explain-journey", json={"context": context})
    assert response.status_code == 400
    assert response.get_json()["error"] == "validation_error"


def test_explanation_rejects_extra_context(client):
    context = fixture()
    context["rawLocationHistory"] = [{"lat": 1.0, "lng": 103.0}]
    response = client.post("/api/v1/assistant/explain-journey", json={"context": context})
    assert response.status_code == 400
