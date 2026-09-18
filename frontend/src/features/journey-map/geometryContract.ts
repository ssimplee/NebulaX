import { z } from "zod";

// Reference implementation of the Member 3 geometry proposal in
// docs/contracts/JOURNEY_MAP_GEOMETRY_PROPOSAL.md. Every field is optional and
// additive to the shared snapshot contract (schemaVersion 1). Until the
// integration owner adopts them, the adapter reads them leniently and ignores
// invalid values with a warning instead of rejecting the whole snapshot.

/** MRT lines the Journey Map can draw; codes follow Member 1's normalised `lineCode`. */
export const MAP_LINE_CODES = ["NS", "EW", "NE", "CC", "DT", "TE", "CG"] as const;
export type MapLineCode = (typeof MAP_LINE_CODES)[number];

const id = z.string().min(1).max(120);
const timestamp = z.string().datetime({ offset: true });
export const lonLatSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

/** Optional fields added to each candidate step. */
export const stepGeometrySchema = z.object({
  /** Planned duration of this leg, so the map can label it. */
  minutes: z.number().nonnegative().optional(),
  /** Rail legs: the line ridden. */
  lineCode: z.enum(MAP_LINE_CODES).optional(),
  /** Rail legs: canonical stations.json IDs in travel order, boarding and alighting included. */
  stationIds: z.array(id).min(2).max(60).optional(),
  /** Walk and bus legs: the routed path as [longitude, latitude] pairs. */
  path: z.array(lonLatSchema).min(2).max(500).optional(),
  /** Where `path` came from; required whenever `path` is present. */
  pathSource: z.enum(["osm-routed", "onemap-routed", "straight-line"]).optional(),
  /** Events from conditions.events that affect this leg (for example an exit closure on a walk). */
  affectedEventIds: z.array(id).max(20).optional(),
}).refine((step) => (step.path == null) === (step.pathSource == null), "path and pathSource must be supplied together");
export type StepGeometry = z.infer<typeof stepGeometrySchema>;

/** Optional fields added to each conditions.events item. */
export const eventGeometrySchema = z.object({
  /** The disrupted stretch of line, inclusive of both named stations. */
  affectedSegment: z.object({ lineCode: z.enum(MAP_LINE_CODES), fromStationId: id, toStationId: id }).strict().optional(),
  /** Expected extra minutes for a journey through the affected stretch. */
  delayMinutes: z.number().nonnegative().optional(),
});
export type EventGeometry = z.infer<typeof eventGeometrySchema>;

/**
 * Optional conditions.crowd array. Platform real-time and forecast crowding are
 * separate LTA signals and stay labelled as such; bus load is deliberately excluded.
 */
export const crowdReadingSchema = z.object({
  stationId: id,
  level: z.enum(["low", "moderate", "high"]),
  signal: z.enum(["platform-realtime", "platform-forecast"]),
  sourceId: id,
  observedAt: timestamp,
}).strict();
export type CrowdReading = z.infer<typeof crowdReadingSchema>;
