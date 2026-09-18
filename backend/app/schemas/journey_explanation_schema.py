"""Proposed Member 4 snapshot contract; keep aligned with frontend contract.ts.

This validates an explanation input, not the truth of a route. Member 2 remains
the authority for routing and impact. Unknown fields are rejected at every level.
"""
from datetime import datetime
from marshmallow import Schema, fields, validate, validates_schema, ValidationError


def timestamp(value):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError()
    except (ValueError, TypeError):
        raise ValidationError("An ISO timestamp with a time zone is required.")


def text(maximum=240):
    return fields.String(required=True, validate=validate.Length(min=1, max=maximum))


def instant():
    return fields.String(required=True, validate=timestamp)


class PointSchema(Schema):
    label = text(160)
    coordinates = fields.Tuple((fields.Float(validate=validate.Range(min=-180, max=180)), fields.Float(validate=validate.Range(min=-90, max=90))), required=True, allow_none=True)


class PersonaSchema(Schema):
    id = fields.String(required=True, validate=validate.Equal("rachel"))
    priorities = fields.List(text(100), required=True, validate=validate.Length(min=1, max=10))


class JourneySchema(Schema):
    routineId = fields.String(required=True, validate=validate.Equal("rachel-morning"))
    origin = fields.Nested(PointSchema, required=True)
    destination = fields.Nested(PointSchema, required=True)
    departAt = instant()
    arriveBy = instant()
    timeZone = fields.String(required=True, validate=validate.Equal("Asia/Singapore"))


class EventSchema(Schema):
    id = text(120)
    kind = fields.String(required=True, validate=validate.OneOf(["planned", "unplanned"]))
    title = text(200)
    sourceId = text(120)


class ConditionsSchema(Schema):
    observedAt = instant()
    events = fields.List(fields.Nested(EventSchema), required=True, validate=validate.Length(max=20))


class SourceSchema(Schema):
    id = text(120)
    label = text(160)
    type = fields.String(required=True, validate=validate.OneOf(["simulated", "official", "forecast", "historical", "community", "estimated"]))
    observedAt = instant()
    staleAfterSeconds = fields.Integer(required=True, strict=True, validate=validate.Range(min=1))


class RangeSchema(Schema):
    earliest = instant()
    latest = instant()


class StepSchema(Schema):
    mode = fields.String(required=True, validate=validate.OneOf(["walk", "rail", "bus"]))
    instruction = text()


class CandidateSchema(Schema):
    id = text(120)
    label = text(160)
    arrivalAt = instant()
    arrivalRange = fields.Nested(RangeSchema, required=True)
    walkingMinutes = fields.Float(required=True, validate=validate.Range(min=0))
    transfers = fields.Integer(required=True, strict=True, validate=validate.Range(min=0))
    steps = fields.List(fields.Nested(StepSchema), required=True, validate=validate.Length(min=1, max=30))
    sourceIds = fields.List(text(120), required=True, validate=validate.Length(min=1, max=30))


class RecommendationSchema(Schema):
    id = text(120)
    version = fields.Integer(required=True, strict=True, validate=validate.Range(min=1))
    shouldNotify = fields.Boolean(required=True, truthy={True}, falsy={False})
    action = text()
    reason = text(800)
    originalCandidateId = text(120)
    recommendedCandidateId = text(120)
    originalArrival = instant()
    recommendedArrival = instant()
    delayMinutesAvoided = fields.Float(required=True, validate=validate.Range(min=0))
    confidence = fields.Float(required=True, allow_none=True, validate=validate.Range(min=0, max=1))
    confidenceDescription = text()
    sourceIds = fields.List(text(120), required=True, validate=validate.Length(min=1, max=30))
    warnings = fields.List(text(300), required=True, validate=validate.Length(max=12))


class ExplanationSchema(RecommendationSchema):
    snapshotId = text(120)


class SnapshotSchema(Schema):
    schemaVersion = fields.Integer(required=True, strict=True, validate=validate.Equal(1))
    snapshotId = text(120)
    revision = fields.Integer(required=True, strict=True, validate=validate.Range(min=0))
    mode = fields.String(required=True, validate=validate.OneOf(["demo", "live"]))
    evaluatedAt = instant()
    state = fields.String(required=True, validate=validate.OneOf(["normal", "minor", "disrupted", "planned"]))
    persona = fields.Nested(PersonaSchema, required=True)
    journey = fields.Nested(JourneySchema, required=True)
    conditions = fields.Nested(ConditionsSchema, required=True)
    candidates = fields.List(fields.Nested(CandidateSchema), required=True, validate=validate.Length(min=1, max=10))
    sources = fields.List(fields.Nested(SourceSchema), required=True, validate=validate.Length(min=1, max=30))
    recommendation = fields.Nested(RecommendationSchema, required=True)

    @validates_schema
    def check_references(self, data, **kwargs):
        sources = {s["id"] for s in data["sources"]}
        candidates = {c["id"]: c for c in data["candidates"]}
        rec = data["recommendation"]
        if len(sources) != len(data["sources"]) or len(candidates) != len(data["candidates"]):
            raise ValidationError("IDs must be unique.")
        for field, arrival in (("originalCandidateId", "originalArrival"), ("recommendedCandidateId", "recommendedArrival")):
            if candidates.get(rec[field], {}).get("arrivalAt") != rec[arrival]:
                raise ValidationError("Candidate arrivals do not match the recommendation.")
        references = rec["sourceIds"] + [s for c in data["candidates"] for s in c["sourceIds"]] + [e["sourceId"] for e in data["conditions"]["events"]]
        if any(s not in sources for s in references):
            raise ValidationError("Unknown source reference.")
        def dt(value):
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        avoided = (dt(rec["originalArrival"]) - dt(rec["recommendedArrival"])).total_seconds() / 60
        if abs(avoided - rec["delayMinutesAvoided"]) > 0.01:
            raise ValidationError("Delay avoided does not match arrivals.")
        for c in data["candidates"]:
            if not dt(c["arrivalRange"]["earliest"]) <= dt(c["arrivalAt"]) <= dt(c["arrivalRange"]["latest"]):
                raise ValidationError("Invalid arrival range.")
        if data["mode"] == "demo" and any(s["type"] != "simulated" for s in data["sources"]):
            raise ValidationError("Demo sources must be labelled simulated.")


class ExplanationRequestSchema(Schema):
    context = fields.Nested(SnapshotSchema, required=True)
