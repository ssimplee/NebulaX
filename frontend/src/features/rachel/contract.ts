import { z } from "zod";

// Proposed Member 4 integration contract. See MEMBER4_PROGRESS.md.
// All boundary data is validated at runtime; TS types alone do not validate JSON.
const id = z.string().min(1).max(120);
const timestamp = z.string().datetime({ offset: true });
const text = z.string().trim().min(1);
const point = z.object({
  label: text.max(160),
  coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]).nullable(),
}).strict();

export const routineSchema = z.object({
  id: z.literal("rachel-morning"),
  origin: point,
  destination: point,
  departTime: z.literal("07:40"),
  arriveByTime: z.literal("08:45"),
  timeZone: z.literal("Asia/Singapore"),
}).strict();
export type SavedRoutine = z.infer<typeof routineSchema>;

export const sourceSchema = z.object({
  id,
  label: text.max(160),
  type: z.enum(["simulated", "official", "forecast", "historical", "community", "estimated"]),
  observedAt: timestamp,
  staleAfterSeconds: z.number().int().positive(),
}).strict();

const candidateSchema = z.object({
  id,
  label: text.max(160),
  arrivalAt: timestamp,
  arrivalRange: z.object({ earliest: timestamp, latest: timestamp }).strict(),
  walkingMinutes: z.number().nonnegative(),
  transfers: z.number().int().nonnegative(),
  crowdLevel: z.enum(["low", "moderate", "high", "unknown"]),
  steps: z.array(z.object({
    mode: z.enum(["walk", "rail", "bus"]),
    instruction: text.max(240),
  }).strict()).min(1).max(30),
  sourceIds: z.array(id).min(1),
}).strict();

export const recommendationSchema = z.object({
  id,
  version: z.number().int().positive(),
  shouldNotify: z.boolean(),
  action: text.max(240),
  reason: text.max(800),
  originalCandidateId: id,
  recommendedCandidateId: id,
  originalArrival: timestamp,
  recommendedArrival: timestamp,
  delayMinutesAvoided: z.number().nonnegative(),
  confidence: z.number().min(0).max(1).nullable(),
  confidenceDescription: text.max(240),
  sourceIds: z.array(id).min(1),
  warnings: z.array(text.max(300)).max(12),
}).strict();

const baseSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  snapshotId: id,
  revision: z.number().int().nonnegative(),
  mode: z.enum(["demo", "live"]),
  evaluatedAt: timestamp,
  state: z.enum(["normal", "minor", "disrupted", "planned"]),
  persona: z.object({ id: z.literal("rachel"), priorities: z.array(text.max(100)).min(1).max(10) }).strict(),
  journey: z.object({
    routineId: z.literal("rachel-morning"),
    origin: point, destination: point,
    departAt: timestamp, arriveBy: timestamp,
    timeZone: z.literal("Asia/Singapore"),
  }).strict(),
  conditions: z.object({
    observedAt: timestamp,
    events: z.array(z.object({
      id, kind: z.enum(["planned", "unplanned"]),
      title: text.max(200), sourceId: id,
    }).strict()).max(20),
  }).strict(),
  candidates: z.array(candidateSchema).min(1).max(10),
  sources: z.array(sourceSchema).min(1).max(30),
  recommendation: recommendationSchema,
}).strict();

export const snapshotSchema = baseSnapshotSchema.superRefine((value, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const sources = new Set(value.sources.map((s) => s.id));
  const candidates = new Map(value.candidates.map((c) => [c.id, c]));
  if (sources.size !== value.sources.length || candidates.size !== value.candidates.length) fail("IDs must be unique");
  const rec = value.recommendation;
  if (candidates.get(rec.originalCandidateId)?.arrivalAt !== rec.originalArrival ||
      candidates.get(rec.recommendedCandidateId)?.arrivalAt !== rec.recommendedArrival) fail("Recommendation must reference matching candidate arrivals");
  const references = [...rec.sourceIds, ...value.candidates.flatMap((c) => c.sourceIds), ...value.conditions.events.map((e) => e.sourceId)];
  if (references.some((reference) => !sources.has(reference))) fail("Unknown data source");
  const difference = (Date.parse(rec.originalArrival) - Date.parse(rec.recommendedArrival)) / 60_000;
  if (Math.abs(difference - rec.delayMinutesAvoided) > 0.01) fail("Delay avoided does not match candidate arrivals");
  for (const candidate of value.candidates) {
    if (Date.parse(candidate.arrivalRange.earliest) > Date.parse(candidate.arrivalAt) ||
        Date.parse(candidate.arrivalRange.latest) < Date.parse(candidate.arrivalAt)) fail("Arrival estimate must lie within its range");
  }
  if (value.mode === "demo" && value.sources.some((s) => s.type !== "simulated")) fail("Demo fixtures must label every source simulated");
});

export type JourneySnapshot = z.infer<typeof snapshotSchema>;
export type RouteCandidate = JourneySnapshot["candidates"][number];
export type Recommendation = z.infer<typeof recommendationSchema>;
export type ScenarioId = "normal" | "minor" | "disrupted" | "planned";

export const explanationSchema = recommendationSchema.extend({ snapshotId: id }).strict();
export type Explanation = z.infer<typeof explanationSchema>;

/** AI may reword the reason, but cannot change the action, decision or evidence. */
export function validateExplanation(raw: unknown, snapshot: JourneySnapshot): Explanation | null {
  const result = explanationSchema.safeParse(raw);
  if (!result.success || result.data.snapshotId !== snapshot.snapshotId) return null;
  const { snapshotId: _, reason: __, ...facts } = result.data;
  const { reason: ___, ...expected } = snapshot.recommendation;
  const factKeys = Object.keys(expected) as Array<keyof typeof expected>;
  if (factKeys.some((key) => JSON.stringify(facts[key]) !== JSON.stringify(expected[key]))) return null;
  // Numeric claims introduced in prose must already occur in approved context.
  const approved = new Set(JSON.stringify(snapshot).match(/\d+(?:\.\d+)?/g) ?? []);
  if ((result.data.reason.match(/\d+(?:\.\d+)?/g) ?? []).some((n) => !approved.has(n))) return null;
  return result.data;
}

/** A fresh, strict projection: no chat history, credentials or GPS history. */
export function frozenExplanationContext(snapshot: JourneySnapshot): JourneySnapshot {
  const copy = snapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)));
  const freeze = (value: unknown): void => {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
  };
  freeze(copy);
  return copy;
}
