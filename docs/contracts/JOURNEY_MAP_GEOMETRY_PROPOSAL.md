# Proposal: route geometry in the shared journey snapshot

**From:** Member 3 (Journey Map) · **To:** integration owner, Member 2 (routing), Member 1 (data), Member 4 (Rachel UX)
**Status:** proposed, awaiting integration-owner approval · **Contract:** `schemaVersion: 1`, additive only

## Why

The mandatory visualisation needs the route on an OSM map, with the affected
portion distinguished and the alternative shown against the original. The
current snapshot (`frontend/src/features/rachel/contract.ts`, mirrored in
`backend/app/schemas/journey_explanation_schema.py`) describes each step only
as `{ mode, instruction }`, and Rachel's origin/destination coordinates are
`null`. The map cannot draw door-to-door legs or locate a disruption from
that, and it must not guess.

Both schemas reject unknown keys (`.strict()` in zod, marshmallow's default
`unknown=RAISE`). Member 2 therefore cannot start sending geometry until both
schemas change together.

## Proposed fields (all optional)

Every field is optional, so today's fixtures stay valid and nothing else has
to change on the same day. The map treats missing geometry as "cannot draw"
and says so. It never invents geometry.

### 1. Candidate steps

| Field | Type | Applies to | Meaning |
|---|---|---|---|
| `minutes` | number ≥ 0 | all | Planned leg duration, used for the map's leg labels |
| `lineCode` | `NS\|EW\|NE\|CC\|DT\|TE\|CG` | rail | Line ridden. Uses Member 1's normalised `lineCode`. |
| `stationIds` | string[2..60] | rail | Canonical `stations.json` IDs in travel order, boarding and alighting included. Endpoints only is accepted; the map expands along the line. |
| `path` | `[lon, lat][]` (2..500) | walk, bus | Routed path, **longitude first** (GeoJSON order) |
| `pathSource` | `osm-routed\|onemap-routed\|straight-line` | walk, bus | Required with `path`. Anything other than routed is labelled approximate. |
| `affectedEventIds` | string[≤20] | all | IDs from `conditions.events` that impact this leg |

### 2. `conditions.events[]`

| Field | Type | Meaning |
|---|---|---|
| `affectedSegment` | `{ lineCode, fromStationId, toStationId }` | Disrupted stretch, inclusive, along one branch of the line |
| `delayMinutes` | number ≥ 0 | Expected extra minutes through that stretch |

### 3. `conditions.crowd[]` (new, optional)

```json
{ "stationId": "tampines", "level": "low|moderate|high",
  "signal": "platform-realtime|platform-forecast",
  "sourceId": "…", "observedAt": "ISO-8601 with offset" }
```

Real-time and forecast platform crowding stay separate signals, as the spec
requires. Bus load is left out until bus legs exist (P1).

### 4. `journey.origin/destination.coordinates`

These fields already exist. The proposal is to fill them (see "Rachel's endpoints" below).

## Semantics the map relies on

- **Affected vs unaffected rail:** a segment (station pair) is affected when it
  lies inside an event's `affectedSegment` on the same line. If a step lists an
  event whose stretch cannot be located, the whole leg is marked affected.
- **Walk legs without `path`:** drawn as a straight line between the neighbouring
  leg ends (or origin/destination) and labelled approximate. Bus legs are never
  invented.
- **Invalid geometry** (for example swapped axes or an unknown station) is ignored,
  with a warning. The rest of the snapshot still renders.

## Additional cross-field checks (for the `superRefine` / `validates_schema`)

1. Each `affectedEventIds` entry references an existing `conditions.events[].id`.
2. Each `crowd[].sourceId` references an existing `sources[].id`.
3. `lineCode`/`stationIds` only on `rail`, and `path`/`pathSource` only on `walk`/`bus`.
4. `path` and `pathSource` appear together.
5. Recommended but not blocking: the sum of walk-leg `minutes` equals the candidate's `walkingMinutes`.

## Exact changes

### `frontend/src/features/rachel/contract.ts`

```ts
const lineCode = z.enum(["NS", "EW", "NE", "CC", "DT", "TE", "CG"]);
const lonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

// candidateSchema.steps item
z.object({
  mode: z.enum(["walk", "rail", "bus"]),
  instruction: text.max(240),
  minutes: z.number().nonnegative().optional(),
  lineCode: lineCode.optional(),
  stationIds: z.array(id).min(2).max(60).optional(),
  path: z.array(lonLat).min(2).max(500).optional(),
  pathSource: z.enum(["osm-routed", "onemap-routed", "straight-line"]).optional(),
  affectedEventIds: z.array(id).max(20).optional(),
}).strict()

// conditions.events item: add
  affectedSegment: z.object({ lineCode, fromStationId: id, toStationId: id }).strict().optional(),
  delayMinutes: z.number().nonnegative().optional(),

// conditions: add
  crowd: z.array(z.object({
    stationId: id, level: z.enum(["low", "moderate", "high"]),
    signal: z.enum(["platform-realtime", "platform-forecast"]),
    sourceId: id, observedAt: timestamp,
  }).strict()).max(60).optional(),
```

