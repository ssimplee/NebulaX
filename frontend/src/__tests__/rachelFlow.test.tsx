import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import normal from "@/features/rachel/fixtures/normal.json";
import { frozenExplanationContext, snapshotSchema, validateExplanation } from "@/features/rachel/contract";
import { replaySnapshot } from "@/features/rachel/fixtures";
import { notificationKey, useRachelStore } from "@/features/rachel/store";
import { RachelJourneyPage, sourceStatus } from "@/pages/RachelJourneyPage";
import i18n from "@/i18n";
import { recommendationCopy } from "@/features/rachel/recommendationCopy";
import { analyticsPayload } from "@/features/rachel/analytics";

beforeEach(() => {
  window.localStorage.clear();
  act(() => useRachelStore.getState().forgetRoutine());
});

describe("Rachel snapshot contract", () => {
  it("validates every labelled fixture", () => {
    for (const scenario of ["normal", "minor", "disrupted", "planned"] as const) {
      expect(snapshotSchema.safeParse(replaySnapshot(scenario)).success).toBe(true);
    }
  });

  it("rejects unknown sources and inconsistent delay arithmetic", () => {
    const unknownSource = structuredClone(normal);
    unknownSource.recommendation.sourceIds = ["missing"];
    expect(snapshotSchema.safeParse(unknownSource).success).toBe(false);
    const wrongMath = structuredClone(normal);
    wrongMath.recommendation.delayMinutesAvoided = 5;
    expect(snapshotSchema.safeParse(wrongMath).success).toBe(false);
  });

  it("accepts explanation wording only when all decision facts remain unchanged", () => {
    const snapshot = replaySnapshot("disrupted");
    const valid = { ...snapshot.recommendation, snapshotId: snapshot.snapshotId, reason: "The replayed EWL disruption affects your 08:45 arrival." };
    expect(validateExplanation(valid, snapshot)?.reason).toContain("08:45");
    expect(validateExplanation({ ...valid, shouldNotify: false }, snapshot)).toBeNull();
    expect(validateExplanation({ ...valid, reason: "Leave 99 minutes earlier." }, snapshot)).toBeNull();
    expect(Object.isFrozen(frozenExplanationContext(snapshot))).toBe(true);
  });

  it("classifies source freshness as simulated, live, or stale", () => {
    const observedAt = "2026-09-21T07:24:00+08:00";
    const freshTime = Date.parse("2026-09-21T07:25:00+08:00");
    const staleTime = Date.parse("2026-09-21T07:31:00+08:00");
    expect(sourceStatus("simulated", "demo", observedAt, 300, freshTime)).toBe("simulated");
    expect(sourceStatus("official", "live", observedAt, 300, freshTime)).toBe("live");
    expect(sourceStatus("official", "live", observedAt, 300, staleTime)).toBe("stale");
  });
});

describe("Rachel P1 privacy and language features", () => {
  it("renders concise recommendation templates in every supported language", () => {
    const snapshot = replaySnapshot("disrupted");
    const copies = (["en", "zh", "ms", "ta"] as const).map((language) =>
      recommendationCopy(snapshot, i18n.getFixedT(language)),
    );
    for (const copy of copies) {
      expect(copy.action).toContain("08:42");
      expect(copy.action).not.toContain("{{");
      expect(copy.reason).toBeTruthy();
    }
    expect(new Set(copies.map((copy) => copy.action)).size).toBe(4);
  });

  it("builds analytics without journey or location history", () => {
    const payload = analyticsPayload(replaySnapshot("disrupted"), "useful", "event-privacy-test");
    expect(Object.keys(payload).sort()).toEqual([
      "eventId", "eventType", "language", "mode", "notificationId",
      "occurredAt", "recommendationId",
    ]);
    expect(JSON.stringify(payload)).not.toMatch(/coordinate|latitude|longitude|origin|destination/i);
  });
});

describe("Rachel store and screen flow", () => {
  it("keeps normal and minor states quiet, deduplicates disruption, and resets", () => {
    const store = useRachelStore.getState();
    store.saveRoutine();
    store.replay("normal");
    store.replay("minor");
    expect(useRachelStore.getState().inbox).toHaveLength(0);
    store.replay("disrupted");
    store.replay("disrupted");
    expect(useRachelStore.getState().inbox).toHaveLength(1);
    expect(useRachelStore.getState().inbox[0].key).toBe(notificationKey(replaySnapshot("disrupted")));
    store.resetReplay();
    expect(useRachelStore.getState().snapshot?.state).toBe("normal");
    expect(useRachelStore.getState().inbox).toHaveLength(0);
  });

  it("renders an action-first disruption and marks its inbox item read", () => {
    act(() => {
      useRachelStore.getState().saveRoutine();
      useRachelStore.getState().replay("disrupted");
    });
    render(<MemoryRouter><RachelJourneyPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /Use the DTL alternative/ })).toBeVisible();
    expect(screen.getByText("High crowd").closest("p")?.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("Moderate crowd").closest("p")?.querySelector("svg")).not.toBeNull();
    expect(screen.getAllByText("Demo replay").length).toBeGreaterThan(0);
    expect(screen.getByText("1 unread")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "View recommended journey" }));
    expect(screen.getByText("0 unread")).toBeVisible();
    expect(screen.getByRole("button", { name: /Journey steps shown/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(screen.getByText("Thanks for your feedback.")).toBeVisible();
    expect(useRachelStore.getState().inbox[0].feedback).toBe("useful");
  });
});
