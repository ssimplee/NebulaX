import { useEffect, useRef, useState } from "react";
import { Bell, Check, Clock3, ArrowRight, RotateCcw, ShieldCheck, WifiOff, Info, ThumbsUp, ThumbsDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRachelStore, notificationKey } from "@/features/rachel/store";
import { useRachelStatus } from "@/features/rachel/RachelShell";
import { explainJourney } from "@/features/rachel/api";
import { JourneyComparison, clockLabel } from "@/features/rachel/JourneyComparison";
import type { ScenarioId } from "@/features/rachel/contract";
import { usePreferencesStore } from "@/store/preferencesStore";
import { recommendationCopy, inboxActionCopy } from "@/features/rachel/recommendationCopy";
import { recordNotificationEvent } from "@/features/rachel/analytics";
import { PushControls } from "@/features/rachel/PushControls";
import "@/features/rachel/rachel.css";

const scenarios: ScenarioId[] = ["normal", "minor", "disrupted", "planned"];

export function sourceStatus(type: string, mode: "demo" | "live", observedAt: string, staleAfterSeconds: number, referenceTime: number) {
  if (type === "simulated" || mode === "demo") return "simulated" as const;
  if (referenceTime - Date.parse(observedAt) > staleAfterSeconds * 1000) return "stale" as const;
  return "live" as const;
}

