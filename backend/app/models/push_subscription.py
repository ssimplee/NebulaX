"""Anonymous browser push subscriptions for journey notifications."""

from datetime import datetime

from app.extensions import db


class PushSubscription(db.Model):
    """A browser endpoint and its Web Push encryption keys.

    The identifier is a SHA-256 digest of the endpoint. No user, journey or
    location data is stored with the subscription.
    """

    __tablename__ = "push_subscription"

    id = db.Column(db.String(64), primary_key=True)
    endpoint = db.Column(db.Text, nullable=False)
    p256dh = db.Column(db.Text, nullable=False)
    auth = db.Column(db.Text, nullable=False)
    active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

