import { createContext, useContext, useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useJourneyMonitor } from "./useJourneyMonitor";
import { notificationKey, useRachelStore } from "./store";
import { recommendationCopy } from "./recommendationCopy";
import { recordNotificationEvent } from "./analytics";
import { showJourneySystemNotification } from "./webPush";

const MonitorContext = createContext({ online: true, loading: false, error: null as string | null });
export const useRachelStatus = () => useContext(MonitorContext);

export function RachelShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const status = useJourneyMonitor();
  const { pathname } = useLocation();
  const { snapshot, inbox, saved, dismiss } = useRachelStore();
  const key = snapshot ? notificationKey(snapshot) : "";
  const pending = inbox.find((n) => n.key === key && !n.read && !n.dismissed);
  const action = snapshot ? recommendationCopy(snapshot, t).action : "";
  useEffect(() => {
    if (!snapshot || !pending) return;
    const seenKey = `sgrail-analytics-shown:${pending.key}`;
    if (sessionStorage.getItem(seenKey)) return;
    sessionStorage.setItem(seenKey, "true");
    void recordNotificationEvent(snapshot, "shown");
    void showJourneySystemNotification(t("rachel.systemNotificationTitle"), action, pending.key);
  }, [snapshot, pending, action, t]);
  return (
    <MonitorContext.Provider value={status}>
      <div className="flex h-full min-h-0 flex-col">
        {!pathname.startsWith("/journey") && saved && snapshot?.recommendation.shouldNotify && pending && (
          <aside aria-label="Morning journey notification" role="status" className="flex items-center gap-3 border-b border-orange-300 bg-orange-50 p-3 text-slate-900">
            <Link to="/journey" onClick={() => void recordNotificationEvent(pending, "opened")} className="min-h-11 flex-1 font-semibold underline underline-offset-4">
              {snapshot.mode === "demo" ? `${t("rachel.demoReplay")}: ` : `${t("rachel.journeyUpdate")}: `}{action}
            </Link>
            <button onClick={() => { dismiss(key); void recordNotificationEvent(pending, "dismissed"); }} className="min-h-11 px-3 font-medium" aria-label={t("rachel.inbox.dismiss")}>{t("rachel.inbox.dismiss")}</button>
          </aside>
        )}
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </MonitorContext.Provider>
  );
}
