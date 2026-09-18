"""Strict Web Push and privacy-limited analytics schemas."""

from marshmallow import Schema, fields, validate


class PushKeysSchema(Schema):
    p256dh = fields.String(required=True, validate=validate.Length(min=16, max=512))
    auth = fields.String(required=True, validate=validate.Length(min=8, max=256))


class PushSubscriptionSchema(Schema):
    endpoint = fields.Url(required=True, validate=validate.Length(max=4096))
    expirationTime = fields.Float(load_default=None, allow_none=True)
    keys = fields.Nested(PushKeysSchema, required=True)


class NotificationFeedbackSchema(Schema):
    eventId = fields.String(required=True, validate=validate.Length(min=8, max=64))
    notificationId = fields.String(required=True, validate=validate.Length(min=1, max=180))
    recommendationId = fields.String(required=True, validate=validate.Length(min=1, max=120))
    eventType = fields.String(
        required=True,
        validate=validate.OneOf(
            ["shown", "opened", "dismissed", "useful", "not_useful"]
        ),
    )
    mode = fields.String(required=True, validate=validate.OneOf(["demo", "live"]))
    language = fields.String(required=True, validate=validate.OneOf(["en", "zh", "ms", "ta"]))
    occurredAt = fields.DateTime(required=True, format="iso")

