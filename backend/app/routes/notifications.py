"""Member 4 Web Push subscriptions and privacy-limited feedback endpoints."""

from flask import Blueprint, jsonify, request
from marshmallow import ValidationError

from app.extensions import limiter
from app.schemas.notification_schema import (
    NotificationFeedbackSchema,
    PushSubscriptionSchema,
)
from app.services.notification_service import (
    public_vapid_key,
    record_feedback,
    remove_subscription,
    save_subscription,
    send_test_push,
)

notifications_bp = Blueprint("notifications", __name__)
_subscription_schema = PushSubscriptionSchema()
_feedback_schema = NotificationFeedbackSchema()


@notifications_bp.get("/notifications/push/public-key")
def get_push_public_key():
    key = public_vapid_key()
    if key is None:
        return jsonify({"error": "push_not_configured"}), 503
    return jsonify({"publicKey": key})


@notifications_bp.post("/notifications/push/subscriptions")
@limiter.limit("10/hour")
def create_push_subscription():
    try:
        data = _subscription_schema.load(request.get_json(silent=True))
    except ValidationError as err:
        return jsonify({"error": "validation_error", "details": err.messages}), 400
    subscription = save_subscription(data)
    return jsonify({"subscriptionId": subscription.id}), 201


@notifications_bp.delete("/notifications/push/subscriptions/<identifier>")
def delete_push_subscription(identifier: str):
    if len(identifier) != 64:
        return jsonify({"error": "not_found"}), 404
    return ("", 204) if remove_subscription(identifier) else (jsonify({"error": "not_found"}), 404)


@notifications_bp.post("/notifications/push/subscriptions/<identifier>/test")
@limiter.limit("5/hour")
def test_push_subscription(identifier: str):
    result = send_test_push(identifier)
    status = {"sent": 200, "not_found": 404, "not_configured": 503, "failed": 502}[result]
    return jsonify({"status": result}), status


@notifications_bp.post("/notifications/analytics")
@limiter.limit("120/hour")
def create_notification_feedback():
    try:
        data = _feedback_schema.load(request.get_json(silent=True))
    except ValidationError as err:
        return jsonify({"error": "validation_error", "details": err.messages}), 400
    created = record_feedback(data)
    return jsonify({"status": "recorded" if created else "duplicate"}), 202 if created else 200

