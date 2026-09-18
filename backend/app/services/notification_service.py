"""Web Push delivery and location-free notification analytics."""

import base64
import hashlib
import json
from pathlib import Path
from uuid import uuid4

from flask import current_app
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models.notification_feedback import NotificationFeedback
from app.models.push_subscription import PushSubscription


def subscription_id(endpoint: str) -> str:
    return hashlib.sha256(endpoint.encode("utf-8")).hexdigest()


def save_subscription(data: dict) -> PushSubscription:
    identifier = subscription_id(data["endpoint"])
    subscription = db.session.get(PushSubscription, identifier)
    if subscription is None:
        subscription = PushSubscription(id=identifier, endpoint=data["endpoint"])
        db.session.add(subscription)
    subscription.p256dh = data["keys"]["p256dh"]
    subscription.auth = data["keys"]["auth"]
    subscription.active = True
    db.session.commit()
    return subscription


def remove_subscription(identifier: str) -> bool:
    subscription = db.session.get(PushSubscription, identifier)
    if subscription is None:
        return False
    db.session.delete(subscription)
    db.session.commit()
    return True


def record_feedback(data: dict) -> bool:
    """Store only coarse event metadata; schema rejects every extra field."""
    event = NotificationFeedback(
        event_id=data["eventId"],
        notification_id=data["notificationId"],
        recommendation_id=data["recommendationId"],
        event_type=data["eventType"],
        mode=data["mode"],
        language=data["language"],
        occurred_at=data["occurredAt"],
    )
    db.session.add(event)
    try:
        db.session.commit()
        return True
    except IntegrityError:
        db.session.rollback()
        return False


def public_vapid_key() -> str | None:
    configured = current_app.config.get("VAPID_PUBLIC_KEY", "").strip()
    if configured:
        return configured
    key_path = Path(current_app.config.get("VAPID_PRIVATE_KEY", ""))
    if not key_path.is_file():
        return None
    from cryptography.hazmat.primitives import serialization

    private_key = serialization.load_pem_private_key(key_path.read_bytes(), password=None)
    raw = private_key.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _send(subscription: PushSubscription, payload: dict) -> None:
    from pywebpush import webpush

    webpush(
        subscription_info={
            "endpoint": subscription.endpoint,
            "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
        },
        data=json.dumps(payload, ensure_ascii=False),
        vapid_private_key=current_app.config["VAPID_PRIVATE_KEY"],
        vapid_claims={"sub": current_app.config["VAPID_SUBJECT"]},
        ttl=300,
    )


def send_test_push(identifier: str) -> str:
    subscription = db.session.get(PushSubscription, identifier)
    if subscription is None or not subscription.active:
        return "not_found"
    if public_vapid_key() is None:
        return "not_configured"
    try:
        _send(subscription, {
            "title": "SGRail journey alerts enabled",
            "body": "You will receive important saved-journey updates here.",
            "url": "/journey",
            # A unique tag makes each button press a new notification instead
            # of silently replacing the previous test alert.
            "tag": f"sgrail-push-test-{uuid4().hex}",
        })
        return "sent"
    except Exception:
        current_app.logger.info("Web Push delivery failed")
        return "failed"


def send_journey_push(action: str, recommendation_id: str) -> int:
    """Member 2 can call this after producing a validated live recommendation."""
    if public_vapid_key() is None:
        return 0
    sent = 0
    for subscription in PushSubscription.query.filter_by(active=True).all():
        try:
            _send(subscription, {
                "title": "Your journey has changed",
                "body": action[:240],
                "url": "/journey",
                "tag": f"journey-{recommendation_id[:120]}",
            })
            sent += 1
        except Exception:
            current_app.logger.info("A Web Push journey delivery failed")
    return sent