The reference implementation of these shapes, with tests, is in
`frontend/src/features/journey-map/geometryContract.ts`.

### `backend/app/schemas/journey_explanation_schema.py`

```python
LINE_CODES = ["NS", "EW", "NE", "CC", "DT", "TE", "CG"]
LonLat = lambda: fields.Tuple((fields.Float(validate=validate.Range(min=-180, max=180)),
                               fields.Float(validate=validate.Range(min=-90, max=90))))

class StepSchema(Schema):
    mode = fields.String(required=True, validate=validate.OneOf(["walk", "rail", "bus"]))
    instruction = text()
    minutes = fields.Float(validate=validate.Range(min=0))
    lineCode = fields.String(validate=validate.OneOf(LINE_CODES))
    stationIds = fields.List(text(120), validate=validate.Length(min=2, max=60))
    path = fields.List(LonLat(), validate=validate.Length(min=2, max=500))
    pathSource = fields.String(validate=validate.OneOf(["osm-routed", "onemap-routed", "straight-line"]))
    affectedEventIds = fields.List(text(120), validate=validate.Length(max=20))

    @validates_schema
    def check_geometry(self, data, **kwargs):
        if ("path" in data) != ("pathSource" in data):
            raise ValidationError("path and pathSource must be supplied together.")
        if data["mode"] == "rail" and "path" in data:
            raise ValidationError("Rail legs use stationIds, not path.")
        if data["mode"] != "rail" and ("lineCode" in data or "stationIds" in data):
            raise ValidationError("lineCode/stationIds apply to rail legs only.")

class AffectedSegmentSchema(Schema):
    lineCode = fields.String(required=True, validate=validate.OneOf(LINE_CODES))
    fromStationId = text(120)
    toStationId = text(120)

class EventSchema(Schema):
    # existing id, kind, title, sourceId …
    affectedSegment = fields.Nested(AffectedSegmentSchema)
    delayMinutes = fields.Float(validate=validate.Range(min=0))

class CrowdReadingSchema(Schema):
    stationId = text(120)
    level = fields.String(required=True, validate=validate.OneOf(["low", "moderate", "high"]))
    signal = fields.String(required=True, validate=validate.OneOf(["platform-realtime", "platform-forecast"]))
    sourceId = text(120)
    observedAt = instant()

class ConditionsSchema(Schema):
    # existing observedAt, events …
    crowd = fields.List(fields.Nested(CrowdReadingSchema), validate=validate.Length(max=60))
```

In `SnapshotSchema.check_references`, also check `affectedEventIds` against
event IDs, and add `crowd[].sourceId` to `references`.

## Team decisions needed

### Rachel's door-to-door endpoints (proposed)

Public landmarks, not a real person's home, both verified against OSM (Nominatim):

| | Label | `[lon, lat]` | OSM feature | Nearest station |
|---|---|---|---|---|
| Origin | Demo origin near Our Tampines Hub | `[103.9406, 1.353059]` | way 231670457 | Tampines (EW2/DT32), ~0.55 km |
| Destination | Demo workplace, One Raffles Place | `[103.851062, 1.284298]` | way 171999293 | Raffles Place (EW14/NS26), ~0.15 km. Downtown (DT17), ~0.55 km |

### Demo disruption stretch (proposed)

Member 1's current fixture lists `stationIds: ["tampines", "raffles-place"]`.
That reads as the whole journey, so the map would have no unaffected part to
contrast. Proposed instead: an **EWL signalling fault between Bedok and Paya
Lebar** (`affectedSegment: { lineCode: "EW", fromStationId: "bedok", toStationId: "paya-lebar" }`, `delayMinutes: 15`).

- Rachel's usual route shows Tampines → Bedok unaffected, Bedok → Paya Lebar affected, and Paya Lebar → Raffles Place unaffected.
- The DTL alternative avoids the fault entirely.

Please also confirm what Member 1's `stationIds` currently means: the affected stations, or the endpoints of the affected stretch.

## Worked example

`frontend/src/features/journey-map/fixtures/rachel-disrupted.geometry.json` is
Member 4's `disrupted.json` with the proposed fields added. Removing them gives
back a snapshot the current contract accepts. `fromJourneySnapshot.test.ts`
covers both versions.
