"""Privacy-limited journey-notification analytics."""

from datetime import datetime

from app.extensions import db


class NotificationFeedback(db.Model):
    """A coarse notification event without user or location history."""

    __tablename__ = "notification_feedback"

    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.String(64), nullable=False, unique=True, index=True)
    notification_id = db.Column(db.String(180), nullable=False, index=True)
    recommendation_id = db.Column(db.String(120), nullable=False, index=True)
    event_type = db.Column(db.String(24), nullable=False, index=True)
    mode = db.Column(db.String(8), nullable=False)
    language = db.Column(db.String(2), nullable=False)
    occurred_at = db.Column(db.DateTime(timezone=True), nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