export function RachelJourneyPage() {
  const { t } = useTranslation();
  const { saved, routine, snapshot, inbox, scenario, mode, selectedCandidateId, saveRoutine, forgetRoutine, replay, resetReplay, markRead, dismiss, setFeedback, selectCandidate } = useRachelStore();
  const { online, loading, error } = useRachelStatus();
  const { textScale, highContrast, reducedMotion } = usePreferencesStore();
  const [now, setNow] = useState(Date.now());
  const [explanation, setExplanation] = useState<{ snapshotId: string; reason: string; enhanced: boolean } | null>(null);
  const [explaining, setExplaining] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const comparisonRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    requestRef.current?.abort();
    setExplanation(null); setExplaining(false);
    return () => requestRef.current?.abort();
  }, [snapshot?.snapshotId, snapshot?.revision]);

  const rec = snapshot?.recommendation;
  const referenceTime = snapshot?.mode === "demo" ? Date.parse(snapshot.evaluatedAt) : now;
  const stale = !!snapshot?.sources.some((s) => referenceTime - Date.parse(s.observedAt) > s.staleAfterSeconds * 1000);
  const visibleInbox = inbox.filter((n) => !n.dismissed);
  const unread = visibleInbox.filter((n) => !n.read).length;
  const showAdvice = !!rec?.shouldNotify;
  const currentNotice = snapshot ? inbox.find((n) => n.key === notificationKey(snapshot) && !n.dismissed) : null;
  const localized = snapshot ? recommendationCopy(snapshot, t) : null;

  const showRecommended = () => {
    if (!rec) return;
    selectCandidate(rec.recommendedCandidateId);
    if (currentNotice) {
      markRead(currentNotice.key);
      void recordNotificationEvent(currentNotice, "opened");
    }
    comparisonRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
  };
  const requestExplanation = async () => {
    if (!snapshot) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setExplaining(true);
    const result = await explainJourney(snapshot, controller.signal);
    const current = useRachelStore.getState().snapshot;
    if (!controller.signal.aborted && current?.snapshotId === snapshot.snapshotId && current.revision === snapshot.revision) {
      setExplanation({ ...result, reason: result.enhanced ? result.reason : localized?.reason ?? result.reason, snapshotId: snapshot.snapshotId });
      setExplaining(false);
    }
  };

  return (
    <div className={`rachel-page ${highContrast ? "rachel-high-contrast" : ""} ${reducedMotion ? "reduce-motion" : ""}`} style={{ fontSize: `${Math.max(1, textScale)}rem` }}>
      <div className="rachel-container">
        <header className="rachel-header">
          <div><p className="rachel-eyebrow">YOUR MORNING COMPANION</p><h1>Rachel’s journey</h1></div>
          <a href="#rachel-inbox" className="rachel-inbox-link" aria-label={`Journey inbox, ${unread} unread`}><Bell size={22} aria-hidden="true" /><span>Inbox{unread > 0 ? ` (${unread})` : ""}</span></a>
        </header>

        {mode === "demo" && <div className="rachel-demo-label"><Info size={19} aria-hidden="true" /><div><strong>Labelled demo replay</strong><p>21 September 2026 · 07:25 SGT. Places, routes and timings are illustrative; they are not live travel advice.</p></div></div>}
        {(!online || stale || error) && <div role="status" className="rachel-offline"><WifiOff size={20} aria-hidden="true" /><p>{!online ? "Offline — showing the last saved journey. Live conditions cannot be checked." : error || "Source information is stale. Treat this as last-known advice."}</p></div>}

        <section className="rachel-panel rachel-routine" aria-labelledby="routine-title">
          <div className="rachel-section-heading"><h2 id="routine-title">Your saved morning</h2><span className="rachel-tag">{saved ? "Saved on this device" : "Routine preview"}</span></div>
          <div className="rachel-destination"><span>Tampines</span><ArrowRight size={22} aria-hidden="true" /><span>Raffles Place</span></div>
          <div className="rachel-routine-times"><span><Clock3 size={17} aria-hidden="true" /> Leave <strong>{routine.departTime}</strong></span><span>At your desk by <strong>{routine.arriveByTime}</strong></span></div>
          <p className="rachel-muted">{routine.origin.label} → {routine.destination.label}</p>
          {!saved ? <><button className="rachel-button" onClick={saveRoutine}>Save morning routine</button><p className="rachel-small">Saves this routine, up to 20 inbox entries and the latest journey in this browser until you clear them. No GPS history is collected by this feature.</p></> : <details className="rachel-privacy"><summary>Storage and privacy</summary><p className="rachel-small">Stored only in this browser until you clear it. No GPS history is collected by this feature.</p><button className="rachel-button rachel-button-secondary" onClick={forgetRoutine}>Clear saved routine and inbox</button></details>}
        </section>

        {saved && <PushControls />}

        {!snapshot && <section className="rachel-panel" role="status"><h2>{loading ? "Checking your journey…" : "Your journey is not available yet"}</h2><p>{saved ? "We’ll show advice when the journey service returns a valid recommendation." : "Save your routine to start checking for relevant journey updates."}</p></section>}
        {snapshot && rec && <section className={`rachel-panel rachel-recommendation ${showAdvice ? "needs-action" : "on-track"}`} aria-labelledby="recommendation-title">
          <div className="rachel-state-label">{showAdvice ? <Bell size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}<span>{showAdvice ? (snapshot.state === "planned" ? "PLAN AHEAD" : "YOUR JOURNEY HAS CHANGED") : "NO ACTION NEEDED"}</span></div>
          <h2 id="recommendation-title">{localized?.action ?? rec.action}</h2>
          <p>{localized?.reason ?? rec.reason}</p>
          <dl className="rachel-metrics">
            <div><dt>Usual route now</dt><dd>{clockLabel(rec.originalArrival)}</dd></div>
            <div><dt>{showAdvice ? "Recommended arrival" : "Estimated arrival"}</dt><dd>{clockLabel(rec.recommendedArrival)}</dd></div>
            <div><dt>Delay avoided</dt><dd>{rec.delayMinutesAvoided}<span> min</span></dd></div>
          </dl>
          <p className="rachel-muted">Compared with keeping your usual route under the same conditions. Arrival estimates include the final walk.</p>
          <div className="rachel-confidence"><ShieldCheck size={20} aria-hidden="true" /><div><strong>{rec.confidence === null ? "Confidence not assessed" : `Confidence score ${Math.round(rec.confidence * 100)}/100`}</strong><p>{rec.confidenceDescription}</p></div></div>
          {rec.warnings.length > 0 && <ul className="rachel-warnings" aria-label="Journey warnings">{rec.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
          <button className="rachel-button" onClick={showRecommended}>{showAdvice ? "View recommended journey" : "View journey steps"}<ArrowRight size={18} aria-hidden="true" /></button>
          {saved && showAdvice && currentNotice && !currentNotice.read && <p role="status" className="rachel-small">A journey update has been added to your inbox.</p>}
          <details className="rachel-sources"><summary>Sources and freshness</summary><ul>{snapshot.sources.map((source) => { const status = sourceStatus(source.type, snapshot.mode, source.observedAt, source.staleAfterSeconds, referenceTime); return <li key={source.id}><strong>{source.label}</strong><span className={`rachel-tag rachel-source-${status}`}>{t(`rachel.sources.${status}`)}</span><p>Observed {clockLabel(source.observedAt)} SGT · {Math.max(0, Math.floor((referenceTime - Date.parse(source.observedAt)) / 60_000))} min old{snapshot.mode === "demo" ? " at replay time" : ""}</p></li>; })}</ul></details>
          <details className="rachel-explanation"><summary>Why this advice?</summary><p>{explanation?.snapshotId === snapshot.snapshotId ? explanation.reason : localized?.reason ?? rec.reason}</p><button className="rachel-button rachel-button-secondary" disabled={explaining || !online || stale || !!error} onClick={() => void requestExplanation()}>{explaining ? "Checking explanation…" : "Request an AI explanation"}</button>{explanation && <p role="status" className="rachel-small">{explanation.enhanced ? "AI-assisted wording. The route, decision and figures are unchanged." : "Using the deterministic explanation. AI is unavailable, disabled or returned an invalid response."}</p>}</details>
        </section>}

        <div ref={comparisonRef}>{snapshot && <JourneyComparison snapshot={snapshot} selectedCandidateId={selectedCandidateId} onSelectCandidate={selectCandidate} />}</div>

        <section className="rachel-panel" id="rachel-inbox" aria-labelledby="inbox-title">
          <div className="rachel-section-heading"><h2 id="inbox-title">Journey inbox</h2><span className="rachel-tag">{unread} unread</span></div>
          {visibleInbox.length === 0 ? <p className="rachel-muted">{t("rachel.inbox.empty")}</p> : <ul className="rachel-inbox-list">{visibleInbox.map((notice) => <li key={notice.key}><div className="rachel-inbox-meta"><span className="rachel-tag">{notice.mode === "demo" ? t("rachel.demoReplay") : t("rachel.journeyUpdate")}</span><span>{notice.read ? t("rachel.inbox.read") : t("rachel.inbox.unread")} · {clockLabel(notice.receivedAt)}</span></div><p>{inboxActionCopy(notice, t)}</p><div className="rachel-inbox-actions">{!notice.read && <button className="rachel-button rachel-button-secondary" onClick={() => { markRead(notice.key); void recordNotificationEvent(notice, "opened"); }}>{t("rachel.inbox.markRead")}</button>}<button className="rachel-button rachel-button-secondary" onClick={() => { dismiss(notice.key); void recordNotificationEvent(notice, "dismissed"); }}>{t("rachel.inbox.dismiss")}</button></div><div className="rachel-feedback" aria-label={t("rachel.feedback.question")}><span>{t("rachel.feedback.question")}</span><button aria-pressed={notice.feedback === "useful"} disabled={notice.feedback !== null} onClick={() => { setFeedback(notice.key, "useful"); void recordNotificationEvent(notice, "useful"); }}><ThumbsUp size={18} aria-hidden="true" />{t("rachel.feedback.yes")}</button><button aria-pressed={notice.feedback === "not_useful"} disabled={notice.feedback !== null} onClick={() => { setFeedback(notice.key, "not_useful"); void recordNotificationEvent(notice, "not_useful"); }}><ThumbsDown size={18} aria-hidden="true" />{t("rachel.feedback.no")}</button>{notice.feedback && <strong role="status">{t("rachel.feedback.thanks")}</strong>}</div></li>)}</ul>}
        </section>

        {mode === "demo" && <section className="rachel-panel rachel-replay" aria-labelledby="replay-title">
          <div className="rachel-section-heading"><h2 id="replay-title">Try the judging scenarios</h2><span className="rachel-tag">Demo controls</span></div>
          <p className="rachel-muted">Replay the same morning with different supplied conditions. Save the routine to test the inbox.</p>
          <div className="rachel-scenarios">{scenarios.map((id) => <button key={id} className="rachel-scenario" aria-pressed={scenario === id} onClick={() => replay(id)}><strong>{t(`rachel.scenarios.${id}.label`)}</strong><span>{t(`rachel.scenarios.${id}.description`)}</span></button>)}</div>
          <button className="rachel-button rachel-button-secondary" onClick={resetReplay}><RotateCcw size={17} aria-hidden="true" />Reset replay and inbox</button>
        </section>}
      </div>
    </div>
  );
}
