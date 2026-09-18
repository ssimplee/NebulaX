import { create } from "zustand";
import { persist } from "zustand/middleware";
import { z } from "zod";
import { snapshotSchema, routineSchema, type JourneySnapshot, type SavedRoutine, type ScenarioId } from "./contract";
import { DEFAULT_ROUTINE, replaySnapshot } from "./fixtures";
import { impactEndpoint } from "./api";

const inboxItemSchema = z.object({
  key: z.string(), snapshotId: z.string(), action: z.string(),
  receivedAt: z.string(), read: z.boolean(), dismissed: z.boolean(),
  mode: z.enum(["demo", "live"]),
  state: z.enum(["normal", "minor", "disrupted", "planned"]),
  recommendationId: z.string(), recommendedArrival: z.string(),
  delayMinutesAvoided: z.number(), arriveBy: z.string(),
  feedback: z.enum(["useful", "not_useful"]).nullable(),
});
export type InboxItem = z.infer<typeof inboxItemSchema>;
interface RachelState {
  saved: boolean;
  routine: SavedRoutine;
  scenario: ScenarioId;
  snapshot: JourneySnapshot | null;
  inbox: InboxItem[];
  selectedCandidateId: string | null;
  mode: "demo" | "live";
  saveRoutine: () => void;
  forgetRoutine: () => void;
  applySnapshot: (snapshot: JourneySnapshot) => void;
  replay: (scenario: ScenarioId) => void;
  resetReplay: () => void;
  markRead: (key: string) => void;
  dismiss: (key: string) => void;
  setFeedback: (key: string, feedback: "useful" | "not_useful") => void;
  selectCandidate: (id: string) => void;
}

export const notificationKey = (snapshot: JourneySnapshot) =>
  `${snapshot.mode}:${snapshot.recommendation.id}:${snapshot.recommendation.version}`;

function initialData() {
  const mode = impactEndpoint ? "live" : "demo";
  return {
    saved: false, routine: DEFAULT_ROUTINE, scenario: "normal" as ScenarioId,
    snapshot: mode === "demo" ? replaySnapshot("normal") : null,
    inbox: [] as InboxItem[], selectedCandidateId: null, mode: mode as "demo" | "live",
  };
}

export const useRachelStore = create<RachelState>()(persist((set, get) => ({
  ...initialData(),
  saveRoutine: () => set({ saved: true }),
  forgetRoutine: () => {
    set(initialData());
    useRachelStore.persist.clearStorage();
  },
  applySnapshot: (input) => {
    const snapshot = snapshotSchema.parse(input);
    set((state) => {
      if (snapshot.mode !== state.mode) throw new Error("Journey source mode does not match the selected mode");
      if (snapshot.mode === "live" && state.snapshot &&
          Date.parse(snapshot.evaluatedAt) < Date.parse(state.snapshot.evaluatedAt)) return state;
      const key = notificationKey(snapshot);
      const item: InboxItem = {
        key, snapshotId: snapshot.snapshotId, action: snapshot.recommendation.action,
        receivedAt: snapshot.evaluatedAt, read: false, dismissed: false, mode: snapshot.mode,
        state: snapshot.state, recommendationId: snapshot.recommendation.id,
        recommendedArrival: snapshot.recommendation.recommendedArrival,
        delayMinutesAvoided: snapshot.recommendation.delayMinutesAvoided,
        arriveBy: snapshot.journey.arriveBy, feedback: null,
      };
      const inbox = state.saved && snapshot.recommendation.shouldNotify && !state.inbox.some((n) => n.key === key)
        ? [item, ...state.inbox].slice(0, 20) : state.inbox;
      return { snapshot, inbox, selectedCandidateId: null };
    });
  },
  replay: (scenario) => {
    if (get().mode !== "demo") return;
    set({ scenario });
    get().applySnapshot(replaySnapshot(scenario));
  },
  resetReplay: () => {
    if (get().mode !== "demo") return;
    set({ scenario: "normal", snapshot: replaySnapshot("normal"), inbox: [], selectedCandidateId: null });
  },
  markRead: (key) => set((s) => ({ inbox: s.inbox.map((n) => n.key === key ? { ...n, read: true } : n) })),
  dismiss: (key) => set((s) => ({ inbox: s.inbox.map((n) => n.key === key ? { ...n, read: true, dismissed: true } : n) })),
  setFeedback: (key, feedback) => set((s) => ({ inbox: s.inbox.map((n) => n.key === key ? { ...n, feedback } : n) })),
  selectCandidate: (id) => {
    if (get().snapshot?.candidates.some((c) => c.id === id)) set({ selectedCandidateId: id });
  },
}), {
  name: "sgrail-rachel-v1",
  version: 2,
  partialize: (s) => s.saved ? {
    saved: s.saved, routine: s.routine, snapshot: s.snapshot, inbox: s.inbox, mode: s.mode, scenario: s.scenario,
  } : { saved: false },
  merge: (persisted, current) => {
    const parsed = z.object({
      saved: z.literal(true), routine: routineSchema,
      snapshot: snapshotSchema.nullable(), inbox: z.array(inboxItemSchema).max(20),
      mode: z.enum(["demo", "live"]), scenario: z.enum(["normal", "minor", "disrupted", "planned"]),
    }).safeParse(persisted);
    if (!parsed.success || parsed.data.mode !== current.mode) return current;
    return { ...current, ...parsed.data };
  },
}));
