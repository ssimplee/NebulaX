"""Member 4 push subscription and location-free analytics tests."""

from unittest.mock import patch


SUBSCRIPTION = {
    "endpoint": "https://push.example.test/subscription/abc",
    "expirationTime": None,
    "keys": {"p256dh": "p" * 65, "auth": "a" * 24},
}


def test_subscription_create_and_delete(client):
    created = client.post("/api/v1/notifications/push/subscriptions", json=SUBSCRIPTION)
    assert created.status_code == 201
    identifier = created.get_json()["subscriptionId"]
    assert len(identifier) == 64
    assert client.delete(f"/api/v1/notifications/push/subscriptions/{identifier}").status_code == 204


def test_subscription_rejects_extra_location_data(client):
    payload = {**SUBSCRIPTION, "rawLocationHistory": [{"lat": 1.3, "lng": 103.8}]}
    response = client.post("/api/v1/notifications/push/subscriptions", json=payload)
    assert response.status_code == 400


def test_feedback_is_idempotent_and_location_free(client):
    payload = {
        "eventId": "event-12345678",
        "notificationId": "demo:recommendation-disrupted:1",
        "recommendationId": "recommendation-disrupted",
        "eventType": "useful",
        "mode": "demo",
        "language": "en",
        "occurredAt": "2026-09-21T07:26:00+08:00",
    }
    assert client.post("/api/v1/notifications/analytics", json=payload).status_code == 202
    assert client.post("/api/v1/notifications/analytics", json=payload).status_code == 200
    rejected = client.post("/api/v1/notifications/analytics", json={**payload, "latitude": 1.3})
    assert rejected.status_code == 400


def test_test_push_uses_saved_subscription(client, app):
    identifier = client.post("/api/v1/notifications/push/subscriptions", json=SUBSCRIPTION).get_json()["subscriptionId"]
    app.config.update(VAPID_PUBLIC_KEY="test-public", VAPID_PRIVATE_KEY="test-private")
    with patch("app.services.notification_service._send") as send:
        first = client.post(f"/api/v1/notifications/push/subscriptions/{identifier}/test")
        second = client.post(f"/api/v1/notifications/push/subscriptions/{identifier}/test")
    assert first.status_code == 200
    assert second.status_code == 200
    assert send.call_count == 2
    assert send.call_args_list[0].args[1]["tag"] != send.call_args_list[1].args[1]["tag"]
